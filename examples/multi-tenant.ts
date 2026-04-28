/**
 * Multi-tenant SaaS evaluation pattern.
 *
 * Demonstrates tagging samples with `tenantId` and `metadata`, then grouping
 * results by tenant to compute per-tenant aggregate scores. Useful for:
 * - SaaS dashboards showing RAG quality per customer
 * - Per-tenant alerting when faithfulness drops below threshold
 * - Audit trails carrying trace IDs / pipeline versions per sample
 *
 * Run with:
 *   pnpm tsx examples/multi-tenant.ts
 *
 * Requires ANTHROPIC_API_KEY set in .env.local.
 */
import Anthropic from '@anthropic-ai/sdk'

import { answerRelevance, evaluate, faithfulness, type SampleResult } from '../src/index.js'

const client = new Anthropic()

const dataset = [
  // ── Tenant: acme-corp ──────────────────────────────────────────────
  {
    id: 'acme-q1',
    question: 'How do I reset my password?',
    answer: 'Visit Settings → Security → Reset Password.',
    contexts: ['Acme account holders can reset their password from Settings → Security.'],
    tenantId: 'acme-corp',
    metadata: { traceId: 'trace-001', pipelineVersion: '2.1.0', region: 'us-east-1' },
  },
  {
    id: 'acme-q2',
    question: 'Where do I find my invoices?',
    answer: 'Invoices are under Billing → History.',
    contexts: ['All Acme customers access historical invoices from Billing → History.'],
    tenantId: 'acme-corp',
    metadata: { traceId: 'trace-002', pipelineVersion: '2.1.0', region: 'us-east-1' },
  },
  // ── Tenant: globex-inc ─────────────────────────────────────────────
  {
    id: 'globex-q1',
    question: 'How do I add a team member?',
    answer: 'Use Admin → Team → Invite User.',
    contexts: ['Globex admins invite team members from Admin → Team → Invite User.'],
    tenantId: 'globex-inc',
    metadata: { traceId: 'trace-101', pipelineVersion: '2.0.5', region: 'eu-west-1' },
  },
]

const results = await evaluate({
  provider: { type: 'anthropic', client, model: 'claude-haiku-4-5-20251001', temperature: 0 },
  dataset,
  metrics: [faithfulness, answerRelevance],
})

// ── Group results by tenant ──────────────────────────────────────────
const byTenant = new Map<string, SampleResult[]>()
for (const sample of results.samples) {
  if (sample.tenantId === undefined) continue
  const arr = byTenant.get(sample.tenantId) ?? []
  arr.push(sample)
  byTenant.set(sample.tenantId, arr)
}

console.log('\n=== Per-Tenant RAG Quality ===\n')
for (const [tenant, samples] of byTenant) {
  const faithScores = samples
    .map((s) => s.scores.faithfulness)
    .filter((s): s is number => typeof s === 'number')
  const relScores = samples
    .map((s) => s.scores.answerRelevance)
    .filter((s): s is number => typeof s === 'number')

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  console.log(`Tenant: ${tenant} (${samples.length} samples)`)
  console.log(`  Faithfulness:    ${mean(faithScores).toFixed(3)}`)
  console.log(`  Answer Relevance: ${mean(relScores).toFixed(3)}`)
  const traceIds = samples
    .map((s) => (typeof s.metadata?.traceId === 'string' ? s.metadata.traceId : 'none'))
    .join(', ')
  console.log(`  Trace IDs: ${traceIds}`)
  console.log()
}
