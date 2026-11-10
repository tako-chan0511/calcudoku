<script setup lang="ts">
withDefaults(defineProps<{ disabled: boolean; canDelete: boolean; size?: number }>(), { size: 5 })
const emit = defineEmits<{ input: [value: number | null] }>()
</script>
<template>
  <div class="number-pad" :style="{ '--pad-columns': Math.min(size, 5) }" role="group" aria-label="数字パッド">
    <button v-for="digit in size" :key="digit" type="button" :disabled="disabled" :aria-label="`${digit}を入力`" @click="emit('input', digit)">{{ digit }}</button>
    <button class="delete-number" type="button" :disabled="disabled || !canDelete" aria-label="数字を削除" @click="emit('input', null)">⌫<span>削除</span></button>
  </div>
</template>
