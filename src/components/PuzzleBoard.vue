<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { cageEdges } from '../core/geometry.ts'
import type { Cage, CellValue, PuzzleDefinition } from '../core/types.ts'
import type { MoveDirection } from '../composables/usePuzzleGame.ts'
const props = defineProps<{
  puzzle: PuzzleDefinition
  values: readonly CellValue[]
  selectedCell: number | null
  duplicateCells: readonly number[]
  conflictingCages: readonly string[]
  disabled: boolean
}>()
const emit = defineEmits<{ select: [id: number]; input: [value: number | null]; move: [direction: MoveDirection] }>()
const grid = ref<HTMLElement | null>(null)
const symbols: Record<Cage['op'], string> = { '=': '', '+': '＋', '-': '−', '*': '×', '/': '÷' }
const cells = computed(() => Array.from({ length: props.puzzle.size ** 2 }, (_, id) => {
  const cage = props.puzzle.cages.find(c => c.cells.includes(id))!
  const duplicate = props.duplicateCells.includes(id), conflict = props.conflictingCages.includes(cage.id)
  return { id, cage, label: id === Math.min(...cage.cells) ? `${cage.target}${symbols[cage.op]}` : '', fixed: cage.op === '=', duplicate, conflict }
}))
const edges = computed(() => cageEdges(props.puzzle))
function select(id: number) {
  if (props.disabled) return
  grid.value?.focus({ preventScroll: true })
  emit('select', id)
}
function focusBoard() {
  if (props.selectedCell === null && !props.disabled) emit('select', cells.value.find(c => !c.fixed)?.id ?? 0)
}
function onKeydown(event: KeyboardEvent) {
  if (props.disabled || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
  const directions: Record<string, MoveDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
  if (directions[event.key]) { event.preventDefault(); emit('move', directions[event.key]) }
  else if (/^[1-9]$/.test(event.key) && Number(event.key) <= props.puzzle.size) { event.preventDefault(); emit('input', Number(event.key)) }
  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); emit('input', null) }
}
watch(() => props.selectedCell, async id => { if (id !== null) { await nextTick(); grid.value?.querySelector<HTMLElement>(`[data-cell="${id}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }) } })
</script>
<template>
  <div class="board-scroll" aria-label="盤面のスクロール領域">
  <div ref="grid" :class="['board', { 'large-board': puzzle.size >= 6 }]" :style="{ '--size': puzzle.size }" role="grid" tabindex="0" :aria-readonly="disabled" :aria-disabled="disabled" :aria-label="`${puzzle.size}行${puzzle.size}列の計算パズル`" aria-describedby="puzzle-instructions" :aria-activedescendant="selectedCell === null ? undefined : `puzzle-cell-${selectedCell}`" :aria-rowcount="puzzle.size" :aria-colcount="puzzle.size" @focus="focusBoard" @keydown="onKeydown">
    <div v-for="row in puzzle.size" :key="row" class="board-row" role="row">
      <div v-for="cell in cells.slice((row - 1) * puzzle.size, row * puzzle.size)" :id="`puzzle-cell-${cell.id}`" :key="cell.id" :data-cell="cell.id" class="puzzle-cell" :class="{ fixed: cell.fixed, selected: cell.id === selectedCell, invalid: cell.duplicate || cell.conflict }" role="gridcell" :aria-selected="cell.id === selectedCell" :aria-readonly="cell.fixed || disabled" :aria-invalid="cell.duplicate || cell.conflict" :aria-describedby="cell.duplicate || cell.conflict ? 'game-errors' : undefined" :aria-rowindex="row" :aria-colindex="cell.id % puzzle.size + 1" :aria-label="`${row}行${cell.id % puzzle.size + 1}列、ケージ条件${cell.cage.target}${symbols[cell.cage.op]}、${values[cell.id] === null ? '空欄' : `${cell.fixed ? '固定値' : '入力値'}${values[cell.id]}`}${cell.duplicate ? '、行または列に重複' : ''}${cell.conflict ? '、ケージ条件に矛盾' : ''}`" @click="select(cell.id)">
        <span v-if="cell.label" class="cage-label">{{ cell.label }}</span>
        <span v-if="values[cell.id] !== null" :class="cell.fixed ? 'fixed-value' : 'entered-value'">{{ values[cell.id] }}</span>
        <span v-if="cell.duplicate || cell.conflict" class="cell-warning" aria-hidden="true">!</span>
      </div>
    </div>
    <svg class="cage-overlay" :viewBox="`0 0 ${puzzle.size * 100} ${puzzle.size * 100}`" aria-hidden="true"><path :d="edges" fill="none" stroke="#334155" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" /></svg>
  </div>
  </div>
</template>
