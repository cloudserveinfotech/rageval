# Privacy & Data Flow

## What rageval does with your data

rageval is a **pass-through evaluation library**. It does not store, log, transmit, or retain any of your data. It has no servers, no telemetry, and no network connections of its own.

Here is exactly what happens when you call `evaluate()`:

```
Your application
     │
     ▼
evaluate({ dataset, provider, ... })
     │
     ├─ For each sample in your dataset:
     │     question, answer, contexts
     │          │
     │          ▼
     │    LLM Provider SDK         ← rageval calls the client object YOU supply
     │    (Anthropic / OpenAI)
     │          │
     │          ▼
     │    Provider's API servers   ← your data leaves your process here
     │    (e.g. api.anthropic.com)
     │          │
     │          ▼
     │    Score response           ← only the numeric score returns to rageval
     │
     ▼
EvaluationResult                  ← returned to your application
```

**rageval writes nothing to disk** unless you explicitly call `writeFileSync(toHtml(result))` or similar in your own code.

---

## What data leaves your process

When you call `evaluate()`, **for each sample in your dataset**, the following fields are sent to your chosen LLM provider's API:

- `question`
- `answer`
- `contexts` (all chunks)
- `groundTruth` (if provided, only for contextRecall)

These fields are assembled into a scoring prompt and sent to your provider (e.g. `api.anthropic.com` or `api.openai.com`). rageval does not see this data after the call — the response it receives is only the numeric score (and optionally a short reasoning string).

---

## What rageval does NOT do

- Does not collect analytics or usage data
- Does not send data to any rageval or CloudServe Labs servers
- Does not log prompt content or LLM responses
- Does not write user data to disk
- Does not expose user data in error messages (error text is generic and safe to log)

---

## Your responsibilities

### Data sent to LLM providers

By using rageval with an Anthropic or OpenAI client, you are sending your evaluation data to that provider's API. You are responsible for:

- Reviewing your provider's data processing agreement and privacy policy
- Ensuring your use of that provider complies with your own privacy obligations
- Not sending data that your agreements or regulations prohibit sending to third-party cloud APIs

Useful links:

- Anthropic API: https://www.anthropic.com/legal/privacy
- OpenAI API: https://openai.com/enterprise-privacy/

### Azure OpenAI Service and data residency

If you use `type: 'azure'` with an `AzureOpenAI` client, your evaluation data is sent to **Azure OpenAI Service** — not to Anthropic or the direct OpenAI API. Azure OpenAI Service processes data within the Azure region you selected when creating your resource.

This is significant for enterprise teams with data residency requirements:

- Your prompts and responses are processed in the Azure region you chose (e.g. East US, West Europe)
- Microsoft's enterprise data commitments apply (no model training on your data by default)
- You can use Azure Private Endpoints and Virtual Network integration to keep traffic entirely off the public internet

For more, see the [Azure OpenAI data privacy documentation](https://learn.microsoft.com/en-us/legal/cognitive-services/openai/data-privacy).

### GDPR and data residency

If you are subject to GDPR or other data protection regulations, or if you process data with residency requirements:

- Check whether your LLM provider offers a data processing agreement (DPA)
- Check whether your provider's API endpoints are located in your required region
- Consider whether the questions, answers, and context chunks you are evaluating constitute personal data under your applicable regulations
- Consider using `type: 'azure'` with a European Azure region if EU data residency is required

rageval itself does not process personal
