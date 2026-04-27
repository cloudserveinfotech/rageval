import type { LlmProvider } from '../providers/types.js'

import { jsonInstruction, parseLlmScore } from './parse.js'
import type { Metric, MetricInput, MetricOutput } from './types.js'

/**
 * **Context Recall** — measures whether the retrieved context contains the
 * information needed to produce the ground truth answer.
 *
 * Score 1.0 = the context contains all information needed for the ground truth.
 * Score 0.0 = the context is missing the key information from the ground truth.
 *
 * **Requires `groundTruth` in the sample.** Samples without `groundTruth` are
 * automatically skipped (`skipped: true`) and excluded from the aggregate —
 * they do not contribute a score of 0. A warning is printed to stderr when
 * contextRecall is in your metrics but no samples have `groundTruth`.
 *
 * **When to use:** Use contextRecall to verify that your retriever is actually
 * returning the documents needed to construct the correct answer. A low recall
 * score means your retriever is missing key source material — the LLM cannot
 * generate a correct answer even if it tries.
 *
 * **Difference from contextRelevance/contextPrecision:** Those ask "is the
 * retrieved content relevant to the question?" — recall asks a harder, more
 * specific question: "does the retrieved content contain what is needed for
 * the specific correct answer?" It requires knowing the expected answer.
 *
 * **Score interpretation (5-point scale):**
 * - 1.0: Context contains all key facts needed for the ground truth — complete recall
 * - 0.75: Context contains most needed information; one minor fact may be missing
 * - 0.5: Context contains some needed facts but is missing important components
 * - 0.25: Context contains only minor signals relevant to the ground truth
 * - 0.0: Context does not contain the information needed to derive the ground truth
 *
 * Uses LLM-as-judge pattern — see arXiv:2306.05685 (RAGAS paper).
 */
export const contextRecall: Metric = {
  name: 'contextRecall',
  description:
    'Measures whether the retrieved context contains the information needed to produce the ground truth answer. Requires groundTruth.',

  /**
   * Scores context recall for a single RAG sample using an LLM judge.
   *
   * If `groundTruth` is absent, immediately returns `{ score: 0, skipped: true }`
   * without making any LLM call. The `evaluate()` orchestrator sees `skipped: true`
   * and excludes this result from sample scores and aggregate calculations.
   *
   * When `groundTruth` is present, constructs a prompt that decomposes the ground
   * truth into individual claims, then checks each claim's presence in the context.
   * This claim-level decomposition is more reliable than holistic scoring because
   * it prevents the judge from averaging over partially recalled information.
   *
   * @param input            - The RAG sample. `groundTruth` is required for a
   *                           meaningful score; omitting it causes an automatic skip.
   * @param provider         - The LLM provider used as the judge.
   * @param includeReasoning - When `true`, the LLM's analysis is returned in
   *                           `output.reasoning`. Default: `false`.
   * @returns Promise resolving to a MetricOutput with `score` in [0, 1],
   *          optional `reasoning`, and `skipped: true` when groundTruth is absent.
   *
   * @example
   * ```typescript
   * import Anthropic from '@anthropic-ai/sdk'
   * import { contextRecall, createAnthropicProvider } from 'rageval'
   *
   * const provider = createAnthropicProvider({
   *   client: new Anthropic(),
   *   model: 'claude-haiku-4-5-20251001',
   *   temperature: 0,
   * })
   *
   * // With groundTruth — metric runs normally
   * const result = await contextRecall.score(
   *   {
   *     question: 'When was the Eiffel Tower built?',
   *     answer: 'The Eiffel Tower was built in 1889.',
   *     contexts: ['The Eiffel Tower was constructed between 1887 and 1889 as the entrance arch for the 1889 World's Fair.'],
   *     groundTruth: 'The Eiffel Tower was built between 1887 and 1889.',
   *   },
   *   provider,
   * )
   * // result.score   -> ~0.95 (context fully supports the ground truth dates)
   * // result.skipped -> undefined
   *
   * // Without groundTruth — metric is automatically skipped
   * const skipped = await contextRecall.score(
   *   { question: '...', answer: '...', contexts: ['...'] },
   *   provider,
   * )
   * // skipped.score   -> 0
   * // skipped.skipped -> true  (excluded from aggregates by evaluate())
   * ```
   */
  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    // Early exit when groundTruth is absent — cannot evaluate recall without
    // a reference answer. Return skipped: true so evaluate() excludes this from
    // aggregates rather than counting it as a 0 score (which would silently
    // drag down overall quality scores for samples without labelled answers).
    if (!input.groundTruth) {
      return {
        score: 0,
        skipped: true,
        ...(includeReasoning && {
          reasoning:
            'contextRecall requires a groundTruth value. This sample was excluded from aggregates.',
        }),
      }
    }

    // Number each context chunk so the judge can cite them precisely
    const contextText = input.contexts.map((ctx, i) => `[Context ${i + 1}]: ${ctx}`).join('\n\n')

    // 5-point rubric with claim-decomposition instruction.
    // Decomposing the ground truth into individual claims before checking
    // each against the context prevents the judge from averaging over
    // partial information — a key source of scoring variance in recall metrics.
    const prompt = `You are an expert evaluator assessing whether retrieved context contains the information needed to produce a reference answer.

QUESTION:
${input.question}

GROUND TRUTH ANSWER:
${input.groundTruth}

RETRIEVED CONTEXT:
${contextText}

TASK:
Think step by step:
1. Decompose the GROUND TRUTH ANSWER into its individual factual claims or key pieces of information.
2. For each claim, check whether it can be inferred from the RETRIEVED CONTEXT.
3. Do NOT evaluate whether the retrieved answer is correct — only whether the information is present in the context.
4. Compute the proportion of ground truth claims that are supported by the context.

Scoring rubric:
- 1.0: All key facts in the ground truth are present in the context — complete recall.
- 0.75: Nearly all ground truth facts are in the context; at most one minor detail is absent.
- 0.5: Some ground truth facts are in the context; others are notably missing.
- 0.25: Only a small fraction of ground truth facts appear in the context.
- 0.0: The context does not contain the information needed to derive the ground truth answer.
${jsonInstruction(includeReasoning)}`

    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)

    return {
      score,
      ...(includeReasoning && { reasoning }),
    }
  },
}
