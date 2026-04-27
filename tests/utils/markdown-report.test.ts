import { describe, it, expect } from 'vitest'
import { toMarkdown } from '../../src/utils/markdown-report.js'
import type { EvaluationResult } from '../../src/schemas/results.js'

function makeResult(overrides: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    scores: { faithfulness: 0.92, contextRelevance: 0.8, answerRelevance: 0.88, overall: 0.867 },
    samples: [
      {
        id: 'q1',
        question: 'What is Paris?',
        scores: { faithfulness: 0.92, contextRelevance: 0.8, answerRelevance: 0.88 },
      },
      {
        id: 'q2',
        question: 'What is TypeScript?',
        scores: { faithfulness: 0.88, contextRelevance: 0.82, answerRelevance: 0.9 },
        reasoning: { faithfulness: 'Well grounded in sources.' },
      },
    ],
    meta: {
      totalSamples: 2,
      metrics: ['faithfulness', 'contextRelevance', 'answerRelevance'],
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      startedAt: '2026-04-24T10:00:00.000Z',
      completedAt: '2026-04-24T10:00:05.000Z',
      durationMs: 5000,
    },
    ...overrides,
  }
}

describe('toMarkdown', () => {
  it('returns a non-empty string', () => {
    const md = toMarkdown(makeResult())
    expect(md.length).toBeGreaterThan(100)
  })

  it('starts with a # heading', () => {
    const md = toMarkdown(makeResult())
    expect(md.trimStart()).toMatch(/^# /)
  })

  it('uses the default title when none provided', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('rageval Evaluation Report')
  })

  it('uses a custom title when provided', () => {
    const md = toMarkdown(makeResult(), 'My Pipeline Report')
    expect(md).toContain('My Pipeline Report')
  })

  it('contains an Aggregate Scores section', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('## Aggregate Scores')
  })

  it('contains a Sample Results section', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('## Sample Results')
  })

  it('includes all metric names in the aggregate table', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('Faithfulness')
    expect(md).toContain('Context Relevance')
    expect(md).toContain('Answer Relevance')
  })

  it('includes overall score in aggregate table', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('Overall')
    // 86.7% for overall=0.867
    expect(md).toContain('86.7%')
  })

  it('includes sample questions in the sample table', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('What is Paris?')
    expect(md).toContain('What is TypeScript?')
  })

  it('includes a Metric Legend section', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('## Metric Legend')
  })

  it('includes LLM Reasoning section when reasoning is present', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('## LLM Reasoning')
    expect(md).toContain('Well grounded in sources.')
  })

  it('does not include LLM Reasoning section when no reasoning present', () => {
    const result = makeResult()
    result.samples.forEach((s) => {
      delete s.reasoning
    })
    const md = toMarkdown(result)
    expect(md).not.toContain('## LLM Reasoning')
  })

  it('contains markdown table delimiters', () => {
    const md = toMarkdown(makeResult())
    // Every table row has pipes
    const tableLines = md.split('\n').filter((l) => l.startsWith('|'))
    expect(tableLines.length).toBeGreaterThan(3)
  })

  it('escapes pipe characters in question text', () => {
    const result = makeResult()
    result.samples[0].question = 'A | B | C'
    const md = toMarkdown(result)
    // Pipe should be escaped as \| in table cells
    expect(md).toContain('A \\| B \\| C')
  })

  it('includes provider and model metadata in header', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('anthropic')
    expect(md).toContain('claude-opus-4-6')
  })

  it('includes sample count in header summary', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('2 samples')
  })

  it('uses score bar in aggregate table', () => {
    const md = toMarkdown(makeResult())
    // scoreBar uses block characters
    expect(md).toMatch(/\u2588+\u2591*|\u2591+/)
  })

  it('uses emoji status indicators', () => {
    const md = toMarkdown(makeResult())
    // scoreEmoji returns green/amber/red circle
    expect(md).toMatch(/\u{1F7E2}|\u{1F7E1}|\u{1F534}/u)
  })

  it('ends with a rageval attribution link', () => {
    const md = toMarkdown(makeResult())
    expect(md).toContain('rageval')
    expect(md).toContain('github.com')
  })
})

describe('toMarkdown — scoreEmoji branches', () => {
  // scoreEmoji: >=0.8 -> green, >=0.6 -> amber, <0.6 -> red
  it('uses amber emoji for scores in the 0.6-0.8 range', () => {
    const r = makeResult({
      scores: { faithfulness: 0.7, contextRelevance: 0.65, answerRelevance: 0.68, overall: 0.68 },
      samples: [
        {
          id: 'q1',
          question: 'What is Paris?',
          scores: { faithfulness: 0.7, contextRelevance: 0.65, answerRelevance: 0.68 },
        },
      ],
    })
    const md = toMarkdown(r)
    expect(md).toMatch(/\u{1F7E1}/u)
  })

  it('uses red emoji for scores below 0.6', () => {
    const r = makeResult({
      scores: { faithfulness: 0.3, contextRelevance: 0.4, answerRelevance: 0.5, overall: 0.4 },
      samples: [
        {
          id: 'q1',
          question: 'What is Paris?',
          scores: { faithfulness: 0.3, contextRelevance: 0.4, answerRelevance: 0.5 },
        },
      ],
    })
    const md = toMarkdown(r)
    expect(md).toMatch(/\u{1F534}/u)
  })
})

describe('toMarkdown — null/undefined branch coverage', () => {
  it('renders em-dash for missing metric score in sample row', () => {
    // s === undefined -> return '—' branch
    const r = makeResult({
      samples: [
        {
          id: 'q1',
          question: 'Test',
          scores: { faithfulness: 0.9 }, // contextRelevance missing
        },
      ],
      meta: {
        ...makeResult().meta,
        totalSamples: 1,
        metrics: ['faithfulness', 'contextRelevance'],
      },
    })
    const md = toMarkdown(r)
    expect(md).toContain('\u2014')
  })

  it('renders em-dash for overall cell when sample has no metric scores', () => {
    // sampleOverall === null -> '—' branch
    const result: EvaluationResult = {
      scores: { overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'No scores',
          scores: {}, // empty -> allVals empty -> sampleOverall null
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
    const md = toMarkdown(result)
    // overall cell should be '—' (not a percentage)
    expect(md).toContain('| \u2014 |')
  })
})

describe('toMarkdown — sample.id and reasoning label branches', () => {
  it('sample without id uses question text directly', () => {
    // sample.id is undefined -> id = '' (false arm of ternary)
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          question: 'No id question here',
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
    const md = toMarkdown(result)
    expect(md).toContain('No id question here')
  })

  it('reasoning section uses question label when sample has no id', () => {
    // sample.id is undefined -> label = '"<question>"' (false arm)
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          question: 'What is the capital?',
          scores: { faithfulness: 0.9 },
          reasoning: { faithfulness: 'Well grounded.' },
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
    const md = toMarkdown(result)
    // Without id, the summary uses the question text in quotes
    expect(md).toContain('"What is the capital?"')
    expect(md).toContain('Well grounded.')
  })

  it('metric legend skips entry when metric has no description', () => {
    // 'overall' is not in METRIC_DESCRIPTIONS, so if (desc) is false
    const result: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        {
          id: 'q1',
          question: 'Test question',
          scores: { faithfulness: 0.9 },
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness', 'overall'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T00:00:00.000Z',
        completedAt: '2026-04-24T00:00:01.000Z',
        durationMs: 1000,
      },
    }
    const md = toMarkdown(result)
    // 'faithfulness' has a description — should appear in legend
    expect(md).toContain('Is the answer grounded in the context?')
    // 'overall' has no description — should NOT appear in Metric Legend section
    const legendStart = md.indexOf('## Metric Legend')
    const legendSection = md.slice(legendStart)
    expect(legendSection).not.toContain('**Overall**')
  })
})

describe('toMarkdown — ?? fallback branches for unknown metric keys', () => {
  it('falls back to raw key when metric name not in METRIC_LABELS', () => {
    // A custom metric name not in METRIC_LABELS triggers ?? key fallbacks.
    // It also has no METRIC_DESCRIPTIONS entry, so if(desc) is false in legend.
    const result: EvaluationResult = {
      scores: { customMetric: 0.75, overall: 0.75 },
      samples: [
        {
          id: 'q1',
          question: 'Test question',
          scores: { customMetric: 0.75 },
          reasoning: { customMetric: 'Custom reasoning text.' },
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['customMetric'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T00:00:00.000Z',
        completedAt: '2026-04-24T00:00:01.000Z',
        durationMs: 1000,
      },
    }
    const md = toMarkdown(result)
    // raw key used as label in aggregate table
    expect(md).toContain('customMetric')
    // reasoning section uses raw key as label
    expect(md).toContain('**customMetric:**')
    // metric legend: no METRIC_DESCRIPTIONS entry -> not in legend
    const legendStart = md.indexOf('## Metric Legend')
    const legendSection = md.slice(legendStart)
    expect(legendSection).not.toContain('**customMetric**')
  })
})
describe('toMarkdown — reasoning summary label without id (line 128)', () => {
  it('uses question text as label when sample has no id in reasoning section', () => {
    const result: EvaluationResult = {
      scores: { faithfulness: 0.7, overall: 0.7 },
      samples: [
        {
          // No id — label falls back to question text slice
          question: 'What is the capital of France?',
          scores: { faithfulness: 0.7 },
          reasoning: { faithfulness: 'The answer matches context.' },
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
    const md = toMarkdown(result)
    // Label uses first 50 chars of question text (not Sample `id`)
    expect(md).toContain('"What is the capital of France?"')
    // Reasoning text is present
    expect(md).toContain('The answer matches context.')
  })
})
