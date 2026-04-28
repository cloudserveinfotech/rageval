import type { EvaluationResult } from '../schemas/results.js'

// Build-time version constant injected by tsup `define` in tsup.config.ts.
// Falls back to '0.0.0' in environments where the build step did not run
// (e.g. ts-node, vitest running source directly).
declare const __RAGEVAL_VERSION__: string
const RAGEVAL_VERSION = typeof __RAGEVAL_VERSION__ !== 'undefined' ? __RAGEVAL_VERSION__ : '0.0.0'

/**
 * Serializes an EvaluationResult to SARIF 2.1.0 format.
 *
 * SARIF (Static Analysis Results Interchange Format) is the standard used by
 * GitHub Advanced Security, Azure DevOps, and other code-quality tools.
 * Upload the SARIF file to GitHub to see evaluation failures as code-scanning
 * alerts on your pull requests -- directly in the diff.
 *
 * Each sample that scores below `failureThreshold` on any metric becomes a
 * SARIF "result" with severity "warning" (score < threshold) or "error"
 * (score < 0.4). Samples that pass all thresholds produce no SARIF results.
 *
 * @param result           - The evaluation result from `evaluate()`.
 * @param failureThreshold - Score below which a sample is flagged. Default: 0.6.
 * @returns SARIF 2.1.0 JSON string.
 *
 * @example
 * ```typescript
 * import { evaluate, toSarif } from 'rageval'
 * import { writeFileSync } from 'node:fs'
 *
 * const result = await evaluate({ ... })
 * writeFileSync('rageval.sarif', toSarif(result))
 * // Upload via GitHub CLI:
 * // gh api /repos/{owner}/{repo}/code-scanning/sarifs --field sarif=@rageval.sarif
 * ```
 */
export function toSarif(result: EvaluationResult, failureThreshold = 0.6): string {
  const { samples, meta, scores } = result
  const metricKeys = meta.metrics

  // Build one SARIF rule per metric -- each rule describes what the metric
  // measures and provides tags for filtering in GitHub's Security tab.
  const rules = metricKeys.map((metric) => ({
    id: `rageval/${metric}`,
    name: metric,
    shortDescription: { text: `RAG pipeline ${metric} metric` },
    fullDescription: {
      text: `Evaluates ${metric} quality in the RAG pipeline. Scores range from 0.0 (worst) to 1.0 (best).`,
    },
    defaultConfiguration: { level: 'warning' },
    properties: {
      tags: ['rageval', 'rag', 'llm-evaluation'],
      precision: 'medium',
      'problem.severity': 'warning',
    },
  }))

  // Build one SARIF result per (sample x failing metric) pair.
  // score < 0.4 → 'error' severity; threshold <= score < failureThreshold → 'warning'.
  const sarifResults: object[] = []

  for (const [idx, sample] of samples.entries()) {
    const sampleId = sample.id ?? String(idx + 1)

    for (const metric of metricKeys) {
      const score = sample.scores[metric]
      if (score === undefined || score >= failureThreshold) continue

      const level = score < 0.4 ? 'error' : 'warning'
      const pct = (score * 100).toFixed(1)
      const threshold = (failureThreshold * 100).toFixed(0)

      sarifResults.push({
        ruleId: `rageval/${metric}`,
        level,
        message: {
          text: `Sample [${sampleId}]: ${metric} score is ${pct}% (below ${threshold}% threshold). Question: "${sample.question.slice(0, 100)}"`,
        },
        locations: [
          {
            physicalLocation: {
              // Point to the dataset file by convention; adjust if your
              // dataset lives at a different path relative to the repo root.
              artifactLocation: { uri: 'dataset.json', uriBaseId: '%SRCROOT%' },
              region: { startLine: idx + 1 },
            },
            logicalLocations: [
              { name: sampleId, kind: 'member', fullyQualifiedName: `dataset[${idx}]` },
            ],
          },
        ],
        properties: {
          sampleId,
          metric,
          score,
          threshold: failureThreshold,
          question: sample.question,
          // Include LLM reasoning in SARIF properties when available --
          // makes it easy to understand why a sample failed in the PR review UI.
          ...(sample.reasoning?.[metric] ? { reasoning: sample.reasoning[metric] } : {}),
        },
      })
    }
  }

  const aggregateScores = Object.fromEntries(
    Object.entries(scores).filter(([, v]) => v !== undefined),
  )

  const sarif = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'rageval',
            // Version is injected at build time by tsup define; always matches
            // the published package version rather than being hardcoded.
            version: RAGEVAL_VERSION,
            informationUri: 'https://github.com/cloudserveinfotech/rageval',
            rules,
          },
        },
        invocations: [
          {
            executionSuccessful: true,
            startTimeUtc: meta.startedAt,
            endTimeUtc: meta.completedAt,
            toolExecutionNotifications: [],
          },
        ],
        properties: {
          provider: meta.provider,
          model: meta.model,
          totalSamples: meta.totalSamples,
          aggregateScores,
          durationMs: meta.durationMs,
        },
        results: sarifResults,
      },
    ],
  }

  return JSON.stringify(sarif, null, 2)
}
