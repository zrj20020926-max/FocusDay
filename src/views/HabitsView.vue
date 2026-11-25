<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { Plus, Check, RotateCcw, CalendarDays, ChevronLeft, ChevronRight, Sprout } from 'lucide-vue-next'
import { useHabitStore } from '../stores/habitStore'
import { useAppStore } from '../stores/app'
import HabitDetailDrawer from '../components/habit/HabitDetailDrawer.vue'
import HabitForm from '../components/habit/HabitForm.vue'
import type { CreateHabitInput, Habit } from '../types/habit'
import { HabitDomainError } from '../types/habit'
import { formatHabitValue, isWeeklyHabit } from '../services/habit/HabitService'
import { addCalendarDays, weekStartKey } from '../services/statistics/StatisticsCalculator'

const store = useHabitStore()
const app = useAppStore()
const view = ref<'today' | 'all'>('today')
const editing = ref<Habit | null>(null)
const saving = ref(false)
const formError = ref('')
const busyId = ref<string | null>(null)
const celebration = ref<string | null>(null)
const calendarOffset = ref(0)
let celebrationTimer: ReturnType<typeof setTimeout>
onUnmounted(() => { clearTimeout(celebrationTimer); store.closeDrawer(); store.formOpen = false })

const scheduled = computed(() => store.activeHabits.filter(habit => store.isScheduled(habit)))
const doneCount = computed(() => scheduled.value.filter(habit => store.stats(habit.id)?.todayCompleted).length)
const progress = computed(() => scheduled.value.length ? Math.round(doneCount.value / scheduled.value.length * 100) : 0)
const visibleHabits = computed(() => view.value === 'today' ? scheduled.value : store.habits)
const statsByHabit = computed(() => new Map(store.habits.map(habit => [habit.id, store.stats(habit.id)])))
const selectedStats = computed(() => store.selectedHabit ? store.stats(store.selectedHabit.id) : null)
const completedDates = computed(() => {
  const visibleIds = new Set(store.habits.map(habit => habit.id))
  const totals = new Map<string, number>()
  for (const record of store.records) {
    if (record.completed && visibleIds.has(record.habitId)) totals.set(record.recordDate, (totals.get(record.recordDate) ?? 0) + 1)
  }
  return totals
})
const week = computed(() => Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStartKey(store.today), index)))
const month = computed(() => {
  const [year, monthNumber] = store.today.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1 + calendarOffset.value, 1))
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7
  const dates = Array.from({ length: count }, (_, index) => addCalendarDays(first.toISOString().slice(0, 10), index))
  return { title: `${first.getUTCFullYear()} 年 ${first.getUTCMonth() + 1} 月`, cells: [...Array<null>(lead).fill(null), ...dates] }
})

function goalLabel(habit: Habit) {
  const goal = habit.goalType === 'DAILY_DURATION' ? formatHabitValue(habit, habit.targetValue) : '打卡'
  if (isWeeklyHabit(habit)) return `${goal} · 每周 ${habit.weeklyTarget} 天`
  return `${goal} · ${habit.frequency === 'WEEKDAYS' ? '固定星期' : '每天'}`
}

function progressLabel(habit: Habit) {
  const stats = statsByHabit.value.get(habit.id)
  const current = stats?.todayValue ?? 0
  if (habit.goalType === 'DAILY_DURATION') return `${formatHabitValue(habit, current)} / ${formatHabitValue(habit, habit.targetValue)}`
  if (isWeeklyHabit(habit)) return `本周 ${Math.round((stats?.weekRate ?? 0) * habit.weeklyTarget)} / ${habit.weeklyTarget} 天`
  return stats?.todayCompleted ? '今日已完成' : '今日待完成'
}

function progressRatio(habit: Habit) {
  const stats = statsByHabit.value.get(habit.id)
  if (isWeeklyHabit(habit)) return Math.min(1, stats?.weekRate ?? 0)
  return Math.min(1, (stats?.todayValue ?? 0) / habit.targetValue)
}

function addHabit() { editing.value = null; formError.value = ''; store.formOpen = true }
function editHabit(habit: Habit) { editing.value = habit; formError.value = ''; store.closeDrawer(); store.formOpen = true }
function retryLoad() { void store.observeFocus().catch(() => undefined) }

async function saveHabit(input: CreateHabitInput) {
  if (saving.value) return
  saving.value = true
  formError.value = ''
  try {
    const saved = editing.value ? await store.update(editing.value.id, input) : await store.create(input)
    store.formOpen = false
    if (!store.isScheduled(saved) || saved.status === 'PAUSED') view.value = 'all'
    app.notify(editing.value ? '习惯已更新' : '习惯已创建')
  } catch (error) {
    formError.value = error instanceof HabitDomainError ? error.message : '无法保存习惯，请稍后重试。'
  } finally { saving.value = false }
}

async function perform(habit: Habit, action: () => Promise<unknown>) {
  if (busyId.value) return
  busyId.value = habit.id
  try { await action() }
  catch (error) { app.notify(error instanceof HabitDomainError ? error.message : '操作未保存，请稍后重试') }
  finally { busyId.value = null }
}

function toggle(habit: Habit) {
  return perform(habit, async () => {
    if (store.todayRecord(habit.id)?.manualValue) { await store.uncheck(habit.id); return }
    await store.checkIn(habit.id)
    celebration.value = habit.id
    clearTimeout(celebrationTimer)
    celebrationTimer = setTimeout(() => { celebration.value = null }, 500)
    app.notify('今日已打卡')
  })
}
</script>

<template>
  <div class="page habits-page">
    <header class="page-header">
      <div><span class="eyebrow">HABITS</span><h1>习惯</h1><p>记录每天的小进展。</p></div>
      <button class="primary-button" :disabled="!store.initialized" @click="addHabit"><Plus :size="18"/>新建习惯</button>
    </header>

    <section class="habit-overview" aria-label="今日进度">
      <div><span>今日进度</span><strong>{{ doneCount }} / {{ scheduled.length }}</strong>
        <p>{{ !scheduled.length ? '今天暂无计划打卡的习惯' : progress === 100 ? '今日目标已全部完成' : '项习惯已达成今日目标' }}</p>
      </div>
      <div class="habit-progress-ring" :style="{ '--progress': progress + '%' }"><strong>{{ progress }}<small>%</small></strong></div>
    </section>

    <div class="habit-layout">
      <section>
        <div class="habit-list-heading">
          <h2>{{ view === 'today' ? '今日习惯' : '全部习惯' }}</h2>
          <div class="habit-tabs" role="group" aria-label="习惯视图">
            <button :aria-pressed="view==='today'" @click="view='today'">今日</button>
            <button :aria-pressed="view==='all'" @click="view='all'">全部</button>
          </div>
        </div>
        <div v-if="!store.initialized && store.loadError" class="habit-empty" role="status">
          <span>{{ store.loadError }}</span><button class="secondary-button" @click="retryLoad">重试</button>
        </div>
        <div v-else-if="!store.initialized" class="habit-empty" role="status">正在读取习惯…</div>
        <div v-else-if="!visibleHabits.length" class="habit-empty">
          <Sprout :size="28"/>
          <h3>{{ store.habits.length ? '今天没有安排习惯' : '还没有习惯' }}</h3>
          <button class="secondary-button" @click="store.habits.length ? view='all' : addHabit()">{{ store.habits.length ? '查看全部习惯' : '创建第一个习惯' }}</button>
        </div>
        <div v-else class="habit-list">
          <article v-for="habit in visibleHabits" :key="habit.id" class="habit-item" :class="{ completed: statsByHabit.get(habit.id)?.todayCompleted, celebrate: celebration===habit.id }">
            <button class="habit-open" :aria-label="`查看${habit.name}详情`" @click="store.openDrawer(habit.id)">
              <span class="habit-avatar" :style="{ background: habit.color + '22', color: habit.color }">{{ habit.icon }}</span>
              <span class="habit-copy">
                <strong>{{ habit.name }}</strong>
                <span>{{ goalLabel(habit) }} · {{ habit.status === 'PAUSED' ? '已暂停' : `连续 ${statsByHabit.get(habit.id)?.currentStreak ?? 0} ${isWeeklyHabit(habit) ? '周' : '天'}` }}</span>
                <span v-if="habit.status==='ACTIVE' && store.isScheduled(habit)" class="habit-value">{{ progressLabel(habit) }}</span>
                <span v-if="habit.status==='ACTIVE' && store.isScheduled(habit) && (isWeeklyHabit(habit) || habit.goalType==='DAILY_DURATION')"
                  class="habit-meter" aria-hidden="true"><i :style="{ width: progressRatio(habit) * 100 + '%' }"/></span>
              </span>
            </button>
            <button v-if="habit.status==='ACTIVE' && store.isScheduled(habit)" class="habit-check" :style="{ '--habit-color': habit.color }"
              :aria-label="`${store.todayRecord(habit.id)?.manualValue ? '取消打卡' : '打卡'} ${habit.name}`"
              :aria-pressed="Boolean(store.todayRecord(habit.id)?.manualValue)" :disabled="Boolean(busyId) || Boolean(statsByHabit.get(habit.id)?.todayCompleted && !store.todayRecord(habit.id)?.manualValue)"
              @click="toggle(habit)"><component :is="store.todayRecord(habit.id)?.manualValue ? RotateCcw : Check" :size="16"/></button>
          </article>
        </div>
      </section>

      <aside class="habit-insights">
        <section class="habit-panel">
          <div class="section-heading"><h3>本周打卡</h3><CalendarDays :size="17"/></div>
          <div class="habit-week">
            <div v-for="(day, index) in week" :key="day" :aria-label="`${day}，完成 ${completedDates.get(day) ?? 0} 项`">
              <span>{{ '一二三四五六日'[index] }}</span><b :class="{ today: day===store.today }">{{ Number(day.slice(-2)) }}</b>
              <i :class="{ done: completedDates.has(day) }">{{ completedDates.get(day) ?? '·' }}</i>
            </div>
          </div>
        </section>
        <section class="habit-panel month-panel">
          <div class="section-heading">
            <button class="icon-button" aria-label="上个月" @click="calendarOffset--"><ChevronLeft :size="17"/></button>
            <h3 aria-live="polite">{{ month.title }}</h3>
            <button class="icon-button" aria-label="下个月" :disabled="calendarOffset>=0" @click="calendarOffset++"><ChevronRight :size="17"/></button>
          </div>
          <div class="habit-calendar-head"><span v-for="day in '一二三四五六日'" :key="day">{{ day }}</span></div>
          <div class="habit-calendar">
            <span v-for="(day, index) in month.cells" :key="day ?? index" :class="{ blank: !day, today: day===store.today, done: day && completedDates.has(day) }"
              :title="day ? `${day} · 完成 ${completedDates.get(day) ?? 0} 项` : undefined">{{ day ? Number(day.slice(-2)) : '' }}</span>
          </div>
        </section>
      </aside>
    </div>

    <HabitForm v-if="store.formOpen" :habit="editing" :today="store.today" :busy="saving" :error="formError" @close="store.formOpen=false" @save="saveHabit"/>
    <HabitDetailDrawer v-if="store.drawerOpen && store.selectedHabit && selectedStats" :habit="store.selectedHabit" :stats="selectedStats"
      :records="store.recordsFor(store.selectedHabit.id)" :busy="Boolean(busyId)" :today="store.today"
      @close="store.closeDrawer()" @edit="editHabit(store.selectedHabit)"
      @status="perform(store.selectedHabit, () => store.selectedHabit?.status==='PAUSED' ? store.resume(store.selectedHabit.id) : store.pause(store.selectedHabit!.id))"
      @remove="perform(store.selectedHabit, () => store.remove(store.selectedHabit!.id))"/>
  </div>
</template>
