<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import type { HourlyFocusPoint } from '../../services/statistics/StatisticsTypes'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])
const props = defineProps<{ points: HourlyFocusPoint[] }>()
const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const formatDuration = (value: number) => value >= 3_600_000 ? `${(value / 3_600_000).toFixed(1)} 小时` : `${Math.round(value / 60_000)} 分钟`
const option = computed<any>(() => ({
  animation: !reducedMotion,
  animationDuration: 500,
  animationEasing: 'cubicOut',
  grid: { left: 8, right: 8, top: 18, bottom: 24, containLabel: true },
  tooltip: { trigger: 'axis', backgroundColor: '#333a34', borderWidth: 0, padding: [8, 11], textStyle: { color: '#faf9f5', fontSize: 12 },
    axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(146,170,139,.10)' } },
    formatter: (params: any[]) => `<b>${params[0].axisValue}–${String((Number(params[0].axisValue.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00</b><br/>${formatDuration(params[0].value)}` },
  xAxis: { type: 'category', data: props.points.map(item => item.label), axisTick: { show: false }, axisLine: { lineStyle: { color: '#e8e5dc' } },
    axisLabel: { color: '#95978e', fontSize: 10, interval: 2 } },
  yAxis: { type: 'value', splitNumber: 3, axisLabel: { color: '#a0a198', fontSize: 10, formatter: (value: number) => `${Math.round(value / 60_000)}m` },
    splitLine: { lineStyle: { color: '#ebe9e2', type: 'dashed' } } },
  series: [{ type: 'bar', data: props.points.map(item => item.duration), barMaxWidth: 15, itemStyle: { color: '#92aa8b', borderRadius: [4, 4, 1, 1] },
    emphasis: { itemStyle: { color: '#6f8d69' } } }],
}))
</script>

<template><VChart class="hourly-focus-chart" :option="option" autoresize/></template>
