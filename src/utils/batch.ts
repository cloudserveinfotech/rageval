/**
 * Runs an array of async tasks with bounded concurrency.
 *
 * Uses a worker-pool pattern: `concurrency` workers are started simultaneously,
 * each pulling the next item from a shared index. This is more efficient than
 * processing in fixed-size chunks because a fast worker immediately picks up
 * the next item rather than waiting for the slowest in its batch.
 *
 * Results are returned in the **same order as the input array**, regardless of
 * completion order. This is important for pairing sample results with their
 * original dataset entries.
 *
 * @param items       - Items to process. May be empty — returns [] immediately.
 * @param concurrency - Maximum number of tasks running simultaneously. Must be >= 1.
 * @param fn          - Async function applied to each item.
 * @returns Promise resolving to an array of results in input order.
 *
 * @throws {Error} If `concurrency` is not a positive integer.
 *
 * @example
 * ```typescript
 * // Evaluate 100 samples with at most 10 simultaneous LLM calls
 * const results = await runWithConcurrency(samples, 10, async (sample, index) => {
 *   return scoreSample(sample)
 * })
 * ```
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (concurrency <= 0 || !Number.isInteger(concurrency)) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`)
  }

  // Pre-allocate the result array so we can write results at the correct index
  // as workers complete, without needing sorting or re-ordering later.
  const results: R[] = new Array<R>(items.length)

  // Shared index counter — all workers pull from the same queue.
  // No locks needed because JavaScript is single-threaded: the increment in
  // `const index = nextIndex++` is atomic at the JS level.
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      const item = items[index]
      if (item === undefined) continue
      // Write result at the original index to preserve input order
      results[index] = await fn(item, index)
    }
  }

  // Start min(concurrency, items.length) workers — no point starting more workers
  // than there are items to process.
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)

  return results
}
