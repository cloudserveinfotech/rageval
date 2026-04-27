/**
 * Azure OpenAI Provider Example — rageval
 *
 * Shows how to use rageval with Azure OpenAI Service instead of the direct
 * OpenAI API. This is the recommended approach for enterprise teams with:
 *   - Data residency requirements (data stays in your Azure region)
 *   - Private networking / VNet integration
 *   - Corporate policy requiring Azure-hosted services
 *   - Azure RBAC / Managed Identity for authentication
 *
 * SETUP:
 *   1. Deploy a model in Azure OpenAI Studio (e.g. gpt-4o, gpt-4o-mini)
 *   2. Note your: endpoint URL, deployment name, and API key
 *   3. Install the OpenAI SDK: pnpm add openai
 *   4. Set environment variables:
 *        AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com
 *        AZURE_OPENAI_API_KEY=<your-api-key>
 *        AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>  (e.g. "gpt-4o-mini")
 *
 * The AzureOpenAI client from the `openai` package uses the same
 * .chat.completions.create() interface as the standard OpenAI client, so the
 * rageval `type: 'azure'` provider works transparently.
 *
 * Run: npx tsx examples/azure-openai.ts
 */

import { AzureOpenAI } from 'openai'

import {
  answerRelevance,
  contextRelevance,
  evaluate,
  faithfulness,
  printReport,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// Build the Azure OpenAI client
// ---------------------------------------------------------------------------
// AzureOpenAI automatically reads AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT
// from the environment, or you can pass them explicitly:
//
//   const client = new AzureOpenAI({
//     endpoint: 'https://my-resource.openai.azure.com',
//     apiKey: 'my-api-key',
//     apiVersion: '2024-08-01-preview',
//   })
//
const client = new AzureOpenAI({
  apiVersion: '2024-08-01-preview',
})

// Your Azure deployment name — this is the "model" string for Azure.
// Azure routes calls by deployment name, not by model name directly.
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini'

// ---------------------------------------------------------------------------
// Evaluate using type: 'azure'
// ---------------------------------------------------------------------------
console.log(`\nEvaluating with Azure OpenAI (deployment: ${DEPLOYMENT})...\n`)

const results = await evaluate({
  provider: {
    type: 'azure', // use the azure provider — same retry/timeout logic as openai
    client,
    model: DEPLOYMENT, // Azure deployment name acts as the model identifier
    temperature: 0, // deterministic scores — recommended for CI/reproducibility
    maxTokens: 1024,
  },
  dataset: [
    {
      id: 'azure-sample-1',
      question: 'What is Azure OpenAI Service?',
      answer:
        "Azure OpenAI Service provides REST API access to OpenAI's language models including GPT-4o and GPT-4o-mini, with enterprise features like private networking and regional data residency.",
      contexts: [
        "Azure OpenAI Service gives customers access to OpenAI's advanced language models, with the security and compliance capabilities of Microsoft Azure.",
        'Azure OpenAI Service supports models including GPT-4o, GPT-4o-mini, and Embeddings, deployed in Azure data centers.',
      ],
      groundTruth:
        "Azure OpenAI Service is Microsoft's hosted version of OpenAI models with enterprise security.",
    },
    {
      id: 'azure-sample-2',
      question: 'What are the data residency options in Azure OpenAI?',
      answer:
        'Azure OpenAI lets you choose which Azure region your model is deployed in, ensuring your prompts and responses are processed within that geographic area.',
      contexts: [
        'With Azure OpenAI Service, you can choose the Azure region where your resource is deployed. Data sent to the service is processed in that region.',
        'Microsoft does not use your data to train or improve OpenAI models unless you explicitly opt in.',
      ],
    },
  ],
  metrics: [faithfulness, contextRelevance, answerRelevance],
  includeReasoning: false,
})

// ---------------------------------------------------------------------------
// Report results
// ---------------------------------------------------------------------------
printReport(results, { showSamples: true })

console.log(`\nProvider: ${results.meta.provider} (deployment: ${results.meta.model})`)
console.log(`Duration: ${results.meta.durationMs}ms`)

// ---------------------------------------------------------------------------
// CUSTOM ENDPOINTS (Ollama, LocalAI, vLLM, etc.)
// ---------------------------------------------------------------------------
//
// You can also point the standard OpenAI client at any OpenAI-compatible
// server (Ollama, LocalAI, vLLM, LM Studio, etc.) using `baseURL`.
// Use `type: 'openai'` for these — the azure type is specifically for the
// Azure OpenAI Service SDK which handles authentication differently.
//
//   import OpenAI from 'openai'
//
//   const ollamaClient = new OpenAI({
//     baseURL: 'http://localhost:11434/v1',
//     apiKey: 'ollama', // Ollama ignores the key but the SDK requires one
//   })
//
//   const localResults = await evaluate({
//     provider: {
//       type: 'openai',
//       client: ollamaClient,
//       model: 'llama3.2',  // the model name Ollama serves
//     },
//     dataset: myDataset,
//     metrics: [faithfulness],
//   })
