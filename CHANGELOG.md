# Changelog

All notable changes to `rageval` will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and uses [Changesets](https://github.com/changesets/changesets) for release management.

---

## v0.1.1 — 2026-04-28

### Fixed

- CI matrix updated to Node 20 / 22 / 24 (dropped EOL Node 18, added Node 24 Active LTS)
- Build step now runs before tests so `dist/` exists when `public-api.test.ts` runs
- pnpm version conflict: removed duplicate `version:` pin from all workflow files — version is now read exclusively from `packageManager` in `package.json`
- RAGAS repo link updated to new org (`vibrantlabsai/ragas`)
- Anthropic model reference updated: `claude-opus-4-6` → `claude-opus-4-7`
- Azure OpenAI `apiVersion` updated: `2024-08-01-preview` → `2024-10-21` (GA stable)
- Stale star count removed from RAGAS reference (grows too fast to hardcode)

---

## v0.1.0 — 2026-04-25

### Added

#### Providers

- **Azure OpenAI provider** (`type: 'azure'`) — full support for Azure OpenAI Service using the `AzureOpenAI` SDK client. Identical retry/timeout/temperature/maxTokens behaviour as the OpenAI provider. Designed for enterprise teams with data residency requirements.
- **Custom endpoint support** — the OpenAI provider now works with any OpenAI-compatible server (Ollama, LocalAI, vLLM, LM Studio) by passing a custom `baseURL` to the `OpenAI` client.

#### evaluate() options

- **`checkpoint`** — new option enabling fault-tolerant, resumable evaluation of large datasets. Progress is saved to a JSON file (`{ version: 1, samples: [...] }`) after every sample. On restart, already-evaluated samples are skipped. Samples are keyed by `id` (when present) or question text.
- **`thresholds`** — enforce minimum acceptable scores per metric. `evaluate()` throws `ThresholdError` when any score falls below its threshold. `ThresholdError.failures` contains the metric details; `ThresholdError.result` contains the full `EvaluationResult` for reporting.
- **`onProgress`** — callback fired after each sample completes. Signature: `(completed: number, total: number) => void`. Combine with `concurrency` for large-batch progress bars.

#### Results

- **`EvaluationResult.stats`** — per-metric distribution statistics added to every result. Each entry contains `{ mean, min, max, stddev, count }`. Use `stddev` to detect pipeline inconsistency.

#### Multi-tenant SaaS

- **`tenantId`** (optional, on each `RagSample`) — tag samples with a tenant identifier; rageval propagates it untouched to every `SampleResult` so per-tenant aggregate scores can be computed by post-processing the result. Empty strings are rejected; absent values are simply not propagated. See the **Multi-Tenant SaaS** section in the README for the recommended grouping pattern and isolation guidance.
- **`metadata`** (optional, on each `RagSample`) — free-form, JSON-serialisable `Record<string, unknown>` for trace IDs, pipeline versions, A/B variant labels, region, etc. Also propagated to the matching `SampleResult` for downstream audit logs and dashboards.
- **`examples/multi-tenant.ts`** — end-to-end example demonstrating per-tenant aggregate scoring across two tenants with metadata propagation.

#### Schemas (runtime validation)

- All Zod schemas backing the public types are now exported alongside their inferred types: `RagSampleSchema`, `DatasetSchema`, `MetricNameSchema`, `ProviderTypeSchema`, `MetricScoreSchema`, `SampleScoresSchema`, `SampleResultSchema`, `AggregateScoresSchema`, `MetricStatsSchema`, `EvaluationResultSchema`. Use these to validate dynamic input from disk, HTTP endpoints, or untrusted sources before passing to `evaluate()`.
- **`MatcherResult`** type re-exported from the matchers entry point so consumers writing their own matchers can reuse the standard Vitest/Jest return shape.

#### Reporting

- **`toHtml(result)`** — generates a fully self-contained, single-file HTML report with bar charts, per-sample breakdowns, and dark mode support.
- **`toMarkdown(result)`** — generates a GitHub-flavoured Markdown report suitable for PR comments, wikis, and documentation.
- **`toJUnit(result)`** — generates JUnit XML for CI dashboards (GitHub Actions, Jenkins, GitLab, CircleCI).
- **`toSarif(result)`** — generates SARIF 2.1.0 for GitHub Advanced Security. Upload to make low-scoring samples appear as inline code-scanning alerts on your PR diff.
- **`printReport(result, options?)`** — rich terminal reporter with ANSI colour bars, score verdicts, and optional per-sample breakdown (`showSamples: true`). Automatically degrades to plain text when stdout is not a TTY.

#### Testing utilities

- **`ragevalMatchers`** — Vitest/Jest custom matchers:
  - `toHaveScoreAbove(metric, min)` — assert a single metric score meets a minimum
  - `toPassThresholds(thresholds)` — assert all specified metrics meet their thresholds
  - Both matchers produce descriptive failure messages showing actual vs expected scores.

#### CLI enhancements

- `--format` flag: `json` · `csv` · `html` · `markdown`/`md` · `junit`/`xml` · `sarif`
- `--open` flag: automatically opens HTML reports in the browser after generation
- `--reasoning` flag: includes LLM chain-of-thought in output
- `--samples` flag: shows per-sample breakdown in the terminal report
- `--concurrency` flag: controls parallel evaluation (default: 5)
- `--metrics` flag: comma-separated list to evaluate a subset of metrics
- Automatic rate-limit warning when dataset > 500 samples

#### Examples

- `examples/langchain-integration.ts` — integrating rageval into a LangChain pipeline
- `examples/azure-openai.ts` — enterprise Azure OpenAI setup with deployment names, custom apiVersion, and Managed Identity notes; also covers Ollama/vLLM at the bottom
- `examples/checkpoint-resume.ts` — fault-tolerant large-dataset evaluation with progress tracking

#### Documentation

- Full `PRIVACY.md` — data flow diagram, Azure OpenAI data residency section, GDPR guidance
- Full `CONTRIBUTING.md` — "How to add a new metric" guide, project structure, PR workflow
- `RAGAS comparison table` in README — side-by-side feature comparison with the Python RAGAS library
- GitHub Actions workflow example in README
- Cost guidance table in README (cost per sample for each provider/model)

### Changed

- **`toCsv()` now auto-includes reasoning columns** — when any sample in an `EvaluationResult` has a `reasoning` map, `toCsv()` appends `{metric}_reasoning` columns to the CSV header and populates each cell with the LLM's chain-of-thought text. Samples without reasoning produce empty cells. Zero API change required; detection is automatic. Useful for audit trails in healthcare, legal, and compliance contexts.
- **Edge runtime compatibility** — `node:fs` is now imported lazily inside `evaluate()` only when the `checkpoint` option is passed. Previously a top-level static import would crash Cloudflare Workers, Vercel Edge Functions, and Deno Deploy on module load even when checkpointing was never used.
- **CJS usage documented** — README now shows both ESM and CommonJS `require()` usage patterns under the Install section so projects without `"type": "module"` know exactly how to import the library.
- **RAGAS Python migration guide** — README now includes a metric name mapping table (`faithfulness`, `context_recall` → `contextRecall`, `context_precision` → `contextPrecision`, `answer_relevancy` → `answerRelevance`, `context_relevancy` → `contextRelevance`) to help teams moving from the Python RAGAS library.
- `maxTokens` default raised from 1024 → **2048** for all three providers (Anthropic, OpenAI, Azure). Prevents truncation of long chain-of-thought reasoning in `includeReasoning: true` mode.
- Metric prompts upgraded to state-of-the-art quality — explicit 5-point scoring rubrics, chain-of-thought decomposition, and partial-credit guidance for all 5 built-in metrics.
- `contextRecall` now explicitly skips (not scores 0) samples without `groundTruth`. Skipped samples are excluded from the aggregate and do not drag down the `overall` score.
- Duplicate metric names in the `metrics` array now throw immediately with a descriptive error: `Duplicate metric name "faithfulness"`.
- `parseLlmScore()` significantly hardened: extracts JSON from inside markdown fences, preamble text, score-as-string, and out-of-range values (clamped to [0, 1]).

### Fixed

- `contextRecall` silently scoring 0 when `groundTruth` was absent — now correctly skipped.
- CLI `--format junit` alias `xml` and `--format markdown` alias `md` not recognised.
- HTML report `escHtml()` was not applied to reasoning text, allowing raw `<` and `>` to appear unescaped.
