// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { usePuzzleGame, type GameOptions } from '../../src/composables/usePuzzleGame.ts'
import { generatePuzzle } from '../../src/core/generator.ts'
import { settingsForSeed } from '../../src/core/types.ts'
import { editableIds, fixedIds, gamePuzzle, gameSolution } from '../game-fixture.ts'
let wrapper: VueWrapper | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers() })
function setup(options: GameOptions = {}) {
  const puzzle = shallowRef(gamePuzzle), blocked = ref(false)
  let game!: ReturnType<typeof usePuzzleGame>
  wrapper = mount(defineComponent({ setup() { game = usePuzzleGame(puzzle, blocked, () => Date.now(), options); return () => h('div') } }))
  return { game, puzzle, blocked }
}
it('undoes and redoes input, overwrite and deletion with exact boundaries', () => {
  const { game } = setup(), id = editableIds[0]
  expect(game.undo()).toBe(false); expect(game.redo()).toBe(false)
  game.selectCell(id); game.inputValue(2); game.inputValue(4); game.inputValue(null)
  for (const expected of [4, 2, null]) { expect(game.undo()).toBe(true); expect(game.values.value[id]).toBe(expected) }
  expect(game.canUndo.value).toBe(false); expect(game.undo()).toBe(false)
  for (const expected of [2, 4, null]) { expect(game.redo()).toBe(true); expect(game.values.value[id]).toBe(expected) }
  expect(game.canRedo.value).toBe(false); expect(game.redo()).toBe(false)
})
it('discards redo only on a real new edit, preserving it for no-op and invalid input', () => {
  const { game } = setup(), id = editableIds[0]
  game.selectCell(id); game.inputValue(2); game.inputValue(4); game.undo()
  expect(game.inputValue(2)).toBe(false); expect(game.inputValue(6)).toBe(false); expect(game.canRedo.value).toBe(true)
  game.inputValue(3); expect(game.canRedo.value).toBe(false); expect(game.redo()).toBe(false)
})
it('keeps fixed cells outside history even if currently selected when undo/redo is clicked', () => {
  const { game } = setup(); game.selectCell(editableIds[0]); game.inputValue(3)
  game.selectCell(fixedIds[0]); expect(game.inputValue(null)).toBe(false)
  game.undo(); expect(game.values.value[fixedIds[0]]).toBe(gameSolution[fixedIds[0]])
  expect(game.selectedCell.value).toBe(editableIds[0]); game.redo()
  expect(game.values.value[fixedIds[0]]).toBe(gameSolution[fixedIds[0]])
})
it('does not rewind the timer or stop it when undo empties all editable cells', () => {
  const { game } = setup(); game.selectCell(editableIds[0]); game.inputValue(2)
  vi.advanceTimersByTime(1500); game.undo(); expect(game.elapsedMs.value).toBe(1500)
  vi.advanceTimersByTime(1000); game.redo(); expect(game.snapshot().elapsedMs).toBe(2500)
  expect(game.status.value).toBe('playing')
})
it('candidate hints do not write digits, record history or disqualify best times', () => {
  const { game } = setup(); game.selectCell(editableIds[0]); const before = [...game.values.value]
  expect(game.showCandidates()).toBe(true); expect(game.hintOutcome.value?.kind).toBe('candidates')
  expect(game.values.value).toEqual(before); expect(game.canUndo.value).toBe(false); expect(game.answerUsed.value).toBe(false)
})
it('writes just the requested answer and keeps usage sticky through undo/redo', () => {
  const { game } = setup(), id = editableIds[0]
  game.selectCell(id); expect(game.revealAnswer()).toBe(true)
  expect(game.values.value[id]).toBe(gameSolution[id]); expect(game.answerUsed.value).toBe(true)
  expect(game.values.value.filter(v => v !== null)).toHaveLength(fixedIds.length + 1)
  game.undo(); expect(game.values.value[id]).toBeNull(); expect(game.answerUsed.value).toBe(true)
  game.redo(); expect(game.values.value[id]).toBe(gameSolution[id]); expect(game.answerUsed.value).toBe(true)
  expect(JSON.stringify(game.snapshot())).not.toMatch(/solution|witnesses/)
})
it('counts an explicitly revealed already-correct value as assisted without a duplicate history entry', () => {
  const { game } = setup(), id = editableIds[0]
  game.selectCell(id); game.inputValue(gameSolution[id]); game.revealAnswer(); game.undo()
  expect(game.values.value[id]).toBeNull(); expect(game.canUndo.value).toBe(false); expect(game.answerUsed.value).toBe(true)
})
it('does not mark or edit anything when the answer solver exceeds its budget', () => {
  const { game } = setup({ getAnswer: () => ({ status: 'budgetExceeded' }) })
  game.selectCell(editableIds[0]); const before = [...game.values.value]
  expect(game.revealAnswer()).toBe(false); expect(game.values.value).toEqual(before)
  expect(game.answerUsed.value).toBe(false); expect(game.canUndo.value).toBe(false)
  expect(game.hintOutcome.value).toMatchObject({ kind: 'unavailable' })
})
it('rejects hints on fixed cells, while blocked, and after clearing', () => {
  const { game, blocked } = setup(); game.selectCell(fixedIds[0]); expect(game.showCandidates()).toBe(false); expect(game.revealAnswer()).toBe(false)
  game.selectCell(editableIds[0]); blocked.value = true
  expect(game.revealAnswer()).toBe(false); expect(game.undo()).toBe(false); expect(game.redo()).toBe(false)
  blocked.value = false
  for (const id of editableIds) { game.selectCell(id); game.inputValue(gameSolution[id]) }
  expect(game.status.value).toBe('cleared'); expect(game.canUndo.value).toBe(false); expect(game.canRedo.value).toBe(false)
  expect(game.revealAnswer()).toBe(false)
})
it('clears history and answer usage for retry and a newly received puzzle', () => {
  const { game, puzzle } = setup(); game.selectCell(editableIds[0]); game.revealAnswer(); game.undo()
  game.retry(); expect(game.answerUsed.value).toBe(false); expect(game.canUndo.value).toBe(false); expect(game.canRedo.value).toBe(false)
  game.selectCell(editableIds[0]); game.revealAnswer()
  const generated = generatePuzzle(settingsForSeed(123)); if (generated.status !== 'success') throw new Error('Fixture failed')
  puzzle.value = generated.puzzle
  expect(game.answerUsed.value).toBe(false); expect(game.canUndo.value).toBe(false); expect(game.hintOutcome.value).toBeNull()
})
it('restores time as a saved duration plus new play time without double counting', () => {
  const { game } = setup(); const values = [...game.values.value]; values[editableIds[0]] = 3
  const progress = { values, elapsedMs: 2500, status: 'playing' as const, answerUsed: true }
  vi.advanceTimersByTime(60_000)
  expect(game.restore(progress)).toBe(true); expect(game.elapsedMs.value).toBe(2500)
  expect(game.answerUsed.value).toBe(true); expect(game.canUndo.value).toBe(false); expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(1200); expect(game.snapshot().elapsedMs).toBe(3700)
  game.restore(progress); expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(500); expect(game.elapsedMs.value).toBe(3000)
})
it('never treats a restored clear as a new completion or restarts its timer', () => {
  const { game } = setup()
  expect(game.restore({ values: gameSolution, elapsedMs: 1234, status: 'cleared', answerUsed: false })).toBe(true)
  expect(game.completion.value).toBeNull(); vi.advanceTimersByTime(5000)
  expect(game.elapsedMs.value).toBe(1234); expect(vi.getTimerCount()).toBe(0)
})
it('rejects bad restored fixed values without changing the current game', () => {
  const { game } = setup(), before = game.snapshot(), values = [...game.values.value]; values[fixedIds[0]] = null
  expect(game.restore({ ...before, values })).toBe(false); expect(game.snapshot()).toEqual(before)
})
it('marks a final revealed digit before publishing the completion event', () => {
  const { game } = setup()
  for (const id of editableIds.slice(0, -1)) { game.selectCell(id); game.inputValue(gameSolution[id]) }
  game.selectCell(editableIds[editableIds.length - 1]); game.revealAnswer()
  expect(game.status.value).toBe('cleared'); expect(game.completion.value?.answerUsed).toBe(true)
})

it('pauses a hidden-page clock and safely resumes it without duplicate timers', () => {
  const { game } = setup(); game.selectCell(editableIds[0]); game.inputValue(2); vi.advanceTimersByTime(1700)
  game.pauseClock(); vi.advanceTimersByTime(60_000); expect(game.snapshot().elapsedMs).toBe(1700)
  game.resumeClock(); game.resumeClock(); expect(vi.getTimerCount()).toBe(1)
  vi.advanceTimersByTime(1000); expect(game.elapsedMs.value).toBe(2700)
})
