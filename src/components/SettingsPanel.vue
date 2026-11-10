<script setup lang="ts">
import type { Difficulty, GeneratorVersion, Operator } from '../core/types.ts'
const size = defineModel<number>('size', { required: true })
const difficulty = defineModel<Difficulty>('difficulty', { required: true })
const operators = defineModel<Operator[]>('operators', { required: true })
const seed = defineModel<string>('seed', { required: true })
const version = defineModel<GeneratorVersion>('version', { required: true })
defineProps<{ busy: boolean; errors: readonly string[] }>()
const emit = defineEmits<{ generate: []; cancel: []; random: []; edit: [] }>()
const symbols = { '+': '＋', '-': '−', '*': '×', '/': '÷' } as const
</script>
<template>
  <section class="panel settings" aria-label="問題の設定">
    <div class="settings-header"><div><h2>次の問題の設定</h2><p>変更は「新しい問題」で反映します。</p></div><div class="settings-actions"><button class="primary" :disabled="busy || errors.length > 0" @click="emit('generate')">新しい問題 <span aria-hidden="true">↗</span></button><button v-if="busy" class="secondary cancel-generation" @click="emit('cancel')">キャンセル</button></div></div>
    <div class="settings-fields">
      <label>盤面サイズ<select v-model.number="size" aria-label="盤面サイズ" @change="emit('edit')"><option v-for="n in 7" :key="n" :value="n + 2">{{ n + 2 }} × {{ n + 2 }}</option></select></label>
      <label>難易度<select v-model="difficulty" aria-label="難易度" @change="emit('edit')"><option value="easy">easy</option><option value="normal">normal</option><option value="hard">hard</option></select></label>
      <label class="version-field">生成方式<select v-model="version" aria-label="生成方式" @change="emit('edit')"><option value="calcudoku-v3">v3 · 生成成功率を改善</option><option value="calcudoku-v2">旧v2 · 問題を再現</option><option value="calcudoku-v1">旧v1 · 5×5 normal（旧評価）</option></select></label>
      <fieldset class="operator-field"><legend>使用を許可する演算</legend><label v-for="(symbol, op) in symbols" :key="op"><input v-model="operators" type="checkbox" :value="op" :aria-label="`演算子 ${symbol}`" @change="emit('edit')" />{{ symbol }}</label></fieldset>
      <label class="seed-field">シード<input v-model="seed" aria-label="シード" type="text" inputmode="numeric" autocomplete="off" :aria-invalid="errors.some(e => e.includes('シード'))" @input="emit('edit')" /></label>
      <button class="secondary random-seed" @click="emit('random')">ランダムシード</button>
    </div>
    <ul v-if="errors.length" class="settings-errors" role="alert"><li v-for="message in errors" :key="message">! {{ message }}</li></ul>
    <p v-if="size === 9 && difficulty === 'hard' && operators.length === 1 && operators[0] === '/'" class="unsupported-setting" role="status">! 9×9・除算のみ・hardは生成成功が未確認で、動作保証対象外です。別の難易度・演算子・シードを試してください。条件を満たせない場合は出題せず、現在の問題を保持します。</p>
    <p class="difficulty-note">easy：小さいケージと単純な候補削減 ／ normal：行・列・複数マスのケージを組み合わせる推論 ／ hard：先読みが必要。条件を満たせない場合は出題しません。</p>
  </section>
</template>
