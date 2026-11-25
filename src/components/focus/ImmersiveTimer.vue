<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, Maximize2, Pause, Play, RotateCcw, Square } from 'lucide-vue-next'
import type { Task } from '../../types/task'
import type { TimerState } from '../../types/timer'

const props = defineProps<{
  state: TimerState
  displayTime: string
  progress: number
  isRunning: boolean
  phaseLabel: string
  tasks: Task[]
  fullscreen?: boolean
}>()
const emit = defineEmits<{ setTask: [id: string | null]; toggle: []; finish: []; cancel: []; reset: []; enterFullscreen: [] }>()
const modeLabels = { POMODORO: '番茄钟', STOPWATCH: '正计时', COUNTDOWN: '倒计时' } as const
const active = computed(() => ['RUNNING', 'PAUSED'].includes(props.state.status))
const selectedTask = computed({ get: () => props.state.taskId ?? '', set: (value: string) => emit('setTask', value || null) })
const helperText = computed(() => props.isRunning
  ? (props.state.currentPhase === 'FOCUS' ? '正在专注 · 保持呼吸' : '休息一下 · 为下一轮蓄力')
  : props.state.status === 'PAUSED' ? '已暂停 · 随时继续' : props.state.mode === 'STOPWATCH' ? '准备好就开始记录' : '准备好就开始吧')
</script>

<template>
  <section class="focus-stage immersive-timer" :class="{ completed: state.status === 'COMPLETED', fullscreen }">
    <div class="focus-orbit" :class="{ running: isRunning }">
      <svg viewBox="0 0 340 340"><circle class="orbit-track" cx="170" cy="170" r="154"/><circle class="orbit-progress" cx="170" cy="170" r="154" :style="{ '--progress': progress }"/><circle v-if="isRunning" class="orbit-glow" cx="170" cy="16" r="5"/></svg>
      <div class="focus-time"><span>{{ state.mode === 'POMODORO' ? phaseLabel : modeLabels[state.mode] }}</span><transition name="timer-number" mode="out-in"><strong :key="displayTime">{{ displayTime }}</strong></transition><small>{{ helperText }}</small></div>
      <div v-if="state.status === 'COMPLETED'" class="focus-complete-wave"><i/><i/><i/></div>
    </div>

    <div class="focus-task-picker"><i/><select v-model="selectedTask" :disabled="active" aria-label="选择当前专注任务"><option value="">自由专注（不关联任务）</option><option v-for="task in tasks" :key="task.id" :value="task.id">{{ task.title }}</option></select><ChevronDown :size="18"/></div>
    <div class="focus-controls">
      <button class="control-secondary" title="结束并记录" :disabled="!active" @click="emit('finish')"><Square :size="18" fill="currentColor"/></button>
      <button class="focus-primary" @click="emit('toggle')"><component :is="isRunning ? Pause : Play" :size="23" fill="currentColor"/>{{ isRunning ? '暂停一下' : state.status === 'PAUSED' ? '继续专注' : '开始专注' }}</button>
      <button v-if="!fullscreen" class="control-secondary" title="全屏专注" @click="emit('enterFullscreen')"><Maximize2 :size="19"/></button>
    </div>
    <div class="focus-secondary-actions"><button v-if="active" @click="emit('cancel')">放弃本次计时</button><button v-if="state.mode === 'COUNTDOWN' && !active" @click="emit('reset')"><RotateCcw :size="14"/>重置倒计时</button></div>
  </section>
</template>
