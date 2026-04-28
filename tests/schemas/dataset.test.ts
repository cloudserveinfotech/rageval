import { describe, expect, it } from 'vitest'

import {
  DatasetSchema,
  MetricNameSchema,
  ProviderTypeSchema,
  RagSampleSchema,
} from '../../src/schemas/dataset.js'

describe('RagSampleSchema', () => {
  it('parses a valid minimal sample', () => {
    const sample = {
      question: 'What is AI?',
      answer: 'AI is artificial intelligence.',
      contexts: ['AI stands for artificial intelligence.'],
    }
    expect(() => RagSampleSchema.parse(sample)).not.toThrow()
  })

  it('parses a full sample with id and groundTruth', () => {
    const sample = {
      id: 'sample-1',
      question: 'What is AI?',
      answer: 'AI is artificial intelligence.',
      contexts: ['AI stands for artificial intelligence.'],
      groundTruth: 'AI is artificial intelligence.',
    }
    expect(RagSampleSchema.parse(sample)).toEqual(sample)
  })

  it('rejects empty question', () => {
    expect(() =>
      RagSampleSchema.parse({
        question: '',
        answer: 'answer',
        contexts: ['ctx'],
      }),
    ).toThrow()
  })

  it('rejects empty answer', () => {
    expect(() =>
      RagSampleSchema.parse({
        question: 'question',
        answer: '',
        contexts: ['ctx'],
      }),
    ).toThrow()
  })

  it('rejects empty contexts array', () => {
    expect(() =>
      RagSampleSchema.parse({
        question: 'question',
        answer: 'answer',
        contexts: [],
      }),
    ).toThrow()
  })

  it('rejects empty string in contexts', () => {
    expect(() =>
      RagSampleSchema.parse({
        question: 'question',
        answer: 'answer',
        contexts: ['valid context', ''],
      }),
    ).toThrow()
  })

  it('accepts optional id as undefined', () => {
    const sample = {
      question: 'Q',
      answer: 'A',
      contexts: ['C'],
    }
    const result = RagSampleSchema.parse(sample)
    expect(result.id).toBeUndefined()
  })

  it('accepts optional groundTruth as undefined', () => {
    const sample = {
      question: 'Q',
      answer: 'A',
      contexts: ['C'],
    }
    const result = RagSampleSchema.parse(sample)
    expect(result.groundTruth).toBeUndefined()
  })

  it('rejects empty groundTruth string', () => {
    expect(() =>
      RagSampleSchema.parse({
        question: 'Q',
        answer: 'A',
        contexts: ['C'],
        groundTruth: '',
      }),
    ).toThrow()
  })

  it('parses a sample with tenantId and metadata for multi-tenant SaaS', () => {
    const sample = {
      question: 'Q',
      answer: 'A',
      contexts: ['C'],
      tenantId: 'tenant-acme-001',
      metadata: { traceId: 'abc123', pipelineVersion: '2.1.0', region: 'us-east-1' },
    }
    const parsed = RagSampleSchema.parse(sample)
    expect(parsed.tenantId).toBe('tenant-acme-001')
    expect(parsed.metadata).toEqual({
      traceId: 'abc123',
      pipelineVersion: '2.1.0',
      region: 'us-east-1',
    })
  })

  it('rejects empty tenantId string', () => {
    expect(() =>
      RagSampleSchema.parse({
        question: 'Q',
        answer: 'A',
        contexts: ['C'],
        tenantId: '',
      }),
    ).toThrow()
  })

  it('treats tenantId and metadata as optional', () => {
    const parsed = RagSampleSchema.parse({
      question: 'Q',
      answer: 'A',
      contexts: ['C'],
    })
    expect(parsed.tenantId).toBeUndefined()
    expect(parsed.metadata).toBeUndefined()
  })
})

describe('DatasetSchema', () => {
  it('parses an array of valid samples', () => {
    const dataset = [
      { question: 'Q1', answer: 'A1', contexts: ['C1'] },
      { question: 'Q2', answer: 'A2', contexts: ['C2'] },
    ]
    expect(() => DatasetSchema.parse(dataset)).not.toThrow()
  })

  it('rejects an empty array', () => {
    expect(() => DatasetSchema.parse([])).toThrow()
  })
})

describe('MetricNameSchema', () => {
  it('accepts all 5 valid metric names', () => {
    const validNames = [
      'faithfulness',
      'contextRelevance',
      'answerRelevance',
      'contextRecall',
      'contextPrecision',
    ]
    for (const name of validNames) {
      expect(() => MetricNameSchema.parse(name)).not.toThrow()
    }
  })

  it('rejects invalid metric names', () => {
    expect(() => MetricNameSchema.parse('invalidMetric')).toThrow()
    expect(() => MetricNameSchema.parse('')).toThrow()
  })
})

describe('ProviderTypeSchema', () => {
  it('accepts "anthropic"', () => {
    expect(ProviderTypeSchema.parse('anthropic')).toBe('anthropic')
  })

  it('accepts "openai"', () => {
    expect(ProviderTypeSchema.parse('openai')).toBe('openai')
  })

  it('rejects unknown provider types', () => {
    expect(() => ProviderTypeSchema.parse('gemini')).toThrow()
  })
})
