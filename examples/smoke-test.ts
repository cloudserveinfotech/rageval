/**
 * Smoke Test — rageval
 *
 * Runs a real end-to-end evaluation against the sample dataset using your
 * Anthropic or OpenAI API key from .env.local
 *
 * Setup:
 *   1. Create .env.local in the repo root (it is gitignored):
 *        ANTHROPIC_API_KEY=sk-ant-api03-...
 *        # or
 *        OPENAI_API_KEY=sk-...
 *
 *   2. Install deps:
 *        pnpm install
 *
 *   3. Run:
 *        npx tsx --env-file=../.env.local examples/smoke-test.ts
 *
 *   For OpenAI instead:
 *        npx tsx --env-file=../.env.local examples/smoke-test.ts --provider openai
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  evaluate,
  faithfulness,
  contextRelevance,
  answerRelevance,
  contextRecall,
  contextPrecision,
  toJson,
  toCsv,
} from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Pick provider from CLI arg or env ────────────────────────────────────────
const args = process.argv.slice(2)
function readProviderArg(): string | null {
  const eq = args.find((a) => a.startsWith('--provider='))
  if (eq) {
    const parts = eq.split('=')
    if (parts.length === 2 && parts[1]) return parts[1]
  }
  const idx = args.indexOf('--provider')
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1]
  return null
}
const providerArg = readProviderArg()
const useOpenAI = providerArg === 'openai'

const anthropicKey = process.env.ANTHROPIC_API_KEY
const openaiKey = process.env.OPENAI_API_KEY

if (useOpenAI && !openaiKey) {
  console.error('❌  OPENAI_API_KEY is not set in .env.local')
  process.exit(1)
}
if (!useOpenAI && !anthropicKey) {
  console.error('❌  ANTHROPIC_API_KEY is not set in .env.local')
  console.error('   Add it to .env.local in the repo root:')
  console.error('   ANTHROPIC_API_KEY=sk-ant-api03-...')
  console.error('')
  console.error('   Or run with OpenAI:')
  console.error('   npx tsx --env-file=../.env.local examples/smoke-test.ts --provider openai')
  process.exit(1)
}

// ── Load dataset ─────────────────────────────────────────────────────────────
const datasetPath = resolve(__dirname, 'sample-dataset.json')
const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as {
  id: string
  question: string
  answer: string
  contexts: string[]
  groundTruth?: string
}[]

// ── Build provider config ─────────────────────────────────────────────────────
let providerConfig: Parameters<typeof evaluate>[0]['provider']

if (useOpenAI) {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey: openaiKey })
  providerConfig = { type: 'openai', client, model: 'gpt-4o' }
  console.log('🤖  Provider: OpenAI / gpt-4o')
} else {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: anthropicKey })
  providerConfig = { type: 'anthropic', client, model: 'claude-haiku-4-5-20251001' }
  console.log('🤖  Provider: Anthropic / claude-haiku-4-5-20251001')
}

// ── Run evaluation ────────────────────────────────────────────────────────────
console.log(`📊  Evaluating ${dataset.length} samples with all 5 metrics...`)
console.log('    (This makes ~20 LLM calls — takes ~15–30 seconds)\n')

const start = Date.now()

const results = await evaluate({
  provider: providerConfig,
  dataset,
  metrics: [faithfulness, contextRelevance, answerRelevance, contextRecall, contextPrecision],
  includeReasoning: true,
  concurrency: 3,
})

const elapsed = ((Date.now() - start) / 1000).toFixed(1)

// ── Print results ─────────────────────────────────────────────────────────────
console.log('─'.repeat(60))
console.log('✅  Evaluation complete in', elapsed, 'seconds')
console.log('─'.repeat(60))

console.log('\n📈  AGGREGATE SCORES')
const scores = results.scores
const fmt = (n: number | undefined) => (n !== undefined ? (n * 100).toFixed(1) + '%' : 'n/a')
console.log(`  Faithfulness:      ${fmt(scores.faithfulness)}`)
console.log(`  Context Relevance: ${fmt(scores.contextRelevance)}`)
console.log(`  Answer Relevance:  ${fmt(scores.answerRelevance)}`)
console.log(`  Context Recall:    ${fmt(scores.contextRecall)}`)
console.log(`  Context Precision: ${fmt(scores.contextPrecision)}`)
console.log(`  ─────────────────────────`)
console.log(`  Overall:           ${fmt(scores.overall)}`)

console.log('\n📋  PER-SAMPLE BREAKDOWN')
for (const sample of results.samples) {
  console.log(`\n  [${sample.id}]`)
  for (const [metric, score] of Object.entries(sample.scores)) {
    const reasoning = sample.reasoning?.[metric]
    console.log(`    ${metric.padEnd(20)} ${fmt(score)}`)
    if (reasoning) {
      console.log(`    ${''.padEnd(20)} └─ ${reasoning}`)
    }
  }
}

// ── Export to files ───────────────────────────────────────────────────────────
console.log('\n💾  Exporting results...')

writeFileSync(resolve(__dirname, 'smoke-test-results.json'), toJson(results))
console.log('  → examples/smoke-test-results.json')

writeFileSync(resolve(__dirname, 'smoke-test-results.csv'), toCsv(results))
console.log('  → examples/smoke-test-results.csv')

console.log('\n🎉  Done! The library is working correctly.')
