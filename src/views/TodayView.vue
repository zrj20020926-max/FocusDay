<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Sun, ArrowRight, Sparkles, Play, Check, Sprout } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import TaskItem from '../components/TaskItem.vue'
import { useAppStore } from '../stores/app'
import { useTaskStore } from '../stores/taskStore'
import { useTimerStore } from '../stores/timerStore'
import { useFocusSessionStore } from '../stores/focusSessionStore'
import { localDateKey } from '../types/task'
import { useHabitStore } from '../stores/habitStore'
import { useAuthStore } from '../stores/authStore'
import { isMobileLayout } from '../composables/mobileLayout'
import MobileTaskList from '../components/mobile/MobileTaskList.vue'
const store = useAppStore(); const taskStore = useTaskStore(); const timerStore = useTimerStore(); const focusStore = useFocusSessionStore(); const title = ref('')
const router = useRouter()
const habits = useHabitStore()
const auth = useAuthStore()
const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${habits.today}T12:00:00`)))
const greeting = computed(() => {
  void habits.today
  const hour = new Date().getHours()
  return hour < 11 ? '上午好' : hour < 18 ? '下午好' : '晚上好'
})
const todayHabits = computed(() => habits.activeHabits.filter(habit => habits.isScheduled(habit)))
const completedHabits = computed(() => todayHabits.value.filter(habit => habits.todayRecord(habit.id)?.completed).length)
const pendingHabit = ref<string | null>(null)
const todayProgress = computed(() => taskStore.todayTasks.length ? Math.round(taskStore.todayTasks.filter(task => task.status === 'COMPLETED').length / taskStore.todayTasks.length * 100) : 0)
const focusHours = computed(() => Math.floor(focusStore.todaySummary.duration / 3600000))
const focusMinutes = computed(() => Math.floor(focusStore.todaySummary.duration % 3600000 / 60000))
const todayCompletedTasks = computed(() => taskStore.tasks.filter(task => task.completedAt && localDateKey(new Date(task.completedAt)) === localDateKey()).length)
const currentTask = computed(() => timerStore.timerState.taskId ? taskStore.getTaskById(timerStore.timerState.taskId) : null)
const activeTimer = computed(() => ['RUNNING', 'PAUSED'].includes(timerStore.timerState.status))
async function add() {
  const created = await taskStore.createTask({ title: title.value })
  if (created) title.value = ''
}
async function openFocus() {
  if (!activeTimer.value) await timerStore.start(null)
  await router.push('/focus')
}
async function toggleHabit(id: string) {
  if (pendingHabit.value) return
  pendingHabit.value = id
  try {
    if (habits.todayRecord(id)?.manualValue) await habits.uncheck(id)
    else await habits.checkIn(id)
    store.notify('今日习惯已更新')
  } catch { store.notify('习惯进度更新失败，请重试。') }
  finally { pendingHabit.value = null }
}
</script>

<template>
  <div class="page today-page">
    <header class="page-header welcome-header">
      <div><div class="date-line"><Sun :size="16" />{{ dateLabel }}</div><h1>{{ greeting }}<template v-if="auth.isAuthenticated">，{{ auth.displayName }}</template></h1><p v-if="!isMobileLayout">把注意力留给重要的事，今天也会是很好的一天。</p></div>
      <button v-if="isMobileLayout" class="primary-button mobile-create-button" aria-label="新建任务" @click="store.taskCreateOpen=true"><Plus :size="22"/></button>
    </header>
    <section v-if="isMobileLayout" class="mobile-focus-summary" aria-label="今日专注进度">
      <div class="mobile-focus-title"><span>今日专注</span><strong>{{ focusHours ? `${focusHours} 小时 ` : '' }}{{ focusMinutes }} 分钟</strong></div>
      <button class="primary-button" @click="openFocus"><Play :size="16" />{{ activeTimer ? '返回计时' : '开始专注' }}</button>
      <div class="mobile-focus-metrics">
        <span>完成 {{ todayCompletedTasks }} 项任务</span><span>{{ focusStore.todaySummary.completedPomodoros }} 个番茄钟</span>
        <span v-if="activeTimer" class="mobile-active-task">{{ currentTask?.title ?? '自由专注' }} · {{ timerStore.timerState.status === 'PAUSED' ? '已暂停' : '进行中' }}</span>
      </div>
    </section>
    <section v-else class="daily-overview">
      <div class="overview-main"><div class="ring-progress"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="35"/><circle class="value" cx="42" cy="42" r="35" :style="{strokeDashoffset: 220 - 220 * todayProgress / 100}"/></svg><strong>{{ todayProgress }}<small>%</small></strong></div><div><span class="eyebrow">TODAY'S RHYTHM</span><h2>今天已完成 {{ todayCompletedTasks }} 项任务</h2><p>完成番茄 {{focusStore.todaySummary.completedPomodoros}} 个，累计专注 {{focusStore.todaySummary.focusCount}} 次。</p></div></div>
      <div class="overview-stat"><span>专注时长</span><strong>{{focusHours}}<small>h</small> {{focusMinutes}}<small>m</small></strong><p>仅统计有效专注时间</p></div>
      <div class="overview-quote"><Sparkles :size="19"/><p v-if="['RUNNING','PAUSED'].includes(timerStore.timerState.status)"><strong>当前专注</strong><br/>{{currentTask?.title ?? '自由专注'}} · {{timerStore.timerState.status==='PAUSED'?'已暂停':'正在进行'}}</p><p v-else>“伟大的作品，来自许多个安静而专注的时刻。”</p></div>
    </section>
    <section class="tasks-section">
      <div class="section-title"><div><span class="eyebrow">MY DAY</span><h2>今日任务 <span>{{ taskStore.todayTasks.filter(t=>t.status!=='COMPLETED').length }}</span></h2></div><router-link to="/tasks">查看全部 <ArrowRight :size="15"/></router-link></div>
      <form class="quick-input" @submit.prevent="add"><input v-model="title" placeholder="添加一个任务，按 Enter 保存" enterkeyhint="done"/><button type="submit" aria-label="快速添加" :disabled="!title.trim()"><Plus :size="19" /></button></form>
      <p v-if="taskStore.loading && !taskStore.initialized" class="mobile-empty" role="status">正在读取任务…</p>
      <p v-else-if="!taskStore.todayTasks.length" class="mobile-empty" role="status">{{ taskStore.lastError || '今天暂无任务，先记下你想做的事。' }}</p>
      <MobileTaskList v-else-if="isMobileLayout" :tasks="taskStore.todayTasks" />
      <div v-else class="task-list"><TaskItem v-for="task in taskStore.todayTasks" :key="task.id" :task="task" /></div>
    </section>
    <section v-if="isMobileLayout" class="mobile-habits-summary">
      <div class="section-title"><h2><Sprout :size="19" />今日习惯</h2><RouterLink to="/habits">查看全部 <ArrowRight :size="15"/></RouterLink></div>
      <p v-if="!habits.initialized || !todayHabits.length" class="mobile-empty" role="status">
        {{ habits.loadError || (!habits.initialized ? '正在读取习惯…' : '今天暂无需要打卡的习惯。') }}
      </p>
      <template v-else>
        <p class="mobile-habits-count">已完成 {{ completedHabits }} / {{ todayHabits.length }}</p>
        <div v-for="habit in todayHabits.slice(0, 3)" :key="habit.id" class="mobile-habit-row">
          <strong><i :style="{ background: habit.color }" />{{ habit.name }}</strong>
          <button type="button" class="secondary-button" :aria-label="`${habits.todayRecord(habit.id)?.manualValue ? '取消打卡' : '打卡'} ${habit.name}`"
            :disabled="!!pendingHabit || Boolean(habits.todayRecord(habit.id)?.completed && !habits.todayRecord(habit.id)?.manualValue)"
            @click="toggleHabit(habit.id)"><Check v-if="habits.todayRecord(habit.id)?.completed" :size="16" />
            {{ habits.todayRecord(habit.id)?.completed ? '已完成' : '打卡' }}
          </button>
        </div>
      </template>
    </section>
  </div>
</template>
