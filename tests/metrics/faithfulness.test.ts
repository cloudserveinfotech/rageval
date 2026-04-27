import { describe, expect, it, vi } from 'vitest'

import { faithfulness } from '../../src/metrics/faithfulness.js'
import type { LlmProvider } from '../../src/providers/types.js'

function makeProvider(response: string): LlmProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    complete: vi.fn().mockResolvedValue(response),
  }
}

const sampleInput = {
  question: 'What is the capital of France?',
  answer: 'The capital of France is Paris.',
  contexts: ['France is a country in Western Europe. Its capital city is Paris.'],
}

describe('faithfulness metric', () => {
  it('has name "faithfulness"', () => {
    expect(faithfulness.name).toBe('faithfulness')
  })

  it('has a non-empty description', () => {
    expect(faithfulness.description.length).toBeGreaterThan(10)
  })

  it('returns a score between 0 and 1', async () => {
    const provider = makeProvider('{"score": 0.95, "reasoning": ""}')
    const result = await faithfulness.score(sampleInput, provider)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('calls provider.complete exactly once', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await faithfulness.score(sampleInput, provider)
    expect(provider.complete).toHaveBeenCalledTimes(1)
  })

  it('includes context in the prompt', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await faithfulness.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain(sampleInput.contexts[0])
  })

  it('includes question and answer in the prompt', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await faithfulness.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain(sampleInput.question)
    expect(prompt).toContain(sampleInput.answer)
  })

  it('does NOT include reasoning when includeReasoning is false', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": "good"}')
    const result = await faithfulness.score(sampleInput, provider, false)
    expect(result.reasoning).toBeUndefined()
  })

  it('includes reasoning when includeReasoning is true', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": "good answer"}')
    const result = await faithfulness.score(sampleInput, provider, true)
    expect(result.reasoning).toBe('good answer')
  })

  it('handles multiple contexts by labelling them', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    const multiContextInput = {
      ...sampleInput,
      contexts: ['Context A', 'Context B'],
    }
    await faithfulness.score(multiContextInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('[Context 1]:')
    expect(prompt).toContain('[Context 2]:')
  })

  it('propagates LLM errors', async () => {
    const provider: LlmProvider = {
      name: 'mock',
      model: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    }
    await expect(faithfulness.score(sampleInput, provider)).rejects.toThrow('LLM unavailable')
  })
})
