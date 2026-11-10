import { SIZE, GENERATOR_VERSION, CURRENT_GENERATOR_VERSION, LATEST_GENERATOR_VERSION, validSize, OPERATORS, type Cage, type CellValue, type ConstraintPuzzle, type Digit, type PuzzleDefinition } from './types.ts'
import { validSeed } from './random.ts'
export const neighbors = (id: number, size: number = SIZE): number[] => [
  ...(id >= size ? [id - size] : []), ...(id % size < size - 1 ? [id + 1] : []),
  ...(id < size * (size - 1) ? [id + size] : []), ...(id % size > 0 ? [id - 1] : []),
]
export function connected(cells: readonly number[], size: number = SIZE): boolean {
  if (!cells.length) return false
  const allowed = new Set(cells), visited = new Set([cells[0]]), queue = [cells[0]]
  for (let i = 0; i < queue.length; i++) for (const n of neighbors(queue[i], size)) if (allowed.has(n) && !visited.has(n)) { visited.add(n); queue.push(n) }
  return visited.size === allowed.size
}
export function satisfiesCage(cage: Cage, values: readonly number[], size: number = SIZE): boolean {
  if (values.length !== cage.cells.length || values.some(v => !Number.isInteger(v) || v < 1 || v > size)) return false
  switch (cage.op) {
    case '=': return values[0] === cage.target
    case '+': return values.reduce((a, b) => a + b, 0) === cage.target
    case '*': return values.reduce((a, b) => a * b, 1) === cage.target
    case '-': return Math.abs(values[0] - values[1]) === cage.target
    case '/': return Math.max(...values) === Math.min(...values) * cage.target
  }
}
export function validatePuzzle(raw: unknown): string[] {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') return ['Problem is not an object']
  const puzzle = raw as Record<string, unknown>
  if (!validSize(puzzle.size) || !Array.isArray(puzzle.cages) || !puzzle.cages.length || puzzle.cages.length > Number(puzzle.size) ** 2) return ['Expected a 3–9 square puzzle with cages']
  const size = Number(puzzle.size)
  const seen = new Set<number>(), ids = new Set<string>()
  for (const rawCage of puzzle.cages) {
    if (!rawCage || typeof rawCage !== 'object') { errors.push('Invalid cage'); continue }
    const cage = rawCage as Record<string, unknown>
    if (typeof cage.id !== 'string' || !cage.id || ids.has(cage.id)) errors.push('Invalid/duplicate cage ID')
    else ids.add(cage.id)
    if (!Array.isArray(cage.cells) || !cage.cells.length || cage.cells.length > 5) { errors.push('Invalid cage cells'); continue }
    const cells = cage.cells as unknown[]
    if (cells.some(id => typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= size * size)) { errors.push('Cell outside board'); continue }
    for (const id of cells as number[]) { if (seen.has(id)) errors.push('Cell assigned twice'); seen.add(id) }
    if (!connected(cells as number[], size)) errors.push('Disconnected cage')
    if (typeof cage.target !== 'number' || !Number.isSafeInteger(cage.target) || cage.target < 0) errors.push('Invalid target')
    const k = cells.length
    if (cage.op === '=') { if (k !== 1 || Number(cage.target) < 1 || Number(cage.target) > size) errors.push('Invalid fixed cage') }
    else if (cage.op === '-' || cage.op === '/') { if (k !== 2 || (cage.op === '/' && Number(cage.target) < 1)) errors.push('Invalid binary cage') }
    else if (cage.op === '+' || cage.op === '*') { if (k < 2 || Number(cage.target) < 1) errors.push('Invalid arithmetic cage') }
    else errors.push('Unknown operator')
  }
  if (seen.size !== size * size) errors.push('Cages do not cover the board')
  return errors
}
export function isVerifiedPuzzle(raw: unknown): raw is PuzzleDefinition {
  if (validatePuzzle(raw).length) return false
  const p = raw as Record<string, unknown>
  return p.verification === 'unique' && (p.generatorVersion === GENERATOR_VERSION || p.generatorVersion === CURRENT_GENERATOR_VERSION || p.generatorVersion === LATEST_GENERATOR_VERSION) && typeof p.difficulty === 'string' && ['easy', 'normal', 'hard'].includes(p.difficulty)
    && (p.generatorVersion !== GENERATOR_VERSION || (p.size === 5 && p.difficulty === 'normal'))
    && typeof p.id === 'string' && p.id.length > 0 && validSeed(p.seed)
    && Array.isArray(p.operators) && p.operators.length > 0 && p.operators.length <= 4 && new Set(p.operators).size === p.operators.length && p.operators.every(op => OPERATORS.includes(op))
    && (p.cages as Cage[]).filter(c => c.op === '=').length <= (p.generatorVersion === GENERATOR_VERSION ? 5 : Number(p.size) ** 2 - 1)
    && (p.cages as Cage[]).every(c => c.op === '=' || (p.operators as string[]).includes(c.op))
}
// Local feasibility only: this never solves the full puzzle or exposes a solution.
// An unfinished cage is a conflict only when every completion is ruled out by
// its arithmetic and the currently entered row/column values.
export function canCompleteCage(cage: Cage, values: readonly CellValue[], size: number = SIZE): boolean {
  const working = [...values]
  function visit(index: number): boolean {
    const known = cage.cells.map(id => working[id]).filter((v): v is Digit => v !== null)
    const missing = cage.cells.length - known.length
    if (cage.op === '+') {
      const sum = known.reduce<number>((a, b) => a + b, 0)
      if (sum + missing > cage.target || sum + missing * size < cage.target) return false
    }
    if (cage.op === '*') {
      const product = known.reduce<number>((a, b) => a * b, 1)
      if (product > cage.target || cage.target % product !== 0 || product * size ** missing < cage.target) return false
    }
    if (index === cage.cells.length) return satisfiesCage(cage, cage.cells.map(id => working[id] as Digit), size)
    const id = cage.cells[index]
    if (working[id] !== null) return visit(index + 1)
    for (let value = 1; value <= size; value++) {
      if (working.some((other, j) => other === value && (Math.floor(id / size) === Math.floor(j / size) || id % size === j % size))) continue
      working[id] = value as Digit
      if (visit(index + 1)) { working[id] = null; return true }
      working[id] = null
    }
    return false
  }
  return visit(0)
}
export interface InputCheck { valid: boolean; duplicateCells: number[]; conflictingCages: string[] }
export function checkConstraints(puzzle: ConstraintPuzzle, values: readonly CellValue[]): InputCheck {
  const size = puzzle.size, count = size * size
  if (values.length !== count || values.some(v => v !== null && (!Number.isInteger(v) || v < 1 || v > size))) return { valid: false, duplicateCells: [], conflictingCages: [] }
  const duplicate = new Set<number>()
  for (let i = 0; i < count; i++) {
    if (values[i] === null) continue
    for (let j = i + 1; j < count; j++) if (values[i] === values[j] && (Math.floor(i / size) === Math.floor(j / size) || i % size === j % size)) { duplicate.add(i); duplicate.add(j) }
  }
  const conflicts = puzzle.cages.filter(c => !canCompleteCage(c, values, size)).map(c => c.id)
  return { valid: duplicate.size === 0 && conflicts.length === 0, duplicateCells: [...duplicate], conflictingCages: conflicts }
}
export function isComplete(puzzle: ConstraintPuzzle, values: readonly CellValue[]): boolean {
  return values.length === puzzle.size ** 2 && values.every(v => v !== null) && checkConstraints(puzzle, values).valid
}
