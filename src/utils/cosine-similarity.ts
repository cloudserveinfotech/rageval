/**
 * Computes the cosine similarity between two numeric vectors.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Cosine similarity in the range [-1, 1]. Returns 0 for zero vectors.
 *
 * @example
 * ```typescript
 * import { cosineSimilarity } from 'rageval'
 *
 * const score = cosineSimilarity([1, 0, 0], [1, 0, 0]) // 1.0
 * const score2 = cosineSimilarity([1, 0, 0], [0, 1, 0]) // 0.0
 * ```
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: a.length=${a.length}, b.length=${b.length}`)
  }

  if (a.length === 0) {
    throw new Error('Vectors must not be empty')
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dotProduct += ai * bi
    magnitudeA += ai * ai
    magnitudeB += bi * bi
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB)

  // Avoid division by zero for zero vectors
  if (magnitude === 0) {
    return 0
  }

  return dotProduct / magnitude
}
