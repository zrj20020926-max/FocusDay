<script setup lang="ts">
import { PanelRightClose, Clock3, CheckCircle2, ArrowUpRight } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import MiniTimer from './MiniTimer.vue'
const store = useAppStore()
</script>

<template>
  <aside class="right-panel">
    <div class="right-top"><span>今日概览</span><button class="icon-button" title="收起辅助栏" @click="store.rightPanelOpen = false"><PanelRightClose :size="18" /></button></div>
    <MiniTimer />
    <section class="progress-block">
      <div class="section-heading"><div><span class="eyebrow">TODAY</span><h3>今日进度</h3></div><strong>68%</strong></div>
      <div class="progress-bar"><span /></div>
      <p>已完成 <b>4</b> 项，还有 3 项待完成</p>
    </section>
    <div class="mini-metrics"><div><span class="metric-icon green"><Clock3 :size="17" /></span><p>今日专注</p><strong>2h 35m</strong><small>比昨天多 24 分钟</small></div><div><span class="metric-icon gold"><CheckCircle2 :size="17" /></span><p>完成任务</p><strong>4</strong><small>连续 6 天达成目标</small></div></div>
    <section class="recent-section">
      <div class="section-heading"><h3>最近任务</h3><button>查看全部 <ArrowUpRight :size="14" /></button></div>
      <button v-for="task in store.tasks.slice(4,7)" :key="task.id" class="recent-task" @click="store.openTask(task.id)"><i :style="{ background: task.color }"/><span><strong>{{ task.title }}</strong><small>{{ task.due }} · {{ task.category }}</small></span></button>
    </section>
  </aside>
</template>
