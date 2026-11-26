<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Minimize2 } from 'lucide-vue-next'
import { useOnline } from '@vueuse/core'
import { Capacitor } from '@capacitor/core'
import AmbientMixer from '../components/focus/AmbientMixer.vue'
import FocusScene from '../components/focus/FocusScene.vue'
import ImmersiveTimer from '../components/focus/ImmersiveTimer.vue'
import { useTimer } from '../composables/useTimer'
import { isMobileLayout } from '../composables/mobileLayout'
import { FullscreenError, FullscreenService } from '../services/fullscreen/FullscreenService'
import { useAmbientStore } from '../stores/ambientStore'
import { useAppStore } from '../stores/app'
import { useTaskStore } from '../stores/taskStore'
import { useHabitStore } from '../stores/habitStore'
import { useAuthStore } from '../stores/authStore'
import { usesNativeNotifications } from '../services/notification/nativeNotifications'
import type { TimerMode } from '../types/timer'

const store = useAppStore()
const ambient = useAmbientStore()
const taskStore = useTaskStore()
const habits = useHabitStore()
const auth = useAuthStore()
const online = useOnline()
const { timer, state, displayTime, progress, isRunning, phaseLabel } = useTimer()
const focusRoot = ref<HTMLElement | null>(null)
const fullscreenService = new FullscreenService()
let unsubscribeFullscreen: (() => void) | null = null

const focusableTasks = computed(() => taskStore.sortedTasks.filter(task => task.status !== 'COMPLETED'))
const focusableHabits = computed(() => habits.activeHabits.filter(habit => habit.goalType === 'DAILY_DURATION' && habits.isScheduled(habit)))
const countdownMinutes = ref(Math.round(timer.config.countdownDuration / 60000))
const sceneStyle = computed(() => ({
  '--scene-accent': ambient.scene.accent,
  '--scene-text': ambient.scene.textColor,
  '--scene-soft-text': ambient.scene.softTextColor,
}))
watch(() => timer.config.countdownDuration, value => { countdownMinutes.value = Math.round(value / 60000) })

const modeMap: Record<TimerMode, { label: string; sub: string }> = {
  POMODORO: { label: '番茄钟', sub: '专注与休息自动循环' },
  STOPWATCH: { label: '正计时', sub: '自由记录每一段专注' },
  COUNTDOWN: { label: '倒计时', sub: '设定一个明确的结束点' },
}

function selectMode(mode: TimerMode) { void timer.selectMode(mode) }
function saveCountdown() { void timer.updateConfig({ countdownDuration: Math.max(1, Math.round(countdownMinutes.value || 1)) * 60000 }) }

async function enterFullscreen() {
  if (!focusRoot.value) return
  try {
    await fullscreenService.enter(focusRoot.value)
    store.focusFullscreen = true; ambient.setFullscreenPreferred(true)
  } catch (error) {
    if ((isMobileLayout.value || Capacitor.getPlatform() === 'ios') && error instanceof FullscreenError) {
      store.focusFullscreen = true
      ambient.setFullscreenPreferred(true)
      return
    }
    store.focusFullscreen = false
    store.notify(error instanceof FullscreenError ? error.message : '无法进入全屏模式')
  }
}

async function exitFullscreen() {
  try { await fullscreenService.exit() }
  catch (error) { store.notify(error instanceof FullscreenError ? error.message : '无法退出全屏模式') }
  finally { store.focusFullscreen = false; ambient.setFullscreenPreferred(false) }
}

watch(() => store.focusFullscreen, active => { if (!active && fullscreenService.active) void exitFullscreen() })
onMounted(() => {
  void ambient.initialize()
  unsubscribeFullscreen = fullscreenService.subscribe(() => {
    const active = fullscreenService.active
    store.focusFullscreen = active; ambient.setFullscreenPreferred(active)
  })
})
onUnmounted(() => {
  unsubscribeFullscreen?.(); unsubscribeFullscreen = null
  if (fullscreenService.active) void fullscreenService.exit()
  store.focusFullscreen = false; void ambient.releaseAudio()
})
</script>

<template>
  <div ref="focusRoot" class="page focus-page immersive-focus-page" :aria-busy="!timer.initialized"
    :class="[`mode-${state.mode.toLowerCase()}`, { fullscreen: store.focusFullscreen }]" :style="sceneStyle">
    <FocusScene :scene-id="ambient.preferences.sceneId" :immersive="store.focusFullscreen"/>
    <button v-if="store.focusFullscreen" class="exit-fullscreen" @click="exitFullscreen"><Minimize2 :size="18"/>退出全屏</button>

    <header v-if="!store.focusFullscreen" class="page-header focus-header">
      <div><span class="eyebrow">FOCUS</span><h1>专注时刻</h1><p>一次只做一件事，让时间变得清晰。</p></div>
      <div class="current-scene-badge"><i/><span><small>当前场景</small><strong>{{ ambient.scene.name }}</strong></span></div>
    </header>

    <div v-if="!store.focusFullscreen" class="mode-switch"><button v-for="(item,key) in modeMap" :key="key" :disabled="!timer.initialized" :class="{ active: state.mode === key }" @click="selectMode(key as TimerMode)"><span>{{ item.label }}</span><small>{{ item.sub }}</small></button></div>
    <p v-if="!store.focusFullscreen && usesNativeNotifications && auth.isAuthenticated && !online" class="focus-offline-note" role="status">离线时计时保存在此设备，其他设备可能同时开始。联网后会重新同步。</p>
    <label v-if="!store.focusFullscreen && state.mode === 'COUNTDOWN' && !['RUNNING','PAUSED'].includes(state.status)" class="countdown-duration">目标时长 <input v-model.number="countdownMinutes" type="number" inputmode="numeric" min="1" max="1440" @change="saveCountdown"/> 分钟</label>

    <ImmersiveTimer :state="state" :display-time="displayTime" :progress="progress" :is-running="isRunning" :phase-label="phaseLabel"
      :tasks="focusableTasks" :habits="focusableHabits" :fullscreen="store.focusFullscreen" @set-task="timer.setTask" @set-habit="timer.setHabit" @toggle="timer.toggle" @finish="timer.finish"
      @cancel="timer.cancel" @reset="timer.reset" @enter-fullscreen="enterFullscreen"/>

    <section v-if="!store.focusFullscreen" class="focus-bottom immersive-focus-bottom" :class="{ 'focus-bottom-single': state.mode !== 'POMODORO' }">
      <div v-if="state.mode === 'POMODORO'" class="session-plan"><div class="section-heading"><h3>本次番茄节奏</h3><span>{{ state.completedPomodoros }} / {{ timer.config.pomodoro.longBreakEvery }} 轮</span></div><div class="rounds"><span v-for="round in timer.config.pomodoro.longBreakEvery" :key="round" :class="{ done: round < state.currentRound, active: round === state.currentRound }">{{ round < state.currentRound ? '✓' : round }}</span></div><p>第 {{ timer.config.pomodoro.longBreakEvery }} 轮完成后进入长休息。</p></div>
      <AmbientMixer/>
    </section>
    <div v-else class="fullscreen-sound-dock"><AmbientMixer compact/></div>
  </div>
</template>
