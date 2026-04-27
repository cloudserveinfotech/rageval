/**
 * Custom Vitest / Jest matchers for rageval.
 *
 * Register them once in your test setup file:
 *
 * ```typescript
 * // vitest.setup.ts  (or jest.setup.ts)
 * import { ragevalMatchers } from 'rageval/matchers'
 * expect.extend(ragevalMatchers)
 * ```
 *
 * Then in your tests:
 *
 * ```typescript
 * const results = await evaluate({ ... })
 *
 * expect(results).toHaveScoreAbove('faithfulness', 0.8)
 * expect(results).toPassThresholds({ faithfulness: 0.8, answerRelevance: 0.75 })
 * ```
 */

import type { EvaluationResult } from './schemas/results.js'

/**
 * Standard return shape for a Vitest / Jest custom matcher.
 *
 * Matcher functions return `{ pass, message }`:
 * - `pass: true` means the assertion succeeded (no error thrown)
 * - `pass: false` means the assertion failed; `message()` is invoked to produce
 *   the error string shown by the test runner
 */
export interface MatcherResult {
  pass: boolean
  message: () => string
}

/**
 * Assert that a specific metric's aggregate score is above a minimum value.
 *
 * @example
 * expect(results).toHaveScoreAbove('faithfulness', 0.8)
 */
function toHaveScoreAbove(
  this: { isNot: boolean },
  received: EvaluationResult,
  metric: string,
  minScore: number,
): MatcherResult {
  const scores = received.scores as Record<string, number | undefined>
  const actual = scores[metric]

  if (actual === undefined) {
    return {
      pass: false,
      message: () =>
        `Expected evaluation result to have a score for metric "${metric}", but it was not found.\n` +
        `Available metrics: ${Object.keys(scores).join(', ')}`,
    }
  }

  const pass = actual >= minScore

  return {
    pass,
    message: () => {
      const direction = this.isNot ? 'below' : 'above'
      return (
        `Expected "${metric}" score to be ${direction} ${minScore}, ` +
        `but got ${actual.toFixed(4)}`
      )
    },
  }
}

/**
 * Assert that ALL aggregate scores in an evaluation result meet their thresholds.
 *
 * @example
 * expect(results).toPassThresholds({ faithfulness: 0.8, answerRelevance: 0.75 })
 */
function toPassThresholds(
  this: { isNot: boolean },
  received: EvaluationResult,
  thresholds: Partial<Record<string, number>>,
): MatcherResult {
  const scores = received.scores as Record<string, number | undefined>
  const failures: { metric: string; actual: number; threshold: number }[] = []

  for (const [metric, threshold] of Object.entries(thresholds)) {
    if (threshold === undefined) continue
    const actual = scores[metric]
    if (actual === undefined) continue // metric not evaluated — skip silently
    if (actual < threshold) {
      failures.push({ metric, actual, threshold })
    }
  }

  const pass = failures.length === 0

  return {
    pass,
    message: () => {
      if (this.isNot) {
        return 'Expected evaluation result NOT to pass all thresholds, but it did.'
      }
      const lines = failures
        .map((f) => `  ${f.metric}: ${f.actual.toFixed(4)} < ${f.threshold}`)
        .join('\n')
      return `Expected all scores to meet thresholds, but these failed:\n${lines}`
    },
  }
}

/**
 * All rageval matchers — pass this object to `expect.extend()`.
 *
 * @example
 * import { ragevalMatchers } from 'rageval/matchers'
 * expect.extend(ragevalMatchers)
 */
export const ragevalMatchers = {
  toHaveScoreAbove,
  toPassThresholds,
} as const

// TypeScript augmentation — makes the matchers available as typed methods
// when imported in a test setup file.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    interface Assertion {
      toHaveScoreAbove(metric: string, minScore: number): void
      toPassThresholds(thresholds: Partial<Record<string, number>>): void
    }
    interface AsymmetricMatchersContaining {
      toHaveScoreAbove(metric: string, minScore: number): void
      toPassThresholds(thresholds: Partial<Record<string, number>>): void
    }
  }
  // Jest augmentation
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHaveScoreAbove(metric: string, minScore: number): R
      toPassThresholds(thresholds: Partial<Record<string, number>>): R
    }
  }
}
