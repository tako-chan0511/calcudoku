import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { generatePuzzle } from '../src/core/generator.ts'
import { verifyDefinition } from '../src/core/definition.ts'
import { currentSettings, OPERATORS, CURRENT_GENERATOR_VERSION, type BoardSize, type Difficulty } from '../src/core/types.ts'
const count = Number(process.argv[2] ?? 50)
if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error('Count must be 1–1000')
const round = (n: number) => Math.round(n * 1000) / 1000
function measure(size: BoardSize, difficulty: Difficulty, operators = [...OPERATORS], trials = count) {
  const elapsed: number[] = [], passed: number[] = [], failures: { seed: number; reason: string; ms: number }[] = []
  let verified = 0, maxWork = 0
  for (let seed = 0; seed < trials; seed++) {
    const started = performance.now(), result = generatePuzzle(currentSettings(seed,size,difficulty,operators)), ms = performance.now() - started
    elapsed.push(ms); maxWork = Math.max(maxWork,result.metrics.work)
    if(result.status==='success') { if (!verifyDefinition(result.puzzle)) throw new Error(`Unverified output ${size}/${difficulty}/${seed}`); verified++;passed.push(ms) }
    else failures.push({seed,reason:result.reason,ms:round(ms)})
  }
  const percentile=(list:number[],q:number)=>{const sorted=[...list].sort((a,b)=>a-b);return sorted.length?round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]):null}
  const row={size,difficulty,operators,trials,successes:verified,failures,medianMs:percentile(elapsed,.5),p95Ms:percentile(elapsed,.95),maxMs:percentile(elapsed,1),successMedianMs:percentile(passed,.5),maxWork}
  console.log(JSON.stringify({...row,failures:failures.reduce<Record<string,number>>((m,f)=>{m[f.reason]=(m[f.reason]??0)+1;return m},{})}))
  return row
}
const sizes:BoardSize[]=[3,4,5,6,7,8,9],levels:Difficulty[]=['easy','normal','hard']
const results=sizes.flatMap(size=>levels.map(difficulty=>measure(size,difficulty)))
const operatorResults=Array.from({length:15},(_,i)=>OPERATORS.filter((_,bit)=>(i+1)&(1<<bit))).flatMap(operators=>levels.map(difficulty=>measure(9,difficulty,operators,Math.min(count,5))))
const report={node:process.version,generatorVersion:CURRENT_GENERATOR_VERSION,seedRange:`0..${count-1}`,description:'Generation wall time including failures; re-verification after each generation is excluded from timing.',results,operatorResults}
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n')
