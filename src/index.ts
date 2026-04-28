/**
 * **rageval** — TypeScript RAG pipeline evaluation library.
 *
 * The RAGAS-inspired equivalent for Node.js. Evaluate the quality of your
 * Retrieval-Augmented Generation pipeline with LLM-as-judge scoring.
 *
 * ## Quick Start
 *
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk'
 * import { evaluate, faithfulness, contextRelevance, answerRelevance } from 'rageval'
 *
 * const results = await evaluate({
 *   provider: { type: 'anthropic', client: new Anthropic(), model: 'claude-haiku-4-5-20251001' },
 *   dataset: [
 *     {
 *       question: 'What is the capital of France?',
 *       answer: 'The capital of France is Paris.',
 *       contexts: ['France is a country in Western Europe. Its capital city is Paris.'],
 *       groundTruth: 'Paris',
 *     },
 *   ],
 *   metrics: [faithfulness, contextRelevance, answerRelevance],
 * })
 *
 * console.log(results.scores)
 * // { faithfulness: 0.97, contextRelevance: 0.91, answerRelevance: 0.95, overall: 0.94 }
 * ```
 *
 * ## Score Interpretation
 *
 * All scores are in the range [0, 1]:
 * - **0.9 – 1.0** — Excellent
 * - **0.7 – 0.9** — Good
 * - **0.5 – 0.7** — Fair — consider reviewing retrieval or prompts
 * - **< 0.5**    — Poor — pipeline needs attention
 *
 * ## Important Notes
 *
 * Scores are **non-deterministic** by nature (LLM outputs vary). Treat differences
 * smaller than ±0.03 as noise. Use `temperature: 0` in your provider config for
 * reproducible benchmarks. See the README for full guidance.
 *
 * @module rageval
 */

// ─── Core ─────────────────────────────────────────────────────────────────────

/** @category Core */
export { evaluate } from './evaluate.js'
/** @category Core */
export type { EvaluateOptions, ScoreThresholds } from './evaluate.js'

// ─── Errors ───────────────────────────────────────────────────────────────────

/** @category Errors */
export { ThresholdError } from './errors.js'

// ─── Metrics ──────────────────────────────────────────────────────────────────

/** @category Metrics */
export { answerRelevance } from './metrics/answer-relevance.js'
/** @category Metrics */
export { contextPrecision } from './metrics/context-precision.js'
/** @category Metrics */
export { contextRecall } from './metrics/context-recall.js'
/** @category Metrics */
export { contextRelevance } from './metrics/context-relevance.js'
/** @category Metrics */
export { faithfulness } from './metrics/faithfulness.js'
/** @category Metrics */
export type { Metric, MetricInput, MetricOutput } from './metrics/types.js'

// ─── Providers ────────────────────────────────────────────────────────────────

/** @category Providers */
export { createAnthropicProvider } from './providers/anthropic.js'
/** @category Providers */
export { createAzureOpenAIProvider } from './providers/azure.js'
/** @category Providers */
export { createOpenAIProvider } from './providers/openai.js'
/** @category Providers */
export type {
  AnthropicProviderConfig,
  AzureOpenAIProviderConfig,
  LlmProvider,
  OpenAIProviderConfig,
  ProviderConfig,
} from './providers/types.js'

// ─── Schemas & Types ──────────────────────────────────────────────────────────

/** @category Types */
export type { Dataset, MetricName, RagSample } from './schemas/dataset.js'
/** @category Types */
export type {
  AggregateScores,
  EvaluationResult,
  MetricScore,
  MetricStats,
  SampleResult,
} from './schemas/results.js'

// Zod schemas — useful for runtime validation of dynamic input (e.g. when
// loading datasets from disk or accepting samples from an HTTP endpoint).
/** @category Schemas */
export {
  DatasetSchema,
  MetricNameSchema,
  ProviderTypeSchema,
  RagSampleSchema,
} from './schemas/dataset.js'
/** @category Schemas */
export {
  AggregateScoresSchema,
  EvaluationResultSchema,
  MetricScoreSchema,
  MetricStatsSchema,
  SampleResultSchema,
  SampleScoresSchema,
} from './schemas/results.js'

// ─── Export Utilities ─────────────────────────────────────────────────────────

/** @category Exports */
export { cosineSimilarity } from './utils/cosine-similarity.js'
/** @category Exports */
export { toCsv, toJson } from './utils/export.js'
/** @category Exports */
export { toHtml } from './utils/html-report.js'
/** @category Exports */
export { toMarkdown } from './utils/markdown-report.js'
/** @category Exports */
export { toJUnit } from './utils/junit-report.js'
/** @category Exports */
export { toSarif } from './utils/sarif-report.js'
/** @category Exports */
export { printReport } from './utils/print-report.js'
/** @category Exports */
export type { PrintReportOptions } from './utils/print-report.js'

// ─── Parse Utilities ──────────────────────────────────────────────────────────

/** @category Utilities */
export { jsonInstruction, parseLlmScore } from './metrics/parse.js'
