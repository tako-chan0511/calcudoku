import { checkConstraints } from './constraints.ts'
import type { CellValue, Digit, PuzzleDefinition } from './types.ts'
export interface CandidateHint { digits: Digit[]; reasons: string[] }
// Local candidates; the selected value is replaced, other inputs stay fixed.
export function cellCandidates(puzzle: PuzzleDefinition, values: readonly CellValue[], id: number): CandidateHint {
  if (!Number.isInteger(id) || id < 0 || id >= puzzle.size ** 2 || values.length !== puzzle.size ** 2 || values.some(v => v !== null && (!Number.isInteger(v) || v < 1 || v > puzzle.size))) return { digits: [], reasons: ['入力データが不正です。'] }
  if (puzzle.cages.some(c => c.op === '=' && c.cells[0] === id)) return { digits: [], reasons: ['固定セルは変更できません。'] }
  const check = checkConstraints(puzzle, values), reasons: string[] = []
  if (check.duplicateCells.length) reasons.push('現在の入力には、同じ行・列の数字の重複があります。')
  if (check.conflictingCages.length) reasons.push('現在の入力には、計算条件を満たせないケージがあります。')
  const trial = [...values], digits: Digit[] = []
  for (let digit = 1; digit <= puzzle.size; digit++) { trial[id] = digit as Digit; if (checkConstraints(puzzle, trial).valid) digits.push(digit as Digit) }
  return { digits, reasons }
}
