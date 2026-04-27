import type { LlmProvider } from '../providers/types.js'

import { jsonInstruction, parseLlmScore } from './parse.js'
import type { Metric, MetricInput, MetricOutput } from './types.js'

/**
 * **Answer Relevance** — measures whether the generated answer actually
 * addresses the question that was asked (on-topic response signal).
 *
 * Score 1.0 = the answer directly and completely responds to the question.
 * Score 0.0 = the answer is entirely off-topic or does not address the question.
 *
 * **Important distinction:** This metric measures *topicality*, not *accuracy*.
 * An answer can score 1.0 on answerRelevance while still being factually wrong.
 * Use in combination with `faithfulness` for a complete quality picture:
 * - **faithfulness**: Is the answer grounded in context? (no hallucinations)
 * - **answerRelevance**: Is the answer on-topic and responsive? (no evasions)
 *
 * **When to use:** answerRelevance catches LLM responses that are technically
 * "about the right topic" but fail to answer the specific question asked —
 * e.g., an answer that recites background information instead of the specific
 * fact the user requested.
 *
 * **Score interpretation (5-point scale):**
 * - 1.0: Answer directly and completely addresses the question — nothing missing
 * - 0.75: Answer mostly addresses the question with minor gaps or tangents
 * - 0.5: Answer partially addresses the question; significant gaps or tangents
 * - 0.25: Answer barely addresses the question; mostly off-topic or evasive
 * - 0.0: Answer does not address the question at all — entirely off-topic
 *
 * Uses LLM-as-judge pattern — see arXiv:2306.05685 (RAGAS paper).
 */
export const answerRelevance: Metric = {
  name: 'answerRelevance',
  description:
    'Measures whether the generated answer directly addresses the question asked. Detects off-topic or evasive answers.',

  /**
   * Scores answer relevance for a single RAG sample using an LLM judge.
   *
   * Presents only the question and the generated answer to the LLM judge —
   * retrieved context is intentionally excluded from this prompt so the judge
   * evaluates topicality in isolation from retrieval quality. The explicit
   * "Do NOT consider factual correctness" instruction is critical: it prevents
   * the judge from conflating answer relevance with faithfulness.
   *
   * @param input            - The RAG sample. Only `question` and `answer` are used;
   *                           `contexts` are intentionally ignored by this metric.
   * @param provider         - The LLM provider used as the judge.
   * @param includeReasoning - When `true`, the LLM's analysis is returned in
   *                           `output.reasoning`. Default: `false`.
   * @returns Promise resolving to a MetricOutput with `score` in [0, 1]
   *          and optional `reasoning` string.
   *
   * @example
   * ```typescript
   * import Anthropic from '@anthropic-ai/sdk'
   * import { answerRelevance, createAnthropicProvider } from 'rageval'
   *
   * const provider = createAnthropicProvider({
   *   client: new Anthropic(),
   *   model: 'claude-haiku-4-5-20251001',
   *   temperature: 0,
   * })
   *
   * // High relevance — answer directly addresses the question
   * const good = await answerRelevance.score(
   *   { question: 'What year was Node.js created?', answer: 'Node.js was created in 2009.', contexts: [] },
   *   provider,
   * )
   * // good.score -> ~0.95
   *
   * // Low relevance — factually correct but non-responsive to the specific question
   * const poor = await answerRelevance.score(
   *   { question: 'What year was Node.js created?', answer: 'Node.js is built on Chrome's V8 JavaScript engine.', contexts: [] },
   *   provider,
   * )
   * // poor.score -> ~0.25 (correct fact, wrong question answered)
   * ```
   */
  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    // Contexts are deliberately omitted — answer relevance is evaluated purely
    // on whether the answer addresses the question, independent of retrieval.
    // Including context risks the judge scoring retrieval quality instead of
    // answer quality, conflating two distinct dimensions of RAG performance.
    const prompt = `You are an expert evaluator assessing whether an AI-generated answer is relevant and responsive to the question asked.

QUESTION:
${input.question}

ANSWER:
${input.answer}

TASK:
Think step by step:
1. Identify what the question is specifically asking for (a fact, explanation, list, comparison, etc.).
2. Determine whether the answer directly responds to what was asked.
3. Note any gaps (missing information the question expects) or tangents (information the question didn't ask for).
4. Do NOT consider whether the answer is factually correct — only whether it is topically responsive.

Scoring rubric:
- 1.0: The answer directly and completely addresses the question — fully responsive.
- 0.75: The answer mostly addresses the question; minor gaps or tangential content present.
- 0.5: The answer partially addresses the question; notable gaps or the response drifts off-topic.
- 0.25: The answer barely addresses the question; mostly off-topic, evasive, or answers a different question.
- 0.0: The answer does not address the question at all — completely off-topic or non-responsive.
${jsonInstruction(includeReasoning)}`

    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)

    return {
      score,
      ...(includeReasoning && { reasoning }),
    }
  },
}
