<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { Layers3 } from 'lucide-vue-next'
import type { CategoryFocusMetric } from '../../services/statistics/StatisticsTypes'

use([CanvasRenderer, PieChart, TooltipComponent])
const props = defineProps<{ items: CategoryFocusMetric[] }>()
const emit = defineEmits<{ select: [item: CategoryFocusMetric] }>()
const total = computed(() => props.items.reduce((sum, item) => sum + item.duration, 0))
const option = computed(() => ({
  animationDuration: 520, animationDurationUpdate: 420,
  tooltip: { trigger: 'item', backgroundColor: '#333a34', borderWidth: 0, padding: [9, 12], textStyle: { color: '#fff', fontSize: 12 },
    extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(30,35,30,.16)',
    formatter: (params: any) => `${params.name}<br/>${Math.round(params.value / 60000)} 分钟 · ${params.percent}%` },
  series: [{ type: 'pie', radius: ['64%', '84%'], center: ['50%', '50%'], padAngle: 3, minAngle: 3,
    itemStyle: { borderRadius: 7, borderColor: '#faf9f5', borderWidth: 2 }, label: { show: false },
    emphasis: { scaleSize: 7 }, data: props.items.map(item => ({ value: item.duration, name: item.name, itemStyle: { color: item.color } })) }],
}))
function onClick(event: any) { const item = props.items[event.dataIndex]; if (item) emit('select', item) }
</script>

<template>
  <div v-if="items.length" class="donut-chart-wrap">
    <VChart :option="option" autoresize class="donut-chart" @click="onClick" />
    <div class="donut-center"><strong>{{ Math.round(total / 60000) }}</strong><span>分钟</span></div>
  </div>
  <div v-else class="chart-empty"><span><Layers3 :size="22" /></span><strong>还没有分类数据</strong><p>完成一次关联任务的专注后，这里会出现时间分配。</p></div>
</template>
