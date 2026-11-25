<script setup lang="ts">
import { computed } from 'vue'
import { useChartPalette } from '../../composables/useChartPalette'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import type { StatisticsTrendPoint } from '../../services/statistics/StatisticsTypes'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])
const props = defineProps<{ points: StatisticsTrendPoint[] }>()
const palette = useChartPalette()
const option = computed(() => ({
  animationDuration: 480, animationDurationUpdate: 360,
  tooltip: { trigger: 'axis', backgroundColor: palette.value.tooltip, borderWidth: 0, padding: [8, 11], textStyle: { color: palette.value.tooltipText, fontSize: 12 },
    formatter: (params: any[]) => { const point = props.points[params[0]?.dataIndex]; return point ? `${point.label}<br/>完成 ${point.completedTasks} 个任务` : '' } },
  grid: { left: 8, right: 8, top: 18, bottom: 25, containLabel: true },
  xAxis: { type: 'category', data: props.points.map(item => item.label), axisTick: { show: false }, axisLine: { lineStyle: { color: palette.value.grid } },
    axisLabel: { color: palette.value.label, hideOverlap: true, margin: 10 } },
  yAxis: { type: 'value', minInterval: 1, min: 0, axisLabel: { color: palette.value.label }, splitLine: { lineStyle: { color: palette.value.grid, type: 'dashed' } } },
  series: [{ type: 'bar', barMaxWidth: 22, data: props.points.map(item => item.completedTasks),
    itemStyle: { color: palette.value.amber, borderRadius: [6, 6, 2, 2] }, emphasis: { itemStyle: { color: palette.value.accentStrong } } }],
}))
</script>

<template><VChart :option="option" autoresize class="task-analysis-chart" /></template>
