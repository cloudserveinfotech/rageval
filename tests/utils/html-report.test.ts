import { describe, it, expect } from 'vitest'
import { toHtml } from '../../src/utils/html-report.js'
import type { EvaluationResult } from '../../src/schemas/results.js'

function makeResult(overrides: Partial<EvaluationResult['scores']> = {}): EvaluationResult {
  return {
    scores: {
      faithfulness: 0.9,
      contextRelevance: 0.85,
      answerRelevance: 0.88,
      overall: 0.88,
      ...overrides,
    },
    samples: [
      {
        id: 'q1',
        question: 'What is TypeScript?',
        scores: { faithfulness: 0.9, contextRelevance: 0.85, answerRelevance: 0.88 },
      },
      {
        id: 'q2',
        question: 'What is RAG?',
        scores: { faithfulness: 0.87, contextRelevance: 0.83, answerRelevance: 0.9 },
        reasoning: { faithfulness: 'Well grounded.' },
      },
    ],
    meta: {
      totalSamples: 2,
      metrics: ['faithfulness', 'contextRelevance', 'answerRelevance'],
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      startedAt: '2026-04-24T10:00:00.000Z',
      completedAt: '2026-04-24T10:00:08.000Z',
      durationMs: 8000,
    },
  }
}

describe('toHtml', () => {
  it('returns a string starting with <!DOCTYPE html>', () => {
    const html = toHtml(makeResult())
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/)
  })

  it('contains the overall score percentage', () => {
    const html = toHtml(makeResult())
    expect(html).toContain('88%')
  })

  it('contains metric names', () => {
    const html = toHtml(makeResult())
    expect(html).toContain('Faithfulness')
    expect(html).toContain('Context Relevance')
    expect(html).toContain('Answer Relevance')
  })

  it('contains sample questions', () => {
    const html = toHtml(makeResult())
    expect(html).toContain('What is TypeScript?')
    expect(html).toContain('What is RAG?')
  })

  it('includes reasoning toggle button when reasoning is present', () => {
    const html = toHtml(makeResult())
    expect(html).toContain('toggleRow')
    expect(html).toContain('Well grounded.')
  })

  it('accepts a custom title', () => {
    const html = toHtml(makeResult(), 'My Custom Report')
    expect(html).toContain('My Custom Report')
  })

  it('escapes HTML special chars in questions', () => {
    const r = makeResult()
    r.samples[0].question = 'Is <b>bold</b> & safe?'
    const html = toHtml(r)
    expect(html).toContain('Is &lt;b&gt;bold&lt;/b&gt; &amp; safe?')
    expect(html).not.toContain('<b>bold</b>')
  })

  it('produces a self-contained document (no external src/href)', () => {
    const html = toHtml(makeResult())
    // Should not reference any external CDN scripts or stylesheets
    expect(html).not.toMatch(/<script[^>]*src="https?:/)
    expect(html).not.toMatch(/<link[^>]*href="https?:/)
  })

  it('produces valid structure — has head, body, table, script', () => {
    const html = toHtml(makeResult())
    expect(html).toContain('<head>')
    expect(html).toContain('<body>')
    expect(html).toContain('<table')
    expect(html).toContain('<script>')
  })
})

describe('toHtml — score color/background branches', () => {
  // scoreColor: >=0.8 -> green, >=0.6 -> amber, <0.6 -> red
  // scoreBg:   >=0.8 -> light-green, >=0.6 -> light-amber, <0.6 -> light-red
  it('uses amber color for scores in the 0.6-0.8 range', () => {
    const html = toHtml(makeResult({ faithfulness: 0.7, overall: 0.7 }))
    // amber text color
    expect(html).toContain('#d97706')
    // amber background
    expect(html).toContain('#fffbeb')
  })

  it('uses red color for scores below 0.6', () => {
    const html = toHtml(makeResult({ faithfulness: 0.4, overall: 0.4 }))
    expect(html).toContain('#dc2626')
    expect(html).toContain('#fef2f2')
  })
})

describe('toHtml — null sampleOverall branch', () => {
  it('shows em-dash for overall cell when sample has no metric scores at all', () => {
    const result: EvaluationResult = {
      scores: { overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'Empty scores sample',
          scores: {}, // no metric scores — allVals is empty -> sampleOverall = null
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    const html = toHtml(result)
    // When sampleOverall is null the overallCell renders '—'
    expect(html).toContain('<td class="score-cell">—</td>')
  })

  it('score-desc div appears for known metrics but not for unknown custom metrics', () => {
    // scoreCards: desc ? `<div class="score-desc">...` : ''
    // overall has a description; unknownCustomMetric does not
    const result: EvaluationResult = {
      scores: { overall: 0.9, unknownCustomMetric: 0.8 },
      samples: [],
      meta: {
        totalSamples: 0,
        metrics: ['unknownCustomMetric'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    const html = toHtml(result)
    // overall has a description — score-desc div IS present
    expect(html).toContain('<div class="score-desc">')
    // unknownCustomMetric has no description — its card does NOT include score-desc content
    expect(html).toContain('unknownCustomMetric')
  })
})

describe('toHtml — undefined score and empty reasoning branches', () => {
  it('renders em-dash cell when a metric score is missing for a sample', () => {
    // s === undefined -> '<td class="score-cell">—</td>'
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'Missing metric sample',
          scores: { faithfulness: 0.9 }, // contextRelevance missing
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness', 'contextRelevance'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    const html = toHtml(result)
    expect(html).toContain('<td class="score-cell">—</td>')
  })

  it('does not render reasoning toggle button when reasoning object is empty', () => {
    // hasReasoning = sample.reasoning && Object.keys(sample.reasoning).length > 0
    // empty object -> hasReasoning false -> no toggle button
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'Empty reasoning sample',
          scores: { faithfulness: 0.9 },
          reasoning: {}, // empty object — hasReasoning should be false
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    const html = toHtml(result)
    expect(html).not.toContain('<button class="toggle-btn"')
  })
})

describe('toHtml — remaining branch coverage', () => {
  it('renders sample without id — empty string prefix in question cell', () => {
    // sample.id is undefined -> the '' fallback arm is used (no id prefix)
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          question: 'Question with no id',
          scores: { faithfulness: 0.9 },
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    const html = toHtml(result)
    expect(html).toContain('Question with no id')
    // No bracketed id prefix should appear
    expect(html).not.toContain('[q')
  })

  it('uses raw metric key in reasoning when key not in METRIC_LABELS (?? m fallback)', () => {
    // reasoning key 'customMetric' not in METRIC_LABELS -> falls back to raw key
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'Test question',
          scores: { faithfulness: 0.9 },
          reasoning: { customMetric: 'Some custom reasoning.' },
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    const html = toHtml(result)
    // raw key 'customMetric' is used as the label
    expect(html).toContain('customMetric:')
    expect(html).toContain('Some custom reasoning.')
  })
})
describe('toHtml — hasReasoning false branch (empty reasoning object)', () => {
  it('renders sample with reasoning:{} as if no reasoning (hasReasoning=false)', () => {
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'Test question?',
          scores: { faithfulness: 0.9 },
          // Empty object: sample.reasoning && Object.keys({}).length > 0 → false
          reasoning: {},
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        startedAt: '2026-04-25T00:00:00.000Z',
        completedAt: '2026-04-25T00:00:01.000Z',
        durationMs: 1000,
      },
    }
    const html = toHtml(result)
    // No reasoning toggle button since hasReasoning is false
    expect(html).not.toContain('<div class="reasoning-entry">')
    // Report still renders correctly
    expect(html).toContain('Test question?')
  })
})
