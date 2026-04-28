import { describe, expect, it, vi } from 'vitest'

import { runWithConcurrency } from '../../src/utils/batch.js'

describe('runWithConcurrency', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5]
    const results = await runWithConcurrency(items, 2, async (item) => item * 2)
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  it('preserves order even with different async durations', async () => {
    const items = [3, 1, 2]
    // item 1 takes 30ms, item 2 takes 10ms, item 3 takes 20ms
    const results = await runWithConcurrency(items, 3, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, item * 10))
      return item
    })
    expect(results).toEqual([3, 1, 2]) // Order of input, not completion
  })

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0
    let currentConcurrent = 0

    const items = Array.from({ length: 10 }, (_, i) => i)
    await runWithConcurrency(items, 3, async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
      await new Promise((resolve) => setTimeout(resolve, 10))
      currentConcurrent--
      return 1
    })

    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('handles concurrency greater than items count', async () => {
    const items = [1, 2]
    const results = await runWithConcurrency(items, 10, async (item) => item + 10)
    expect(results).toEqual([11, 12])
  })

  it('handles single item', async () => {
    const results = await runWithConcurrency([42], 1, async (item) => item)
    expect(results).toEqual([42])
  })

  it('handles empty array', async () => {
    const fn = vi.fn()
    const results = await runWithConcurrency([], 5, fn)
    expect(results).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('propagates errors from worker functions', async () => {
    await expect(
      runWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('item 2 failed')
        return item
      }),
    ).rejects.toThrow('item 2 failed')
  })

  it('throws on invalid concurrency value', async () => {
    await expect(runWithConcurrency([1], 0, async (x) => x)).rejects.toThrow(
      'concurrency must be a positive integer',
    )
    await expect(runWithConcurrency([1], -1, async (x) => x)).rejects.toThrow(
      'concurrency must be a positive integer',
    )
  })

  it('passes index to worker function', async () => {
    const items = ['a', 'b', 'c']
    const indices: number[] = []
    await runWithConcurrency(items, 1, async (_item, index) => {
      indices.push(index)
      return index
    })
    expect(indices).toEqual([0, 1, 2])
  })

  it('throws on float concurrency value', async () => {
    await expect(runWithConcurrency([1], 1.5, async (x) => x)).rejects.toThrow(
      'concurrency must be a positive integer',
    )
  })
})

describe('runWithConcurrency — sparse array (undefined item guard)', () => {
  it('skips undefined holes in a sparse array', async () => {
    // Create a sparse array with a hole at index 1
    // eslint-disable-next-line no-sparse-arrays -- intentionally testing sparse array handling
    const sparse: string[] = ['a', , 'c'] as string[]
    const processed: string[] = []
    const results = await runWithConcurrency(sparse, 2, async (item) => {
      processed.push(item)
      return item.toUpperCase()
    })
    // Only 'a' and 'c' should be processed (hole at index 1 is skipped)
    expect(processed).toContain('a')
    expect(processed).toContain('c')
    expect(results[0]).toBe('A')
    expect(results[2]).toBe('C')
  })
})
