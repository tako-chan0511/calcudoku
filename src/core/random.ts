export function validSeed(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff
}
export function createRandom(seed: number): () => number {
  if (!validSeed(seed)) throw new RangeError('Seed must be an unsigned 32-bit integer')
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ state >>> 15, state | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
