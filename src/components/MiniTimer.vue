<script setup lang="ts">
import { computed } from 'vue'
import { Play, Pause, RotateCcw } from 'lucide-vue-next'
import { useTimer } from '../composables/useTimer'
import { useTaskStore } from '../stores/taskStore'

const { timer, state, displayTime, progress, isRunning, modeLabel, phaseLabel } = useTimer()
const taskStore = useTaskStore()
const taskTitle = computed(() => taskStore.getTaskById(state.value.taskId)?.title ?? '暂未选择任务')

function resetCurrent() {
  if (['RUNNING', 'PAUSED'].includes(state.value.status)) timer.cancel()
  if (state.value.mode === 'COUNTDOWN') timer.reset()
  else timer.selectMode(state.value.mode)
}
</script>

<template>
  <section class="mini-timer card">
    <div class="section-heading"><div><span class="eyebrow">FOCUS NOW</span><h3>专注计时</h3></div><span class="live-pill"><i />{{state.mode==='POMODORO'?phaseLabel:modeLabel}}</span></div>
    <div class="mini-clock"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="53"/><circle class="progress" cx="60" cy="60" r="53" :style="{strokeDashoffset:333-333*progress/100}"/></svg><div><strong>{{ displayTime }}</strong><span>{{isRunning?'保持专注':state.status==='PAUSED'?'已暂停':'准备开始'}}</span></div></div>
    <div class="current-task"><span>当前任务</span><strong>{{taskTitle}}</strong></div>
    <div class="timer-actions"><button class="timer-reset" title="重置计时" @click="resetCurrent"><RotateCcw :size="17" /></button><button class="timer-play" @click="timer.toggle()"><component :is="isRunning ? Pause : Play" :size="20" fill="currentColor" />{{ isRunning ? '暂停' : state.status==='PAUSED' ? '继续' : '开始专注' }}</button></div>
  </section>
</template>
