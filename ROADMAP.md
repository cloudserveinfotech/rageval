# rageval Roadmap

This document tracks what has shipped, what is in progress, and what is planned for future releases.
We keep this honest — shipped means code + tests are merged, not just planned.

---

## v0.1.0 — Foundation ✅ Shipped

The core library is complete and production-ready.

### Evaluation Engine

- 5 LLM-as-judge metrics: `faithfulness`, `contextRelevance`, `answerRelevance`, `contextRecall`, `contextPrecision`
- Multi-provider support: Anthropic Claude, OpenAI, and Azure OpenAI
- Custom OpenAI-compatible endpoint (Ollama, vLLM, LocalAI, LM Studio)
- Bounded concurrency (`concurrency` option, default 5)
- LLM reasoning traces (`includeReasoning` option)
- CI quality gates: score `thresholds` + `ThresholdError`
- Real-time progress via `onProgress` callback
- **Fault-tolerant checkpointing** — `checkpoint` option saves progress to disk after each sample; interrupted runs resume from where they left off
- **Edge runtime safe** — `node:fs` is only imported when `checkpoint` is used; the module loads without errors in Cloudflare Workers, Vercel Edge, and Deno Deploy

### Output Formats

- `toJson()` — machine-readable full result
- `toCsv()` — spreadsheet / data analysis; auto-appends `{metric}_reasoning` columns when reasoning is present
- `toHtml()` — self-contained visual report with SVG score rings, sortable table, search/filter
- `toMarkdown()` — GitHub PR comments, wikis, project docs
- `toJUnit()` — CI dashboards: GitHub Actions, Jenkins, GitLab, CircleCI
- `toSarif()` — GitHub Advanced Security code scanning
- `printReport()` — ANSI colour-coded terminal reporter with score bars

### Developer Experience

- Vitest / Jest custom matchers via `rageval/matchers` subpath (`toHaveScoreAbove`, `toPassThresholds`)
- Full TypeScript strict mode — no `any`, exact optional properties, exhaustive types
- Tree-shakeable dual ESM + CJS build with full `.d.ts` declarations
- CLI (`rageval eval`) with `--format`, `--open`, `--samples`, `--reasoning`, `--concurrency`, `--metrics` flags
- Browser playground (zero install, paste your API key and evaluate instantly)
- 410 tests, 99%+ coverage, 0 npm vulnerabilities

---

## v0.2.0 — Provider Expansion 🔜 Planned

Expand beyond Anthropic, OpenAI, and Azure so teams can evaluate with their existing LLM stack.

- **Google Gemini** (`{ type: 'gemini', client, model: 'gemini-2.0-flash' }`)
- **Mistral AI** (`{ type: 'mistral', client, model: 'mistral-large-latest' }`)
- **Cohere** (`{ type: 'cohere', client, model: 'command-r-plus' }`)
- **Ollama factory helper** (`createOllamaProvider({ baseUrl, model })`) — ergonomic wrapper for local/self-hosted models; the underlying `openai-compatible` type already works, this adds typed helpers and docs
- Provider integration test suite — `pnpm test:providers` with real API calls (opt-in via env vars)

---

## v0.3.0 — Metric Expansion 🔜 Planned

Add metrics that cover the full RAG evaluation spectrum.

- **Answer Correctness** — semantic similarity between generated answer and ground truth (requires embeddings)
- **Answer Completeness** — does the answer address all aspects of the question?
- **Context Entity Recall** — are key named entities from the ground truth present in retrieved contexts?
- **Noise Sensitivity** — how much does answer quality degrade when irrelevant or contradictory context is added?
- **Token Usage & Latency Tracking** — optional instrumentation to record cost-per-sample and latency (adds `meta.tokenUsage` to `EvaluationResult`)

---

## v0.4.0 — Streaming & Web Integration 🔜 Planned

Make rageval usable in web dashboards, CI visualizations, and long-running evaluation pipelines.

- **Streaming score updates** — `ReadableStream` / SSE output for live progress dashboards
- **`toReact()` report component** — drop-in React component for embedding results in Next.js / Remix apps
- **Watch mode** — `rageval watch --dataset ./data.json` re-evaluates on file change (tight dev feedback loop)
- **Dataset validation command** — `rageval validate --dataset ./data.json` checks schema correctness before a run starts

---

## v1.0.0 — Stable API 🔜 Planned

Mark the public API as stable and ready for production use at scale.

- Semantic versioning guarantee: no breaking changes without a major version bump
- Full API documentation site (TypeDoc-generated, hosted on GitHub Pages)
- End-to-end integration tests with real provider calls (opt-in, requires API keys)
- `rageval init` CLI command — scaffolds a `rageval.config.ts` + sample dataset in your project
- Official LangChain.js integration guide
- Official LlamaIndex.TS integration guide

---

## Community Milestones

| Stars | Target   | Key Action                                                                                     |
| ----- | -------- | ---------------------------------------------------------------------------------------------- |
| 100   | May 2026 | Launch on npm + GitHub, post to dev.to / Hacker News                                           |
| 500   | Jun 2026 | LangChain.js community mention, Reddit r/LocalLLaMA                                            |
| 1 000 | Jul 2026 | v0.2.0 with Gemini + Mistral support                                                           |
| 2 500 | Aug 2026 | RAGAS vs rageval comparison blog post                                                          |
| 5 000 | Oct 2026 | Apply for [Anthropic Claude for Open Source](https://www.anthropic.com/claude-for-open-source) |

---

## Launch Checklist

- [ ] Push to GitHub (`cloudserveinfotech/rageval`)
- [ ] Publish to npm with provenance (`pnpm publish`)
- [ ] Submit to [OpenSSF Best Practices](https://www.bestpractices.dev/) for scorecard badge
- [ ] Write launch article on dev.to / Medium
- [ ] Post to Hacker News (Show HN)
- [ ] Post to Reddit: r/typescript, r/LocalLLaMA, r/MachineLearning
- [ ] Submit to awesome-llm and awesome-typescript lists
- [ ] Set up GitHub Discussions for community Q&A

---

## Contributing

Have an idea for a new metric, provider, or output format? Open an issue to discuss it — contributions are welcome.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get started.

---

_Built and maintained by [CloudServe Labs](https://cloudservelabs.com) — the AI/LLM division of [CloudServe Infotech](https://cloudserveinfotech.com)._
