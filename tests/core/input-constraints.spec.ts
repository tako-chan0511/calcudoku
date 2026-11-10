import { expect, it } from 'vitest'
import { canCompleteCage, checkConstraints, isComplete } from '../../src/core/constraints.ts'
import type { Cage, CellValue } from '../../src/core/types.ts'
const empty = () => Array<CellValue>(25).fill(null)
it.each([
  { op: '+', target: 7, input: 2, possible: true },
  { op: '+', target: 3, input: 5, possible: false },
  { op: '*', target: 10, input: 2, possible: true },
  { op: '*', target: 10, input: 3, possible: false },
  { op: '-', target: 3, input: 2, possible: true },
  { op: '-', target: 3, input: 3, possible: false },
  { op: '/', target: 2, input: 2, possible: true },
  { op: '/', target: 2, input: 3, possible: false },
] as const)('warns about partial $op cages only when impossible: $input -> $possible', ({ op, target, input, possible }) => {
  const cage: Cage = { id: 'test', cells: [0, 1], op, target }
  const values = empty(); values[0] = input
  const before = [...values]
  expect(canCompleteCage(cage, values)).toBe(possible)
  expect(checkConstraints({ size: 5, cages: [cage] }, values).conflictingCages).toEqual(possible ? [] : ['test'])
  expect(values).toEqual(before)
})
it('does not warn on a feasible empty/incomplete cage, and rejects a completed wrong total', () => {
  const cage: Cage = { id: 'sum', cells: [0, 1, 6], op: '+', target: 8 }
  const puzzle = { size: 5 as const, cages: [cage] }, values = empty()
  expect(checkConstraints(puzzle, values).valid).toBe(true)
  values[0] = 2
  expect(checkConstraints(puzzle, values).valid).toBe(true)
  expect(isComplete(puzzle, values)).toBe(false)
  values[1] = 3; values[6] = 4
  expect(checkConstraints(puzzle, values).conflictingCages).toEqual(['sum'])
})
it('recognizes a partial contradiction forced by entered row/column values', () => {
  const cage: Cage = { id: 'sum', cells: [0, 1], op: '+', target: 3 }
  const values = empty(); values[0] = 1
  expect(canCompleteCage(cage, values)).toBe(true)
  values[6] = 2 // Only possible value at cell 1 is now unavailable in its column.
  expect(checkConstraints({ size: 5, cages: [cage] }, values).conflictingCages).toEqual(['sum'])
})
it('detects both row and column duplicates without flagging an unrelated equal value', () => {
  const values = empty(); values[0] = 2; values[1] = 2; values[5] = 2; values[12] = 2
  expect(new Set(checkConstraints({ size: 5, cages: [] }, values).duplicateCells)).toEqual(new Set([0, 1, 5]))
})
it('rejects malformed and out-of-range input arrays', () => {
  for (const value of [0, 6, -1, NaN, Infinity, 1.5, '2', undefined]) {
    const values = empty(); values[0] = value as CellValue
    expect(checkConstraints({ size: 5, cages: [] }, values).valid).toBe(false)
  }
  expect(checkConstraints({ size: 5, cages: [] }, []).valid).toBe(false)
})

// A valid completion must remain possible after revealing any prefix of it.
it.each([0, 1, 42, 123])('does not report false contradictions on correct partial entries (seed %i)', async seed => {
  const { generatePuzzle } = await import('../../src/core/generator.ts')
  const { solvePuzzle } = await import('../../src/core/solver.ts')
  const { settingsForSeed } = await import('../../src/core/types.ts')
  const generated = generatePuzzle(settingsForSeed(seed))
  if (generated.status !== 'success') throw new Error('Fixture generation failed')
  const solved = solvePuzzle(generated.puzzle)
  if (solved.status !== 'unique') throw new Error('Fixture must be unique')
  const values = empty()
  for (const cage of generated.puzzle.cages) if (cage.op === '=') values[cage.cells[0]] = cage.target
  for (let id = 0; id < 25; id++) {
    expect(checkConstraints(generated.puzzle, values).valid).toBe(true)
    values[id] = solved.solution[id]
  }
  expect(isComplete(generated.puzzle, values)).toBe(true)
})
it('does not clear a Latin square that violates cage arithmetic', async () => {
  const { gameSolution } = await import('../game-fixture.ts')
  const { fixedPuzzle } = await import('../fixtures.ts')
  const shifted = gameSolution.map(n => (n % 5 + 1) as CellValue)
  const check = checkConstraints(fixedPuzzle, shifted)
  expect(check.duplicateCells).toEqual([])
  expect(check.conflictingCages.length).toBeGreaterThan(0)
  expect(isComplete(fixedPuzzle, shifted)).toBe(false)
})
