// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import type { WorkerPort } from '../../src/composables/usePuzzleGenerator.ts'
import type { GenerateRequest } from '../../src/workers/protocol.ts'
import { handleGenerate } from '../../src/workers/handleGenerate.ts'
let workers: TestWorker[], wrapper: VueWrapper | undefined
class TestWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  messages: GenerateRequest[] = []
  constructor() { workers.push(this) }
  postMessage(message: GenerateRequest) { this.messages.push(message) }
  terminate = vi.fn()
  complete() { this.onmessage?.({ data: handleGenerate(this.messages[0]) } as MessageEvent) }
  fail() { this.onmessage?.({ data: { type: 'generated', requestId: this.messages[0].requestId, result: { status: 'failure', reason: 'budget-exceeded' } } } as MessageEvent) }
}
beforeEach(() => {
  localStorage.clear()
  workers = []; vi.useFakeTimers(); vi.stubGlobal('Worker', TestWorker) })
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals() })
it('renders 25 cells, cage boundaries and labels without exposing the full solution', async () => {
  wrapper = mount(App)
  await nextTick()
  expect(wrapper.find('[role="grid"]').exists()).toBe(false)
  expect(wrapper.get('[role="status"]').text()).toContain('一意解を確認')
  workers[0].complete(); await nextTick()
  expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(25)
  expect((wrapper.get('.cage-overlay path').attributes('d')?.length ?? 0)).toBeGreaterThan(0)
  expect(wrapper.findAll('.cage-label').length).toBeGreaterThan(0)
  expect(wrapper.findAll('.fixed-value').length).toBeLessThanOrEqual(5)
  expect(wrapper.get('[role="grid"]').attributes('aria-readonly')).toBe('false')
  await wrapper.get('button').trigger('click')
  workers[1].complete(); await nextTick()
  expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(25)
})
it('shows an initial failure without rendering an unverified board', async () => {
  wrapper = mount(App); workers[0].fail(); await nextTick()
  expect(wrapper.find('[role="grid"]').exists()).toBe(false)
  expect(wrapper.get('[role="alert"]').text()).toContain('一意解を確認できません')
  expect(wrapper.get('.board-placeholder').text()).toContain('未確認の問題は表示しません')
})
it('keeps a verified board when subsequent generation fails', async () => {
  wrapper = mount(App); workers[0].complete(); await nextTick()
  const walls = wrapper.get('.cage-overlay path').attributes('d')
  await wrapper.get('button').trigger('click'); workers[1].fail(); await nextTick()
  expect(wrapper.get('.cage-overlay path').attributes('d')).toBe(walls)
  expect(wrapper.findAll('[role="gridcell"]')).toHaveLength(25)
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
})
it('rejects a success-shaped response without unique verification', async () => {
  wrapper = mount(App)
  const response = handleGenerate(workers[0].messages[0])
  if (response.result.status !== 'success') throw new Error('Fixture generation failed')
  const { verification: omitted, ...unverified } = response.result.puzzle
  expect(omitted).toBe('unique')
  workers[0].onmessage?.({ data: { ...response, result: { ...response.result, puzzle: unverified } } } as MessageEvent)
  await nextTick()
  expect(wrapper.find('[role="grid"]').exists()).toBe(false)
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
})
