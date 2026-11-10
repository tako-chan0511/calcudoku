import { BudgetExceeded, WorkBudget } from './budget.ts'
import { createCages, makeCage } from './cages.ts'
import { isComplete, validatePuzzle } from './constraints.ts'
import { assessDifficulty } from './difficulty.ts'
import { binaryFixedLimit, diverseLatin, latinThrees, matchingCages, smallHardShapes, strengthen } from './proposalsV3.ts'
import { createRandom, shuffle } from './random.ts'
import { solvePuzzle, solverBudget } from './solver.ts'
import { generateV2Puzzle, limitsFor as limitsForV2, puzzleIdentity, type GenerationLimits } from './generatorV2.ts'
import { CURRENT_GENERATOR_VERSION, LATEST_GENERATOR_VERSION, OPERATORS, type Cage, type Digit, type GenerationDiagnostics, type GenerationMetrics, type GenerationProgress, type GenerationResult, type GenerationSettings } from './types.ts'
export function limitsForV3(settings: GenerationSettings): GenerationLimits {
  const n = settings.size, binary = settings.operators.every(op => op === '-' || op === '/')
  return { maxWork: [0,0,0,2_000_000,8_000_000,4_000_000,6_000_000,10_000_000,16_000_000,24_000_000][n], maxSolveWork: solverBudget(n), maxAttempts: n === 3 && settings.difficulty === 'hard' ? 1600 : binary || settings.difficulty === 'hard' ? 400 : 100, maxRefinements: n * n, maxFixedCells: Math.min(n * n - 1, Math.max(1, Math.floor(n * n * (binary ? .60 : settings.difficulty === 'easy' ? .45 : settings.difficulty === 'hard' ? .12 : .20)))) }
}
export function generateV3Puzzle(settings: GenerationSettings, overrides: Partial<GenerationLimits> = {}, onProgress?: (p: GenerationProgress) => void): GenerationResult {
  const diagnostics: GenerationDiagnostics = { fixedRejected: 0, multiple: 0, solverBudget: 0, gradeRejected: 0, easy: 0, normal: 0, hard: 0, matchingMinSingles: null }
  const metrics: GenerationMetrics = { attempts: 0, solverCalls: 0, refinements: 0, work: 0, diagnostics }
  const limits = { ...limitsForV3(settings), ...overrides }, n = settings.size
  const fail = (reason: Extract<GenerationResult,{status:'failure'}>['reason']): GenerationResult => ({ status:'failure', reason, metrics })
  if (Object.values(limits).some(v=>!Number.isSafeInteger(v)||v<0)||limits.maxFixedCells>=n*n) return fail('invalid-settings')
  const budget = new WorkBudget(limits.maxWork), random = createRandom(settings.seed), operators = OPERATORS.filter(op=>settings.operators.includes(op)), binary = operators.every(op=>op==='-'||op==='/')
  let sawUnique = false
  function prove(cages: Cage[], solution: readonly Digit[], fixedLimit = limits.maxFixedCells): { result: GenerationResult | null; witnesses?: [Digit[],Digit[]] } {
    budget.spend(); const candidate = { size:n,cages }
    if (validatePuzzle(candidate).length || !isComplete(candidate,solution)) throw new Error('Invalid proposal')
    if (cages.filter(c=>c.op==='=').length>fixedLimit) { diagnostics.fixedRejected++; return { result:null } }
    onProgress?.({ attempt:metrics.attempts,work:budget.used,stage:'uniqueness' }); metrics.solverCalls++
    const verified=solvePuzzle(candidate,{maxWork:limits.maxSolveWork,parentBudget:budget})
    if(verified.status==='budgetExceeded'){diagnostics.solverBudget++;return{result:null}}
    if(verified.status==='multiple'){diagnostics.multiple++;return{result:null,witnesses:verified.witnesses}}
    if(verified.status!=='unique')throw new Error('Generated solution lost')
    if(verified.solution.some((v,id)=>v!==solution[id]))throw new Error('Unexpected solution')
    sawUnique=true;onProgress?.({attempt:metrics.attempts,work:budget.used,stage:'difficulty'})
    const assessment=assessDifficulty(candidate,verified,budget)
    if(!assessment){diagnostics.solverBudget++;return{result:null}}
    diagnostics[assessment.difficulty]++
    if(assessment.difficulty!==settings.difficulty||(settings.difficulty!=='hard'&&assessment.fixedCells<1)){diagnostics.gradeRejected++;return{result:null}}
    const definition={...candidate,operators,seed:settings.seed,difficulty:settings.difficulty,generatorVersion:LATEST_GENERATOR_VERSION}
    metrics.assessment=assessment;metrics.work=budget.used
    return{result:{status:'success',puzzle:{...definition,id:puzzleIdentity(definition),verification:'unique'},metrics}}
  }
  try {
    // Preserve an efficient default 5×5 or anchored subtraction proposal. A
    // failed proposal moves on to the new algorithm; no old-version problem is relabeled
    // unless its uniqueness and the identical logical grade were already proved.
    if(((n===5&&settings.difficulty==='normal'&&operators.length===4)||(binary&&operators.includes('-')))&&limits.maxAttempts>0){
      const first=generateV2Puzzle({...settings,generatorVersion:CURRENT_GENERATOR_VERSION},{...limits,maxFixedCells:Math.min(limits.maxFixedCells,limitsForV2({...settings,generatorVersion:CURRENT_GENERATOR_VERSION}).maxFixedCells),maxAttempts:1},onProgress)
      budget.spend(first.metrics.work);metrics.attempts+=first.metrics.attempts;metrics.solverCalls+=first.metrics.solverCalls;metrics.refinements+=first.metrics.refinements
      if(first.status==='failure'&&first.reason==='budget-exceeded')diagnostics.solverBudget++
      if(first.status==='failure'&&first.reason==='difficulty-unmet'){sawUnique=true;diagnostics.gradeRejected++}
      if(first.status==='success'){
        const definition={...first.puzzle,generatorVersion:LATEST_GENERATOR_VERSION};metrics.assessment=first.metrics.assessment;metrics.work=budget.used;diagnostics[first.puzzle.difficulty]++
        return{status:'success',puzzle:{...definition,id:puzzleIdentity(definition)},metrics}
      }
    }
    if(n===3&&settings.difficulty==='hard'){
      const patterns=smallHardShapes(budget)
      for(const solution of shuffle(latinThrees(),random)){
        const proposals: {cages:Cage[];score:number}[]=[]
        for(const groups of shuffle(patterns,random)){
          budget.spend();const cages:Cage[]=[];let valid=true
          for(const cells of groups){
            const values=cells.map(id=>solution[id])
            const op=cells.length===1?'=':cells.length===3?operators.includes('+')?'+':operators.includes('*')?'*':null:operators.includes('-')?'-':operators.includes('+')?'+':operators.includes('*')?'*':operators.includes('/')&&Math.max(...values)%Math.min(...values)===0?'/':null
            if(!op){valid=false;break}cages.push(makeCage(cells,op,solution))
          }
          if(valid)proposals.push({cages,score:cages.filter(c=>c.op==='=').length*100+cages.filter(c=>c.op==='-'&&c.target!==1).length*10})
        }
        for(const {cages}of proposals.sort((a,b)=>a.score-b.score)){
          if(metrics.attempts>=limits.maxAttempts)break
          metrics.attempts++;const result=prove(cages,solution).result;if(result)return result
        }
        if(metrics.attempts>=limits.maxAttempts)break
      }
      if(operators.includes('+')&&operators.includes('-'))return fail(sawUnique?'difficulty-unmet':diagnostics.solverBudget?'budget-exceeded':'attempt-limit')
    }
    while(metrics.attempts<limits.maxAttempts){
      budget.spend();metrics.attempts++;onProgress?.({attempt:metrics.attempts,work:budget.used,stage:'cages'})
      const solution=diverseLatin(n,random,budget)
      const divisionOnly=operators.length===1&&operators[0]==='/'
      let cages=divisionOnly?matchingCages(solution,n,operators,random,budget):createCages(solution,random,operators,n,settings.difficulty==='easy'?2:settings.difficulty==='normal'&&n>=6?3:Math.min(4,n))
      let fixedLimit=limits.maxFixedCells
      if(binary){const matched=divisionOnly?cages:matchingCages(solution,n,operators,()=>0,budget);const singles=matched.filter(c=>c.op==='=').length;diagnostics.matchingMinSingles=Math.min(diagnostics.matchingMinSingles??singles,singles);fixedLimit=binaryFixedLimit(n,settings.difficulty,singles,limits.maxFixedCells)}
      for(let adjustment=0;adjustment<=limits.maxRefinements;adjustment++){
        const {result,witnesses}=prove(cages,solution,fixedLimit);if(result)return result
        if(!witnesses||adjustment===limits.maxRefinements)break
        const next=strengthen(cages,witnesses,solution,n,fixedLimit,random,budget)
        if(!next){diagnostics.fixedRejected++;break}cages=next;metrics.refinements++
      }
    }
    return fail(sawUnique?'difficulty-unmet':diagnostics.solverBudget?'budget-exceeded':operators.length<4&&diagnostics.fixedRejected?'operator-constraints':'attempt-limit')
  }catch(error){if(error instanceof BudgetExceeded)return fail('budget-exceeded');throw error}
  finally{metrics.work=budget.used}
}
