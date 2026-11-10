import { createHash } from 'node:crypto'
import { referenceCount } from '../fixtures.ts'
import { expect, it } from 'vitest'
import { generatePuzzle, limitsFor, puzzleIdentity } from '../../src/core/generator.ts'
import { assessDifficulty } from '../../src/core/difficulty.ts'
import { canonicalPuzzle, verifyDefinition } from '../../src/core/definition.ts'
import { solvePuzzle } from '../../src/core/solver.ts'
import { checkConstraints, connected, isComplete, satisfiesCage, validatePuzzle } from '../../src/core/constraints.ts'
import { generateLatinSquare } from '../../src/core/latinSquare.ts'
import { createRandom } from '../../src/core/random.ts'
import { currentSettings, settingsForSeed, OPERATORS, type BoardSize, type Difficulty } from '../../src/core/types.ts'
const sizes: BoardSize[] = [3,4,5,6,7,8,9]
it.each(sizes)('generates valid Latin squares and verified easy/normal puzzles at %i×%i', size => {
  const solution = generateLatinSquare(createRandom(42), size)
  for (let unit = 0; unit < size; unit++) {
    expect(new Set(solution.slice(unit * size, (unit + 1) * size)).size).toBe(size)
    expect(new Set(solution.filter((_, id) => id % size === unit)).size).toBe(size)
  }
  for (const difficulty of ['easy','normal'] as const) {
    const result = generatePuzzle(currentSettings(0,size,difficulty))
    expect(result.status).toBe('success'); if (result.status !== 'success') continue
    const p = result.puzzle, solved = solvePuzzle(p)
    expect(validatePuzzle(p)).toEqual([]); expect(canonicalPuzzle(p)).toBe(true); expect(solved.status).toBe('unique')
    expect(p.cages.flatMap(c => [...c.cells]).sort((a,b)=>a-b)).toEqual(Array.from({length:size*size},(_,i)=>i))
    for (const cage of p.cages) expect(connected(cage.cells,size)).toBe(true)
    if (solved.status === 'unique') {
      expect(isComplete(p,solved.solution)).toBe(true)
      for (const cage of p.cages) expect(satisfiesCage(cage,cage.cells.map(id=>solved.solution[id]),size)).toBe(true)
      expect(assessDifficulty(p,solved)?.difficulty).toBe(difficulty)
      const wrong=[...solved.solution];wrong[1]=wrong[0]
      expect(checkConstraints(p,wrong).valid).toBe(false)
    }
    expect(verifyDefinition(p)).toBe(true)
    expect(result.metrics.work).toBeLessThanOrEqual(limitsFor(currentSettings(0,size,difficulty)).maxWork)
  }
})
it.each(sizes.filter(n=>n>3))('verifies genuine lookahead for hard %i×%i', size => {
  const result = generatePuzzle(currentSettings(0,size,'hard'))
  expect(result.status).toBe('success'); if(result.status!=='success')return
  const solved=solvePuzzle(result.puzzle)
  expect(solved.status).toBe('unique');expect(solved.stats.rootUnresolved).toBeGreaterThan(0)
  expect(solved.stats.maxDepth).toBeGreaterThan(0);expect(result.metrics.assessment?.difficulty).toBe('hard')
})
it('fails honestly when a 3×3 hard puzzle is not found',()=>{
  const result=generatePuzzle(currentSettings(0,3,'hard'))
  expect(result.status).toBe('failure');expect(result).not.toHaveProperty('puzzle')
  if(result.status==='failure')expect(result.reason).toBe('difficulty-unmet')
})
const policies=Array.from({length:15},(_,i)=>OPERATORS.filter((_,bit)=>(i+1)&(1<<bit)))
const cases=sizes.filter(n=>[3,5,9].includes(n)).flatMap(size=>(['easy','normal','hard'] as Difficulty[]).flatMap(difficulty=>policies.map(operators=>({size,difficulty,operators}))))
it.each(cases)('honors operator policy $operators at $size/$difficulty or returns no candidate',({size,difficulty,operators})=>{
  const settings=currentSettings(0,size,difficulty,operators),result=generatePuzzle(settings)
  expect(result.metrics.work).toBeLessThanOrEqual(limitsFor(settings).maxWork)
  if(result.status==='failure'){expect(result).not.toHaveProperty('puzzle');return}
  expect(result.puzzle.difficulty).toBe(difficulty)
  for(const c of result.puzzle.cages){expect(c.op==='='||operators.includes(c.op)).toBe(true);if(c.op==='-'||c.op==='/')expect(c.cells.length).toBe(2)}
  expect(verifyDefinition(result.puzzle)).toBe(true)
},15_000)
it('reproduces both versions and canonicalizes operator order',()=>{
  const settings=currentSettings(42,5,'normal'),a=generatePuzzle(settings),b=generatePuzzle({...settings,operators:[...OPERATORS].reverse()})
  expect(a.status).toBe('success');expect(b).toEqual(a);expect(generatePuzzle(settings)).toEqual(a)
  const old=generatePuzzle(settingsForSeed(42));expect(old.status).toBe('success')
  if(a.status==='success'&&old.status==='success'){expect(a.puzzle.generatorVersion).toBe('calcudoku-v2');expect(createHash('sha256').update(a.puzzle.id).digest('hex')).toBe('ccd1b98ee0c7aec2d0f51ce96306b22b4152e55cfd46d98e4ecb505d7087d59a');expect(old.puzzle.generatorVersion).toBe('calcudoku-v1');expect(a.puzzle.id).not.toBe(old.puzzle.id)}
})
it('rejects exhausted uniqueness budgets without lowering requested difficulty',()=>{
  for(const difficulty of ['easy','normal','hard'] as const){const r=generatePuzzle(currentSettings(0,9,difficulty),{maxSolveWork:0,maxAttempts:1});expect(r.status).toBe('failure');expect(r).not.toHaveProperty('puzzle')}
})
it('rejects a falsified difficulty even when its new ID is structurally canonical',()=>{
  const result=generatePuzzle(currentSettings(0,5,'hard'));if(result.status!=='success')throw Error('Fixture')
  const changed={...result.puzzle,difficulty:'easy' as const};const fake={...changed,id:puzzleIdentity(changed)}
  expect(canonicalPuzzle(fake)).toBe(true);expect(verifyDefinition(fake)).toBe(false)
})

it('also finds a genuine 3×3 hard puzzle and agrees with an independent oracle',()=>{
 const r=generatePuzzle(currentSettings(17,3,'hard'));expect(r.status).toBe('success');if(r.status!=='success')return
 expect(referenceCount(r.puzzle)).toBe(1);expect(r.metrics.assessment?.searchDepth).toBeGreaterThan(0)
})
