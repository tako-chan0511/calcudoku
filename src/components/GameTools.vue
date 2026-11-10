<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import type { HintOutcome } from '../composables/usePuzzleGame.ts'
defineProps<{ canUndo: boolean; canRedo: boolean; canHint: boolean; outcome: DeepReadonly<HintOutcome> | null }>()
const emit = defineEmits<{ undo: []; redo: []; candidates: []; answer: [] }>()
</script>
<template>
  <section class="game-tools" aria-label="履歴とヒント">
    <div class="history-actions"><button class="secondary" :disabled="!canUndo" @click="emit('undo')">↶ Undo</button><button class="secondary" :disabled="!canRedo" @click="emit('redo')">↷ Redo</button></div>
    <div class="hint-actions"><button class="secondary" :disabled="!canHint" @click="emit('candidates')">候補表示</button><button class="secondary" :disabled="!canHint" @click="emit('answer')">答えを見る</button></div>
    <p class="hint-note">候補表示は数字を書き込みません。「答えを見る」を使うと、この回はベスト記録の対象外になります。</p>
    <div v-if="outcome" class="hint-result" role="status">
      <template v-if="outcome.kind === 'candidates'"><strong>{{ outcome.digits.length ? `候補：${outcome.digits.join('・')}` : '候補なし' }}</strong><p>選択マスを置き換える場合の、行・列・ケージに基づく候補です。</p><p v-for="reason in outcome.reasons" :key="reason">! {{ reason }}</p></template>
      <p v-else>{{ outcome.message }}</p>
    </div>
  </section>
</template>
