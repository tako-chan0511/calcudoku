export const SIZE = 5 as const
export const GENERATOR_VERSION = 'calcudoku-v1' as const
export const CURRENT_GENERATOR_VERSION = 'calcudoku-v2' as const
export const LATEST_GENERATOR_VERSION = 'calcudoku-v3' as const
export type GeneratorVersion = typeof GENERATOR_VERSION | typeof CURRENT_GENERATOR_VERSION | typeof LATEST_GENERATOR_VERSION
export type BoardSize = 3 | 4 | 5 | 6 | 7 | 8 | 9
export type Difficulty = 'easy' | 'normal' | 'hard'
export const OPERATORS = ['+', '-', '*', '/'] as const
export type Operator = typeof OPERATORS[number]
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type CellValue = Digit | null
export type CellId = number
export type Cage =
  | { readonly id: string; readonly cells: readonly [CellId]; readonly op: '='; readonly target: Digit }
  | { readonly id: string; readonly cells: readonly [CellId, CellId]; readonly op: '-' | '/'; readonly target: number }
  | { readonly id: string; readonly cells: readonly [CellId, CellId, ...CellId[]]; readonly op: '+' | '*'; readonly target: number }
export interface ConstraintPuzzle { readonly size: BoardSize; readonly cages: readonly Cage[] }
export interface GenerationSettings {
  readonly generatorVersion?: GeneratorVersion
  readonly size: BoardSize
  readonly difficulty: Difficulty
  readonly operators: readonly Operator[]
  readonly seed: number
}
export interface PuzzleDefinition extends ConstraintPuzzle, GenerationSettings {
  readonly id: string
  readonly generatorVersion: GeneratorVersion
  readonly verification: 'unique'
}
export interface SolverStats { nodes: number; work: number; solutionsFound: number; firstSolutionWork: number | null; maxDepth?: number; rootUnresolved?: number; propagationRounds?: number }
export type SolveResult =
  | { status: 'unique'; solution: Digit[]; stats: SolverStats }
  | { status: 'multiple'; witnesses: [Digit[], Digit[]]; stats: SolverStats }
  | { status: 'unsatisfiable' | 'stalled'; stats: SolverStats }
  | { status: 'budgetExceeded'; stats: SolverStats }
  | { status: 'invalid'; errors: string[]; stats: SolverStats }
export interface GenerationMetrics { attempts: number; solverCalls: number; refinements: number; work: number; assessment?: DifficultyAssessment; diagnostics?: GenerationDiagnostics }
export interface GenerationDiagnostics { fixedRejected: number; multiple: number; solverBudget: number; gradeRejected: number; easy: number; normal: number; hard: number; matchingMinSingles: number | null }
export interface DifficultyAssessment { difficulty: Difficulty; fixedCells: number; maxCageSize: number; basicSolved: boolean; propagationRounds: number; searchDepth: number; rootUnresolved: number }
export interface GenerationProgress { attempt: number; work: number; stage: 'cages' | 'uniqueness' | 'difficulty' }
export type GenerationFailure = 'invalid-settings' | 'budget-exceeded' | 'attempt-limit' | 'internal-error' | 'difficulty-unmet' | 'operator-constraints'
export type GenerationResult =
  | { status: 'success'; puzzle: PuzzleDefinition; metrics: GenerationMetrics }
  | { status: 'failure'; reason: GenerationFailure; metrics: GenerationMetrics }
export const settingsForSeed = (seed: number, operators: readonly Operator[] = OPERATORS): GenerationSettings => ({ size: SIZE, difficulty: 'normal', operators, seed })

export const currentSettings = (seed: number, size: BoardSize = 5, difficulty: Difficulty = 'normal', operators: readonly Operator[] = OPERATORS): GenerationSettings => ({ size, difficulty, operators, seed, generatorVersion: CURRENT_GENERATOR_VERSION })
export const validSize = (n: unknown): n is BoardSize => typeof n === 'number' && Number.isInteger(n) && n >= 3 && n <= 9

export const latestSettings = (seed: number, size: BoardSize = 5, difficulty: Difficulty = 'normal', operators: readonly Operator[] = OPERATORS): GenerationSettings => ({ size, difficulty, operators, seed, generatorVersion: LATEST_GENERATOR_VERSION })
