<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays } from 'lucide-vue-next'
import type { FocusHeatmapDay } from '../../services/statistics/StatisticsTypes'

const props = defineProps<{ days: FocusHeatmapDay[]; empty: boolean }>()
const emit = defineEmits<{ select: [day: FocusHeatmapDay] }>()

const durationLabel = (duration: number) => {
  if (!duration) return '暂无专注'
  const hours = Math.floor(duration / 3_600_000)
  const minutes = Math.round(duration % 3_600_000 / 60_000)
  return hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`
}
const weekday = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}
const weeks = computed(() => {
  if (!props.days.length) return []
  const cells: Array<FocusHeatmapDay | null> = [
    ...new Array(weekday(props.days[0].date)).fill(null),
    ...props.days,
  ]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))
})
const months = computed(() => {
  const result: Array<{ key: string; label: string; week: number }> = []
  props.days.forEach((day, index) => {
    if (day.date.slice(8) !== '01' && index !== 0) return
    const monthKey = day.date.slice(0, 7)
    if (result.some(item => item.key === monthKey)) return
    const week = Math.floor((weekday(props.days[0].date) + index) / 7)
    result.push({ key: monthKey, label: `${Number(day.date.slice(5, 7))}月`, week })
  })
  return result
})
</script>

<template>
  <div v-if="empty" class="heatmap-empty">
    <span><CalendarDays :size="23"/></span><strong>这段时间还没有专注足迹</strong><p>完成一次专注后，这里会亮起第一个格子。</p>
  </div>
  <div v-else class="heatmap-shell">
    <div class="heatmap-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
    <div class="heatmap-scroll" tabindex="0" aria-label="专注热力图，可横向滚动">
      <div class="heatmap-canvas" :style="{ '--heatmap-weeks': weeks.length }">
        <div class="heatmap-months" aria-hidden="true">
          <span v-for="month in months" :key="month.key" :style="{ gridColumn: `${month.week + 1} / span 4` }">{{ month.label }}</span>
        </div>
        <div class="heatmap-weeks">
          <div v-for="(week, weekIndex) in weeks" :key="weekIndex" class="heatmap-week">
            <template v-for="(day, dayIndex) in week" :key="day?.date ?? `empty-${dayIndex}`">
              <button v-if="day" class="heatmap-day" :class="`level-${day.level}`" :aria-label="`${day.date}，${durationLabel(day.duration)}`" @click="emit('select', day)">
                <span class="heatmap-tooltip"><b>{{ day.date }}</b>{{ durationLabel(day.duration) }}</span>
              </button>
              <i v-else class="heatmap-day-placeholder"/>
            </template>
          </div>
        </div>
      </div>
    </div>
    <div class="heatmap-legend"><span>少</span><i v-for="level in [0,1,2,3,4]" :key="level" :class="`level-${level}`"/><span>多</span></div>
  </div>
</template>
