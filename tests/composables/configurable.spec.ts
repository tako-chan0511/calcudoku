// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, shallowRef } from 'vue'
import { usePuzzleGenerator, type WorkerPort } from '../../src/composables/usePuzzleGenerator.ts'
import { usePuzzleSettings } from '../../src/composables/usePuzzleSettings.ts'
import { generatePuzzle } from '../../src/core/generator.ts'
import { solvePuzzle } from '../../src/core/solver.ts'
import { usePuzzleGame } from '../../src/composables/usePuzzleGame.ts'
import { currentSettings, type BoardSize } from '../../src/core/types.ts'
import { handleGenerate } from '../../src/workers/handleGenerate.ts'
import { handleVerify } from '../../src/workers/handleVerify.ts'
import type { WorkerRequest } from '../../src/workers/protocol.ts'
import { gamePuzzle } from '../game-fixture.ts'
class FakeWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null; onerror: WorkerPort['onerror'] = null
  messages: WorkerRequest[] = []; terminate = vi.fn()
  postMessage(request: WorkerRequest) { this.messages.push(request) }
  reply(raw: unknown) { this.onmessage?.({data: raw} as MessageEvent) }
  complete() { const r=this.messages[0];this.reply(r.type==='generate'?handleGenerate(r):handleVerify(r)) }
}
let dispose: (()=>void)|undefined
afterEach(()=>{dispose?.();dispose=undefined;vi.useRealTimers();vi.unstubAllGlobals()})
function setup(){
  vi.useFakeTimers();const workers:FakeWorker[]=[];let api!:ReturnType<typeof usePuzzleGenerator>
  const w=mount(defineComponent({setup(){api=usePuzzleGenerator(()=>{const worker=new FakeWorker();workers.push(worker);return worker},()=>42);return()=>h('div')}}));dispose=()=>w.unmount();return{api,workers}
}
it.each(['0','4294967295','00042'])('accepts integer seed %s',seed=>{const s=usePuzzleSettings();s.draft.seed=seed;expect(s.errors.value).toEqual([]);expect(s.read()?.seed).toBe(Number(seed))})
it.each(['','-1','4294967296','1.5','1e3','NaN','abc'])('rejects invalid seed %s',seed=>{const s=usePuzzleSettings();s.draft.seed=seed;expect(s.errors.value.join('')).toContain('シード');expect(s.read()).toBeNull()})
it('requires an operator, validates legacy combinations and creates a random seed explicitly',()=>{
  const s=usePuzzleSettings();s.draft.operators=[];expect(s.read()).toBeNull()
  s.draft.operators=['+'];s.draft.generatorVersion='calcudoku-v1';s.draft.size=9;expect(s.errors.value.join('')).toContain('旧版')
  s.draft.generatorVersion='calcudoku-v2';vi.stubGlobal('crypto',{getRandomValues(a:Uint32Array){a[0]=123;return a}});s.randomize();expect(s.read()?.seed).toBe(123)
})
it('snapshots requested settings so subsequent draft edits cannot alter an active request',()=>{
  const{api,workers}=setup();api.restorePuzzle(gamePuzzle)
  const draft={...currentSettings(0),operators:['+','-','*','/'] as ('+'|'-'|'*'|'/')[]};api.generate(draft);draft.size=9;draft.operators.splice(0)
  const request=workers[0].messages[0];expect(request.type).toBe('generate')
  if(request.type==='generate'){expect(request.settings.size).toBe(5);expect(request.settings.operators).toHaveLength(4)}
  expect(api.puzzle.value).toBe(gamePuzzle)
})
it('retains the current problem on failure, cancellation and all late messages',()=>{
  const{api,workers}=setup();api.restorePuzzle(gamePuzzle);api.generate(currentSettings(0,9,'hard'))
  const old=workers[0],id=old.messages[0].requestId
  api.cancel();expect(old.terminate).toHaveBeenCalledOnce();expect(api.state.value).toBe('ready')
  old.reply({type:'progress',requestId:id,progress:{attempt:99,work:100,stage:'difficulty'}});old.complete()
  expect(api.puzzle.value).toBe(gamePuzzle);expect(api.progress.value).toBeNull()
  api.generate(currentSettings(0,3,'hard'));workers[1].complete();expect(api.state.value).toBe('failed');expect(api.puzzle.value).toBe(gamePuzzle)
})
it('rejects a unique response belonging to the wrong size or difficulty',()=>{
  const{api,workers}=setup();api.restorePuzzle(gamePuzzle);api.generate(currentSettings(0,9,'easy'))
  workers[0].reply({type:'generated',requestId:workers[0].messages[0].requestId,result:{status:'success',puzzle:gamePuzzle,metrics:{attempts:1,solverCalls:1,refinements:0,work:1}}})
  expect(api.state.value).toBe('failed');expect(api.puzzle.value).toBe(gamePuzzle)
})
it('accepts safe progress messages without publishing any candidate',()=>{
  const{api,workers}=setup();api.generate(currentSettings(0,9,'normal'));const id=workers[0].messages[0].requestId
  workers[0].reply({type:'progress',requestId:id,progress:{attempt:2,work:123,stage:'difficulty'}})
  expect(api.progress.value?.stage).toBe('difficulty');expect(api.puzzle.value).toBeNull()
})
it('verifies large saved problems off-thread and resolves cancellation safely',async()=>{
  const{api,workers}=setup();const pending=api.verifyPuzzle(gamePuzzle);workers[0].complete();expect(await pending).toBe('verified');expect(api.puzzle.value).toBeNull()
  const cancelled=api.verifyPuzzle(gamePuzzle);api.cancel();workers[1].complete();expect(await cancelled).toBe('cancelled');expect(api.puzzle.value).toBeNull()
})
it('expires a large request without adopting any unverified board',()=>{
  const{api}=setup();api.restorePuzzle(gamePuzzle);api.generate(currentSettings(0,9,'hard'));vi.advanceTimersByTime(45_000)
  expect(api.state.value).toBe('failed');expect(api.puzzle.value).toBe(gamePuzzle)
})

it.each([3,4,5,6,7,8,9] as BoardSize[])('inputs, navigates, clears and retries at size %i',size=>{
 const g=generatePuzzle(currentSettings(0,size,'easy'));if(g.status!=='success')throw Error('Fixture')
 const solved=solvePuzzle(g.puzzle);if(solved.status!=='unique')throw Error('Fixture')
 let game!:ReturnType<typeof usePuzzleGame>;const puzzle=shallowRef(g.puzzle)
 const w=mount(defineComponent({setup(){game=usePuzzleGame(puzzle);return()=>h('div')}}));dispose=()=>w.unmount()
 const fixed=new Set(g.puzzle.cages.filter(c=>c.op==='=').map(c=>c.cells[0]))
 const first=solved.solution.findIndex((_,id)=>!fixed.has(id));game.selectCell(first);expect(game.inputValue(size)).toBe(true);expect(game.inputValue(size+1)).toBe(false)
 game.selectCell(size-1);game.moveSelection('right');expect(game.selectedCell.value).toBe(size-1);game.moveSelection('down');expect(game.selectedCell.value).toBe(2*size-1)
 for(let id=0;id<size*size;id++)if(!fixed.has(id)){game.selectCell(id);game.inputValue(solved.solution[id])}
 expect(game.status.value).toBe('cleared');game.retry();expect(game.values.value.filter(v=>v!==null)).toHaveLength(fixed.size);expect(game.selectedCell.value).toBeNull()
})
