import { z } from 'zod'

/**
 * Score for a single metric on a single sample (0.0 – 1.0).
 */
export const MetricScoreSchema = z.number().min(0).max(1)
export type MetricScore = z.infer<typeof MetricScoreSchema>

/**
 * Per-sample metric scores. Each key is a metric name; value is 0.0–1.0.
 * Keys are present only if the metric was requested and not skipped.
 */
export const SampleScoresSchema = z.record(z.string(), MetricScoreSchema)
export type SampleScores = z.infer<typeof SampleScoresSchema>

/**
 * Result for a single sample: its ID, the original question, and metric scores.
 */
export const SampleResultSchema = z.object({
  id: z.string().optional(),
  question: z.string(),
  scores: SampleScoresSchema,
  /** Optional: per-metric LLM reasoning for debugging / explainability. */
  reasoning: z.record(z.string(), z.string()).optional(),
  /** Tenant identifier propagated from the input sample (multi-tenant SaaS). */
  tenantId: z.string().optional(),
  /** Free-form metadata propagated from the input sample. */
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type SampleResult = z.infer<typeof SampleResultSchema>

/**
 * Aggregate scores across the dataset — averaged per metric plus `overall`.
 *
 * Named built-in metrics (`faithfulness`, `contextRelevance`, etc.) are typed
 * as optional so results from evaluations that only run a subset of metrics are
 * still valid. Custom metric scores (any other string key) are allowed via the
 * index signature and appear alongside the built-in fields at runtime.
 *
 * `overall` is always present — it is the unweighted mean of all metrics that
 * were actually computed (skipped metrics are excluded).
 */
export const AggregateScoresSchema = z
  .object({
    faithfulness: MetricScoreSchema.optional(),
    contextRelevance: MetricScoreSchema.optional(),
    answerRelevance: MetricScoreSchema.optional(),
    contextRecall: MetricScoreSchema.optional(),
    contextPrecision: MetricScoreSchema.optional(),
    overall: MetricScoreSchema,
  })
  // Allow additional keys for custom metrics — loose() preserves unknown fields
  // rather than stripping them, so custom metric scores survive serialisation.
  .loose()

export type AggregateScores = z.infer<typeof AggregateScoresSchema> &
  Record<string, MetricScore | undefined>

/**
 * Distribution statistics for a single metric across all evaluated samples.
 *
 * Computed from the per-sample scores and available on `EvaluationResult.stats`.
 * Useful for understanding score variance, identifying outlier samples, and
 * reporting confidence in aggregate scores.
 *
 * @example
 * ```typescript
 * const { stats } = await evaluate({ ... })
 * console.log(stats.faithfulness)
 * // { mean: 0.87, min: 0.50, max: 1.00, stddev: 0.12, count: 20 }
 * ```
 */
export const MetricStatsSchema = z.object({
  /** Arithmetic mean (same value as `scores[metric]` in aggregate scores). */
  mean: z.number().min(0).max(1),
  /** Lowest per-sample score across all non-skipped samples. */
  min: z.number().min(0).max(1),
  /** Highest per-sample score across all non-skipped samples. */
  max: z.number().min(0).max(1),
  /**
   * Population standard deviation of per-sample scores.
   * Low stddev (< 0.05) means consistent scoring; high stddev (> 0.15) means
   * your pipeline behaves inconsistently across different questions.
   */
  stddev: z.number().nonnegative(),
  /** Number of samples that contributed to this metric (skipped samples excluded). */
  count: z.number().int().nonnegative(),
})
export type MetricStats = z.infer<typeof MetricStatsSchema>

/**
 * The full evaluation result returned by `evaluate()`.
 */
export const EvaluationResultSchema = z.object({
  /** Aggregate scores averaged across all samples. */
  scores: AggregateScoresSchema,
  /** Per-sample detailed results. */
  samples: z.array(SampleResultSchema),
  /**
   * Per-metric score distribution statistics (min, max, stddev, count).
   *
   * Keys are metric names (same as keys in `scores`, minus `overall`).
   * Useful for understanding score variance and identifying which questions
   * score poorly. `overall` is excluded — compute it from individual metric stats.
   *
   * @example
   * ```typescript
   * const { stats } = await evaluate({ ... })
   * // High stddev indicates inconsistent pipeline behaviour:
   * if ((stats.faithfulness?.stddev ?? 0) > 0.15) {
   *   console.warn('Faithfulness varies widely across samples — review your retrieval.')
   * }
   * ```
   */
  stats: z.record(z.string(), MetricStatsSchema).optional(),
  /** Metadata about the evaluation run. */
  meta: z.object({
    /** Total number of samples evaluated. */
    totalSamples: z.number().int().positive(),
    /** Names of the metrics that were evaluated. */
    metrics: z.array(z.string()),
    /** LLM provider used (e.g. 'anthropic', 'openai'). */
    provider: z.string(),
    /** LLM model used (e.g. 'claude-opus-4-6'). */
    model: z.string(),
    /** ISO 8601 timestamp when evaluation started. */
    startedAt: z.iso.datetime(),
    /** ISO 8601 timestamp when evaluation completed. */
    completedAt: z.iso.datetime(),
    /** Wall-clock duration of the evaluation in milliseconds. */
    durationMs: z.number().int().nonnegative(),
  }),
})
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>
