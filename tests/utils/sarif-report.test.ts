import { describe, it, expect, vi } from 'vitest'
import { toSarif } from '../../src/utils/sarif-report.js'
import type { EvaluationResult } from '../../src/schemas/results.js'

function makeResult(): EvaluationResult {
  return {
    scores: { faithfulness: 0.85, answerRelevance: 0.9, overall: 0.875 },
    samples: [
      {
        id: 'sample-1',
        question: 'Who invented the telephone?',
        scores: { faithfulness: 0.9, answerRelevance: 0.95 },
      },
      {
        id: 'sample-2',
        question: 'What is photosynthesis?',
        scores: { faithfulness: 0.8, answerRelevance: 0.85 },
      },
    ],
    meta: {
      totalSamples: 2,
      metrics: ['faithfulness', 'answerRelevance'],
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      startedAt: '2026-04-24T00:00:00.000Z',
      completedAt: '2026-04-24T00:00:03.000Z',
      durationMs: 3000,
    },
  }
}

describe('toSarif', () => {
  it('returns valid JSON string', () => {
    const sarif = toSarif(makeResult())
    expect(() => JSON.parse(sarif)).not.toThrow()
  })

  it('sets SARIF version to 2.1.0', () => {
    const sarif = JSON.parse(toSarif(makeResult())) as { version: string }
    expect(sarif.version).toBe('2.1.0')
  })

  it('has a $schema pointing to the SARIF 2.1.0 schema URL', () => {
    const sarif = JSON.parse(toSarif(makeResult())) as { $schema: string }
    expect(sarif.$schema).toContain('sarif-schema-2.1.0')
  })

  it('has exactly one run', () => {
    const sarif = JSON.parse(toSarif(makeResult())) as { runs: unknown[] }
    expect(sarif.runs).toHaveLength(1)
  })

  it('tool driver name is "rageval"', () => {
    const sarif = JSON.parse(toSarif(makeResult())) as {
      runs: { tool: { driver: { name: string } } }[]
    }
    expect(sarif.runs[0]?.tool.driver.name).toBe('rageval')
  })

  it('includes one rule per metric', () => {
    const sarif = JSON.parse(toSarif(makeResult())) as {
      runs: { tool: { driver: { rules: { id: string }[] } } }[]
    }
    const rules = sarif.runs[0]?.tool.driver.rules ?? []
    expect(rules).toHaveLength(2)
    expect(rules.map((r) => r.id)).toContain('rageval/faithfulness')
    expect(rules.map((r) => r.id)).toContain('rageval/answerRelevance')
  })

  it('produces no results when all scores are above threshold', () => {
    // threshold=0.5 — all scores above 0.5
    const sarif = JSON.parse(toSarif(makeResult(), 0.5)) as {
      runs: { results: unknown[] }[]
    }
    expect(sarif.runs[0]?.results).toHaveLength(0)
  })

  it('produces results when scores fall below threshold', () => {
    // threshold=0.99 — everything fails
    const sarif = JSON.parse(toSarif(makeResult(), 0.99)) as {
      runs: { results: { ruleId: string; level: string }[] }[]
    }
    const results = sarif.runs[0]?.results ?? []
    expect(results.length).toBeGreaterThan(0)
  })

  it('marks scores below 0.4 as "error" severity', () => {
    const lowResult: EvaluationResult = {
      ...makeResult(),
      samples: [
        {
          id: 'low',
          question: 'Test?',
          scores: { faithfulness: 0.2 }, // below 0.4 → error
        },
      ],
    }
    lowResult.meta.metrics = ['faithfulness']
    const sarif = JSON.parse(toSarif(lowResult, 0.5)) as {
      runs: { results: { level: string }[] }[]
    }
    const sarifResults = sarif.runs[0]?.results ?? []
    expect(sarifResults[0]?.level).toBe('error')
  })

  it('marks scores between threshold and 0.4 as "warning" severity', () => {
    const warnResult: EvaluationResult = {
      ...makeResult(),
      samples: [
        {
          id: 'warn',
          question: 'Test?',
          scores: { faithfulness: 0.5 }, // above 0.4 but below threshold 0.7 → warning
        },
      ],
    }
    warnResult.meta.metrics = ['faithfulness']
    const sarif = JSON.parse(toSarif(warnResult, 0.7)) as {
      runs: { results: { level: string }[] }[]
    }
    const sarifResults = sarif.runs[0]?.results ?? []
    expect(sarifResults[0]?.level).toBe('warning')
  })

  it('includes run properties: provider, model, totalSamples', () => {
    const sarif = JSON.parse(toSarif(makeResult())) as {
      runs: { properties: { provider: string; model: string; totalSamples: number } }[]
    }
    const props = sarif.runs[0].properties
    expect(props.provider).toBe('anthropic')
    expect(props.model).toBe('claude-opus-4-6')
    expect(props.totalSamples).toBe(2)
  })

  it('uses build-time version or fallback 0.0.0', () => {
    const sarif = JSON.parse(toSarif(makeResult())) as {
      runs: { tool: { driver: { version: string } } }[]
    }
    const version = sarif.runs[0]?.tool.driver.version ?? ''
    // Should be a valid semver-like string (either real version or fallback)
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('includes reasoning in result properties when present', () => {
    const result = makeResult()
    result.samples[0].reasoning = { faithfulness: 'Detailed explanation here' }
    const sarif = JSON.parse(toSarif(result, 0.99)) as {
      runs: { results: { properties: { reasoning?: string } }[] }[]
    }
    const sarifResults = sarif.runs[0]?.results ?? []
    const faithfulnessResult = sarifResults.find((r) => {
      const rr = r as { ruleId?: string }
      return rr.ruleId === 'rageval/faithfulness'
    }) as { properties?: { reasoning?: string } } | undefined
    expect(faithfulnessResult?.properties?.reasoning).toBe('Detailed explanation here')
  })
})

describe('toSarif — missing branch coverage', () => {
  it('falls back to 1-based index sampleId in logicalLocations when sample has no id', () => {
    const result: EvaluationResult = {
      scores: { faithfulness: 0.3, overall: 0.3 },
      samples: [
        // No id — sampleId should fall back to String(idx + 1) = '1'
        { question: 'What is water?', scores: { faithfulness: 0.3 } },
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
    interface SarifShape {
      runs: { results: { locations: { logicalLocations: { name: string }[] }[] }[] }[]
    }
    const sarif = JSON.parse(toSarif(result, 0.5)) as SarifShape
    const logicalName = sarif.runs[0].results[0].locations[0].logicalLocations[0].name
    // logicalLocations[0].name = sampleId = String(idx + 1) = '1' (no id on sample)
    expect(logicalName).toBe('1')
  })
})
describe('toSarif — __RAGEVAL_VERSION__ defined branch', () => {
  it('uses the injected build version when __RAGEVAL_VERSION__ is defined', async () => {
    // RAGEVAL_VERSION is a module-level constant evaluated at import time.
    // vi.stubGlobal alone won't work — must resetModules and re-import AFTER the stub
    // so the ternary `typeof __RAGEVAL_VERSION__ !== 'undefined' ? ... : '0.0.0'` re-runs.
    vi.stubGlobal('__RAGEVAL_VERSION__', '1.2.3')
    vi.resetModules()
    try {
      const { toSarif: toSarifFresh } = await import('../../src/utils/sarif-report.js')
      const result: EvaluationResult = {
        scores: { faithfulness: 0.3, overall: 0.3 },
        samples: [{ question: 'Q', scores: { faithfulness: 0.3 } }],
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
      const sarif = JSON.parse(toSarifFresh(result, 0.5)) as {
        runs: { tool: { driver: { version: string } } }[]
      }
      // The SARIF toolVersion should reflect the stubbed version
      expect(sarif.runs[0].tool.driver.version).toBe('1.2.3')
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})
