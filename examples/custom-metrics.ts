/**
 * Custom Metrics Example — rageval
 *
 * Shows how to build a custom metric that implements the Metric interface.
 * You can create domain-specific metrics tailored to your use case.
 *
 * Run: OPENAI_API_KEY=sk-... npx tsx examples/custom-metrics.ts
 */

import OpenAI from 'openai'

import { evaluate } from '../src/evaluate.js'
import { jsonInstruction, parseLlmScore } from '../src/metrics/parse.js'
import type { Metric, MetricInput, MetricOutput } from '../src/metrics/types.js'
import type { LlmProvider } from '../src/providers/types.js'

/**
 * Custom metric: Citation Quality
 *
 * Evaluates whether the answer accurately represents the source material.
 * This is a domain-specific metric not included in the standard 5.
 */
const citationQuality: Metric = {
  name: 'citationQuality', // Custom name — must be unique within one evaluate() call
  description: 'Evaluates whether the answer accurately represents the retrieved source material.',

  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    const contextText = input.contexts.map((ctx, i) => `[Source ${i + 1}]: ${ctx}`).join('\n\n')

    const prompt = `You are evaluating whether an AI answer accurately represents its source context.

QUESTION: ${input.question}

SOURCES:
${contextText}

ANSWER: ${input.answer}

Does the answer accurately represent the source material without distortion?
- Score 1.0: Answer perfectly represents what the sources say.
- Score 0.5: Mostly accurate but slightly misrepresents one point.
- Score 0.0: Significantly distorts or misrepresents the sources.
${jsonInstruction(includeReasoning)}`

    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)
    return { score, ...(includeReasoning && { reasoning }) }
  },
}

// Run the evaluation with OpenAI
const openaiClient = new OpenAI()

const results = await evaluate({
  provider: {
    type: 'openai',
    client: openaiClient,
    model: 'gpt-4o-mini',
  },
  dataset: [
    {
      question: 'What are the benefits of TypeScript?',
      answer:
        'TypeScript provides static typing, better IDE support, and helps catch errors at compile time.',
      contexts: [
        'TypeScript adds optional static typing to JavaScript, enabling better tooling support, autocompletion, and refactoring.',
        'A key advantage of TypeScript is catching type errors during development rather than at runtime.',
      ],
    },
  ],
  metrics: [citationQuality],
  includeReasoning: true,
})

console.log('\n=== Custom Metric Results ===')
console.log(JSON.stringify(results, null, 2))
