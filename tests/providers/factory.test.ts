import { describe, expect, it, vi } from 'vitest'

import { createProvider } from '../../src/providers/factory.js'

/** Minimal mock Anthropic client */
function makeAnthropicClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      }),
    },
  }
}

/** Minimal mock OpenAI client */
function makeOpenAIClient() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'ok' } }],
        }),
      },
    },
  }
}

describe('createProvider', () => {
  it('creates an anthropic provider for type "anthropic"', () => {
    const provider = createProvider({ type: 'anthropic', client: makeAnthropicClient() })
    expect(provider.name).toBe('anthropic')
  })

  it('creates an openai provider for type "openai"', () => {
    const provider = createProvider({ type: 'openai', client: makeOpenAIClient() })
    expect(provider.name).toBe('openai')
  })

  it('creates an azure provider for type "azure"', () => {
    const provider = createProvider({ type: 'azure', client: makeOpenAIClient() })
    expect(provider.name).toBe('azure')
  })

  it('passes model through to anthropic provider', () => {
    const provider = createProvider({
      type: 'anthropic',
      client: makeAnthropicClient(),
      model: 'claude-haiku-4-5-20251001',
    })
    expect(provider.model).toBe('claude-haiku-4-5-20251001')
  })

  it('passes model through to openai provider', () => {
    const provider = createProvider({
      type: 'openai',
      client: makeOpenAIClient(),
      model: 'gpt-4o-mini',
    })
    expect(provider.model).toBe('gpt-4o-mini')
  })

  it('passes model through to azure provider', () => {
    const provider = createProvider({
      type: 'azure',
      client: makeOpenAIClient(),
      model: 'gpt-4o-mini',
    })
    expect(provider.model).toBe('gpt-4o-mini')
  })

  it('anthropic provider can complete a prompt', async () => {
    const client = makeAnthropicClient()
    const provider = createProvider({ type: 'anthropic', client })
    const result = await provider.complete('test')
    expect(result).toBe('ok')
  })

  it('openai provider can complete a prompt', async () => {
    const client = makeOpenAIClient()
    const provider = createProvider({ type: 'openai', client })
    const result = await provider.complete('test')
    expect(result).toBe('ok')
  })

  it('azure provider can complete a prompt', async () => {
    const client = makeOpenAIClient()
    const provider = createProvider({ type: 'azure', client })
    const result = await provider.complete('test')
    expect(result).toBe('ok')
  })

  it('throws on unknown provider type (bypassed type system)', () => {
    // Cast to any to simulate malformed runtime input that bypasses TypeScript
    const badConfig = { type: 'gemini', client: {} } as any
    expect(() => createProvider(badConfig)).toThrow('Unknown provider type')
    expect(() => createProvider(badConfig)).toThrow('gemini')
  })
})
