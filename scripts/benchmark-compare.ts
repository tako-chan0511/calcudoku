import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { generatePuzzle } from '../src/core/generator.ts'
import { verifyDefinition } from '../src/core/definition.ts'
import { OPERATORS, currentSettings, latestSettings, type BoardSize, type Difficulty, type GenerationDiagnostics, type Operator } from '../src/core/types.ts'
const count=Number(process.argv[2]??50), restricted=Number(process.argv[3]??5)
if(!Number.isSafeInteger(count)||count<1||count>500||!Number.isSafeInteger(restricted)||restricted<1||restricted>100)throw Error('Invalid sample counts')
interface Group{size:BoardSize;difficulty:Difficulty;operators:Operator[];trials:number;kind:'full'|'restricted'}
const sizes:BoardSize[]=[3,4,5,6,7,8,9],levels:Difficulty[]=['easy','normal','hard']
const groups:Group[]=sizes.flatMap(size=>levels.map(difficulty=>({size,difficulty,operators:[...OPERATORS],trials:count,kind:'full' as const})))
for(const size of sizes)for(const difficulty of levels)for(const operator of OPERATORS)groups.push({size,difficulty,operators:[operator],trials:restricted,kind:'restricted'})
for(let mask=1;mask<15;mask++){const operators=OPERATORS.filter((_,i)=>mask&(1<<i));if(operators.length<2)continue;for(const difficulty of levels)groups.push({size:9,difficulty,operators,trials:restricted,kind:'restricted'})}
const results=[]
const round=(n:number)=>Math.round(n*1000)/1000
function measure(g:Group,version:2|3){
 const times:number[]=[],successTimes:number[]=[],failureReasons:Record<string,number>={},failures:{seed:number;reason:string;ms:number}[]=[]
 const diagnostics:Record<string,number>={};let verified=0,maxWork=0,minFixed=Infinity,maxFixed=0
 for(let seed=0;seed<g.trials;seed++){
  const settings=(version===2?currentSettings:latestSettings)(seed,g.size,g.difficulty,g.operators)
  const start=performance.now(),r=generatePuzzle(settings),ms=performance.now()-start;times.push(ms);maxWork=Math.max(maxWork,r.metrics.work)
  if(r.status==='success'){if(!verifyDefinition(r.puzzle))throw Error(`Unverified ${version}/${g.size}/${g.difficulty}/${g.operators}/${seed}`);verified++;successTimes.push(ms);const fixed=r.puzzle.cages.filter(c=>c.op==='=').length;minFixed=Math.min(minFixed,fixed);maxFixed=Math.max(maxFixed,fixed)}
  else{failureReasons[r.reason]=(failureReasons[r.reason]??0)+1;failures.push({seed,reason:r.reason,ms:round(ms)})}
  for(const[k,v]of Object.entries(r.metrics.diagnostics??{} as GenerationDiagnostics))if(typeof v==='number'){const label=k==='matchingMinSingles'?'matchingMinSinglesTotal':k;diagnostics[label]=(diagnostics[label]??0)+v}
 }
 const p=(values:number[],q:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]):null}
 const row={...g,version:`calcudoku-v${version}`,successes:verified,failureReasons,failures,medianMs:p(times,.5),p95Ms:p(times,.95),maxMs:p(times,1),successMedianMs:p(successTimes,.5),minFixed:verified?minFixed:null,maxFixed:verified?maxFixed:null,maxWork,diagnostics}
 if(g.kind==='full'||g.size===9&&g.operators.length===1)console.log(JSON.stringify({...row,failures:undefined,diagnostics:undefined}))
 return row
}
// Alternate version order across groups. Warm the shared engine before timing;
// all successful outputs are independently re-solved and graded afterwards.
for(const version of[2,3]as const)for(let seed=0;seed<5;seed++)generatePuzzle((version===2?currentSettings:latestSettings)(seed))
for(const[i,g]of groups.entries())for(const version of(i%2?[3,2]:[2,3])as(2|3)[])results.push(measure(g,version))
const report={node:process.version,fullSeedRange:`0..${count-1}`,restrictedSeedRange:`0..${restricted-1}`,timing:'Single process; generation includes uniqueness/grade; follow-up re-verification and Worker startup excluded; failed trials included.',results}
if(process.argv[4])writeFileSync(process.argv[4],JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({totalTrials:results.reduce((n,r)=>n+r.trials,0),verifiedSuccesses:results.reduce((n,r)=>n+r.successes,0)}))
