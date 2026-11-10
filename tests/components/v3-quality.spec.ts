// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { mount,type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import { generatePuzzle } from '../../src/core/generator.ts'
import { currentSettings,settingsForSeed,type CellValue } from '../../src/core/types.ts'
import { createGameStorage,SESSION_KEY } from '../../src/services/gameStorage.ts'
import type { WorkerPort } from '../../src/composables/usePuzzleGenerator.ts'
import type { WorkerRequest } from '../../src/workers/protocol.ts'
import { handleGenerate } from '../../src/workers/handleGenerate.ts'
import { handleVerify } from '../../src/workers/handleVerify.ts'
let wrapper:VueWrapper|undefined,workers:FakeWorker[]
class FakeWorker implements WorkerPort{
 onmessage:WorkerPort['onmessage']=null;onerror:WorkerPort['onerror']=null;request!:WorkerRequest;terminate=vi.fn()
 constructor(){workers.push(this)}postMessage(r:WorkerRequest){this.request=r}
 complete(){this.onmessage?.({data:this.request.type==='generate'?handleGenerate(this.request):handleVerify(this.request)}as MessageEvent)}
 fail(reason:string,diagnostics?:unknown){this.onmessage?.({data:{type:'generated',requestId:this.request.requestId,result:{status:'failure',reason,metrics:{attempts:10,work:100,solverCalls:10,refinements:0,diagnostics}}}}as MessageEvent)}
}
beforeEach(()=>{localStorage.clear();workers=[];vi.useFakeTimers();vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('crypto',{getRandomValues(a:Uint32Array){a[0]=0;return a}})})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals()})
async function setup(){wrapper=mount(App,{attachTo:document.body});workers[0]?.complete();await nextTick();return wrapper}
async function key(w:VueWrapper,id:number,n:number){await w.get(`[data-cell="${id}"]`).trigger('click');await w.get('[role="grid"]').trigger('keydown',{key:String(n)})}
it('defaults to v3 while retaining explicit old-version choices and regenerates hard 3×3',async()=>{
 const w=await setup();expect(w.get('select[aria-label="生成方式"]').element).toHaveProperty('value','calcudoku-v3')
 expect(w.findAll('select[aria-label="生成方式"] option')).toHaveLength(3)
 await w.get('select[aria-label="盤面サイズ"]').setValue('3');await w.get('select[aria-label="難易度"]').setValue('hard');await w.get('.settings button').trigger('click');workers[1].complete();await nextTick()
 expect(w.findAll('[role="gridcell"]')).toHaveLength(9);expect(w.get('.board-heading').text()).toContain('hard');expect(w.get('.problem-meta').text()).toContain('calcudoku-v3')
})
it('preserves values, hint usage, timer, saved applied puzzle and Undo after a grade failure',async()=>{
 const w=await setup();await key(w,0,3);await key(w,1,2)
 await w.findAll('button').find(b=>b.text()==='答えを見る')!.trigger('click')
 vi.advanceTimersByTime(1200);await nextTick();const old=JSON.parse(localStorage.getItem(SESSION_KEY)!)
 const values=w.findAll('.entered-value').map(e=>e.text());await w.get('.settings button').trigger('click')
 workers[1].fail('difficulty-unmet',{easy:17,normal:3,hard:0});await nextTick()
 expect(w.get('.error').text()).toContain('難易度条件');expect(w.get('.error').text()).toContain('easy / normal');expect(w.get('.error').text()).toContain('設定は自動変更していません')
 expect(w.findAll('.entered-value').map(e=>e.text())).toEqual(values);expect(w.get('.answer-used').text()).toContain('対象外');expect(w.get('.elapsed-time').text()).toBe('00:01.2')
 expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).puzzle).toEqual(old.puzzle)
 const undo=w.findAll('button').find(b=>b.text().includes('Undo'))!;expect(undo.attributes('disabled')).toBeUndefined();await undo.trigger('click');expect(w.find('.answer-used').exists()).toBe(true)
})
it.each([
 ['operator-constraints','演算子制限','整数で割り切れる'],
 ['budget-exceeded','探索上限','未確認の問題は採用していません'],
 ['attempt-limit','試行上限','別のシード'],
])('explains %s in Japanese and retains the current game',async(reason,label,explanation)=>{
 const w=await setup();await key(w,0,3);const before=w.get('.problem-meta').text();await w.get('.settings button').trigger('click');workers[1].fail(reason);await nextTick()
 expect(w.get('.error').text()).toContain(label);expect(w.get('.error').text()).toContain(explanation);expect(w.get('.problem-meta').text()).toBe(before);expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3')
})
it('ignores a cancelled job failure without changing fields or displaying an error',async()=>{
 const w=await setup();await key(w,0,3);await w.get('.settings button').trigger('click');await w.get('.cancel-generation').trigger('click');workers[1].fail('budget-exceeded');await nextTick()
 expect(w.find('.error').exists()).toBe(false);expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3');expect(workers[1].terminate).toHaveBeenCalledOnce()
})
it.each([1,2])('restores v%i without silently migrating it to v3',async version=>{
 const r=generatePuzzle(version===1?settingsForSeed(0):currentSettings(0));if(r.status!=='success')throw Error('Fixture')
 const values=Array<CellValue>(25).fill(null);for(const c of r.puzzle.cages)if(c.op==='=')values[c.cells[0]]=c.target
 createGameStorage().saveSession(r.puzzle,{values,elapsedMs:0,status:'ready',answerUsed:false});const w=await setup()
 expect(workers).toHaveLength(0);expect(w.get('select[aria-label="生成方式"]').element).toHaveProperty('value',`calcudoku-v${version}`);expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).puzzle.id).toBe(r.puzzle.id)
})
