import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { isVerifiedPuzzle } from '../core/constraints.ts'
import { canonicalPuzzle } from '../core/definition.ts'
import { validSettings, versionFor } from '../core/generator.ts'
import { settingsForSeed, type GenerationProgress, type GenerationSettings, type PuzzleDefinition } from '../core/types.ts'
import type { WorkerRequest } from '../workers/protocol.ts'
export interface WorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(request: WorkerRequest): void
  terminate(): void
}
export type VerifyOutcome = 'verified' | 'failed' | 'cancelled'
const defaultFactory = (): WorkerPort => new Worker(new URL('../workers/puzzle.worker.ts', import.meta.url), { type: 'module' })
export function usePuzzleGenerator(factory: () => WorkerPort = defaultFactory, nextSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  const puzzle = shallowRef<PuzzleDefinition | null>(null)
  const state = ref<'idle' | 'generating' | 'ready' | 'failed'>('idle')
  const error = ref(''), notice = ref('')
  const progress = shallowRef<GenerationProgress | null>(null)
  let worker: WorkerPort | null = null, requestId = 0
  let deadline: ReturnType<typeof setTimeout> | undefined
  let resolveVerification: ((outcome: VerifyOutcome) => void) | null = null
  function stop(outcome: VerifyOutcome = 'cancelled') {
    worker?.terminate(); worker = null; clearTimeout(deadline); deadline = undefined
    const resolve = resolveVerification; resolveVerification = null; resolve?.(outcome)
  }
  function fail(reason = '', rawDiagnostics?: unknown) {
    state.value = 'failed'
    const data = rawDiagnostics && typeof rawDiagnostics === 'object' ? rawDiagnostics as Record<string, unknown> : {}
    const grades = ['easy','normal','hard'].filter(k => typeof data[k] === 'number' && Number(data[k]) > 0)
    const seen = grades.length ? ` 見つかった一意解の評価：${grades.join(' / ')}。` : ''
    error.value = reason === 'difficulty-unmet'
      ? '【難易度条件】一意解は見つかりましたが、指定難易度の条件を満たす問題が得られませんでした。' + seen + ' 別のシード、難易度、または演算子の組合せを試してください。設定は自動変更していません。'
      : reason === 'operator-constraints'
        ? '【演算子制限】選択した演算子とケージ構成では、固定セル上限内で一意解を作れませんでした。除算は整数で割り切れる2マスだけを使います。別のシードか、許可する演算子を増やして試してください。'
        : reason === 'budget-exceeded'
          ? '【探索上限】一意解を確認できませんでした。一意性または難易度の検証が探索上限に達したため、未確認の問題は採用していません。別のシード、難易度、演算子を試してください。'
          : reason === 'attempt-limit'
            ? '【試行上限】一意解を確認できませんでした。候補生成の回数上限に達しました。別のシード、難易度、演算子を試してください。'
            : reason === 'invalid-settings'
              ? '【設定エラー】一意解を確認できませんでした。サイズ・演算子・シード・生成版の設定を確認してください。'
              : '【生成・検証エラー】一意解を確認できませんでした。生成または検証を完了できませんでした。もう一度「新しい問題」を押してください。'
    if (puzzle.value) error.value += ' 現在の問題と入力は保持しています。'
    stop('failed')
  }
  function start(request: WorkerRequest) {
    const id = request.requestId
    state.value = 'generating'; error.value = ''; notice.value = ''; progress.value = { attempt: 0, work: 0, stage: 'uniqueness' }
    try {
      worker = factory()
      worker.onmessage = ({ data }) => {
        if (id !== requestId || state.value !== 'generating' || !data || typeof data !== 'object') return
        const message = data as Record<string, unknown>
        if (message.requestId !== id) return
        if (message.type === 'progress') {
          const p = message.progress as GenerationProgress | undefined
          if (p && Number.isSafeInteger(p.attempt) && p.attempt >= 0 && Number.isSafeInteger(p.work) && p.work >= 0 && ['cages', 'uniqueness', 'difficulty'].includes(p.stage)) progress.value = { ...p }
          return
        }
        if (request.type === 'verify') {
          if (message.type !== 'verified' || message.valid !== true) { fail(); return }
          state.value = puzzle.value ? 'ready' : 'idle'; stop('verified')
          return
        }
        const result = message.result && typeof message.result === 'object' ? message.result as Record<string, unknown> : null
        if (message.type !== 'generated' || result?.status !== 'success' || !canonicalPuzzle(result.puzzle)) { fail(typeof result?.reason === 'string' ? result.reason : '', result?.metrics && typeof result.metrics === 'object' ? (result.metrics as Record<string, unknown>).diagnostics : undefined); return }
        const verified = result.puzzle, settings = request.settings
        if (verified.size !== settings.size || verified.difficulty !== settings.difficulty || verified.generatorVersion !== versionFor(settings) || verified.seed !== settings.seed || verified.operators.length !== settings.operators.length || !settings.operators.every(op => verified.operators.includes(op))) { fail(); return }
        puzzle.value = verified; state.value = 'ready'; stop()
      }
      worker.onerror = () => { if (id === requestId && state.value === 'generating') fail() }
      const size = request.type === 'generate' ? request.settings.size : request.puzzle.size
      deadline = setTimeout(() => { if (id === requestId && state.value === 'generating') fail() }, size <= 5 ? 15_000 : 45_000)
      worker.postMessage(request)
    } catch { fail() }
  }
  function generate(settings?: GenerationSettings) {
    requestId++; stop()
    let requested: GenerationSettings
    try { requested = settings ?? settingsForSeed(nextSeed()) } catch { fail('invalid-settings'); return }
    if (!validSettings(requested)) { fail('invalid-settings'); return }
    // Snapshot the draft so editing it during generation cannot alter this job.
    const snapshot = { ...requested, operators: [...requested.operators] }
    start({ type: 'generate', requestId, settings: snapshot })
  }
  function verifyPuzzle(candidate: PuzzleDefinition): Promise<VerifyOutcome> {
    requestId++; stop()
    if (!canonicalPuzzle(candidate)) { fail('invalid-settings'); return Promise.resolve('failed') }
    return new Promise(resolve => { resolveVerification = resolve; start({ type: 'verify', requestId, puzzle: candidate }) })
  }
  function cancel() {
    requestId++; state.value = puzzle.value ? 'ready' : 'idle'; stop()
    error.value = ''; progress.value = null; notice.value = puzzle.value ? '生成・検証をキャンセルしました。現在の問題は保持しています。' : '生成・検証をキャンセルしました。「新しい問題」で開始できます。'
  }
  function restorePuzzle(raw: unknown) {
    if (!isVerifiedPuzzle(raw)) return false
    requestId++; stop(); puzzle.value = raw; state.value = 'ready'; error.value = ''
    return true
  }
  onBeforeUnmount(() => { requestId++; stop() })
  return { puzzle, state, error, notice, progress, generate, cancel, verifyPuzzle, restorePuzzle }
}
