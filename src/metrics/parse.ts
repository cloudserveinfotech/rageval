/**
 * Parses a JSON response from the LLM judge.
 *
 * The LLM is instructed to return `{"score": 0.0-1.0, "reasoning": "..."}`.
 * This function is resilient to common LLM output variations:
 *
 * - Markdown code fences (` ```json ... ``` `)
 * - Preamble text before the JSON object ("Here is my evaluation: {…}")
 * - Postamble text after the JSON object
 * - Score as a string instead of a number (`"score": "0.85"`)
 * - Score outside the [0, 1] range (clamped silently)
 * - Missing `reasoning` field (defaults to empty string)
 *
 * NOTE: Raw LLM responses are never included in thrown errors to prevent
 * accidental leakage of user data (question/answer/context content) into
 * error monitoring systems. Use debug logging at the call site if needed.
 *
 * @param response - The raw string returned by the LLM provider.
 * @returns Object with `score` clamped to [0, 1] and `reasoning` string
 *          (empty string when the LLM omitted the reasoning field).
 * @throws {Error} When no valid JSON object with a numeric `score` can be found.
 *
 * @example
 * ```typescript
 * import { parseLlmScore } from 'rageval'
 *
 * // Direct JSON (common case)
 * const r1 = parseLlmScore('{"score": 0.85, "reasoning": "The answer is relevant."}')
 * // r1.score     -> 0.85
 * // r1.reasoning -> "The answer is relevant."
 *
 * // Markdown-fenced JSON (some models wrap output even when told not to)
 * const r2 = parseLlmScore('```json\n{"score": 0.4}\n```')
 * // r2.score     -> 0.4
 * // r2.reasoning -> ""    (field absent; defaults to empty string)
 *
 * // Preamble text before JSON (common with chain-of-thought models)
 * const r3 = parseLlmScore('Let me evaluate this carefully.\n\n{"score": 0.9, "reasoning": "Strong."}')
 * // r3.score     -> 0.9
 *
 * // Score as string (some fine-tuned models return strings)
 * const r4 = parseLlmScore('{"score": "0.75"}')
 * // r4.score     -> 0.75
 *
 * // Out-of-range score (clamped to [0, 1])
 * const r5 = parseLlmScore('{"score": 9.5}')
 * // r5.score -> 1.0    (clamped from 9.5)
 * ```
 */
export function parseLlmScore(response: string): { score: number; reasoning: string } {
  // Step 1: Strip markdown code fences (` ```json ... ``` ` or ` ``` ... ``` `)
  let cleaned = response
    .replace(/^[\s\S]*?```(?:json)?\s*/i, (match) => {
      // Only strip if the fence appears before a '{' character
      const hasBrace = response.indexOf('{')
      const fenceEnd = match.length
      return hasBrace !== -1 && hasBrace < fenceEnd ? match : ''
    })
    .replace(/\s*```[\s\S]*$/, '')
    .trim()

  // Step 2: If the text does not start with '{', extract the first JSON object.
  // This handles LLMs that prepend chain-of-thought reasoning before the JSON.
  if (!cleaned.startsWith('{')) {
    const extracted = extractFirstJsonObject(cleaned)
    if (extracted !== null) {
      cleaned = extracted
    }
  }

  // Step 3: Parse JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Final attempt: try raw response in case fence-stripping mangled it
    try {
      const extracted = extractFirstJsonObject(response)
      if (extracted !== null) {
        parsed = JSON.parse(extracted)
      }
    } catch {
      // Intentionally empty — throw below with a clean message
    }

    if (parsed === undefined) {
      // Do NOT include response content in the error — it may contain user data
      throw new Error(
        'LLM judge returned invalid JSON. Check that your provider is reachable and returning well-formed responses.',
      )
    }
  }

  // Step 4: Validate structure
  if (typeof parsed !== 'object' || parsed === null || !('score' in parsed)) {
    throw new Error(
      "LLM judge returned JSON without a 'score' field. Ensure the model follows the scoring prompt format.",
    )
  }

  const raw = parsed as Record<string, unknown>
  const rawScore = raw['score']

  // Step 5: Accept score as number OR numeric string (some fine-tuned models)
  let numericScore: number
  if (typeof rawScore === 'number') {
    numericScore = rawScore
  } else if (typeof rawScore === 'string') {
    const numericValue = parseFloat(rawScore)
    if (isNaN(numericValue)) {
      throw new Error(
        "LLM judge returned a non-numeric 'score' field. Ensure the model follows the scoring prompt format.",
      )
    }
    numericScore = numericValue
  } else {
    throw new Error(
      "LLM judge returned a non-numeric 'score' field. Ensure the model follows the scoring prompt format.",
    )
  }

  // Step 6: Clamp to [0, 1] — LLM may occasionally return 0–10 scale by mistake
  const clampedScore = Math.min(1, Math.max(0, numericScore))

  const reasoning = raw['reasoning']

  return {
    score: clampedScore,
    reasoning: typeof reasoning === 'string' ? reasoning : '',
  }
}

/**
 * Extracts the first complete JSON object `{...}` from a string.
 * Uses bracket counting to handle nested objects correctly.
 *
 * @param text - Input string potentially containing a JSON object.
 * @returns The first JSON object substring, or `null` if none found.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]
    /* c8 ignore next -- defensive guard; text[i] is always defined when i < text.length */
    if (char === undefined) break

    if (escape) {
      escape = false
      continue
    }
    if (char === '\\' && inString) {
      escape = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

/**
 * Builds the standard JSON instruction appended to every judge prompt.
 *
 * When `includeReasoning` is false, the prompt still accepts a reasoning field
 * but marks it as optional — this avoids confusing models that always include
 * it. When `true`, reasoning is explicitly required and described as the
 * step-by-step analysis the model performed.
 *
 * @param includeReasoning - When `true`, the returned instruction requires
 *                           the LLM to provide a `reasoning` field explaining
 *                           its score. When `false`, reasoning is optional.
 * @returns A multi-line string to append verbatim to any judge prompt.
 *
 * @example
 * ```typescript
 * import { jsonInstruction } from 'rageval'
 *
 * // Without reasoning (default in evaluate())
 * const compact = jsonInstruction(false)
 * // Prompts: {"score": <0.0–1.0>}  (reasoning optional)
 *
 * // With reasoning (when includeReasoning: true is passed to evaluate())
 * const verbose = jsonInstruction(true)
 * // Prompts: {"score": <0.0–1.0>, "reasoning": "<your step-by-step analysis>"}
 * ```
 */
export function jsonInstruction(includeReasoning: boolean): string {
  if (includeReasoning) {
    return `
Respond with ONLY valid JSON in this exact format (no markdown, no extra text):
{"score": <number between 0.0 and 1.0>, "reasoning": "<your step-by-step analysis>"}`
  }
  return `
Respond with ONLY valid JSON in this exact format (no markdown, no extra text):
{"score": <number between 0.0 and 1.0>}`
}
