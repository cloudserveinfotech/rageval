/**
 * CI Quality Gate Example — rageval
 *
 * Demonstrates how to use `thresholds` with `evaluate()` to enforce minimum
 * quality scores in a CI pipeline. When any metric score falls below its
 * threshold, `evaluate()` throws a `ThresholdError` — causing the CI job to
 * fail with a clear error message and a non-zero exit code.
 *
 * This pattern is the recommended way to use rageval in CI:
 *   1. Run `evaluate()` with `thresholds` set per metric
 *   2. Catch `ThresholdError` to log a summary before exiting
 *   3. Re-throw (or call `process.exit(1)`) to fail the CI job
 *
 * `ThresholdError` carries the full `EvaluationResult` on `err.result`, so
 * you can export SARIF / JUnit reports even when the quality gate fails —
 * useful for surfacing failures as GitHub code-scanning alerts or CI test reports.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/ci-quality-gate.ts
 */

import { writeFileSync } from 'node:fs'

import Anthropic from '@anthropic-ai/sdk'

import {
  ThresholdError,
  answerRelevance,
  contextRelevance,
  evaluate,
  faithfulness,
  printReport,
  toJUnit,
  toSarif,
} from '../src/index.js'

const client = new Anthropic()

// ---------------------------------------------------------------------------
// Quality thresholds — adjust these to match your pipeline's requirements.
// Start permissive (0.5) and tighten as your pipeline matures.
// ---------------------------------------------------------------------------
const THRESHOLDS = {
  faithfulness: 0.7, // answers must be grounded in retrieved context
  contextRelevance: 0.6, // retrieved chunks must be on-topic
  answerRelevance: 0.7, // answers must directly address the question
}

try {
  const result = await evaluate({
    provider: {
      type: 'anthropic',
      client,
      model: 'claude-haiku-4-5-20251001',
      // temperature: 0 is mandatory for CI — ensures deterministic scores
      // so the same dataset produces the same pass/fail result on every run.
      temperature: 0,
    },
    dataset: [
      {
        id: 'ci-sample-1',
        question: 'What is the boiling point of water at sea level?',
        answer: 'Water boils at 100 degrees Celsius (212°F) at standard atmospheric pressure.',
        contexts: [
          'The boiling point of water at sea level (standard atmospheric pressure of 101.325 kPa) is 100°C (212°F).',
          'At higher altitudes, reduced atmospheric pressure causes water to boil at lower temperatures.',
        ],
        groundTruth: 'Water boils at 100°C (212°F) at sea level.',
      },
      {
        id: 'ci-sample-2',
        question: 'Who developed the TypeScript programming language?',
        answer: 'TypeScript was developed by Microsoft and first released in 2012.',
        contexts: [
          'TypeScript is a strongly typed programming language developed and maintained by Microsoft.',
          'TypeScript 0.8 was first released in October 2012 after two years of internal development.',
        ],
        groundTruth: 'TypeScript was developed by Microsoft.',
      },
    ],
    metrics: [faithfulness, contextRelevance, answerRelevance],
    // Quality gate: evaluate() will throw ThresholdError if any metric misses its target.
    thresholds: THRESHOLDS,
    includeReasoning: false, // skip reasoning in CI to save tokens and reduce latency
  })

  // -------------------------------------------------------------------------
  // All metrics passed — report results and exit 0.
  // -------------------------------------------------------------------------
  console.log('✅ Quality gate PASSED — all metric scores are above thresholds.\n')
  printReport(result)

  // Write machine-readable reports as CI artifacts.
  // These are useful for trend tracking even when the gate passes.
  writeFileSync('junit-results.xml', toJUnit(result))
  writeFileSync('rageval.sarif', toSarif(result))
  console.log('\nArtifacts written: junit-results.xml, rageval.sarif')
} catch (err) {
  if (err instanceof ThresholdError) {
    // -----------------------------------------------------------------------
    // One or more metrics failed — log a clear summary then exit non-zero
    // to fail the CI job.
    //
    // err.failures is Record<string, { score, threshold }> — iterate with
    // Object.entries() to get [metricName, { score, threshold }] pairs.
    //
    // err.result is the full EvaluationResult — use it to write reports even
    // when the gate fails, so you can diagnose which samples caused the regression.
    // -----------------------------------------------------------------------
    console.error('❌ Quality gate FAILED — one or more metrics are below threshold.\n')

    // Log each failed metric with actual vs. required score
    for (const [metric, { score, threshold }] of Object.entries(err.failures)) {
      const pct = (score * 100).toFixed(1)
      const req = (threshold * 100).toFixed(0)
      console.error(`  ${metric}: ${pct}% (required: ≥${req}%)`)
    }

    // Still write reports using err.result — they help diagnose WHY the gate failed
    writeFileSync('junit-results.xml', toJUnit(err.result))
    writeFileSync('rageval.sarif', toSarif(err.result))
    console.error('\nArtifacts written: junit-results.xml, rageval.sarif')
    console.error('Upload rageval.sarif to GitHub code-scanning to see failures as PR alerts.')

    // Exit with non-zero code to fail the CI job
    process.exit(1)
  }

  // Unexpected error (network failure, invalid API key, etc.) — re-throw
  throw err
}
