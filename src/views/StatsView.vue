<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart, HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { Clock3, CheckCircle2, Flame, TrendingUp, ChevronDown, Info } from 'lucide-vue-next'
import { useTaskStore } from '../stores/taskStore'
import { useFocusSessionStore } from '../stores/focusSessionStore'
use([CanvasRenderer,LineChart,PieChart,HeatmapChart,GridComponent,TooltipComponent,VisualMapComponent])
const taskStore = useTaskStore()
const focusStore = useFocusSessionStore()
const dayMs = 24 * 60 * 60 * 1000
const startOfToday = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() }
const formatDuration = (duration:number) => `${Math.floor(duration/3600000)}h ${Math.floor(duration%3600000/60000)}m`
const todayFocus = computed(() => formatDuration(focusStore.todaySummary.duration))
const weekStart = computed(() => { const date = new Date(startOfToday()); const day = date.getDay() || 7; return date.getTime() - (day - 1) * dayMs })
const weekSummary = computed(() => focusStore.rangeSummary(weekStart.value, weekStart.value + 7 * dayMs))
const trendDays = computed(() => Array.from({length:7}, (_, index) => {
  const start = startOfToday() - (6 - index) * dayMs
  return { start, label: index === 6 ? '今天' : new Intl.DateTimeFormat('zh-CN',{weekday:'short'}).format(new Date(start)), duration: focusStore.rangeSummary(start, start + dayMs).duration }
}))
const categoryData = computed(() => {
  const grouped = new Map<string,{name:string;color:string;duration:number}>()
  for (const session of focusStore.validSessions.filter(item => item.endTime >= weekStart.value && item.endTime < weekStart.value + 7 * dayMs)) {
    const task = session.taskId ? taskStore.getTaskById(session.taskId) : null
    const category = task ? taskStore.getCategoryById(task.categoryId) : null
    const key = category?.id ?? 'other-focus'
    const current = grouped.get(key) ?? { name: category?.name ?? (session.taskId ? '已删除任务' : '自由专注'), color: category?.color ?? '#b69caf', duration: 0 }
    current.duration += session.duration
    grouped.set(key, current)
  }
  return [...grouped.values()].sort((a,b)=>b.duration-a.duration)
})
const categoryTotal = computed(() => categoryData.value.reduce((sum,item)=>sum+item.duration,0))
const tooltip={backgroundColor:'#333a34',borderWidth:0,textStyle:{color:'#fff',fontSize:12},padding:[8,12],extraCssText:'border-radius:9px;box-shadow:0 8px 24px rgba(30,35,30,.15)'}
const trendOption=computed(()=>({tooltip:{...tooltip,trigger:'axis',valueFormatter:(value:number)=>`${Math.round(value*60)} 分钟`},grid:{left:12,right:12,top:20,bottom:28,containLabel:true},xAxis:{type:'category',boundaryGap:false,data:trendDays.value.map(item=>item.label),axisLine:{lineStyle:{color:'#e8e5dc'}},axisTick:{show:false},axisLabel:{color:'#8c8c80',margin:12}},yAxis:{type:'value',min:0,max:Math.max(1,Math.ceil(Math.max(...trendDays.value.map(item=>item.duration/3600000)))),interval:1,axisLabel:{formatter:'{value}h',color:'#aaa99e'},splitLine:{lineStyle:{color:'#eeeae1',type:'dashed'}}},series:[{type:'line',smooth:.42,data:trendDays.value.map(item=>Number((item.duration/3600000).toFixed(2))),symbolSize:8,showSymbol:false,lineStyle:{width:3,color:'#92aa8b'},itemStyle:{color:'#92aa8b',borderColor:'#faf9f5',borderWidth:3},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(146,170,139,.28)'},{offset:1,color:'rgba(146,170,139,0)'}]}}}]}))
const pieOption=computed(()=>({tooltip:{...tooltip,trigger:'item',formatter:(p:any)=>`${p.name}<br/>${Math.round(p.value*60)} 分钟 · ${p.percent}%`},series:[{type:'pie',radius:['62%','83%'],center:['50%','50%'],padAngle:3,itemStyle:{borderRadius:6},label:{show:false},data:categoryData.value.map(item=>({value:Number((item.duration/3600000).toFixed(3)),name:item.name,itemStyle:{color:item.color}}))}]}))
const heatData=computed(()=>{const first=weekStart.value-17*7*dayMs;const values:number[][]=[];for(let index=0;index<126;index++){const start=first+index*dayMs;const minutes=Math.round(focusStore.rangeSummary(start,start+dayMs).duration/60000);values.push([Math.floor(index/7),index%7,Math.min(5,Math.ceil(minutes/30)),minutes])}return values})
const heatOption=computed(()=>({tooltip:{...tooltip,formatter:(p:any)=>`${p.value[3]} 分钟专注`},grid:{left:2,right:2,top:2,bottom:2},xAxis:{type:'category',data:Array.from({length:18},(_,i)=>i),show:false},yAxis:{type:'category',data:Array.from({length:7},(_,i)=>i),show:false},visualMap:{show:false,min:0,max:5,inRange:{color:['#efede6','#dbe4d8','#c1d2bc','#a4bc9e','#799574','#587252']}},series:[{type:'heatmap',data:heatData.value,itemStyle:{borderColor:'#faf9f5',borderWidth:4,borderRadius:3}}]}))
const bestDay = computed(() => [...trendDays.value].sort((a,b)=>b.duration-a.duration)[0])
</script>

<template>
  <div class="page stats-page">
    <header class="page-header stats-header"><div><span class="eyebrow">INSIGHTS</span><h1>专注回顾</h1><p>温柔地回看每一份努力，找到属于你的节奏。</p></div><button class="period-select">本周 <ChevronDown :size="16"/></button></header>
    <section class="stat-cards"><div><span class="metric-icon green"><Clock3 :size="19"/></span><p>今日专注</p><strong>{{todayFocus}}</strong><small>{{focusStore.todaySummary.focusCount}} 次有效专注</small></div><div><span class="metric-icon blue"><Flame :size="19"/></span><p>本周专注</p><strong>{{formatDuration(weekSummary.duration)}}</strong><small>完成 {{weekSummary.completedPomodoros}} 个番茄钟</small></div><div><span class="metric-icon gold"><CheckCircle2 :size="19"/></span><p>完成任务</p><strong>{{ taskStore.doneCount }}</strong><small class="positive"><TrendingUp :size="13"/>数据已与任务页同步</small></div></section>
    <section class="chart-grid"><div class="chart-card trend-card"><div class="section-heading"><div><h3>专注趋势</h3><p>过去 7 天的专注时长</p></div><span class="chart-total">{{formatDuration(weekSummary.duration)}} <small>本周累计</small></span></div><VChart :option="trendOption" autoresize class="trend-chart"/></div>
      <div class="chart-card category-chart"><div class="section-heading"><div><h3>时间分配</h3><p>不同分类的专注占比</p></div><Info :size="16"/></div><div class="pie-wrap"><VChart :option="pieOption" autoresize/><div class="pie-center"><strong>{{formatDuration(categoryTotal)}}</strong><span>总计</span></div></div><div class="legend"><span v-for="item in categoryData" :key="item.name"><i :style="{background:item.color}"/>{{item.name}} <b>{{categoryTotal?Math.round(item.duration/categoryTotal*100):0}}%</b></span><span v-if="!categoryData.length">暂无有效记录</span></div></div>
    </section>
    <section class="chart-card heat-card"><div class="section-heading"><div><h3>专注足迹</h3><p>过去 18 周，坚持让时间留下痕迹</p></div><div class="heat-legend"><span>少</span><i/><i/><i/><i/><i/><span>多</span></div></div><div class="heat-content"><div class="week-labels"><span>一</span><span>三</span><span>五</span><span>日</span></div><VChart :option="heatOption" autoresize class="heat-chart"/></div><div class="insight-note"><span>🌿</span><p><strong>{{bestDay.duration?`最近的专注高峰是${bestDay.label}`:'完成一次专注后，这里会出现你的节奏洞察'}}</strong>{{bestDay.duration?'这一天累计专注 '+Math.round(bestDay.duration/60000)+' 分钟。':'所有图表均来自真实专注记录。'}}</p></div></section>
  </div>
</template>
