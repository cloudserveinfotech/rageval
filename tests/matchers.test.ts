import { describe, it, expect } from 'vitest'
import { ragevalMatchers } from '../src/matchers.js'
import type { EvaluationResult } from '../src/schemas/results.js'

expect.extend(ragevalMatchers)

function makeResult(scores: Record<string, number>): EvaluationResult {
  const { overall, ...rest } = scores
  return {
    scores: { ...rest, overall: typeof overall === 'number' ? overall : 0.9 },
    samples: [],
    meta: {
      totalSamples: 1,
      metrics: Object.keys(rest),
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 100,
    },
  }
}

describe('toHaveScoreAbove', () => {
  const result = makeResult({ faithfulness: 0.85, answerRelevance: 0.72, overall: 0.79 })

  it('passes when score is above threshold', () => {
    expect(result).toHaveScoreAbove('faithfulness', 0.8)
  })

  it('passes when score equals threshold exactly', () => {
    expect(result).toHaveScoreAbove('faithfulness', 0.85)
  })

  it('fails when score is below threshold', () => {
    expect(() => {
      expect(result).toHaveScoreAbove('faithfulness', 0.9)
    }).toThrow()
  })

  it('fails when metric is not present', () => {
    expect(() => {
      expect(result).toHaveScoreAbove('contextRecall', 0.5)
    }).toThrow()
  })

  it('works with .not', () => {
    expect(result).not.toHaveScoreAbove('faithfulness', 0.99)
  })
})

describe('toPassThresholds', () => {
  const result = makeResult({
    faithfulness: 0.85,
    contextRelevance: 0.78,
    answerRelevance: 0.72,
    overall: 0.78,
  })

  it('passes when all scores meet thresholds', () => {
    expect(result).toPassThresholds({ faithfulness: 0.8, contextRelevance: 0.7 })
  })

  it('fails when any score falls below threshold', () => {
    expect(() => {
      expect(result).toPassThresholds({ faithfulness: 0.9, contextRelevance: 0.7 })
    }).toThrow(/faithfulness/)
  })

  it('silently skips metrics not evaluated', () => {
    // contextRecall was not in this result — should not cause failure
    expect(result).toPassThresholds({ faithfulness: 0.8, contextRecall: 0.9 })
  })

  it('works with .not', () => {
    expect(result).not.toPassThresholds({ faithfulness: 0.99 })
  })

  it('passes with empty thresholds object', () => {
    expect(result).toPassThresholds({})
  })
})

describe('toPassThresholds — isNot message branch', () => {
  const result = makeResult({
    faithfulness: 0.85,
    contextRelevance: 0.78,
    answerRelevance: 0.72,
    overall: 0.78,
  })

  it('message() returns isNot phrasing when .not assertion fails (pass=true, isNot=true)', () => {
    // result PASSES thresholds (faithfulness=0.85 >= 0.8), so pass=true.
    // .not inverts: assertion fails -> message() IS called with isNot=true
    expect(() => {
      expect(result).not.toPassThresholds({ faithfulness: 0.8 })
    }).toThrow(/NOT to pass all thresholds/)
  })
})

describe('toHaveScoreAbove — message direction branch', () => {
  const result = makeResult({
    faithfulness: 0.5,
    contextRelevance: 0.8,
    answerRelevance: 0.7,
    overall: 0.67,
  })

  it('message says "above" when score is below threshold (not .not)', () => {
    // pass=false, isNot=false -> message() says "above"
    expect(() => {
      expect(result).toHaveScoreAbove('faithfulness', 0.9)
    }).toThrow(/above/)
  })

  it('message says "below" when .not assertion fails (pass=true with .not)', () => {
    // faithfulness=0.5 < 0.9 -> pass=false -> .not passes -> no throw
    // To hit "below": need pass=true and .not used -> assertion throws
    expect(() => {
      expect(result).not.toHaveScoreAbove('contextRelevance', 0.7)
    }).toThrow(/below/)
  })
})

describe('toPassThresholds — undefined threshold entry', () => {
  const result = makeResult({
    faithfulness: 0.9,
    contextRelevance: 0.85,
    answerRelevance: 0.8,
    overall: 0.85,
  })

  it('skips undefined threshold values in the thresholds object', () => {
    // Casting to trigger the undefined threshold branch
    const thresholds = { faithfulness: undefined, contextRelevance: 0.8 } as unknown as Record<
      string,
      number
    >
    // Should not throw — undefined threshold is skipped
    expect(result).toPassThresholds(thresholds)
  })
})
