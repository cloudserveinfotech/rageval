import type { EvaluationResult } from '../schemas/results.js'

/**
 * Escapes a string for safe embedding inside XML attribute values and text content.
 *
 * Handles the five characters that are illegal in XML without escaping:
 * `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&apos;`.
 *
 * Applied to every user-supplied string before it is written into the JUnit XML
 * output -- sample questions, answers, provider names, model names, and reasoning
 * text may all contain characters that would otherwise produce malformed XML and
 * break CI test report parsers.
 *
 * @param s - The raw string to escape.
 * @returns XML-safe version of `s` with all five special characters replaced.
 *
 * @example
 * ```typescript
 * escXml('5 < 10 && 10 > 5')
 * // → '5 &lt; 10 &amp;&amp; 10 &gt; 5'
 *
 * escXml('He said "hello" & she said \'hi\'')
 * // → 'He said &quot;hello&quot; &amp; she said &apos;hi&apos;'
 * ```
 */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Serializes an EvaluationResult to JUnit XML format.
 *
 * JUnit XML is the universal CI test report format — supported by GitHub Actions,
 * GitLab CI, Jenkins, CircleCI, Azure DevOps, and almost every other CI system.
 * Upload the XML file as a test artifact to visualize evaluation failures as
 * failed tests directly in your CI dashboard.
 *
 * Each sample becomes a `<testcase>`. A sample "fails" when any metric score is
 * below the provided `failureThreshold` (default: 0.5). Failures appear as
 * failed tests in your CI dashboard, making quality regressions immediately visible.
 * Passing samples include their scores in `<system-out>` for traceability.
 *
 * @param result           - The evaluation result from `evaluate()`.
 * @param failureThreshold - Score below which a sample is marked as failed. Default: 0.5.
 * @returns JUnit XML string. Safe to write directly to a file.
 *
 * @example
 * ```typescript
 * import { evaluate, toJUnit } from 'rageval'
 * import { writeFileSync } from 'node:fs'
 *
 * // In your CI pipeline:
 * const result = await evaluate({ ... })
 * writeFileSync('junit-results.xml', toJUnit(result))
 * // Then configure your CI to pick up junit-results.xml as a test report.
 *
 * // GitHub Actions example:
 * // - uses: dorny/test-reporter@v1
 * //   with:
 * //     artifact: junit-results.xml
 * //     name: RAG Quality Report
 * //     reporter: java-junit
 * ```
 */
export function toJUnit(result: EvaluationResult, failureThreshold = 0.5): string {
  const { samples, meta, scores } = result
  const metricKeys = meta.metrics
  const timestamp = meta.startedAt.replace(/\.000Z$/, 'Z')
  const durationSec = (meta.durationMs / 1000).toFixed(3)

  let failures = 0
  const testCases: string[] = []

  for (const [sampleIndex, sample] of samples.entries()) {
    // Use 1-based index as fallback ID — samples.indexOf() would be O(n²) over large datasets
    const id = sample.id ?? String(sampleIndex + 1)
    const name = escXml(`[${id}] ${sample.question.slice(0, 120)}`)
    const caseDuration = (meta.durationMs / samples.length / 1000).toFixed(3)

    const failingMetrics: { metric: string; score: number }[] = []
    for (const m of metricKeys) {
      const s = sample.scores[m]
      if (s !== undefined && s < failureThreshold) {
        failingMetrics.push({ metric: m, score: s })
      }
    }

    if (failingMetrics.length > 0) {
      failures++
      const metricDetails = failingMetrics
        .map(
          ({ metric, score }) => `${metric}: ${score.toFixed(4)} (threshold: ${failureThreshold})`,
        )
        .join(', ')
      const allScores = metricKeys
        .map((m) => `${m}=${(sample.scores[m] ?? 0).toFixed(4)}`)
        .join(' ')
      testCases.push(
        `    <testcase name="${name}" classname="${escXml(meta.provider)}.${escXml(meta.model)}" time="${caseDuration}">` +
          `\n      <failure message="${escXml(`Scores below threshold ${failureThreshold}: ${metricDetails}`)}" type="QualityFailure">` +
          `\n        Scores: ${escXml(allScores)}` +
          (sample.reasoning
            ? `\n        Reasoning: ${escXml(JSON.stringify(sample.reasoning))}`
            : '') +
          `\n      </failure>` +
          `\n    </testcase>`,
      )
    } else {
      const allScores = metricKeys
        .map((m) => `${m}=${(sample.scores[m] ?? 0).toFixed(4)}`)
        .join(' ')
      testCases.push(
        `    <testcase name="${name}" classname="${escXml(meta.provider)}.${escXml(meta.model)}" time="${caseDuration}">` +
          `\n      <system-out>${escXml(allScores)}</system-out>` +
          `\n    </testcase>`,
      )
    }
  }

  const aggregateScores = Object.entries(scores)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${(v as number).toFixed(4)}`)
    .join(' ')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="rageval" tests="${samples.length}" failures="${failures}" time="${durationSec}" timestamp="${timestamp}">`,
    `  <testsuite name="RAG Evaluation" tests="${samples.length}" failures="${failures}" time="${durationSec}" timestamp="${timestamp}"`,
    `    hostname="${escXml(meta.provider)}" package="${escXml(meta.model)}">`,
    `    <properties>`,
    `      <property name="provider" value="${escXml(meta.provider)}"/>`,
    `      <property name="model" value="${escXml(meta.model)}"/>`,
    `      <property name="metrics" value="${escXml(metricKeys.join(','))}"/>`,
    `      <property name="totalSamples" value="${samples.length}"/>`,
    `      <property name="aggregateScores" value="${escXml(aggregateScores)}"/>`,
    `    </properties>`,
    ...testCases,
    `  </testsuite>`,
    `</testsuites>`,
  ].join('\n')
}
