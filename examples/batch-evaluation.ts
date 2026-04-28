/**
 * Batch Evaluation Example — rageval
 *
 * Evaluates a larger dataset with controlled concurrency and exports to CSV.
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/batch-evaluation.ts
 */

import { writeFileSync } from 'node:fs'

import Anthropic from '@anthropic-ai/sdk'

import {
  answerRelevance,
  contextPrecision,
  contextRecall,
  contextRelevance,
  evaluate,
  faithfulness,
  toCsv,
  toJson,
} from '../src/index.js'

const client = new Anthropic()

// Simulate a batch dataset — in production, load from a file or database
const dataset = [
  {
    id: 'q1',
    question: 'What is RAG in the context of AI?',
    answer:
      'RAG stands for Retrieval-Augmented Generation. It combines a retrieval system with a language model to generate answers grounded in retrieved documents, reducing hallucinations.',
    contexts: [
      'Retrieval-Augmented Generation (RAG) is a technique that combines information retrieval with language generation. The model retrieves relevant documents from a knowledge base and uses them as context for generating accurate answers.',
      'RAG was introduced to address the hallucination problem in large language models by grounding responses in retrieved factual sources.',
    ],
    groundTruth:
      'RAG (Retrieval-Augmented Generation) is an AI technique that combines retrieval of relevant documents with language model generation to produce grounded, factual answers.',
  },
  {
    id: 'q2',
    question: 'What are the main components of a RAG pipeline?',
    answer:
      'A RAG pipeline has three main components: a document ingestion system, a retrieval component (usually vector search), and a generation component (the LLM).',
    contexts: [
      'A typical RAG pipeline consists of: (1) Document ingestion and chunking, (2) Embedding generation and vector storage, (3) Semantic search for retrieval, (4) Context injection into the LLM prompt, (5) Response generation.',
    ],
    groundTruth:
      'The main components are: document ingestion, embedding generation, vector retrieval, and LLM-based generation.',
  },
  {
    id: 'q3',
    question: 'What is a vector database used for in RAG?',
    answer:
      'A vector database stores document embeddings and enables fast semantic similarity search to retrieve the most relevant chunks for a given query.',
    contexts: [
      'Vector databases such as Qdrant, Pinecone, and Weaviate store high-dimensional embeddings of text chunks. They support approximate nearest-neighbour (ANN) search, which enables fast retrieval of semantically similar content.',
    ],
    groundTruth:
      'Vector databases store document embeddings and enable semantic similarity search for retrieval.',
  },
]

console.log(`\nEvaluating ${dataset.length} samples with all 5 metrics...`)
console.log('Concurrency: 3 (3 samples evaluated in parallel)\n')

const results = await evaluate({
  provider: {
    type: 'anthropic',
    client,
    model: 'claude-haiku-4-5-20251001', // haiku: fast and cost-efficient for batch evals
  },
  dataset,
  // All 5 metrics
  metrics: [faithfulness, contextRelevance, answerRelevance, contextRecall, contextPrecision],
  concurrency: 3, // Evaluate 3 samples at a time
})

// Print summary
console.log('=== Aggregate Scores ===')
for (const [metric, score] of Object.entries(results.scores)) {
  if (typeof score !== 'number') continue
  const bar = '█'.repeat(Math.round(score * 20)).padEnd(20, '░')
  console.log(`${metric.padEnd(18)} ${bar} ${score.toFixed(3)}`)
}
console.log(`\nTotal time: ${results.meta.durationMs}ms`)

// Export to JSON
const jsonOutput = toJson(results)
writeFileSync('results.json', jsonOutput, 'utf-8')
console.log('\nExported: results.json')

// Export to CSV
const csvOutput = toCsv(results)
writeFileSync('results.csv', csvOutput, 'utf-8')
console.log('Exported: results.csv')
