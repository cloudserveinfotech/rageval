import { describe, expect, it } from 'vitest'

import { cosineSimilarity } from '../../src/utils/cosine-similarity.js'

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0)
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0)
  })

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0)
    expect(cosineSimilarity([1, 0, 0], [0, 0, 1])).toBeCloseTo(0.0)
  })

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1.0)
  })

  it('handles vectors with different magnitudes correctly', () => {
    // [2, 0] and [5, 0] point in same direction
    expect(cosineSimilarity([2, 0], [5, 0])).toBeCloseTo(1.0)
  })

  it('returns 0 for zero vectors (no division by zero)', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0)
  })

  it('throws on mismatched dimensions', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('Vector dimensions must match')
  })

  it('throws on empty vectors', () => {
    expect(() => cosineSimilarity([], [])).toThrow('Vectors must not be empty')
  })

  it('works with large vectors', () => {
    const a = Array.from({ length: 1000 }, (_, i) => i)
    const b = Array.from({ length: 1000 }, (_, i) => i)
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0)
  })

  it('handles single-element vectors', () => {
    expect(cosineSimilarity([3], [5])).toBeCloseTo(1.0)
    expect(cosineSimilarity([-1], [1])).toBeCloseTo(-1.0)
  })
})

describe('cosineSimilarity — nullish coalescing fallback branches', () => {
  it('treats undefined elements in sparse arrays as 0 (a[i] ?? 0, b[i] ?? 0)', () => {
    // Sparse arrays have undefined slots — triggers the `?? 0` safety branches.
    // TypeScript types these as number[] but JS arrays can be sparse.
    const sparse = new Array(3) as number[] // [empty × 3] — all elements are undefined
    const dense = [1, 0, 0]
    // Both vectors contain undefined elements → treated as 0 → zero magnitude → result is 0
    expect(cosineSimilarity(sparse, sparse)).toBe(0)
    // sparse has all-0 magnitude → returns 0 (zero-vector branch)
    expect(cosineSimilarity(sparse, dense)).toBe(0)
  })
})
