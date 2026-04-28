# rageval

[![npm version](https://img.shields.io/npm/v/%40rageval%2Feval.svg)](https://www.npmjs.com/package/@rageval/eval)
[![CI](https://github.com/cloudserveinfotech/rageval/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudserveinfotech/rageval/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/cloudserveinfotech/rageval/branch/main/graph/badge.svg)](https://codecov.io/gh/cloudserveinfotech/rageval)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm downloads](https://img.shields.io/npm/dm/%40rageval%2Feval.svg)](https://www.npmjs.com/package/@rageval/eval)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@rageval/eval)](https://bundlephobia.com/package/@rageval/eval)
[![Docs](https://img.shields.io/badge/docs-API%20Reference-blue)](https://cloudserveinfotech.github.io/rageval/)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/cloudserveinfotech/rageval/badge)](https://scorecard.dev/viewer/?uri=github.com/cloudserveinfotech/rageval)
[![OpenSSF Baseline](https://www.bestpractices.dev/projects/12673/baseline)](https://www.bestpractices.dev/projects/12673)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)

**RAGAS-style RAG evaluation for Node.js.** Evaluate your RAG pipeline quality in TypeScript.

> 🎮 **Try the browser playground** — paste your Q&A pair, add your API key, get scores instantly:
>
> ```bash
> git clone https://github.com/cloudserveinfotech/rageval.git
> cd rageval && node playground/server.js
> # Opens http://localhost:3000 automatically
> ```

[RAGAS](https://github.com/vibrantlabsai/ragas) is the gold standard for RAG evaluation in Python. `rageval` brings the same evaluation methodology to TypeScript and Node.js — with a clean API, multi-provider support (Anthropic Claude, OpenAI, and Azure OpenAI), and full TypeScript types.

---

## Why rageval?

Every company building RAG pipelines in Node.js/TypeScript faces the same problem: **how do you know if your RAG pipeline is good?** Without evaluation, you're flying blind.

`rageval` gives you objective, automated quality scores for:

| Metric                  | What it measures                                                 |
| ----------------------- | ---------------------------------------------------------------- |
| **Answer Faithfulness** | Is the answer grounded in the context? (hallucination detection) |
| **Context Relevance**   | Is the retrieved context relevant to the question?               |
| **Answer Relevance**    | Does the answer actually address the question?                   |
| **Context Recall**      | Does the context contain the ground truth?                       |
| **Context Precision**   | What fraction of retrieved chunks are relevant?                  |

---

## Install

```bash
pnpm add @rageval/eval
npm install @rageval/eval
```

You also need one LLM provider installed (at least one is required):

```bash
# Anthropic Claude (recommended)
pnpm add @anthropic-ai/sdk

# OpenAI
pnpm add openai
```

> **JavaScript / CommonJS:** rageval ships both ESM and CommonJS builds. You can use it from plain JavaScript with `require` or with an `import` statement — no TypeScript required.
>
> ```js
> // CommonJS (Node.js without "type": "module")
> const { evaluate, faithfulness } = require('@rageval/eval')
>
> // ESM in plain .mjs or in a package with "type": "module"
> import { evaluate, faithfulness } from '@rageval/eval'
> ```

> **Privacy note:** When you call `evaluate()`, your questions, answers, and context chunks are sent to your chosen LLM provider's API (Anthropic or OpenAI). rageval itself stores nothing and has no servers. See [PRIVACY.md](./PRIVACY.md) for full details. Ensure your use of the provider API complies with your data handling obligations.

---

## Quick Start

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { evaluate, faithfulness, contextRelevance, answerRelevance } from '@rageval/eval'

const client = new Anthropic()

const results = await evaluate({
  provider: { type: 'anthropic', client, model: 'claude-haiku-4-5-20251001' },
  dataset: [
    {
      question: 'What is the capital of France?',
      answer: 'The capital of France is Paris.',
      contexts: ['France is a country in Western Europe. Its capital city is Paris.'],
      groundTruth: 'Paris', // optional — required only for contextRecall
    },
  ],
  metrics: [faithfulness, contextRelevance, answerRelevance],
})

console.log(results.scores)
// {
//   faithfulness: 0.97,
//   contextRelevance: 0.91,
//   answerRelevance: 0.95,
//   overall: 0.94
// }
```

---

> **A note on `myDataset` / `largeDataset`** — throughout the rest of this README, code samples refer to `myDataset` and `largeDataset` as placeholders for **your own evaluation data**. Both are arrays of `RagSample` objects with the same shape as the Quick Start above (`{ question, answer, contexts, groundTruth? }`). Replace them with your real data when copy-pasting.

---

## With OpenAI

```typescript
import OpenAI from 'openai'
import { evaluate, faithfulness, contextRelevance } from '@rageval/eval'

const client = new OpenAI()

const results = await evaluate({
  provider: { type: 'openai', client, model: 'gpt-4o-mini' },
  dataset: myDataset, // your RagSample[] — see Quick Start for the shape
  metrics: [faithfulness, contextRelevance],
})
```

---

## With Azure OpenAI

For enterprise teams with data residency requirements or Azure-hosted infrastructure. Uses `type: 'azure'` with the `AzureOpenAI` SDK client.

```typescript
import { AzureOpenAI } from 'openai'
import { evaluate, faithfulness, contextRelevance } from '@rageval/eval'

// AzureOpenAI reads AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT from env
const client = new AzureOpenAI({ apiVersion: '2024-10-21' })

const results = await evaluate({
  provider: {
    type: 'azure',
    client,
    model: 'gpt-4o-mini', // your Azure deployment name
    temperature: 0,
  },
  dataset: myDataset,
  metrics: [faithfulness, contextRelevance],
})
```

> **Data residency:** When using `type: 'azure'`, your data is processed by Azure OpenAI Service in the Azure region you chose — not by Anthropic or OpenAI directly. This satisfies most enterprise data residency requirements. See [PRIVACY.md](./PRIVACY.md) for details.

See [`examples/azure-openai.ts`](./examples/azure-openai.ts) for a full runnable example, including Managed Identity and VNet setup notes.

### Custom endpoints (Ollama, LocalAI, vLLM)

Any OpenAI-compatible server works via `baseURL`. Use `type: 'openai'` with a custom endpoint:

```typescript
import OpenAI from 'openai'

// Ollama running locally
const client = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama', // required by the SDK but ignored by Ollama
})

const results = await evaluate({
  provider: { type: 'openai', client, model: 'llama3.2' },
  dataset: myDataset,
  metrics: [faithfulness],
})
```

---

## Evaluate All 5 Metrics

```typescript
import { evaluate } from '@rageval/eval'

// Omit `metrics` to run all 5 automatically
const results = await evaluate({
  provider: { type: 'anthropic', client },
  dataset: myDataset,
  // metrics defaults to: [faithfulness, contextRelevance, answerRelevance, contextRecall, contextPrecision]
})
```

---

## Batch Evaluation with Concurrency

```typescript
const results = await evaluate({
  provider: { type: 'anthropic', client },
  dataset: largeDataset, // 100+ samples
  concurrency: 10, // 10 samples evaluated in parallel
})
```

---

## Checkpoint / Resume (Large Datasets)

For large datasets (50+ samples), use `checkpoint` to make your evaluation run fault-tolerant. If the run is interrupted — by a rate limit, network error, or Ctrl-C — simply re-run the same script. rageval will skip already-evaluated samples and pick up where it left off, at no extra API cost.

```typescript
const results = await evaluate({
  provider: { type: 'anthropic', client, model: 'claude-haiku-4-5-20251001' },
  dataset: largeDataset,
  concurrency: 5,

  // Progress is written to this file after every sample.
  // Re-run with the same path to resume from where you left off.
  checkpoint: './eval-progress.json',

  onProgress: (completed, total) => {
    process.stderr.write(`\r  Evaluating... ${completed}/${total}`)
  },
})

// Clean up the checkpoint after a successful run
// (rageval does not delete it automatically — you control the lifecycle)
import { unlinkSync } from 'node:fs'
unlinkSync('./eval-progress.json')
```

**Checkpoint keys:** Samples with an `id` field are keyed by id. Samples without an `id` are keyed by question text. Always use `id` for large datasets to avoid ambiguity.

**Checkpoint format:** `{ "version": 1, "samples": [...] }` — plain JSON, human-readable. Delete the file to force a fresh evaluation.

See [`examples/checkpoint-resume.ts`](./examples/checkpoint-resume.ts) for a complete runnable example.

---

## Per-Metric Score Statistics

`EvaluationResult.stats` contains min, max, mean, stddev, and count for each metric — useful for understanding score distribution across a dataset.

```typescript
const results = await evaluate({
  provider: { type: 'anthropic', client },
  dataset: largeDataset,
  metrics: [faithfulness, contextRelevance],
})

// Aggregate scores (mean across all samples)
console.log(results.scores)
// { faithfulness: 0.87, contextRelevance: 0.81, overall: 0.84 }

// Per-metric distribution statistics
console.log(results.stats)
// {
//   faithfulness:     { mean: 0.87, min: 0.62, max: 1.00, stddev: 0.11, count: 50 },
//   contextRelevance: { mean: 0.81, min: 0.45, max: 0.97, stddev: 0.14, count: 50 },
// }
```

Use `stddev` to detect inconsistency: a high standard deviation (>0.2) means the pipeline performs well on some queries but poorly on others — a sign to investigate retrieval quality for specific question types.

---

## Include LLM Reasoning (Debugging)

```typescript
const results = await evaluate({
  provider: { type: 'anthropic', client },
  dataset: myDataset,
  metrics: [faithfulness],
  includeReasoning: true, // LLM explains each score
})

console.log(results.samples[0].reasoning)
// { faithfulness: "The answer directly references 'Paris' which is mentioned in context [1]." }
```

---

## Multi-Tenant SaaS

If you run a multi-tenant product and want to evaluate RAG quality **per tenant**, tag each sample with `tenantId` (and optional `metadata`). Both fields propagate untouched to every `SampleResult`, so you can group, filter, or audit by tenant in the same evaluation run.

```typescript
import { evaluate, faithfulness } from '@rageval/eval'

const results = await evaluate({
  provider: { type: 'anthropic', client },
  dataset: [
    {
      id: 'q1',
      question: 'How do I reset my password?',
      answer: '...',
      contexts: ['...'],
      tenantId: 'acme-corp', // ← propagates to results.samples[i].tenantId
      metadata: { traceId: 'abc-123', pipelineVersion: '2.1.0' },
    },
    {
      id: 'q2',
      question: 'Where do I download invoices?',
      answer: '...',
      contexts: ['...'],
      tenantId: 'globex-inc',
    },
  ],
  metrics: [faithfulness],
})

// Group aggregate scores by tenant
const byTenant = new Map<string, number[]>()
for (const sample of results.samples) {
  if (sample.tenantId === undefined) continue
  const arr = byTenant.get(sample.tenantId) ?? []
  if (typeof sample.scores.faithfulness === 'number') arr.push(sample.scores.faithfulness)
  byTenant.set(sample.tenantId, arr)
}

for (const [tenant, scores] of byTenant) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  console.log(`${tenant}: faithfulness mean = ${mean.toFixed(3)} (${scores.length} samples)`)
}
```

**Isolation guarantees** — rageval does not enforce tenant boundaries at the evaluation layer. If your tenants must be strictly isolated (separate API keys, billing, audit trails), call `evaluate()` once per tenant. The `tenantId` field is for tagging and post-processing, not for sandboxing.

**Metadata propagation** — `metadata` is free-form and JSON-serialisable. Use it to carry trace IDs, pipeline versions, A/B variant labels, or anything else you want carried through reports, CSV exports, and SARIF output.

---

## Export & Reporting

rageval supports every standard output format — pick the one that fits your workflow.

```typescript
import { evaluate, toJson, toCsv, toHtml, toMarkdown, toJUnit, toSarif, printReport } from '@rageval/eval'
import { writeFileSync } from 'node:fs'

const results = await evaluate({ ... })

// ── Terminal ───────────────────────────────────────────────────────
printReport(results)                          // color-coded score bars + verdict
printReport(results, { showSamples: true })   // include per-sample breakdown

// ── Files ──────────────────────────────────────────────────────────
writeFileSync('results.json', toJson(results))          // machine-readable, full detail
writeFileSync('results.csv',  toCsv(results))           // spreadsheets / data analysis
writeFileSync('report.html',  toHtml(results))          // shareable visual report (self-contained)
writeFileSync('report.md',    toMarkdown(results))      // GitHub PR comments / wikis / docs
writeFileSync('junit.xml',    toJUnit(results))         // CI dashboards (Jenkins, GitHub, GitLab)
writeFileSync('sarif.json',   toSarif(results))         // GitHub Advanced Security code scanning
```

| Format          | Use case                                                     |
| --------------- | ------------------------------------------------------------ |
| `toJson()`      | Store results, feed into pipelines, debug                    |
| `toCsv()`       | Excel / Google Sheets / data analysis                        |
| `toHtml()`      | Beautiful self-contained report to share with stakeholders   |
| `toMarkdown()`  | GitHub PR comments, wikis, project docs                      |
| `toJUnit()`     | Any CI system — GitHub Actions, Jenkins, GitLab, CircleCI    |
| `toSarif()`     | GitHub code scanning — quality alerts appear in your PR diff |
| `printReport()` | Terminal summary with color-coded score bars                 |

**CSV format:** Each row is one sample. Columns: `id`, `question`, one column per metric score (e.g. `faithfulness`, `answerRelevance`), `overall` (per-sample mean). When `includeReasoning: true` is passed to `evaluate()`, additional `{metric}_reasoning` columns are appended — useful for audit logs in healthcare, legal, or compliance contexts.

---

## CLI Usage

```bash
# Install globally (or use npx)
npm install -g @rageval/eval

# Evaluate → terminal report + save JSON
ANTHROPIC_API_KEY=sk-ant-... rageval eval \
  --dataset ./my-dataset.json \
  --provider anthropic \
  --model claude-haiku-4-5-20251001 \
  --output results.json

# Generate a visual HTML report and open it in the browser
rageval eval --dataset ./data.json --provider anthropic \
  --format html --output report.html --open

# Post to GitHub PR as a Markdown comment
rageval eval --dataset ./data.json --provider anthropic \
  --format markdown --output report.md

# CI quality gate — JUnit XML for GitHub Actions test reporter
rageval eval --dataset ./data.json --provider anthropic \
  --format junit --output junit-results.xml

# GitHub Advanced Security — upload as code-scanning SARIF
rageval eval --dataset ./data.json --provider anthropic \
  --format sarif --output rageval.sarif

# With OpenAI, specific metrics, with reasoning
OPENAI_API_KEY=sk-... rageval eval \
  --dataset ./dataset.json \
  --provider openai \
  --model gpt-4o \
  --metrics faithfulness,answerRelevance \
  --reasoning \
  --format csv --output results.csv

# With Azure OpenAI Service (enterprise / data residency)
AZURE_OPENAI_ENDPOINT=https://my-resource.openai.azure.com \
AZURE_OPENAI_API_KEY=... rageval eval \
  --dataset ./dataset.json \
  --provider azure \
  --model my-gpt4o-deployment \
  --format sarif --output rageval.sarif

# Show per-sample breakdown in terminal
rageval eval --dataset ./data.json --provider anthropic --samples
```

**Supported `--format` values:** `json` · `csv` · `html` · `markdown` (alias: `md`) · `junit` (alias: `xml`) · `sarif`

### Dataset Format

Your dataset file should be a JSON array:

```json
[
  {
    "id": "q1",
    "question": "What is RAG?",
    "answer": "RAG stands for Retrieval-Augmented Generation...",
    "contexts": [
      "RAG (Retrieval-Augmented Generation) is a technique...",
      "RAG was introduced to address hallucination in LLMs..."
    ],
    "groundTruth": "RAG is Retrieval-Augmented Generation."
  }
]
```

Fields:

- `question` (required): The query asked of the RAG pipeline
- `answer` (required): The LLM-generated answer to evaluate
- `contexts` (required): Retrieved document chunks provided to the LLM
- `groundTruth` (optional): Expected answer — required for `contextRecall`
- `id` (optional): Identifier for traceability in results

> **Don't have an evaluation dataset yet?** [`rageval-testset`](https://github.com/cloudserveinfotech/rageval-testset) is the companion package that generates `RagSample[]` arrays directly from your documents (PDF, Markdown, plain text) — ready to pass straight into `evaluate()`. It handles chunking, question synthesis, faithfulness critic, diversity dedup, cost estimation, and bounded retries. Two function calls from raw docs to evaluation scores:
>
> ```typescript
> import { generate } from 'rageval-testset'
> import { evaluate } from '@rageval/eval'
>
> const result = await generate({ inputs: ['./docs/handbook.pdf'], testsetSize: 100, provider })
> const scores = await evaluate({ dataset: result.samples, provider })
> ```
>
> ```bash
> npm install rageval-testset
> ```

---

## CI Quality Gate (Score Thresholds)

Enforce minimum acceptable scores in CI — if your RAG pipeline regresses, the build fails automatically.

```typescript
import { evaluate, ThresholdError } from '@rageval/eval'

try {
  await evaluate({
    provider: { type: 'anthropic', client },
    dataset: myDataset,
    thresholds: {
      faithfulness: 0.8, // fail if hallucination detection drops
      answerRelevance: 0.75, // fail if answer quality drops
    },
  })
  console.log('Quality gate passed ✓')
} catch (e) {
  if (e instanceof ThresholdError) {
    console.error('Quality gate FAILED:')
    for (const [metric, { score, threshold }] of Object.entries(e.failures)) {
      console.error(`  ${metric}: ${score.toFixed(3)} < ${threshold}`)
    }
    process.exit(1)
  }
  throw e
}
```

---

## GitHub Actions Integration

Here is a complete, copy-pasteable workflow that runs rageval on every PR and uploads results as a SARIF code-scanning report so failures appear inline in the PR diff.

```yaml
# .github/workflows/rag-quality.yml
name: RAG Quality Gate

on:
  pull_request:
    branches: [main]

jobs:
  rag-eval:
    name: RAG Evaluation
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # required for uploading SARIF

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v5
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Evaluate RAG quality
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx rageval eval \
            --dataset ./eval/dataset.json \
            --provider anthropic \
            --model claude-haiku-4-5-20251001 \
            --format sarif \
            --output rageval.sarif

      - name: Upload SARIF to GitHub Advanced Security
        uses: github/codeql-action/upload-sarif@v3
        if: always() # upload even when the quality gate fails
        with:
          sarif_file: rageval.sarif
```

> Store your API key as a repository secret: **Settings → Secrets → Actions → New repository secret** → name it `ANTHROPIC_API_KEY`.

To also generate a JUnit test report (visible in the GitHub Actions **Tests** tab):

```yaml
- name: Evaluate RAG quality
  run: |
    npx rageval eval \
      --dataset ./eval/dataset.json \
      --provider anthropic \
      --model claude-haiku-4-5-20251001 \
      --format junit \
      --output junit-results.xml

- name: Publish test results
  uses: mikepenz/action-junit-report@v4
  if: always()
  with:
    report_paths: junit-results.xml
```

---

## Progress Tracking for Large Batches

Use `onProgress` to show a progress bar or log updates when evaluating hundreds of samples:

```typescript
import { evaluate } from '@rageval/eval'

const results = await evaluate({
  provider: { type: 'anthropic', client },
  dataset: largeDataset, // 500+ samples
  concurrency: 10,
  onProgress: (completed, total) => {
    process.stderr.write(`\r  Evaluating... ${completed}/${total}`)
  },
})
console.log('\nDone.')
```

---

## Vitest / Jest Custom Matchers

rageval ships built-in Vitest and Jest matchers for writing quality assertions directly inside your test suite.

### Setup

```typescript
// vitest.setup.ts  (or jest.setup.ts)
import { ragevalMatchers } from '@rageval/eval/matchers'
import { expect } from 'vitest' // or: import { expect } from '@jest/globals'

expect.extend(ragevalMatchers)
```

**Vitest** — add to `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

**Jest** — add to `jest.config.ts`:

```typescript
export default {
  setupFiles: ['./jest.setup.ts'],
}
```

### Usage

```typescript
import { evaluate, faithfulness, answerRelevance } from '@rageval/eval'

describe('RAG pipeline quality', () => {
  let results: Awaited<ReturnType<typeof evaluate>>

  beforeAll(async () => {
    results = await evaluate({
      provider: { type: 'anthropic', client },
      dataset: testDataset,
      metrics: [faithfulness, answerRelevance],
    })
  })

  it('faithfulness score should be above 0.8', () => {
    expect(results).toHaveScoreAbove('faithfulness', 0.8)
  })

  it('all thresholds should pass', () => {
    expect(results).toPassThresholds({
      faithfulness: 0.8,
      answerRelevance: 0.75,
    })
  })
})
```

### Matcher Reference

| Matcher                         | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| `toHaveScoreAbove(metric, min)` | Assert a single metric score >= `min` (0-1)            |
| `toPassThresholds(thresholds)`  | Assert all specified metric scores meet their minimums |

> Both matchers produce detailed failure messages showing actual vs expected scores for each failing metric.

---

## Custom Metrics

Write your own metric to measure anything your pipeline needs.

```typescript
import type { Metric, MetricInput, MetricOutput, LlmProvider } from '@rageval/eval'

const responseLength: Metric = {
  name: 'responseLength',
  description: 'Scores whether the answer length is in the ideal 50–200 word range.',

  async score(input: MetricInput, _provider: LlmProvider): Promise<MetricOutput> {
    const wordCount = input.answer.split(/\s+/).length
    // 50-200 words = ideal (score 1.0)
    const score =
      wordCount >= 50 && wordCount <= 200 ? 1.0 : wordCount < 50 ? wordCount / 50 : 200 / wordCount
    return { score: Math.min(1, Math.max(0, score)) }
  },
}

const results = await evaluate({
  provider: { type: 'anthropic', client },
  dataset: myDataset,
  metrics: [faithfulness, responseLength],
})
```

### LLM-judged custom metric

```typescript
import type { Metric, MetricInput, MetricOutput, LlmProvider } from '@rageval/eval'
import { jsonInstruction, parseLlmScore } from '@rageval/eval'

const nonToxicity: Metric = {
  name: 'nonToxicity',
  description: 'Scores whether the answer is free of toxic, harmful, or offensive content.',

  async score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning = false,
  ): Promise<MetricOutput> {
    const prompt = `Rate how non-toxic the following answer is on a scale from 0 to 1.
1.0 = completely safe, 0.0 = highly toxic.

Answer: ${input.answer}

${jsonInstruction(includeReasoning)}`
    const response = await provider.complete(prompt)
    const { score, reasoning } = parseLlmScore(response)
    return { score, ...(includeReasoning && { reasoning }) }
  },
}
```

### Metric interface

```typescript
interface Metric {
  name: string // unique camelCase identifier — appears as key in result scores
  description: string // human-readable description shown in reports
  score(
    input: MetricInput,
    provider: LlmProvider,
    includeReasoning?: boolean,
  ): Promise<MetricOutput>
}
```

---

## Utility Functions

### `cosineSimilarity(a, b)`

Compute cosine similarity between two numeric vectors (useful in custom metrics).

```typescript
import { cosineSimilarity } from '@rageval/eval'

const similarity = cosineSimilarity([1, 0, 0], [0.9, 0.1, 0])
// -> ~0.994
```

### `parseLlmScore(response)`

Parses a raw LLM response string into `{ score: number, reasoning: string }`. Handles markdown fences, preamble text, score-as-string, and out-of-range clamping. Used internally by all built-in metrics and available for custom metric authors.

```typescript
import { parseLlmScore } from '@rageval/eval'

const { score, reasoning } = parseLlmScore(llmResponse)
// score is always in [0, 1]; reasoning is '' when omitted by the model
```

### `jsonInstruction(includeReasoning)`

A function that returns the standard JSON output instruction to append to any LLM judge prompt. Pass `true` to require the model to include a reasoning field.

```typescript
import { jsonInstruction } from '@rageval/eval'

// Without reasoning (compact output)
const prompt = `...your evaluation criteria...\n\n${jsonInstruction(false)}`
// → appends: Respond with ONLY valid JSON: {"score": <0.0–1.0>}

// With reasoning (for debugging)
const prompt = `...your evaluation criteria...\n\n${jsonInstruction(true)}`
// → appends: Respond with ONLY valid JSON: {"score": <0.0–1.0>, "reasoning": "<your step-by-step analysis>"}
```

---

## How Scoring Works

rageval uses the **LLM-as-judge** pattern: each metric sends a carefully structured prompt to your chosen LLM, which returns a score between 0 and 1. This approach is inspired by the methodology of the [RAGAS paper](https://arxiv.org/abs/2309.15217) (Es et al., 2023) and the [LLM-as-a-Judge paper](https://arxiv.org/abs/2306.05685) (Zheng et al., 2023).

**Important differences from RAGAS Python library:**

The original RAGAS library uses multi-step claim decomposition for some metrics (e.g. faithfulness: extract every claim → verify each individually → compute ratio). rageval uses holistic single-prompt scoring, which is simpler, faster, and sufficient for most teams evaluating relative pipeline quality. If you need decomposed, claim-level granularity, refer to the RAGAS Python library.

**Score non-determinism:**

LLM outputs are non-deterministic. Running `evaluate()` twice on the same dataset will produce slightly different scores. This is expected. Practical guidance:

- Use scores for **relative comparison** (did my retrieval change improve scores?) not as absolute ground truth
- Treat differences smaller than ±0.03 as noise
- For reproducible benchmarking, pass `temperature: 0` to your provider client
- Run 3+ evaluations and average if you need stable absolute numbers

## Cost Guidance

Every `evaluate()` call sends LLM judge prompts to your chosen provider. Here are approximate costs per sample (one Q&A pair, one metric):

| Provider + Model            | Tokens/sample (est.) | Cost per sample | Cost per 100 samples |
| --------------------------- | -------------------- | --------------- | -------------------- |
| `claude-haiku-4-5-20251001` | ~800 tokens          | ~$0.0002        | ~$0.02               |
| `claude-sonnet-4-6`         | ~800 tokens          | ~$0.002         | ~$0.20               |
| `claude-opus-4-7`           | ~800 tokens          | ~$0.015         | ~$1.50               |
| `gpt-4o-mini`               | ~800 tokens          | ~$0.0002        | ~$0.02               |
| `gpt-4o`                    | ~800 tokens          | ~$0.005         | ~$0.50               |

> Estimates assume 5 metrics × ~160 tokens each. Actual usage varies with context length and reasoning mode. Use `includeReasoning: true` (adds ~200 tokens/metric) only when debugging.

**Recommendations:**

- Development & debugging: `claude-haiku-4-5-20251001` or `gpt-4o-mini` — cheap enough to iterate freely.
- CI quality gates: `claude-haiku-4-5-20251001` — fast, cost-efficient, reliable scores.
- Production benchmarks: `claude-sonnet-4-6` or `gpt-4o` — better judge quality for high-stakes decisions.
- Use `temperature: 0` in CI to get deterministic scores (same cost, no variance).

---

## Framework Integrations

rageval works with any RAG pipeline — you just need to capture the `question`, `answer`, and `contexts[]` from your retrieval step and pass them to `evaluate()`.

**LangChain (RetrievalQA / LCEL)**

```typescript
// After running your LangChain chain:
const result = await chain.call({ query: question })

// Map source documents to contexts[]
const contexts = result.sourceDocuments.map((doc) => doc.pageContent)

// Build the sample and evaluate
const sample = { question, answer: result.text, contexts }
const evalResult = await evaluate({ provider, dataset: [sample], metrics: [faithfulness] })
```

**LlamaIndex**

```typescript
// After running a LlamaIndex query engine:
const response = await queryEngine.query(question)

// Extract retrieved nodes as context strings
const contexts = response.sourceNodes.map((node) => node.node.getContent())

const sample = { question, answer: response.response, contexts }
```

**Any custom pipeline** — the pattern is the same:

```
retrieve(question) → [doc1, doc2, ...]  →  contexts: [doc1.text, doc2.text, ...]
generate(question, contexts)             →  answer: string
evaluate({ question, answer, contexts }) →  scores: { faithfulness, ... }
```

> See [`examples/langchain-integration.ts`](./examples/langchain-integration.ts) for a complete runnable example with simulated retrieval and generation.

---

## Comparison with RAGAS

| Feature                           | rageval              | RAGAS (Python) |
| --------------------------------- | -------------------- | -------------- |
| Language                          | TypeScript / Node.js | Python         |
| Faithfulness                      | Yes                  | Yes            |
| Context Relevance                 | Yes                  | Yes            |
| Answer Relevance                  | Yes                  | Yes            |
| Context Recall                    | Yes                  | Yes            |
| Context Precision                 | Yes                  | Yes            |
| Claude (Anthropic)                | Yes                  | Yes            |
| OpenAI                            | Yes                  | Yes            |
| Azure OpenAI Service              | Yes                  | Partial        |
| Custom endpoints (Ollama, vLLM)   | Yes                  | Partial        |
| Custom metrics                    | Yes                  | Yes            |
| CI quality gates (thresholds)     | Yes                  | Partial        |
| Progress callbacks                | Yes                  | No             |
| Checkpoint / resume               | Yes                  | No             |
| Per-metric stats (min/max/stddev) | Yes                  | Partial        |
| Vitest / Jest matchers            | Yes                  | No             |
| HTML visual report                | Yes                  | No             |
| Markdown report                   | Yes                  | No             |
| JUnit XML (CI dashboards)         | Yes                  | No             |
| SARIF (GitHub code scanning)      | Yes                  | No             |
| Terminal report with color bars   | Yes                  | No             |
| Zero vulnerabilities (npm audit)  | Yes                  | —              |
| Tree-shakeable (ESM)              | Yes                  | —              |
| Full TypeScript types             | Yes                  | Partial        |

> _RAGAS is actively maintained and evolving. This comparison reflects publicly documented capabilities as of early 2026. Verify current RAGAS features at [github.com/vibrantlabsai/ragas](https://github.com/vibrantlabsai/ragas) before making decisions based on this table._

---

## Migrating from RAGAS Python

If you're moving from the Python RAGAS library to a Node.js/TypeScript stack, here's the direct mapping:

| RAGAS Python                                  | rageval (TypeScript)                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| `from ragas import evaluate`                  | `import { evaluate } from '@rageval/eval'`                 |
| `from ragas.metrics import faithfulness`      | `import { faithfulness } from '@rageval/eval'`             |
| `from ragas.metrics import context_recall`    | `import { contextRecall } from '@rageval/eval'`            |
| `from ragas.metrics import context_precision` | `import { contextPrecision } from '@rageval/eval'`         |
| `from ragas.metrics import answer_relevancy`  | `import { answerRelevance } from '@rageval/eval'`          |
| `from ragas.metrics import context_relevancy` | `import { contextRelevance } from '@rageval/eval'`         |
| `Dataset.from_dict({...})`                    | pass a plain `RagSample[]` array                           |
| `EmbeddingsConfig(provider=...)`              | not needed — rageval uses LLM-as-judge only                |
| `llm=ChatAnthropic(...)`                      | `provider: { type: 'anthropic', client: new Anthropic() }` |

**Key differences to be aware of:**

RAGAS Python uses multi-step claim decomposition for faithfulness (extract every claim → verify each → ratio). rageval uses holistic single-prompt scoring which is faster and sufficient for most teams. Absolute score values may differ slightly between the two — use rageval scores for relative comparison within your Node.js pipeline, not as a drop-in replacement for RAGAS Python absolute numbers.

RAGAS Python requires `pandas` DataFrames as input. rageval takes a plain JSON array — no data wrangling needed.

---

## API Reference

> Full generated API docs are available at **https://cloudserveinfotech.github.io/rageval/**

### `evaluate(options)`

| Option             | Type                    | Default     | Description                                                        |
| ------------------ | ----------------------- | ----------- | ------------------------------------------------------------------ |
| `provider`         | `ProviderConfig`        | required    | LLM provider config                                                |
| `dataset`          | `RagSample[]`           | required    | Array of Q&A samples                                               |
| `metrics`          | `Metric[]`              | all 5       | Which metrics to run                                               |
| `includeReasoning` | `boolean`               | `false`     | Attach LLM reasoning to each score                                 |
| `concurrency`      | `number`                | `5`         | Max parallel samples evaluated                                     |
| `thresholds`       | `ScoreThresholds`       | `undefined` | Min scores — throws `ThresholdError` if not met                    |
| `onProgress`       | `(done, total) => void` | `undefined` | Called after each sample completes                                 |
| `checkpoint`       | `string`                | `undefined` | File path for checkpoint/resume — saves progress after each sample |

Returns: `Promise<EvaluationResult>`

### `EvaluationResult`

```typescript
interface EvaluationResult {
  scores: {
    faithfulness?: number
    contextRelevance?: number
    answerRelevance?: number
    contextRecall?: number
    contextPrecision?: number
    overall: number
    [custom: string]: number | undefined
  }
  samples: SampleResult[]
  /**
   * Per-metric score distribution statistics.
   * Present whenever at least one metric produced scores.
   * Useful for understanding variance and identifying weak samples.
   */
  stats?: {
    [metric: string]: {
      mean: number // same value as scores[metric]
      min: number // lowest per-sample score
      max: number // highest per-sample score
      stddev: number // population std dev — high (>0.15) means inconsistent pipeline
      count: number // non-skipped sample count
    }
  }
  meta: {
    totalSamples: number
    metrics: string[]
    provider: string
    model: string
    startedAt: string // ISO 8601
    completedAt: string // ISO 8601
    durationMs: number
  }
}
```

### `ThresholdError`

Thrown by `evaluate()` when scores fall below configured thresholds.

```typescript
import { ThresholdError } from '@rageval/eval'

try {
  await evaluate({ ..., thresholds: { faithfulness: 0.8 } })
} catch (e) {
  if (e instanceof ThresholdError) {
    console.log(e.message)   // human-readable summary
    console.log(e.failures)  // { faithfulness: { score: 0.72, threshold: 0.8 } }
  }
}
```

### Provider Config

```typescript
// Anthropic
{
  type: 'anthropic',
  client: new Anthropic(),
  model: 'claude-haiku-4-5-20251001',   // haiku: fast + cost-efficient; use claude-opus-4-7 for highest accuracy
  temperature: 0,  // optional — set to 0 for reproducible, deterministic scores
}

// OpenAI
{
  type: 'openai',
  client: new OpenAI(),
  model: 'gpt-4o-mini',   // mini: fast + cost-efficient; use gpt-4o for highest accuracy
  temperature: 0,  // optional — set to 0 for reproducible, deterministic scores
}

// Azure OpenAI Service (enterprise / data residency)
{
  type: 'azure',
  client: new AzureOpenAI({ apiVersion: '2024-10-21' }),
  model: 'gpt-4o-mini',   // your Azure deployment name
  temperature: 0,
}
```

All three provider types support the same optional fields: `model`, `temperature`, `maxTokens`, `retries`.

**`temperature`** defaults to the provider's own default when omitted. Set `temperature: 0` when
running evaluation benchmarks or CI gates — scores can vary by ±0.03 between runs at higher
temperatures. Leave it unset (or use `temperature: 0.3`) when you want natural scoring variance.

Supported Anthropic models: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`
Supported OpenAI/Azure models: `gpt-4o`, `gpt-4o-mini`, and any chat completion model (or Azure deployment name)

---

## Troubleshooting

**`Error: No provider client provided`**
You must pass a `client` in the `provider` option. See [Install](#install) to add the SDK.

**Scores are unexpectedly low**
Check that `contexts` actually contains the information needed to answer the question. Very short or off-topic contexts produce low faithfulness and context relevance scores.

**`contextRecall` and missing `groundTruth`**
`contextRecall` requires the `groundTruth` field. Samples without `groundTruth` are **skipped** and excluded from the aggregate — they do not contribute a score of 0. A warning is printed to stderr when `contextRecall` is in your metrics but no samples have `groundTruth`. Either add `groundTruth` to your dataset or remove `contextRecall` from your `metrics` array.

**TypeScript: `toHaveScoreAbove` not found**
Make sure you've extended `expect` in your setup file and added it to `vitest.config.ts` under `test.setupFiles`.

**Large datasets are slow**
Increase `concurrency` (default: 5). Watch your provider's rate limits.

**CLI: `rageval: command not found`**
Either install globally (`npm install -g @rageval/eval`) or use `npx rageval eval ...`.

**Serverless / Edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy)**
rageval's core `evaluate()` function is Edge-compatible as long as you do **not** use the `checkpoint` option (which writes to the filesystem). Do not pass `checkpoint` on Edge runtimes. The `node:fs` module is only imported lazily when `checkpoint` is provided, so the library will not crash on import.

---

**Prompt injection awareness:**
rageval injects your `question`, `answer`, and `contexts` values directly into LLM judge prompts. A malicious context value could theoretically attempt to manipulate scoring. This is a known limitation of all LLM-as-judge systems. Do not evaluate untrusted, user-submitted content without sanitisation if score integrity is security-sensitive.

## References

- Es, S., James, J., Anke, L. E., & Schockaert, S. (2023). _RAGAS: Automated Evaluation of Retrieval Augmented Generation_. arXiv:2309.15217. https://arxiv.org/abs/2309.15217
- Zheng, L., et al. (2023). _Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena_. arXiv:2306.05685. https://arxiv.org/abs/2306.05685
- [RAGAS Python library](https://github.com/vibrantlabsai/ragas) — the original Python implementation

## Contributing

Contributions are welcome. Open an issue first to discuss significant changes.

```bash
git clone https://github.com/cloudserveinfotech/rageval.git
cd rageval
pnpm install
pnpm test
```

---

## License

[MIT](./LICENSE) (c) 2026 [CloudServe Labs](https://cloudservelabs.com)

---

## Professional Support

`rageval` is built and maintained by **[CloudServe Labs](https://cloudservelabs.com)** — the AI/LLM division of [CloudServe Infotech](https://cloudserveinfotech.com).

For enterprise support, custom integrations, or consulting on RAG pipeline evaluation, reach out at [labs@cloudserveinfotech.com](mailto:labs@cloudserveinfotech.com).
