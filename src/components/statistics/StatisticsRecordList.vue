<script setup lang="ts">
import { Clock3, TimerReset, X } from 'lucide-vue-next'
import type { StatisticsFocusRecord } from '../../services/statistics/StatisticsTypes'
defineProps<{ title: string; records: StatisticsFocusRecord[] }>()
defineEmits<{ close: [] }>()
const duration = (value: number) => value >= 3600000 ? `${Math.floor(value / 3600000)} 小时 ${Math.round(value % 3600000 / 60000)} 分` : `${Math.max(1, Math.round(value / 60000))} 分钟`
const time = (value: number) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
</script>

<template>
  <section class="stats-record-panel">
    <header><div><span class="eyebrow">FOCUS RECORDS</span><h3>{{ title }}</h3><p>共 {{ records.length }} 次有效专注</p></div><button class="icon-button" aria-label="关闭详情" @click="$emit('close')"><X :size="18"/></button></header>
    <div v-if="records.length" class="stats-record-list">
      <article v-for="record in records" :key="record.id">
        <i :style="{ background: record.categoryColor }" />
        <div><strong>{{ record.taskTitle }}</strong><span>{{ record.categoryName }} · {{ record.date }}</span></div>
        <span><Clock3 :size="14"/>{{ time(record.startTime) }}</span>
        <b><TimerReset :size="14"/>{{ duration(record.duration) }}</b>
      </article>
    </div>
    <div v-else class="record-empty">该筛选条件下暂无专注记录</div>
  </section>
</template>
