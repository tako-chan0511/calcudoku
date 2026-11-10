<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
const props = defineProps<{
  clearTime: string
  bestTime: string | null
  recordMessage: string
  answerUsed: boolean
  canRetry: boolean
  returnFocus: HTMLElement | null
}>()
const emit = defineEmits<{ close: []; retry: [] }>()
const closeButton = ref<HTMLButtonElement | null>(null)
const retryButton = ref<HTMLButtonElement | null>(null)
let previousOverflow = ''
onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  closeButton.value?.focus()
})
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  const target = props.returnFocus
  void nextTick(() => { if (target?.isConnected && !target.matches(':disabled')) target.focus({ preventScroll: true }) })
})
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); emit('close')
  } else if (event.key === 'Tab') {
    const buttons = [closeButton.value, retryButton.value].filter((button): button is HTMLButtonElement => button !== null && !button.disabled)
    const index = buttons.findIndex(button => button === document.activeElement)
    const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
    event.preventDefault(); buttons[next]?.focus()
  }
}
</script>
<template>
  <Teleport to="body">
    <div class="clear-popup-backdrop" @keydown="onKeydown">
      <section class="clear-popup" role="dialog" aria-modal="true" aria-labelledby="clear-popup-title" aria-describedby="clear-popup-description">
        <svg class="clear-popup-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="32" cy="32" r="24" fill="#eef0ff" />
          <path d="m32 15 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z" fill="#6366f1" />
          <path d="m8 12 3 4m42-6-2 5M7 46l5-1m41 2 4 3" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" />
          <circle cx="10" cy="31" r="2" fill="#10b981" /><circle cx="54" cy="29" r="2" fill="#10b981" />
        </svg>
        <p class="clear-popup-label">CLEAR!</p>
        <h2 id="clear-popup-title">おめでとう！</h2>
        <p id="clear-popup-description">すべてのマスを正しく埋めました。</p>
        <p class="clear-popup-time">クリア時間 <strong>{{ clearTime }}</strong></p>
        <p v-if="bestTime" class="clear-popup-best">この問題のベスト：{{ bestTime }}</p>
        <p v-if="recordMessage" class="clear-popup-record">{{ recordMessage }}</p>
        <p v-if="answerUsed" class="clear-popup-answer">! 答え使用済み・この回は記録対象外です。</p>
        <div class="clear-popup-actions">
          <button ref="closeButton" class="secondary" @click="emit('close')">閉じて盤面を見る</button>
          <button ref="retryButton" class="primary" :disabled="!canRetry" @click="emit('retry')">もう一度挑戦する</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
