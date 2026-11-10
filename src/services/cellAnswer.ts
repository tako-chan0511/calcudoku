import { solvePuzzle, solverBudget } from '../core/solver.ts'
import type { Digit, PuzzleDefinition } from '../core/types.ts'
export type CellAnswer = { status: 'available'; value: Digit } | { status: 'budgetExceeded' | 'unavailable' }
// A temporary full solution stays in this call, never in UI/store state.
export function getCellAnswer(puzzle: PuzzleDefinition, id: number, maxWork = solverBudget(puzzle.size)): CellAnswer {
  if (!Number.isInteger(id) || id < 0 || id >= puzzle.size ** 2 || puzzle.cages.some(c => c.op === '=' && c.cells[0] === id)) return { status: 'unavailable' }
  try {
    const result = solvePuzzle(puzzle, { maxWork })
    if (result.status === 'budgetExceeded') return { status: 'budgetExceeded' }
    if (result.status !== 'unique') return { status: 'unavailable' }
    return { status: 'available', value: result.solution[id] }
  } catch { return { status: 'unavailable' } }
}
