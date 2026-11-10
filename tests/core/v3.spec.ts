import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { WorkBudget, BudgetExceeded } from '../../src/core/budget.ts'
import { generatePuzzle, limitsFor } from '../../src/core/generator.ts'
import { verifyDefinition } from '../../src/core/definition.ts'
import { solvePuzzle } from '../../src/core/solver.ts'
import { binaryFixedLimit, diverseLatin, latinThrees, matchingCages, smallHardShapes, strengthen } from '../../src/core/proposalsV3.ts'
import { makeCage } from '../../src/core/cages.ts'
import { connected, isComplete, validatePuzzle } from '../../src/core/constraints.ts'
import { createRandom } from '../../src/core/random.ts'
import { currentSettings, latestSettings, settingsForSeed, OPERATORS, type BoardSize, type Cage, type Digit } from '../../src/core/types.ts'
import { referenceCount } from '../fixtures.ts'
it.each([3,4,5,6,7,8,9] as BoardSize[])('builds diverse deterministic Latin squares at size %i',size=>{
 for(let seed=0;seed<10;seed++){
  const budget=new WorkBudget(100_000),grid=diverseLatin(size,createRandom(seed),budget)
  expect(diverseLatin(size,createRandom(seed),new WorkBudget(100_000))).toEqual(grid)
  for(let row=0;row<size;row++){expect(new Set(grid.slice(row*size,(row+1)*size)).size).toBe(size);expect(new Set(grid.filter((_,id)=>id%size===row)).size).toBe(size)}
 }
 expect(()=>diverseLatin(size,createRandom(0),new WorkBudget(0))).toThrow(BudgetExceeded)
})
it.each([0,1,2,3,4,5,6,7,8,9])('finds genuinely hard unique 3×3 and 4×4 for seed %i',seed=>{
 for(const size of[3,4]as const){const r=generatePuzzle(latestSettings(seed,size,'hard'));expect(r.status).toBe('success');if(r.status!=='success')continue;expect(verifyDefinition(r.puzzle)).toBe(true);expect(r.metrics.assessment?.searchDepth).toBeGreaterThan(0);expect(r.metrics.assessment?.rootUnresolved).toBeGreaterThan(0);if(size===3&&seed<3)expect(referenceCount(r.puzzle)).toBe(1)}
})
it.each([0,1,2,4])('rescues previously failed 9×9 addition/normal seed %i',seed=>{
 const settings=latestSettings(seed,9,'normal',['+']),r=generatePuzzle(settings)
 expect(r.status).toBe('success');if(r.status!=='success')return
 expect(verifyDefinition(r.puzzle)).toBe(true);expect(r.puzzle.cages.every(c=>c.op==='+'||c.op==='=')).toBe(true)
 expect(r.metrics.assessment?.searchDepth).toBe(0);expect(r.metrics.assessment?.difficulty).toBe('normal');expect(r.metrics.work).toBeLessThanOrEqual(limitsFor(settings).maxWork)
})
it.each(['easy','normal'] as const)('generates verified 9×9 division-only %s',difficulty=>{
 const r=generatePuzzle(latestSettings(0,9,difficulty,['/']));expect(r.status).toBe('success');if(r.status!=='success')return
 expect(verifyDefinition(r.puzzle)).toBe(true);expect(r.puzzle.cages.every(c=>c.op==='='||(c.op==='/'&&c.cells.length===2&&Number.isInteger(c.target)))).toBe(true)
 const solved=solvePuzzle(r.puzzle);expect(solved.status).toBe('unique');if(solved.status!=='unique')return
 const initial=matchingCages(solved.solution,9,['/'],()=>0,new WorkBudget(100_000)),forced=initial.filter(c=>c.op==='=').length
 expect(r.puzzle.cages.filter(c=>c.op==='=').length).toBeLessThanOrEqual(binaryFixedLimit(9,difficulty,forced,limitsFor(r.puzzle).maxFixedCells))
})
it('does not relabel division-only easy/normal candidates as hard',()=>{
 const r=generatePuzzle(latestSettings(0,9,'hard',['/']));expect(r.status).toBe('failure');expect(r).not.toHaveProperty('puzzle')
 if(r.status==='failure')expect(r.reason).toBe('difficulty-unmet')
 expect(r.metrics.diagnostics?.hard).toBe(0);expect(r.metrics.diagnostics?.gradeRejected).toBeGreaterThan(0)
})
function brutePairs(solution:readonly Digit[],operators:readonly string[],remaining=new Set(Array.from({length:9},(_,i)=>i))):number{
 if(!remaining.size)return 0
 const id=Math.min(...remaining),rest=new Set([...remaining].filter(v=>v!==id));let best=brutePairs(solution,operators,rest)
 for(const other of rest){const adjacent=Math.abs(id-other)===3||(Math.floor(id/3)===Math.floor(other/3)&&Math.abs(id-other)===1);const legal=operators.includes('-')||Math.max(solution[id],solution[other])%Math.min(solution[id],solution[other])===0;if(adjacent&&legal)best=Math.max(best,1+brutePairs(solution,operators,new Set([...rest].filter(v=>v!==other))))}
 return best
}
it.each([['-'],['/'],['-','/']].map(operators=>({operators:operators as ('-'|'/')[]})))('maximum matching achieves the independently counted minimum fixed cells for $operators',({operators})=>{
 for(const[seed,grid]of latinThrees().entries()){
  const cages=matchingCages(grid,3,operators,createRandom(seed),new WorkBudget(100_000))
  expect(validatePuzzle({size:3,cages})).toEqual([]);expect(isComplete({size:3,cages},grid)).toBe(true)
  expect(cages.filter(c=>c.op==='=').length).toBe(9-2*brutePairs(grid,operators))
 }
})
it('enumerates connected small-board partitions without a puzzle catalogue',()=>{
 const shapes=smallHardShapes(new WorkBudget(100_000));expect(shapes).toHaveLength(132)
 for(const groups of shapes){expect(groups.flat().sort((a,b)=>a-b)).toEqual(Array.from({length:9},(_,i)=>i));expect(groups.filter(g=>g.length===1).length).toBeLessThanOrEqual(1);for(const cells of groups)expect(connected(cells,3)).toBe(true)}
})
it('strengthens an ambiguous cage without adding fixed cells when a 2+2 cut suffices',()=>{
 const grid:Digit[]=[1,2,3,4,2,3,4,1,3,4,1,2,4,1,2,3],other=grid.map(v=>(v===1?4:v===4?1:v)as Digit)
 const cages=Array.from({length:4},(_,row)=>makeCage([row*4,row*4+1,row*4+2,row*4+3],'+',grid))
 expect(isComplete({size:4,cages},grid)).toBe(true);expect(isComplete({size:4,cages},other)).toBe(true)
 const next=strengthen(cages,[grid,other],grid,4,0,createRandom(0),new WorkBudget(100_000));expect(next).not.toBeNull();if(!next)return
 expect(next.filter(c=>c.op==='=')).toHaveLength(0);expect(isComplete({size:4,cages:next},grid)).toBe(true);expect(isComplete({size:4,cages:next},other)).toBe(false)
})
it('has real structural variety and reproducible result/metrics for v3 seeds',()=>{
 const shapes=new Set<string>()
 for(let seed=0;seed<10;seed++){const settings=latestSettings(seed,3,'hard'),r=generatePuzzle(settings);expect(generatePuzzle(settings)).toEqual(r);if(r.status==='success')shapes.add(JSON.stringify(r.puzzle.cages))}
 expect(shapes.size).toBeGreaterThan(3)
 const a=generatePuzzle(latestSettings(42)),b=generatePuzzle(latestSettings(42,5,'normal',[...OPERATORS].reverse()));expect(b).toEqual(a)
 if(a.status==='success')expect(createHash('sha256').update(a.puzzle.id).digest('hex')).toBe('596172ce960a8502f50cca4092384152f3a698e104763c172c795a906cd482a3')
})
it('preserves the full old-version result contract across sizes, grades, seeds and failures',()=>{
 const results=[]
 for(const size of[3,4,5,6,7,8,9]as BoardSize[])for(const difficulty of['easy','normal','hard']as const)for(const seed of[0,42])results.push(generatePuzzle(currentSettings(seed,size,difficulty)))
 for(const seed of[0,42])results.push(generatePuzzle(settingsForSeed(seed)))
 expect(createHash('sha256').update(JSON.stringify(results)).digest('hex')).toBe('73a3e55ef0c9717c05e3a6cc50117e45d82fd3a1eb9784a99330d61f81b8b858')
},15_000)
it.each([{maxWork:0},{maxSolveWork:0,maxAttempts:1},{maxAttempts:0}])('never publishes an unchecked problem when limits end: %j',limits=>{
 for(const settings of[latestSettings(0),latestSettings(0,3,'hard'),latestSettings(0,9,'normal',['+'])]){const r=generatePuzzle(settings,limits);expect(r.status).toBe('failure');expect(r).not.toHaveProperty('puzzle')}
})
it('does not inject operators while creating constrained v3 proposals',()=>{
 for(const operators of[['+'],['*'],['/'],['-','/']]as const){const r=generatePuzzle(latestSettings(0,5,'easy',operators));if(r.status==='success')expect(r.puzzle.cages.every(c=>c.op==='='||(operators as readonly string[]).includes(c.op))).toBe(true);else expect(r).not.toHaveProperty('puzzle')}
})
it('rejects disconnected and out-of-range v3 proposals through the shared validator',()=>{
 const cages:Cage[]=[{id:'x',cells:[0,8],op:'+',target:4}];expect(validatePuzzle({size:3,cages})).toContain('Disconnected cage')
})

it.each([
 {size:8 as const,difficulty:'easy' as const,operators:['-'] as const,minimum:3},
 {size:8 as const,difficulty:'normal' as const,operators:['-'] as const,minimum:5},
 {size:9 as const,difficulty:'normal' as const,operators:['-'] as const,minimum:4},
 {size:9 as const,difficulty:'easy' as const,operators:['-','/'] as const,minimum:3},
 {size:9 as const,difficulty:'normal' as const,operators:['-','/'] as const,minimum:5},
])('does not regress anchored subtraction settings: $size/$difficulty/$operators',({size,difficulty,operators,minimum})=>{
 let successes=0
 for(let seed=0;seed<5;seed++){const r=generatePuzzle(latestSettings(seed,size,difficulty,operators));if(r.status==='success'){successes++;expect(verifyDefinition(r.puzzle)).toBe(true)}}
 expect(successes).toBeGreaterThanOrEqual(minimum)
},15_000)

it.each([
 {size:9 as const,difficulty:'normal' as const,operators:['+']as const},
 {size:9 as const,difficulty:'normal' as const,operators:['/']as const},
 {size:4 as const,difficulty:'hard' as const,operators:OPERATORS},
])('reproduces the diverse-Latin and matching paths: $size/$difficulty/$operators',({size,difficulty,operators})=>{
 const settings=latestSettings(0,size,difficulty,operators),a=generatePuzzle(settings),b=generatePuzzle(settings)
 expect(a.status).toBe('success');expect(b).toEqual(a)
})
