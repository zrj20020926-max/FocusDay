<script setup lang="ts">
import { X, CalendarDays, Flag, Tags, Clock3, AlignLeft, Check, Play } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
const store = useAppStore()
</script>

<template>
  <Teleport to="body"><transition name="drawer"><div v-if="store.taskDrawerOpen" class="drawer-layer" @mousedown.self="store.taskDrawerOpen = false">
    <aside class="task-drawer" v-if="store.selectedTask">
      <header><span class="drawer-status"><i />{{ store.selectedTask.completed ? '已完成' : '进行中' }}</span><button class="icon-button" @click="store.taskDrawerOpen = false"><X :size="20" /></button></header>
      <div class="drawer-body">
        <button class="drawer-check" :class="{ checked: store.selectedTask.completed }" @click="store.toggleTask(store.selectedTask.id)"><Check :size="18" /></button>
        <h2>{{ store.selectedTask.title }}</h2><p class="drawer-project">Focus Day · 产品设计</p>
        <div class="detail-grid">
          <div><span><CalendarDays :size="16" />截止日期</span><strong>今天，{{ store.selectedTask.due.replace('今天 ', '') }}</strong></div>
          <div><span><Flag :size="16" />优先级</span><strong class="priority">高优先级</strong></div>
          <div><span><Tags :size="16" />分类</span><strong><i :style="{ background: store.selectedTask.color }" />{{ store.selectedTask.category }}</strong></div>
          <div><span><Clock3 :size="16" />预计用时</span><strong>{{ store.selectedTask.estimate }} 分钟</strong></div>
        </div>
        <div class="notes"><span><AlignLeft :size="16" />备注</span><p>梳理核心场景与交互路径，完成高保真页面并检查响应式布局。保持克制、清晰，让每一次点击都有恰到好处的反馈。</p></div>
        <div class="subtasks"><div class="section-heading"><h3>子任务</h3><span>2 / 3</span></div><label><input type="checkbox" checked />整理页面信息层级</label><label><input type="checkbox" checked />完成核心组件设计</label><label><input type="checkbox" />移动端适配检查</label></div>
      </div>
      <footer><button class="secondary-button">移到明天</button><button class="primary-button" @click="$router.push('/focus'); store.taskDrawerOpen=false"><Play :size="17" fill="currentColor"/>开始专注</button></footer>
    </aside>
  </div></transition></Teleport>
</template>
