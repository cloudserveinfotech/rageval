import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// These tests guard the published surface: they import the actual built dist
// the same way a user would, catching regressions in package.json `exports`,
// missing files, broken shebangs, or symbols that ship typed but undefined.

const distRoot = resolve(__dirname, '..', 'dist')

const expectedExports = [
  // Core
  'evaluate',
  'ThresholdError',
  // Metrics
  'faithfulness',
  'contextRelevance',
  'answerRelevance',
  'contextRecall',
  'contextPrecision',
  // Providers
  'createAnthropicProvider',
  'createOpenAIProvider',
  'createAzureOpenAIProvider',
  // Reporters
  'toJson',
  'toCsv',
  'toHtml',
  'toMarkdown',
  'toJUnit',
  'toSarif',
  'printReport',
  // Utilities
  'cosineSimilarity',
  'jsonInstruction',
  'parseLlmScore',
  // Schemas (runtime validation)
  'RagSampleSchema',
  'DatasetSchema',
  'MetricNameSchema',
  'ProviderTypeSchema',
  'MetricScoreSchema',
  'SampleScoresSchema',
  'SampleResultSchema',
  'AggregateScoresSchema',
  'MetricStatsSchema',
  'EvaluationResultSchema',
] as const

describe('public API — built dist artefacts', () => {
  it('all expected ESM, CJS, and DTS files exist on disk', () => {
    const required = [
      'index.js',
      'index.cjs',
      'index.d.ts',
      'index.d.cts',
      'matchers.js',
      'matchers.cjs',
      'matchers.d.ts',
      'matchers.d.cts',
      'cli/index.js',
      'cli/index.cjs',
    ]
    for (const f of required) {
      expect(existsSync(resolve(distRoot, f)), `dist/${f} should exist`).toBe(true)
    }
  })
})

describe('public API — ESM entrypoint', () => {
  it('exports every documented public symbol', async () => {
    const mod = (await import(resolve(distRoot, 'index.js').replace(/\\/g, '/'))) as Record<
      string,
      unknown
    >
    for (const name of expectedExports) {
      expect(mod[name], `ESM export "${name}" should be defined`).toBeDefined()
    }
  })

  it('evaluate and metrics are callable', async () => {
    const mod = (await import(resolve(distRoot, 'index.js').replace(/\\/g, '/'))) as {
      evaluate: unknown
      faithfulness: { name: string; score: unknown }
    }
    expect(typeof mod.evaluate).toBe('function')
    expect(mod.faithfulness.name).toBe('faithfulness')
    expect(typeof mod.faithfulness.score).toBe('function')
  })
})

describe('public API — matchers subpath', () => {
  it('exports ragevalMatchers with both matcher functions', async () => {
    const mod = (await import(resolve(distRoot, 'matchers.js').replace(/\\/g, '/'))) as {
      ragevalMatchers: Record<string, unknown>
    }
    expect(mod.ragevalMatchers).toBeDefined()
    expect(typeof mod.ragevalMatchers.toHaveScoreAbove).toBe('function')
    expect(typeof mod.ragevalMatchers.toPassThresholds).toBe('function')
  })
})

describe('public API — CommonJS entrypoint', () => {
  it('require() loads every documented public symbol', () => {
    // Spawn a child Node process so this test exercises the actual CJS resolver
    // path (same as a JS-only user). Importing CJS directly from an ESM test
    // file goes through Node's interop layer, which can mask CJS-only bugs.
    const cjsPath = resolve(distRoot, 'index.cjs')
    const script = `
      const mod = require(${JSON.stringify(cjsPath)})
      const expected = ${JSON.stringify(expectedExports)}
      const missing = expected.filter(k => mod[k] === undefined)
      if (missing.length > 0) {
        console.error('MISSING:' + missing.join(','))
        process.exit(1)
      }
      console.log('OK')
    `
    const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })
    expect(out.trim()).toBe('OK')
  })
})

describe('public API — CLI binary', () => {
  it('--help exits 0 and prints usage', () => {
    const cliPath = resolve(distRoot, 'cli', 'index.cjs')
    const out = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' })
    expect(out).toContain('Usage:')
    expect(out).toContain('rageval')
    expect(out).toContain('eval')
  })

  it('--version exits 0 and prints a semver string', () => {
    const cliPath = resolve(distRoot, 'cli', 'index.cjs')
    const out = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' })
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('eval --help describes the eval subcommand', () => {
    const cliPath = resolve(distRoot, 'cli', 'index.cjs')
    const out = execFileSync(process.execPath, [cliPath, 'eval', '--help'], { encoding: 'utf8' })
    expect(out).toContain('--dataset')
    expect(out).toContain('--provider')
  })
})
