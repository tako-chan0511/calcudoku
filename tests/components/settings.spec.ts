// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import PuzzleBoard from '../../src/components/PuzzleBoard.vue'
import NumberPad from '../../src/components/NumberPad.vue'
import {nextTick} from 'vue'
import App from '../../src/App.vue'
import type{WorkerPort}from '../../src/composables/usePuzzleGenerator.ts'
import type{WorkerRequest}from '../../src/workers/protocol.ts'
import{handleGenerate}from '../../src/workers/handleGenerate.ts'
import{handleVerify}from '../../src/workers/handleVerify.ts'
import{generatePuzzle}from '../../src/core/generator.ts'
import{currentSettings,type CellValue,type BoardSize}from '../../src/core/types.ts'
import{createGameStorage,SESSION_KEY}from '../../src/services/gameStorage.ts'
let wrapper:VueWrapper|undefined,workers:FakeWorker[]
class FakeWorker implements WorkerPort{
 onmessage:WorkerPort['onmessage']=null;onerror:WorkerPort['onerror']=null;request!:WorkerRequest;terminate=vi.fn()
 constructor(){workers.push(this)}postMessage(r:WorkerRequest){this.request=r}
 complete(){this.onmessage?.({data:this.request.type==='generate'?handleGenerate(this.request,m=>this.onmessage?.({data:m}as MessageEvent)):handleVerify(this.request)}as MessageEvent)}
}
beforeEach(()=>{localStorage.clear();workers=[];vi.useFakeTimers();vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('crypto',{getRandomValues(a:Uint32Array){a[0]=0;return a}})})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML='';vi.unstubAllGlobals();vi.useRealTimers()})
async function setup(){wrapper=mount(App,{attachTo:document.body});workers[0].complete();await nextTick();return wrapper}
async function tick(){await Promise.resolve();await nextTick()}
async function enter(w:VueWrapper){await w.get('[data-cell="0"]').trigger('click');await w.get('[role="grid"]').trigger('keydown',{key:'3'})}
it('does not change a live puzzle or saved applied settings while editing the draft',async()=>{
 const w=await setup();await enter(w);const old=JSON.parse(localStorage.getItem(SESSION_KEY)!).puzzle
 await w.get('select[aria-label="盤面サイズ"]').setValue('9');await w.get('select[aria-label="難易度"]').setValue('easy');await w.get('input[aria-label="シード"]').setValue('123')
 expect(w.findAll('[role="gridcell"]')).toHaveLength(25);expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3')
 expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).puzzle).toEqual(old)
 await w.get('input[aria-label="演算子 ×"]').setValue(false);expect(w.get('.applied-operators').text()).toContain('×')
})
it('applies only the captured successful settings, preserving edits made while busy',async()=>{
 const w=await setup();await w.get('select[aria-label="盤面サイズ"]').setValue('9');await w.get('select[aria-label="難易度"]').setValue('easy');await w.get('.settings button').trigger('click')
 expect(w.findAll('[role="gridcell"]')).toHaveLength(25);expect(w.find('.cancel-generation').exists()).toBe(true)
 await w.get('input[aria-label="シード"]').setValue('42');workers[1].complete();await tick()
 expect(w.findAll('[role="gridcell"]')).toHaveLength(81);expect(w.get('input[aria-label="シード"]').element).toHaveProperty('value','42')
 expect(w.findAll('.number-pad button:not(.delete-number)')).toHaveLength(9)
 expect(w.get('.cage-overlay').attributes('viewBox')).toBe('0 0 900 900')
 const saved=JSON.parse(localStorage.getItem(SESSION_KEY)!);expect(saved.puzzle.size).toBe(9);expect(saved.puzzle.seed).toBe(0)
 const first=w.findAll('[role="gridcell"]').find(c=>c.attributes('aria-readonly')==='false')!;await first.trigger('click');await w.get('[role="grid"]').trigger('keydown',{key:'9'})
 expect(first.get('.entered-value').text()).toBe('9')
})
it('keeps the previous game after failed generation or cancel, including late results',async()=>{
 const w=await setup();await enter(w);await w.get('select[aria-label="生成方式"]').setValue('calcudoku-v2');await w.get('select[aria-label="盤面サイズ"]').setValue('3');await w.get('select[aria-label="難易度"]').setValue('hard');await w.get('.settings button').trigger('click');workers[1].complete();await tick()
 expect(w.get('.error').text()).toContain('指定難易度');expect(w.findAll('[role="gridcell"]')).toHaveLength(25);expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3')
 await w.get('select[aria-label="盤面サイズ"]').setValue('9');await w.get('.settings button').trigger('click');await w.get('.cancel-generation').trigger('click');workers[2].complete();await tick()
 expect(w.findAll('[role="gridcell"]')).toHaveLength(25);expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3')
})
it('rejects bad seeds and an empty operator selection without launching a Worker',async()=>{
 const w=await setup();await w.get('input[aria-label="シード"]').setValue('4294967296');expect(w.get('.settings-errors').text()).toContain('シード');expect(w.get('.settings button').attributes('disabled')).toBeDefined()
 await w.get('input[aria-label="シード"]').setValue('0');for(const checkbox of w.findAll('.operator-field input'))await checkbox.setValue(false)
 expect(w.get('.settings-errors').text()).toContain('1種類以上');expect(workers).toHaveLength(1)
})
it('copies the applied seed rather than the edited seed',async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText}})
 const w=await setup();await w.get('input[aria-label="シード"]').setValue('123');await w.get('.copy-seed').trigger('click');await tick()
 expect(writeText).toHaveBeenCalledWith('0');expect(w.get('.copy-message').text()).toContain('コピーしました')
})
function savedLarge(){const result=generatePuzzle(currentSettings(0,9,'easy'));if(result.status!=='success')throw Error('Fixture');const values=Array<CellValue>(81).fill(null);for(const c of result.puzzle.cages)if(c.op==='=')values[c.cells[0]]=c.target;expect(createGameStorage().saveSession(result.puzzle,{values,elapsedMs:3500,status:'playing',answerUsed:true})).toBe(true);return result.puzzle}
it('publishes a saved large board only after off-thread verification',async()=>{
 savedLarge();wrapper=mount(App);await tick();expect(wrapper.find('[role="grid"]').exists()).toBe(false);expect(workers[0].request.type).toBe('verify')
 workers[0].complete();await tick();expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(81);expect(wrapper.get('.elapsed-time').text()).toBe('00:03.5');expect(wrapper.get('select[aria-label="盤面サイズ"]').element).toHaveProperty('value','9')
 vi.advanceTimersByTime(1000);await tick();expect(wrapper.get('.elapsed-time').text()).toBe('00:04.5')
})
it('does not restore a cancelled or late large-board verification',async()=>{
 savedLarge();wrapper=mount(App);await tick();await wrapper.get('.cancel-generation').trigger('click');workers[0].complete();await tick()
 expect(wrapper.find('[role="grid"]').exists()).toBe(false);expect(workers).toHaveLength(1);expect(wrapper.get('.restoration-message').text()).toContain('キャンセル')
})
it('starts fresh after a failed large verification without exposing saved cells',async()=>{
 savedLarge();wrapper=mount(App);await wrapper.get('select[aria-label="盤面サイズ"]').setValue('3');await wrapper.get('select[aria-label="難易度"]').setValue('hard');const id=workers[0].request.requestId;workers[0].onmessage?.({data:{type:'verified',requestId:id,valid:false}}as MessageEvent);await tick()
 expect(wrapper.find('[role="grid"]').exists()).toBe(false);expect(workers).toHaveLength(2);expect(workers[1].request.type==='generate'&&workers[1].request.settings.size).toBe(5);workers[1].complete();await tick();expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(25)
})

it.each([3,4,5,6,7,8,9] as BoardSize[])('renders the board and number pad for size %i',size=>{
 const r=generatePuzzle(currentSettings(0,size,'easy'));if(r.status!=='success')throw Error('Fixture')
 const board=mount(PuzzleBoard,{props:{puzzle:r.puzzle,values:Array<CellValue>(size*size).fill(null),selectedCell:null,duplicateCells:[],conflictingCages:[],disabled:false}})
 const pad=mount(NumberPad,{props:{size,disabled:false,canDelete:false}})
 expect(board.findAll('[role="gridcell"]')).toHaveLength(size*size);expect(board.get('[role="grid"]').attributes('aria-rowcount')).toBe(String(size))
 expect(board.get('svg').attributes('viewBox')).toBe(`0 0 ${size*100} ${size*100}`);expect(pad.findAll('button:not(.delete-number)')).toHaveLength(size)
 board.unmount();pad.unmount()
})

it('explains the unverified division-only hard setting without changing the live puzzle',async()=>{
 const w=await setup();await enter(w)
 await w.get('select[aria-label="盤面サイズ"]').setValue('9');await w.get('select[aria-label="難易度"]').setValue('hard')
 for(const symbol of ['＋','−','×'])await w.get(`input[aria-label="演算子 ${symbol}"]`).setValue(false)
 expect(w.get('.unsupported-setting').text()).toContain('生成成功が未確認')
 expect(w.get('.unsupported-setting').text()).toContain('動作保証対象外')
 expect(w.findAll('[role="gridcell"]')).toHaveLength(25);expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3');expect(workers).toHaveLength(1)
 await w.get('select[aria-label="難易度"]').setValue('normal');expect(w.find('.unsupported-setting').exists()).toBe(false)
})
