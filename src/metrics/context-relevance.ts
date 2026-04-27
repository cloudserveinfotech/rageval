import type { LlmProvider } from '../providers/types.js'

import { jsonInstruction, parseLlmScore } from './parse.js'
import type { Metric, MetricInput, MetricOutput } from './types.js'

/**
 * **Context Relevance** — measures whether the retrieved context is relevant
 * to the question being asked (retriever quality signal).
 *
 * Score 1.0 = all retrieved chunks are highly relevant and directly useful.
 * Score 0.0 = retrieved chunks are entirely off-topic / irrelevant to the question.
 *
 * **When to use:** Use contextRelevance to diagnose retrieval quality issues. A
 * low score typically indicates that the embedding model, chunking strategy, or
 * similarity threshold is not filtering out irrelevant chunks well enough.
 *
 * **Difference from contextPrecision:** Both measure retrieval quality, but from
 * different angles. contextRelevance makes a holistic judgment ("is this context
 * useful overall?") while contextPrecision computes an explicit ratio ("what
 * fraction of chunks are relevant?"). Use both for a complete retrieval picture.
 *
 * **Score interpretation (5-point scale):**
 * - 1.0: All chunks are directly relevant — excellent retriever precision
 * - 0.75: Most chunks are relevant; one or two contain minor tangential content
 * - 0.5: Mixed — roughly half the retrieved content is relevant to the question
 * - 0.25: Most retrieved content is off-topic; only minor relevant signals
 * - 0.0: Entirely irrelevant — retriever is fetching the wrong documents completely
 *
 * Uses LLM-as-judge pattern — see arXiv:2306.05685 (RAGAS paper).
 */
export const contextRelevance: Metric = {
  name: 'contextRelevance',
  description:
    'Measures whether the retrieved context chunks are relevant to the question. Identifies retrieval quality issues.',

  /**
   * Scores context relevance for a single RAG sample using an LLM judge.
   *
   * Uses a 5-point rubric with explicit chunk-by-chunk analysis instruction.
   * The judge assesses each retrieved chunk independently, then forms a holistic
   * relevance score. The `answer` field is intentionally excluded from this
   * prompt — contextRelevance evaluates retrieval quality, not generation quality.
   *
   * @param input            - The RAG sample (question, contexts).
   *                           The `answer` field is not used by this metric.
   * @param provider         - The LLM provider used as the judge.
   * @param includeReasoning - When `true`, the LLM's analysis is returned in
   *                           `output.reasoning`. Default: `false`.
   * @returns Promise resolving to a MetricOutput with `score` in [0, 1]
   *          and optional `reasoning` string.
   *
   * @example
   * ```typescript
   * import OpenAI from 'openai'
   * import { contextRelevance, createOpenAIProvider } from 'rageval'
   *
   * const provider = createOpenAIProvider({
   *   client: new OpenAI(),
   *   model: 'gpt-4o-mini',
   *   temperature: 0,
   * })
   *
   * const result = await contextRelevance.score(
   *   {
   *     question: 'What is the capital of France?',
   *     answer: 'Paris',  // answer is ignored by this metric
   *     contexts: [
   *       'France is a country in Western Europe.',               // partially relevant
   *       'Paris is the capital and largest city of France.',     // highly relevant
   *       'The Eiffel Tower is a famous landmark in Paris.',      // tangentially relevant
   *     ],
   *   },
   *   provider,
   * )
   * // result.score -> ~0.80 (two of three chunks are directly relevant)
   * ```
   */
  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    // Number each context chunk so the judge can reference them precisely
    const contextText = input.contexts.map((ctx, i) => `[Context ${i + 1}]: ${ctx}`).join('\n\n')

    // 5-point rubric with per-chunk analysis instruction.
    // Asking the judge to evaluate each chunk individually before forming
    // an overall score reduces holistic bias and anchoring effects.
    const prompt = `You are an expert evaluator assessing the relevance of retrieved context to a question.

QUESTION:
${input.question}

RETRIEVED CONTEXT (${input.contexts.length} chunk${input.contexts.length === 1 ? '' : 's'}):
${contextText}

TASK:
Think step by step:
1. For each context chunk, assess whether it contains information useful for answering the question.
2. Classify each chunk as: highly relevant / partially relevant / tangential / irrelevant.
3. Consider the overall proportion of relevant content across all chunks.
4. Assign a holistic relevance score based on how well the context collection serves the question.

Scoring rubric:
- 1.0: All chunks are directly relevant and useful for answering the question.
- 0.75: Most chunks are relevant; one or two contain only tangential content.
- 0.5: About half the chunks are relevant; the rest are off-topic or only loosely connected.
- 0.25: Most chunks are off-topic; only minor relevant signals are present.
- 0.0: All retrieved chunks are entirely irrelevant to the question.
${jsonInstruction(includeReasoning)}`

    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)

    return {
      score,
      ...(includeReasoning && { reasoning }),
    }
  },
}
