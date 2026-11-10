// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import type { WorkerPort } from '../../src/composables/usePuzzleGenerator.ts'
import type { GenerateRequest } from '../../src/workers/protocol.ts'
import { handleGenerate } from '../../src/workers/handleGenerate.ts'
import { editableIds, fixedIds, gameSolution } from '../game-fixture.ts'
let wrapper: VueWrapper | undefined, workers: TestWorker[]
class TestWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  messages: GenerateRequest[] = []
  terminate = vi.fn()
  constructor() { workers.push(this) }
  postMessage(message: GenerateRequest) { this.messages.push(message) }
  complete() { this.onmessage?.({ data: handleGenerate(this.messages[0]) } as MessageEvent) }
}
beforeEach(() => {
  localStorage.clear()
  workers = []; vi.useFakeTimers(); vi.stubGlobal('Worker', TestWorker)
  vi.stubGlobal('crypto', { getRandomValues(array: Uint32Array) { array[0] = 0; return array } })
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals() })
async function setup() {
  wrapper = mount(App, { attachTo: document.body })
  workers[0].complete(); await nextTick()
  return wrapper
}
const cell = (id: number) => `[data-cell="${id}"]`
async function solve(w: VueWrapper) {
  for (const id of editableIds) { await w.get(cell(id)).trigger('click'); await w.get('[role="grid"]').trigger('keydown', { key: String(gameSolution[id]) }) }
}
it('selects a clicked cell, focuses the board, inputs digits and deletes with both keys', async () => {
  const w = await setup(), id = editableIds[3], grid = w.get('[role="grid"]')
  await w.get(cell(id)).trigger('click')
  expect(w.get(cell(id)).attributes('aria-selected')).toBe('true')
  expect(document.activeElement).toBe(grid.element)
  await grid.trigger('keydown', { key: '4' }); expect(w.get(`${cell(id)} .entered-value`).text()).toBe('4')
  await grid.trigger('keydown', { key: 'Backspace' }); expect(w.find(`${cell(id)} .entered-value`).exists()).toBe(false)
  await grid.trigger('keydown', { key: '3' }); await grid.trigger('keydown', { key: 'Delete' })
  expect(w.find(`${cell(id)} .entered-value`).exists()).toBe(false)
})
it('uses the same input and deletion behavior for keyboard and keypad', async () => {
  const w = await setup(), id = editableIds[0]
  await w.get(cell(id)).trigger('click')
  await w.get('[role="grid"]').trigger('keydown', { key: '2' })
  const keyboardValue = w.get(`${cell(id)} .entered-value`).text()
  await w.get('button[aria-label="数字を削除"]').trigger('click')
  expect(w.find(`${cell(id)} .entered-value`).exists()).toBe(false)
  await w.get('button[aria-label="2を入力"]').trigger('click')
  expect(w.get(`${cell(id)} .entered-value`).text()).toBe(keyboardValue)
})
it('disables the keypad until selection and protects clicked fixed cells', async () => {
  const w = await setup(), id = fixedIds[0]
  expect(w.get('button[aria-label="1を入力"]').attributes('disabled')).toBeDefined()
  await w.get(cell(id)).trigger('click')
  expect(w.get(cell(id)).attributes('aria-selected')).toBe('true')
  expect(w.get(cell(id)).attributes('aria-readonly')).toBe('true')
  await w.get('[role="grid"]').trigger('keydown', { key: '2' })
  await w.get('[role="grid"]').trigger('keydown', { key: 'Backspace' })
  expect(w.get(`${cell(id)} .fixed-value`).text()).toBe(String(gameSolution[id]))
  expect(w.get('button[aria-label="1を入力"]').attributes('disabled')).toBeDefined()
  expect(w.get('.selection-description').text()).toContain('編集できません')
})
it('supports arrow navigation, keyboard focus entry and does not wrap across row edges', async () => {
  const w = await setup(), grid = w.get('[role="grid"]')
  ;(grid.element as HTMLElement).focus(); await nextTick()
  expect(w.get(cell(editableIds[0])).attributes('aria-selected')).toBe('true')
  await w.get(cell(0)).trigger('click')
  await grid.trigger('keydown', { key: 'ArrowRight' }); await grid.trigger('keydown', { key: 'ArrowDown' })
  expect(w.get(cell(6)).attributes('aria-selected')).toBe('true')
  await grid.trigger('keydown', { key: 'ArrowLeft' }); await grid.trigger('keydown', { key: 'ArrowUp' }); await grid.trigger('keydown', { key: 'ArrowLeft' })
  expect(w.get(cell(0)).attributes('aria-selected')).toBe('true')
})
it('does not intercept keyboard input outside the board, modifiers or unsupported digits', async () => {
  const w = await setup(), id = editableIds[0]
  await w.get(cell(id)).trigger('click')
  const input = document.createElement('input'); document.body.append(input); input.focus()
  for (const key of ['2', 'ArrowDown', 'Backspace']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    input.dispatchEvent(event); expect(event.defaultPrevented).toBe(false)
  }
  await w.get('[role="grid"]').trigger('keydown', { key: '6' })
  await w.get('[role="grid"]').trigger('keydown', { key: '2', ctrlKey: true })
  expect(w.find(`${cell(id)} .entered-value`).exists()).toBe(false)
  expect(w.get('.elapsed-time').text()).toBe('00:00.0')
})
it('marks contradictions with a symbol, accessible state and explanatory text', async () => {
  const w = await setup()
  for (const id of editableIds.slice(0, 10)) { await w.get(cell(id)).trigger('click'); await w.get('button[aria-label="1を入力"]').trigger('click') }
  expect(w.findAll('.cell-warning').length).toBeGreaterThan(0)
  expect(w.findAll('[aria-invalid="true"]').length).toBeGreaterThan(0)
  expect(w.get('#game-errors').text()).toContain('重複')
  expect(w.find('.clear-message').exists()).toBe(false)
})
it('clears with a valid answer, displays frozen clear time and locks all input', async () => {
  const w = await setup()
  await w.get(cell(editableIds[0])).trigger('click'); await w.get('[role="grid"]').trigger('keydown', { key: String(gameSolution[editableIds[0]]) })
  vi.advanceTimersByTime(2300); await solve(w)
  expect(w.get('.clear-message').text()).toContain('クリア時間：00:02.3')
  expect(w.get('[role="grid"]').attributes('aria-readonly')).toBe('true')
  expect(w.get('button[aria-label="1を入力"]').attributes('disabled')).toBeDefined()
  const before = w.findAll('.entered-value').map(c => c.text())
  await w.get('[role="grid"]').trigger('keydown', { key: 'Backspace' })
  vi.advanceTimersByTime(5000); await nextTick()
  expect(w.get('.elapsed-time').text()).toBe('00:02.3')
  expect(w.findAll('.entered-value').map(c => c.text())).toEqual(before)
})
it('retries the same cleared puzzle without invoking the worker or preserving user entries', async () => {
  const w = await setup(); const boundaries = w.get('.cage-overlay path').attributes('d'), seed = w.get('.problem-meta').text()
  await solve(w)
  await w.get('.retry-button').trigger('click')
  expect(w.get('.cage-overlay path').attributes('d')).toBe(boundaries); expect(w.get('.problem-meta').text()).toBe(seed)
  expect(workers).toHaveLength(1); expect(w.findAll('.entered-value')).toHaveLength(0)
  expect(w.find('[aria-selected="true"]').exists()).toBe(false)
  expect(w.find('#game-errors').exists()).toBe(false); expect(w.find('.clear-message').exists()).toBe(false)
  expect(w.get('.elapsed-time').text()).toBe('00:00.0')
  expect(w.get('[role="grid"]').attributes('aria-readonly')).toBe('false')
})
it('retains the entered game after a failed new generation and resets on success', async () => {
  const w = await setup(), id = editableIds[0]
  await w.get(cell(id)).trigger('click'); await w.get('[role="grid"]').trigger('keydown', { key: '3' })
  await w.get('.settings button').trigger('click')
  expect(w.get('[role="grid"]').attributes('aria-readonly')).toBe('true')
  workers[1].onerror?.(new ErrorEvent('error')); await nextTick()
  expect(w.get(`${cell(id)} .entered-value`).text()).toBe('3')
  expect(w.get('[role="grid"]').attributes('aria-readonly')).toBe('false')
  await w.get('.settings button').trigger('click'); workers[2].complete(); await nextTick()
  expect(w.findAll('.entered-value')).toHaveLength(0); expect(w.get('.elapsed-time').text()).toBe('00:00.0')
  expect(w.find('[aria-selected="true"]').exists()).toBe(false)
})
