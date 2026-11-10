import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { createGameStorage, type GameStorage, type SavedSession } from '../services/gameStorage.ts'
import type { PuzzleDefinition } from '../core/types.ts'
import type { usePuzzleGame } from './usePuzzleGame.ts'
type Game = ReturnType<typeof usePuzzleGame>
interface RestoreOptions { verifyLarge?: (puzzle: PuzzleDefinition) => Promise<'verified' | 'failed' | 'cancelled'>; onFailure?: () => void }
export function useGamePersistence(puzzle: Readonly<Ref<PuzzleDefinition | null>>, game: Game, acceptPuzzle: (raw: unknown) => boolean, storage: GameStorage = createGameStorage(), options: RestoreOptions = {}) {
  const restorationMessage = ref(''), storageMessage = ref(''), recordMessage = ref('')
  const bestMs = ref<number | null>(null)
  let initialized = false
  let restoredRound: number | null = null
  function save() {
    if (!initialized || !puzzle.value) return
    if (!storage.saveSession(puzzle.value, game.snapshot())) storageMessage.value = '保存できませんでした。ゲームは続けられますが、再読み込み時に今回の進行を復元できない場合があります。'
  }
  let restoreToken = 0
  function publishRestored(session: SavedSession) {
    if (!acceptPuzzle(session.puzzle) || !game.restore(session.progress)) return false
    restorationMessage.value = game.status.value === 'cleared' ? 'クリア済みの状態を復元しました。' : '保存した途中状態から再開しました。ページを閉じていた時間は加算しません。Undo・Redo履歴は新たに開始します。'
    restoredRound = game.round.value; initialized = true
    return true
  }
  function restoreSaved() {
    const loaded = storage.loadSession(Boolean(options.verifyLarge))
    if (loaded.status === 'restored' && publishRestored(loaded.session)) return true
    if (loaded.status === 'pending' && options.verifyLarge) {
      restorationMessage.value = '保存した問題の一意性・難易度をWorkerで確認しています…'
      const token = ++restoreToken
      void options.verifyLarge(loaded.session.puzzle).then(outcome => {
        if (token !== restoreToken) return
        if (outcome === 'verified' && publishRestored(loaded.session)) return
        initialized = true
        restorationMessage.value = outcome === 'cancelled' ? '復元確認をキャンセルしました。「新しい問題」で開始できます。' : '保存した問題を検証できなかったため、新しい問題で開始します。'
        if (outcome !== 'cancelled') options.onFailure?.()
      })
      return true
    }
    if (loaded.status === 'invalid' || loaded.status === 'restored' || loaded.status === 'pending') restorationMessage.value = '保存データを検証できなかったため、新しい問題で開始します。'
    if (loaded.status === 'unavailable') storageMessage.value = 'この環境では保存を利用できません。ゲームはそのまま続けられます。'
    initialized = true
    return false
  }
  watch([puzzle, game.round], () => {
    if (restoredRound !== null && restoredRound !== game.round.value) { restorationMessage.value = ''; restoredRound = null }
    recordMessage.value = ''; bestMs.value = null
    if (!puzzle.value) return
    const result = storage.loadBest(puzzle.value.id)
    bestMs.value = result.value
    if (result.status === 'unavailable') storageMessage.value = 'ベスト記録を読み込めません。ゲームはそのまま続けられます。'
    if (result.status === 'invalid') storageMessage.value = '不正なベスト記録は読み込まずに開始しました。'
  }, { immediate: true, flush: 'sync' })
  // Actual completions only. Restoring a cleared snapshot never awards a record.
  watch(game.completion, event => {
    if (!initialized || !event) return
    const result = storage.recordBest(event.problemId, event.elapsedMs, event.answerUsed)
    if (result.value !== null) bestMs.value = result.value
    recordMessage.value = result.status === 'updated' ? '✓ この問題のベスト記録を更新しました！' : result.status === 'unchanged' ? 'この問題のベスト記録を超えませんでした。' : result.status === 'excluded' ? '答えを使用したため、この回はベスト記録の対象外です。' : 'クリアしましたが、ベスト記録を保存できませんでした。'
    if (result.status === 'unavailable') storageMessage.value = '記録を保存できませんでした。ゲームはそのまま続けられます。'
  }, { flush: 'sync' })
  watch([game.revision, computed(() => Math.floor(game.elapsedMs.value / 1000))], save, { flush: 'post' })
  const onPageHide = () => { game.pauseClock(); save() }
  const onPageShow = () => game.resumeClock()
  const onVisibility = () => { if (document.visibilityState === 'hidden') save() }
  onMounted(() => { window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', onPageShow); document.addEventListener('visibilitychange', onVisibility) })
  onBeforeUnmount(() => { restoreToken++; save(); window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', onPageShow); document.removeEventListener('visibilitychange', onVisibility) })
  return { bestMs, restorationMessage, storageMessage, recordMessage, restoreSaved, save }
}
