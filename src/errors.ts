import type { EvaluationResult } from './schemas/results.js'

/**
 * Thrown by {@link evaluate} when one or more metric aggregate scores fall
 * below their configured {@link ScoreThresholds}.
 *
 * Carries both the failing metric details ({@link failures}) **and** the full
 * {@link EvaluationResult} ({@link result}) so you can export SARIF, JUnit, or
 * HTML reports even when the quality gate fails.
 *
 * Use this in CI pipelines to fail a build when RAG quality regresses:
 *
 * @example
 * ```typescript
 * import { evaluate, ThresholdError, toSarif, toJUnit } from 'rageval'
 * import { writeFileSync } from 'node:fs'
 *
 * try {
 *   await evaluate({
 *     provider: { type: 'anthropic', client },
 *     dataset,
 *     thresholds: { faithfulness: 0.8, answerRelevance: 0.75 },
 *   })
 *   console.log('Quality gate passed ✓')
 * } catch (e) {
 *   if (e instanceof ThresholdError) {
 *     // Log each failed metric
 *     for (const [metric, { score, threshold }] of Object.entries(e.failures)) {
 *       console.error(`  ${metric}: ${score.toFixed(3)} < ${threshold}`)
 *     }
 *     // Still export reports — the full result is attached to the error
 *     writeFileSync('rageval.sarif', toSarif(e.result))
 *     writeFileSync('junit-results.xml', toJUnit(e.result))
 *     process.exit(1)
 *   }
 *   throw e
 * }
 * ```
 */
export class ThresholdError extends Error {
  /**
   * Map of metric names to their actual score and required minimum.
   * Only metrics that failed the threshold are included.
   *
   * Iterate with `Object.entries(e.failures)` to get `[metric, { score, threshold }]` pairs.
   *
   * @example
   * // { faithfulness: { score: 0.72, threshold: 0.8 } }
   */
  readonly failures: Record<string, { score: number; threshold: number }>

  /**
   * The complete {@link EvaluationResult} that triggered this error.
   *
   * All per-sample scores and aggregate scores are present — only the threshold
   * gate failed. Use this to export reports (SARIF, JUnit, HTML, Markdown) even
   * when the quality gate fails, so you can diagnose exactly which samples caused
   * the regression.
   */
  readonly result: EvaluationResult

  constructor(
    failures: Record<string, { score: number; threshold: number }>,
    result: EvaluationResult,
  ) {
    // Build a human-readable summary of every failing metric
    const lines = Object.entries(failures)
      .map(([k, v]) => `  ${k}: ${v.score.toFixed(3)} < ${v.threshold}`)
      .join('\n')
    super(
      `rageval quality gate failed — the following metrics fell below their thresholds:\n${lines}`,
    )
    this.name = 'ThresholdError'
    this.failures = failures
    this.result = result
  }
}
