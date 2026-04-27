#!/usr/bin/env node
// Build-time constant injected by tsup — always matches package.json version
declare const __RAGEVAL_VERSION__: string

/**
 * rageval CLI
 *
 * Evaluate RAG pipelines from the command line.
 *
 * @example
 * ```bash
 * rageval eval --dataset ./dataset.json --provider anthropic --model claude-haiku-4-5-20251001
 * rageval eval --dataset ./dataset.json --provider openai --format html --output report.html --open
 * rageval eval --dataset ./dataset.json --provider anthropic --metrics faithfulness,answerRelevance
 * ```
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { Command } from 'commander'

import { evaluate } from '../evaluate.js'
import { answerRelevance } from '../metrics/answer-relevance.js'
import { contextPrecision } from '../metrics/context-precision.js'
import { contextRecall } from '../metrics/context-recall.js'
import { contextRelevance } from '../metrics/context-relevance.js'
import { faithfulness } from '../metrics/faithfulness.js'
import type { Metric } from '../metrics/types.js'
import type { ProviderConfig } from '../providers/types.js'
import { toCsv, toJson } from '../utils/export.js'
import { toHtml } from '../utils/html-report.js'
import { toJUnit } from '../utils/junit-report.js'
import { toMarkdown } from '../utils/markdown-report.js'
import { printReport } from '../utils/print-report.js'
import { toSarif } from '../utils/sarif-report.js'

const ALL_METRICS: Metric[] = [
  faithfulness,
  contextRelevance,
  answerRelevance,
  contextRecall,
  contextPrecision,
]

const METRIC_MAP: Record<string, Metric> = {
  faithfulness,
  contextRelevance,
  answerRelevance,
  contextRecall,
  contextPrecision,
}

const program = new Command()

program
  .name('rageval')
  .description('TypeScript RAG pipeline evaluation library — evaluate your RAG pipeline quality')
  // __RAGEVAL_VERSION__ is injected at build time by tsup — always matches package.json
  .version(typeof __RAGEVAL_VERSION__ !== 'undefined' ? __RAGEVAL_VERSION__ : '0.0.0')

program
  .command('eval')
  .description('Evaluate a RAG pipeline dataset')
  .requiredOption('-d, --dataset <path>', 'Path to the dataset JSON file')
  .requiredOption('-p, --provider <type>', 'LLM provider: "anthropic", "openai", or "azure"')
  .option('-m, --model <model>', 'LLM model (defaults: claude-haiku-4-5-20251001 / gpt-4o-mini)')
  .option(
    '--metrics <metrics>',
    'Comma-separated metrics (default: all 5)',
    'faithfulness,contextRelevance,answerRelevance,contextRecall,contextPrecision',
  )
  .option(
    '-o, --output <path>',
    'Output file path (default: stdout for json/csv, required for html)',
  )
  .option(
    '--format <format>',
    'Output format: json | csv | html | markdown | junit | sarif',
    'json',
  )
  .option('--reasoning', 'Include LLM reasoning in results', false)
  .option('--concurrency <n>', 'Samples evaluated in parallel', '5')
  .option('--open', 'Open the HTML report in the default browser after generation', false)
  .option('--samples', 'Print per-sample scores in the terminal summary', false)
  .action(
    async (opts: {
      dataset: string
      provider: string
      model?: string
      metrics: string
      output?: string
      format: string
      reasoning: boolean
      concurrency: string
      open: boolean
      samples: boolean
    }) => {
      try {
        const datasetPath = resolve(opts.dataset)
        const rawContent = readFileSync(datasetPath, 'utf-8')
        const dataset: unknown = JSON.parse(rawContent)

        if (!Array.isArray(dataset)) {
          console.error('Error: dataset file must contain a JSON array')
          process.exit(1)
        }

        if (
          opts.provider !== 'anthropic' &&
          opts.provider !== 'openai' &&
          opts.provider !== 'azure'
        ) {
          console.error('Error: provider must be "anthropic", "openai", or "azure"')
          process.exit(1)
        }

        if (opts.format === 'html' && !opts.output) {
          console.error('Error: --output <path> is required when using --format html')
          process.exit(1)
        }

        let providerConfig: ProviderConfig

        if (opts.provider === 'anthropic') {
          const apiKey = process.env['ANTHROPIC_API_KEY']
          if (!apiKey) {
            console.error('Error: ANTHROPIC_API_KEY environment variable is required')
            process.exit(1)
          }
          const { default: Anthropic } = await import('@anthropic-ai/sdk')
          providerConfig = {
            type: 'anthropic',
            client: new Anthropic({ apiKey }),
            model: opts.model ?? 'claude-haiku-4-5-20251001',
          }
        } else if (opts.provider === 'azure') {
          const endpoint = process.env['AZURE_OPENAI_ENDPOINT']
          const apiKey = process.env['AZURE_OPENAI_API_KEY']
          if (!endpoint) {
            console.error('Error: AZURE_OPENAI_ENDPOINT environment variable is required')
            console.error('  export AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com')
            process.exit(1)
          }
          if (!apiKey) {
            console.error('Error: AZURE_OPENAI_API_KEY environment variable is required')
            console.error('  export AZURE_OPENAI_API_KEY=<your-api-key>')
            process.exit(1)
          }
          const { AzureOpenAI } = await import('openai')
          providerConfig = {
            type: 'azure',
            client: new AzureOpenAI({ endpoint, apiKey, apiVersion: '2024-08-01-preview' }),
            model: opts.model ?? 'gpt-4o-mini',
          }
        } else {
          const apiKey = process.env['OPENAI_API_KEY']
          if (!apiKey) {
            console.error('Error: OPENAI_API_KEY environment variable is required')
            console.error('  export OPENAI_API_KEY=sk-...')
            process.exit(1)
          }
          const { default: OpenAI } = await import('openai')
          providerConfig = {
            type: 'openai',
            client: new OpenAI({ apiKey }),
            model: opts.model ?? 'gpt-4o-mini',
          }
        }

        const metricNames = opts.metrics
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean)
        const metrics: Metric[] =
          metricNames.length > 0
            ? metricNames.map((name) => {
                const metric = METRIC_MAP[name]
                if (!metric) {
                  console.error(
                    `Error: unknown metric "${name}". Valid: ${Object.keys(METRIC_MAP).join(', ')}`,
                  )
                  process.exit(1)
                }
                return metric
              })
            : ALL_METRICS

        const concurrency = parseInt(opts.concurrency, 10)
        if (isNaN(concurrency) || concurrency < 1) {
          console.error('Error: concurrency must be a positive integer')
          process.exit(1)
        }

        const modelName =
          opts.model ??
          (opts.provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini')
        // azure uses the same gpt-4o-mini default (deployment name)
        if (Array.isArray(dataset) && dataset.length > 500) {
          process.stderr.write(
            `\n⚠️  Warning: dataset has ${String(dataset.length)} samples.\n` +
              `   This could take a long time and incur significant API costs.\n` +
              `   Press Ctrl+C to cancel.\n\n`,
          )
        }
        process.stderr.write(`\nEvaluating ${String(dataset.length)} sample(s)…\n`)
        process.stderr.write(
          `Provider: ${opts.provider}/${modelName}  Concurrency: ${concurrency}\n`,
        )

        let completed = 0
        const result = await evaluate({
          provider: providerConfig,
          dataset: dataset as Parameters<typeof evaluate>[0]['dataset'],
          metrics,
          includeReasoning: opts.reasoning,
          concurrency,
          onProgress: (done, total) => {
            completed = done
            process.stderr.write(`\r  ${done}/${total} samples evaluated…`)
            if (done === total) process.stderr.write('\n')
          },
        })

        // Always print terminal report to stderr
        printReport(result, { showSamples: opts.samples, maxSamples: 20 })

        // Determine output content
        const reportTitle = `rageval Report — ${String(dataset.length)} samples`
        let outputContent: string | null = null
        // Normalise aliases so 'md' and 'xml' behave identically to their canonical names
        const normalisedFormat =
          opts.format === 'md' ? 'markdown' : opts.format === 'xml' ? 'junit' : opts.format
        const writesToFile = ['html', 'markdown', 'junit', 'sarif'].includes(normalisedFormat)

        if (normalisedFormat === 'csv') {
          outputContent = toCsv(result)
        } else if (normalisedFormat === 'html') {
          outputContent = toHtml(result, reportTitle)
        } else if (normalisedFormat === 'markdown') {
          outputContent = toMarkdown(result, reportTitle)
        } else if (normalisedFormat === 'junit') {
          outputContent = toJUnit(result)
        } else if (normalisedFormat === 'sarif') {
          outputContent = toSarif(result)
        } else {
          outputContent = toJson(result)
        }

        // Write output file or stream to stdout
        if (opts.output) {
          const outputPath = resolve(opts.output)
          writeFileSync(outputPath, outputContent, 'utf-8')
          process.stderr.write(`Results saved to: ${outputPath}\n`)

          // Open in browser if requested — only supported for html format
          if (opts.open && normalisedFormat === 'html') {
            const { exec } = await import('node:child_process')
            const openCmd =
              process.platform === 'darwin'
                ? `open "${outputPath}"`
                : process.platform === 'win32'
                  ? `start "" "${outputPath}"`
                  : `xdg-open "${outputPath}"`
            exec(openCmd)
          }
        } else if (!writesToFile) {
          // json / csv go to stdout so they can be piped
          console.log(outputContent)
        } else {
          process.stderr.write(
            `Warning: --format ${opts.format} requires --output <path> to save the file.\n`,
          )
        }

        // Warn if --open was requested for a non-HTML format (fires regardless of --output)
        if (opts.open && normalisedFormat !== 'html') {
          process.stderr.write(
            'Warning: --open is only supported with --format html. Ignored for ' +
              normalisedFormat +
              '.\n',
          )
        }

        void completed // suppress unused warning
      } catch (error) {
        console.error('\nError:', error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    },
  )

program.parse()
