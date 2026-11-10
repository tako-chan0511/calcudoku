import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generatePuzzle } from '../src/core/generator.ts'
import { currentSettings, type BoardSize, type Difficulty, type Operator } from '../src/core/types.ts'
import type { generateV2Puzzle } from '../src/core/generatorV2.ts'
interface Counters{fixedRejected:number;multiple:number;unique:number;gradeRejected:number;solverBudget:number;easy:number;normal:number;hard:number}
const core=resolve(dirname(fileURLToPath(import.meta.url)),'../src/core'),temp=mkdtempSync(join(tmpdir(),'calcudoku-v2-diagnostics-'))
try{
 let code=readFileSync(join(core,'generatorV2.ts'),'utf8')
 const edits:[string,string][]=[
  ['  const metrics: GenerationMetrics',"  for(const k of Object.keys(diagnostics) as (keyof typeof diagnostics)[])diagnostics[k]=0\n  const metrics: GenerationMetrics"],
  ['if (fixed > limits.maxFixedCells) break','if (fixed > limits.maxFixedCells) { diagnostics.fixedRejected++; break }'],
  ["if (verified.status === 'budgetExceeded') {","if (verified.status === 'multiple')diagnostics.multiple++\n        if (verified.status === 'budgetExceeded') { diagnostics.solverBudget++;"],
  ["if (verified.status === 'unique') {","if (verified.status === 'unique') { diagnostics.unique++;"],
  ['          graded = true','          diagnostics[assessment.difficulty]++\n          graded = true'],
  ["if (assessment.difficulty !== settings.difficulty || (settings.difficulty !== 'hard' && fixed < 1)) break","if (assessment.difficulty !== settings.difficulty || (settings.difficulty !== 'hard' && fixed < 1)) { diagnostics.gradeRejected++; break }"],
 ]
 for(const[from,to]of edits){if(!code.includes(from))throw Error('Frozen v2 source contract changed');code=code.replace(from,to)}
 code="export const diagnostics={fixedRejected:0,multiple:0,unique:0,gradeRejected:0,solverBudget:0,easy:0,normal:0,hard:0}\n"+code
 code=code.replace(/from '\.\/(.*?)'/g,(_,name:string)=>`from '${pathToFileURL(join(core,name)).href}'`)
 const file=join(temp,'instrumented.ts');writeFileSync(file,code)
 const module=await import(pathToFileURL(file).href) as {generateV2Puzzle:typeof generateV2Puzzle;diagnostics:Counters}
 const groups:{size:BoardSize;difficulty:Difficulty;operators:Operator[];trials:number}[]=[{size:3,difficulty:'hard',operators:['+','-','*','/'],trials:50},{size:4,difficulty:'hard',operators:['+','-','*','/'],trials:50},{size:9,difficulty:'normal',operators:['+'],trials:5},...(['easy','normal','hard']as const).map(difficulty=>({size:9 as const,difficulty,operators:['/']as Operator[],trials:5}))]
 const results=groups.map(g=>{const totals:Counters={fixedRejected:0,multiple:0,unique:0,gradeRejected:0,solverBudget:0,easy:0,normal:0,hard:0};let successes=0;for(let seed=0;seed<g.trials;seed++){const settings=currentSettings(seed,g.size,g.difficulty,g.operators),r=module.generateV2Puzzle(settings);if(JSON.stringify(r)!==JSON.stringify(generatePuzzle(settings)))throw Error('Instrumentation altered output');successes+=Number(r.status==='success');for(const k of Object.keys(totals)as(keyof Counters)[])totals[k]+=module.diagnostics[k]}return{...g,successes,counters:totals}})
 const report={note:'Counters from an instrumented temporary copy of frozen v2. Every result compared byte-for-byte with normal v2 output; shipped v2 unchanged.',results}
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{rmSync(temp,{recursive:true,force:true})}
