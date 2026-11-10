import { beforeEach, expect, it, vi } from 'vitest'
import { createGameStorage, SESSION_KEY, BEST_KEY, canonicalPuzzle, type SavedSession, type StoragePort } from '../../src/services/gameStorage.ts'
import { validProgress, type GameProgress } from '../../src/core/progress.ts'
import { solvePuzzle } from '../../src/core/solver.ts'
import type { CellValue } from '../../src/core/types.ts'
import { gamePuzzle, gameSolution, editableIds, fixedIds } from '../game-fixture.ts'
import { multiplePuzzle } from '../fixtures.ts'
class MemoryStorage implements StoragePort {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}
let memory: MemoryStorage
beforeEach(() => { memory = new MemoryStorage() })
function fresh(): SavedSession {
  const values: GameProgress['values'] = gameSolution.map((v, id) => fixedIds.includes(id) ? v : null)
  return { version: 1, puzzle: structuredClone(gamePuzzle), progress: { values, elapsedMs: 0, status: 'ready', answerUsed: false } }
}
function load(data: unknown) { memory.setItem(SESSION_KEY, JSON.stringify(data)); return createGameStorage(() => memory).loadSession() }
it('stores and restores a verified game with only public problem and player progress fields', () => {
  const service = createGameStorage(() => memory), data = fresh()
  expect(service.loadSession()).toEqual({ status: 'empty' })
  expect(service.saveSession(data.puzzle, data.progress)).toBe(true)
  expect(service.loadSession()).toEqual({ status: 'restored', session: data })
  expect(memory.getItem(SESSION_KEY)).not.toMatch(/solution|witnesses|past|future/)
})
it('restores incomplete contradictory player entries for correction and preserves answer usage', () => {
  const data = fresh(); data.progress = { ...data.progress, values: gameSolution.map((v, id) => fixedIds.includes(id) ? v : 1), elapsedMs: 2345.5, status: 'playing', answerUsed: true }
  expect(load(data)).toEqual({ status: 'restored', session: data })
})
it.each([
  ['version', (d: SavedSession) => ({ ...d, version: 2 })],
  ['ID', (d: SavedSession) => ({ ...d, puzzle: { ...d.puzzle, id: 'wrong' } })],
  ['seed/identity', (d: SavedSession) => ({ ...d, puzzle: { ...d.puzzle, seed: 123 } })],
  ['range', (d: SavedSession) => ({ ...d, progress: { ...d.progress, values: [...d.progress.values.slice(0, 24), 6] } })],
  ['length', (d: SavedSession) => ({ ...d, progress: { ...d.progress, values: [] } })],
  ['numeric string', (d: SavedSession) => ({ ...d, progress: { ...d.progress, values: d.progress.values.map((v, id) => id === 0 ? '2' : v) } })],
  ['negative time', (d: SavedSession) => ({ ...d, progress: { ...d.progress, elapsedMs: -1 } })],
  ['nonfinite time', (d: SavedSession) => ({ ...d, progress: { ...d.progress, elapsedMs: Infinity } })],
  ['hint type', (d: SavedSession) => ({ ...d, progress: { ...d.progress, answerUsed: 'false' } })],
  ['status', (d: SavedSession) => ({ ...d, progress: { ...d.progress, status: 'invalid' } })],
  ['false clear', (d: SavedSession) => ({ ...d, progress: { ...d.progress, status: 'cleared' } })],
  ['fixed value', (d: SavedSession) => ({ ...d, progress: { ...d.progress, values: d.progress.values.map((v, id) => id === fixedIds[0] ? null : v) } })],
  ['hidden answer', (d: SavedSession) => ({ ...d, puzzle: { ...d.puzzle, solution: gameSolution } })],
  ['extra progress', (d: SavedSession) => ({ ...d, progress: { ...d.progress, solution: gameSolution } })],
  ['cage overlap', (d: SavedSession) => ({ ...d, puzzle: { ...d.puzzle, cages: [...d.puzzle.cages, d.puzzle.cages[0]] } })],
  ['cage target', (d: SavedSession) => ({ ...d, puzzle: { ...d.puzzle, cages: d.puzzle.cages.map((c, i) => i === 0 ? { ...c, target: 999 } : c) } })],
] as const)('rejects corrupt or modified session: %s', (_, mutate) => {
  expect(load(mutate(fresh())).status).toBe('invalid')
})
it('rejects invalid JSON and oversized data without throwing', () => {
  for (const text of ['{', 'null', '[]', 'x'.repeat(64001)]) { memory.setItem(SESSION_KEY, text); expect(createGameStorage(() => memory).loadSession().status).toBe('invalid') }
})
it('rechecks uniqueness rather than trusting a saved unique marker', () => {
  const data = fresh(); data.puzzle = { ...data.puzzle, cages: multiplePuzzle.cages }
  data.puzzle = { ...data.puzzle, id: JSON.stringify([data.puzzle.generatorVersion, 5, 'normal', data.puzzle.operators, data.puzzle.seed, data.puzzle.cages.map(c => [c.cells, c.op, c.target])]) }
  data.progress = { ...data.progress, values: Array<CellValue>(25).fill(null) }
  expect(canonicalPuzzle(data.puzzle)).toBe(true); expect(validProgress(data.puzzle, data.progress)).toBe(true)
  expect(load(data).status).toBe('invalid')
})
it('refuses restore when the verification budget is exhausted', () => {
  const data = fresh(); memory.setItem(SESSION_KEY, JSON.stringify(data))
  const service = createGameStorage(() => memory, p => solvePuzzle(p, { maxWork: 0 }).status === 'unique')
  expect(service.loadSession().status).toBe('invalid')
})
it('whitelists serialized fields and never adds solver answers', () => {
  const service = createGameStorage(() => memory), data = fresh()
  expect(service.saveSession({ ...data.puzzle, solution: gameSolution } as typeof gamePuzzle, { ...data.progress, solution: gameSolution } as GameProgress)).toBe(true)
  expect(memory.getItem(SESSION_KEY)).not.toMatch(/solution|witnesses/)
})
it('accepts a legitimately completed player board but rejects inconsistent status/time', () => {
  const data = fresh(); data.progress = { values: gameSolution, elapsedMs: 3000, status: 'cleared', answerUsed: false }
  expect(load(data).status).toBe('restored')
  expect(load({ ...data, progress: { ...data.progress, status: 'playing' } }).status).toBe('invalid')
  expect(load({ ...fresh(), progress: { ...fresh().progress, elapsedMs: 1000 } }).status).toBe('invalid')
})
it('records only the fastest time for the exact problem ID', () => {
  const service = createGameStorage(() => memory), id = gamePuzzle.id
  expect(service.recordBest(id, 8000, false).status).toBe('updated')
  expect(service.recordBest(id, 9000, false)).toEqual({ status: 'unchanged', value: 8000 })
  expect(service.recordBest(id, 8000, false).status).toBe('unchanged')
  expect(service.recordBest(id, 5000, false)).toEqual({ status: 'updated', value: 5000 })
  service.recordBest('another-problem', 100, false)
  expect(service.loadBest(id).value).toBe(5000)
  expect(service.loadBest('missing').value).toBeNull()
})
it('does not write assisted, invalid-time or invalid-ID best records', () => {
  const service = createGameStorage(() => memory), write = vi.spyOn(memory, 'setItem')
  for (const args of [[gamePuzzle.id, 1, true], [gamePuzzle.id, -1, false], [gamePuzzle.id, NaN, false], ['', 1, false]] as const) expect(service.recordBest(args[0], args[1], args[2]).status).toBe('excluded')
  expect(write).not.toHaveBeenCalled(); expect(service.loadBest(gamePuzzle.id).value).toBeNull()
})
it.each(['{', '{"version":2,"records":[]}', '{"version":1,"records":[{"problemId":"x","elapsedMs":"1"}]}', '{"version":1,"records":[{"problemId":"x","elapsedMs":-1}]}'])('ignores corrupt best records: %s', text => {
  memory.setItem(BEST_KEY, text); const service = createGameStorage(() => memory)
  expect(service.loadBest('x').status).toBe('invalid')
  expect(service.recordBest(gamePuzzle.id, 5000, false).status).toBe('updated')
  expect(service.loadBest(gamePuzzle.id).value).toBe(5000)
})
it('handles read denial and provider denial safely', () => {
  for (const service of [createGameStorage(() => { throw new Error('denied') }), createGameStorage(() => ({ ...memory, getItem() { throw new Error('read denied') }, setItem() {}, removeItem() {} }))]) {
    expect(service.loadSession().status).toBe('unavailable'); expect(service.loadBest(gamePuzzle.id).status).toBe('unavailable')
    expect(service.recordBest(gamePuzzle.id, 1, false).status).toBe('unavailable')
  }
})
it('handles quota/write denial without destroying an existing best record', () => {
  const service = createGameStorage(() => memory), data = fresh()
  service.recordBest(gamePuzzle.id, 8000, false)
  vi.spyOn(memory, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
  expect(service.saveSession(data.puzzle, data.progress)).toBe(false)
  expect(service.recordBest(gamePuzzle.id, 100, false)).toEqual({ status: 'unavailable', value: 8000 })
  expect(service.loadBest(gamePuzzle.id).value).toBe(8000)
})
it('rejects invalid snapshots at write time', () => {
  const data = fresh(), values = [...data.progress.values]; values[editableIds[0]] = 6 as CellValue
  expect(createGameStorage(() => memory).saveSession(data.puzzle, { ...data.progress, values })).toBe(false)
  expect(memory.getItem(SESSION_KEY)).toBeNull()
})

it('rejects an unsatisfiable canonical-looking stored problem', () => {
  const data = fresh(); data.puzzle = { ...data.puzzle, cages: multiplePuzzle.cages.map((c, i) => c.op === '+' && i === 0 ? { ...c, target: 99 } : c) }
  data.puzzle = { ...data.puzzle, id: JSON.stringify([data.puzzle.generatorVersion, 5, 'normal', data.puzzle.operators, data.puzzle.seed, data.puzzle.cages.map(c => [c.cells, c.op, c.target])]) }
  data.progress = { ...data.progress, values: Array<CellValue>(25).fill(null) }
  expect(canonicalPuzzle(data.puzzle)).toBe(true); expect(validProgress(data.puzzle, data.progress)).toBe(true)
  expect(load(data).status).toBe('invalid')
})
