import { describe, expect, it } from 'vitest'

import { ThresholdError } from '../src/errors.js'
import type { EvaluationResult } from '../src/schemas/results.js'

/** Minimal valid EvaluationResult fixture */
function makeResult(overallScore = 0.65): EvaluationResult {
  return {
    scores: {
      faithfulness: 0.72,
      overall: overallScore,
    },
    samples: [
      {
        question: 'What is RAG?',
        scores: { faithfulness: 0.72 },
      },
    ],
    meta: {
      totalSamples: 1,
      metrics: ['faithfulness'],
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 1200,
    },
  }
}

describe('ThresholdError', () => {
  it('is an instance of Error', () => {
    const result = makeResult()
    const err = new ThresholdError({ faithfulness: { score: 0.72, threshold: 0.8 } }, result)
    expect(err).toBeInstanceOf(Error)
  })

  it('is an instance of ThresholdError', () => {
    const result = makeResult()
    const err = new ThresholdError({ faithfulness: { score: 0.72, threshold: 0.8 } }, result)
    expect(err).toBeInstanceOf(ThresholdError)
  })

  it('has name "ThresholdError"', () => {
    const result = makeResult()
    const err = new ThresholdError({}, result)
    expect(err.name).toBe('ThresholdError')
  })

  it('message contains the quality gate failure header', () => {
    const result = makeResult()
    const err = new ThresholdError({ faithfulness: { score: 0.72, threshold: 0.8 } }, result)
    expect(err.message).toContain('quality gate failed')
  })

  it('message lists the failing metric name, score, and threshold', () => {
    const result = makeResult()
    const err = new ThresholdError({ faithfulness: { score: 0.72, threshold: 0.8 } }, result)
    expect(err.message).toContain('faithfulness')
    expect(err.message).toContain('0.720')
    expect(err.message).toContain('0.8')
  })

  it('message lists all failing metrics when multiple fail', () => {
    const result = makeResult()
    const err = new ThresholdError(
      {
        faithfulness: { score: 0.72, threshold: 0.8 },
        answerRelevance: { score: 0.6, threshold: 0.75 },
      },
      result,
    )
    expect(err.message).toContain('faithfulness')
    expect(err.message).toContain('answerRelevance')
  })

  it('exposes the failures Record on .failures', () => {
    const result = makeResult()
    const failures = { faithfulness: { score: 0.72, threshold: 0.8 } }
    const err = new ThresholdError(failures, result)
    expect(err.failures).toEqual(failures)
  })

  it('exposes the EvaluationResult on .result', () => {
    const result = makeResult(0.65)
    const err = new ThresholdError({ faithfulness: { score: 0.72, threshold: 0.8 } }, result)
    expect(err.result).toBe(result)
    expect(err.result.scores.overall).toBe(0.65)
  })

  it('preserves .result.samples for report generation after gate failure', () => {
    const result = makeResult()
    const err = new ThresholdError({ faithfulness: { score: 0.72, threshold: 0.8 } }, result)
    expect(err.result.samples).toHaveLength(1)
    expect(err.result.samples[0]?.question).toBe('What is RAG?')
  })

  it('handles an empty failures object (edge case)', () => {
    const result = makeResult()
    const err = new ThresholdError({}, result)
    expect(err.message).toContain('quality gate failed')
    expect(err.failures).toEqual({})
  })
})
