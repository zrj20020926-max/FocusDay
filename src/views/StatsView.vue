<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { CalendarDays, CheckCircle2, Clock3, Flame, Info, RefreshCw, Target, TimerReset, TrendingUp } from 'lucide-vue-next'
import CategoryDonutChart from '../components/statistics/CategoryDonutChart.vue'
import FocusTrendChart from '../components/statistics/FocusTrendChart.vue'
import StatisticsRangeTabs from '../components/statistics/StatisticsRangeTabs.vue'
import StatisticsRecordList from '../components/statistics/StatisticsRecordList.vue'
import TaskCompletionChart from '../components/statistics/TaskCompletionChart.vue'
import { statisticsService } from '../services/statistics/StatisticsService'
import type { CategoryFocusMetric, StatisticsPageData, StatisticsRange, StatisticsTrendPoint } from '../services/statistics/StatisticsTypes'

type DetailFilter = { type: 'date'; point: StatisticsTrendPoint } | { type: 'category'; item: CategoryFocusMetric }

const range = ref<StatisticsRange>('WEEK')
const data = ref<StatisticsPageData | null>(null)
const loading = ref(true)
const error = ref('')
const detail = ref<DetailFilter | null>(null)
let requestId = 0

const durationLabel = (duration: number) => {
  const hours = Math.floor(duration / 3_600_000)
  const minutes = Math.round(duration % 3_600_000 / 60_000)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}
const trendTitle = computed(() => range.value === 'TODAY' ? '今日专注' : range.value === 'WEEK' ? '本周每日趋势' : range.value === 'MONTH' ? '本月每日趋势' : '月度专注趋势')
const selectedRecords = computed(() => {
  const selectedDetail = detail.value
  if (!data.value || !selectedDetail) return []
  if (selectedDetail.type === 'date') return data.value.records.filter(record => range.value === 'ALL'
    ? record.dates.some(date => date.startsWith(selectedDetail.point.key)) : record.dates.includes(selectedDetail.point.key))
  const selected = selectedDetail.item
  return data.value.records.filter(record => record.categoryId === selected.categoryId && record.categoryName === selected.name)
})
const detailTitle = computed(() => detail.value?.type === 'date' ? `${detail.value.point.label}的专注记录` : detail.value ? `${detail.value.item.name}分类记录` : '')

async function load() {
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await statisticsService.getPageData(range.value)
    if (current === requestId) data.value = result
  } catch {
    if (current === requestId) error.value = '统计数据暂时无法读取，请稍后重试'
  } finally { if (current === requestId) loading.value = false }
}
function selectDate(point: StatisticsTrendPoint) { detail.value = { type: 'date', point } }
function selectCategory(item: CategoryFocusMetric) { detail.value = { type: 'category', item } }
function onDataSynced() { statisticsService.invalidate(); void load() }

watch(range, () => { detail.value = null; void load() })
onMounted(() => { window.addEventListener('focus-day:data-synced', onDataSynced); void load() })
onUnmounted(() => window.removeEventListener('focus-day:data-synced', onDataSynced))
</script>

<template>
  <div class="page stats-page analytics-page">
    <header class="page-header stats-header analytics-header">
      <div><span class="eyebrow">INSIGHTS</span><h1>专注回顾</h1><p>从真实记录里，看见时间慢慢积累的方向。</p></div>
      <StatisticsRangeTabs v-model="range" :disabled="loading" />
    </header>

    <div v-if="error" class="stats-error"><Info :size="18"/><span>{{ error }}</span><button @click="load"><RefreshCw :size="15"/>重新加载</button></div>

    <div v-if="loading && !data" class="stats-skeleton" aria-label="正在加载统计数据">
      <div v-for="index in 4" :key="index"/><div class="wide"/><div/><div class="wide"/>
    </div>

    <transition v-else-if="data" name="stats-fade" mode="out-in">
      <div :key="range" class="stats-content" :class="{ refreshing: loading }">
        <section class="analytics-metrics">
          <article><span class="metric-symbol green"><Clock3 :size="19"/></span><div><p>专注总时长</p><strong>{{ durationLabel(data.focusDuration) }}</strong><small>{{ data.rangeLabel }}累计</small></div></article>
          <article><span class="metric-symbol blue"><CheckCircle2 :size="19"/></span><div><p>完成任务数</p><strong>{{ data.completedTasks }}</strong><small>{{ data.rangeLabel }}完成</small></div></article>
          <article><span class="metric-symbol sand"><TimerReset :size="19"/></span><div><p>完成番茄钟</p><strong>{{ data.completedPomodoros }}</strong><small>有效专注轮次</small></div></article>
          <article><span class="metric-symbol coral"><Flame :size="19"/></span><div><p>连续专注</p><strong>{{ data.focusStreakDays }}<i>天</i></strong><small>保持自己的节奏</small></div></article>
        </section>

        <section class="analytics-grid">
          <article class="analytics-card trend-analytics-card">
            <header class="analytics-card-heading"><div><span class="card-kicker"><TrendingUp :size="14"/>FOCUS TREND</span><h2>{{ trendTitle }}</h2><p>点击数据点查看当天的专注记录</p></div><strong>{{ durationLabel(data.focusDuration) }}<small>{{ data.rangeLabel }}总计</small></strong></header>
            <FocusTrendChart v-if="data.trend.some(item => item.duration > 0)" :points="data.trend" :range="range" @select="selectDate"/>
            <div v-else class="chart-empty large"><span><CalendarDays :size="24"/></span><strong>这段时间还没有专注记录</strong><p>开始一次专注后，时间趋势会在这里自然生长。</p></div>
          </article>

          <article class="analytics-card category-analytics-card">
            <header class="analytics-card-heading compact"><div><span class="card-kicker"><Target :size="14"/>TIME SHARE</span><h2>分类时间占比</h2><p>点击分类筛选专注记录</p></div></header>
            <CategoryDonutChart :items="data.categories" @select="selectCategory"/>
            <div v-if="data.categories.length" class="analytics-legend">
              <button v-for="item in data.categories" :key="`${item.categoryId}-${item.name}`" @click="selectCategory(item)"><i :style="{ background: item.color }"/><span>{{ item.name }}</span><b>{{ Math.round(item.percentage * 100) }}%</b></button>
            </div>
          </article>

          <article class="analytics-card task-analytics-card">
            <header class="analytics-card-heading"><div><span class="card-kicker"><CheckCircle2 :size="14"/>TASK COMPLETION</span><h2>任务完成分析</h2><p>每日完成任务数量与整体完成率</p></div><strong>{{ Math.round(data.taskCompletionRate * 100) }}%<small>当前完成率</small></strong></header>
            <div class="task-analysis-body">
              <div class="completion-ring" :style="{ '--completion': `${Math.round(data.taskCompletionRate * 100) * 3.6}deg` }"><div><strong>{{ data.totalCompletedTasks }}</strong><span>/ {{ data.totalTasks }} 个任务</span></div></div>
              <TaskCompletionChart v-if="data.trend.some(item => item.completedTasks > 0)" :points="data.trend"/>
              <div v-else class="chart-empty task-empty"><strong>暂无完成记录</strong><p>完成任务后会形成每日趋势。</p></div>
            </div>
          </article>

          <article class="analytics-card rhythm-card">
            <div class="rhythm-mark"><Flame :size="22"/></div><div><span class="card-kicker">CURRENT RHYTHM</span><h2>{{ data.focusStreakDays ? `已连续专注 ${data.focusStreakDays} 天` : '从今天开始积累节奏' }}</h2><p>{{ data.focusStreakDays ? '持续并不意味着用力过猛，稳定地回来就很好。' : '一次短暂但完整的专注，也值得被记录。' }}</p></div>
          </article>
        </section>

        <transition name="record-panel"><StatisticsRecordList v-if="detail" :title="detailTitle" :records="selectedRecords" @close="detail = null"/></transition>
      </div>
    </transition>
  </div>
</template>
