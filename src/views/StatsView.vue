<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Flame, Info, RefreshCw, Target, TimerReset, TrendingUp } from 'lucide-vue-next'
import CategoryDonutChart from '../components/statistics/CategoryDonutChart.vue'
import FocusTrendChart from '../components/statistics/FocusTrendChart.vue'
import FocusHeatmap from '../components/statistics/FocusHeatmap.vue'
import FocusStreakCard from '../components/statistics/FocusStreakCard.vue'
import HourlyFocusChart from '../components/statistics/HourlyFocusChart.vue'
import StatisticsRangeTabs from '../components/statistics/StatisticsRangeTabs.vue'
import StatisticsRecordList from '../components/statistics/StatisticsRecordList.vue'
import StatisticsReport from '../components/statistics/StatisticsReport.vue'
import TaskCompletionChart from '../components/statistics/TaskCompletionChart.vue'
import { statisticsService } from '../services/statistics/StatisticsService'
import type { CategoryFocusMetric, FocusDistributionData, FocusHeatmapDay, FocusHeatmapRange, StatisticsPageData, StatisticsRange, StatisticsReportData, StatisticsReportType, StatisticsTrendPoint } from '../services/statistics/StatisticsTypes'

type DetailFilter = { type: 'date'; point: StatisticsTrendPoint } | { type: 'category'; item: CategoryFocusMetric } | { type: 'heatmap'; date: string }

const range = ref<StatisticsRange>('WEEK')
const data = ref<StatisticsPageData | null>(null)
const loading = ref(true)
const error = ref('')
const detail = ref<DetailFilter | null>(null)
const heatmapRange = ref<FocusHeatmapRange>('YEAR')
const heatmapYear = ref(new Date().getFullYear())
const distribution = ref<FocusDistributionData | null>(null)
const distributionLoading = ref(true)
const distributionError = ref('')
const reportType = ref<StatisticsReportType>('WEEK')
const reportAnchor = ref(Date.now())
const report = ref<StatisticsReportData | null>(null)
const reportLoading = ref(true)
const reportError = ref('')
let requestId = 0
let distributionRequestId = 0
let reportRequestId = 0

const durationLabel = (duration: number) => {
  const hours = Math.floor(duration / 3_600_000)
  const minutes = Math.round(duration % 3_600_000 / 60_000)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}
const trendTitle = computed(() => range.value === 'TODAY' ? '今日专注' : range.value === 'WEEK' ? '本周每日趋势' : range.value === 'MONTH' ? '本月每日趋势' : '月度专注趋势')
const selectedRecords = computed(() => {
  const selectedDetail = detail.value
  if (!selectedDetail) return []
  if (selectedDetail.type === 'heatmap') return distribution.value?.records.filter(record => record.dates.includes(selectedDetail.date)) ?? []
  if (!data.value) return []
  if (selectedDetail.type === 'date') return data.value.records.filter(record => range.value === 'ALL'
    ? record.dates.some(date => date.startsWith(selectedDetail.point.key)) : record.dates.includes(selectedDetail.point.key))
  const selected = selectedDetail.item
  return data.value.records.filter(record => record.categoryId === selected.categoryId && record.categoryName === selected.name)
})
const detailTitle = computed(() => detail.value?.type === 'date' ? `${detail.value.point.label}的专注记录`
  : detail.value?.type === 'category' ? `${detail.value.item.name}分类记录` : detail.value ? `${detail.value.date} 的专注记录` : '')
const peakHourLabel = computed(() => distribution.value?.peakHour == null ? '暂无' : `${String(distribution.value.peakHour).padStart(2, '0')}:00`)
const canNextReport = computed(() => Boolean(report.value && report.value.end <= Date.now()))

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
async function loadDistribution() {
  const current = ++distributionRequestId
  distributionLoading.value = true
  distributionError.value = ''
  try {
    const result = await statisticsService.getFocusDistribution(heatmapRange.value, heatmapYear.value)
    if (current === distributionRequestId) { distribution.value = result; heatmapYear.value = result.year }
  } catch {
    if (current === distributionRequestId) distributionError.value = '专注分布暂时无法读取，请稍后重试'
  } finally { if (current === distributionRequestId) distributionLoading.value = false }
}
async function loadReport() {
  const current = ++reportRequestId
  reportLoading.value = true
  reportError.value = ''
  try {
    const result = await statisticsService.getReport(reportType.value, reportAnchor.value)
    if (current === reportRequestId) report.value = result
  } catch {
    if (current === reportRequestId) reportError.value = '专注报告暂时无法生成，请稍后重试'
  } finally { if (current === reportRequestId) reportLoading.value = false }
}
function selectDate(point: StatisticsTrendPoint) { detail.value = { type: 'date', point } }
function selectCategory(item: CategoryFocusMetric) { detail.value = { type: 'category', item } }
function selectHeatmapDay(day: FocusHeatmapDay) { detail.value = { type: 'heatmap', date: day.date } }
function setHeatmapRange(value: FocusHeatmapRange) { if (heatmapRange.value !== value) heatmapRange.value = value }
function changeHeatmapYear(delta: number) { heatmapYear.value = Math.min(new Date().getFullYear(), heatmapYear.value + delta) }
function changeReportType(type: StatisticsReportType) { if (reportType.value === type) return; reportType.value = type; reportAnchor.value = Date.now() }
function previousReport() { if (report.value) reportAnchor.value = report.value.start - 1 }
function nextReport() { if (report.value && canNextReport.value) reportAnchor.value = report.value.end + 1 }
function onDataSynced() { statisticsService.invalidate(); void load(); void loadDistribution(); void loadReport() }

watch(range, () => { detail.value = null; void load() })
watch([heatmapRange, heatmapYear], () => { detail.value = null; void loadDistribution() })
watch([reportType, reportAnchor], () => void loadReport())
onMounted(() => { window.addEventListener('focus-day:data-synced', onDataSynced); void load(); void loadDistribution(); void loadReport() })
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

        <div v-if="reportError" class="stats-error report-error"><Info :size="17"/><span>{{ reportError }}</span><button @click="loadReport"><RefreshCw :size="14"/>重新生成</button></div>
        <div v-if="reportLoading && !report" class="report-loading"><div/><div/><div/></div>
        <StatisticsReport v-else-if="report" :report="report" :loading="reportLoading" :can-next="canNextReport"
          @change-type="changeReportType" @previous="previousReport" @next="nextReport"/>

        <section class="distribution-section">
          <div class="distribution-intro"><div><span class="eyebrow">FOCUS RHYTHM</span><h2>时间分布</h2><p>从一年中的坚持，到一天里的高效时刻。</p></div></div>
          <div v-if="distributionError" class="stats-error compact"><Info :size="17"/><span>{{ distributionError }}</span><button @click="loadDistribution"><RefreshCw :size="14"/>重试</button></div>
          <div v-if="distributionLoading && !distribution" class="distribution-skeleton"><div/><div/><div/></div>
          <div v-else-if="distribution" class="distribution-grid" :class="{ refreshing: distributionLoading }">
            <article class="analytics-card heatmap-analysis-card">
              <header class="analytics-card-heading heatmap-heading">
                <div><span class="card-kicker"><CalendarDays :size="14"/>FOCUS MAP</span><h2>{{ heatmapRange === 'YEAR' ? `${distribution.year} 年专注热力图` : '最近 90 天专注热力图' }}</h2><p>每个格子代表一天，点击查看当天的专注记录</p></div>
                <div class="heatmap-controls">
                  <div class="heatmap-range-switch"><button :class="{ active: heatmapRange === 'YEAR' }" @click="setHeatmapRange('YEAR')">年度</button><button :class="{ active: heatmapRange === 'RECENT_90' }" @click="setHeatmapRange('RECENT_90')">最近 90 天</button></div>
                  <div v-if="heatmapRange === 'YEAR'" class="year-switcher"><button aria-label="上一年" @click="changeHeatmapYear(-1)"><ChevronLeft :size="16"/></button><strong>{{ heatmapYear }}</strong><button aria-label="下一年" :disabled="heatmapYear >= new Date().getFullYear()" @click="changeHeatmapYear(1)"><ChevronRight :size="16"/></button></div>
                </div>
              </header>
              <FocusHeatmap :days="distribution.heatmap" :empty="distribution.empty" @select="selectHeatmapDay"/>
            </article>

            <article class="analytics-card hourly-analysis-card">
              <header class="analytics-card-heading"><div><span class="card-kicker"><Clock3 :size="14"/>DAILY CLOCK</span><h2>24 小时专注分布</h2><p>按有效专注时间与每个小时区间的交集计算</p></div><strong>{{ peakHourLabel }}<small>专注高峰</small></strong></header>
              <HourlyFocusChart v-if="!distribution.empty" :points="distribution.hourly"/>
              <div v-else class="chart-empty hourly-empty"><strong>暂无时段分布</strong><p>专注记录会按实际经过的小时拆分，而不是只看开始时间。</p></div>
              <div class="daypart-summary">
                <div><span>上午</span><strong>{{ durationLabel(distribution.morningDuration) }}</strong><small>00:00–12:00</small></div>
                <div><span>下午</span><strong>{{ durationLabel(distribution.afternoonDuration) }}</strong><small>12:00–18:00</small></div>
                <div><span>晚间</span><strong>{{ durationLabel(distribution.eveningDuration) }}</strong><small>18:00–24:00</small></div>
              </div>
            </article>
            <FocusStreakCard :metric="distribution.streak"/>
          </div>
        </section>

        <transition name="record-panel"><StatisticsRecordList v-if="detail" :title="detailTitle" :records="selectedRecords" @close="detail = null"/></transition>
      </div>
    </transition>
  </div>
</template>
