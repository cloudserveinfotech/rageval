import { describe, expect, it } from 'vitest'

import { jsonInstruction, parseLlmScore } from '../../src/metrics/parse.js'

describe('parseLlmScore', () => {
  it('parses a valid JSON response', () => {
    const result = parseLlmScore('{"score": 0.9, "reasoning": "Good answer"}')
    expect(result.score).toBeCloseTo(0.9)
    expect(result.reasoning).toBe('Good answer')
  })

  it('strips markdown code fences', () => {
    const result = parseLlmScore('```json\n{"score": 0.8, "reasoning": "ok"}\n```')
    expect(result.score).toBeCloseTo(0.8)
  })

  it('strips generic code fences', () => {
    const result = parseLlmScore('```\n{"score": 0.7, "reasoning": "test"}\n```')
    expect(result.score).toBeCloseTo(0.7)
  })

  it('clamps scores above 1.0 to 1.0', () => {
    // LLM sometimes returns 0-10 scale
    const result = parseLlmScore('{"score": 9.5, "reasoning": "high"}')
    expect(result.score).toBe(1.0)
  })

  it('clamps scores below 0.0 to 0.0', () => {
    const result = parseLlmScore('{"score": -0.5, "reasoning": "bad"}')
    expect(result.score).toBe(0.0)
  })

  it('handles missing reasoning field gracefully', () => {
    const result = parseLlmScore('{"score": 0.5}')
    expect(result.score).toBeCloseTo(0.5)
    expect(result.reasoning).toBe('')
  })

  it('handles non-string reasoning gracefully', () => {
    const result = parseLlmScore('{"score": 0.5, "reasoning": null}')
    expect(result.reasoning).toBe('')
  })

  it('throws on non-JSON response', () => {
    expect(() => parseLlmScore('this is not json')).toThrow('LLM judge returned invalid JSON')
  })

  it('throws on JSON without score field', () => {
    expect(() => parseLlmScore('{"result": 0.9}')).toThrow("without a 'score' field")
  })

  it('throws on JSON with non-numeric score', () => {
    expect(() => parseLlmScore('{"score": "high"}')).toThrow("non-numeric 'score' field")
  })

  it('handles score of exactly 0.0', () => {
    const result = parseLlmScore('{"score": 0.0, "reasoning": "completely wrong"}')
    expect(result.score).toBe(0.0)
  })

  it('handles score of exactly 1.0', () => {
    const result = parseLlmScore('{"score": 1.0, "reasoning": "perfect"}')
    expect(result.score).toBe(1.0)
  })

  it('handles score as a numeric string (fine-tuned model output)', () => {
    const result = parseLlmScore('{"score": "0.75", "reasoning": "string score"}')
    expect(result.score).toBeCloseTo(0.75)
    expect(result.reasoning).toBe('string score')
  })

  it('handles embedded JSON with preamble text (chain-of-thought output)', () => {
    const result = parseLlmScore(
      'Let me think step by step.\n\nFirst I analyze the claims.\n\n{"score": 0.9, "reasoning": "well grounded"}',
    )
    expect(result.score).toBeCloseTo(0.9)
    expect(result.reasoning).toBe('well grounded')
  })

  it('handles embedded JSON with postamble text', () => {
    const result = parseLlmScore('{"score": 0.6, "reasoning": "partial"}\n\nNote: see above.')
    expect(result.score).toBeCloseTo(0.6)
  })
})

describe('extractFirstJsonObject (via parseLlmScore)', () => {
  it('returns null path — throws when no { found in input', () => {
    // No brace at all — extractFirstJsonObject returns null — parseLlmScore throws
    expect(() => parseLlmScore('no brace here at all')).toThrow('LLM judge returned invalid JSON')
  })

  it('returns null path — throws when { is found but never closed', () => {
    // Opening brace but no closing — loop exhausts, returns null
    expect(() => parseLlmScore('preamble {"score": 0.5')).toThrow('LLM judge returned invalid JSON')
  })

  it('handles escaped backslash via extractFirstJsonObject (preamble forces its use)', () => {
    // Preamble text forces extractFirstJsonObject to run on the string.
    // Inside the JSON value, \\ triggers: char="\" && inString -> escape=true,
    // then on next iteration escape=true -> escape=false; continue (branches 26,27,28).
    const result = parseLlmScore('Analysis done.\n\n{"score": 0.7, "reasoning": "path\\\\value"}')
    expect(result.score).toBeCloseTo(0.7)
    expect(result.reasoning).toBe('path\\value')
  })

  it('handles escaped quote via extractFirstJsonObject (preamble forces its use)', () => {
    // Preamble text forces extractFirstJsonObject to run. The \" sequence inside the
    // JSON string hits: char="\" && inString -> escape=true, then next char='"' ->
    // escape=true -> escape=false; continue (does NOT toggle inString).
    const result = parseLlmScore('Step 1: analyze.\n\n{"score": 0.8, "reasoning": "say \\"hi\\""}')
    expect(result.score).toBeCloseTo(0.8)
    expect(result.reasoning).toBe('say "hi"')
  })

  it('fence with { in preamble — fence-strip guard true arm — inner catch fires', () => {
    // When preamble before the code fence contains a "{", hasBrace < fenceEnd is true,
    // so the fence-strip guard returns match (true arm). The trailing fence removal
    // strips from the last ``` onward, leaving only the preamble text.
    // extractFirstJsonObject finds "{context}" which is invalid JSON, so the inner
    // catch fires. Both the fence-guard true arm and inner catch are covered.
    expect(() =>
      parseLlmScore('here is {context} info\n```json\n{"score": 0.9, "reasoning": "ok"}\n```'),
    ).toThrow('LLM judge returned invalid JSON')
  })

  it('handles nested JSON object in reasoning field', () => {
    // depth increases to >1 and decrements correctly
    const result = parseLlmScore('{"score": 0.5, "reasoning": "ok", "extra": {"a": 1}}')
    expect(result.score).toBeCloseTo(0.5)
  })

  it('throws when score is a boolean (non-numeric non-string)', () => {
    expect(() => parseLlmScore('{"score": true}')).toThrow("non-numeric 'score' field")
  })

  it('throws when score string is not a number (NaN after parseFloat)', () => {
    expect(() => parseLlmScore('{"score": "abc"}')).toThrow("non-numeric 'score' field")
  })
})

describe('jsonInstruction', () => {
  it('includes reasoning field when includeReasoning is true', () => {
    const instruction = jsonInstruction(true)
    expect(instruction).toContain('"reasoning"')
    expect(instruction).toContain('step-by-step analysis')
  })

  it('does not include reasoning field when includeReasoning is false', () => {
    const instruction = jsonInstruction(false)
    expect(instruction).not.toContain('"reasoning"')
  })

  it('always includes the score field', () => {
    expect(jsonInstruction(true)).toContain('"score"')
    expect(jsonInstruction(false)).toContain('"score"')
  })
})
describe('parseLlmScore — extractFirstJsonObject null path (line 169)', () => {
  it('throws when input has an unmatched opening brace with no closing brace', () => {
    // The string starts with non-{ text so Step 2 runs extractFirstJsonObject.
    // The '{' is found but the loop ends without depth reaching 0 → return null.
    // extractFirstJsonObject returns null → cleaned unchanged → JSON.parse throws
    // → inner catch also gets null → throws 'LLM judge returned invalid JSON'.
    expect(() => parseLlmScore('evaluation result { score: 0.5 missing close brace')).toThrow(
      'LLM judge returned invalid JSON',
    )
  })

  it('extractFirstJsonObject traverses nested braces (depth > 0 false-arm at line 170)', () => {
    // Preamble forces extractFirstJsonObject to run. With nested {} inside the JSON,
    // the inner '}' decrements depth from 2 to 1 — `if (depth === 0)` is false,
    // so the loop continues past the inner closing brace until the outer one closes
    // at depth 0. Without preamble, JSON.parse succeeds first and the function
    // never runs. Without nesting, the depth-not-zero false branch never fires.
    const result = parseLlmScore(
      'preamble: {"score": 0.7, "reasoning": "ok", "extra": {"nested": 1}}',
    )
    expect(result.score).toBeCloseTo(0.7)
    expect(result.reasoning).toBe('ok')
  })
})
