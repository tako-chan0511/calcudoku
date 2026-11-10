import { BudgetExceeded, WorkBudget } from './budget.ts'
import { createCages, refineCage } from './cages.ts'
import { isComplete, validatePuzzle } from './constraints.ts'
import { generateLatinSquare } from './latinSquare.ts'
import { createRandom, validSeed } from './random.ts'
import { solvePuzzle } from './solver.ts'
import { GENERATOR_VERSION, OPERATORS, type GenerationMetrics, type GenerationResult, type GenerationSettings, type Operator } from './types.ts'
export interface GenerationLimits { maxWork: number; maxSolveWork: number; maxAttempts: number; maxRefinements: number; maxFixedCells: number }
export const DEFAULT_LIMITS: Readonly<GenerationLimits> = Object.freeze({ maxWork: 1_500_000, maxSolveWork: 150_000, maxAttempts: 12, maxRefinements: 12, maxFixedCells: 5 })
export function validSettings(raw: unknown): raw is GenerationSettings {
  if (!raw || typeof raw !== 'object') return false
  const s = raw as Record<string, unknown>
  return s.size === 5 && s.difficulty === 'normal' && validSeed(s.seed) && Array.isArray(s.operators) && s.operators.length > 0 && s.operators.length <= 4 && s.operators.every(op => OPERATORS.includes(op)) && new Set(s.operators).size === s.operators.length
}
export function generateLegacyPuzzle(settings: GenerationSettings, overrides: Partial<GenerationLimits> = {}): GenerationResult {
  const metrics: GenerationMetrics = { attempts: 0, solverCalls: 0, refinements: 0, work: 0 }
  const fail = (reason: Extract<GenerationResult, { status: 'failure' }>['reason']): GenerationResult => ({ status: 'failure', reason, metrics })
  const limits = { ...DEFAULT_LIMITS, ...overrides }
  if (!validSettings(settings) || Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 0) || limits.maxFixedCells > 24) return fail('invalid-settings')
  const operators: Operator[] = OPERATORS.filter(op => settings.operators.includes(op))
  const random = createRandom(settings.seed), budget = new WorkBudget(limits.maxWork)
  let exhausted = false
  try {
    for (let attempt = 0; attempt < limits.maxAttempts; attempt++) {
      budget.spend(); metrics.attempts++
      const solution = generateLatinSquare(random)
      let cages = createCages(solution, random, operators)
      for (let adjustment = 0; adjustment <= limits.maxRefinements; adjustment++) {
        budget.spend()
        const candidate = { size: 5 as const, cages }
        if (validatePuzzle(candidate).length || !isComplete(candidate, solution)) return fail('internal-error')
        if (cages.filter(c => c.op === '=').length > limits.maxFixedCells) break
        metrics.solverCalls++
        const result = solvePuzzle(candidate, { maxWork: limits.maxSolveWork, parentBudget: budget })
        if (result.status === 'unique') {
          if (result.solution.some((v, i) => v !== solution[i])) return fail('internal-error')
          metrics.work = budget.used
          const identity = JSON.stringify([GENERATOR_VERSION, 5, 'normal', operators, settings.seed, cages.map(c => [c.cells, c.op, c.target])])
          return { status: 'success', puzzle: { ...candidate, seed: settings.seed, difficulty: 'normal', operators, id: identity, generatorVersion: GENERATOR_VERSION, verification: 'unique' }, metrics }
        }
        if (result.status === 'budgetExceeded') { exhausted = true; break }
        if (result.status !== 'multiple') return fail('internal-error')
        if (adjustment === limits.maxRefinements) break
        const cell = solution.findIndex((_, i) => result.witnesses[0][i] !== result.witnesses[1][i])
        cages = refineCage(cages, cell, solution); metrics.refinements++
      }
    }
    return fail(exhausted ? 'budget-exceeded' : 'attempt-limit')
  } catch (error) {
    if (error instanceof BudgetExceeded) return fail('budget-exceeded')
    throw error
  } finally { metrics.work = budget.used }
}
