import { describe, expect, it, vi } from 'vitest'

import { answerRelevance } from '../../src/metrics/answer-relevance.js'
import type { LlmProvider } from '../../src/providers/types.js'

function makeProvider(response: string): LlmProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    complete: vi.fn().mockResolvedValue(response),
  }
}

const sampleInput = {
  question: 'What is TypeScript?',
  answer: 'TypeScript is a typed superset of JavaScript that compiles to plain JS.',
  contexts: ['TypeScript adds static typing to JavaScript.'],
}

describe('answerRelevance metric', () => {
  it('has name "answerRelevance"', () => {
    expect(answerRelevance.name).toBe('answerRelevance')
  })

  it('has a non-empty description', () => {
    expect(answerRelevance.description.length).toBeGreaterThan(10)
  })

  it('returns a score between 0 and 1', async () => {
    const provider = makeProvider('{"score": 0.95, "reasoning": ""}')
    const result = await answerRelevance.score(sampleInput, provider)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('calls provider exactly once', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await answerRelevance.score(sampleInput, provider)
    expect(provider.complete).toHaveBeenCalledTimes(1)
  })

  it('includes question and answer in the prompt', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await answerRelevance.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(prompt).toContain(sampleInput.question)
    expect(prompt).toContain(sampleInput.answer)
  })

  it('does NOT include contexts in the prompt (relevance only checks Q+A)', async () => {
    const provider = makeProvider('{"score": 0.9, "reasoning": ""}')
    await answerRelevance.score(sampleInput, provider)
    const prompt = (provider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    // answerRelevance only judges question vs answer, not context
    expect(prompt).not.toContain('[Context 1]:')
  })

  it('omits reasoning by default', async () => {
    const provider = makeProvider('{"score": 0.85, "reasoning": "on-topic"}')
    const result = await answerRelevance.score(sampleInput, provider, false)
    expect(result.reasoning).toBeUndefined()
  })

  it('includes reasoning when requested', async () => {
    const provider = makeProvider('{"score": 0.85, "reasoning": "directly answers the question"}')
    const result = await answerRelevance.score(sampleInput, provider, true)
    expect(result.reasoning).toBe('directly answers the question')
  })

  it('propagates provider errors', async () => {
    const provider: LlmProvider = {
      name: 'mock',
      model: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('rate limit')),
    }
    await expect(answerRelevance.score(sampleInput, provider)).rejects.toThrow('rate limit')
  })
})
