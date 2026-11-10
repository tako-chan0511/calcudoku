import { generatePuzzle } from '../src/core/generator.ts'
import { solvePuzzle } from '../src/core/solver.ts'
import { latestSettings } from '../src/core/types.ts'
const generated = generatePuzzle(latestSettings(0))
if (generated.status !== 'success') throw new Error('Game fixture generation failed')
export const gamePuzzle = generated.puzzle
const solved = solvePuzzle(gamePuzzle)
if (solved.status !== 'unique') throw new Error('Game fixture must be unique')
// Answers exist only in test fixtures, never in the game composable/UI payload.
export const gameSolution = solved.solution
export const fixedIds = gamePuzzle.cages.filter(c => c.op === '=').map(c => c.cells[0])
export const editableIds = Array.from({ length: 25 }, (_, id) => id).filter(id => !fixedIds.includes(id))
