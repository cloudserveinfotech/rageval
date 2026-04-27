/**
 * Basic Usage Example — rageval
 *
 * Demonstrates the minimal setup to evaluate a RAG pipeline with three metrics
 * using Anthropic Claude as the LLM judge.
 *
 * Key things shown here:
 *   - Setting `temperature: 0` for reproducible, deterministic scores
 *   - Using `includeReasoning: true` to get LLM explanations alongside scores
 *   - Using `printReport()` for a formatted terminal summary
 *   - Accessing per-sample scores and reasoning programmatically
 *
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/basic-usage.ts
 */

import Anthropic from '@anthropic-ai/sdk'

import {
  answerRelevance,
  contextRelevance,
  evaluate,
  faithfulness,
  printReport,
} from '../src/index.js'

const client = new Anthropic()

const results = await evaluate({
  provider: {
    type: 'anthropic',
    client,
    model: 'claude-haiku-4-5-20251001',
    // temperature: 0 is strongly recommended for evaluation runs.
    // LLM scoring is non-deterministic by default — fixing temperature
    // to 0 reduces variance and makes score comparisons across runs meaningful.
    temperature: 0,
  },
  dataset: [
    {
      id: 'sample-1',
      question: 'What is the capital of France?',
      answer: 'The capital of France is Paris.',
      contexts: [
        'France is a country in Western Europe. Its capital and largest city is Paris, which is known as the "City of Light".',
        'Paris has been the capital of France since the 10th century.',
      ],
      groundTruth: 'Paris is the capital of France.',
    },
    {
      id: 'sample-2',
      question: 'What programming language is TypeScript based on?',
      answer: 'TypeScript is a strongly typed superset of JavaScript.',
      contexts: [
        'TypeScript is a free and open-source high-level programming language developed by Microsoft that adds optional static typing and class-based object-oriented programming to JavaScript.',
      ],
      groundTruth: 'TypeScript is based on JavaScript.',
    },
  ],
  metrics: [faithfulness, contextRelevance, answerRelevance],
  includeReasoning: true,
})

// printReport() outputs a nicely formatted summary table to the terminal.
// Pass { showSamples: true } to include per-sample score rows.
printReport(results, { showSamples: true })

// You can also access all data programmatically for downstream use:
console.log('\n=== Raw aggregate scores ===')
console.log(JSON.stringify(results.scores, null, 2))

console.log('\n=== Per-sample reasoning ===')
for (const sample of results.samples) {
  console.log(`\nSample [${sample.id ?? 'unknown'}]: ${sample.question}`)
  console.log('  Scores:', sample.scores)
  if (sample.reasoning) {
    for (const [metric, reason] of Object.entries(sample.reasoning)) {
      console.log(`  ${metric} reasoning: ${reason}`)
    }
  }
}

console.log(`\nEvaluation completed in ${results.meta.durationMs}ms`)
