import type { EvaluationResult } from '../schemas/results.js'

/**
 * Serializes an EvaluationResult to a JSON string.
 *
 * The JSON structure matches the EvaluationResult schema exactly and can be
 * parsed back with `JSON.parse()` -- useful for caching results or comparing
 * evaluation runs over time.
 *
 * @param result - The evaluation result to export.
 * @param pretty - Whether to pretty-print with 2-space indentation. Default: `true`.
 *                 Pass `false` for compact output (e.g. when storing in a database).
 * @returns JSON string representation of the full evaluation result.
 *
 * @example
 * ```typescript
 * import { evaluate, toJson } from 'rageval'
 * import { writeFileSync } from 'node:fs'
 *
 * const result = await evaluate({ ... })
 * writeFileSync('eval-result.json', toJson(result))
 *
 * // Compact for API responses:
 * res.send(toJson(result, false))
 * ```
 */
export function toJson(result: EvaluationResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0)
}

/**
 * Serializes an EvaluationResult to a CSV string.
 *
 * Each row represents one sample. Columns:
 * - `id` -- sample identifier (empty string if not set)
 * - `question` -- the question text
 * - one numeric score column per evaluated metric (e.g. `faithfulness`, `answerRelevance`)
 * - `overall` -- per-sample mean of all metric scores
 * - `{metric}_reasoning` columns -- included automatically when `includeReasoning: true`
 *   was passed to `evaluate()` and reasoning text is present. Useful for audit
 *   logs in healthcare, legal, or compliance contexts.
 *
 * Scores are formatted to 4 decimal places. The CSV follows RFC 4180 escaping --
 * fields containing commas, double quotes, or newlines are wrapped in double
 * quotes with internal quotes doubled. Safe to open in Excel, Google Sheets, or pandas.
 *
 * @param result - The evaluation result to export.
 * @returns CSV string with header row. Returns empty string if dataset is empty.
 *
 * @example
 * ```typescript
 * import { evaluate, toCsv } from 'rageval'
 * import { writeFileSync } from 'node:fs'
 *
 * const result = await evaluate({ ... })
 * writeFileSync('eval-scores.csv', toCsv(result))
 * // Columns: id,question,faithfulness,answerRelevance,overall
 * // Example row: q1,What is...,0.9500,0.8750,0.9125
 *
 * // With reasoning (for audit logs):
 * const resultWithReasoning = await evaluate({ ..., includeReasoning: true })
 * writeFileSync('eval-audit.csv', toCsv(resultWithReasoning))
 * // Columns: id,question,faithfulness,answerRelevance,overall,faithfulness_reasoning,answerRelevance_reasoning
 * ```
 */
export function toCsv(result: EvaluationResult): string {
  const { samples, meta } = result

  if (samples.length === 0) {
    return ''
  }

  // Detect whether any sample has reasoning -- if so, include reasoning columns.
  // This respects the `includeReasoning: true` option from evaluate().
  const hasReasoning = samples.some(
    (s) => s.reasoning !== undefined && Object.keys(s.reasoning).length > 0,
  )
  const reasoningColumns = hasReasoning ? meta.metrics.map((m) => `${m}_reasoning`) : []

  // Build column headers from the metrics that were evaluated
  const metricColumns = meta.metrics
  const headers = ['id', 'question', ...metricColumns, 'overall', ...reasoningColumns]

  const rows: string[] = [headers.map(escapeField).join(',')]

  for (const sample of samples) {
    const id = sample.id ?? ''
    const question = sample.question
    const metricScores = metricColumns.map((m) => {
      const score = sample.scores[m]
      return score !== undefined ? score.toFixed(4) : ''
    })

    // Compute per-sample overall (average of all available metric scores)
    const availableScores = metricColumns
      .map((m) => sample.scores[m])
      .filter((s): s is number => s !== undefined)

    const sampleOverall =
      availableScores.length > 0
        ? (availableScores.reduce((sum, s) => sum + s, 0) / availableScores.length).toFixed(4)
        : ''

    // Reasoning columns -- one per metric, empty string when not present for this sample
    const reasoningValues = reasoningColumns.map((col) => {
      const metricName = col.replace(/_reasoning$/, '')
      return sample.reasoning?.[metricName] ?? ''
    })

    const row = [id, question, ...metricScores, sampleOverall, ...reasoningValues].map(escapeField)
    rows.push(row.join(','))
  }

  return rows.join('\n')
}

/**
 * Escapes a CSV field value per RFC 4180.
 *
 * Wraps the value in double quotes if it contains a comma, double quote,
 * carriage return, or newline. Internal double quotes are escaped by doubling.
 * Carriage returns (\r) in field values are included in the trigger set because
 * they appear in Windows line endings embedded in multi-line answers and would
 * otherwise silently corrupt the CSV row structure.
 */
function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
