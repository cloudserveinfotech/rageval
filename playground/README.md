# rageval Playground

An interactive local web UI for evaluating your RAG pipeline quality using
LLM-as-judge scoring — no cloud service, no data leaves your machine.

## Quick start

```bash
# From the repo root:
node playground/server.js
# → Opens http://localhost:3000 automatically
```

The server opens your browser automatically. Enter your API key in the UI (or
set it via environment variable — see below).

## Why a server?

Browsers block direct calls to `https://api.anthropic.com` and
`https://api.openai.com` from `file://` pages and from most origins due to
CORS policy. The local proxy server:

1. Serves the playground UI over `http://localhost` (fixes the CORS origin)
2. Makes the actual HTTPS calls to the LLM provider **server-side**, so your
   API key is never present in CORS request headers or browser network logs
3. Runs entirely on `127.0.0.1` — no traffic leaves your machine except the
   final call to the AI provider you choose

## API key options

**Option A — env var (recommended):**

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...  node playground/server.js
OPENAI_API_KEY=sk-...               node playground/server.js
# Both can be set simultaneously if you want to switch providers in the UI
```

The UI will show the key input as optional when the server already has one.

**Option B — enter in UI:**

Leave the env vars unset and type your key into the "API Key" field in the
browser. The key is sent only to `http://localhost` (your own machine) and is
never stored or forwarded to any third party.

## Options

```
node playground/server.js [--port=N]

  --port=N          Listen on port N (default: 3000)
  PORT env var      Alternative way to set the port
```

## Architecture

```
Browser (http://localhost:PORT)
    │
    │  POST /api/llm  { provider, model, prompt, apiKey? }
    ▼
playground/server.js  (Node.js, zero external deps)
    │
    │  HTTPS POST to api.anthropic.com or api.openai.com
    │  (server-side — no CORS, API key in server memory only)
    ▼
Anthropic / OpenAI API
    │
    │  { text: "..." }
    ▼
Browser renders score cards + reasoning
```

## Metrics

| Metric                | What it measures                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Faithfulness**      | Are all claims in the answer supported by the retrieved context? (hallucination detection)           |
| **Context Relevance** | Is the retrieved context relevant to the question? (retriever quality)                               |
| **Answer Relevance**  | Does the answer actually address the question?                                                       |
| **Context Recall**    | Does the context contain the information needed to produce the ground truth? (requires ground truth) |
| **Context Precision** | What fraction of the retrieved chunks are actually useful?                                           |

## Troubleshooting

| Problem                                          | Fix                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| "You opened this file directly from disk" banner | Run `node playground/server.js` and open `http://localhost:3000`   |
| `EADDRINUSE: Port 3000`                          | Run `node playground/server.js --port=3001`                        |
| 401 — No API key                                 | Set `ANTHROPIC_API_KEY` env var or enter key in the UI             |
| 429 — Rate limited                               | Wait a moment and try again; reduce the number of metrics selected |
| LLM returned invalid JSON                        | Retry — occasionally the model produces non-JSON output            |
