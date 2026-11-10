import { computed, onBeforeUnmount, readonly, ref, shallowRef, watch, type Ref } from 'vue'
import { checkConstraints, isComplete } from '../core/constraints.ts'
import { cellCandidates, type CandidateHint } from '../core/hints.ts'
import { formatTime, validProgress, type GameProgress, type GameStatus } from '../core/progress.ts'
import { SIZE, type CellValue, type Digit, type PuzzleDefinition } from '../core/types.ts'
import { getCellAnswer } from '../services/cellAnswer.ts'

export type MoveDirection = 'up' | 'down' | 'left' | 'right'
interface Entry { id: number; before: CellValue; after: CellValue }
interface Completion { problemId: string; elapsedMs: number; answerUsed: boolean }
export type HintOutcome = ({ kind: 'candidates' } & CandidateHint) | { kind: 'answer' | 'unavailable'; message: string }
export interface GameOptions { getAnswer?: typeof getCellAnswer }
export function usePuzzleGame(puzzle: Readonly<Ref<PuzzleDefinition | null>>, blocked: Readonly<Ref<boolean>> = ref(false), now: () => number = () => performance.now(), options: GameOptions = {}) {
  const size = computed(() => puzzle.value?.size ?? SIZE)
  const values = ref<CellValue[]>(Array<CellValue>(size.value * size.value).fill(null))
  const selectedCell = ref<number | null>(null)
  const status = ref<GameStatus>('ready')
  const elapsedMs = ref(0), answerUsed = ref(false), revision = ref(0), round = ref(0)
  const past = shallowRef<Entry[]>([]), future = shallowRef<Entry[]>([])
  const hintOutcome = shallowRef<HintOutcome | null>(null), completion = shallowRef<Completion | null>(null)
  const fixedCells = computed(() => new Set(puzzle.value?.cages.filter(c => c.op === '=').map(c => c.cells[0]) ?? []))
  const check = computed(() => puzzle.value ? checkConstraints(puzzle.value, values.value) : { valid: true, duplicateCells: [], conflictingCages: [] })
  const locked = computed(() => !puzzle.value || blocked.value || status.value === 'cleared')
  const canInput = computed(() => !locked.value && selectedCell.value !== null && !fixedCells.value.has(selectedCell.value))
  const canUndo = computed(() => !locked.value && past.value.length > 0)
  const canRedo = computed(() => !locked.value && future.value.length > 0)
  const formattedTime = computed(() => formatTime(elapsedMs.value))
  let startedAt: number | null = null, accumulatedMs = 0
  let timer: ReturnType<typeof setInterval> | undefined
  function updateTime() { if (startedAt !== null) elapsedMs.value = accumulatedMs + Math.max(0, now() - startedAt) }
  function stopTimer() { updateTime(); clearInterval(timer); timer = undefined; accumulatedMs = elapsedMs.value; startedAt = null }
  function startTimer() { if (startedAt !== null) return; startedAt = now(); timer = setInterval(updateTime, 100) }
  function clearHistory() { past.value = []; future.value = []; hintOutcome.value = null; completion.value = null }
  function reset() {
    stopTimer(); accumulatedMs = 0; elapsedMs.value = 0
    values.value = Array<CellValue>(size.value * size.value).fill(null)
    for (const cage of puzzle.value?.cages ?? []) if (cage.op === '=') values.value[cage.cells[0]] = cage.target
    selectedCell.value = null; status.value = 'ready'; answerUsed.value = false
    clearHistory(); round.value++; revision.value++
  }
  function selectCell(id: number) {
    if (locked.value || !Number.isInteger(id) || id < 0 || id >= size.value * size.value) return false
    if (selectedCell.value !== id) hintOutcome.value = null
    selectedCell.value = id
    return true
  }
  function moveSelection(direction: MoveDirection) {
    if (locked.value) return false
    if (selectedCell.value === null) return selectCell(0)
    const id = selectedCell.value, row = Math.floor(id / size.value), col = id % size.value
    const next = direction === 'up' ? (row > 0 ? id - size.value : id)
      : direction === 'down' ? (row < size.value - 1 ? id + size.value : id)
      : direction === 'left' ? (col > 0 ? id - 1 : id) : (col < size.value - 1 ? id + 1 : id)
    return selectCell(next)
  }
  function checkClear() {
    if (puzzle.value && isComplete(puzzle.value, values.value)) {
      stopTimer(); status.value = 'cleared'
      completion.value = { problemId: puzzle.value.id, elapsedMs: elapsedMs.value, answerUsed: answerUsed.value }
    }
  }
  // Keyboard, keypad and explicit answer reveal all use this mutation boundary.
  function inputValue(value: unknown) {
    if (!canInput.value || (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > size.value))) return false
    const id = selectedCell.value!
    if (values.value[id] === value) return false
    if (status.value === 'ready') { status.value = 'playing'; startTimer() }
    past.value = [...past.value, { id, before: values.value[id], after: value as CellValue }]; future.value = []
    values.value[id] = value as Digit | null; hintOutcome.value = null
    checkClear(); revision.value++
    return true
  }
  function undo() {
    if (!canUndo.value) return false
    const entry = past.value[past.value.length - 1]
    if (fixedCells.value.has(entry.id)) return false
    past.value = past.value.slice(0, -1); future.value = [...future.value, entry]
    values.value[entry.id] = entry.before; selectedCell.value = entry.id; hintOutcome.value = null; revision.value++
    return true
  }
  function redo() {
    if (!canRedo.value) return false
    const entry = future.value[future.value.length - 1]
    if (fixedCells.value.has(entry.id)) return false
    future.value = future.value.slice(0, -1); past.value = [...past.value, entry]
    values.value[entry.id] = entry.after; selectedCell.value = entry.id; hintOutcome.value = null
    checkClear(); revision.value++
    return true
  }
  function showCandidates() {
    if (!canInput.value || !puzzle.value) return false
    hintOutcome.value = { kind: 'candidates', ...cellCandidates(puzzle.value, values.value, selectedCell.value!) }
    return true
  }
  function revealAnswer() {
    if (!canInput.value || !puzzle.value) return false
    const answer = (options.getAnswer ?? getCellAnswer)(puzzle.value, selectedCell.value!)
    if (answer.status !== 'available') {
      hintOutcome.value = { kind: 'unavailable', message: answer.status === 'budgetExceeded' ? '探索上限に達したため、答えは利用できません。数字は変更していません。' : '一意解を確認できないため、答えは利用できません。' }
      return false
    }
    // Mark BEFORE applying a possibly final digit; undo must never clear this.
    answerUsed.value = true
    inputValue(answer.value); revision.value++
    hintOutcome.value = { kind: 'answer', message: '選択したマスに正しい数字を入力しました。この回はベスト記録の対象外です。' }
    return true
  }
  function pauseClock() { stopTimer() }
  function resumeClock() { if (status.value === 'playing') startTimer() }
  function retry() { if (!puzzle.value || blocked.value) return false; reset(); return true }
  function snapshot(): GameProgress {
    updateTime()
    return { values: [...values.value], elapsedMs: elapsedMs.value, status: status.value, answerUsed: answerUsed.value }
  }
  function restore(progress: GameProgress) {
    if (!puzzle.value || blocked.value || !validProgress(puzzle.value, progress)) return false
    stopTimer(); values.value = [...progress.values]; elapsedMs.value = progress.elapsedMs; accumulatedMs = progress.elapsedMs
    status.value = progress.status; answerUsed.value = progress.answerUsed; selectedCell.value = null; clearHistory()
    if (status.value === 'playing') startTimer()
    revision.value++
    return true
  }
  watch(puzzle, reset, { immediate: true, flush: 'sync' })
  onBeforeUnmount(stopTimer)
  return {
    values: readonly(values), selectedCell: readonly(selectedCell), status: readonly(status), elapsedMs: readonly(elapsedMs),
    answerUsed: readonly(answerUsed), revision: readonly(revision), round: readonly(round), hintOutcome: readonly(hintOutcome), completion: readonly(completion),
    size, fixedCells, check, locked, canInput, canUndo, canRedo, formattedTime, selectCell, moveSelection, inputValue, undo, redo, showCandidates, revealAnswer, retry, snapshot, restore, pauseClock, resumeClock,
  }
}
