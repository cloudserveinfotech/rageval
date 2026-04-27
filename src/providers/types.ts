/**
 * Unified provider interface — both Anthropic and OpenAI adapters implement this.
 *
 * You can also implement this interface for custom providers (e.g. Gemini, Ollama):
 *
 * @example
 * ```typescript
 * import type { LlmProvider } from 'rageval'
 *
 * const myProvider: LlmProvider = {
 *   name: 'my-provider',
 *   model: 'my-model',
 *   async complete(prompt) {
 *     // call your LLM and return the text response
 *     return myLlm.generate(prompt)
 *   },
 * }
 * ```
 */
export interface LlmProvider {
  /** Provider name — e.g. 'anthropic', 'openai'. Appears in EvaluationResult.meta. */
  readonly name: string
  /** Model identifier — e.g. 'claude-opus-4-6'. Appears in EvaluationResult.meta. */
  readonly model: string
  /**
   * Send a prompt to the LLM and return the text response.
   * @param prompt - The full prompt string to send.
   * @returns The LLM's text response.
   */
  complete(prompt: string): Promise<string>
}

/**
 * Configuration for the Anthropic (Claude) provider.
 *
 * Uses structural typing for the client so you can pass any object that
 * satisfies the interface — useful for mocking in tests.
 */
export interface AnthropicProviderConfig {
  type: 'anthropic'
  /** An `Anthropic` client instance from `@anthropic-ai/sdk`. */
  client: {
    messages: {
      create: (
        params: {
          model: string
          max_tokens: number
          temperature?: number
          messages: { role: 'user' | 'assistant'; content: string }[]
        },
        options?: { signal?: AbortSignal },
      ) => Promise<{
        content: { type: string; text?: string }[]
      }>
    }
  }
  /**
   * Claude model to use for judging.
   * @default 'claude-opus-4-6'
   */
  model?: string
  /**
   * Maximum tokens in the judge's response. Increase if reasoning is truncated.
   * @default 1024
   */
  maxTokens?: number
  /**
   * Sampling temperature for the judge LLM.
   * Set to `0` for reproducible, deterministic evaluation runs.
   * Leave undefined to use the provider's default.
   */
  temperature?: number
  /**
   * Number of retry attempts for transient errors (rate limits, 5xx).
   * Uses exponential back-off: 500ms, 1s, 2s, ...
   * @default 2
   */
  retries?: number
}

/**
 * Configuration for the OpenAI provider.
 *
 * Uses structural typing for the client so you can pass any compatible object —
 * works with Azure OpenAI, proxies, or mocks in tests.
 */
export interface OpenAIProviderConfig {
  type: 'openai'
  /** An `OpenAI` client instance from the `openai` package. */
  client: {
    chat: {
      completions: {
        create: (
          params: {
            model: string
            max_tokens: number
            temperature?: number
            messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
          },
          options?: { signal?: AbortSignal },
        ) => Promise<{
          choices: { message?: { content?: string | null } }[]
        }>
      }
    }
  }
  /**
   * OpenAI model to use for judging.
   * @default 'gpt-4o'
   */
  model?: string
  /**
   * Maximum tokens in the judge's response.
   * @default 1024
   */
  maxTokens?: number
  /**
   * Sampling temperature for the judge LLM.
   * Set to `0` for reproducible, deterministic evaluation runs.
   * Leave undefined to use the provider's default.
   */
  temperature?: number
  /**
   * Number of retry attempts for transient errors (rate limits, 5xx).
   * @default 2
   */
  retries?: number
}

/**
 * Configuration for the Azure OpenAI provider.
 *
 * Pass an `AzureOpenAI` client from the `openai` package — it exposes the same
 * `.chat.completions.create()` interface as the standard `OpenAI` client.
 *
 * The `model` field should match the **deployment name** in your Azure resource,
 * which may differ from the underlying model name (e.g. your deployment might be
 * called `"my-gpt4o"` even though the underlying model is `gpt-4o`).
 *
 * **Custom / self-hosted endpoints** (Ollama, LocalAI, vLLM): use `type: 'openai'`
 * with a custom `baseURL` on a standard `OpenAI` client instead:
 * ```typescript
 * import OpenAI from 'openai'
 * const client = new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })
 * evaluate({ provider: { type: 'openai', client, model: 'llama3' }, ... })
 * ```
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
 * await evaluate({
 *   provider: { type: 'azure', client, model: 'gpt-4o' },
 *   dataset: myDataset,
 * })
 * ```
 */
export interface AzureOpenAIProviderConfig {
  type: 'azure'
  /**
   * An `AzureOpenAI` client instance from the `openai` package.
   * Uses structural typing — any object with `.chat.completions.create()` works.
   */
  client: {
    chat: {
      completions: {
        create: (
          params: {
            model: string
            max_tokens: number
            temperature?: number
            messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
          },
          options?: { signal?: AbortSignal },
        ) => Promise<{
          choices: { message?: { content?: string | null } }[]
        }>
      }
    }
  }
  /**
   * Azure deployment name (often matches the underlying model name, e.g. `'gpt-4o'`).
   * @default 'gpt-4o'
   */
  model?: string
  /**
   * Maximum tokens in the judge's response.
   * @default 2048
   */
  maxTokens?: number
  /**
   * Sampling temperature. Set to `0` for deterministic evaluation runs.
   */
  temperature?: number
  /**
   * Number of retry attempts for transient errors (rate limits, 5xx).
   * @default 2
   */
  retries?: number
}

/** Union of all supported provider configurations. */
export type ProviderConfig =
  | AnthropicProviderConfig
  | OpenAIProviderConfig
  | AzureOpenAIProviderConfig
