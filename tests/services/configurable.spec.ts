import { expect,it } from 'vitest'
import { createGameStorage, SESSION_KEY, type StoragePort } from '../../src/services/gameStorage.ts'
import { generatePuzzle } from '../../src/core/generator.ts'
import { currentSettings,settingsForSeed,type BoardSize,type CellValue,type PuzzleDefinition } from '../../src/core/types.ts'
class Memory implements StoragePort{data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null}setItem(k:string,v:string){this.data.set(k,v)}removeItem(k:string){this.data.delete(k)}}
const progress=(p:PuzzleDefinition)=>{const values=Array<CellValue>(p.size*p.size).fill(null);for(const c of p.cages)if(c.op==='=')values[c.cells[0]]=c.target;return{values,elapsedMs:0,status:'ready' as const,answerUsed:false}}
it.each([3,5,9] as BoardSize[])('saves and verifies applied settings at size %i',size=>{
  const generated=generatePuzzle(currentSettings(0,size,'easy'));if(generated.status!=='success')throw Error('Fixture')
  const memory=new Memory(),service=createGameStorage(()=>memory),p=generated.puzzle
  expect(service.saveSession(p,progress(p))).toBe(true)
  const loaded=service.loadSession();expect(loaded.status).toBe('restored')
  if(loaded.status==='restored'){expect(loaded.session.puzzle.id).toBe(p.id);expect(loaded.session.puzzle.size).toBe(size);expect(loaded.session.progress.values).toHaveLength(size*size)}
  expect(service.loadSession(true).status).toBe(size>5?'pending':'restored')
})
it('restores the old v1 problem exactly without changing seed, ID or progress',()=>{
  const generated=generatePuzzle(settingsForSeed(0));if(generated.status!=='success')throw Error('Fixture')
  const memory=new Memory(),service=createGameStorage(()=>memory),p=generated.puzzle
  memory.setItem(SESSION_KEY,JSON.stringify({version:1,puzzle:p,progress:progress(p)}))
  const restored=service.loadSession(true);expect(restored.status).toBe('restored')
  if(restored.status==='restored')expect(restored.session.puzzle).toEqual(p)
})
it('separates best records across sizes, versions, difficulty and selected operators',()=>{
  const memory=new Memory(),service=createGameStorage(()=>memory),ids:string[]=[]
  for(const settings of [settingsForSeed(0),currentSettings(0),currentSettings(0,3,'easy'),currentSettings(0,9,'easy'),currentSettings(0,5,'hard'),currentSettings(0,5,'easy',['+'])]){
    const result=generatePuzzle(settings);expect(result.status).toBe('success');if(result.status==='success')ids.push(result.puzzle.id)
  }
  expect(new Set(ids).size).toBe(ids.length)
  for(const[id,key]of ids.entries())service.recordBest(key,1000+id,false)
  for(const[id,key]of ids.entries())expect(service.loadBest(key).value).toBe(1000+id)
})
it('rejects altered applied settings and invalid larger-board digits',()=>{
  const g=generatePuzzle(currentSettings(0,9,'easy'));if(g.status!=='success')throw Error('Fixture')
  const memory=new Memory(),s=createGameStorage(()=>memory);s.saveSession(g.puzzle,progress(g.puzzle));const raw=JSON.parse(memory.getItem(SESSION_KEY)!)
  raw.puzzle.size=8;memory.setItem(SESSION_KEY,JSON.stringify(raw));expect(s.loadSession(true).status).toBe('invalid')
  s.saveSession(g.puzzle,progress(g.puzzle));const bad=JSON.parse(memory.getItem(SESSION_KEY)!);bad.progress.values[0]=10;memory.setItem(SESSION_KEY,JSON.stringify(bad));expect(s.loadSession(true).status).toBe('invalid')
})
