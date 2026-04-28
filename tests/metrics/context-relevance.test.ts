import { describe, expect, it, vi } from 'vitest'

import { contextRelevance } from '../../src/metrics/context-relevance.js'
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
  answer: 'Paris is the capital of France.',
  contexts: ['France is a country in Western Europe. Its capital city is Paris.'],
}

describe('contextRelevance metric', () => {
  it('has name "contextRelevance"', () => {
    expect(contextRelevance.name).toBe('contextRelevance')
  })

  it('has a non-empty description', () => {
    expect(contextRelevance.description.length).toBeGreaterThan(10)
  })

  it('returns a score between 0 and 1', async () => {
    const provider = makeProvider('{"score": 0.88, "reasoning": ""}')
    const result = await contextRelevance.score(sampleInput, provider)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('calls provider exactly once', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await contextRelevance.score(sampleInput, provider)
    expect(provider.complete).toHaveBeenCalledTimes(1)
  })

  it('includes question and contexts in the prompt', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await contextRelevance.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain(sampleInput.question)
    expect(prompt).toContain(sampleInput.contexts[0])
  })

  it('labels multiple contexts', async () => {
    const provider = makeProvider('{"score": 0.7, "reasoning": ""}')
    await contextRelevance.score({ ...sampleInput, contexts: ['ctx A', 'ctx B'] }, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('[Context 1]:')
    expect(prompt).toContain('[Context 2]:')
  })

  it('omits reasoning by default', async () => {
    const provider = makeProvider('{"score": 0.8, "reasoning": "relevant"}')
    const result = await contextRelevance.score(sampleInput, provider, false)
    expect(result.reasoning).toBeUndefined()
  })

  it('includes reasoning when requested', async () => {
    const provider = makeProvider('{"score": 0.8, "reasoning": "relevant context"}')
    const result = await contextRelevance.score(sampleInput, provider, true)
    expect(result.reasoning).toBe('relevant context')
  })

  it('propagates provider errors', async () => {
    const provider: LlmProvider = {
      name: 'mock',
      model: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('timeout')),
    }
    await expect(contextRelevance.score(sampleInput, provider)).rejects.toThrow('timeout')
  })
})
