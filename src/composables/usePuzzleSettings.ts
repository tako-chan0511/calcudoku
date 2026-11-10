import { computed, reactive, ref } from 'vue'
import { validSeed } from '../core/random.ts'
import { LATEST_GENERATOR_VERSION, GENERATOR_VERSION, OPERATORS, validSize, type Difficulty, type GenerationSettings, type GeneratorVersion, type Operator, type PuzzleDefinition } from '../core/types.ts'
export function usePuzzleSettings() {
  const draft = reactive<{ size: number; difficulty: Difficulty; operators: Operator[]; seed: string; generatorVersion: GeneratorVersion }>({ size: 5, difficulty: 'normal', operators: [...OPERATORS], seed: '0', generatorVersion: LATEST_GENERATOR_VERSION })
  const edited = ref(false)
  let initialized = false
  const errors = computed(() => {
    const messages: string[] = []
    if (!validSize(draft.size)) messages.push('盤面サイズは3〜9を選択してください。')
    if (!draft.operators.length) messages.push('演算子を1種類以上選択してください。')
    if (!/^\d+$/.test(draft.seed.trim()) || !validSeed(Number(draft.seed.trim()))) messages.push('シードは0〜4294967295の整数で入力してください。')
    if (draft.generatorVersion === GENERATOR_VERSION && (draft.size !== 5 || draft.difficulty !== 'normal')) messages.push('旧版v1の再現は5×5・normal専用です。最新v3を選択してください。')
    return messages
  })
  function read(): GenerationSettings | null {
    if (errors.value.length || !validSize(draft.size)) return null
    return { size: draft.size, difficulty: draft.difficulty, operators: OPERATORS.filter(op => draft.operators.includes(op)), seed: Number(draft.seed.trim()), generatorVersion: draft.generatorVersion }
  }
  function randomize(markEdited = true) {
    try { draft.seed = String(crypto.getRandomValues(new Uint32Array(1))[0]) } catch { draft.seed = '' }
    if (markEdited) edited.value = true
  }
  function adoptInitial(puzzle: PuzzleDefinition) {
    if (initialized) return
    initialized = true
    if (edited.value) return
    Object.assign(draft, { size: puzzle.size, difficulty: puzzle.difficulty, operators: [...puzzle.operators], seed: String(puzzle.seed), generatorVersion: puzzle.generatorVersion })
  }
  return { draft, edited, errors, read, randomize, adoptInitial }
}
