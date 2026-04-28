import { describe, expect, it } from 'vitest'

import { toCsv, toJson } from '../../src/utils/export.js'
import type { EvaluationResult } from '../../src/schemas/results.js'

const mockResult: EvaluationResult = {
  scores: {
    faithfulness: 0.9,
    contextRelevance: 0.85,
    answerRelevance: 0.92,
    overall: 0.89,
  },
  samples: [
    {
      id: 'sample-1',
      question: 'What is Paris?',
      scores: {
        faithfulness: 0.9,
        contextRelevance: 0.85,
        answerRelevance: 0.92,
      },
    },
    {
      id: 'sample-2',
      question: 'What is TypeScript?',
      scores: {
        faithfulness: 0.88,
        contextRelevance: 0.91,
        answerRelevance: 0.95,
      },
    },
  ],
  meta: {
    totalSamples: 2,
    metrics: ['faithfulness', 'contextRelevance', 'answerRelevance'],
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    startedAt: '2026-04-24T00:00:00.000Z',
    completedAt: '2026-04-24T00:00:01.000Z',
    durationMs: 1000,
  },
}

describe('toJson', () => {
  it('returns valid JSON string', () => {
    const json = toJson(mockResult)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('pretty-prints by default (2-space indent)', () => {
    const json = toJson(mockResult)
    expect(json).toContain('\n  ')
  })

  it('produces compact JSON when pretty=false', () => {
    const json = toJson(mockResult, false)
    expect(json).not.toContain('\n  ')
    expect(JSON.parse(json)).toEqual(mockResult)
  })

  it('round-trips correctly', () => {
    const json = toJson(mockResult)
    expect(JSON.parse(json)).toEqual(mockResult)
  })
})

describe('toCsv', () => {
  it('returns empty string for empty samples', () => {
    const emptyResult: EvaluationResult = {
      ...mockResult,
      samples: [],
    }
    expect(toCsv(emptyResult)).toBe('')
  })

  it('includes a header row', () => {
    const csv = toCsv(mockResult)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('id,question,faithfulness,contextRelevance,answerRelevance,overall')
  })

  it('includes one data row per sample', () => {
    const csv = toCsv(mockResult)
    const lines = csv.split('\n').filter(Boolean)
    expect(lines).toHaveLength(3) // 1 header + 2 samples
  })

  it('includes the sample id in the first column', () => {
    const csv = toCsv(mockResult)
    const lines = csv.split('\n')
    expect(lines[1]?.startsWith('sample-1,')).toBe(true)
  })

  it('escapes commas in question text', () => {
    const resultWithComma: EvaluationResult = {
      ...mockResult,
      samples: [
        {
          id: 'q1',
          question: 'What is Paris, France?',
          scores: { faithfulness: 0.9 },
        },
      ],
    }
    const csv = toCsv(resultWithComma)
    expect(csv).toContain('"What is Paris, France?"')
  })

  it('escapes quotes in question text', () => {
    const resultWithQuote: EvaluationResult = {
      ...mockResult,
      samples: [
        {
          id: 'q1',
          question: 'What is "RAG"?',
          scores: { faithfulness: 0.9 },
        },
      ],
    }
    const csv = toCsv(resultWithQuote)
    expect(csv).toContain('"What is ""RAG""?"')
  })

  it('handles samples without optional metrics', () => {
    const partialResult: EvaluationResult = {
      ...mockResult,
      samples: [
        {
          id: 'q1',
          question: 'Test question',
          scores: { faithfulness: 0.8 }, // only one metric
        },
      ],
    }
    const csv = toCsv(partialResult)
    // contextRelevance and answerRelevance should be empty
    expect(csv).toContain('0.8000,,')
  })
})

describe('toCsv — additional branch coverage', () => {
  it('produces empty overall when sample has no metric scores at all', () => {
    const result: EvaluationResult = {
      ...mockResult,
      samples: [
        {
          id: 'q1',
          question: 'Empty sample',
          scores: {}, // no scores
        },
      ],
      meta: { ...mockResult.meta, metrics: ['faithfulness'] },
    }
    const csv = toCsv(result)
    // overall should be empty string when no scores available
    const lines = csv.split('\n')
    // last field (overall) should be empty
    expect(lines[1]).toMatch(/,$/)
  })

  it('escapes carriage return in field value', () => {
    const result: EvaluationResult = {
      ...mockResult,
      samples: [
        {
          id: 'q1',
          question: 'Line one\r\nLine two',
          scores: { faithfulness: 0.9 },
        },
      ],
      meta: { ...mockResult.meta, metrics: ['faithfulness'] },
    }
    const csv = toCsv(result)
    // field with \r should be wrapped in quotes
    expect(csv).toContain('"Line one')
  })
})

describe('toCsv — sample.id ?? fallback', () => {
  it('uses empty string for id when sample has no id field (line 71 ?? fallback)', () => {
    // sample.id is undefined -> ?? '' -> empty id column
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          question: 'Question without id',
          scores: { faithfulness: 0.9 },
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T00:00:00.000Z',
        completedAt: '2026-04-24T00:00:01.000Z',
        durationMs: 1000,
      },
    }
    const csv = toCsv(result)
    const lines = csv.trim().split('\n')
    // Data row: first column (id) should be empty, second is the question
    const dataRow = lines[1]
    expect(dataRow).toMatch(/^,/) // starts with comma = empty id
    expect(csv).toContain('Question without id')
  })
})

describe('toCsv — reasoning columns', () => {
  const resultWithReasoning: EvaluationResult = {
    scores: { faithfulness: 0.9, answerRelevance: 0.88, overall: 0.89 },
    samples: [
      {
        id: 'q1',
        question: 'What is Paris?',
        scores: { faithfulness: 0.9, answerRelevance: 0.88 },
        reasoning: {
          faithfulness: 'The answer is directly supported by context.',
          answerRelevance: 'Answer addresses the question clearly.',
        },
      },
      {
        id: 'q2',
        question: 'What is TypeScript?',
        scores: { faithfulness: 0.85, answerRelevance: 0.92 },
        // no reasoning on this sample -- should produce empty reasoning cells
      },
    ],
    meta: {
      totalSamples: 2,
      metrics: ['faithfulness', 'answerRelevance'],
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      startedAt: '2026-04-25T00:00:00.000Z',
      completedAt: '2026-04-25T00:00:01.000Z',
      durationMs: 1000,
    },
  }

  it('adds reasoning columns to header when any sample has reasoning', () => {
    const csv = toCsv(resultWithReasoning)
    const header = csv.split('\n')[0]
    expect(header).toBe(
      'id,question,faithfulness,answerRelevance,overall,faithfulness_reasoning,answerRelevance_reasoning',
    )
  })

  it('populates reasoning cells for samples that have reasoning', () => {
    const csv = toCsv(resultWithReasoning)
    expect(csv).toContain('The answer is directly supported by context.')
    expect(csv).toContain('Answer addresses the question clearly.')
  })

  it('produces empty reasoning cells for samples without reasoning', () => {
    const csv = toCsv(resultWithReasoning)
    const lines = csv.split('\n')
    // Second data row (q2) should end with two empty reasoning fields
    const row2 = lines[2]
    expect(row2).toMatch(/,,$/)
  })

  it('omits reasoning columns when no sample has reasoning', () => {
    const csv = toCsv(mockResult)
    const header = csv.split('\n')[0]
    // No _reasoning columns
    expect(header).not.toContain('_reasoning')
    expect(header).toBe('id,question,faithfulness,contextRelevance,answerRelevance,overall')
  })

  it('RFC-4180 escapes reasoning text that contains commas', () => {
    const resultWithCommaReasoning: EvaluationResult = {
      ...resultWithReasoning,
      samples: [
        {
          id: 'q1',
          question: 'Test?',
          scores: { faithfulness: 0.9, answerRelevance: 0.88 },
          reasoning: {
            faithfulness: 'Supported by context A, context B, and context C.',
            answerRelevance: 'Good.',
          },
        },
      ],
    }
    const csv = toCsv(resultWithCommaReasoning)
    expect(csv).toContain('"Supported by context A, context B, and context C."')
  })
})
