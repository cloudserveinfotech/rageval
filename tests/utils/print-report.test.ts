import { describe, expect, it, vi } from 'vitest'
import { printReport } from '../../src/utils/print-report.js'
import type { EvaluationResult } from '../../src/schemas/results.js'

function makeResult(): EvaluationResult {
  return {
    scores: { faithfulness: 0.92, answerRelevance: 0.78, overall: 0.85 },
    samples: [
      {
        id: 'q1',
        question: 'What is TypeScript?',
        scores: { faithfulness: 0.92, answerRelevance: 0.78 },
      },
    ],
    meta: {
      totalSamples: 1,
      metrics: ['faithfulness', 'answerRelevance'],
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      startedAt: '2026-04-24T10:00:00.000Z',
      completedAt: '2026-04-24T10:00:05.000Z',
      durationMs: 5000,
    },
  }
}

describe('printReport', () => {
  it('writes output to the provided stream', () => {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    printReport(makeResult(), { stream })
    expect(written.length).toBeGreaterThan(0)
    const full = written.join('')
    expect(full).toContain('rageval')
    expect(full).toContain('anthropic')
  })

  it('includes metric names in output', () => {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    printReport(makeResult(), { stream })
    const full = written.join('')
    expect(full).toContain('Faithfulness')
    expect(full).toContain('Answer Relevance')
  })

  it('includes per-sample breakdown when showSamples is true', () => {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    printReport(makeResult(), { stream, showSamples: true })
    const full = written.join('')
    expect(full).toContain('What is TypeScript?')
  })

  it('does not include samples when showSamples is false (default)', () => {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    printReport(makeResult(), { stream })
    const full = written.join('')
    expect(full).not.toContain('What is TypeScript?')
  })

  it('includes a verdict line at the end', () => {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    printReport(makeResult(), { stream })
    // eslint-disable-next-line no-control-regex
    const full = written.join('').replace(/\x1b\[[0-9;]*m/g, '') // strip ANSI
    expect(full).toMatch(/Excellent|Good|Fair|Poor/)
  })

  it('does not throw on empty samples array', () => {
    const r = makeResult()
    r.samples = []
    const stream = { write: () => true } as unknown as NodeJS.WritableStream
    expect(() => printReport(r, { stream })).not.toThrow()
  })
})

describe('printReport — verdict branches', () => {
  function makeStream() {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    return { written, stream }
  }

  // eslint-disable-next-line no-control-regex
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

  it('shows "Good" verdict when overall is 0.70-0.85', () => {
    const { written, stream } = makeStream()
    const r: EvaluationResult = {
      scores: { faithfulness: 0.75, overall: 0.75 },
      samples: [],
      meta: {
        totalSamples: 0,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    printReport(r, { stream })
    expect(stripAnsi(written.join(''))).toContain('Good')
  })

  it('shows "Fair" verdict when overall is 0.50-0.70', () => {
    const { written, stream } = makeStream()
    const r: EvaluationResult = {
      scores: { faithfulness: 0.6, overall: 0.6 },
      samples: [],
      meta: {
        totalSamples: 0,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    printReport(r, { stream })
    expect(stripAnsi(written.join(''))).toContain('Fair')
  })

  it('shows "Poor" verdict when overall is below 0.50', () => {
    const { written, stream } = makeStream()
    const r: EvaluationResult = {
      scores: { faithfulness: 0.3, overall: 0.3 },
      samples: [],
      meta: {
        totalSamples: 0,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    printReport(r, { stream })
    expect(stripAnsi(written.join(''))).toContain('Poor')
  })

  it('shows truncation notice when maxSamples is less than sample count', () => {
    const { written, stream } = makeStream()
    const r: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        { id: 'q1', question: 'Question one', scores: { faithfulness: 0.9 } },
        { id: 'q2', question: 'Question two', scores: { faithfulness: 0.85 } },
        { id: 'q3', question: 'Question three', scores: { faithfulness: 0.88 } },
      ],
      meta: {
        totalSamples: 3,
        metrics: ['faithfulness'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    printReport(r, { stream, showSamples: true, maxSamples: 1 })
    const full = written.join('')
    expect(full).toContain('more sample')
  })
})

describe('printReport — sample without id', () => {
  it('handles sample with no id (omits bracket prefix)', () => {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    const r: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [
        { question: 'What is Node.js?', scores: { faithfulness: 0.9 } }, // no id
      ],
      meta: {
        totalSamples: 1,
        metrics: ['faithfulness'],
        provider: 'openai',
        model: 'gpt-4o',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    printReport(r, { stream, showSamples: true })
    const full = written.join('')
    expect(full).toContain('What is Node.js?')
    // Should NOT contain "[" bracket prefix since no id
    expect(full).not.toContain('[undefined]')
  })
})

describe('printReport — custom metric label fallback', () => {
  it('uses key.padEnd(17) when metric is not in METRIC_LABELS', () => {
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    const r: EvaluationResult = {
      scores: { customMetricXYZ: 0.75, overall: 0.75 },
      samples: [],
      meta: {
        totalSamples: 0,
        metrics: ['customMetricXYZ'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    printReport(r, { stream })
    const full = written.join('')
    // customMetricXYZ is not in METRIC_LABELS — falls back to key.padEnd(17)
    expect(full).toContain('customMetricXYZ')
  })
})

describe('printReport — per-sample custom metric label fallback', () => {
  it('uses raw key when sample score key is not in METRIC_LABELS', () => {
    // A sample with an unknown metric key triggers the ?? key fallback in per-sample output
    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream
    const r: EvaluationResult = {
      scores: { customMetric: 0.75, overall: 0.75 },
      samples: [
        {
          id: 'q1',
          question: 'Question with custom metric',
          scores: { customMetric: 0.75 },
        },
      ],
      meta: {
        totalSamples: 1,
        metrics: ['customMetric'],
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        startedAt: '2026-04-24T10:00:00.000Z',
        completedAt: '2026-04-24T10:00:01.000Z',
        durationMs: 1000,
      },
    }
    printReport(r, { stream, showSamples: true })
    const full = written.join('')
    // customMetric is not in METRIC_LABELS -> ?? key fallback -> raw key appears in per-sample output
    expect(full).toContain('customMetric')
  })
})
describe('printReport — TTY ANSI code branches (lines 7-17)', () => {
  it('emits ANSI escape codes when the stream is a TTY', async () => {
    // Reset module cache so isTTY is re-evaluated with our mock
    vi.resetModules()
    // Temporarily mock process.stdout.isTTY = true
    const origIsTTY = process.stdout.isTTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    })

    const { printReport: ttyPrintReport } = await import('../../src/utils/print-report.js')

    const written: string[] = []
    const stream = {
      write: (s: string) => {
        written.push(s)
        return true
      },
    } as unknown as NodeJS.WritableStream

    const r: EvaluationResult = {
      scores: { faithfulness: 0.9, overall: 0.9 },
      samples: [{ id: 'q1', question: 'Q?', scores: { faithfulness: 0.9 } }],
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
    ttyPrintReport(r, { stream })
    const full = written.join('')

    // With isTTY=true the color constants are ANSI sequences, not empty strings
    expect(full).toContain('\x1b[')

    // Restore
    Object.defineProperty(process.stdout, 'isTTY', {
      value: origIsTTY,
      writable: true,
      configurable: true,
    })
  })
})
