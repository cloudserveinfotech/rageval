#!/usr/bin/env node
/**
 * rageval Playground Server
 *
 * A zero-dependency local proxy server that:
 *   1. Serves playground/index.html over HTTP (fixes CORS for file:// origin)
 *   2. Proxies POST /api/llm calls to Anthropic or OpenAI server-side,
 *      keeping your API key out of the browser and off the network
 *
 * Usage:
 *   node playground/server.js
 *   node playground/server.js --port=4000
 *   ANTHROPIC_API_KEY=sk-ant-... node playground/server.js
 *   OPENAI_API_KEY=sk-...       node playground/server.js
 *
 * API keys are read from env vars first.  If not set, the UI lets you enter
 * one — it is sent only to this local server (127.0.0.1) and never stored.
 */

import { createServer } from 'node:http'
import { request } from 'node:https'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

// ── Config ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = resolvePort()
const ANTHROPIC = process.env.ANTHROPIC_API_KEY ?? ''
const OPENAI = process.env.OPENAI_API_KEY ?? ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePort() {
  const arg = process.argv.find((a) => a.startsWith('--port='))
  if (arg) return parseInt(arg.split('=')[1], 10)
  const env = parseInt(process.env.PORT ?? '', 10)
  return isNaN(env) ? 3000 : env
}

/**
 * Server-side HTTPS POST — avoids all CORS restrictions because the call
 * originates from Node, not the browser.
 *
 * @param {string} hostname  e.g. 'api.anthropic.com'
 * @param {string} path      e.g. '/v1/messages'
 * @param {Record<string,string>} extraHeaders
 * @param {object} body      Will be JSON-serialised
 * @returns {Promise<{status: number, body: string}>}
 */
function httpsPost(hostname, path, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 500, body: data }))
      },
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/** Open a URL in the default browser (best-effort — failure is non-fatal). */
function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`
  exec(cmd, (err) => {
    if (err) {
      /* non-fatal */
    }
  })
}

/** Read the single static HTML file once at startup. */
const HTML = readFileSync(join(__dirname, 'index.html'), 'utf-8')

// ── Request handler ───────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  // Allow the browser to talk to this server from any local origin
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // ── GET / → serve playground UI ──────────────────────────────────────────
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(HTML)
    return
  }

  // ── POST /api/llm → proxy to provider ───────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/llm') {
    // Collect request body
    let raw = ''
    for await (const chunk of req) raw += chunk

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON in request body.' }))
      return
    }

    const { provider = 'anthropic', model, prompt } = payload

    // Key precedence: env var → request body (UI field, local-only)
    const apiKey =
      provider === 'anthropic' ? ANTHROPIC || payload.apiKey || '' : OPENAI || payload.apiKey || ''

    if (!apiKey) {
      const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          error: `No API key found. Set the ${envVar} environment variable when starting the server, or enter your key in the UI.`,
        }),
      )
      return
    }

    try {
      if (provider === 'anthropic') {
        const upstream = await httpsPost(
          'api.anthropic.com',
          '/v1/messages',
          { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          {
            model: model ?? 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          },
        )

        if (upstream.status !== 200) {
          res.writeHead(upstream.status, { 'content-type': 'application/json' })
          res.end(upstream.body) // forward the provider error as-is
          return
        }

        const parsed = JSON.parse(upstream.body)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ text: parsed.content[0].text }))
      } else {
        // OpenAI
        const upstream = await httpsPost(
          'api.openai.com',
          '/v1/chat/completions',
          { authorization: `Bearer ${apiKey}` },
          {
            model: model ?? 'gpt-4o',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          },
        )

        if (upstream.status !== 200) {
          res.writeHead(upstream.status, { 'content-type': 'application/json' })
          res.end(upstream.body)
          return
        }

        const parsed = JSON.parse(upstream.body)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ text: parsed.choices[0].message.content }))
      }
    } catch (err) {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: `Upstream request failed: ${String(err)}` }))
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`
  const sep = '─'.repeat(44)

  console.log(`\n  ${sep}`)
  console.log(`  rageval Playground`)
  console.log(`  ${sep}`)
  console.log(`  Open → ${url}`)
  console.log()

  if (!ANTHROPIC && !OPENAI) {
    console.log('  ⚠  No API key found in environment.')
    console.log('     Enter your key in the UI, or restart with:')
    console.log('       ANTHROPIC_API_KEY=sk-ant-... node playground/server.js')
    console.log('       OPENAI_API_KEY=sk-...        node playground/server.js')
  } else {
    if (ANTHROPIC) console.log('  ✓  ANTHROPIC_API_KEY loaded from environment')
    if (OPENAI) console.log('  ✓  OPENAI_API_KEY loaded from environment')
  }

  console.log(`\n  Press Ctrl+C to stop.\n`)

  openBrowser(url)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use.`)
    console.error(`    Try: node playground/server.js --port=3001\n`)
  } else {
    console.error(`\n  ✗ Server error: ${err.message}\n`)
  }
  process.exit(1)
})
