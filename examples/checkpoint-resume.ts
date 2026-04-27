/**
 * Checkpoint / Resume Example — rageval
 *
 * Shows how to use the `checkpoint` option to make large evaluations
 * fault-tolerant. When a checkpoint file path is provided:
 *
 *   1. On startup — rageval loads already-evaluated samples from the file
 *      and skips re-evaluating them.
 *   2. After each sample — rageval writes the accumulated results to the
 *      checkpoint file, so progress is never lost.
 *
 * This means if your run is interrupted (network timeout, rate limit, OOM,
 * Ctrl-C), you can simply re-run the same script and it picks up exactly
 * where it left off, at no extra API cost.
 *
 * WHEN TO USE THIS:
 *   - Datasets with 50+ samples (evaluating all 5 metrics = 250+ API calls)
 *   - Overnight / long-running evaluation jobs
 *   - CI jobs with strict time limits where a re-run should be cheap
 *   - Any situation where an interrupted run would waste money/time
 *
 * CHECKPOINT KEY:
 *   - If your samples have `id` fields → keyed by id (most robust)
 *   - If not → keyed by question text (use only if questions are unique)
 *   Always use `id` fields for large datasets.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/checkpoint-resume.ts
 */

import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import Anthropic from '@anthropic-ai/sdk'

import {
  answerRelevance,
  contextRelevance,
  evaluate,
  faithfulness,
  printReport,
  toJson,
} from '../src/index.js'

const client = new Anthropic()

// ---------------------------------------------------------------------------
// Checkpoint file path — store alongside your dataset or in a tmp directory.
// Delete this file when you want to start a completely fresh evaluation.
// ---------------------------------------------------------------------------
const CHECKPOINT_FILE = join(process.cwd(), '.rageval-checkpoint.json')

// ---------------------------------------------------------------------------
// Simulate a larger dataset (in production, load from a JSON file or DB)
// ---------------------------------------------------------------------------
const dataset = [
  {
    id: 'q01',
    question: 'What is RAG?',
    answer:
      'RAG stands for Retrieval-Augmented Generation. It combines retrieval with LLM generation.',
    contexts: [
      'RAG (Retrieval-Augmented Generation) combines retrieval systems with language models.',
    ],
    groundTruth: 'RAG is Retrieval-Augmented Generation.',
  },
  {
    id: 'q02',
    question: 'What is a vector database?',
    answer: 'A vector database stores embeddings and supports semantic similarity search.',
    contexts: [
      'Vector databases store high-dimensional embeddings and enable approximate nearest-neighbour search.',
    ],
    groundTruth: 'A vector database stores embeddings for semantic search.',
  },
  {
    id: 'q03',
    question: 'What is an embedding?',
    answer: 'An embedding is a dense vector representation of text that captures semantic meaning.',
    contexts: [
      'Text embeddings are numerical representations where semantically similar texts have vectors close together.',
    ],
    groundTruth: 'An embedding is a vector representation of text capturing its meaning.',
  },
  {
    id: 'q04',
    question: 'What is chunking in RAG?',
    answer:
      'Chunking is the process of splitting documents into smaller pieces for indexing and retrieval.',
    contexts: [
      'Document chunking divides large texts into smaller segments before embedding and storing in a vector database.',
    ],
    groundTruth: 'Chunking splits documents into smaller pieces for indexing.',
  },
  {
    id: 'q05',
    question: 'What is semantic search?',
    answer: 'Semantic search finds documents based on meaning rather than exact keyword matches.',
    contexts: [
      'Semantic search uses vector similarity to find conceptually related content, unlike keyword search which matches exact terms.',
    ],
    groundTruth: 'Semantic search finds content based on meaning, not keywords.',
  },
]

// ---------------------------------------------------------------------------
// Check whether this is a fresh run or a resume
// ---------------------------------------------------------------------------
if (existsSync(CHECKPOINT_FILE)) {
  console.log(`\n⏭  Checkpoint found: ${CHECKPOINT_FILE}`)
  console.log('   Resuming from where the last run left off...\n')
} else {
  console.log(`\n🆕  Starting fresh evaluation of ${dataset.length} samples...\n`)
}

// ---------------------------------------------------------------------------
// Run evaluation with checkpoint enabled
// ---------------------------------------------------------------------------
const results = await evaluate({
  provider: {
    type: 'anthropic',
    client,
    model: 'claude-haiku-4-5-20251001', // haiku: fast and cheap for large-scale evals
    temperature: 0,
  },
  dataset,
  metrics: [faithfulness, contextRelevance, answerRelevance],
  concurrency: 3, // evaluate 3 samples at a time (adjust to stay within rate limits)

  // ── Checkpoint path ──────────────────────────────────────────────────────
  // Progress is saved after EVERY sample. If the run is interrupted at any
  // point, re-running with the same path resumes automatically.
  checkpoint: CHECKPOINT_FILE,

  // ── Progress tracking ────────────────────────────────────────────────────
  // Combine onProgress with checkpoint for maximum visibility on long runs.
  onProgress: (completed, total) => {
    const pct = ((completed / total) * 100).toFixed(0)
    process.stderr.write(`\r  Progress: ${completed}/${total} samples (${pct}%)   `)
  },
})

process.stderr.write('\n') // clear the progress line

// ---------------------------------------------------------------------------
// Report results
// ---------------------------------------------------------------------------
console.log('\n')
printReport(results, { showSamples: true })
console.log(`\nTotal time: ${results.meta.durationMs}ms`)

// Export full results
writeFileSync('results.json', toJson(results))
console.log('Exported: results.json')

// ---------------------------------------------------------------------------
// Clean up checkpoint on successful completion
// rageval does NOT delete the file automatically — you control the lifecycle.
// Delete it here if you want a clean slate next time.
// ---------------------------------------------------------------------------
if (existsSync(CHECKPOINT_FILE)) {
  unlinkSync(CHECKPOINT_FILE)
  console.log('Checkpoint deleted (run completed successfully).')
}
