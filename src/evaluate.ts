import { ThresholdError } from './errors.js'
import { answerRelevance } from './metrics/answer-relevance.js'
import { contextPrecision } from './metrics/context-precision.js'
import { contextRecall } from './metrics/context-recall.js'
import { contextRelevance } from './metrics/context-relevance.js'
import { faithfulness } from './metrics/faithfulness.js'
import type { Metric, MetricInput } from './metrics/types.js'
import { createProvider } from './providers/factory.js'
import type { ProviderConfig } from './providers/types.js'
import { DatasetSchema } from './schemas/dataset.js'
import type { EvaluationResult, SampleResult } from './schemas/results.js'
import { runWithConcurrency } from './utils/batch.js'

const ALL_METRICS: Metric[] = [
  faithfulness,
  contextRelevance,
  answerRelevance,
  contextRecall,
  contextPrecision,
]

/**
 * Minimum acceptable score (0.0–1.0) per metric.
 *
 * If any aggregate score falls below its threshold, `evaluate()` throws a
 * {@link ThresholdError}. Use this to enforce quality gates in CI pipelines.
 *
 * @example
 * ```typescript
 * await evaluate({
 *   provider: { type: 'anthropic', client },
 *   dataset,
 *   thresholds: { faithfulness: 0.8, answerRelevance: 0.75 },
 * })
 * ```
 */
export type ScoreThresholds = Partial<Record<string, number>>

/**
 * Configuration options for {@link evaluate}.
 */
export interface EvaluateOptions {
  /**
   * The LLM provider to use as the judge.
   * Pass `{ type: 'anthropic', client, model }`, `{ type: 'openai', client, model }`,
   * or `{ type: 'azure', client, model }`.
   */
  provider: ProviderConfig

  /**
   * Array of RAG samples to evaluate.
   * Each sample must have `question`, `answer`, and `contexts`.
   * `groundTruth` is optional but required for the `contextRecall` metric.
   * `tenantId` and `metadata` are optional and propagate to per-sample results.
   */
  dataset: {
    id?: string
    question: string
    answer: string
    contexts: string[]
    groundTruth?: string
    tenantId?: string
    metadata?: Record<string, unknown>
  }[]

  /**
   * Which metrics to compute. Defaults to all five built-in metrics.
   *
   * Available: `faithfulness`, `contextRelevance`, `answerRelevance`,
   * `contextRecall`, `contextPrecision`.
   *
   * **Note:** `contextRecall` requires `groundTruth` on each sample.
   * Samples without `groundTruth` are automatically skipped for that metric
   * and excluded from its aggregate score.
   */
  metrics?: Metric[]

  /**
   * When `true`, each metric's LLM reasoning is included in sample results.
   * Useful for debugging unexpected scores.
   * @default false
   */
  includeReasoning?: boolean

  /**
   * Maximum number of samples evaluated simultaneously.
   * Higher values are faster but consume more API quota.
   * @default 5
   */
  concurrency?: number

  /**
   * Minimum acceptable score per metric.
   * If any aggregate score falls below its threshold after evaluation,
   * a {@link ThresholdError} is thrown containing the full result.
   *
   * This is intended for CI quality gates — use it in combination with
   * `process.exit(1)` to fail a build when RAG quality regresses.
   *
   * @example
   * thresholds: { faithfulness: 0.8, answerRelevance: 0.75 }
   */
  thresholds?: ScoreThresholds

  /**
   * Called after each sample completes evaluation.
   * Use for progress bars, logging, or UI updates during large evaluations.
   *
   * @param completed - Number of samples evaluated so far.
   * @param total     - Total number of samples in the dataset.
   *
   * @example
   * onProgress: (done, total) => {
   *   process.stderr.write(`\r${done}/${total} evaluated`)
   * }
   */
  onProgress?: (completed: number, total: number) => void

  /**
   * File path for checkpoint-based resumable evaluation.
   *
   * When provided, `evaluate()` will:
   * 1. **On start** — read the checkpoint file if it exists, and skip any samples
   *    whose results are already recorded (matched by `id` if present, otherwise
   *    by `question` text). This lets you resume a large batch that was interrupted.
   * 2. **After each new sample** — write the accumulated results (prior + new) to
   *    the checkpoint file as JSON so progress is never lost.
   *
   * The checkpoint file is a plain JSON file with the shape:
   * ```json
   * { "version": 1, "samples": [ ...SampleResult[] ] }
   * ```
   *
   * Delete the checkpoint file when you want to start a fresh evaluation.
   *
   * @example
   * ```typescript
   * // Large 500-sample evaluation — safe to Ctrl+C and restart
   * await evaluate({
   *   provider: { type: 'anthropic', client },
   *   dataset: largeDataset,
   *   checkpoint: './eval-progress.json',
   *   onProgress: (done, total) => process.stderr.write(`\r${done}/${total}`),
   * })
   * ```
   */
  checkpoint?: string
}

// ─── Checkpoint helpers ────────────────────────────────────────────────────────

/** Persisted shape of a checkpoint file. */
interface CheckpointFile {
  version: 1
  samples: SampleResult[]
}

/**
 * Returns the lookup key for a sample — `id` when present, otherwise the
 * question text (trimmed). Both are stable identifiers across interrupted runs.
 */
function sampleKey(question: string, id: string | undefined): string {
  return id !== undefined ? `id:${id}` : `q:${question.trim()}`
}

/** Minimal subset of `node:fs` synchronous functions used for checkpointing. */
interface FsSync {
  readFileSync(path: string, encoding: 'utf-8'): string
  writeFileSync(path: string, data: string, encoding: 'utf-8'): void
}

/**
 * Reads an existing checkpoint file and returns a Map from sample key → SampleResult.
 * Returns an empty Map if the file does not exist or cannot be parsed.
 *
 * @param path - Path to the checkpoint JSON file.
 * @param fs   - Synchronous fs module subset (dynamically imported — never loaded in Edge runtimes).
 */
function loadCheckpoint(path: string, fs: FsSync): Map<string, SampleResult> {
  try {
    const raw = fs.readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as CheckpointFile
    if ((parsed.version as number) !== 1 || !Array.isArray(parsed.samples)) return new Map()
    const map = new Map<string, SampleResult>()
    for (const sample of parsed.samples) {
      map.set(sampleKey(sample.question, sample.id), sample)
    }
    return map
  } catch {
    // File does not exist yet, or is malformed — start fresh
    return new Map()
  }
}

/**
 * Writes accumulated sample results to the checkpoint file.
 * Failures are silently swallowed — a checkpoint write error should never
 * crash an in-progress evaluation.
 *
 * @param path    - Path to write the checkpoint JSON file.
 * @param samples - Accumulated sample results to persist.
 * @param fs      - Synchronous fs module subset (dynamically imported — never loaded in Edge runtimes).
 */
function saveCheckpoint(path: string, samples: SampleResult[], fs: FsSync): void {
  try {
    const data: CheckpointFile = { version: 1, samples }
    fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // Intentionally swallowed — checkpoint is best-effort
  }
}

// ─── Main evaluate() ──────────────────────────────────────────────────────────

/**
 * Evaluates the quality of a RAG pipeline against a labelled dataset.
 *
 * Uses the LLM-as-judge pattern: each metric sends a structured prompt to
 * the chosen LLM, which returns a 0–1 score. Samples are evaluated with
 * bounded concurrency to respect API rate limits.
 *
 * **Aggregation:** For each metric, scores are averaged across all samples
 * for which the metric was computed. The `overall` score is the mean of all
 * metric aggregates. Samples marked as `skipped` by a metric (e.g. samples
 * without `groundTruth` for `contextRecall`) are excluded from that metric's
 * aggregate, preventing silent score distortion.
 *
 * **Checkpoint/resume:** Pass `checkpoint: './progress.json'` to enable
 * resumable evaluation. If interrupted, re-running the same call will skip
 * already-completed samples and continue from where it left off.
 *
 * @param options - Evaluation configuration. See {@link EvaluateOptions}.
 * @returns A detailed {@link EvaluationResult} with per-sample and aggregate scores.
 *
 * @throws {ThresholdError} When `thresholds` are set and one or more metric
 *   aggregates fall below their minimum. The thrown error contains the full
 *   result so you can inspect scores even on failure.
 *
 * @throws {Error} On invalid dataset (empty, wrong shape), unknown provider,
 *   or unrecoverable LLM provider errors.
 *
 * @example
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk'
 * import { evaluate, faithfulness, answerRelevance } from 'rageval'
 *
 * const results = await evaluate({
 *   provider: { type: 'anthropic', client: new Anthropic(), model: 'claude-haiku-4-5-20251001' },
 *   dataset: [
 *     {
 *       question: 'What is the capital of France?',
 *       answer: 'The capital of France is Paris.',
 *       contexts: ['France is a country in Western Europe. Its capital is Paris.'],
 *     },
 *   ],
 *   metrics: [faithfulness, answerRelevance],
 *   thresholds: { faithfulness: 0.8 },
 * })
 *
 * console.log(results.scores)
 * // { faithfulness: 0.97, answerRelevance: 0.95, overall: 0.96 }
 * ```
 */
export async function evaluate(options: EvaluateOptions): Promise<EvaluationResult> {
  const {
    provider: providerConfig,
    dataset: rawDataset,
    metrics = ALL_METRICS,
    includeReasoning = false,
    concurrency = 5,
    thresholds,
    onProgress,
    checkpoint: checkpointPath,
  } = options

  // Guard against duplicate metric names — they cause silent score overwrites
  const metricNames = metrics.map((m) => m.name)
  const seenNames = new Set<string>()
  for (const name of metricNames) {
    if (seenNames.has(name)) {
      throw new Error(
        `Duplicate metric name "${name}". Each metric in the metrics array must have a unique name.`,
      )
    }
    seenNames.add(name)
  }

  // Validate dataset shape with Zod — throws ZodError with actionable messages
  // on bad input (empty array, missing required fields, empty strings, etc.)
  const dataset = DatasetSchema.parse(rawDataset)
  const provider = createProvider(providerConfig)

  // Emit a warning when contextRecall is requested but no samples have groundTruth.
  // Without this check, users would silently get 0% recall with no explanation.
  const contextRecallRequested = metrics.some((m) => m.name === 'contextRecall')
  const anyGroundTruth = dataset.some((s) => s.groundTruth !== undefined)
  if (contextRecallRequested && !anyGroundTruth) {
    process.stderr.write(
      '[rageval] Warning: contextRecall is enabled but no samples have a groundTruth field.\n' +
        '  contextRecall will be skipped for all samples and excluded from the overall score.\n' +
        '  Add groundTruth to your samples, or remove contextRecall from your metrics.\n',
    )
  }

  // ── Checkpoint: load prior results ──────────────────────────────────────────
  // node:fs is imported lazily — only when checkpoint is actually used.
  // This allows rageval to run in Edge runtimes (Cloudflare Workers, Vercel Edge,
  // Deno Deploy) where node:fs is unavailable, as long as checkpoint is not used.
  const fsModule: FsSync | undefined =
    checkpointPath !== undefined ? await import('node:fs') : undefined

  // priorMap maps sample key → SampleResult from a previous interrupted run.
  // checkpointAccumulator collects all results (prior + new) for incremental saves.
  const priorMap =
    checkpointPath !== undefined && fsModule !== undefined
      ? loadCheckpoint(checkpointPath, fsModule)
      : new Map<string, SampleResult>()

  // Seed the accumulator with prior results so incremental saves include them
  const checkpointAccumulator: SampleResult[] =
    checkpointPath !== undefined ? Array.from(priorMap.values()) : []

  const startedAt = new Date().toISOString()
  const startMs = Date.now()

  let completedCount = 0

  const sampleResults = await runWithConcurrency<(typeof dataset)[number], SampleResult>(
    dataset,
    concurrency,
    async (sample) => {
      const key = sampleKey(sample.question, sample.id)

      // ── Checkpoint: fast-path for already-evaluated samples ────────────────
      const prior = priorMap.get(key)
      if (prior !== undefined) {
        completedCount += 1
        onProgress?.(completedCount, dataset.length)
        return prior
      }

      const input: MetricInput = {
        question: sample.question,
        answer: sample.answer,
        contexts: sample.contexts,
        ...(sample.groundTruth !== undefined && { groundTruth: sample.groundTruth }),
      }

      const metricResults = await Promise.all(
        metrics.map(async (metric) => {
          const output = await metric.score(input, provider, includeReasoning)
          return { name: metric.name, ...output }
        }),
      )

      const scores: Record<string, number> = {}
      const reasoning: Record<string, string> = {}

      for (const result of metricResults) {
        // Exclude skipped metrics (e.g. contextRecall with no groundTruth) from
        // the sample's scores entirely. This prevents them from being counted in
        // per-sample averages and downstream aggregate calculations.
        if (result.skipped) continue

        scores[result.name] = result.score
        if (includeReasoning && result.reasoning) {
          reasoning[result.name] = result.reasoning
        }
      }

      completedCount += 1
      onProgress?.(completedCount, dataset.length)

      const sampleResult: SampleResult = {
        id: sample.id,
        question: sample.question,
        scores,
        ...(includeReasoning && Object.keys(reasoning).length > 0 && { reasoning }),
        ...(sample.tenantId !== undefined && { tenantId: sample.tenantId }),
        ...(sample.metadata !== undefined && { metadata: sample.metadata }),
      }

      // ── Checkpoint: persist progress after each new result ─────────────────
      if (checkpointPath !== undefined && fsModule !== undefined) {
        checkpointAccumulator.push(sampleResult)
        saveCheckpoint(checkpointPath, checkpointAccumulator, fsModule)
      }

      return sampleResult
    },
  )

  const completedAt = new Date().toISOString()
  const durationMs = Date.now() - startMs

  // Compute aggregate scores and distribution stats per metric.
  // Only samples where the metric actually produced a score are counted —
  // skipped samples (score not in sample.scores) are automatically excluded
  // because they were never added to the scores record above.
  const aggregateScores: Record<string, number> = {}
  const statsMap: Record<
    string,
    { mean: number; min: number; max: number; stddev: number; count: number }
  > = {}

  for (const metric of metrics) {
    const metricScores = sampleResults
      .map((r) => r.scores[metric.name])
      .filter((s): s is number => s !== undefined)

    if (metricScores.length > 0) {
      const count = metricScores.length
      const mean = metricScores.reduce((sum, s) => sum + s, 0) / count
      const min = Math.min(...metricScores)
      const max = Math.max(...metricScores)
      // Population standard deviation: sqrt( mean( (xi - mean)^2 ) )
      const variance = metricScores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / count
      const stddev = Math.sqrt(variance)

      aggregateScores[metric.name] = mean
      statsMap[metric.name] = {
        mean: Math.round(mean * 10000) / 10000,
        min: Math.round(min * 10000) / 10000,
        max: Math.round(max * 10000) / 10000,
        stddev: Math.round(stddev * 10000) / 10000,
        count,
      }
    }
    // If ALL samples were skipped for this metric, it is omitted from aggregates and stats.
  }

  // Overall = unweighted mean of all metric aggregates that were actually computed
  const allAggregateValues = Object.values(aggregateScores)
  const overall =
    allAggregateValues.length > 0
      ? allAggregateValues.reduce((sum, s) => sum + s, 0) / allAggregateValues.length
      : 0

  // Preserve a stable key order for predictable JSON output and display
  const BUILTIN_ORDER = [
    'faithfulness',
    'contextRelevance',
    'answerRelevance',
    'contextRecall',
    'contextPrecision',
  ] as const

  const orderedScores: Record<string, number> = {}
  for (const key of BUILTIN_ORDER) {
    if (aggregateScores[key] !== undefined) {
      orderedScores[key] = aggregateScores[key]
    }
  }
  // Append any custom metric scores after the built-ins
  for (const [key, val] of Object.entries(aggregateScores)) {
    if (!(BUILTIN_ORDER as readonly string[]).includes(key)) {
      orderedScores[key] = val
    }
  }
  orderedScores['overall'] = overall

  const result: EvaluationResult = {
    scores: orderedScores as EvaluationResult['scores'],
    samples: sampleResults,
    // Include per-metric distribution stats if any metrics were computed.
    // An empty statsMap (all metrics skipped) is omitted to keep the result clean.
    ...(Object.keys(statsMap).length > 0 && { stats: statsMap }),
    meta: {
      totalSamples: dataset.length,
      metrics: metrics.map((m) => m.name),
      provider: provider.name,
      model: provider.model,
      startedAt,
      completedAt,
      durationMs,
    },
  }

  // Quality gate: throw ThresholdError if any computed metric score is below its threshold.
  // Note: only metrics that were actually computed are checked — skipped metrics
  // (like contextRecall with no groundTruth) are not compared against thresholds.
  if (thresholds !== undefined) {
    const failures: Record<string, { score: number; threshold: number }> = {}
    for (const [metric, minScore] of Object.entries(thresholds)) {
      if (minScore === undefined) continue
      const actual = (orderedScores as Record<string, number | undefined>)[metric]
      if (actual === undefined) continue // metric not computed — skip threshold check
      if (actual < minScore) {
        failures[metric] = { score: actual, threshold: minScore }
      }
    }
    if (Object.keys(failures).length > 0) {
      throw new ThresholdError(failures, result)
    }
  }

  return result
}
