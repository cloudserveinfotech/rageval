import type { LlmProvider } from '../providers/types.js'

import { jsonInstruction, parseLlmScore } from './parse.js'
import type { Metric, MetricInput, MetricOutput } from './types.js'

/**
 * **Faithfulness** — measures whether the generated answer is factually grounded
 * in the provided context (hallucination detection).
 *
 * Score 1.0 = every claim in the answer is directly supported by the retrieved context.
 * Score 0.0 = the answer is largely fabricated — major hallucinations not in the context.
 *
 * **When to use:** Run faithfulness on every evaluation. It is the single most critical
 * metric for production RAG pipelines — a high faithfulness score confirms your LLM
 * is staying within the boundaries of retrieved evidence, not inventing facts.
 *
 * **Common-knowledge exemption:** Claims any reasonable person already knows
 * (e.g. "Water boils at 100°C") do not need to appear in the context and are
 * not penalised. The metric focuses on domain-specific factual claims.
 *
 * **Score interpretation (5-point scale):**
 * - 1.0: All claims are explicitly supported — excellent, no hallucination
 * - 0.75: One or two minor claims slightly exceed the context, but overall grounded
 * - 0.5: Some claims supported; others clearly go beyond what the context states
 * - 0.25: Most claims are unsupported or contradicted by the context
 * - 0.0: Answer is substantially fabricated — severe hallucination
 *
 * Uses LLM-as-judge pattern — see arXiv:2306.05685 (RAGAS paper).
 */
export const faithfulness: Metric = {
  name: 'faithfulness',
  description:
    'Measures whether the generated answer is factually grounded in the retrieved context. Detects hallucinations.',

  /**
   * Scores faithfulness for a single RAG sample using an LLM judge.
   *
   * Uses a 5-point rubric with chain-of-thought instruction to reduce scoring
   * variance. The judge is asked to enumerate every factual claim in the answer,
   * verify each against the context, then assign a score based on the proportion
   * that are supported. This explicit decomposition improves consistency across
   * model versions compared to holistic single-step scoring.
   *
   * @param input            - The RAG sample (question, answer, contexts).
   * @param provider         - The LLM provider used as the judge.
   * @param includeReasoning - When `true`, the LLM's step-by-step analysis is
   *                           returned in `output.reasoning`. Default: `false`.
   * @returns Promise resolving to a MetricOutput with `score` in [0, 1]
   *          and optional `reasoning` string.
   *
   * @example
   * ```typescript
   * import Anthropic from '@anthropic-ai/sdk'
   * import { faithfulness, createAnthropicProvider } from 'rageval'
   *
   * const provider = createAnthropicProvider({
   *   client: new Anthropic(),
   *   model: 'claude-haiku-4-5-20251001',
   *   temperature: 0,  // set temperature: 0 for reproducible scores
   * })
   *
   * const result = await faithfulness.score(
   *   {
   *     question: 'Who founded Apple?',
   *     answer: 'Apple was co-founded by Steve Jobs and Steve Wozniak in 1976.',
   *     contexts: ['Apple Inc. was founded in 1976 by Steve Jobs, Steve Wozniak, and Ronald Wayne.'],
   *   },
   *   provider,
   *   true,  // include reasoning for debugging
   * )
   * // result.score     -> ~0.85 (minor omission of Ronald Wayne)
   * // result.reasoning -> "Claims: (1) co-founded by Jobs ✓ (2) co-founded by Wozniak ✓ (3) founded in 1976 ✓ ..."
   * ```
   */
  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    // Number each context chunk so the judge can cite them precisely
    const contextText = input.contexts.map((ctx, i) => `[Context ${i + 1}]: ${ctx}`).join('\n\n')

    // 5-point rubric + explicit chain-of-thought decomposition.
    // Claim enumeration forces the judge to reason systematically rather than
    // making a holistic guess, which reduces variance across model versions.
    const prompt = `You are an expert evaluator assessing whether an AI-generated answer is faithful to the provided context (i.e., free of hallucinations).

QUESTION:
${input.question}

CONTEXT:
${contextText}

ANSWER:
${input.answer}

TASK:
Think step by step:
1. Identify every distinct factual claim in the ANSWER.
2. For each claim, check whether it is explicitly supported by the CONTEXT.
3. Note: common knowledge claims (things universally known, e.g. "water boils at 100°C") do NOT need to appear in the context — do not penalise them.
4. Do NOT penalise rephrasing, summarising, or paraphrasing the context accurately.
5. Assign a score based on the proportion of claims that are context-supported.

Scoring rubric:
- 1.0: Every factual claim is explicitly supported by the context — no hallucination.
- 0.75: Almost all claims are supported; at most one minor claim slightly exceeds the context.
- 0.5: Some claims are clearly supported; others go meaningfully beyond what the context states.
- 0.25: Most claims lack context support; significant hallucination is present.
- 0.0: The answer is substantially fabricated — major facts directly contradict or are entirely absent from the context.
${jsonInstruction(includeReasoning)}`

    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)

    return {
      score,
      ...(includeReasoning && { reasoning }),
    }
  },
}
