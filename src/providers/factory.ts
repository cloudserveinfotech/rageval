import { createAnthropicProvider } from './anthropic.js'
import { createAzureOpenAIProvider } from './azure.js'
import { createOpenAIProvider } from './openai.js'
import type { LlmProvider, ProviderConfig } from './types.js'

/**
 * Creates an {@link LlmProvider} from a {@link ProviderConfig} discriminated union.
 *
 * This is the single entry point for provider instantiation inside `evaluate()`.
 * Adding a new provider requires:
 * 1. Defining a new config type with a unique `type` string literal in `types.ts`
 * 2. Implementing a `createXxxProvider()` factory in `src/providers/`
 * 3. Adding a new `case` branch here -- TypeScript's exhaustive check will
 *    enforce this at compile time (the `never` assignment in `default` produces
 *    a type error if any union member is unhandled).
 *
 * @param config - The provider configuration. The `type` field discriminates
 *                 which provider implementation to instantiate.
 * @returns A fully configured {@link LlmProvider} ready for evaluation use.
 * @throws {Error} If `config.type` is not a recognised provider -- only possible
 *                 when consuming raw JSON from an untrusted source that bypasses
 *                 TypeScript's static type system.
 *
 * @example
 * ```typescript
 * import { createProvider } from './factory.js'
 * import Anthropic from '@anthropic-ai/sdk'
 *
 * const provider = createProvider({
 *   type: 'anthropic',
 *   client: new Anthropic(),
 *   model: 'claude-haiku-4-5-20251001',
 *   temperature: 0,  // recommended for reproducible evaluation
 * })
 * ```
 */
export function createProvider(config: ProviderConfig): LlmProvider {
  switch (config.type) {
    case 'anthropic':
      return createAnthropicProvider(config)
    case 'openai':
      return createOpenAIProvider(config)
    case 'azure':
      return createAzureOpenAIProvider(config)
    default: {
      // Exhaustive check -- TypeScript will produce a compile-time error here
      // if a new ProviderConfig union member is added without a matching case.
      const _exhaustive: never = config
      throw new Error(`Unknown provider type: ${(_exhaustive as { type: string }).type}`)
    }
  }
}
