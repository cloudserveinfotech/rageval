# Contributing to rageval

Thank you for your interest in contributing to `rageval`! This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

1. Check the [existing issues](https://github.com/cloudserveinfotech/rageval/issues) first
2. If your bug isn't reported yet, open a new issue using the **Bug Report** template
3. Include: Node.js version, `rageval` version, minimal reproduction, expected vs actual behavior

### Suggesting Features

1. Open a [GitHub Discussion](https://github.com/cloudserveinfotech/rageval/discussions) to discuss your idea first
2. If the idea is approved, open an issue using the **Feature Request** template
3. PRs for features without prior discussion may be closed

### Submitting Pull Requests

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature-name` or `fix/your-bug-name`
3. Make your changes (see Development Guide below)
4. Ensure all checks pass (see Checks section below)
5. Open a PR against `main` with a clear description

---

## Development Guide

### Prerequisites

- Node.js 18.0.0 or higher (`>=18` — the library's minimum supported version)
- Node.js 22 LTS is **recommended** for the best development experience
- pnpm 9.0.0 or higher (10.x recommended)

```bash
node --version  # Should be >= 18, ideally 22
pnpm --version  # Should be >= 9
```

### Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/rageval.git
cd rageval

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Type-check
pnpm type-check

# Lint
pnpm lint

# Build
pnpm build
```

### Project Structure

```
rageval/
├── src/
│   ├── index.ts              # Public API exports
│   ├── evaluate.ts           # Core evaluate() function
│   ├── metrics/              # Individual metric implementations
│   ├── providers/            # Anthropic + OpenAI adapters
│   ├── schemas/              # Zod v4 input/output schemas
│   ├── utils/                # Shared utilities
│   └── cli/                  # CLI entrypoint
├── tests/                    # Mirrors src/ structure
│   ├── metrics/
│   ├── providers/
│   ├── utils/
│   ├── schemas/
│   └── evaluate.test.ts
└── examples/                 # Usage examples
```

### Adding a New Metric

This walkthrough adds a hypothetical `citationAccuracy` metric from scratch.

**Step 1 — Create `src/metrics/citation-accuracy.ts`**

All metrics implement the `Metric` interface from `src/metrics/types.ts`. The minimum shape is:

```typescript
import { jsonInstruction, parseLlmScore } from './parse.js'
import type { Metric, MetricInput, MetricOutput } from './types.js'
import type { LlmProvider } from '../providers/types.js'

/**
 * Measures whether the answer accurately cites and represents its sources.
 *
 * Scores 1.0 when every factual claim in the answer is directly supported by
 * a cited source. Scores 0.0 when the answer fabricates or misrepresents sources.
 */
export const citationAccuracy: Metric = {
  name: 'citationAccuracy',

  description: 'Does the answer accurately represent the sources it draws from?',

  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    const contextBlock = input.contexts.map((ctx, i) => `[Source ${i + 1}]: ${ctx}`).join('\n\n')

    const prompt = `You are evaluating whether an AI answer accurately represents its sources.

QUESTION: ${input.question}

SOURCES:
${contextBlock}

ANSWER: ${input.answer}

Think step by step:
1. List each factual claim in the answer.
2. For each claim, identify whether it is directly supported by a source.
3. Assign a score based on how accurately the answer represents the sources.

Scoring rubric:
- 1.00 — Every claim is directly and accurately supported by the sources.
- 0.75 — Most claims are accurate; one minor misrepresentation.
- 0.50 — Some claims are accurate; one notable distortion or unsupported claim.
- 0.25 — Many claims are inaccurate or distort what the sources say.
- 0.00 — The answer fabricates content or fundamentally misrepresents the sources.

${jsonInstruction(includeReasoning)}`

    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)
    return { score, ...(includeReasoning && { reasoning }) }
  },
}
```

Key points:

- `name` must be a unique camelCase string — it becomes the key in `results.scores`.
- `description` appears in HTML/Markdown reports under the Metric Legend section.
- Use `jsonInstruction(includeReasoning)` to append the standard JSON output instruction.
- Use `parseLlmScore(response)` to extract the score — it handles all LLM output edge cases.
- Use a **5-point rubric** (0.0 / 0.25 / 0.5 / 0.75 / 1.0) for consistent scoring.
- Always include `"Think step by step:"` before the rubric for chain-of-thought reasoning.

**Step 2 — Write tests in `tests/metrics/citation-accuracy.test.ts`**

Follow the same pattern as the existing metric tests. Minimum coverage:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { citationAccuracy } from '../../src/metrics/citation-accuracy.js'
import type { LlmProvider } from '../../src/providers/types.js'

function mockProvider(score: number, reasoning = ''): LlmProvider {
  return {
    name: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    complete: vi.fn().mockResolvedValue(JSON.stringify({ score, reasoning })),
  }
}

const baseInput = {
  question: 'What is TypeScript?',
  answer: 'TypeScript is a typed superset of JavaScript.',
  contexts: ['TypeScript adds optional static typing to JavaScript.'],
}

describe('citationAccuracy', () => {
  it('returns a score in [0, 1]', async () => {
    const { score } = await citationAccuracy.score(baseInput, mockProvider(0.9))
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('includes reasoning when includeReasoning is true', async () => {
    const { score, reasoning } = await citationAccuracy.score(
      baseInput,
      mockProvider(0.9, 'Well cited.'),
      true,
    )
    expect(score).toBeCloseTo(0.9)
    expect(reasoning).toBe('Well cited.')
  })

  it('omits reasoning when includeReasoning is false', async () => {
    const { reasoning } = await citationAccuracy.score(baseInput, mockProvider(0.9))
    expect(reasoning).toBeUndefined()
  })
})
```

**Step 3 — Wire it up (5 files to touch)**

| File                   | Change                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `src/metrics/index.ts` | `export { citationAccuracy } from './citation-accuracy.js'`         |
| `src/index.ts`         | `export { citationAccuracy } from './metrics/citation-accuracy.js'` |
| `src/evaluate.ts`      | Add `citationAccuracy` to `ALL_METRICS` array                       |
| `src/cli/index.ts`     | Add `citationAccuracy` to `METRIC_MAP`                              |
| `README.md`            | Add a row to the metrics table and describe the metric              |

**Step 4 — Run the full quality gate**

```bash
pnpm type-check    # must pass — 0 TypeScript errors
pnpm lint          # must pass — 0 ESLint errors
pnpm test:coverage # must pass — 375+ tests, ≥85% branch coverage
pnpm build         # must pass — clean ESM + CJS build
```

**Step 5 — Open a PR**

Your PR description should include:

- What the metric measures and why it's useful
- The scoring rubric you chose and why
- Example scores on a few sample inputs
- Whether `groundTruth` is required (like `contextRecall`) or optional

### Adding a New Provider

1. Create `src/providers/your-provider.ts` implementing `LlmProvider`
2. Add the config type to `src/providers/types.ts`
3. Handle it in `src/providers/factory.ts`
4. Export from `src/providers/index.ts` and `src/index.ts`
5. Write tests in `tests/providers/your-provider.test.ts`

---

## Checks (all must pass before merge)

```bash
pnpm type-check    # TypeScript — 0 errors
pnpm lint          # ESLint 10 flat config — 0 errors
pnpm format:check  # Prettier — 0 diff
pnpm test:coverage # Vitest — 90%+ lines/functions/statements, 85%+ branches
pnpm build         # tsup — ESM + CJS + .d.ts output
```

Run all at once:

```bash
pnpm prepublishOnly
```

---

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add contextPrecision metric
fix: handle empty contexts array in faithfulness
docs: add custom metrics example
test: add edge cases for batch concurrency
chore: bump dependencies
```

---

## Versioning

We use [Changesets](https://github.com/changesets/changesets) for versioning.

For every PR that changes functionality:

```bash
pnpm changeset
# Select: patch / minor / major
# Write a summary of the change
```

---

## Questions?

Open a [GitHub Discussion](https://github.com/cloudserveinfotech/rageval/discussions) — we're happy to help.
