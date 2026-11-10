// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import type { WorkerPort } from '../../src/composables/usePuzzleGenerator.ts'
import type { GenerateRequest } from '../../src/workers/protocol.ts'
import { handleGenerate } from '../../src/workers/handleGenerate.ts'
import { createGameStorage, SESSION_KEY, BEST_KEY } from '../../src/services/gameStorage.ts'
import { editableIds, fixedIds, gamePuzzle, gameSolution } from '../game-fixture.ts'
let wrapper: VueWrapper | undefined, workers: TestWorker[]
class TestWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  request!: GenerateRequest
  constructor() { workers.push(this) }
  postMessage(request: GenerateRequest) { this.request = request }
  terminate = vi.fn()
  complete() { this.onmessage?.({ data: handleGenerate(this.request) } as MessageEvent) }
}
beforeEach(() => { localStorage.clear(); workers = []; vi.useFakeTimers(); vi.stubGlobal('Worker', TestWorker); vi.stubGlobal('crypto', { getRandomValues(a: Uint32Array) { a[0] = 0; return a } }) })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
async function start() { wrapper = mount(App, { attachTo: document.body }); workers[0]?.complete(); await nextTick(); return wrapper }
async function enter(w: VueWrapper, id: number, n: number) { await w.get(`[data-cell="${id}"]`).trigger('click'); await w.get('[role="grid"]').trigger('keydown', { key: String(n) }) }
async function solve(w: VueWrapper) { for (const id of editableIds) await enter(w, id, gameSolution[id]) }
const button = (w: VueWrapper, text: string) => { const found = w.findAll('button').find(b => b.text().includes(text)); if (!found) throw new Error('Missing '+text); return found }
it('connects Undo/Redo and candidate buttons without accidentally revealing an answer', async () => {
  const w = await start(); expect(button(w, 'Undo').attributes('disabled')).toBeDefined()
  await enter(w, 0, 2); await button(w, 'Undo').trigger('click'); expect(w.findAll('.entered-value')).toHaveLength(0)
  await button(w, 'Redo').trigger('click'); expect(w.get('[data-cell="0"] .entered-value').text()).toBe('2')
  await button(w, '候補表示').trigger('click'); expect(w.get('.hint-result').text()).toContain('候補')
  expect(w.find('.answer-used').exists()).toBe(false)
})
it('keeps answer-use visible after Undo and excludes the completed game from best records', async () => {
  const w = await start(); await w.get('[data-cell="0"]').trigger('click')
  await button(w, '答えを見る').trigger('click'); await button(w, 'Undo').trigger('click')
  expect(w.get('.answer-used').text()).toContain('記録対象外')
  await solve(w)
  expect(w.get('.record-message').text()).toContain('対象外'); expect(localStorage.getItem(BEST_KEY)).toBeNull()
})
it('saves the fastest unassisted clear and compares repeated attempts on the same ID', async () => {
  const w = await start(); await enter(w, 0, gameSolution[0]); vi.advanceTimersByTime(1500); await solve(w)
  expect(w.get('.record-message').text()).toContain('更新'); expect(w.get('.best-record').text()).toContain('00:01.5')
  await button(w, '同じ問題で再挑戦').trigger('click'); await enter(w, 0, gameSolution[0]); vi.advanceTimersByTime(3000); await solve(w)
  expect(w.get('.record-message').text()).toContain('超えません'); expect(w.get('.best-record').text()).toContain('00:01.5')
  await button(w, '同じ問題で再挑戦').trigger('click'); await enter(w, 0, gameSolution[0]); vi.advanceTimersByTime(500); await solve(w)
  expect(w.get('.best-record').text()).toContain('00:00.5')
})
it('saves and restores progress without generating a replacement or adding closed-page time', async () => {
  let w = await start(); await enter(w, 0, 3); vi.advanceTimersByTime(1900); await nextTick()
  window.dispatchEvent(new Event('pagehide'))
  const saved = JSON.parse(localStorage.getItem(SESSION_KEY)!)
  expect(saved.progress.elapsedMs).toBe(1900); expect(saved.puzzle).not.toHaveProperty('solution')
  w.unmount(); wrapper = undefined; vi.advanceTimersByTime(60_000)
  w = mount(App, { attachTo: document.body }); wrapper = w; await nextTick()
  expect(workers).toHaveLength(1); expect(w.get('.restoration-message').text()).toContain('途中状態')
  expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3'); expect(w.get('.elapsed-time').text()).toBe('00:01.9')
  vi.advanceTimersByTime(1000); await nextTick(); expect(w.get('.elapsed-time').text()).toBe('00:02.9')
  expect(button(w, 'Undo').attributes('disabled')).toBeDefined()
  await button(w, '同じ問題で再挑戦').trigger('click')
  expect(w.find('.restoration-message').exists()).toBe(false)
})
it('persists the sticky answer flag and resets progress/history/flag on retry', async () => {
  const w = await start(); await w.get('[data-cell="0"]').trigger('click'); await button(w, '答えを見る').trigger('click'); await button(w, 'Undo').trigger('click')
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).progress.answerUsed).toBe(true)
  await button(w, '同じ問題で再挑戦').trigger('click')
  const saved = JSON.parse(localStorage.getItem(SESSION_KEY)!)
  expect(saved.progress.answerUsed).toBe(false); expect(saved.progress.elapsedMs).toBe(0)
  expect(saved.progress.values.filter((v: unknown) => v !== null)).toHaveLength(fixedIds.length)
  expect(button(w, 'Undo').attributes('disabled')).toBeDefined()
})
it('updates saved progress only after successful new generation', async () => {
  const w = await start(); await enter(w, 0, 3); const old = JSON.parse(localStorage.getItem(SESSION_KEY)!)
  await w.get('.settings button').trigger('click'); workers[1].onerror?.(new ErrorEvent('error')); await nextTick()
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).progress.values).toEqual(old.progress.values)
  await w.get('.settings button').trigger('click'); workers[2].complete(); await nextTick()
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).progress.values.filter((v: unknown) => v !== null)).toHaveLength(fixedIds.length)
})
it('discards corrupt saved data and clearly reports a fresh start', async () => {
  localStorage.setItem(SESSION_KEY, '{broken')
  const w = await start(); expect(w.get('.restoration-message').text()).toContain('検証できなかった')
  expect(w.findAll('.entered-value')).toHaveLength(0); expect(workers).toHaveLength(1)
})
it('continues to accept input and clear when storage writes are denied', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
  const w = await start(); await enter(w, 0, 3)
  expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3'); expect(w.get('.storage-message').text()).toContain('保存')
  await solve(w); expect(w.get('.record-message').text()).toContain('保存できません')
})
it('generates normally when storage reads are denied', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
  const w = await start(); expect(w.get('.storage-message').text()).toContain('続けられます')
  await enter(w, 0, 3); expect(w.get('[data-cell="0"] .entered-value').text()).toBe('3')
})
it('restores a cleared board without awarding a best record from saved data', async () => {
  createGameStorage().saveSession(gamePuzzle, { values: gameSolution, elapsedMs: 500, status: 'cleared', answerUsed: false })
  const w = await start()
  expect(workers).toHaveLength(0); expect(w.find('.clear-message').exists()).toBe(true)
  expect(w.get('.best-record').text()).toContain('まだ記録'); expect(localStorage.getItem(BEST_KEY)).toBeNull()
})

it('pauses on pagehide and resumes on pageshow without counting time away', async () => {
  const w = await start(); await enter(w, 0, 3); vi.advanceTimersByTime(1700)
  window.dispatchEvent(new Event('pagehide')); vi.advanceTimersByTime(60_000); await nextTick()
  expect(w.get('.elapsed-time').text()).toBe('00:01.7')
  window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('pageshow'))
  vi.advanceTimersByTime(1000); await nextTick(); expect(w.get('.elapsed-time').text()).toBe('00:02.7')
})
it('shows no-candidate results with an explanation of existing contradictions', async () => {
  const w = await start()
  for (const id of editableIds.slice(0, 8)) await enter(w, id, 1)
  await w.get('[data-cell="0"]').trigger('click'); await button(w, '候補表示').trigger('click')
  expect(w.get('.hint-result').text()).toContain('候補なし'); expect(w.get('.hint-result').text()).toContain('重複')
})
