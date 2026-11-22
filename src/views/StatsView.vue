<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, PieChart, HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { Clock3, CheckCircle2, Flame, TrendingUp, ChevronDown, Info } from 'lucide-vue-next'
use([CanvasRenderer,LineChart,PieChart,HeatmapChart,GridComponent,TooltipComponent,VisualMapComponent])
const tooltip={backgroundColor:'#333a34',borderWidth:0,textStyle:{color:'#fff',fontSize:12},padding:[8,12],extraCssText:'border-radius:9px;box-shadow:0 8px 24px rgba(30,35,30,.15)'}
const trendOption=computed(()=>({tooltip:{...tooltip,trigger:'axis'},grid:{left:12,right:12,top:20,bottom:28,containLabel:true},xAxis:{type:'category',boundaryGap:false,data:['周一','周二','周三','周四','周五','周六','今天'],axisLine:{lineStyle:{color:'#e8e5dc'}},axisTick:{show:false},axisLabel:{color:'#8c8c80',margin:12}},yAxis:{type:'value',min:0,max:5,interval:1,axisLabel:{formatter:'{value}h',color:'#aaa99e'},splitLine:{lineStyle:{color:'#eeeae1',type:'dashed'}}},series:[{type:'line',smooth:.42,data:[2.1,3.2,2.6,4.1,3.6,1.8,2.6],symbolSize:8,showSymbol:false,lineStyle:{width:3,color:'#92aa8b'},itemStyle:{color:'#92aa8b',borderColor:'#faf9f5',borderWidth:3},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(146,170,139,.28)'},{offset:1,color:'rgba(146,170,139,0)'}]}}}]}))
const pieOption=computed(()=>({tooltip:{...tooltip,trigger:'item',formatter:'{b}<br/>{c} 小时 · {d}%'},series:[{type:'pie',radius:['62%','83%'],center:['50%','50%'],padAngle:3,itemStyle:{borderRadius:6},label:{show:false},data:[{value:8.4,name:'工作',itemStyle:{color:'#92aa8b'}},{value:4.6,name:'学习',itemStyle:{color:'#9aa8be'}},{value:2.8,name:'创作',itemStyle:{color:'#b69caf'}},{value:1.7,name:'生活',itemStyle:{color:'#d5a98e'}}]}]}))
const heatData=[] as number[][]; for(let x=0;x<18;x++)for(let y=0;y<7;y++)heatData.push([x,y,((x*3+y*5+x*y)%6)])
const heatOption=computed(()=>({tooltip:{...tooltip,formatter:(p:any)=>`${p.value[2]*18} 分钟专注`},grid:{left:2,right:2,top:2,bottom:2},xAxis:{type:'category',data:Array.from({length:18},(_,i)=>i),show:false},yAxis:{type:'category',data:Array.from({length:7},(_,i)=>i),show:false},visualMap:{show:false,min:0,max:5,inRange:{color:['#efede6','#dbe4d8','#c1d2bc','#a4bc9e','#799574','#587252']}},series:[{type:'heatmap',data:heatData,itemStyle:{borderColor:'#faf9f5',borderWidth:4,borderRadius:3}}]}))
</script>

<template>
  <div class="page stats-page">
    <header class="page-header stats-header"><div><span class="eyebrow">INSIGHTS</span><h1>专注回顾</h1><p>温柔地回看每一份努力，找到属于你的节奏。</p></div><button class="period-select">本周 <ChevronDown :size="16"/></button></header>
    <section class="stat-cards"><div><span class="metric-icon green"><Clock3 :size="19"/></span><p>今日专注</p><strong>2h 35m</strong><small class="positive"><TrendingUp :size="13"/>比昨日多 24 分钟</small></div><div><span class="metric-icon blue"><Flame :size="19"/></span><p>本周专注</p><strong>17h 28m</strong><small>目标完成度 78%</small></div><div><span class="metric-icon gold"><CheckCircle2 :size="19"/></span><p>完成任务</p><strong>24</strong><small class="positive"><TrendingUp :size="13"/>较上周提升 14%</small></div></section>
    <section class="chart-grid"><div class="chart-card trend-card"><div class="section-heading"><div><h3>专注趋势</h3><p>过去 7 天的专注时长</p></div><span class="chart-total">17h 28m <small>本周累计</small></span></div><VChart :option="trendOption" autoresize class="trend-chart"/></div>
      <div class="chart-card category-chart"><div class="section-heading"><div><h3>时间分配</h3><p>不同分类的专注占比</p></div><Info :size="16"/></div><div class="pie-wrap"><VChart :option="pieOption" autoresize/><div class="pie-center"><strong>17.5h</strong><span>总计</span></div></div><div class="legend"><span><i style="background:#92aa8b"/>工作 <b>48%</b></span><span><i style="background:#9aa8be"/>学习 <b>26%</b></span><span><i style="background:#b69caf"/>创作 <b>16%</b></span><span><i style="background:#d5a98e"/>生活 <b>10%</b></span></div></div>
    </section>
    <section class="chart-card heat-card"><div class="section-heading"><div><h3>专注足迹</h3><p>过去 18 周，坚持让时间留下痕迹</p></div><div class="heat-legend"><span>少</span><i/><i/><i/><i/><i/><span>多</span></div></div><div class="heat-content"><div class="week-labels"><span>一</span><span>三</span><span>五</span><span>日</span></div><VChart :option="heatOption" autoresize class="heat-chart"/></div><div class="insight-note"><span>🌿</span><p><strong>你的专注高峰在周四</strong>下午 2 点至 5 点是你最容易进入状态的时段，试着把重要任务留给它。</p></div></section>
  </div>
</template>
