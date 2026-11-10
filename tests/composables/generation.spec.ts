// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { usePuzzleGenerator, type WorkerPort } from '../../src/composables/usePuzzleGenerator.ts'
import type { GenerateRequest, GenerateResponse } from '../../src/workers/protocol.ts'
import { handleGenerate } from '../../src/workers/handleGenerate.ts'
class FakeWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  messages: GenerateRequest[] = []
  terminate = vi.fn()
  postMessage(message: GenerateRequest) { this.messages.push(message) }
  reply(response: GenerateResponse) { this.onmessage?.({ data: response } as MessageEvent) }
}
let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); vi.useRealTimers() })
function setup() {
  vi.useFakeTimers()
  const workers: FakeWorker[] = []
  let api!: ReturnType<typeof usePuzzleGenerator>
  const wrapper = mount(defineComponent({ setup() { api = usePuzzleGenerator(() => { const w = new FakeWorker(); workers.push(w); return w }, () => 42); return () => h('div') } }))
  dispose = () => wrapper.unmount()
  return { workers, api, wrapper }
}
it('never publishes failed or unverified candidates and retains a prior verified puzzle', () => {
  const { workers, api } = setup()
  api.generate()
  workers[0].reply({ type: 'generated', requestId: 1, result: { status: 'failure', reason: 'budget-exceeded', metrics: { attempts: 1, solverCalls: 1, refinements: 0, work: 1 } } })
  expect(api.state.value).toBe('failed'); expect(api.puzzle.value).toBeNull()
  api.generate(); workers[1].reply(handleGenerate(workers[1].messages[0]))
  expect(api.state.value).toBe('ready')
  const previous = api.puzzle.value
  api.generate(); workers[2].onerror?.(new ErrorEvent('error'))
  expect(api.state.value).toBe('failed'); expect(api.puzzle.value).toBe(previous)
})
it('ignores stale replies, terminates on timeout and cleans up on unmount', () => {
  const { workers, api, wrapper } = setup()
  api.generate(); api.generate()
  expect(workers[0].terminate).toHaveBeenCalledOnce()
  workers[0].reply(handleGenerate(workers[0].messages[0]))
  expect(api.puzzle.value).toBeNull(); expect(api.state.value).toBe('generating')
  vi.advanceTimersByTime(15000)
  expect(api.state.value).toBe('failed'); expect(api.puzzle.value).toBeNull()
  expect(workers[1].terminate).toHaveBeenCalledOnce()
  api.generate(); wrapper.unmount(); dispose = undefined
  workers[2].reply(handleGenerate(workers[2].messages[0]))
  expect(api.puzzle.value).toBeNull()
  expect(workers[2].terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
})
