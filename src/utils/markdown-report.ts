import type { EvaluationResult } from '../schemas/results.js'

const METRIC_LABELS: Record<string, string> = {
  faithfulness: 'Faithfulness',
  contextRelevance: 'Context Relevance',
  answerRelevance: 'Answer Relevance',
  contextRecall: 'Context Recall',
  contextPrecision: 'Context Precision',
  overall: 'Overall',
}

const METRIC_DESCRIPTIONS: Record<string, string> = {
  faithfulness: 'Is the answer grounded in the context? (hallucination detection)',
  contextRelevance: 'Is the retrieved context relevant to the question?',
  answerRelevance: 'Does the answer actually address the question?',
  contextRecall: 'Does the context contain the ground truth?',
  contextPrecision: 'What fraction of retrieved chunks are relevant?',
}

function scoreEmoji(score: number): string {
  if (score >= 0.8) return '🟢'
  if (score >= 0.6) return '🟡'
  return '🔴'
}

function scoreBar(score: number, width = 10): string {
  const filled = Math.round(score * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/**
 * Serializes an EvaluationResult to a Markdown string.
 *
 * Produces a GitHub-compatible Markdown report with score tables,
 * a per-sample breakdown, and a metric legend. Ideal for:
 * - Posting evaluation results as a GitHub PR comment
 * - Including in documentation or wikis
 * - Committing evaluation snapshots to a repo
 *
 * @param result - The evaluation result from `evaluate()`.
 * @param title  - Optional report title.
 * @returns Markdown string.
 *
 * @example
 * ```typescript
 * import { evaluate, toMarkdown } from 'rageval'
 * import { writeFileSync } from 'node:fs'
 *
 * const result = await evaluate({ ... })
 * writeFileSync('eval-report.md', toMarkdown(result))
 * ```
 */
export function toMarkdown(result: EvaluationResult, title = 'rageval Evaluation Report'): string {
  const { scores, samples, meta } = result
  const metricKeys = meta.metrics
  const overall = scores.overall
  const overallEmoji = scoreEmoji(overall)
  const runDate = new Date(meta.startedAt).toISOString().split('T')[0]
  const durationSec = (meta.durationMs / 1000).toFixed(1)

  const lines: string[] = []

  // Header
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(
    `> ${overallEmoji} **Overall: ${(overall * 100).toFixed(1)}%** &nbsp;·&nbsp; ${meta.totalSamples} samples &nbsp;·&nbsp; ${meta.provider}/${meta.model} &nbsp;·&nbsp; ${durationSec}s &nbsp;·&nbsp; ${runDate}`,
  )
  lines.push('')
  lines.push('---')
  lines.push('')

  // Aggregate scores table
  lines.push('## Aggregate Scores')
  lines.push('')
  lines.push('| Metric | Score | Bar | Status |')
  lines.push('|--------|------:|-----|--------|')

  const scoreEntries = Object.entries(scores).filter(([, v]) => v !== undefined) as [
    string,
    number,
  ][]
  for (const [key, val] of scoreEntries) {
    const label = METRIC_LABELS[key] ?? key
    const pct = (val * 100).toFixed(1) + '%'
    const bar = scoreBar(val)
    const emoji = scoreEmoji(val)
    const bold = key === 'overall' ? '**' : ''
    lines.push(`| ${bold}${label}${bold} | ${bold}${pct}${bold} | \`${bar}\` | ${emoji} |`)
  }

  lines.push('')
  lines.push('---')
  lines.push('')

  // Per-sample table
  lines.push('## Sample Results')
  lines.push('')

  const metricHeaders = metricKeys.map((m) => METRIC_LABELS[m] ?? m).join(' | ')
  lines.push(`| # | Question | ${metricHeaders} | Overall |`)
  lines.push(`|---|---------|${'---------|'.repeat(metricKeys.length + 1)}`)

  for (const [i, sample] of samples.entries()) {
    const id = sample.id ? `\`${sample.id}\` ` : ''
    const q = (id + sample.question).slice(0, 60).replace(/[|]/g, '\\|')
    const metricCells = metricKeys
      .map((m) => {
        const s = sample.scores[m]
        if (s === undefined) return '—'
        return `${scoreEmoji(s)} ${(s * 100).toFixed(0)}%`
      })
      .join(' | ')
    const allVals = metricKeys
      .map((m) => sample.scores[m])
      .filter((s): s is number => s !== undefined)
    const sampleOverall =
      allVals.length > 0 ? allVals.reduce((a, b) => a + b, 0) / allVals.length : null
    const overallCell =
      sampleOverall !== null
        ? `**${scoreEmoji(sampleOverall)} ${(sampleOverall * 100).toFixed(0)}%**`
        : '—'
    lines.push(`| ${i + 1} | ${q} | ${metricCells} | ${overallCell} |`)
  }

  lines.push('')

  // Reasoning section (collapsible)
  const samplesWithReasoning = samples.filter(
    (s): s is typeof s & { reasoning: Record<string, string> } =>
      s.reasoning !== undefined && Object.keys(s.reasoning).length > 0,
  )
  if (samplesWithReasoning.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## LLM Reasoning')
    lines.push('')
    for (const sample of samplesWithReasoning) {
      const label = sample.id ? `Sample \`${sample.id}\`` : `"${sample.question.slice(0, 50)}"`
      lines.push(`<details><summary>${label}</summary>`)
      lines.push('')
      for (const [metric, reasoning] of Object.entries(sample.reasoning)) {
        lines.push(`**${METRIC_LABELS[metric] ?? metric}:** ${reasoning}`)
        lines.push('')
      }
      lines.push('</details>')
      lines.push('')
    }
  }

  // Metric legend
  lines.push('---')
  lines.push('')
  lines.push('## Metric Legend')
  lines.push('')
  for (const key of metricKeys) {
    const desc = METRIC_DESCRIPTIONS[key]
    if (!desc) continue
    // Every key in METRIC_DESCRIPTIONS also has an entry in METRIC_LABELS (invariant
    // enforced by the constants above), so falling back to the raw key is unreachable
    // in production. The `?? key` is kept as a safety net and excluded from coverage.
    /* c8 ignore next */
    const label = METRIC_LABELS[key] ?? key
    lines.push(`- **${label}** — ${desc}`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(
    '*Generated by [rageval](https://github.com/cloudserveinfotech/rageval) — TypeScript RAG pipeline evaluation*',
  )

  return lines.join('\n')
}
