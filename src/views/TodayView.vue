<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Sun, ArrowRight, Sparkles } from 'lucide-vue-next'
import TaskItem from '../components/TaskItem.vue'
import { useAppStore } from '../stores/app'
import { useTaskStore } from '../stores/taskStore'
import { useTimerStore } from '../stores/timerStore'
const store = useAppStore(); const taskStore = useTaskStore(); const timerStore = useTimerStore(); const title = ref('')
const todayProgress = computed(() => taskStore.todayTasks.length ? Math.round(taskStore.todayTasks.filter(task => task.status === 'COMPLETED').length / taskStore.todayTasks.length * 100) : 0)
const focusHours = computed(() => Math.floor(timerStore.todayFocusDuration / 3600000))
const focusMinutes = computed(() => Math.floor(timerStore.todayFocusDuration % 3600000 / 60000))
async function add() {
  const created = await taskStore.createTask({ title: title.value })
  if (created) title.value = ''
}
</script>

<template>
  <div class="page today-page">
    <header class="page-header welcome-header">
      <div><div class="date-line"><Sun :size="16" />11月22日 · 星期日</div><h1>上午好，予安 <span>👋</span></h1><p>把注意力留给重要的事，今天也会是很好的一天。</p></div>
      <button class="primary-button mobile-add" @click="store.commandOpen=true"><Plus :size="18"/>新建任务</button>
    </header>
    <section class="daily-overview">
      <div class="overview-main"><div class="ring-progress"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="35"/><circle class="value" cx="42" cy="42" r="35" :style="{strokeDashoffset: 220 - 220 * todayProgress / 100}"/></svg><strong>{{ todayProgress }}<small>%</small></strong></div><div><span class="eyebrow">TODAY'S RHYTHM</span><h2>今天已完成 {{ taskStore.todayTasks.filter(t=>t.status==='COMPLETED').length }} 项任务</h2><p>状态不错，再专注一会儿就能更接近今日目标。</p></div></div>
      <div class="overview-stat"><span>专注时长</span><strong>{{focusHours}}<small>h</small> {{focusMinutes}}<small>m</small></strong><p>仅统计有效专注时间</p></div>
      <div class="overview-quote"><Sparkles :size="19"/><p>“伟大的作品，来自许多个安静而专注的时刻。”</p></div>
    </section>
    <section class="tasks-section">
      <div class="section-title"><div><span class="eyebrow">MY DAY</span><h2>今日任务 <span>{{ taskStore.todayTasks.filter(t=>t.status!=='COMPLETED').length }}</span></h2></div><router-link to="/tasks">查看全部 <ArrowRight :size="15"/></router-link></div>
      <div class="quick-input"><button @click="add"><Plus :size="19" /></button><input v-model="title" placeholder="添加一个任务，按 Enter 保存" @keyup.enter="add"/><span>今天</span></div>
      <div class="task-list"><TaskItem v-for="task in taskStore.todayTasks" :key="task.id" :task="task" /></div>
      <div class="gentle-note"><span>☕</span><p><strong>给自己留一点余地</strong>今日安排约 4 小时 10 分钟，节奏刚刚好。</p></div>
    </section>
  </div>
</template>
