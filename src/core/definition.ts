import { WorkBudget } from './budget.ts'
import { binaryFixedLimit, matchingCages } from './proposalsV3.ts'
import { isVerifiedPuzzle } from './constraints.ts'
import { assessDifficulty } from './difficulty.ts'
import { puzzleIdentity, limitsFor } from './generator.ts'
import { solvePuzzle } from './solver.ts'
import { CURRENT_GENERATOR_VERSION, LATEST_GENERATOR_VERSION, GENERATOR_VERSION, OPERATORS, type PuzzleDefinition } from './types.ts'
export const keysAre = (raw: object, keys: string[]) => Object.keys(raw).sort().join(',') === [...keys].sort().join(',')
export function canonicalPuzzle(raw: unknown): raw is PuzzleDefinition {
  if (!isVerifiedPuzzle(raw) || !keysAre(raw, ['size', 'cages', 'seed', 'difficulty', 'operators', 'id', 'generatorVersion', 'verification'])
    || raw.id.length > 16000 || raw.operators.join(',') !== OPERATORS.filter(op => raw.operators.includes(op)).join(',')
    || raw.cages.some(c => !keysAre(c, ['id', 'cells', 'op', 'target']) || c.id.length > 128)) return false
  return raw.id === puzzleIdentity(raw)
}
export function verifyDefinition(puzzle: PuzzleDefinition): boolean {
  if (!canonicalPuzzle(puzzle)) return false
  const solved = solvePuzzle(puzzle)
  if (solved.status !== 'unique') return false
  if (puzzle.generatorVersion === GENERATOR_VERSION) return true
  if (puzzle.generatorVersion !== CURRENT_GENERATOR_VERSION && puzzle.generatorVersion !== LATEST_GENERATOR_VERSION) return false
  const assessment = assessDifficulty(puzzle, solved)
  let fixedLimit = limitsFor(puzzle).maxFixedCells
  if (puzzle.generatorVersion === LATEST_GENERATOR_VERSION && puzzle.operators.every(op => op === '-' || op === '/')) {
    const matched = matchingCages(solved.solution, puzzle.size, puzzle.operators, () => 0, new WorkBudget(100_000))
    fixedLimit = binaryFixedLimit(puzzle.size, puzzle.difficulty, matched.filter(c => c.op === '=').length, fixedLimit)
  }
  return assessment?.difficulty === puzzle.difficulty && assessment.fixedCells <= fixedLimit
    && (puzzle.difficulty === 'hard' || assessment.fixedCells >= 1)
}
export function publicPuzzle(p: PuzzleDefinition): PuzzleDefinition {
  return { size: p.size, cages: p.cages.map(c => ({ id: c.id, cells: [...c.cells], op: c.op, target: c.target })) as PuzzleDefinition['cages'], seed: p.seed, difficulty: p.difficulty, operators: [...p.operators], id: p.id, generatorVersion: p.generatorVersion, verification: p.verification }
}
