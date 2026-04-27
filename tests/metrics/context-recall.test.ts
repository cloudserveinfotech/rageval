import { describe, expect, it, vi } from 'vitest'

import { contextRecall } from '../../src/metrics/context-recall.js'
import type { LlmProvider } from '../../src/providers/types.js'

function makeProvider(response: string): LlmProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    complete: vi.fn().mockResolvedValue(response),
  }
}

const sampleInput = {
  question: 'What is RAG?',
  answer: 'RAG stands for Retrieval-Augmented Generation.',
  contexts: [
    'RAG (Retrieval-Augmented Generation) combines information retrieval with language model generation.',
  ],
  groundTruth: 'RAG is Retrieval-Augmented Generation.',
}

describe('contextRecall metric', () => {
  it('has name "contextRecall"', () => {
    expect(contextRecall.name).toBe('contextRecall')
  })

  it('marks result as skipped when groundTruth is missing', async () => {
    const provider = makeProvider('{"score": 0.9}')
    const result = await contextRecall.score({ ...sampleInput, groundTruth: undefined }, provider)
    // score is 0 by convention but skipped:true signals it should be excluded from aggregates
    expect(result.score).toBe(0)
    expect(result.skipped).toBe(true)
    // Must not call the provider — no LLM cost for a skipped metric
    expect(provider.complete).not.toHaveBeenCalled()
  })

  it('does not set skipped when groundTruth is provided', async () => {
    const provider = makeProvider('{"score": 0.85}')
    const result = await contextRecall.score(sampleInput, provider)
    expect(result.skipped).toBeUndefined()
    expect(result.score).toBeCloseTo(0.85)
  })

  it('returns reasoning note when groundTruth is missing and includeReasoning=true', async () => {
    const provider = makeProvider('{"score": 0.9}')
    const result = await contextRecall.score(
      { ...sampleInput, groundTruth: undefined },
      provider,
      true,
    )
    expect(result.reasoning).toContain('groundTruth')
    expect(result.skipped).toBe(true)
  })

  it('evaluates normally when groundTruth is provided', async () => {
    const provider = makeProvider('{"score": 0.85}')
    const result = await contextRecall.score(sampleInput, provider)
    expect(result.score).toBeCloseTo(0.85)
    expect(provider.complete).toHaveBeenCalledTimes(1)
  })

  it('includes groundTruth in the prompt', async () => {
    const provider = makeProvider('{"score": 0.9}')
    await contextRecall.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain(sampleInput.groundTruth)
  })

  it('does not include reasoning when includeReasoning=false', async () => {
    const provider = makeProvider('{"score": 0.8}')
    const result = await contextRecall.score(sampleInput, provider, false)
    expect(result.reasoning).toBeUndefined()
  })

  it('includes reasoning when includeReasoning=true', async () => {
    const provider = makeProvider('{"score": 0.8, "reasoning": "found all info"}')
    const result = await contextRecall.score(sampleInput, provider, true)
    expect(result.reasoning).toBe('found all info')
  })
})
