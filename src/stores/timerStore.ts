import { defineStore } from 'pinia'
import { LocalStorageTimerStorage } from '../services/timer/LocalStorageTimerStorage'
import { TimerCalculator, formatTimerDuration } from '../services/timer/TimerCalculator'
import { TimerService, type TimerConfigUpdate } from '../services/timer/TimerService'
import { DEFAULT_TIMER_CONFIG, TimerDomainError, type FocusRecord, type TimerConfig, type TimerMode, type TimerState } from '../types/timer'
import { useAppStore } from './app'
import { useFocusSessionStore } from './focusSessionStore'

const service = new TimerService(new LocalStorageTimerStorage())

function initialState(): TimerState {
  const now = Date.now()
  return {
    version: 1,
    sessionId: '',
    mode: 'POMODORO',
    status: 'IDLE',
    taskId: null,
    startTime: null,
    endTime: null,
    targetDuration: DEFAULT_TIMER_CONFIG.pomodoro.focusDuration,
    accumulatedDuration: 0,
    pausedAt: null,
    currentRound: 1,
    currentPhase: 'FOCUS',
    completedPomodoros: 0,
    phaseSequence: 0,
    phaseStartedAt: null,
    segmentStartedAt: null,
    phaseAccumulatedDuration: 0,
    lastObservedAt: now,
    updatedAt: now,
    config: structuredClone(DEFAULT_TIMER_CONFIG),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof TimerDomainError ? error.message : '计时操作失败，请稍后重试'
}

export const useTimerStore = defineStore('timer', {
  state: () => ({
    timerState: initialState(),
    config: structuredClone(DEFAULT_TIMER_CONFIG) as TimerConfig,
    records: [] as FocusRecord[],
    nowMs: Date.now(),
    initialized: false,
    lastError: '',
  }),
  getters: {
    remaining: state => TimerCalculator.remaining(state.timerState, state.nowMs),
    elapsed: state => TimerCalculator.phaseElapsed(state.timerState, state.nowMs),
    focusDuration: state => TimerCalculator.focusDuration(state.timerState, state.nowMs),
    progress: state => TimerCalculator.progress(state.timerState, state.nowMs),
    displayTime(): string {
      const duration = this.timerState.mode === 'STOPWATCH' ? this.elapsed : this.remaining
      return formatTimerDuration(duration, this.timerState.mode !== 'STOPWATCH')
    },
    isRunning: state => state.timerState.status === 'RUNNING',
    isPaused: state => state.timerState.status === 'PAUSED',
    canStart: state => ['IDLE', 'COMPLETED', 'CANCELLED'].includes(state.timerState.status),
  },
  actions: {
    initialize() {
      if (this.initialized) return
      try {
        this.timerState = service.restore()
        this.config = service.getConfig()
        this.records = service.getRecords()
        this.nowMs = Math.max(Date.now(), this.timerState.lastObservedAt)
        this.initialized = true
        const focusSessions = useFocusSessionStore()
        focusSessions.initialize()
        focusSessions.syncTimerRecords(this.records, false)
      } catch (error) { this.fail(error) }
    },
    tick() {
      if (!this.initialized) this.initialize()
      const previousPhase = this.timerState.currentPhase
      const previousStatus = this.timerState.status
      this.nowMs = Math.max(this.nowMs, Date.now(), this.timerState.lastObservedAt)
      try {
        const synchronized = service.synchronize()
        const changed = synchronized.updatedAt !== this.timerState.updatedAt || synchronized.status !== previousStatus || synchronized.currentPhase !== previousPhase
        if (!changed) return
        this.timerState = synchronized
        this.records = service.getRecords()
        useFocusSessionStore().syncTimerRecords(this.records, true)
        if (synchronized.status === 'COMPLETED' && previousStatus !== 'COMPLETED') useAppStore().notify('计时已完成')
        else if (synchronized.currentPhase !== previousPhase) useAppStore().notify(synchronized.currentPhase === 'FOCUS' ? '休息结束，进入下一轮' : '专注完成，开始休息')
      } catch (error) { this.fail(error) }
    },
    selectMode(mode: TimerMode) {
      return this.run(() => service.prepare(mode))
    },
    start(taskId?: string | null) {
      const linkedTaskId = taskId === undefined ? this.timerState.taskId : taskId
      const state = this.run(() => service.start(this.timerState.mode, { taskId: linkedTaskId }))
      if (state) useAppStore().notify('专注计时已开始')
      return state
    },
    pause() { return this.run(() => service.pause()) },
    resume() { return this.run(() => service.resume()) },
    toggle() {
      if (this.timerState.status === 'RUNNING') return this.pause()
      if (this.timerState.status === 'PAUSED') return this.resume()
      return this.start()
    },
    finish() {
      const state = this.run(() => service.finish())
      if (state) useAppStore().notify('本次专注已结束')
      return state
    },
    cancel() {
      const before = structuredClone(this.timerState)
      const cancelAt = Math.max(this.nowMs, Date.now(), before.lastObservedAt)
      const cancelledDuration = before.currentPhase === 'FOCUS' ? TimerCalculator.phaseElapsed(before, cancelAt) : 0
      const state = this.run(() => service.cancel())
      if (state) {
        useFocusSessionStore().recordCancellation(before, cancelledDuration, state.endTime ?? this.nowMs)
        useAppStore().notify('已放弃本次计时，不计入统计')
      }
      return state
    },
    reset() { return this.run(() => service.reset()) },
    setTask(taskId: string | null) { return this.run(() => service.setTask(taskId)) },
    updateConfig(update: TimerConfigUpdate) {
      try {
        this.config = service.updateConfig(update)
        this.timerState = service.getState()
        useAppStore().notify('计时设置已保存')
        return true
      } catch (error) { this.fail(error); return false }
    },
    run(operation: () => TimerState): TimerState | null {
      if (!this.initialized) this.initialize()
      try {
        this.timerState = operation()
        this.config = service.getConfig()
        this.records = service.getRecords()
        useFocusSessionStore().syncTimerRecords(this.records, true)
        this.nowMs = Math.max(Date.now(), this.timerState.lastObservedAt)
        return this.timerState
      } catch (error) { this.fail(error); return null }
    },
    fail(error: unknown) {
      this.lastError = errorMessage(error)
      useAppStore().notify(this.lastError)
    },
  },
})
