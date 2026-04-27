import type { AzureOpenAIProviderConfig, LlmProvider } from './types.js'

const DEFAULT_RETRIES = 2
const BASE_DELAY_MS = 500
const TIMEOUT_MS = 60_000

/**
 * Determines whether an error from the Azure OpenAI SDK is transient and safe to retry.
 *
 * Azure OpenAI uses the same `openai` SDK under the hood, so error shapes are identical:
 * `.status` for HTTP errors, message strings for network-level failures.
 *
 * Retryable: 429 (rate limit), 500/502/503/504 (server errors).
 * Non-retryable: 400 (bad request), 401 (auth), 403 (forbidden), 404 (not found).
 */
function isRetryable(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as Record<string, unknown>)['status'] === 'number'
  ) {
    const status = (error as { status: number }).status
    return status === 429 || (status >= 500 && status <= 504)
  }

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
 * Creates an Azure OpenAI LLM provider for use with {@link evaluate}.
 *
 * Azure OpenAI requires a resource endpoint and API key (or managed identity).
 * Pass an `AzureOpenAI` client from the `openai` package — it has the same
 * `.chat.completions.create()` interface as the standard `OpenAI` client.
 *
 * **Custom / self-hosted endpoints** (Ollama, LocalAI, vLLM, etc.) can use
 * `{ type: 'openai' }` with a custom `baseURL` instead:
 * ```typescript
 * import OpenAI from 'openai'
 * const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })
 * evaluate({ provider: { type: 'openai', client, model: 'llama3' }, ... })
 * ```
 *
 * @param config - Provider configuration including the AzureOpenAI client instance.
 * @returns An {@link LlmProvider} ready to be passed to `evaluate()`.
 *
 * @example
 * ```typescript
 * import { AzureOpenAI } from 'openai'
 * import { evaluate } from 'rageval'
 *
 * const client = new AzureOpenAI({
 *   endpoint: 'https://my-resource.openai.azure.com',
 *   apiKey: process.env.AZURE_OPENAI_API_KEY,
 *   apiVersion: '2025-01-01-preview',
 * })
 *
 * const results = await evaluate({
 *   provider: { type: 'azure', client, model: 'gpt-4o' },
 *   dataset: myDataset,
 * })
 * ```
 */
export function createAzureOpenAIProvider(config: AzureOpenAIProviderConfig): LlmProvider {
  const model = config.model ?? 'gpt-4o'
  const maxTokens = config.maxTokens ?? 2048
  const retries = config.retries ?? DEFAULT_RETRIES
  const temperature = config.temperature ?? undefined

  return {
    name: 'azure',
    model,

    /**
     * Sends a single prompt to the Azure OpenAI API and returns the text response.
     *
     * Retries transient failures with exponential back-off up to `retries` times.
     * Each attempt has a 60-second timeout.
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
            throw new Error('Azure OpenAI provider returned no text content')
          }

          return content
        } catch (error) {
          clearTimeout(timeoutId)
          lastError = error

          if (attempt === retries || !isRetryable(error)) {
            break
          }

          await sleep(BASE_DELAY_MS * 2 ** attempt)
        }
      }

      const cause = lastError instanceof Error ? lastError.message : String(lastError)
      throw new Error(
        `Azure OpenAI provider failed after ${retries + 1} attempt(s). Model: ${model}. Cause: ${cause}`,
        { cause: lastError },
      )
    },
  }
}
