<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import type { StatisticsTrendPoint } from '../../services/statistics/StatisticsTypes'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])
const props = defineProps<{ points: StatisticsTrendPoint[] }>()
const option = computed(() => ({
  animationDuration: 480, animationDurationUpdate: 360,
  tooltip: { trigger: 'axis', backgroundColor: '#333a34', borderWidth: 0, padding: [8, 11], textStyle: { color: '#fff', fontSize: 12 },
    formatter: (params: any[]) => { const point = props.points[params[0]?.dataIndex]; return point ? `${point.label}<br/>完成 ${point.completedTasks} 个任务` : '' } },
  grid: { left: 8, right: 8, top: 18, bottom: 25, containLabel: true },
  xAxis: { type: 'category', data: props.points.map(item => item.label), axisTick: { show: false }, axisLine: { lineStyle: { color: '#e8e5dc' } },
    axisLabel: { color: '#96968c', hideOverlap: true, margin: 10 } },
  yAxis: { type: 'value', minInterval: 1, min: 0, axisLabel: { color: '#aaa99e' }, splitLine: { lineStyle: { color: '#eeeae1', type: 'dashed' } } },
  series: [{ type: 'bar', barMaxWidth: 22, data: props.points.map(item => item.completedTasks),
    itemStyle: { color: '#b9aa8f', borderRadius: [6, 6, 2, 2] }, emphasis: { itemStyle: { color: '#9d8d72' } } }],
}))
</script>

<template><VChart :option="option" autoresize class="task-analysis-chart" /></template>
