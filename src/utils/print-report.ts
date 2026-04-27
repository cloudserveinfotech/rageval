import type { EvaluationResult } from '../schemas/results.js'

// ANSI color codes — disabled automatically when stdout is not a TTY
const isTTY = process.stdout.isTTY

const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  red: isTTY ? '\x1b[31m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  white: isTTY ? '\x1b[37m' : '',
  bgGreen: isTTY ? '\x1b[42m' : '',
  gray: isTTY ? '\x1b[90m' : '',
}

function scoreColor(score: number): string {
  if (score >= 0.8) return c.green
  if (score >= 0.6) return c.yellow
  return c.red
}

function scoreBar(score: number, width = 20): string {
  const filled = Math.round(score * width)
  const empty = width - filled
  const color = scoreColor(score)
  const bar = '█'.repeat(filled) + c.dim + '░'.repeat(empty) + c.reset
  return color + bar + c.reset
}

const METRIC_LABELS: Record<string, string> = {
  faithfulness: 'Faithfulness     ',
  contextRelevance: 'Context Relevance',
  answerRelevance: 'Answer Relevance ',
  contextRecall: 'Context Recall   ',
  contextPrecision: 'Context Precision',
  overall: 'Overall          ',
}

export interface PrintReportOptions {
  /**
   * Whether to print per-sample scores. Default: false (only aggregate scores).
   */
  showSamples?: boolean
  /**
   * Maximum number of samples to print. Default: 10.
   */
  maxSamples?: number
  /**
   * Stream to print to. Default: process.stdout.
   */
  stream?: NodeJS.WritableStream
}

/**
 * Prints a formatted evaluation report to the terminal.
 *
 * Renders color-coded score bars, metric summaries, and optional per-sample
 * breakdown. Colors are automatically disabled when stdout is not a TTY.
 *
 * @param result  - The evaluation result from `evaluate()`.
 * @param options - Optional display configuration.
 *
 * @example
 * ```typescript
 * import { evaluate, printReport } from 'rageval'
 *
 * const result = await evaluate({ ... })
 * printReport(result)
 *
 * // With per-sample breakdown:
 * printReport(result, { showSamples: true, maxSamples: 20 })
 * ```
 */
export function printReport(result: EvaluationResult, options: PrintReportOptions = {}): void {
  const { showSamples = false, maxSamples = 10, stream = process.stdout } = options
  const { scores, samples, meta } = result

  const out = (line: string) => stream.write(line + '\n')

  const width = 60
  const hr = c.dim + '─'.repeat(width) + c.reset

  out('')
  out(c.bold + c.cyan + '  rageval Evaluation Report' + c.reset)
  out(hr)

  // Meta
  out(c.gray + `  Provider  : ${meta.provider} / ${meta.model}` + c.reset)
  out(
    c.gray + `  Samples   : ${meta.totalSamples}  ·  Metrics: ${meta.metrics.join(', ')}` + c.reset,
  )
  out(
    c.gray +
      `  Duration  : ${(meta.durationMs / 1000).toFixed(2)}s  ·  ${new Date(meta.startedAt).toLocaleString()}` +
      c.reset,
  )
  out(hr)

  // Aggregate scores
  out(c.bold + '  Aggregate Scores' + c.reset)
  out('')

  const scoreEntries = Object.entries(scores).filter(([, v]) => v !== undefined) as [
    string,
    number,
  ][]

  for (const [key, val] of scoreEntries) {
    const label = METRIC_LABELS[key] ?? key.padEnd(17)
    const color = scoreColor(val)
    const bar = scoreBar(val, 22)
    const pct = (val * 100).toFixed(1).padStart(5)
    const isOverall = key === 'overall'
    const prefix = isOverall ? c.bold : ''
    const suffix = isOverall ? c.reset : ''
    out(
      `  ${prefix}${c.dim}${label}${c.reset}  ${bar}  ${color}${prefix}${pct}%${suffix}${c.reset}`,
    )
  }

  out(hr)

  // Per-sample breakdown
  if (showSamples && samples.length > 0) {
    const shown = samples.slice(0, maxSamples)
    const remaining = samples.length - shown.length
    out(c.bold + '  Per-sample Results' + c.reset)
    out('')

    for (const [i, sample] of shown.entries()) {
      const id = sample.id ? `[${sample.id}] ` : ''
      const q = (id + sample.question).slice(0, 55)
      out(`  ${c.dim}${String(i + 1).padStart(3)}.${c.reset} ${c.white}${q}${c.reset}`)

      for (const [key, val] of Object.entries(sample.scores)) {
        const label = (METRIC_LABELS[key] ?? key).trimEnd().padEnd(17)
        const color = scoreColor(val)
        const bar = scoreBar(val, 14)
        const pct = (val * 100).toFixed(1).padStart(5)
        out(`         ${c.gray}${label}${c.reset}  ${bar}  ${color}${pct}%${c.reset}`)
      }
      out('')
    }

    if (remaining > 0) {
      out(
        c.dim + `  … and ${remaining} more sample(s). Use maxSamples option to show all.` + c.reset,
      )
      out('')
    }
  }

  // Quick verdict
  const overall = scores.overall
  let verdict: string
  if (overall >= 0.85) {
    verdict = c.green + c.bold + '  ✓ Excellent — your RAG pipeline is performing well.' + c.reset
  } else if (overall >= 0.7) {
    verdict = c.yellow + c.bold + '  ⚠ Good — some metrics have room for improvement.' + c.reset
  } else if (overall >= 0.5) {
    verdict = c.yellow + '  ⚠ Fair — consider reviewing your retrieval strategy.' + c.reset
  } else {
    verdict = c.red + c.bold + '  ✗ Poor — significant issues detected in the pipeline.' + c.reset
  }
  out(verdict)
  out('')
}
