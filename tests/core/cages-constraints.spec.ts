import { describe, expect, it } from 'vitest'
import { createCages, makeCage, refineCage } from '../../src/core/cages.ts'
import { checkConstraints, connected, isComplete, satisfiesCage, validatePuzzle } from '../../src/core/constraints.ts'
import { createRandom } from '../../src/core/random.ts'
import { OPERATORS, type Cage, type CellValue } from '../../src/core/types.ts'
import { fixedPuzzle, solution } from '../fixtures.ts'
describe('cages and constraints', () => {
  it.each([0, 1, 42, 123, 999])('covers every cell once with connected cages for seed %i', seed => {
    const cages = createCages(solution, createRandom(seed), OPERATORS)
    expect(validatePuzzle({ size: 5, cages })).toEqual([])
    expect(cages.flatMap(c => [...c.cells]).sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i))
    for (const cage of cages) {
      expect(connected(cage.cells)).toBe(true)
      expect(satisfiesCage(cage, cage.cells.map(id => solution[id]))).toBe(true)
      if (cage.op === '-' || cage.op === '/') expect(cage.cells).toHaveLength(2)
      if (cage.op === '/') expect(Number.isInteger(cage.target)).toBe(true)
    }
  })
  it.each([
    [{ id: 'a', cells: [0, 1], op: '+', target: 7 }, [2, 5], true],
    [{ id: 'a', cells: [0, 1], op: '*', target: 10 }, [2, 5], true],
    [{ id: 'a', cells: [0, 1], op: '-', target: 3 }, [5, 2], true],
    [{ id: 'a', cells: [0, 1], op: '-', target: 3 }, [2, 5], true],
    [{ id: 'a', cells: [0, 1], op: '/', target: 2 }, [2, 4], true],
    [{ id: 'a', cells: [0, 1], op: '/', target: 2 }, [4, 2], true],
    [{ id: 'a', cells: [0, 1], op: '/', target: 2 }, [3, 2], false],
    [{ id: 'a', cells: [0], op: '=', target: 3 }, [3], true],
  ] as [Cage, number[], boolean][])('checks arithmetic %j using %j', (cage, values, expected) => expect(satisfiesCage(cage, values)).toBe(expected))
  it('allows equal cage values in different rows/columns and detects real duplicate inputs', () => {
    const values: CellValue[] = Array<CellValue>(25).fill(null)
    values[0] = 1; values[1] = 2; values[5] = 2
    const cage: Cage = { id: 'a', cells: [0, 1, 5], op: '+', target: 5 }
    expect(checkConstraints({ size: 5, cages: [cage] }, values).valid).toBe(true)
    values[1] = 1
    expect(checkConstraints({ size: 5, cages: [cage] }, values).duplicateCells).toEqual([0, 1])
    expect(checkConstraints({ size: 5, cages: [cage] }, values).conflictingCages).toEqual(['a'])
    expect(isComplete(fixedPuzzle, solution)).toBe(true)
    expect(isComplete(fixedPuzzle, Array<CellValue>(25).fill(null))).toBe(false)
  })
  it('rejects overlaps, gaps, disconnected cages, invalid targets and arities', () => {
    expect(validatePuzzle({ size: 5, cages: [...fixedPuzzle.cages, fixedPuzzle.cages[0]] }).length).toBeGreaterThan(0)
    expect(validatePuzzle({ size: 5, cages: fixedPuzzle.cages.slice(1) }).length).toBeGreaterThan(0)
    expect(validatePuzzle({ size: 5, cages: [{ id: 'a', cells: [0, 24], op: '+', target: 3 }] })).toContain('Disconnected cage')
    expect(validatePuzzle({ size: 5, cages: [{ id: 'a', cells: [0], op: '/', target: 1 }] })).toContain('Invalid binary cage')
    expect(validatePuzzle({ size: 5, cages: [{ id: 'a', cells: [30], op: '=', target: 1 }] })).toContain('Cell outside board')
    expect(validatePuzzle({ size: 5, cages: [{ id: 'a', cells: [0], op: '=', target: NaN }] })).toContain('Invalid target')
  })
  it('refines a branching cage into connected components while keeping its solution', () => {
    const original = makeCage([1, 5, 6, 7], '*', solution)
    const refined = refineCage([original], 6, solution)
    expect(refined).toHaveLength(4)
    expect(original.cells).toEqual([1, 5, 6, 7])
    for (const c of refined) { expect(connected(c.cells)).toBe(true); expect(satisfiesCage(c, c.cells.map(id => solution[id]))).toBe(true) }
  })
})
