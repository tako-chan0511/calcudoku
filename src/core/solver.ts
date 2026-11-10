import { BudgetExceeded, WorkBudget } from './budget.ts'
import { isComplete, satisfiesCage, validatePuzzle } from './constraints.ts'
import { type Cage, type CellValue, type ConstraintPuzzle, type Digit, type SolveResult, type SolverStats } from './types.ts'
const bit = (value: number) => 1 << (value - 1)
const singleton = (mask: number) => mask !== 0 && (mask & (mask - 1)) === 0
const popcount = (mask: number) => { let count = 0; for (let v = mask; v; v &= v - 1) count++; return count }
export interface SolveOptions { maxWork?: number; values?: readonly CellValue[]; parentBudget?: WorkBudget; hiddenSingles?: boolean; search?: boolean }
function cageTuples(cage: Cage, budget: WorkBudget, size: number): Digit[][] {
  const result: Digit[][] = [], tuple: Digit[] = []
  function enumerate(index: number, sum: number, product: number) {
    budget.spend()
    if (index === cage.cells.length) { if (satisfiesCage(cage, tuple, size)) result.push([...tuple]); return }
    const remaining = cage.cells.length - index
    if (cage.op === '+' && (sum + remaining > cage.target || sum + remaining * size < cage.target)) return
    if (cage.op === '*' && (cage.target % product !== 0 || product > cage.target || product * size ** remaining < cage.target)) return
    for (let value = 1; value <= size; value++) {
      if (cage.op === '=' && value !== cage.target) continue
      const id = cage.cells[index]
      if (tuple.some((other, i) => other === value && (Math.floor(cage.cells[i] / size) === Math.floor(id / size) || cage.cells[i] % size === id % size))) continue
      tuple.push(value as Digit); enumerate(index + 1, sum + value, product * value); tuple.pop()
    }
  }
  enumerate(0, 0, 1)
  return result
}
export function solvePuzzle(puzzle: ConstraintPuzzle, options: SolveOptions = {}): SolveResult {
  const stats: SolverStats = { nodes: 0, work: 0, solutionsFound: 0, firstSolutionWork: null, maxDepth: 0, rootUnresolved: 0, propagationRounds: 0 }
  const errors = validatePuzzle(puzzle)
  if (errors.length) return { status: 'invalid', errors, stats }
  const size = puzzle.size, count = size * size, ALL = (1 << size) - 1
  const UNITS = Array.from({ length: size * 2 }, (_, index) => Array.from({ length: size }, (_, i) => index < size ? index * size + i : i * size + index - size))
  const maxWork = options.maxWork ?? solverBudget(size)
  if (!Number.isSafeInteger(maxWork) || maxWork < 0) return { status: 'invalid', errors: ['Invalid solver budget'], stats }
  const initial = options.values ?? Array<CellValue>(count).fill(null)
  if (initial.length !== count || initial.some(v => v !== null && (!Number.isInteger(v) || v < 1 || v > size))) return { status: 'invalid', errors: ['Invalid cell values'], stats }
  const budget = new WorkBudget(maxWork, options.parentBudget)
  const solutions: Digit[][] = []
  try {
    const tables = puzzle.cages.map(c => cageTuples(c, budget, size))
    function propagate(domains: number[]): boolean {
      let changed = true
      while (changed) {
        changed = false; stats.propagationRounds!++
        for (const unit of UNITS) {
          let used = 0
          for (const id of unit) {
            budget.spend()
            const mask = domains[id]
            if (!mask) return false
            if (singleton(mask)) { if (used & mask) return false; used |= mask }
          }
          for (const id of unit) if (!singleton(domains[id])) {
            const next = domains[id] & ~used
            if (!next) return false
            if (next !== domains[id]) { domains[id] = next; changed = true }
          }
          if (options.hiddenSingles !== false) for (let value = 1; value <= size; value++) {
            budget.spend()
            const candidates = unit.filter(id => domains[id] & bit(value))
            if (!candidates.length) return false
            if (candidates.length === 1 && domains[candidates[0]] !== bit(value)) { domains[candidates[0]] = bit(value); changed = true }
          }
        }
        for (let i = 0; i < puzzle.cages.length; i++) {
          const cage = puzzle.cages[i], support = Array<number>(cage.cells.length).fill(0)
          for (const tuple of tables[i]) {
            budget.spend()
            if (tuple.every((v, j) => domains[cage.cells[j]] & bit(v))) tuple.forEach((v, j) => { support[j] |= bit(v) })
          }
          for (let j = 0; j < cage.cells.length; j++) {
            const id = cage.cells[j], next = domains[id] & support[j]
            if (!next) return false
            if (next !== domains[id]) { domains[id] = next; changed = true }
          }
        }
      }
      return true
    }
    let stalled = false
    function search(domains: number[], depth = 0) {
      stats.maxDepth = Math.max(stats.maxDepth!, depth)
      budget.spend(); stats.nodes++
      if (!propagate(domains)) return
      if (depth === 0) stats.rootUnresolved = domains.filter(mask => !singleton(mask)).length
      let selected = -1, fewest = size + 1
      for (let i = 0; i < domains.length; i++) {
        const count = popcount(domains[i])
        if (count > 1 && count < fewest) { selected = i; fewest = count }
      }
      if (selected === -1) {
        const solution = domains.map(mask => (Math.log2(mask) + 1) as Digit)
        if (!isComplete(puzzle, solution)) throw new Error('Invalid solver completion')
        solutions.push(solution); stats.solutionsFound = solutions.length
        if (stats.firstSolutionWork === null) stats.firstSolutionWork = budget.used
        return
      }
      if (options.search === false) { stalled = true; return }
      for (let value = 1; value <= size; value++) if (domains[selected] & bit(value)) {
        const branch = [...domains]; branch[selected] = bit(value); search(branch, depth + 1)
        if (solutions.length >= 2) return
      }
    }
    search(initial.map(v => v === null ? ALL : bit(v)))
    stats.work = budget.used
    if (solutions.length >= 2) return { status: 'multiple', witnesses: [solutions[0], solutions[1]], stats }
    if (solutions.length === 1) return { status: 'unique', solution: solutions[0], stats }
    return { status: stalled ? 'stalled' : 'unsatisfiable', stats }
  } catch (error) {
    stats.work = budget.used
    if (error instanceof BudgetExceeded) return { status: 'budgetExceeded', stats }
    throw error
  }
}

export const solverBudget = (size: number): number => size <= 5 ? 150_000 : [0, 0, 0, 0, 0, 0, 350_000, 700_000, 1_000_000, 1_500_000][size] ?? 150_000
