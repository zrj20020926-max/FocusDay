<script setup lang="ts">
import { computed } from 'vue'
import { PanelRightClose, Clock3, CheckCircle2, ArrowUpRight } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { formatTaskDate, useTaskStore } from '../stores/taskStore'
import { useTimerStore } from '../stores/timerStore'
import MiniTimer from './MiniTimer.vue'
const store = useAppStore()
const taskStore = useTaskStore()
const timerStore = useTimerStore()
const todayProgress = computed(() => taskStore.todayTasks.length ? Math.round(taskStore.todayTasks.filter(task => task.status === 'COMPLETED').length / taskStore.todayTasks.length * 100) : 0)
const focusSummary = computed(() => `${Math.floor(timerStore.todayFocusDuration / 3600000)}h ${Math.floor(timerStore.todayFocusDuration % 3600000 / 60000)}m`)
</script>

<template>
  <aside class="right-panel">
    <div class="right-top"><span>今日概览</span><button class="icon-button" title="收起辅助栏" @click="store.rightPanelOpen = false"><PanelRightClose :size="18" /></button></div>
    <MiniTimer />
    <section class="progress-block">
      <div class="section-heading"><div><span class="eyebrow">TODAY</span><h3>今日进度</h3></div><strong>{{ todayProgress }}%</strong></div>
      <div class="progress-bar"><span :style="{width:`${todayProgress}%`}" /></div>
      <p>已完成 <b>{{ taskStore.todayTasks.filter(t=>t.status==='COMPLETED').length }}</b> 项，还有 {{ taskStore.todayTasks.filter(t=>t.status!=='COMPLETED').length }} 项待完成</p>
    </section>
    <div class="mini-metrics"><div><span class="metric-icon green"><Clock3 :size="17" /></span><p>今日专注</p><strong>{{focusSummary}}</strong><small>仅统计有效专注记录</small></div><div><span class="metric-icon gold"><CheckCircle2 :size="17" /></span><p>完成任务</p><strong>{{ taskStore.doneCount }}</strong><small>每一次完成都值得记录</small></div></div>
    <section class="recent-section">
      <div class="section-heading"><h3>最近任务</h3><button>查看全部 <ArrowUpRight :size="14" /></button></div>
      <button v-for="task in taskStore.sortedTasks.slice(-3)" :key="task.id" class="recent-task" @click="store.openTask(task.id)"><i :style="{ background: taskStore.getCategoryById(task.categoryId)?.color }"/><span><strong>{{ task.title }}</strong><small>{{ formatTaskDate(task.dueDate) }} · {{ taskStore.getCategoryById(task.categoryId)?.name ?? '其他' }}</small></span></button>
    </section>
  </aside>
</template>
