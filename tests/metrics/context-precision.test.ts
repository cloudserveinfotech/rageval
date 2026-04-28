import { describe, expect, it, vi } from 'vitest'

import { contextPrecision } from '../../src/metrics/context-precision.js'
import type { LlmProvider } from '../../src/providers/types.js'

function makeProvider(response: string): LlmProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    complete: vi.fn().mockResolvedValue(response),
  }
}

const sampleInput = {
  question: 'How does RAG reduce hallucinations?',
  answer: 'RAG grounds answers in retrieved documents, reducing hallucinations.',
  contexts: [
    'RAG retrieves relevant documents before generation to ground responses.',
    'Hallucinations occur when LLMs generate facts not in their training data.',
  ],
}

describe('contextPrecision metric', () => {
  it('has name "contextPrecision"', () => {
    expect(contextPrecision.name).toBe('contextPrecision')
  })

  it('has a non-empty description', () => {
    expect(contextPrecision.description.length).toBeGreaterThan(10)
  })

  it('returns a score between 0 and 1', async () => {
    const provider = makeProvider('{"score": 0.75, "reasoning": ""}')
    const result = await contextPrecision.score(sampleInput, provider)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('calls provider exactly once', async () => {
    const provider = makeProvider('{"score": 0.8, "reasoning": ""}')
    await contextPrecision.score(sampleInput, provider)
    expect(provider.complete).toHaveBeenCalledTimes(1)
  })

  it('includes question and all contexts in the prompt', async () => {
    const provider = makeProvider('{"score": 0.8, "reasoning": ""}')
    await contextPrecision.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain(sampleInput.question)
    expect(prompt).toContain(sampleInput.contexts[0])
    expect(prompt).toContain(sampleInput.contexts[1])
  })

  it('mentions the chunk count in the prompt', async () => {
    const provider = makeProvider('{"score": 0.8, "reasoning": ""}')
    await contextPrecision.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('2')
  })

  it('omits reasoning by default', async () => {
    const provider = makeProvider('{"score": 0.6, "reasoning": "one irrelevant chunk"}')
    const result = await contextPrecision.score(sampleInput, provider, false)
    expect(result.reasoning).toBeUndefined()
  })

  it('includes reasoning when requested', async () => {
    const provider = makeProvider('{"score": 0.6, "reasoning": "one chunk is irrelevant"}')
    const result = await contextPrecision.score(sampleInput, provider, true)
    expect(result.reasoning).toBe('one chunk is irrelevant')
  })

  it('handles single context chunk correctly', async () => {
    const provider = makeProvider('{"score": 1.0, "reasoning": ""}')
    await contextPrecision.score({ ...sampleInput, contexts: ['single chunk'] }, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('1 chunk')
  })

  it('propagates provider errors', async () => {
    const provider: LlmProvider = {
      name: 'mock',
      model: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('network error')),
    }
    await expect(contextPrecision.score(sampleInput, provider)).rejects.toThrow('network error')
  })
})

describe('contextPrecision — anchor75 and anchor25 branches', () => {
  it('n=1: prompt contains anchor75 "largely relevant but not fully useful"', async () => {
    const provider = makeProvider('{"score": 0.75}')
    await contextPrecision.score({ ...sampleInput, contexts: ['single context chunk'] }, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('largely relevant but not fully useful')
  })

  it('n=1: prompt contains anchor25 "largely irrelevant but contains a small fragment"', async () => {
    const provider = makeProvider('{"score": 0.25}')
    await contextPrecision.score({ ...sampleInput, contexts: ['single context chunk'] }, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('largely irrelevant but contains a small fragment')
  })

  it('n=2: prompt contains anchor75 "Both chunks have some relevant content"', async () => {
    const provider = makeProvider('{"score": 0.75}')
    const twoChunkInput = { ...sampleInput, contexts: ['chunk A', 'chunk B'] }
    await contextPrecision.score(twoChunkInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('Both chunks have some relevant content')
  })

  it('n=2: prompt contains anchor25 "Only one chunk is slightly relevant"', async () => {
    const provider = makeProvider('{"score": 0.25}')
    const twoChunkInput = { ...sampleInput, contexts: ['chunk A', 'chunk B'] }
    await contextPrecision.score(twoChunkInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('Only one chunk is slightly relevant')
  })

  it('n>2: prompt contains fractional anchor75 (e.g. "3 of 4 chunks are relevant")', async () => {
    const provider = makeProvider('{"score": 0.75}')
    const fourChunkInput = { ...sampleInput, contexts: ['c1', 'c2', 'c3', 'c4'] }
    await contextPrecision.score(fourChunkInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('of 4 chunks are relevant')
  })
})

describe('contextPrecision — n=2 anchor branch', () => {
  it('uses "Exactly 1 of the 2 chunks is relevant" anchor when n=2', async () => {
    const provider = makeProvider('{"score": 0.5}')
    const twoChunkInput = {
      ...sampleInput,
      contexts: ['chunk one about TypeScript', 'chunk two about Python'],
    }
    await contextPrecision.score(twoChunkInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('Exactly 1 of the 2 chunks is relevant')
  })

  it('uses "About half (N of M)" anchor when n>2', async () => {
    const provider = makeProvider('{"score": 0.5}')
    const fourChunkInput = {
      ...sampleInput,
      contexts: ['chunk 1', 'chunk 2', 'chunk 3', 'chunk 4'],
    }
    await contextPrecision.score(fourChunkInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('About half')
    expect(prompt).toContain('of 4')
  })

  it('uses singular anchor for n=1 (The 1 chunk is not relevant)', async () => {
    const provider = makeProvider('{"score": 0.0}')
    await contextPrecision.score({ ...sampleInput, contexts: ['single chunk'] }, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain('The 1 chunk is not relevant')
  })
})
