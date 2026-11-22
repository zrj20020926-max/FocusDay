<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Sun, ArrowRight, Sparkles } from 'lucide-vue-next'
import TaskItem from '../components/TaskItem.vue'
import { useAppStore } from '../stores/app'
const store = useAppStore(); const title = ref('')
function add() { store.addTask(title.value); title.value = '' }
</script>

<template>
  <div class="page today-page">
    <header class="page-header welcome-header">
      <div><div class="date-line"><Sun :size="16" />11月22日 · 星期日</div><h1>上午好，予安 <span>👋</span></h1><p>把注意力留给重要的事，今天也会是很好的一天。</p></div>
      <button class="primary-button mobile-add" @click="store.commandOpen=true"><Plus :size="18"/>新建任务</button>
    </header>
    <section class="daily-overview">
      <div class="overview-main"><div class="ring-progress"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="35"/><circle class="value" cx="42" cy="42" r="35"/></svg><strong>68<small>%</small></strong></div><div><span class="eyebrow">TODAY'S RHYTHM</span><h2>今天已完成 4 项任务</h2><p>状态不错，再专注 45 分钟就能达成今日目标。</p></div></div>
      <div class="overview-stat"><span>专注时长</span><strong>2<small>h</small> 35<small>m</small></strong><p><b>↑ 18%</b> 较上周日</p></div>
      <div class="overview-quote"><Sparkles :size="19"/><p>“伟大的作品，来自许多个安静而专注的时刻。”</p></div>
    </section>
    <section class="tasks-section">
      <div class="section-title"><div><span class="eyebrow">MY DAY</span><h2>今日任务 <span>{{ store.todayTasks.filter(t=>!t.completed).length }}</span></h2></div><router-link to="/tasks">查看全部 <ArrowRight :size="15"/></router-link></div>
      <div class="quick-input"><button @click="add"><Plus :size="19" /></button><input v-model="title" placeholder="添加一个任务，按 Enter 保存" @keyup.enter="add"/><span>今天</span></div>
      <div class="task-list"><TaskItem v-for="task in store.todayTasks" :key="task.id" :task="task" /></div>
      <div class="gentle-note"><span>☕</span><p><strong>给自己留一点余地</strong>今日安排约 4 小时 10 分钟，节奏刚刚好。</p></div>
    </section>
  </div>
</template>
