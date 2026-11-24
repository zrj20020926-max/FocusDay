<script setup lang="ts">
import type { StatisticsRange } from '../../services/statistics/StatisticsTypes'
defineProps<{ modelValue: StatisticsRange; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: StatisticsRange] }>()
const ranges: Array<{ value: StatisticsRange; label: string }> = [
  { value: 'TODAY', label: '今日' }, { value: 'WEEK', label: '本周' }, { value: 'MONTH', label: '本月' }, { value: 'ALL', label: '全部' },
]
</script>

<template>
  <div class="stats-range-tabs" role="tablist" aria-label="统计时间范围">
    <button v-for="item in ranges" :key="item.value" role="tab" :aria-selected="modelValue === item.value"
      :class="{ active: modelValue === item.value }" :disabled="disabled" @click="emit('update:modelValue', item.value)">{{ item.label }}</button>
    <span class="range-indicator" :style="{ transform: `translateX(${ranges.findIndex(item => item.value === modelValue) * 100}%)` }" />
  </div>
</template>
