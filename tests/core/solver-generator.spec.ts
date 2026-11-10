import { describe, expect, it } from 'vitest'
import { generatePuzzle, DEFAULT_LIMITS } from '../../src/core/generator.ts'
import { isComplete, isVerifiedPuzzle } from '../../src/core/constraints.ts'
import { solvePuzzle } from '../../src/core/solver.ts'
import { settingsForSeed, type GenerationSettings, type Operator } from '../../src/core/types.ts'
import { fixedPuzzle, multiplePuzzle, impossiblePuzzle, referenceCount, solution } from '../fixtures.ts'
describe('bounded solution counting', () => {
  it('distinguishes unique, unsatisfiable and multiple, stopping at two solutions', () => {
    const unique = solvePuzzle(fixedPuzzle)
    expect(unique.status).toBe('unique')
    if (unique.status === 'unique') expect(unique.solution).toEqual(solution)
    expect(solvePuzzle(impossiblePuzzle()).status).toBe('unsatisfiable')
    const multiple = solvePuzzle(multiplePuzzle)
    expect(multiple.status).toBe('multiple')
    expect(multiple.stats.solutionsFound).toBe(2)
    if (multiple.status === 'multiple') for (const witness of multiple.witnesses) expect(isComplete(multiplePuzzle, witness)).toBe(true)
  })
  it('never claims uniqueness if the budget ends after only the first solution', () => {
    const complete = solvePuzzle(multiplePuzzle)
    expect(complete.status).toBe('multiple')
    const limited = solvePuzzle(multiplePuzzle, { maxWork: complete.stats.firstSolutionWork! })
    expect(limited.status).toBe('budgetExceeded')
    expect(limited.stats.solutionsFound).toBe(1)
    expect(solvePuzzle(fixedPuzzle, { maxWork: 0 }).status).toBe('budgetExceeded')
    expect(solvePuzzle(fixedPuzzle, { maxWork: -1 }).status).toBe('invalid')
  })
  it('does not mutate the problem, and rejects malformed inputs', () => {
    const snapshot = JSON.stringify(fixedPuzzle)
    solvePuzzle(fixedPuzzle); expect(JSON.stringify(fixedPuzzle)).toBe(snapshot)
    expect(solvePuzzle({ size: 5, cages: [] }).status).toBe('invalid')
    expect(solvePuzzle(fixedPuzzle, { values: [null] }).status).toBe('invalid')
  })
})
describe('deterministic uniquely verified generation', () => {
  it.each([0, 1, 2, 42, 123, 999, 20261109, 0xffffffff])('generates a reproducible unique puzzle for seed %i', seed => {
    const settings = settingsForSeed(seed), result = generatePuzzle(settings)
    expect(result.status).toBe('success')
    expect(generatePuzzle(settings)).toEqual(result)
    expect(result.metrics.work).toBeLessThanOrEqual(DEFAULT_LIMITS.maxWork)
    if (result.status !== 'success') return
    expect(isVerifiedPuzzle(result.puzzle)).toBe(true)
    expect(solvePuzzle(result.puzzle).status).toBe('unique')
    expect(result.puzzle.cages.filter(c => c.op === '=').length).toBeLessThanOrEqual(5)
    expect(JSON.stringify(result)).not.toContain('solution')
    expect(JSON.stringify(result)).not.toContain('witness')
  })
  it('agrees with an independent row-permutation oracle', () => {
    for (const seed of [0, 42, 123]) {
      const result = generatePuzzle(settingsForSeed(seed))
      expect(result.status).toBe('success')
      if (result.status === 'success') expect(referenceCount(result.puzzle)).toBe(1)
    }
    expect(referenceCount(multiplePuzzle)).toBe(2)
    expect(referenceCount(impossiblePuzzle())).toBe(0)
  })
  it('adjusts ambiguous cages and honors selected operators', () => {
    let adjusted = false
    for (let seed = 0; seed < 20; seed++) {
      const result = generatePuzzle(settingsForSeed(seed, ['+']))
      adjusted ||= result.metrics.refinements > 0
      if (result.status === 'success') expect(result.puzzle.cages.every(c => c.op === '+' || c.op === '=')).toBe(true)
      expect(result.metrics.work).toBeLessThanOrEqual(DEFAULT_LIMITS.maxWork)
    }
    expect(adjusted).toBe(true)
  })
  it('does not leak a candidate when work or generation attempts run out', () => {
    const exhausted = generatePuzzle(settingsForSeed(0), { maxWork: 0 })
    expect(exhausted.status).toBe('failure')
    if (exhausted.status === 'failure') expect(exhausted.reason).toBe('budget-exceeded')
    expect(exhausted).not.toHaveProperty('puzzle')
    const unverified = generatePuzzle(settingsForSeed(0), { maxSolveWork: 0, maxAttempts: 1 })
    expect(unverified.status).toBe('failure'); expect(unverified).not.toHaveProperty('puzzle')
    expect(generatePuzzle(settingsForSeed(0), { maxAttempts: 0 })).not.toHaveProperty('puzzle')
    expect(generatePuzzle({ ...settingsForSeed(0), operators: [] })).not.toHaveProperty('puzzle')
    expect(generatePuzzle({ ...settingsForSeed(0), operators: ['?'] } as unknown as GenerationSettings)).not.toHaveProperty('puzzle')
  })
})

describe('operator policy and generator version contract', () => {
  it.each([['+'], ['-'], ['*'], ['/'], ['-', '/']].map(operators => ({ operators: operators as Operator[] })))('never substitutes an unselected operator for $operators', ({ operators }) => {
    for (const seed of [0, 1, 42]) {
      const result = generatePuzzle(settingsForSeed(seed, operators))
      if (result.status === 'success') {
        expect(result.puzzle.cages.every(c => c.op === '=' || (operators as readonly string[]).includes(c.op))).toBe(true)
        expect(solvePuzzle(result.puzzle).status).toBe('unique')
      } else expect(result).not.toHaveProperty('puzzle')
    }
  })
  it('normalizes operator ordering and pins the v1 seed-to-problem contract', () => {
    const forward = generatePuzzle(settingsForSeed(42)), reverse = generatePuzzle(settingsForSeed(42, ['/', '*', '-', '+']))
    expect(reverse).toEqual(forward)
    expect(forward.status).toBe('success')
    if (forward.status === 'success') expect(forward.puzzle.id).toMatchInlineSnapshot(`"["calcudoku-v1",5,"normal",["+","-","*","/"],42,[[[0,5,10,11],"*",12],[[1,6],"-",1],[[2,3],"-",4],[[4,9,14,19],"+",13],[[7,8],"*",8],[[12,13],"*",20],[[15,20],"+",9],[[16,17,21,22],"+",10],[[18,23,24],"*",12]]]"`)
  })
})
