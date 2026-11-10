// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import type { WorkerPort } from '../../src/composables/usePuzzleGenerator.ts'
import type { GenerateRequest } from '../../src/workers/protocol.ts'
import { handleGenerate } from '../../src/workers/handleGenerate.ts'
import { createGameStorage, BEST_KEY, SESSION_KEY } from '../../src/services/gameStorage.ts'
import { editableIds, fixedIds, gamePuzzle, gameSolution } from '../game-fixture.ts'
let wrapper: VueWrapper | undefined, workers: TestWorker[]
class TestWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  request!: GenerateRequest
  terminate = vi.fn()
  constructor() { workers.push(this) }
  postMessage(request: GenerateRequest) { this.request = request }
  complete() { this.onmessage?.({ data: handleGenerate(this.request) } as MessageEvent) }
}
beforeEach(() => {
  localStorage.clear(); document.body.style.overflow = ''
  workers = []; vi.useFakeTimers(); vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('crypto', { getRandomValues(a: Uint32Array) { a[0] = 0; return a } })
})
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; document.body.style.overflow = ''
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})
async function start() {
  wrapper = mount(App, { attachTo: document.body }); workers[0]?.complete(); await nextTick(); return wrapper
}
async function enter(w: VueWrapper, id: number, value: number) {
  await w.get(`[data-cell="${id}"]`).trigger('click')
  await w.get('[role="grid"]').trigger('keydown', { key: String(value) })
}
async function solve(w: VueWrapper, ids = editableIds) { for (const id of ids) await enter(w, id, gameSolution[id]) }
function popup() { return document.querySelector<HTMLElement>('[role="dialog"]') }
async function popupAction(text: string) {
  const button = Array.from(popup()?.querySelectorAll('button') ?? []).find(b => b.textContent === text)
  if (!button) throw Error('Missing popup action: ' + text)
  button.click(); await nextTick(); await nextTick()
}
async function key(key: string, shiftKey = false) {
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
  await nextTick(); await nextTick()
}
it('celebrates only on the final correct entry and shows the frozen time and saved record', async () => {
  const w = await start(); expect(popup()).toBeNull()
  await enter(w, editableIds[0], gameSolution[editableIds[0]]); vi.advanceTimersByTime(2500)
  await solve(w, editableIds.slice(0, -1)); expect(popup()).toBeNull()
  await solve(w, editableIds.slice(-1))
  expect(popup()?.textContent).toContain('おめでとう！'); expect(popup()?.textContent).toContain('00:02.5')
  expect(popup()?.textContent).toContain('ベスト記録を更新'); expect(localStorage.getItem(BEST_KEY)).not.toBeNull()
  expect(w.get('main').attributes('inert')).toBeDefined()
  vi.advanceTimersByTime(5000); await nextTick(); expect(w.get('.elapsed-time').text()).toBe('00:02.5')
})
it('does not celebrate a full but incorrect board', async () => {
  const w = await start(); for (const id of editableIds) await enter(w, id, 1)
  expect(popup()).toBeNull(); expect(w.find('.game-errors').exists()).toBe(true)
})
it('dismisses without changing the completed board or record and restores focus and scrolling', async () => {
  const w = await start(); document.body.style.overflow = 'scroll'; await solve(w)
  const saved = localStorage.getItem(SESSION_KEY), best = localStorage.getItem(BEST_KEY)
  expect(document.body.style.overflow).toBe('hidden')
  await popupAction('閉じて盤面を見る')
  expect(popup()).toBeNull(); expect(w.get('main').attributes('inert')).toBeUndefined()
  expect(localStorage.getItem(SESSION_KEY)).toBe(saved); expect(localStorage.getItem(BEST_KEY)).toBe(best)
  expect(w.find('.clear-message').exists()).toBe(true); expect(document.body.style.overflow).toBe('scroll')
  expect(document.activeElement).toBe(w.get('.retry-button').element)
})
it('keeps Tab focus inside the popup and supports Escape', async () => {
  const w = await start(); await solve(w)
  const buttons = popup()!.querySelectorAll('button')
  expect(document.activeElement).toBe(buttons[0])
  await key('Tab'); expect(document.activeElement).toBe(buttons[1])
  await key('Tab'); expect(document.activeElement).toBe(buttons[0])
  await key('Tab', true); expect(document.activeElement).toBe(buttons[1])
  await key('Escape'); expect(popup()).toBeNull(); expect(document.body.style.overflow).toBe('')
})
it('retries the exact same puzzle from the popup and retains its best record', async () => {
  const w = await start(); await solve(w)
  const saved = JSON.parse(localStorage.getItem(SESSION_KEY)!), best = localStorage.getItem(BEST_KEY)
  await popupAction('もう一度挑戦する')
  const reset = JSON.parse(localStorage.getItem(SESSION_KEY)!)
  expect(popup()).toBeNull(); expect(reset.puzzle).toEqual(saved.puzzle); expect(workers).toHaveLength(1)
  expect(reset.progress.elapsedMs).toBe(0); expect(reset.progress.status).toBe('ready')
  expect(reset.progress.values.filter((v: unknown) => v !== null)).toHaveLength(fixedIds.length)
  expect(w.findAll('.entered-value')).toHaveLength(0); expect(localStorage.getItem(BEST_KEY)).toBe(best)
})
it('stays dismissed until a new clear, then celebrates the next attempt', async () => {
  const w = await start(); await solve(w); await popupAction('閉じて盤面を見る')
  vi.advanceTimersByTime(10_000); await nextTick(); expect(popup()).toBeNull()
  await w.get('.retry-button').trigger('click'); await solve(w)
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
})
it('does not reopen or award records when restoring a previously cleared board', async () => {
  createGameStorage().saveSession(gamePuzzle, { values: gameSolution, elapsedMs: 1500, status: 'cleared', answerUsed: false })
  const w = await start()
  expect(w.find('.clear-message').exists()).toBe(true); expect(popup()).toBeNull(); expect(workers).toHaveLength(0)
  expect(localStorage.getItem(BEST_KEY)).toBeNull()
})
it('celebrates a final answer hint while keeping the round excluded from best records', async () => {
  const w = await start(); await solve(w, editableIds.slice(0, -1))
  await w.get(`[data-cell="${editableIds.at(-1)!}"]`).trigger('click')
  const answer = w.findAll('button').find(b => b.text() === '答えを見る')!
  await answer.trigger('click')
  expect(popup()?.textContent).toContain('おめでとう！'); expect(popup()?.textContent).toContain('記録対象外')
  expect(localStorage.getItem(BEST_KEY)).toBeNull()
})
it('still celebrates if storage rejects the best record', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('QuotaExceededError') })
  const w = await start(); await solve(w)
  expect(popup()?.textContent).toContain('おめでとう！'); expect(popup()?.textContent).toContain('保存できません')
})
