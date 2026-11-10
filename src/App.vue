<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import PuzzleBoard from './components/PuzzleBoard.vue'
import NumberPad from './components/NumberPad.vue'
import GameTools from './components/GameTools.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { usePuzzleSettings } from './composables/usePuzzleSettings.ts'
import { useGamePersistence } from './composables/useGamePersistence.ts'
import { latestSettings } from './core/types.ts'
import { formatTime } from './core/progress.ts'
import { usePuzzleGenerator } from './composables/usePuzzleGenerator.ts'
import { usePuzzleGame } from './composables/usePuzzleGame.ts'
const { puzzle, state, error, notice, progress, generate, cancel, verifyPuzzle, restorePuzzle } = usePuzzleGenerator()
const { draft, edited, errors: settingsErrors, read, randomize, adoptInitial } = usePuzzleSettings()
function startNew() { const requested = read(); if (requested) generate(requested) }
function startInitial() {
  try { const seed = crypto.getRandomValues(new Uint32Array(1))[0]; if (!edited.value) draft.seed = String(seed); generate(latestSettings(seed)) }
  catch { generate({ ...latestSettings(0), seed: NaN }) }
}
const operatorLabels = { '+': '＋', '-': '−', '*': '×', '/': '÷' } as const
const copyMessage = ref('')
async function copySeed() {
  if (!puzzle.value) return
  try { await navigator.clipboard.writeText(String(puzzle.value.seed)); copyMessage.value = 'シードをコピーしました。' }
  catch { copyMessage.value = 'コピーできませんでした。表示中のシードを手動でコピーしてください。' }
}
watch(puzzle, value => { copyMessage.value = ''; if (value) adoptInitial(value) })
const game = usePuzzleGame(puzzle, computed(() => state.value === 'generating'))
const { values, selectedCell, status, check, locked, canInput, formattedTime, selectCell, moveSelection, inputValue, retry, canUndo, canRedo, undo, redo, showCandidates, revealAnswer, hintOutcome, answerUsed } = game
const { bestMs, restorationMessage, storageMessage, recordMessage, restoreSaved } = useGamePersistence(puzzle, game, restorePuzzle, undefined, { verifyLarge: verifyPuzzle, onFailure: startInitial })
const selectedDescription = computed(() => {
  if (status.value === 'cleared') return 'クリア済みのため、数字は編集できません。'
  if (selectedCell.value === null) return '入力するマスを選択してください。'
  const id = selectedCell.value
  return `${Math.floor(id / (puzzle.value?.size ?? 5)) + 1}行${id % (puzzle.value?.size ?? 5) + 1}列を選択中${puzzle.value?.cages.some(c => c.op === '=' && c.cells[0] === id) ? '（固定値・編集できません）' : ''}`
})
const warnings = computed(() => {
  const messages: string[] = []
  if (check.value.duplicateCells.length) messages.push('同じ行・列に数字の重複があります。「!」の付いたマスを確認してください。')
  for (const cage of puzzle.value?.cages ?? []) if (check.value.conflictingCages.includes(cage.id)) {
    const first = Math.min(...cage.cells)
    messages.push(`${Math.floor(first / (puzzle.value?.size ?? 5)) + 1}行${first % (puzzle.value?.size ?? 5) + 1}列からのケージは、現在の入力では計算条件を満たせません。`)
  }
  return messages
})
onMounted(() => { if (!restoreSaved()) startInitial() })
</script>
<template>
  <main class="app">
    <header class="header"><span class="brand" aria-hidden="true">＋</span><div><p class="eyebrow">CALCUDOKU</p><h1>計算パズル</h1></div></header>
    <p class="intro">行と列に1〜{{ puzzle?.size ?? 5 }}をひとつずつ。ケージの計算条件を手がかりに。</p>
    <SettingsPanel v-model:size="draft.size" v-model:difficulty="draft.difficulty" v-model:operators="draft.operators" v-model:seed="draft.seed" v-model:version="draft.generatorVersion" :busy="state === 'generating'" :errors="settingsErrors" @edit="edited = true" @generate="startNew" @cancel="cancel" @random="randomize()" />
    <section class="panel game-panel" aria-label="計算パズルの盤面" :aria-busy="state === 'generating'">
      <div class="board-heading"><h2>現在の問題<span v-if="puzzle"> · {{ puzzle.size }}×{{ puzzle.size }} / {{ puzzle.difficulty }}{{ puzzle.generatorVersion === 'calcudoku-v1' ? '（旧評価）' : '' }}</span></h2><span v-if="puzzle" class="verified">✓ 一意解を確認済み</span></div>
      <p v-if="puzzle" class="applied-operators">この問題の許可演算：{{ puzzle.operators.map(op => operatorLabels[op]).join(' ') }}</p>
      <p class="generation-status" role="status">{{ state === 'generating' ? `一意解を確認しています… ${progress?.attempt ?? 0}件目の候補 · ${progress?.stage === 'difficulty' ? '難易度を評価中' : progress?.stage === 'cages' ? 'ケージを作成中' : '制約を検証中'}` : puzzle ? '各ケージの左上の数字と演算子が計算条件です。' : '' }}</p>
      <p v-if="notice" class="generation-notice" role="status">{{ notice }}</p>
      <p v-if="restorationMessage" class="restoration-message" role="status">{{ restorationMessage }}</p>
      <p v-if="storageMessage" class="storage-message" role="status">{{ storageMessage }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <template v-if="puzzle">
        <div class="game-stats"><span>{{ status === 'cleared' ? 'クリア時間' : '経過時間' }} <strong class="elapsed-time">{{ formattedTime }}</strong></span><span>{{ status === 'cleared' ? '✓ CLEAR' : status === 'playing' ? 'PLAY' : 'READY' }}</span></div>
        <div class="best-record"><span>この問題のベスト：<strong>{{ bestMs === null ? 'まだ記録がありません' : formatTime(bestMs) }}</strong></span><span v-if="answerUsed" class="answer-used">! 答え使用済み・記録対象外</span></div>
        <p id="puzzle-instructions" class="input-instructions">マスを選んで1〜{{ puzzle.size }}を入力。矢印キーで移動、Delete / Backspaceで削除できます。スマートフォンでは数字パッドを使ってください。</p>
        <p v-if="puzzle.size >= 6" class="board-scroll-note">↔ 盤面を左右にスクロールして全体を確認できます。</p>
        <PuzzleBoard :puzzle="puzzle" :values="values" :selected-cell="selectedCell" :duplicate-cells="check.duplicateCells" :conflicting-cages="check.conflictingCages" :disabled="locked" @select="selectCell" @input="inputValue" @move="moveSelection" />
        <p class="selection-description">{{ selectedDescription }}</p>
        <NumberPad :size="puzzle.size" :disabled="!canInput" :can-delete="selectedCell !== null && values[selectedCell] !== null" @input="inputValue" />
        <GameTools :can-undo="canUndo" :can-redo="canRedo" :can-hint="canInput" :outcome="hintOutcome" @undo="undo" @redo="redo" @candidates="showCandidates" @answer="revealAnswer" />
        <div v-if="warnings.length" id="game-errors" class="game-errors" role="alert"><strong>! 入力を確認してください</strong><ul><li v-for="message in warnings" :key="message">{{ message }}</li></ul></div>
        <div v-if="status === 'cleared'" class="clear-message" role="status"><strong>✓ クリア！ おめでとうございます</strong><p>すべての行・列とケージの条件を満たしました。クリア時間：{{ formattedTime }}</p><p v-if="recordMessage" class="record-message">{{ recordMessage }}</p></div>
        <button class="retry-button" :class="status === 'cleared' ? 'primary' : 'secondary'" :disabled="state === 'generating'" @click="retry">同じ問題で再挑戦 <span aria-hidden="true">↻</span></button>
        <div class="problem-meta"><span>シード：{{ puzzle.seed }}</span><button class="secondary copy-seed" aria-label="現在のシードをコピー" @click="copySeed">コピー</button><span>{{ puzzle.generatorVersion }}</span><span>固定値：{{ puzzle.cages.filter(c => c.op === '=').length }} マス</span></div>
        <p v-if="copyMessage" class="copy-message" role="status">{{ copyMessage }}</p>
      </template>
      <div v-else class="board-placeholder">{{ state === 'failed' ? '未確認の問題は表示しません。新しい問題を生成してください。' : state === 'generating' ? '問題を準備しています…' : '新しい問題を生成してください。' }}</div>
    </section>
    <section class="panel rules"><h2>ルール・操作方法</h2><p>各行・各列に1〜{{ puzzle?.size ?? 5 }}を重複なく配置します。太い線で囲まれたケージの数字で、左上の計算条件を満たします。</p><p>引き算・割り算は2マスで、大きい数字から小さい数字を引く・割る条件です。演算子がないケージは固定値で、編集できません。</p><p>「!」は数字の重複や計算条件の矛盾を示します。未完成ケージは、成立する組合せが残っていれば警告しません。タイマーは最初の数字入力から始まります。Undo・Redoでは時間と答えの使用履歴は戻りません。</p><p>途中状態はこのブラウザへ自動保存します。再読み込みで続きから再開でき、閉じている間の時間は加算しません。再挑戦と新しい問題では履歴をリセットします。</p></section>
    <footer>CALCUDOKU · 計算を手がかりに、ひとマスずつ。</footer>
  </main>
</template>
