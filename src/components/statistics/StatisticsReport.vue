<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarCheck2, Check, Clipboard, FileSearch, Target, Trophy } from 'lucide-vue-next'
import { useAppStore } from '../../stores/app'
import type { StatisticsReportData, StatisticsReportType, StatisticsTrendPoint } from '../../services/statistics/StatisticsTypes'
import FocusTrendChart from './FocusTrendChart.vue'

const props = defineProps<{ report: StatisticsReportData; loading: boolean; canNext: boolean }>()
const emit = defineEmits<{ changeType: [type: StatisticsReportType]; previous: []; next: [] }>()
const appStore = useAppStore()
const showSources = ref(false)
const selectedDate = ref<string | null>(null)
const expandedTaskId = ref<string | null>(null)

const durationLabel = (duration: number) => {
  const hours = Math.floor(duration / 3_600_000)
  const minutes = Math.round(duration % 3_600_000 / 60_000)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}
const comparisonLabel = computed(() => {
  if (props.report.comparisonRate === null) return '上个周期暂无可比数据'
  if (props.report.comparisonRate === 0) return '与上个周期持平'
  return `较上个周期${props.report.comparisonRate > 0 ? '增加' : '减少'} ${Math.round(Math.abs(props.report.comparisonRate) * 100)}%`
})
const trend = computed<StatisticsTrendPoint[]>(() => props.report.daily.map(day => ({
  key: day.date, label: `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8))}`, duration: day.duration,
  completedTasks: 0, completedPomodoros: day.completedPomodoros, focusCount: day.focusCount,
  start: Date.parse(`${day.date}T00:00:00Z`), end: Date.parse(`${day.date}T23:59:59Z`),
})))
const visibleRecords = computed(() => selectedDate.value
  ? props.report.records.filter(record => record.dates.includes(selectedDate.value!)) : props.report.records)
const goalPercent = computed(() => Math.min(100, Math.round(props.report.goalAchievementRate * 100)))

function selectDate(point: StatisticsTrendPoint) { selectedDate.value = point.key; showSources.value = true }
function toggleTask(id: string) { expandedTaskId.value = expandedTaskId.value === id ? null : id }
async function copySummary() {
  try {
    const text = props.report.summaries.join('\n')
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
    else {
      const textarea = document.createElement('textarea')
      textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      try { textarea.select(); if (!document.execCommand('copy')) throw new Error('copy failed') }
      finally { textarea.remove() }
    }
    appStore.notify('报告摘要已复制')
  } catch { appStore.notify('复制失败，请稍后重试') }
}
watch(() => props.report.startKey, () => { selectedDate.value = null; expandedTaskId.value = null })
</script>

<template>
  <section class="report-section" :class="{ refreshing: loading }">
    <header class="report-toolbar">
      <div><span class="eyebrow">PERSONAL REPORT</span><h2>专注报告</h2><p>每一项结论，都可以回到真实记录中查看。</p></div>
      <div class="report-actions">
        <div class="report-type-switch"><button :class="{ active: report.type === 'WEEK' }" @click="emit('changeType','WEEK')">周报</button><button :class="{ active: report.type === 'MONTH' }" @click="emit('changeType','MONTH')">月报</button></div>
        <button class="copy-report" @click="copySummary"><Clipboard :size="15"/>复制摘要</button>
      </div>
    </header>

    <article class="report-paper">
      <header class="report-period-header">
        <div><span>{{ report.type === 'WEEK' ? 'WEEKLY REVIEW' : 'MONTHLY REVIEW' }}</span><h3>{{ report.periodLabel }}</h3></div>
        <div class="report-period-nav"><button @click="emit('previous')">上一周期</button><button :disabled="!canNext" @click="emit('next')">下一周期</button></div>
      </header>

      <div class="report-hero">
        <div class="report-main-number"><span>{{ report.type === 'WEEK' ? '周期专注' : '月度专注' }}</span><strong>{{ durationLabel(report.focusDuration) }}</strong><p :class="{ positive: (report.comparisonRate ?? 0) > 0, negative: (report.comparisonRate ?? 0) < 0 }">{{ comparisonLabel }}</p></div>
        <div class="report-summary"><p v-for="summary in report.summaries" :key="summary">{{ summary }}</p></div>
      </div>

      <div class="report-metrics">
        <div><span><Check :size="15"/>完成任务</span><strong>{{ report.completedTasks }}<i>项</i></strong></div>
        <div><span><CalendarCheck2 :size="15"/>专注天数</span><strong>{{ report.focusedDays }}<i>天</i></strong></div>
        <div><span><Trophy :size="15"/>最长连续</span><strong>{{ report.longestStreak }}<i>天</i></strong></div>
        <div><span><Target :size="15"/>目标进度</span><strong>{{ Math.round(report.goalAchievementRate * 100) }}<i>%</i></strong></div>
      </div>

      <div class="report-body-grid">
        <div class="report-trend">
          <div class="report-subheading"><div><h4>每日专注趋势</h4><p>点击日期查看对应记录</p></div><span v-if="report.bestDay">高峰 {{ report.bestDay.date.slice(5) }} · {{ durationLabel(report.bestDay.duration) }}</span></div>
          <FocusTrendChart v-if="report.daily.some(day => day.duration > 0)" :points="trend" :range="report.type" @select="selectDate"/>
          <div v-else class="chart-empty report-chart-empty"><strong>本周期暂无专注趋势</strong><p>完成一次有效专注后，报告会自动更新。</p></div>
        </div>
        <aside class="report-side">
          <div class="report-goal"><div class="report-subheading"><div><h4>专注目标</h4><p>{{ durationLabel(report.focusDuration) }} / {{ durationLabel(report.goalDuration) }}</p></div><b>{{ goalPercent }}%</b></div><div class="report-progress"><i :style="{ width: `${goalPercent}%` }"/></div></div>
          <div class="report-highlight"><span>TOP CATEGORY</span><template v-if="report.topCategory"><i :style="{ background: report.topCategory.color }"/><strong>{{ report.topCategory.name }}</strong><p>{{ durationLabel(report.topCategory.duration) }} · {{ Math.round(report.topCategory.percentage * 100) }}%</p></template><template v-else><strong>暂无分类数据</strong><p>关联任务专注后显示</p></template></div>
        </aside>
      </div>

      <footer class="report-source-toggle"><button @click="showSources = !showSources"><FileSearch :size="16"/>{{ showSources ? '收起统计来源' : '查看具体统计来源' }}</button><span>数据来自 {{ report.records.length }} 条有效专注记录</span></footer>

      <transition name="record-panel">
        <div v-if="showSources" class="report-sources">
          <div class="source-heading"><div><h4>统计来源</h4><p>{{ selectedDate ? `已筛选 ${selectedDate}` : '当前周期全部记录' }}</p></div><button v-if="selectedDate" @click="selectedDate = null">清除日期筛选</button></div>
          <div class="source-columns">
            <div class="source-task-list"><h5>任务明细 · {{ report.sourceTasks.length }}</h5><p v-if="!report.sourceTasks.length" class="source-empty">暂无关联任务</p>
              <article v-for="task in report.sourceTasks" :key="task.id" :class="{ expanded: expandedTaskId === task.id }">
                <button @click="toggleTask(task.id)"><i :style="{ background: task.categoryColor }"/><span><strong>{{ task.title }}</strong><small>{{ task.categoryName }}</small></span><b>{{ durationLabel(task.focusDuration) }}</b></button>
                <div v-if="expandedTaskId === task.id" class="source-task-detail"><span>专注 {{ report.records.filter(record => record.taskId === task.id).length }} 次</span><span>{{ task.completedAt ? '已完成' : '未在本周期完成' }}</span></div>
              </article>
            </div>
            <div class="source-record-list"><h5>专注记录 · {{ visibleRecords.length }}</h5><p v-if="!visibleRecords.length" class="source-empty">该日期暂无有效专注记录</p>
              <article v-for="record in visibleRecords" :key="record.id"><i :style="{ background: record.categoryColor }"/><span><strong>{{ record.taskTitle }}</strong><small>{{ new Date(record.startTime).toLocaleString('zh-CN',{ month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' }) }}</small></span><b>{{ durationLabel(record.duration) }}</b></article>
            </div>
          </div>
        </div>
      </transition>
    </article>
  </section>
</template>
