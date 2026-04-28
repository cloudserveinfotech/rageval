/**
 * LangChain Integration Example — rageval
 *
 * Shows how to wire rageval into an existing LangChain retrieval pipeline.
 * The key insight: rageval needs (question, answer, contexts[]) — you capture
 * these from your retrieval step and pass them directly to evaluate().
 *
 * This example simulates a LangChain-style RAG pipeline without importing the
 * actual LangChain package (to keep the example dependency-free), but the
 * pattern is identical to a real LangChain RetrievalQA or LCEL chain.
 *
 * Run: ANTHROPIC_API_KEY=sk-... npx tsx examples/langchain-integration.ts
 *
 * ────────────────────────────────────────────────────────────────
 * HOW IT WORKS WITH REAL LANGCHAIN:
 *
 * In a real LangChain app, you would:
 *   1. Call chain.invoke({ question }) to get the answer
 *   2. The chain exposes retrieved documents via `returnSourceDocuments: true`
 *   3. Map the source documents to string[] for the `contexts` field
 *   4. Build a RagSample and pass to evaluate()
 *
 * Example with a real LangChain RetrievalQA chain:
 *
 *   const result = await chain.call({ query: question })
 *   const contexts = result.sourceDocuments.map((doc) => doc.pageContent)
 *   const sample: RagSample = { question, answer: result.text, contexts }
 *
 * For LCEL (LangChain Expression Language):
 *   Use RunnablePassthrough to capture the retrieved documents alongside
 *   the generated answer in a single pipeline run.
 * ────────────────────────────────────────────────────────────────
 */

import Anthropic from '@anthropic-ai/sdk'

import {
  answerRelevance,
  contextRelevance,
  evaluate,
  faithfulness,
  printReport,
  toMarkdown,
} from '../src/index.js'
import type { RagSample } from '../src/schemas/dataset.js'

// ── Simulated LangChain-style retrieval pipeline ─────────────────────────────

interface RetrievedDocument {
  pageContent: string
  metadata: { source: string; score: number }
}

/**
 * Simulates a vector-store retrieval step.
 * In a real app this would call Pinecone, Qdrant, Chroma, etc.
 */
async function retrieveDocuments(query: string): Promise<RetrievedDocument[]> {
  // Simulate async retrieval latency
  await new Promise((r) => setTimeout(r, 10))

  // Return fake retrieved chunks relevant to the query
  if (query.toLowerCase().includes('typescript')) {
    return [
      {
        pageContent:
          'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
        metadata: { source: 'typescript-docs.md', score: 0.95 },
      },
      {
        pageContent:
          'TypeScript was developed by Microsoft and first released in October 2012. It compiles to plain JavaScript.',
        metadata: { source: 'typescript-history.md', score: 0.88 },
      },
    ]
  }
  if (query.toLowerCase().includes('rag')) {
    return [
      {
        pageContent:
          'Retrieval-Augmented Generation (RAG) combines a retrieval system with a language model to ground responses in factual documents.',
        metadata: { source: 'rag-overview.md', score: 0.97 },
      },
      {
        pageContent:
          'RAG reduces hallucinations by injecting retrieved context directly into the LLM prompt before generation.',
        metadata: { source: 'rag-benefits.md', score: 0.91 },
      },
    ]
  }
  return [
    {
      pageContent: 'General knowledge document. May or may not be relevant.',
      metadata: { source: 'general.md', score: 0.55 },
    },
  ]
}

/**
 * Simulates the LLM generation step.
 * In a real app, the retrieved context is injected into the LLM prompt.
 */
async function generateAnswer(question: string, docs: RetrievedDocument[]): Promise<string> {
  const contextText = docs.map((d) => d.pageContent).join('\n')

  // Simulate the LLM call (returns a canned answer based on the question)
  await new Promise((r) => setTimeout(r, 10))

  if (question.toLowerCase().includes('typescript')) {
    return 'TypeScript is a typed superset of JavaScript developed by Microsoft. It adds optional static typing and compiles to plain JavaScript, making it suitable for large-scale applications.'
  }
  if (question.toLowerCase().includes('rag')) {
    return 'RAG (Retrieval-Augmented Generation) is a technique that grounds LLM responses in retrieved documents, significantly reducing hallucinations and improving factual accuracy.'
  }
  return `Based on the available context: ${contextText.slice(0, 100)}...`
}

// ── Capture pipeline I/O for rageval ────────────────────────────────────────

/**
 * Runs the RAG pipeline for one question and returns a RagSample ready for
 * evaluation. This is the key integration pattern:
 *
 *   retrieve → generate → capture (question, answer, contexts) → evaluate
 */
async function runPipeline(question: string, groundTruth?: string): Promise<RagSample> {
  // Step 1: retrieve relevant documents
  const docs = await retrieveDocuments(question)

  // Step 2: generate the answer using retrieved context
  const answer = await generateAnswer(question, docs)

  // Step 3: extract page content for rageval contexts[]
  // This is the critical step — rageval needs the raw text chunks,
  // not the Document objects that LangChain returns.
  const contexts = docs.map((doc) => doc.pageContent)

  return {
    question,
    answer,
    contexts,
    ...(groundTruth !== undefined && { groundTruth }),
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────────

console.log('Running RAG pipeline and collecting samples...\n')

const questions = [
  {
    question: 'What is TypeScript and who developed it?',
    groundTruth: 'TypeScript is a strongly typed programming language developed by Microsoft.',
  },
  {
    question: 'How does RAG reduce hallucinations?',
    groundTruth: 'RAG grounds LLM responses in retrieved documents, reducing hallucinations.',
  },
  {
    question: 'What is the meaning of life?',
    // No groundTruth — contextRecall will be skipped for this sample
  },
]

// Collect samples from the pipeline
const dataset: RagSample[] = await Promise.all(
  questions.map(({ question, groundTruth }) => runPipeline(question, groundTruth)),
)

console.log(`Collected ${dataset.length} samples. Running evaluation...\n`)

// Evaluate the pipeline quality
const client = new Anthropic()

const results = await evaluate({
  provider: {
    type: 'anthropic',
    client,
    model: 'claude-haiku-4-5-20251001',
    temperature: 0, // deterministic scores for reproducible benchmarks
  },
  dataset,
  metrics: [faithfulness, contextRelevance, answerRelevance],
  includeReasoning: true,
  concurrency: 3,
})

// Print the terminal report
printReport(results, { showSamples: true })

// Show score variance (useful for spotting inconsistent pipeline behavior)
if (results.stats) {
  console.log('\n=== Score Distribution ===')
  for (const [metric, stat] of Object.entries(results.stats)) {
    console.log(
      `${metric}: mean=${stat.mean.toFixed(3)} stddev=${stat.stddev.toFixed(3)} [${stat.min.toFixed(2)}–${stat.max.toFixed(2)}] n=${stat.count}`,
    )
  }
}

// Export a markdown report suitable for a GitHub PR comment
const markdown = toMarkdown(results, 'LangChain Pipeline — rageval Report')
console.log('\n=== Markdown Report (paste into GitHub PR) ===')
console.log(markdown.slice(0, 500) + '...')
