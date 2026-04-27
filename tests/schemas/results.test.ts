import { describe, expect, it } from 'vitest'

import {
  AggregateScoresSchema,
  EvaluationResultSchema,
  MetricScoreSchema,
  SampleResultSchema,
  SampleScoresSchema,
} from '../../src/schemas/results.js'

describe('MetricScoreSchema', () => {
  it('accepts 0.0', () => expect(MetricScoreSchema.parse(0.0)).toBe(0.0))
  it('accepts 1.0', () => expect(MetricScoreSchema.parse(1.0)).toBe(1.0))
  it('accepts 0.5', () => expect(MetricScoreSchema.parse(0.5)).toBe(0.5))
  it('rejects negative values', () => expect(() => MetricScoreSchema.parse(-0.1)).toThrow())
  it('rejects values above 1', () => expect(() => MetricScoreSchema.parse(1.1)).toThrow())
})

describe('SampleScoresSchema', () => {
  it('accepts a record of string → number', () => {
    const result = SampleScoresSchema.parse({ faithfulness: 0.9, answerRelevance: 0.8 })
    expect(result.faithfulness).toBe(0.9)
  })

  it('rejects scores outside 0-1', () => {
    expect(() => SampleScoresSchema.parse({ faithfulness: 1.5 })).toThrow()
  })
})

describe('AggregateScoresSchema', () => {
  it('accepts minimal valid input with just overall', () => {
    const result = AggregateScoresSchema.parse({ overall: 0.85 })
    expect(result.overall).toBe(0.85)
  })

  it('accepts all built-in metric fields', () => {
    const result = AggregateScoresSchema.parse({
      faithfulness: 0.9,
      contextRelevance: 0.8,
      answerRelevance: 0.85,
      contextRecall: 0.7,
      contextPrecision: 0.75,
      overall: 0.8,
    })
    expect(result.faithfulness).toBe(0.9)
    expect(result.overall).toBe(0.8)
  })

  it('passes through unknown custom metric keys (.passthrough() — BUG-004 fix)', () => {
    // Before the fix, AggregateScoresSchema used z.object() which strips unknown keys.
    // After the fix it uses .passthrough() so custom metric scores survive.
    const result = AggregateScoresSchema.parse({
      overall: 0.75,
      sourceAttribution: 0.8,
      myCustomMetric: 0.6,
    }) as Record<string, number>

    expect(result.sourceAttribution).toBe(0.8)
    expect(result.myCustomMetric).toBe(0.6)
  })

  it('rejects overall above 1', () => {
    expect(() => AggregateScoresSchema.parse({ overall: 1.5 })).toThrow()
  })

  it('rejects missing overall', () => {
    expect(() => AggregateScoresSchema.parse({ faithfulness: 0.9 })).toThrow()
  })

  it('optional built-in fields can be absent', () => {
    // Only 'overall' is required; all named metrics are optional
    expect(() => AggregateScoresSchema.parse({ overall: 0.5 })).not.toThrow()
  })
})

describe('SampleResultSchema', () => {
  it('accepts a minimal sample with question and scores', () => {
    const result = SampleResultSchema.parse({
      question: 'What is RAG?',
      scores: { faithfulness: 0.9 },
    })
    expect(result.question).toBe('What is RAG?')
  })

  it('accepts optional id field', () => {
    const result = SampleResultSchema.parse({
      id: 'sample-1',
      question: 'Q',
      scores: { faithfulness: 0.8 },
    })
    expect(result.id).toBe('sample-1')
  })

  it('accepts optional reasoning field', () => {
    const result = SampleResultSchema.parse({
      question: 'Q',
      scores: { faithfulness: 0.8 },
      reasoning: { faithfulness: 'The answer is grounded.' },
    })
    expect(result.reasoning?.faithfulness).toBe('The answer is grounded.')
  })

  it('id is optional — absent when not provided', () => {
    const result = SampleResultSchema.parse({
      question: 'Q',
      scores: {},
    })
    expect(result.id).toBeUndefined()
  })
})

describe('EvaluationResultSchema', () => {
  function makeValidResult() {
    return {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [{ question: 'Q', scores: { faithfulness: 0.9 } }],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1500,
      },
    }
  }

  it('accepts a complete valid result', () => {
    expect(() => EvaluationResultSchema.parse(makeValidResult())).not.toThrow()
  })

  it('rejects negative durationMs', () => {
    const data = makeValidResult()
    data.meta.durationMs = -1
    expect(() => EvaluationResultSchema.parse(data)).toThrow()
  })

  it('rejects non-integer totalSamples', () => {
    const data = makeValidResult()
    data.meta.totalSamples = 1.5
    expect(() => EvaluationResultSchema.parse(data)).toThrow()
  })

  it('rejects zero totalSamples', () => {
    const data = makeValidResult()
    data.meta.totalSamples = 0
    expect(() => EvaluationResultSchema.parse(data)).toThrow()
  })

  it('rejects invalid ISO datetime in startedAt', () => {
    const data = makeValidResult()
    data.meta.startedAt = 'not-a-date'
    expect(() => EvaluationResultSchema.parse(data)).toThrow()
  })

  it('preserves custom metric scores through full result schema', () => {
    // End-to-end: custom metric in scores passes through .passthrough() on AggregateScoresSchema
    const data = {
      ...makeValidResult(),
      scores: { overall: 0.75, sourceAttribution: 0.8 },
    }
    const result = EvaluationResultSchema.parse(data) as { scores: Record<string, number> }
    expect(result.scores.sourceAttribution).toBe(0.8)
  })
})
