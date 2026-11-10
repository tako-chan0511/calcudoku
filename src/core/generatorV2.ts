import { BudgetExceeded, WorkBudget } from './budget.ts'
import { createCages, refineCage } from './cages.ts'
import { isComplete, validatePuzzle } from './constraints.ts'
import { assessDifficulty } from './difficulty.ts'
import { generateLatinSquare } from './latinSquare.ts'
import { createRandom, validSeed } from './random.ts'
import { solvePuzzle, solverBudget } from './solver.ts'
import { generateLegacyPuzzle, DEFAULT_LIMITS, type GenerationLimits } from './legacyGenerator.ts'
import { CURRENT_GENERATOR_VERSION, GENERATOR_VERSION, OPERATORS, validSize, type GenerationMetrics, type GenerationProgress, type GenerationResult, type GenerationSettings, type Operator, type PuzzleDefinition } from './types.ts'
export { DEFAULT_LIMITS, type GenerationLimits }
export const versionFor = (settings: GenerationSettings) => settings.generatorVersion ?? (settings.size === 5 && settings.difficulty === 'normal' ? GENERATOR_VERSION : CURRENT_GENERATOR_VERSION)
export function validSettings(raw: unknown): raw is GenerationSettings {
  if (!raw || typeof raw !== 'object') return false
  const s = raw as Record<string, unknown>
  if (!validSize(s.size) || (typeof s.difficulty !== 'string' || !['easy', 'normal', 'hard'].includes(s.difficulty)) || !validSeed(s.seed)
    || !Array.isArray(s.operators) || !s.operators.length || s.operators.length > 4 || !s.operators.every(op => OPERATORS.includes(op)) || new Set(s.operators).size !== s.operators.length
    || (s.generatorVersion !== undefined && s.generatorVersion !== GENERATOR_VERSION && s.generatorVersion !== CURRENT_GENERATOR_VERSION)) return false
  return s.generatorVersion !== GENERATOR_VERSION || (s.size === 5 && s.difficulty === 'normal')
}
export function limitsFor(settings: GenerationSettings): GenerationLimits {
  if (versionFor(settings) === GENERATOR_VERSION) return { ...DEFAULT_LIMITS }
  const n = settings.size, cells = n * n
  return { maxWork: [0, 0, 0, 600_000, 2_000_000, 4_000_000, 6_000_000, 10_000_000, 16_000_000, 24_000_000][n], maxSolveWork: solverBudget(n), maxAttempts: settings.difficulty === 'hard' ? 100 : 40, maxRefinements: cells, maxFixedCells: Math.max(1, Math.floor(cells * (settings.difficulty === 'easy' ? .45 : settings.difficulty === 'hard' ? .12 : .20))) }
}
export function puzzleIdentity(p: Pick<PuzzleDefinition, 'generatorVersion' | 'size' | 'difficulty' | 'operators' | 'seed' | 'cages'>): string {
  return JSON.stringify([p.generatorVersion, p.size, p.difficulty, p.operators, p.seed, p.cages.map(c => [c.cells, c.op, c.target])])
}
export function generateV2Puzzle(settings: GenerationSettings, overrides: Partial<GenerationLimits> = {}, onProgress?: (progress: GenerationProgress) => void): GenerationResult {
  const metrics: GenerationMetrics = { attempts: 0, solverCalls: 0, refinements: 0, work: 0 }
  const fail = (reason: Extract<GenerationResult, { status: 'failure' }>['reason']): GenerationResult => ({ status: 'failure', reason, metrics })
  if (!validSettings(settings)) return fail('invalid-settings')
  if (versionFor(settings) === GENERATOR_VERSION) {
    onProgress?.({ attempt: 1, work: 0, stage: 'uniqueness' })
    return generateLegacyPuzzle(settings, overrides)
  }
  const limits = { ...limitsFor(settings), ...overrides }, n = settings.size
  if (Object.values(limits).some(v => !Number.isSafeInteger(v) || v < 0) || limits.maxFixedCells >= n * n) return fail('invalid-settings')
  const operators: Operator[] = OPERATORS.filter(op => settings.operators.includes(op)), random = createRandom(settings.seed), budget = new WorkBudget(limits.maxWork)
  let exceeded = false, graded = false
  try {
    for (let attempt = 0; attempt < limits.maxAttempts; attempt++) {
      budget.spend(); metrics.attempts++
      onProgress?.({ attempt: metrics.attempts, work: budget.used, stage: 'cages' })
      const solution = generateLatinSquare(random, n)
      let cages = createCages(solution, random, operators, n, settings.difficulty === 'easy' ? 2 : Math.min(4, n))
      for (let adjustment = 0; adjustment <= limits.maxRefinements; adjustment++) {
        budget.spend()
        const candidate = { size: n, cages }
        if (validatePuzzle(candidate).length || !isComplete(candidate, solution)) return fail('internal-error')
        const fixed = cages.filter(c => c.op === '=').length
        if (fixed > limits.maxFixedCells) break
        onProgress?.({ attempt: metrics.attempts, work: budget.used, stage: 'uniqueness' })
        metrics.solverCalls++
        const verified = solvePuzzle(candidate, { maxWork: limits.maxSolveWork, parentBudget: budget })
        if (verified.status === 'budgetExceeded') { exceeded = true; break }
        if (verified.status === 'unique') {
          if (verified.solution.some((v, i) => v !== solution[i])) return fail('internal-error')
          onProgress?.({ attempt: metrics.attempts, work: budget.used, stage: 'difficulty' })
          const assessment = assessDifficulty(candidate, verified, budget)
          if (!assessment) { exceeded = true; break }
          graded = true
          if (assessment.difficulty !== settings.difficulty || (settings.difficulty !== 'hard' && fixed < 1)) break
          const definition = { ...candidate, seed: settings.seed, difficulty: settings.difficulty, operators, generatorVersion: CURRENT_GENERATOR_VERSION }
          metrics.work = budget.used; metrics.assessment = assessment
          return { status: 'success', puzzle: { ...definition, id: puzzleIdentity(definition), verification: 'unique' }, metrics }
        }
        if (verified.status !== 'multiple') return fail('internal-error')
        if (adjustment === limits.maxRefinements) break
        const cell = solution.findIndex((_, id) => verified.witnesses[0][id] !== verified.witnesses[1][id])
        cages = refineCage(cages, cell, solution, n); metrics.refinements++
      }
    }
    return fail(exceeded ? 'budget-exceeded' : graded ? 'difficulty-unmet' : operators.length < 4 ? 'operator-constraints' : 'attempt-limit')
  } catch (error) {
    if (error instanceof BudgetExceeded) return fail('budget-exceeded')
    throw error
  } finally { metrics.work = budget.used }
}
