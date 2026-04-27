import type { LlmProvider, OpenAIProviderConfig } from './types.js'

const DEFAULT_RETRIES = 2
const BASE_DELAY_MS = 500
const TIMEOUT_MS = 60_000

/**
 * Determines whether an error from the OpenAI SDK is transient and safe to retry.
 *
 * The OpenAI SDK throws `APIError` instances with a `.status` HTTP status code.
 * We check `.status` first (typed, reliable), then fall back to string matching
 * for network-level errors that don't carry a status code.
 *
 * Retryable: 429 (rate limit), 500/502/503/504 (server errors).
 * Non-retryable: 400 (bad request), 401 (auth), 403 (forbidden), 404 (not found).
 */
function isRetryable(error: unknown): boolean {
  // Check for SDK-typed errors with a numeric .status property (most reliable)
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as Record<string, unknown>)['status'] === 'number'
  ) {
    const status = (error as { status: number }).status
    return status === 429 || (status >= 500 && status <= 504)
  }

  // Fall back to string matching for network-level errors (no status code)
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes('rate limit') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused')
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates an OpenAI LLM provider for use with {@link evaluate}.
 *
 * Automatically retries transient errors (rate limits, server errors) with
 * exponential back-off. The retry logic checks the SDK's typed `.status`
 * property before falling back to string matching.
 *
 * @param config - Provider configuration including the OpenAI client instance.
 * @returns An {@link LlmProvider} ready to be passed to `evaluate()`.
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai'
 * import { createOpenAIProvider, evaluate } from 'rageval'
 *
 * const provider = createOpenAIProvider({
 *   type: 'openai',
 *   client: new OpenAI(),
 *   model: 'gpt-4o',
 *   temperature: 0,   // recommended for reproducible evaluation
 *   retries: 3,
 * })
 * ```
 */
export function createOpenAIProvider(config: OpenAIProviderConfig): LlmProvider {
  const model = config.model ?? 'gpt-4o'
  // 2048 comfortably fits scoring JSON + full chain-of-thought reasoning.
  // 1024 was too low and caused silent truncation when includeReasoning: true
  // was combined with long retrieved context chunks in the prompt.
  const maxTokens = config.maxTokens ?? 2048
  const retries = config.retries ?? DEFAULT_RETRIES
  const temperature = config.temperature ?? undefined // undefined = provider default

  return {
    name: 'openai',
    model,

    /**
     * Sends a single prompt to the OpenAI API and returns the text response.
     *
     * Retries transient failures with exponential back-off up to `retries` times.
     * Each attempt has a 60-second timeout. If the request exceeds this, it is
     * aborted and the error is treated as retryable.
     */
    async complete(prompt: string): Promise<string> {
      let lastError: unknown

      for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
          controller.abort()
        }, TIMEOUT_MS)
        try {
          const response = await config.client.chat.completions.create(
            {
              model,
              max_tokens: maxTokens,
              ...(temperature !== undefined && { temperature }),
              messages: [{ role: 'user', content: prompt }],
            },
            { signal: controller.signal },
          )
          clearTimeout(timeoutId)

          const firstChoice = response.choices[0]
          const content = firstChoice?.message?.content

          if (content === undefined || content === null) {
            throw new Error('OpenAI provider returned no text content')
          }

          return content
        } catch (error) {
          clearTimeout(timeoutId)
          lastError = error

          // Do not retry on the final attempt, or for non-retryable errors
          if (attempt === retries || !isRetryable(error)) {
            break
          }

          // Exponential back-off: 500ms, 1000ms, 2000ms, ...
          await sleep(BASE_DELAY_MS * 2 ** attempt)
        }
      }

      const cause = lastError instanceof Error ? lastError.message : String(lastError)
      throw new Error(
        `OpenAI provider failed after ${retries + 1} attempt(s). Model: ${model}. Cause: ${cause}`,
        { cause: lastError },
      )
    },
  }
}
