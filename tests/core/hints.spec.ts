import { expect, it } from 'vitest'
import { cellCandidates } from '../../src/core/hints.ts'
import { getCellAnswer } from '../../src/services/cellAnswer.ts'
import type { Cage, CellValue } from '../../src/core/types.ts'
import { editableIds, fixedIds, gamePuzzle, gameSolution } from '../game-fixture.ts'
import { multiplePuzzle } from '../fixtures.ts'
const empty = () => Array<CellValue>(25).fill(null)
it.each([
  { op: '+', target: 6 }, { op: '*', target: 8 }, { op: '-', target: 2 }, { op: '/', target: 2 },
] as const)('considers row, column and $op arithmetic without changing inputs', ({ op, target }) => {
  const cage: Cage = { id: 'test', cells: [0, 1], op, target }
  const puzzle = { ...gamePuzzle, cages: [cage] }, values = empty(); values[1] = 4
  const before = [...values]
  expect(cellCandidates(puzzle, values, 0)).toEqual({ digits: [2], reasons: [] })
  expect(values).toEqual(before)
  values[5] = 2
  expect(cellCandidates(puzzle, values, 0).digits).toEqual([])
})
it('explains a wrong selected entry while offering replacement candidates', () => {
  const puzzle = { ...gamePuzzle, cages: [{ id: 'sum', cells: [0, 1], op: '+', target: 6 } as Cage] }, values = empty()
  values[0] = 5; values[1] = 4
  expect(cellCandidates(puzzle, values, 0).digits).toEqual([2])
  expect(cellCandidates(puzzle, values, 0).reasons.join('')).toContain('計算条件')
})
it('reports unrelated duplicate entries and no candidates until they are corrected', () => {
  const values = empty(); values[10] = 1; values[11] = 1
  const hint = cellCandidates(gamePuzzle, values, 0)
  expect(hint.digits).toEqual([]); expect(hint.reasons.join('')).toContain('重複')
})
it('protects fixed cells and rejects invalid hint inputs', () => {
  expect(cellCandidates(gamePuzzle, empty(), fixedIds[0]).reasons.join('')).toContain('固定')
  expect(cellCandidates(gamePuzzle, empty(), 25).digits).toEqual([])
  expect(cellCandidates(gamePuzzle, [], 0).reasons.join('')).toContain('不正')
})
it('returns only one correct digit, never a full solution payload', () => {
  const answer = getCellAnswer(gamePuzzle, editableIds[0])
  expect(answer).toEqual({ status: 'available', value: gameSolution[editableIds[0]] })
  expect(JSON.stringify(answer)).not.toMatch(/solution|witnesses/)
})
it('never guesses on budget exhaustion, multiple solutions or invalid selection', () => {
  expect(getCellAnswer(gamePuzzle, editableIds[0], 0)).toEqual({ status: 'budgetExceeded' })
  expect(getCellAnswer({ ...gamePuzzle, cages: multiplePuzzle.cages }, 0)).toEqual({ status: 'unavailable' })
  expect(getCellAnswer(gamePuzzle, fixedIds[0])).toEqual({ status: 'unavailable' })
  expect(getCellAnswer(gamePuzzle, -1)).toEqual({ status: 'unavailable' })
})
