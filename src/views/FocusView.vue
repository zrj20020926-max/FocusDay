<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Play, Pause, Square, Maximize2, ChevronDown, Flame, Coffee, Volume2, MoreHorizontal, Minimize2, RotateCcw } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { useTaskStore } from '../stores/taskStore'
import { useTimer } from '../composables/useTimer'
import type { TimerMode } from '../types/timer'

const store = useAppStore()
const taskStore = useTaskStore()
const { timer, state, displayTime, progress, isRunning, phaseLabel } = useTimer()
const focusableTasks = computed(() => taskStore.sortedTasks.filter(task => task.status !== 'COMPLETED'))
const selectedTaskId = computed({ get: () => state.value.taskId ?? '', set: value => { timer.setTask(value || null) } })
const countdownMinutes = ref(Math.round(timer.config.countdownDuration / 60000))
watch(() => timer.config.countdownDuration, value => { countdownMinutes.value = Math.round(value / 60000) })
const modeMap: Record<TimerMode, {label:string;sub:string}> = {
  POMODORO:{label:'番茄钟',sub:'专注与休息自动循环'},
  STOPWATCH:{label:'正计时',sub:'自由记录每一段专注'},
  COUNTDOWN:{label:'倒计时',sub:'设定一个明确的结束点'},
}
function selectMode(mode: TimerMode) { timer.selectMode(mode) }
function saveCountdown() { timer.updateConfig({ countdownDuration: Math.max(1, Math.round(countdownMinutes.value || 1)) * 60000 }) }
</script>

<template>
  <div class="page focus-page" :class="[`mode-${state.mode.toLowerCase()}`,{fullscreen:store.focusFullscreen}]">
    <button v-if="store.focusFullscreen" class="exit-fullscreen" @click="store.focusFullscreen=false"><Minimize2 :size="18"/>退出全屏</button>
    <header v-if="!store.focusFullscreen" class="page-header focus-header"><div><span class="eyebrow">FOCUS</span><h1>专注时刻</h1><p>一次只做一件事，让时间变得清晰。</p></div><div class="streak"><Flame :size="18" fill="currentColor"/><span>连续专注 <strong>6 天</strong></span></div></header>
    <div class="mode-switch"><button v-for="(item,key) in modeMap" :key="key" :class="{active:state.mode===key}" @click="selectMode(key as TimerMode)"><span>{{item.label}}</span><small>{{item.sub}}</small></button></div>
    <label v-if="state.mode==='COUNTDOWN' && !['RUNNING','PAUSED'].includes(state.status)" class="countdown-duration">目标时长 <input v-model.number="countdownMinutes" type="number" min="1" max="1440" @change="saveCountdown"/> 分钟</label>
    <section class="focus-stage">
      <div class="focus-orbit" :class="{running:isRunning}">
        <svg viewBox="0 0 340 340"><circle class="orbit-track" cx="170" cy="170" r="154"/><circle class="orbit-progress" cx="170" cy="170" r="154" :style="{'--progress': progress}"/><circle v-if="isRunning" class="orbit-glow" cx="170" cy="16" r="5"/></svg>
        <div class="focus-time"><span>{{ state.mode==='POMODORO' ? phaseLabel : modeMap[state.mode].label }}</span><strong>{{displayTime}}</strong><small>{{ isRunning ? (state.currentPhase==='FOCUS' ? '正在专注 · 保持呼吸' : '休息一下 · 为下一轮蓄力') : state.status==='PAUSED' ? '已暂停 · 随时继续' : state.mode==='STOPWATCH' ? '准备好就开始记录' : '准备好就开始吧' }}</small></div>
      </div>
      <div class="focus-task-picker"><i/><select v-model="selectedTaskId" :disabled="['RUNNING','PAUSED'].includes(state.status)" aria-label="选择当前专注任务"><option value="">自由专注（不关联任务）</option><option v-for="task in focusableTasks" :key="task.id" :value="task.id">{{task.title}}</option></select><ChevronDown :size="18"/></div>
      <div class="focus-controls"><button class="control-secondary" title="结束并记录" :disabled="!['RUNNING','PAUSED'].includes(state.status)" @click="timer.finish()"><Square :size="18" fill="currentColor"/></button><button class="focus-primary" @click="timer.toggle()"><component :is="isRunning?Pause:Play" :size="23" fill="currentColor"/>{{isRunning?'暂停一下':state.status==='PAUSED'?'继续专注':'开始专注'}}</button><button class="control-secondary" title="全屏专注" @click="store.focusFullscreen=true"><Maximize2 :size="19"/></button></div>
      <div class="focus-secondary-actions"><button v-if="['RUNNING','PAUSED'].includes(state.status)" @click="timer.cancel()">放弃本次计时</button><button v-if="state.mode==='COUNTDOWN' && !['RUNNING','PAUSED'].includes(state.status)" @click="timer.reset()"><RotateCcw :size="14"/>重置倒计时</button></div>
    </section>
    <section v-if="!store.focusFullscreen" class="focus-bottom">
      <div class="session-plan"><div class="section-heading"><h3>本次番茄节奏</h3><span>{{state.completedPomodoros}} / {{timer.config.pomodoro.longBreakEvery}} 轮</span></div><div class="rounds"><span v-for="round in timer.config.pomodoro.longBreakEvery" :key="round" :class="{done:round<state.currentRound,active:round===state.currentRound}">{{round<state.currentRound?'✓':round}}</span></div><p>第 {{timer.config.pomodoro.longBreakEvery}} 轮完成后进入长休息。</p></div>
      <div class="ambient"><div><span class="sound-icon"><Coffee :size="18"/></span><span><strong>环境声音</strong><small>咖啡馆 · 轻柔</small></span></div><button><Volume2 :size="18"/><span class="sound-line"><i/></span></button></div>
      <button class="focus-more"><MoreHorizontal :size="20"/>专注设置</button>
    </section>
  </div>
</template>
