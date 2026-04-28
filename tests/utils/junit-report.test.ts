import { describe, it, expect } from 'vitest'
import { toJUnit } from '../../src/utils/junit-report.js'
import type { EvaluationResult } from '../../src/schemas/results.js'

function makeResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    scores: { faithfulness: 0.9, answerRelevance: 0.75, overall: 0.825 },
    samples: [
      {
        id: 's1',
        question: 'What is Paris?',
        scores: { faithfulness: 0.95, answerRelevance: 0.8 },
      },
      {
        id: 's2',
        question: 'What is TypeScript?',
        scores: { faithfulness: 0.85, answerRelevance: 0.7 },
      },
    ],
    meta: {
      totalSamples: 2,
      metrics: ['faithfulness', 'answerRelevance'],
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      startedAt: '2026-04-24T00:00:00.000Z',
      completedAt: '2026-04-24T00:00:02.000Z',
      durationMs: 2000,
    },
    ...overrides,
  }
}

describe('toJUnit', () => {
  it('starts with the XML declaration', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toMatch(/^<\?xml version="1.0"/)
  })

  it('has a testsuites root element', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toContain('<testsuites')
    expect(xml).toContain('</testsuites>')
  })

  it('has a testsuite child element', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toContain('<testsuite')
    expect(xml).toContain('</testsuite>')
  })

  it('reports correct number of tests', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toContain('tests="2"')
  })

  it('reports 0 failures when all scores above threshold', () => {
    // threshold=0.5 — both samples score above 0.5
    const xml = toJUnit(makeResult(), 0.5)
    expect(xml).toContain('failures="0"')
  })

  it('reports failure count when scores below threshold', () => {
    // threshold=0.9 — s2.answerRelevance (0.70) is below 0.9
    const xml = toJUnit(makeResult(), 0.9)
    expect(xml).toContain('<failure')
    expect(xml).toContain('QualityFailure')
  })

  it('includes provider and model as properties', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toContain('name="provider" value="anthropic"')
    expect(xml).toContain('name="model" value="claude-opus-4-6"')
  })

  it('includes sample question in testcase name', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toContain('What is Paris?')
    expect(xml).toContain('What is TypeScript?')
  })

  it('includes sample id in testcase name', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toContain('[s1]')
    expect(xml).toContain('[s2]')
  })

  it('escapes XML special characters in questions', () => {
    const result = makeResult()
    result.samples[0].question = 'What is <b>bold</b> & safe?'
    const xml = toJUnit(result)
    expect(xml).toContain('&lt;b&gt;bold&lt;/b&gt; &amp; safe?')
    expect(xml).not.toContain('<b>bold</b>')
  })

  it('includes system-out with scores for passing samples', () => {
    const xml = toJUnit(makeResult(), 0.5)
    expect(xml).toContain('<system-out>')
  })

  it('uses a custom failure threshold', () => {
    // threshold=1.0 — all samples fail
    const xml = toJUnit(makeResult(), 1.0)
    const failureCount = (xml.match(/<failure/g) ?? []).length
    // 2 samples, each with multiple failing metrics
    expect(failureCount).toBeGreaterThanOrEqual(2)
  })

  it('handles a result with zero samples', () => {
    const result = makeResult({ samples: [] })
    result.meta.totalSamples = 0
    const xml = toJUnit(result)
    expect(xml).toContain('tests="0"')
    expect(xml).toContain('failures="0"')
  })

  it('encodes UTF-8 in XML declaration', () => {
    const xml = toJUnit(makeResult())
    expect(xml).toContain('encoding="UTF-8"')
  })

  it('includes reasoning when present on failing sample', () => {
    const result = makeResult()
    result.samples[0].reasoning = { faithfulness: 'Some explanation here' }
    const xml = toJUnit(result, 0.99)
    expect(xml).toContain('Some explanation here')
  })
})

describe('toJUnit — missing branch coverage', () => {
  it('falls back to 1-based index ID when sample has no id', () => {
    const result = makeResult({
      samples: [{ question: 'No id sample', scores: { faithfulness: 0.9, answerRelevance: 0.85 } }],
    })
    const xml = toJUnit(result)
    // Should use "[1] No id sample" as the test case name
    expect(xml).toContain('[1]')
  })

  it('generates passing testcase with system-out when all scores pass threshold', () => {
    const result = makeResult()
    // threshold=0.0 — all samples pass, so they hit the else branch (system-out)
    const xml = toJUnit(result, 0.0)
    expect(xml).toContain('<system-out>')
    expect(xml).not.toContain('<failure')
  })

  it('includes failure detail with reasoning when sample fails and has reasoning', () => {
    const result = makeResult()
    result.samples[0].reasoning = { faithfulness: 'Low grounding detected' }
    // threshold=1.0 — all samples fail, reasoning appended to failure message
    const xml = toJUnit(result, 1.0)
    expect(xml).toContain('Low grounding detected')
    expect(xml).toContain('Reasoning:')
  })
})

describe('toJUnit — additional branch coverage', () => {
  it('generates failure element without reasoning when sample fails and has no reasoning', () => {
    const result = makeResult()
    // Ensure no reasoning on samples — threshold 1.0 forces all to fail
    result.samples.forEach((s) => {
      delete s.reasoning
    })
    const xml = toJUnit(result, 1.0)
    expect(xml).toContain('<failure')
    // Should NOT include Reasoning line when reasoning is absent
    expect(xml).not.toContain('Reasoning:')
  })

  it('uses ?? 0 fallback when score is undefined in metricDetails', () => {
    // A sample missing one metric score — the undefined score uses ?? 0 in failure output
    const result: EvaluationResult = {
      scores: { faithfulness: 0.5, overall: 0.5 },
      samples: [
        {
          id: 'q1',
          question: 'Missing score sample',
          scores: { faithfulness: 0.5 }, // answerRelevance missing
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness', 'answerRelevance'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T00:00:00.000Z',
        completedAt: '2026-04-24T00:00:01.000Z',
        durationMs: 1000,
      },
    }
    // threshold=1.0 forces failure — faithfulness=0.5 < 1.0
    const xml = toJUnit(result, 1.0)
    expect(xml).toContain('<failure')
    // answerRelevance missing → ?? 0 → shows 0.0000 in output
    expect(xml).toContain('answerRelevance=0.0000')
  })
})

describe('toJUnit — ?? 0 fallback in passing branch', () => {
  it('uses ?? 0 fallback for undefined score in system-out when sample passes threshold', () => {
    // A passing sample (no scores below threshold) with a missing metric score.
    // allScores maps metricKeys including undefined ones — ?? 0 fallback fires.
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'Missing answerRelevance score',
          scores: { faithfulness: 0.9 }, // answerRelevance is undefined
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness', 'answerRelevance'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T00:00:00.000Z',
        completedAt: '2026-04-24T00:00:01.000Z',
        durationMs: 1000,
      },
    }
    // threshold=0.0 — faithfulness=0.9 passes, answerRelevance=undefined is skipped by filter
    // failingMetrics is empty -> else branch (system-out) -> ?? 0 fires for undefined score
    const xml = toJUnit(result, 0.0)
    expect(xml).toContain('<system-out>')
    // answerRelevance undefined -> ?? 0 -> 0.0000
    expect(xml).toContain('answerRelevance=0.0000')
  })
})
describe('toJUnit — ?? 0 fallback in failure case (line 93 area)', () => {
  it('applies ?? 0 when a failing metric score is undefined in the sample', () => {
    const result: EvaluationResult = {
      scores: { faithfulness: 0.3, overall: 0.3 },
      samples: [
        {
          id: 'q1',
          question: 'Some question',
          // contextRelevance is absent from scores but present in metricKeys via meta
          scores: { faithfulness: 0.3 },
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness', 'contextRelevance'],
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        startedAt: '2026-04-25T00:00:00.000Z',
        completedAt: '2026-04-25T00:00:01.000Z',
        durationMs: 1000,
      },
    }
    // threshold = 0.5 → faithfulness 0.3 < 0.5 fails
    // contextRelevance undefined → (undefined ?? 0) = 0 < 0.5 also fails
    const xml = toJUnit(result, 0.5)
    expect(xml).toContain('<failure')
    // The ?? 0 fallback for undefined contextRelevance fires in the metricDetails map
    expect(xml).toContain('contextRelevance=0.0000')
  })
})
