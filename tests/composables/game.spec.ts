// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref, shallowRef } from 'vue'
import { usePuzzleGame } from '../../src/composables/usePuzzleGame.ts'
import { generatePuzzle } from '../../src/core/generator.ts'
import { settingsForSeed, type PuzzleDefinition } from '../../src/core/types.ts'
import { editableIds, fixedIds, gamePuzzle, gameSolution } from '../game-fixture.ts'
let wrapper: VueWrapper | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers() })
function setup(initial: PuzzleDefinition | null = gamePuzzle) {
  const puzzle = shallowRef(initial), blocked = ref(false)
  let game!: ReturnType<typeof usePuzzleGame>
  wrapper = mount(defineComponent({ setup() { game = usePuzzleGame(puzzle, blocked, () => Date.now()); return () => h('div') } }))
  return { game, puzzle, blocked }
}
function complete(game: ReturnType<typeof usePuzzleGame>) {
  for (const id of editableIds) { game.selectCell(id); game.inputValue(gameSolution[id]) }
}
it('initializes only fixed values without selecting a cell or starting the timer', () => {
  const { game } = setup()
  expect(game.values.value.filter(v => v !== null)).toHaveLength(fixedIds.length)
  for (const id of fixedIds) expect(game.values.value[id]).toBe(gameSolution[id])
  expect(game.selectedCell.value).toBeNull(); expect(game.canInput.value).toBe(false)
  expect(game.status.value).toBe('ready'); expect(game.check.value.valid).toBe(true)
  vi.advanceTimersByTime(3000); expect(game.elapsedMs.value).toBe(0)
})
it('inputs and deletes numbers through a shared mutation, starting time on the first real edit', () => {
  const { game } = setup(), id = editableIds[0]
  expect(game.inputValue(2)).toBe(false)
  game.selectCell(id); expect(game.inputValue(null)).toBe(false)
  expect(game.inputValue(2)).toBe(true); expect(game.values.value[id]).toBe(2)
  vi.advanceTimersByTime(2350)
  expect(game.formattedTime.value).toBe('00:02.3')
  expect(game.inputValue(2)).toBe(false)
  expect(game.inputValue(null)).toBe(true); expect(game.values.value[id]).toBeNull()
  expect(game.status.value).toBe('playing')
})
it.each([0, 6, -1, NaN, Infinity, 1.5, '2', undefined, {}, []])('rejects invalid digit %j without starting time', value => {
  const { game } = setup(); game.selectCell(editableIds[0])
  expect(game.inputValue(value)).toBe(false)
  expect(game.values.value[editableIds[0]]).toBeNull(); expect(game.status.value).toBe('ready')
})
it('does not edit or delete fixed cells', () => {
  const { game } = setup()
  expect(fixedIds.length).toBeGreaterThan(0)
  for (const id of fixedIds) {
    game.selectCell(id); expect(game.canInput.value).toBe(false)
    expect(game.inputValue(1)).toBe(false); expect(game.inputValue(null)).toBe(false)
    expect(game.values.value[id]).toBe(gameSolution[id])
  }
  expect(game.status.value).toBe('ready')
})
it('moves selection orthogonally with clamped boundaries and rejects invalid cell IDs', () => {
  const { game } = setup()
  for (const id of [-1, 25, 1.5, NaN]) expect(game.selectCell(id)).toBe(false)
  game.selectCell(0); game.moveSelection('left'); game.moveSelection('up'); expect(game.selectedCell.value).toBe(0)
  game.moveSelection('right'); game.moveSelection('down'); expect(game.selectedCell.value).toBe(6)
  game.selectCell(24); game.moveSelection('right'); game.moveSelection('down'); expect(game.selectedCell.value).toBe(24)
})
it('clears only a correct filled answer, freezes time and rejects every later edit', () => {
  const { game } = setup(); game.selectCell(editableIds[0]); game.inputValue(gameSolution[editableIds[0]])
  vi.advanceTimersByTime(4321); complete(game)
  expect(game.status.value).toBe('cleared'); expect(game.check.value.valid).toBe(true)
  expect(game.values.value).toEqual(gameSolution); expect(game.elapsedMs.value).toBe(4321)
  const before = [...game.values.value]
  expect(game.inputValue(null)).toBe(false); expect(game.selectCell(editableIds[0])).toBe(false)
  vi.advanceTimersByTime(10000); expect(game.elapsedMs.value).toBe(4321); expect(game.values.value).toEqual(before)
  expect(vi.getTimerCount()).toBe(0)
})
it('never clears an incomplete or an incorrect filled answer', () => {
  const { game } = setup()
  for (const id of editableIds) { game.selectCell(id); game.inputValue(1) }
  expect(game.values.value.every(v => v !== null)).toBe(true)
  expect(game.check.value.valid).toBe(false); expect(game.status.value).toBe('playing')
  expect(game.check.value.duplicateCells.length).toBeGreaterThan(0)
})
it('resets input, selection, errors and timer while preserving the exact same puzzle on retry', () => {
  const { game, puzzle } = setup(), definition = JSON.stringify(puzzle.value)
  for (const id of editableIds.slice(0, 10)) { game.selectCell(id); game.inputValue(1) }
  vi.advanceTimersByTime(2100); expect(game.check.value.valid).toBe(false)
  expect(game.retry()).toBe(true)
  expect(puzzle.value).toBe(gamePuzzle); expect(JSON.stringify(puzzle.value)).toBe(definition)
  expect(game.selectedCell.value).toBeNull(); expect(game.elapsedMs.value).toBe(0)
  expect(game.status.value).toBe('ready'); expect(game.check.value.valid).toBe(true)
  expect(game.values.value.filter(v => v !== null)).toHaveLength(fixedIds.length)
  expect(vi.getTimerCount()).toBe(0)
})
it('can retry after clearing and start a fresh timer', () => {
  const { game } = setup(); complete(game); expect(game.status.value).toBe('cleared')
  game.retry(); game.selectCell(editableIds[0]); expect(game.inputValue(3)).toBe(true)
  vi.advanceTimersByTime(1200); expect(game.elapsedMs.value).toBe(1200); expect(game.status.value).toBe('playing')
})
it('blocks operations while generating and resets only when a new puzzle is actually received', () => {
  const { game, puzzle, blocked } = setup(); const id = editableIds[0]
  game.selectCell(id); game.inputValue(2); blocked.value = true
  expect(game.inputValue(3)).toBe(false); expect(game.selectCell(id + 1)).toBe(false); expect(game.retry()).toBe(false)
  blocked.value = false // A failed generation leaves the puzzle reference intact.
  expect(game.values.value[id]).toBe(2); expect(game.selectedCell.value).toBe(id)
  const result = generatePuzzle(settingsForSeed(123))
  if (result.status !== 'success') throw new Error('Fixture failed')
  puzzle.value = result.puzzle
  expect(game.selectedCell.value).toBeNull(); expect(game.elapsedMs.value).toBe(0); expect(game.status.value).toBe('ready')
  for (const cage of result.puzzle.cages) for (const cell of cage.cells) expect(game.values.value[cell]).toBe(cage.op === '=' ? cage.target : null)
})
it('rejects operations without a puzzle and stops its timer on unmount', () => {
  const { game, puzzle } = setup(null)
  expect(game.retry()).toBe(false); expect(game.selectCell(0)).toBe(false); expect(game.inputValue(1)).toBe(false)
  puzzle.value = gamePuzzle; game.selectCell(editableIds[0]); game.inputValue(1)
  expect(vi.getTimerCount()).toBe(1)
  wrapper?.unmount(); wrapper = undefined; expect(vi.getTimerCount()).toBe(0)
})
