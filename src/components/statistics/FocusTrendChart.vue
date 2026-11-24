<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import type { StatisticsRange, StatisticsTrendPoint } from '../../services/statistics/StatisticsTypes'

use([CanvasRenderer, BarChart, LineChart, GridComponent, TooltipComponent])
const props = defineProps<{ points: StatisticsTrendPoint[]; range: StatisticsRange }>()
const emit = defineEmits<{ select: [point: StatisticsTrendPoint] }>()
const formatMinutes = (value: number) => value < 60 ? `${Math.round(value)} 分钟` : `${Math.floor(value / 60)} 小时 ${Math.round(value % 60)} 分钟`
const option = computed<any>(() => {
  const line = props.range === 'WEEK' || props.range === 'ALL'
  return {
    animationDuration: 520, animationDurationUpdate: 420, animationEasingUpdate: 'cubicOut',
    tooltip: { trigger: 'axis', backgroundColor: '#333a34', borderWidth: 0, padding: [9, 12],
      textStyle: { color: '#fff', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(30,35,30,.16)',
      formatter: (params: any[]) => { const point = props.points[params[0]?.dataIndex]; return point ? `<b>${point.label}</b><br/>专注 ${formatMinutes(point.duration / 60000)}<br/>${point.focusCount} 次有效专注` : '' } },
    grid: { left: 12, right: 12, top: 28, bottom: 28, containLabel: true },
    xAxis: { type: 'category', boundaryGap: !line, data: props.points.map(item => item.label), axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e8e5dc' } }, axisLabel: { color: '#8c8c80', margin: 12, hideOverlap: true } },
    yAxis: { type: 'value', min: 0, axisLabel: { color: '#aaa99e', formatter: (value: number) => value >= 60 ? `${Math.round(value / 60)}h` : `${value}m` },
      splitLine: { lineStyle: { color: '#eeeae1', type: 'dashed' } } },
    series: [{ type: line ? 'line' : 'bar', data: props.points.map(item => Math.round(item.duration / 60000)),
      smooth: line ? 0.38 : false, symbol: 'circle', symbolSize: 8, showSymbol: props.points.length < 18,
      barMaxWidth: 32, itemStyle: { color: '#92aa8b', borderRadius: line ? 0 : [7, 7, 2, 2] },
      lineStyle: { color: '#7f9a78', width: 3 }, areaStyle: line ? { color: 'rgba(146,170,139,.12)' } : undefined,
      emphasis: { focus: 'series', itemStyle: { color: '#6f8b68' } } }],
  }
})
function onClick(event: any) { const point = props.points[event.dataIndex]; if (point) emit('select', point) }
</script>

<template><VChart :option="option" autoresize class="analytics-chart" @click="onClick" /></template>
