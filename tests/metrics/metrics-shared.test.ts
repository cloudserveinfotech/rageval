/**
 * Shared behavior tests that apply to all metrics.
 * Verifies that every metric conforms to the Metric interface contract.
 */
import { describe, expect, it, vi } from 'vitest'

import { answerRelevance } from '../../src/metrics/answer-relevance.js'
import { contextPrecision } from '../../src/metrics/context-precision.js'
import { contextRecall } from '../../src/metrics/context-recall.js'
import { contextRelevance } from '../../src/metrics/context-relevance.js'
import { faithfulness } from '../../src/metrics/faithfulness.js'
import type { Metric } from '../../src/metrics/types.js'
import type { LlmProvider } from '../../src/providers/types.js'

const allMetrics: Metric[] = [
  faithfulness,
  contextRelevance,
  answerRelevance,
  contextRecall,
  contextPrecision,
]

const baseInput = {
  question: 'What is TypeScript?',
  answer: 'TypeScript is a typed superset of JavaScript.',
  contexts: ['TypeScript adds static typing to JavaScript. It compiles to plain JavaScript.'],
  groundTruth: 'TypeScript is a superset of JavaScript with optional static typing.',
}

function makeProvider(score = 0.8): LlmProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    complete: vi.fn().mockResolvedValue(`{"score": ${score}, "reasoning": "test reason"}`),
  }
}

describe.each(allMetrics.map((m) => ({ name: m.name, metric: m })))(
  '$name metric',
  ({ metric }) => {
    it('has a non-empty name', () => {
      expect(metric.name).toBeTruthy()
    })

    it('has a non-empty description', () => {
      expect(metric.description.length).toBeGreaterThan(10)
    })

    it('returns a score in [0, 1]', async () => {
      const provider = makeProvider(0.75)
      const result = await metric.score(baseInput, provider)
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('does not include reasoning by default', async () => {
      const provider = makeProvider(0.8)
      // contextRecall requires groundTruth for non-zero score
      const result = await metric.score(baseInput, provider, false)
      if (metric.name !== 'contextRecall' || baseInput.groundTruth) {
        // For metrics that call the LLM: reasoning should be undefined
        if ((provider.complete as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
          expect(result.reasoning).toBeUndefined()
        }
      }
    })

    it('includes reasoning when includeReasoning=true', async () => {
      const provider = makeProvider(0.8)
      const result = await metric.score(baseInput, provider, true)
      // If the LLM was called, reasoning should be present
      if ((provider.complete as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        expect(result.reasoning).toBeDefined()
        expect(typeof result.reasoning).toBe('string')
      }
    })
  },
)
