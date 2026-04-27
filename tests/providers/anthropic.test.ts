import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAnthropicProvider } from '../../src/providers/anthropic.js'

function makeMockClient(text: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text }],
      }),
    },
  }
}

describe('createAnthropicProvider', () => {
  it('returns a provider with name "anthropic"', () => {
    const client = makeMockClient('hello')
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    expect(provider.name).toBe('anthropic')
  })

  it('uses the default model claude-opus-4-6', () => {
    const client = makeMockClient('hello')
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    expect(provider.model).toBe('claude-opus-4-6')
  })

  it('uses a custom model when provided', () => {
    const client = makeMockClient('hello')
    const provider = createAnthropicProvider({
      type: 'anthropic',
      client,
      model: 'claude-haiku-4-5-20251001',
    })
    expect(provider.model).toBe('claude-haiku-4-5-20251001')
  })

  it('calls client.messages.create with correct parameters', async () => {
    const client = makeMockClient('test response')
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    await provider.complete('test prompt')

    expect(client.messages.create).toHaveBeenCalledWith(
      {
        model: 'claude-opus-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: 'test prompt' }],
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('uses custom maxTokens', async () => {
    const client = makeMockClient('ok')
    const provider = createAnthropicProvider({
      type: 'anthropic',
      client,
      maxTokens: 512,
    })
    await provider.complete('prompt')
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 512 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns the text from the response', async () => {
    const client = makeMockClient('score: 0.9')
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    const result = await provider.complete('prompt')
    expect(result).toBe('score: 0.9')
  })

  it('throws when response has no text content', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'image' }],
        }),
      },
    }
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    await expect(provider.complete('prompt')).rejects.toThrow('no text content')
  })

  it('throws when content array is empty', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [] }),
      },
    }
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    await expect(provider.complete('prompt')).rejects.toThrow('no text content')
  })

  it('propagates client errors', async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('API rate limit')),
      },
    }
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    await expect(provider.complete('prompt')).rejects.toThrow('API rate limit')
  })
})

describe('createAnthropicProvider — retry behaviour', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] })

    const client = { messages: { create } }
    vi.useFakeTimers()
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 1 })

    const promise = provider.complete('prompt')
    // Advance all timers so the exponential back-off sleep resolves
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('ok')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retries on 500-range errors', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 503 }))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'recovered' }] })

    const client = { messages: { create } }
    vi.useFakeTimers()
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 1 })

    const promise = provider.complete('prompt')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('recovered')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retries on 529 (Anthropic overloaded)', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('overloaded'), { status: 529 }))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'done' }] })

    const client = { messages: { create } }
    vi.useFakeTimers()
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 1 })

    const promise = provider.complete('prompt')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('done')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 401 (auth failure) — fails immediately', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }))

    const client = { messages: { create } }
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 3 })

    await expect(provider.complete('prompt')).rejects.toThrow('Unauthorized')
    // Must not retry — exactly one attempt
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on 400 (bad request) — fails immediately', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Bad Request'), { status: 400 }))

    const client = { messages: { create } }
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 3 })

    await expect(provider.complete('prompt')).rejects.toThrow('Bad Request')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('exhausts all retries and throws with attempt count in message', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }))

    const client = { messages: { create } }
    vi.useFakeTimers()
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 2 })

    // Attach .catch() before running timers so the rejection is handled
    // before Vitest's unhandledRejection hook can fire.
    let caughtError: Error | undefined
    const settled = provider.complete('prompt').catch((e: unknown) => {
      caughtError = e as Error
    })
    await vi.runAllTimersAsync()
    await settled

    expect(caughtError?.message).toContain('3 attempt(s)')
    // retries=2 → 1 initial + 2 retries = 3 total calls
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('retries on network-level "connection" errors (string match path)', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'reconnected' }] })

    const client = { messages: { create } }
    vi.useFakeTimers()
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 1 })

    const promise = provider.complete('prompt')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('reconnected')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('includes model name in error message when all retries fail', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }))

    const client = { messages: { create } }
    const provider = createAnthropicProvider({
      type: 'anthropic',
      client,
      model: 'claude-haiku-4-5-20251001',
      retries: 0,
    })

    await expect(provider.complete('prompt')).rejects.toThrow('claude-haiku-4-5-20251001')
  })
})

describe('createAnthropicProvider — additional branch coverage', () => {
  it('passes temperature to client when specified', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
      },
    }
    const provider = createAnthropicProvider({ type: 'anthropic', client, temperature: 0.5 })
    await provider.complete('prompt')
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.5 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('does not include temperature key when not specified', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
      },
    }
    const provider = createAnthropicProvider({ type: 'anthropic', client })
    await provider.complete('prompt')
    const call = client.messages.create.mock.calls[0][0] as Record<string, unknown>
    expect(call).not.toHaveProperty('temperature')
  })

  it('does NOT retry when error is not an Error instance and has no status (isRetryable returns false)', async () => {
    // Throwing a plain string — no status, not instanceof Error → isRetryable returns false
    const create = vi.fn().mockRejectedValue('plain string error')
    const client = { messages: { create } }
    const provider = createAnthropicProvider({ type: 'anthropic', client, retries: 3 })
    await expect(provider.complete('prompt')).rejects.toBeDefined()
    // Must not retry — exactly one attempt (isRetryable=false path)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('wraps non-Error lastError in cause message as String()', async () => {
    // Throw a plain object with status=429 so it retries, but after all retries,
    // the lastError is NOT instanceof Error → String(lastError) path in error message
    const nonError = { status: 429, toString: () => 'plain-object-error' }
    const create = vi.fn().mockRejectedValue(nonError)
    const client = { messages: { create } }
    vi.useFakeTimers()

    let caughtError: Error | undefined
    const settled = createAnthropicProvider({ type: 'anthropic', client, retries: 1 })
      .complete('prompt')
      .catch((e: unknown) => {
        caughtError = e as Error
      })

    await vi.runAllTimersAsync()
    await settled
    vi.useRealTimers()

    expect(caughtError?.message).toContain('plain-object-error')
    expect(caughtError?.message).toContain('2 attempt(s)')
  })

  it('aborts the pending request when the 60s timeout fires (covers setTimeout abort callback)', async () => {
    // Mock a never-resolving create() that only rejects when the AbortSignal fires.
    // Advancing fake timers past TIMEOUT_MS triggers the setTimeout callback,
    // which calls controller.abort() — this is the only path that exercises the
    // anonymous setTimeout callback function in production code.
    vi.useFakeTimers()
    const create = vi.fn().mockImplementation(
      (_: unknown, opts: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new Error('Request aborted by client'))
          })
        }),
    )
    const client = { messages: { create } }

    let caughtError: Error | undefined
    const settled = createAnthropicProvider({ type: 'anthropic', client, retries: 0 })
      .complete('prompt')
      .catch((e: unknown) => {
        caughtError = e as Error
      })

    // Advance past the 60-second TIMEOUT_MS so the setTimeout callback fires.
    await vi.advanceTimersByTimeAsync(60_001)
    await settled
    vi.useRealTimers()

    expect(caughtError?.message).toContain('Anthropic provider failed')
    expect(caughtError?.message).toContain('Request aborted by client')
    expect(create).toHaveBeenCalledTimes(1)
  })
})
