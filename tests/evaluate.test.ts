import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { evaluate } from '../src/evaluate.js'
import { answerRelevance } from '../src/metrics/answer-relevance.js'
import { faithfulness } from '../src/metrics/faithfulness.js'
import { contextRelevance } from '../src/metrics/context-relevance.js'
import { contextRecall } from '../src/metrics/context-recall.js'

// Mock provider config — avoids any real SDK imports
function makeMockProviderConfig(score = 0.85) {
  return {
    type: 'anthropic' as const,
    client: {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: `{"score": ${score}, "reasoning": "mock reason"}` }],
        }),
      },
    },
    model: 'claude-opus-4-6',
  }
}

const baseDataset = [
  {
    id: 'q1',
    question: 'What is Paris?',
    answer: 'Paris is the capital of France.',
    contexts: ['France has its capital in Paris, known as the City of Light.'],
    groundTruth: 'Paris is the capital and largest city of France.',
  },
]

describe('evaluate()', () => {
  it('returns an EvaluationResult with scores, samples, and meta', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: baseDataset,
      metrics: [faithfulness],
    })

    expect(result).toHaveProperty('scores')
    expect(result).toHaveProperty('samples')
    expect(result).toHaveProperty('meta')
  })

  it('computes aggregate scores for each requested metric', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(0.9),
      dataset: baseDataset,
      metrics: [faithfulness, answerRelevance],
    })

    expect(result.scores.faithfulness).toBeCloseTo(0.9)
    expect(result.scores.answerRelevance).toBeCloseTo(0.9)
    expect(result.scores.overall).toBeCloseTo(0.9)
  })

  it('computes correct overall score as mean of metric scores', async () => {
    let callCount = 0
    const config = {
      type: 'anthropic' as const,
      client: {
        messages: {
          create: vi.fn().mockImplementation(async () => {
            callCount++
            // First metric gets 0.8, second gets 0.6
            const score = callCount % 2 === 1 ? 0.8 : 0.6
            return {
              content: [{ type: 'text', text: `{"score": ${score}, "reasoning": ""}` }],
            }
          }),
        },
      },
      model: 'claude-opus-4-6',
    }

    const result = await evaluate({
      provider: config,
      dataset: baseDataset,
      metrics: [faithfulness, answerRelevance],
    })

    // overall = (0.8 + 0.6) / 2 = 0.7
    expect(result.scores.overall).toBeCloseTo(0.7)
  })

  it('returns per-sample results', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: [
        { ...baseDataset[0], id: 'a' },
        { ...baseDataset[0], id: 'b' },
      ],
      metrics: [faithfulness],
    })

    expect(result.samples).toHaveLength(2)
    expect(result.samples[0]?.id).toBe('a')
    expect(result.samples[1]?.id).toBe('b')
  })

  it('populates meta correctly', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: baseDataset,
      metrics: [faithfulness, contextRelevance],
    })

    expect(result.meta.totalSamples).toBe(1)
    expect(result.meta.metrics).toEqual(['faithfulness', 'contextRelevance'])
    expect(result.meta.provider).toBe('anthropic')
    expect(result.meta.model).toBe('claude-opus-4-6')
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0)
    expect(new Date(result.meta.startedAt).toISOString()).toBe(result.meta.startedAt)
    expect(new Date(result.meta.completedAt).toISOString()).toBe(result.meta.completedAt)
  })

  it('uses all 5 metrics when metrics option is omitted', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: baseDataset,
    })

    expect(result.meta.metrics).toHaveLength(5)
    expect(result.meta.metrics).toContain('faithfulness')
    expect(result.meta.metrics).toContain('contextRelevance')
    expect(result.meta.metrics).toContain('answerRelevance')
    expect(result.meta.metrics).toContain('contextRecall')
    expect(result.meta.metrics).toContain('contextPrecision')
  })

  it('does not include reasoning by default', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: baseDataset,
      metrics: [faithfulness],
    })

    expect(result.samples[0]?.reasoning).toBeUndefined()
  })

  it('includes reasoning when includeReasoning=true', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: baseDataset,
      metrics: [faithfulness],
      includeReasoning: true,
    })

    expect(result.samples[0]?.reasoning).toBeDefined()
    expect(result.samples[0]?.reasoning?.faithfulness).toBe('mock reason')
  })

  it('throws ZodError when dataset is empty', async () => {
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: [],
        metrics: [faithfulness],
      }),
    ).rejects.toThrow()
  })

  it('throws ZodError when a sample has empty question', async () => {
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: [{ question: '', answer: 'test', contexts: ['ctx'] }],
        metrics: [faithfulness],
      }),
    ).rejects.toThrow()
  })

  it('throws ZodError when a sample has empty contexts array', async () => {
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: [{ question: 'Q?', answer: 'A', contexts: [] }],
        metrics: [faithfulness],
      }),
    ).rejects.toThrow()
  })

  it('evaluates multiple samples in parallel with concurrency', async () => {
    const completedTimes: number[] = []
    const config = {
      type: 'anthropic' as const,
      client: {
        messages: {
          create: vi.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 20))
            completedTimes.push(Date.now())
            return { content: [{ type: 'text', text: '{"score": 0.9, "reasoning": ""}' }] }
          }),
        },
      },
      model: 'claude-opus-4-6',
    }

    const start = Date.now()
    await evaluate({
      provider: config,
      dataset: [baseDataset[0], { ...baseDataset[0], id: 'q2' }],
      metrics: [faithfulness],
      concurrency: 2,
    })
    const elapsed = Date.now() - start

    // With concurrency=2, 2 samples with 20ms delay each should finish in ~20ms not ~40ms
    expect(elapsed).toBeLessThan(60)
  })
})

describe('thresholds', () => {
  it('does not throw when all scores meet thresholds', async () => {
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: baseDataset,
        metrics: [faithfulness],
        thresholds: { faithfulness: 0.5 },
      }),
    ).resolves.toBeDefined()
  })

  it('throws ThresholdError when a score falls below threshold', async () => {
    const { ThresholdError } = await import('../src/errors.js')
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: baseDataset,
        metrics: [faithfulness],
        thresholds: { faithfulness: 0.99 }, // mock returns 0.9 — will fail
      }),
    ).rejects.toBeInstanceOf(ThresholdError)
  })

  it('ThresholdError.failures contains metric details', async () => {
    const { ThresholdError } = await import('../src/errors.js')
    try {
      await evaluate({
        provider: makeMockProviderConfig(),
        dataset: baseDataset,
        metrics: [faithfulness],
        thresholds: { faithfulness: 0.99 },
      })
    } catch (e) {
      expect(e).toBeInstanceOf(ThresholdError)
      if (e instanceof ThresholdError) {
        expect(e.failures.faithfulness).toBeDefined()
        expect(e.failures.faithfulness.threshold).toBe(0.99)
        expect(e.failures.faithfulness.score).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('silently skips thresholds for metrics not evaluated', async () => {
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: baseDataset,
        metrics: [faithfulness],
        thresholds: { contextRecall: 0.99 }, // not evaluated — should not throw
      }),
    ).resolves.toBeDefined()
  })
})

describe('onProgress', () => {
  it('calls onProgress after each sample', async () => {
    const calls: [number, number][] = []
    await evaluate({
      provider: makeMockProviderConfig(),
      dataset: baseDataset,
      metrics: [faithfulness],
      onProgress: (completed, total) => calls.push([completed, total]),
    })
    expect(calls.length).toBe(baseDataset.length)
    expect(calls[0]).toEqual([1, baseDataset.length])
    expect(calls[calls.length - 1]).toEqual([baseDataset.length, baseDataset.length])
  })
})

describe('contextRecall skipped behaviour', () => {
  // These tests intentionally exercise the path that emits a stderr warning
  // when contextRecall is requested with no groundTruth. Silence stderr so the
  // warning does not pollute test runner output.
  let stderrSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('excludes contextRecall from overall when no samples have groundTruth', async () => {
    // This is a critical correctness test.
    // Before the fix, running all-5 metrics without groundTruth would silently
    // include contextRecall scores of 0 in the overall average, producing
    // misleading results (e.g. 0.72 instead of 0.9 for an otherwise good pipeline).
    const datasetWithoutGroundTruth = [
      {
        id: 'q1',
        question: 'What is Paris?',
        answer: 'Paris is the capital of France.',
        contexts: ['France has its capital in Paris.'],
        // No groundTruth — contextRecall must be skipped, not scored 0
      },
    ]

    const result = await evaluate({
      provider: makeMockProviderConfig(0.9), // all metrics score 0.9
      dataset: datasetWithoutGroundTruth,
      metrics: [faithfulness, contextRelevance, answerRelevance, contextRecall],
    })

    // contextRecall should be absent from scores (skipped)
    expect(result.scores.contextRecall).toBeUndefined()

    // overall should be average of the 3 metrics that ran — not dragged down by contextRecall=0
    // faithfulness=0.9, contextRelevance=0.9, answerRelevance=0.9 → overall=0.9
    expect(result.scores.overall).toBeCloseTo(0.9)
  })

  it('includes contextRecall in overall when groundTruth is present', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(0.9),
      dataset: baseDataset, // baseDataset has groundTruth
      metrics: [faithfulness, contextRecall],
    })

    // contextRecall was computed (groundTruth present) — must be in scores
    expect(result.scores.contextRecall).toBeCloseTo(0.9)
    expect(result.scores.overall).toBeCloseTo(0.9)
  })

  it('does not count samples without groundTruth toward contextRecall aggregate', async () => {
    const mixedDataset = [
      {
        question: 'Q1',
        answer: 'A1',
        contexts: ['C1'],
        groundTruth: 'GT1', // has groundTruth — contextRecall runs, returns 0.9
      },
      {
        question: 'Q2',
        answer: 'A2',
        contexts: ['C2'],
        // no groundTruth — contextRecall skipped for this sample
      },
    ]

    const result = await evaluate({
      provider: makeMockProviderConfig(0.9),
      dataset: mixedDataset,
      metrics: [contextRecall],
    })

    // Only 1 of 2 samples had groundTruth — aggregate = 0.9 (not 0.45)
    expect(result.scores.contextRecall).toBeCloseTo(0.9)
  })
})

describe('ThresholdError.result', () => {
  it('attaches the full EvaluationResult to the thrown ThresholdError', async () => {
    const { ThresholdError } = await import('../src/errors.js')
    try {
      await evaluate({
        provider: makeMockProviderConfig(0.5),
        dataset: baseDataset,
        metrics: [faithfulness],
        thresholds: { faithfulness: 0.99 }, // mock returns 0.5 — will fail
      })
    } catch (e) {
      expect(e).toBeInstanceOf(ThresholdError)
      if (e instanceof ThresholdError) {
        // result must be a full EvaluationResult
        expect(e.result).toBeDefined()
        expect(e.result.scores).toBeDefined()
        expect(e.result.samples).toHaveLength(1)
        expect(e.result.meta.totalSamples).toBe(1)
        // scores should still be present even though gate failed
        expect(e.result.scores.faithfulness).toBeCloseTo(0.5)
        expect(e.result.scores.overall).toBeCloseTo(0.5)
      }
    }
  })
})

describe('custom metrics', () => {
  it('supports custom metrics with non-built-in names', async () => {
    // Custom metric with a name that is not in the MetricName enum
    const customMetric = {
      name: 'sourceAttribution',
      description: 'Custom metric for testing',
      async score(
        _input: Parameters<typeof faithfulness.score>[0],
        provider: Parameters<typeof faithfulness.score>[1],
      ) {
        const response = await provider.complete('custom prompt')
        const { score } = JSON.parse(response) as { score: number }
        return { score }
      },
    }

    const result = await evaluate({
      provider: makeMockProviderConfig(0.75),
      dataset: baseDataset,
      metrics: [customMetric],
    })

    // Custom metric scores should appear under their own name
    expect(result.scores.sourceAttribution).toBeCloseTo(0.75)
    expect(result.meta.metrics).toContain('sourceAttribution')
    expect(result.scores.overall).toBeCloseTo(0.75)
  })

  it('mixes built-in and custom metrics correctly', async () => {
    const customMetric = {
      name: 'myCustom',
      description: 'Custom',
      async score(
        _input: Parameters<typeof faithfulness.score>[0],
        provider: Parameters<typeof faithfulness.score>[1],
      ) {
        const response = await provider.complete('custom')
        const { score } = JSON.parse(response) as { score: number }
        return { score }
      },
    }

    const result = await evaluate({
      provider: makeMockProviderConfig(0.8),
      dataset: baseDataset,
      metrics: [faithfulness, customMetric],
    })

    expect(result.scores.faithfulness).toBeCloseTo(0.8)
    expect(result.scores.myCustom).toBeCloseTo(0.8)
    expect(result.scores.overall).toBeCloseTo(0.8)
  })
})

describe('evaluate() — duplicate metric validation', () => {
  it('throws when duplicate metric names are passed', async () => {
    const mockMetric = {
      name: 'faithfulness',
      description: 'test',
      score: vi.fn().mockResolvedValue({ score: 0.8 }),
    }
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: [{ question: 'Q', answer: 'A', contexts: ['C'] }],
        metrics: [mockMetric, mockMetric], // duplicate name!
      }),
    ).rejects.toThrow('Duplicate metric name "faithfulness"')
  })

  it('does not throw when all metric names are unique', async () => {
    const metricA = {
      name: 'metricA',
      description: 'first',
      score: vi.fn().mockResolvedValue({ score: 0.8 }),
    }
    const metricB = {
      name: 'metricB',
      description: 'second',
      score: vi.fn().mockResolvedValue({ score: 0.9 }),
    }
    await expect(
      evaluate({
        provider: makeMockProviderConfig(),
        dataset: [{ question: 'Q', answer: 'A', contexts: ['C'] }],
        metrics: [metricA, metricB],
      }),
    ).resolves.toBeDefined()
  })
})

describe('evaluate() — missing branch coverage', () => {
  // The "all metrics skipped" test deliberately triggers the contextRecall
  // warning — silence stderr so the test runner stays clean.
  let stderrSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('overall is 0 when ALL metrics are skipped (empty aggregates)', async () => {
    // contextRecall is the only metric, but no sample has groundTruth -> all skipped
    // -> aggregateScores is empty -> overall = 0 (the false branch of allAggregateValues.length > 0)
    const result = await evaluate({
      dataset: [
        { id: 'q1', question: 'What?', answer: 'Something.', contexts: ['ctx'] },
        // No groundTruth on any sample
      ],
      metrics: [contextRecall],
      provider: makeMockProviderConfig(),
    })
    expect(result.scores.overall).toBe(0)
    expect(result.scores.contextRecall).toBeUndefined()
  })

  it('ignores undefined threshold entries (minScore === undefined branch)', async () => {
    // Passing an explicit undefined value for a metric threshold — should be skipped gracefully
    const result = await evaluate({
      dataset: [
        { id: 'q1', question: 'What is Paris?', answer: 'Paris is in France.', contexts: ['ctx'] },
      ],
      metrics: [faithfulness],
      provider: makeMockProviderConfig(0.85),
      thresholds: { faithfulness: undefined },
    })
    // Should not throw — undefined threshold skipped
    expect(result.scores.faithfulness).toBeDefined()
  })
})

describe('evaluate() — score stats', () => {
  // The "all metrics skipped" stats test triggers the contextRecall warning —
  // silence stderr so the test runner stays clean.
  let stderrSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it('populates stats for each computed metric', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(0.8),
      dataset: baseDataset,
      metrics: [faithfulness],
    })

    expect(result.stats).toBeDefined()
    expect(result.stats?.faithfulness).toBeDefined()
    const st = result.stats!.faithfulness
    expect(st.mean).toBeCloseTo(0.8)
    expect(st.min).toBeCloseTo(0.8)
    expect(st.max).toBeCloseTo(0.8)
    expect(st.stddev).toBeCloseTo(0) // single sample -> stddev = 0
    expect(st.count).toBe(1)
  })

  it('computes correct min/max/stddev across multiple samples with varying scores', async () => {
    // Two samples: first call returns 0.6, second returns 1.0
    let callIndex = 0
    const scores = [0.6, 1.0]
    const config = {
      type: 'anthropic' as const,
      client: {
        messages: {
          create: vi.fn().mockImplementation(async () => {
            const score = scores[callIndex++ % scores.length]
            return {
              content: [{ type: 'text', text: `{"score": ${score}}` }],
            }
          }),
        },
      },
      model: 'claude-opus-4-6',
    }

    const result = await evaluate({
      provider: config,
      dataset: [
        { question: 'Q1', answer: 'A1', contexts: ['C1'] },
        { question: 'Q2', answer: 'A2', contexts: ['C2'] },
      ],
      metrics: [faithfulness],
    })

    const st = result.stats!.faithfulness
    expect(st.count).toBe(2)
    expect(st.mean).toBeCloseTo(0.8) // (0.6 + 1.0) / 2
    expect(st.min).toBeCloseTo(0.6)
    expect(st.max).toBeCloseTo(1.0)
    // population stddev of [0.6, 1.0]: variance = ((0.6-0.8)^2 + (1.0-0.8)^2) / 2 = (0.04+0.04)/2 = 0.04 -> stddev = 0.2
    expect(st.stddev).toBeCloseTo(0.2)
  })

  it('stats is undefined or empty when all metrics are skipped', async () => {
    // contextRecall with no groundTruth -> all samples skipped -> stats should be absent
    const result = await evaluate({
      dataset: [{ question: 'Q', answer: 'A', contexts: ['C'] }],
      metrics: [contextRecall],
      provider: makeMockProviderConfig(),
    })

    // Either stats is undefined or the contextRecall key is absent from stats
    const recallStats = result.stats?.contextRecall
    expect(recallStats).toBeUndefined()
  })

  it('stats contains entries for all computed metrics', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(0.75),
      dataset: baseDataset,
      metrics: [faithfulness, answerRelevance],
    })

    expect(result.stats?.faithfulness).toBeDefined()
    expect(result.stats?.answerRelevance).toBeDefined()
    expect(result.stats?.overall).toBeUndefined() // overall is not in stats
  })

  it('stats.count equals the number of non-skipped samples', async () => {
    // One sample with groundTruth (counted), one without (skipped for contextRecall)
    const result = await evaluate({
      provider: makeMockProviderConfig(0.9),
      dataset: [
        { question: 'Q1', answer: 'A1', contexts: ['C1'], groundTruth: 'GT1' },
        { question: 'Q2', answer: 'A2', contexts: ['C2'] }, // no groundTruth — skipped
      ],
      metrics: [contextRecall],
    })

    const st = result.stats?.contextRecall
    expect(st?.count).toBe(1) // only 1 sample was not skipped
  })
})

// ___ Checkpoint / resume tests ___

describe('evaluate() — checkpoint/resume', () => {
  /** Returns a unique tmp file path and schedules cleanup after test. */
  function tmpCheckpoint(): string {
    const path = join(
      tmpdir(),
      `rageval-ckpt-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    )
    return path
  }

  function cleanup(path: string): void {
    try {
      if (existsSync(path)) unlinkSync(path)
    } catch {
      /* ignore */
    }
  }

  it('creates a checkpoint file after each sample', async () => {
    const ckpt = tmpCheckpoint()
    try {
      await evaluate({
        provider: makeMockProviderConfig(),
        dataset: [
          { id: 'q1', question: 'Q1', answer: 'A1', contexts: ['C1'] },
          { id: 'q2', question: 'Q2', answer: 'A2', contexts: ['C2'] },
        ],
        metrics: [faithfulness],
        checkpoint: ckpt,
      })
      expect(existsSync(ckpt)).toBe(true)
      const data = JSON.parse(readFileSync(ckpt, 'utf-8'))
      expect(data.version).toBe(1)
      expect(data.samples).toHaveLength(2)
    } finally {
      cleanup(ckpt)
    }
  })

  it('resumes from checkpoint — skips already-evaluated samples by id', async () => {
    const ckpt = tmpCheckpoint()
    const scoreFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.9}' }],
    })
    const provider = {
      type: 'anthropic' as const,
      client: { messages: { create: scoreFn } },
      model: 'claude-opus-4-6',
    }

    // Pre-seed checkpoint with q1 already done
    const priorCheckpoint = {
      version: 1,
      samples: [{ id: 'q1', question: 'Q1', scores: { faithfulness: 0.9 } }],
    }
    writeFileSync(ckpt, JSON.stringify(priorCheckpoint), 'utf-8')

    try {
      const result = await evaluate({
        provider,
        dataset: [
          { id: 'q1', question: 'Q1', answer: 'A1', contexts: ['C1'] },
          { id: 'q2', question: 'Q2', answer: 'A2', contexts: ['C2'] },
        ],
        metrics: [faithfulness],
        checkpoint: ckpt,
      })

      // q1 was skipped — provider should only have been called for q2
      expect(scoreFn).toHaveBeenCalledTimes(1)
      // Both results present in final output
      expect(result.samples).toHaveLength(2)
      const q1 = result.samples.find((s) => s.id === 'q1')
      expect(q1?.scores.faithfulness).toBe(0.9) // from checkpoint, not re-evaluated
    } finally {
      cleanup(ckpt)
    }
  })

  it('resumes by question text when id is absent', async () => {
    const ckpt = tmpCheckpoint()
    const scoreFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.8}' }],
    })
    const provider = {
      type: 'anthropic' as const,
      client: { messages: { create: scoreFn } },
      model: 'claude-opus-4-6',
    }

    // Checkpoint has first question already done (no id field)
    writeFileSync(
      ckpt,
      JSON.stringify({
        version: 1,
        samples: [{ question: 'What is RAG?', scores: { faithfulness: 0.75 } }],
      }),
      'utf-8',
    )

    try {
      const result = await evaluate({
        provider,
        dataset: [
          {
            question: 'What is RAG?',
            answer: 'RAG is retrieval augmented generation.',
            contexts: ['c'],
          },
          { question: 'What is an LLM?', answer: 'Large language model.', contexts: ['c'] },
        ],
        metrics: [faithfulness],
        checkpoint: ckpt,
      })

      // Only second question was evaluated
      expect(scoreFn).toHaveBeenCalledTimes(1)
      expect(result.samples).toHaveLength(2)
    } finally {
      cleanup(ckpt)
    }
  })

  it('works normally without checkpoint option (no file created)', async () => {
    const ckpt = tmpCheckpoint()
    try {
      await evaluate({
        provider: makeMockProviderConfig(),
        dataset: [{ question: 'Q', answer: 'A', contexts: ['C'] }],
        metrics: [faithfulness],
        // No checkpoint option
      })
      expect(existsSync(ckpt)).toBe(false)
    } finally {
      cleanup(ckpt)
    }
  })

  it('handles corrupt checkpoint gracefully — starts fresh', async () => {
    const ckpt = tmpCheckpoint()
    const scoreFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.7}' }],
    })
    const provider = {
      type: 'anthropic' as const,
      client: { messages: { create: scoreFn } },
      model: 'claude-opus-4-6',
    }

    // Write corrupt JSON
    writeFileSync(ckpt, 'this is not valid json', 'utf-8')

    try {
      const result = await evaluate({
        provider,
        dataset: [{ id: 'q1', question: 'Q1', answer: 'A1', contexts: ['C1'] }],
        metrics: [faithfulness],
        checkpoint: ckpt,
      })

      // Corrupt checkpoint treated as empty — all samples evaluated normally
      expect(scoreFn).toHaveBeenCalledTimes(1)
      expect(result.samples).toHaveLength(1)
    } finally {
      cleanup(ckpt)
    }
  })
})
// ─── Additional checkpoint branch coverage ────────────────────────────────────

describe('evaluate() — checkpoint version guard', () => {
  function tmpCheckpoint(): string {
    return join(tmpdir(), `rageval-ckpt-ver-${Date.now()}.json`)
  }

  it('ignores checkpoint file with wrong version number — starts fresh', async () => {
    const ckpt = tmpCheckpoint()
    const scoreFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.8}' }],
    })
    const provider = {
      type: 'anthropic' as const,
      client: { messages: { create: scoreFn } },
      model: 'claude-opus-4-6',
    }

    // Write a checkpoint with version: 2 — should be treated as invalid / start fresh
    writeFileSync(
      ckpt,
      JSON.stringify({
        version: 2,
        samples: [{ id: 'q1', question: 'Q1', scores: { faithfulness: 0.9 } }],
      }),
      'utf-8',
    )

    try {
      const result = await evaluate({
        provider,
        dataset: [{ id: 'q1', question: 'Q1', answer: 'A1', contexts: ['C1'] }],
        metrics: [faithfulness],
        checkpoint: ckpt,
      })
      // version: 2 is unrecognised → checkpoint treated as empty → all samples re-evaluated
      expect(scoreFn).toHaveBeenCalledTimes(1)
      expect(result.samples).toHaveLength(1)
    } finally {
      try {
        if (existsSync(ckpt)) unlinkSync(ckpt)
      } catch {
        /* ignore */
      }
    }
  })

  it('ignores checkpoint where samples field is not an array', async () => {
    const ckpt = tmpCheckpoint()
    const scoreFn = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"score": 0.7}' }],
    })
    const provider = {
      type: 'anthropic' as const,
      client: { messages: { create: scoreFn } },
      model: 'claude-opus-4-6',
    }

    // samples is an object, not an array — should be treated as invalid
    writeFileSync(ckpt, JSON.stringify({ version: 1, samples: { q1: {} } }), 'utf-8')

    try {
      await evaluate({
        provider,
        dataset: [{ id: 'q1', question: 'Q1', answer: 'A1', contexts: ['C1'] }],
        metrics: [faithfulness],
        checkpoint: ckpt,
      })
      // invalid samples field → all samples re-evaluated
      expect(scoreFn).toHaveBeenCalledTimes(1)
    } finally {
      try {
        if (existsSync(ckpt)) unlinkSync(ckpt)
      } catch {
        /* ignore */
      }
    }
  })
})

describe('evaluate() — multi-tenant tagging', () => {
  it('propagates tenantId from input sample to result sample', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: [
        {
          id: 'tenant-a-q1',
          question: 'Q',
          answer: 'A',
          contexts: ['C'],
          tenantId: 'acme-corp',
        },
        {
          id: 'tenant-b-q1',
          question: 'Q',
          answer: 'A',
          contexts: ['C'],
          tenantId: 'globex-inc',
        },
      ],
      metrics: [faithfulness],
    })

    expect(result.samples[0].tenantId).toBe('acme-corp')
    expect(result.samples[1].tenantId).toBe('globex-inc')
  })

  it('propagates metadata from input sample to result sample', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: [
        {
          id: 'q1',
          question: 'Q',
          answer: 'A',
          contexts: ['C'],
          metadata: { traceId: 'trace-001', pipelineVersion: '2.1.0' },
        },
      ],
      metrics: [faithfulness],
    })

    expect(result.samples[0].metadata).toEqual({
      traceId: 'trace-001',
      pipelineVersion: '2.1.0',
    })
  })

  it('omits tenantId and metadata when not provided on input', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(),
      dataset: [{ id: 'q1', question: 'Q', answer: 'A', contexts: ['C'] }],
      metrics: [faithfulness],
    })

    expect(result.samples[0].tenantId).toBeUndefined()
    expect(result.samples[0].metadata).toBeUndefined()
  })

  it('allows grouping aggregate scores by tenantId post-evaluation', async () => {
    const result = await evaluate({
      provider: makeMockProviderConfig(0.9),
      dataset: [
        { id: 't1-q1', question: 'Q', answer: 'A', contexts: ['C'], tenantId: 'acme' },
        { id: 't1-q2', question: 'Q', answer: 'A', contexts: ['C'], tenantId: 'acme' },
        { id: 't2-q1', question: 'Q', answer: 'A', contexts: ['C'], tenantId: 'globex' },
      ],
      metrics: [faithfulness],
    })

    const byTenant = new Map<string, number[]>()
    for (const s of result.samples) {
      if (s.tenantId === undefined) continue
      const scores = byTenant.get(s.tenantId) ?? []
      const f = s.scores.faithfulness
      if (typeof f === 'number') scores.push(f)
      byTenant.set(s.tenantId, scores)
    }

    expect(byTenant.get('acme')).toHaveLength(2)
    expect(byTenant.get('globex')).toHaveLength(1)
  })
})
