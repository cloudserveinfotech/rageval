import { afterEach, describe, expect, it, vi } from 'vitest'

import { createOpenAIProvider } from '../../src/providers/openai.js'

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

describe('createOpenAIProvider', () => {
  it('returns a provider with name "openai"', () => {
    const client = makeMockClient('hello')
    const provider = createOpenAIProvider({ type: 'openai', client })
    expect(provider.name).toBe('openai')
  })

  it('uses the default model gpt-4o', () => {
    const client = makeMockClient('hello')
    const provider = createOpenAIProvider({ type: 'openai', client })
    expect(provider.model).toBe('gpt-4o')
  })

  it('uses a custom model when provided', () => {
    const client = makeMockClient('hello')
    const provider = createOpenAIProvider({
      type: 'openai',
      client,
      model: 'gpt-4o-mini',
    })
    expect(provider.model).toBe('gpt-4o-mini')
  })

  it('calls client.chat.completions.create with correct parameters', async () => {
    const client = makeMockClient('test response')
    const provider = createOpenAIProvider({ type: 'openai', client })
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
    const provider = createOpenAIProvider({
      type: 'openai',
      client,
      maxTokens: 256,
    })
    await provider.complete('prompt')
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 256 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns the text content from the response', async () => {
    const client = makeMockClient('{"score": 0.95, "reasoning": ""}')
    const provider = createOpenAIProvider({ type: 'openai', client })
    const result = await provider.complete('prompt')
    expect(result).toBe('{"score": 0.95, "reasoning": ""}')
  })

  it('throws when response content is null', async () => {
    const client = makeMockClient(null)
    const provider = createOpenAIProvider({ type: 'openai', client })
    await expect(provider.complete('prompt')).rejects.toThrow('no text content')
  })

  it('throws when choices array is empty', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [] }),
        },
      },
    }
    const provider = createOpenAIProvider({ type: 'openai', client })
    await expect(provider.complete('prompt')).rejects.toThrow('no text content')
  })

  it('propagates client errors', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('Connection timeout')),
        },
      },
    }
    const provider = createOpenAIProvider({ type: 'openai', client })
    await expect(provider.complete('prompt')).rejects.toThrow('Connection timeout')
  })
})

describe('createOpenAIProvider — retry behaviour', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] })

    const client = { chat: { completions: { create } } }
    vi.useFakeTimers()
    const provider = createOpenAIProvider({ type: 'openai', client, retries: 1 })

    const promise = provider.complete('prompt')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('ok')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retries on 500-range errors', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 502 }))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'recovered' } }] })

    const client = { chat: { completions: { create } } }
    vi.useFakeTimers()
    const provider = createOpenAIProvider({ type: 'openai', client, retries: 1 })

    const promise = provider.complete('prompt')
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toBe('recovered')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry on 401 (auth failure) — fails immediately', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }))

    const client = { chat: { completions: { create } } }
    const provider = createOpenAIProvider({ type: 'openai', client, retries: 3 })

    await expect(provider.complete('prompt')).rejects.toThrow('Unauthorized')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on 403 (forbidden) — fails immediately', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))

    const client = { chat: { completions: { create } } }
    const provider = createOpenAIProvider({ type: 'openai', client, retries: 3 })

    await expect(provider.complete('prompt')).rejects.toThrow('Forbidden')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('exhausts all retries and throws with attempt count in message', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }))

    const client = { chat: { completions: { create } } }
    vi.useFakeTimers()
    const provider = createOpenAIProvider({ type: 'openai', client, retries: 2 })

    // Attach .catch() before running timers so the rejection is handled
    // before Vitest's unhandledRejection hook can fire.
    let caughtError: Error | undefined
    const settled = provider.complete('prompt').catch((e: unknown) => {
      caughtError = e as Error
    })
    await vi.runAllTimersAsync()
    await settled

    expect(caughtError?.message).toContain('3 attempt(s)')
    expect(create).toHaveBeenCalledTimes(3)
  })

  it('retries on network-level timeout errors (string match path)', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection timeout'))
      .mockResolvedValueOnce({ choices: [{ message: { content: 'reconnected' } }] })

    const client = { chat: { completions: { create } } }
    vi.useFakeTimers()
    const provider = createOpenAIProvider({ type: 'openai', client, retries: 1 })

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

    const client = { chat: { completions: { create } } }
    const provider = createOpenAIProvider({
      type: 'openai',
      client,
      model: 'gpt-4o-mini',
      retries: 0,
    })

    await expect(provider.complete('prompt')).rejects.toThrow('gpt-4o-mini')
  })
})

describe('createOpenAIProvider — additional branch coverage', () => {
  it('passes temperature to client when specified', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'ok' } }],
          }),
        },
      },
    }
    const provider = createOpenAIProvider({ type: 'openai', client, temperature: 0.7 })
    await provider.complete('prompt')
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('does not include temperature key when not specified', async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'ok' } }],
          }),
        },
      },
    }
    const provider = createOpenAIProvider({ type: 'openai', client })
    await provider.complete('prompt')
    const call = client.chat.completions.create.mock.calls[0][0] as Record<string, unknown>
    expect(call).not.toHaveProperty('temperature')
  })

  it('does NOT retry when error is not an Error instance and has no status', async () => {
    const create = vi.fn().mockRejectedValue('plain string error')
    const client = { chat: { completions: { create } } }
    const provider = createOpenAIProvider({ type: 'openai', client, retries: 3 })
    await expect(provider.complete('prompt')).rejects.toBeDefined()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('wraps non-Error lastError using String() in the final thrown error', async () => {
    const nonError = { status: 429, toString: () => 'plain-openai-error' }
    const create = vi.fn().mockRejectedValue(nonError)
    const client = { chat: { completions: { create } } }
    vi.useFakeTimers()

    let caughtError: Error | undefined
    const settled = createOpenAIProvider({ type: 'openai', client, retries: 1 })
      .complete('prompt')
      .catch((e: unknown) => {
        caughtError = e as Error
      })

    await vi.runAllTimersAsync()
    await settled
    vi.useRealTimers()

    expect(caughtError?.message).toContain('plain-openai-error')
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
    const client = { chat: { completions: { create } } }

    let caughtError: Error | undefined
    const settled = createOpenAIProvider({ type: 'openai', client, retries: 0 })
      .complete('prompt')
      .catch((e: unknown) => {
        caughtError = e as Error
      })

    // Advance past the 60-second TIMEOUT_MS so the setTimeout callback fires.
    await vi.advanceTimersByTimeAsync(60_001)
    await settled
    vi.useRealTimers()

    expect(caughtError?.message).toContain('OpenAI provider failed')
    expect(caughtError?.message).toContain('Request aborted by client')
    expect(create).toHaveBeenCalledTimes(1)
  })
})
