<script setup lang="ts">
import { CalendarCheck2, Flame, Trophy } from 'lucide-vue-next'
import type { FocusStreakMetric } from '../../services/statistics/StatisticsTypes'
defineProps<{ metric: FocusStreakMetric }>()
</script>

<template>
  <article class="analytics-card streak-analysis-card">
    <header class="analytics-card-heading compact"><div><span class="card-kicker"><Flame :size="14"/>FOCUS STREAK</span><h2>专注连续性</h2><p>每天一段正时长专注，即计为专注一天</p></div></header>
    <div class="streak-primary"><span><Flame :size="23"/></span><div><strong>{{ metric.current }}<i>天</i></strong><p>当前连续专注</p></div></div>
    <div class="streak-secondary">
      <div><span><Trophy :size="16"/></span><p>历史最长<strong>{{ metric.longest }} 天</strong></p></div>
      <div><span><CalendarCheck2 :size="16"/></span><p>本月专注<strong>{{ metric.monthFocusedDays }} 天</strong></p></div>
    </div>
  </article>
</template>
