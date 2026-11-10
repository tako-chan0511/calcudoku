import { WorkBudget } from './budget.ts'
import { solvePuzzle, solverBudget } from './solver.ts'
import type { ConstraintPuzzle, DifficultyAssessment, SolveResult } from './types.ts'
export function assessDifficulty(puzzle: ConstraintPuzzle, verified: SolveResult, parentBudget?: WorkBudget): DifficultyAssessment | null {
  if (verified.status !== 'unique') return null
  const fixedCells = puzzle.cages.filter(c => c.op === '=').length
  const maxCageSize = Math.max(...puzzle.cages.map(c => c.cells.length))
  const rootUnresolved = verified.stats.rootUnresolved ?? 0, searchDepth = verified.stats.maxDepth ?? 0
  if (rootUnresolved > 0) return { difficulty: 'hard', fixedCells, maxCageSize, basicSolved: false, propagationRounds: verified.stats.propagationRounds ?? 0, searchDepth, rootUnresolved }
  const basic = solvePuzzle(puzzle, { maxWork: solverBudget(puzzle.size), hiddenSingles: false, search: false, parentBudget })
  if (basic.status !== 'unique' && basic.status !== 'stalled') return null
  const basicSolved = basic.status === 'unique'
  const difficulty = !basicSolved || maxCageSize >= 3 ? 'normal' : 'easy'
  return { difficulty, fixedCells, maxCageSize, basicSolved, propagationRounds: verified.stats.propagationRounds ?? 0, searchDepth, rootUnresolved }
}
export function verifyDifficulty(puzzle: ConstraintPuzzle, difficulty: string): boolean {
  const solved = solvePuzzle(puzzle)
  return solved.status === 'unique' && assessDifficulty(puzzle, solved)?.difficulty === difficulty
}
