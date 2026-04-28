import { describe, expect, it, vi } from 'vitest'

import { createAzureOpenAIProvider } from '../../src/providers/azure.js'

function makeMockClient(text: string | null) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: text } }],
        }),
      },
    },
  }
}

describe('createAzureOpenAIProvider', () => {
  it('returns a provider with name "azure"', () => {
    const client = makeMockClient('hello')
    const provider = createAzureOpenAIProvider({ type: 'azure', client })
    expect(provider.name).toBe('azure')
  })

  it('uses the default model gpt-4o', () => {
    const client = makeMockClient('hello')
    const provider = createAzureOpenAIProvider({ type: 'azure', client })
    expect(provider.model).toBe('gpt-4o')
  })

  it('uses a custom model when provided', () => {
    const client = makeMockClient('hello')
    const provider = createAzureOpenAIProvider({
      type: 'azure',
      client,
      model: 'gpt-4o-mini',
    })
    expect(provider.model).toBe('gpt-4o-mini')
  })

  it('calls client.chat.completions.create with correct parameters', async () => {
    const client = makeMockClient('test response')
    const provider = createAzureOpenAIProvider({ type: 'azure', client })
    await provider.complete('test prompt')

    expect(client.chat.completions.create).toHaveBeenCalledWith(
      {
        model: 'gpt-4o',
        max_tokens: 2048,
        messages: [{ role: 'user', content: 'test prompt' }],
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('uses custom maxTokens', async () => {
    const client = makeMockClient('ok')
    const provider = createAzureOpenAIProvider({
      type: 'azure',
      client,
      maxTokens: 512,
    })
    await provider.complete('prompt')
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 512 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('passes temperature when provided', async () => {
    const client = makeMockClient('ok')
    const provider = createAzureOpenAIProvider({
      type: 'azure',
      client,
      temperature: 0,
    })
    await provider.complete('prompt')
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('does not pass temperature when not set', async () => {
    const client = makeMockClient('ok')
    const provider = createAzureOpenAIProvider({ type: 'azure', client })
    await provider.complete('prompt')
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ temperature: expect.anything() }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns the text content from the response', async () => {
    const client = makeMockClient('{"score": 0.91}')
    const provider = createAzureOpenAIProvider({ type: 'azure', client })
    const result = await provider.complete('prompt')
    expect(result).toBe('{"score": 0.91}')
  })

  it('throws when response content is null', async () => {
    const client = makeMockClient(null)
    const provider = createAzureOpenAIProvider({ type: 'azure', client })
    await expect(provider.complete('prompt')).rejects.toThrow('no text content')
  })

  it('retries on transient errors and eventually succeeds', async () => {
    const client = {
      chat: {
        completions: {
          create: vi
            .fn()
            .mockRejectedValueOnce({ status: 429 })
            .mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] }),
        },
      },
    }
    const provider = createAzureOpenAIProvider({
      type: 'azure',
      client,
      retries: 2,
    })
    const result = await provider.complete('prompt')
    expect(result).toBe('ok')
    expect(client.chat.completions.create).toHaveBeenCalledTimes(2)
  })

  it('throws after all retries exhausted', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({ status: 500 }),
        },
      },
    }
    const provider = createAzureOpenAIProvider({
      type: 'azure',
      client,
      retries: 1,
    })
    await expect(provider.complete('prompt')).rejects.toThrow(
      'Azure OpenAI provider failed after 2 attempt(s)',
    )
  })

  it('does NOT retry on non-retryable errors (e.g. 401) — fails immediately', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }))
    const client = { chat: { completions: { create } } }
    const provider = createAzureOpenAIProvider({ type: 'azure', client, retries: 3 })
    // Error bubbles through as the cause — message includes the original error text
    await expect(provider.complete('prompt')).rejects.toThrow('Unauthorized')
    // Should only have been called once — no retry on auth failures
    expect(create).toHaveBeenCalledTimes(1)
  })
})
describe('createAzureOpenAIProvider — isRetryable edge cases', () => {
  it('does not retry when error is a plain string (not an Error instance)', async () => {
    // A thrown string is not an Error instance and has no .status property.
    // isRetryable returns false → error propagates immediately without retry.
    const create = vi.fn().mockRejectedValue('network failure')
    const client = { chat: { completions: { create } } }
    const provider = createAzureOpenAIProvider({ type: 'azure', client, retries: 3 })
    await expect(provider.complete('prompt')).rejects.toThrow('network failure')
    // No retries — called exactly once
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('aborts the request and retries after timeout (covers abort callback)', async () => {
    vi.useFakeTimers()
    // Client hangs forever but aborts when signal fires
    const create = vi.fn().mockImplementation(
      (_params: unknown, opts: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const client = { chat: { completions: { create } } }
    const provider = createAzureOpenAIProvider({ type: 'azure', client, retries: 0 })
    const p = provider.complete('prompt')
    // Register rejection handler BEFORE advancing timers to prevent unhandled-rejection noise
    const assertion = expect(p).rejects.toThrow('Azure OpenAI provider failed after 1 attempt(s)')
    // Advance past the 60-second timeout — fires the () => controller.abort() callback
    await vi.advanceTimersByTimeAsync(61_000)
    await assertion
    vi.useRealTimers()
  })
})
