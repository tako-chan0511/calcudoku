import { describe, expect, it } from 'vitest'
import { createRandom, shuffle } from '../../src/core/random.ts'
import { generateLatinSquare } from '../../src/core/latinSquare.ts'
describe('seeded Latin squares', () => {
  it.each([0, 1, 42, 123, 20261109, 0xffffffff])('makes a valid 5×5 Latin square for seed %i', seed => {
    const grid = generateLatinSquare(createRandom(seed))
    expect(grid).toHaveLength(25)
    for (let i = 0; i < 5; i++) {
      expect([...grid.slice(i * 5, i * 5 + 5)].sort()).toEqual([1, 2, 3, 4, 5])
      expect(Array.from({ length: 5 }, (_, row) => grid[row * 5 + i]).sort()).toEqual([1, 2, 3, 4, 5])
    }
    expect(generateLatinSquare(createRandom(seed))).toEqual(grid)
  })
  it.each([-1, 1.5, NaN, Infinity, 0x100000000])('rejects invalid seed %s', seed => expect(() => createRandom(seed)).toThrow())
  it('keeps random numbers bounded and never mutates the shuffled input', () => {
    const a = createRandom(10), b = createRandom(10)
    for (let i = 0; i < 100; i++) { const n = a(); expect(n).toBe(b()); expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1) }
    const input = [1, 2, 3, 4, 5]
    shuffle(input, a); expect(input).toEqual([1, 2, 3, 4, 5])
    expect(generateLatinSquare(createRandom(11))).not.toEqual(generateLatinSquare(createRandom(10)))
  })
})
