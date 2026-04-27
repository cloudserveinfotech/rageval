import type { LlmProvider } from '../providers/types.js'

import { jsonInstruction, parseLlmScore } from './parse.js'
import type { Metric, MetricInput, MetricOutput } from './types.js'

/**
 * **Context Precision** — measures what fraction of the retrieved context
 * chunks are actually relevant to answering the question (noise ratio signal).
 *
 * Score 1.0 = every retrieved chunk is relevant and useful.
 * Score 0.0 = none of the retrieved chunks are relevant to the question.
 *
 * **What it measures:** High precision = low retrieval noise. Low precision =
 * the retriever is returning irrelevant chunks alongside the useful ones, which
 * wastes token budget and can confuse the LLM generator.
 *
 * **Difference from contextRelevance:** contextPrecision instructs the judge
 * to evaluate each chunk independently and compute an explicit ratio
 * (relevant / total). contextRelevance makes a holistic judgment. Use both
 * together for a comprehensive retrieval quality picture.
 *
 * **Score interpretation (5-point scale):**
 * - 1.0: All chunks are relevant — retriever precision is excellent
 * - 0.75: Most chunks are relevant; one or two are not directly useful
 * - 0.5: About half the chunks are relevant; half are noise
 * - 0.25: Most chunks are noise; only a small fraction are useful
 * - 0.0: No retrieved chunk is relevant to the question — pure noise
 *
 * Uses LLM-as-judge pattern — see arXiv:2306.05685 (RAGAS paper).
 */
export const contextPrecision: Metric = {
  name: 'contextPrecision',
  description:
    'Measures what fraction of retrieved context chunks are relevant to the question. Identifies retrieval noise.',

  /**
   * Scores context precision for a single RAG sample using an LLM judge.
   *
   * The prompt instructs the judge to evaluate each chunk independently,
   * classify it as relevant or not, then compute precision = relevant/total.
   * The chunk count is embedded in the prompt so the scoring anchors are
   * concrete (e.g. "3 of 5 chunks" instead of "about half"), which improves
   * consistency across evaluations with different top-k retrieval settings.
   *
   * @param input            - The RAG sample. Only `question` and `contexts` are
   *                           used; `answer` is intentionally ignored.
   * @param provider         - The LLM provider used as the judge.
   * @param includeReasoning - When `true`, the LLM's per-chunk analysis is returned
   *                           in `output.reasoning`. Default: `false`.
   * @returns Promise resolving to a MetricOutput with `score` in [0, 1]
   *          and optional `reasoning` string.
   *
   * @example
   * ```typescript
   * import Anthropic from '@anthropic-ai/sdk'
   * import { contextPrecision, createAnthropicProvider } from 'rageval'
   *
   * const provider = createAnthropicProvider({
   *   client: new Anthropic(),
   *   model: 'claude-haiku-4-5-20251001',
   *   temperature: 0,
   * })
   *
   * const result = await contextPrecision.score(
   *   {
   *     question: 'What is the boiling point of water?',
   *     answer: '100°C at sea level.',    // answer is ignored by this metric
   *     contexts: [
   *       'Water boils at 100°C (212°F) at standard atmospheric pressure.',  // relevant
   *       'The history of thermometer invention dates to the 17th century.',  // irrelevant
   *       'At high altitudes, water boils at lower temperatures.',            // relevant
   *     ],
   *   },
   *   provider,
   *   true,
   * )
   * // result.score     -> ~0.67 (2 of 3 chunks are relevant)
   * // result.reasoning -> "Chunk 1 ✓ relevant, Chunk 2 ✗ irrelevant, Chunk 3 ✓ relevant → 2/3 = 0.67"
   * ```
   */
  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    const n = input.contexts.length

    // Number each context chunk so the judge can reference them precisely
    const contextText = input.contexts.map((ctx, i) => `[Context ${i + 1}]: ${ctx}`).join('\n\n')

    // Build precise anchors for this exact chunk count.
    // When n=1: avoid confusing "half" or "most" language.
    // When n=2: make 0.5 mean exactly "1 of 2" to prevent ambiguity.
    const anchor100 = n === 1 ? 'The 1 chunk is relevant' : `All ${n} chunks are relevant`
    const anchor50 =
      n === 1
        ? 'The chunk is not relevant (equivalent to 0.0 for a single chunk)'
        : n === 2
          ? 'Exactly 1 of the 2 chunks is relevant'
          : `About half (${Math.round(n / 2)} of ${n}) chunks are relevant`
    const anchor0 = n === 1 ? 'The 1 chunk is not relevant' : `None of the ${n} chunks are relevant`

    const anchor75 =
      n === 1
        ? 'The chunk is largely relevant but not fully useful'
        : n === 2
          ? 'Both chunks have some relevant content, though one is less directly useful'
          : `${Math.ceil(n * 0.75)} of ${n} chunks are relevant`
    const anchor25 =
      n === 1
        ? 'The chunk is largely irrelevant but contains a small fragment of useful information'
        : n === 2
          ? 'Only one chunk is slightly relevant; the other is noise'
          : `${Math.max(1, Math.floor(n * 0.25))} of ${n} chunks are relevant`

    const prompt = `You are an expert evaluator assessing the precision of retrieved context for answering a question.

QUESTION:
${input.question}

RETRIEVED CONTEXT (${n} chunk${n === 1 ? '' : 's'}):
${contextText}

TASK:
Think step by step:
1. For each context chunk (numbered 1–${n}), determine whether it contains information that is useful for answering the question.
2. Label each chunk: ✓ relevant or ✗ not relevant.
3. Compute precision = (number of relevant chunks) / ${n} (total chunks).
4. A chunk is "relevant" if it contains information that could help construct a correct answer.

Scoring rubric:
- 1.0: ${anchor100}.
- 0.75: ${anchor75}.
- 0.5: ${anchor50}.
- 0.25: ${anchor25}.
- 0.0: ${anchor0}.
${jsonInstruction(includeReasoning)}`

    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)

    return {
      score,
      ...(includeReasoning && { reasoning }),
    }
  },
}
