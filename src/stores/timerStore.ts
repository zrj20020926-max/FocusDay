import { defineStore } from 'pinia'
import { TimerRepository } from '../services/database/repositories/TimerRepository'
import { SettingsRepository } from '../services/database/repositories/SettingsRepository'
import { TimerCalculator, formatTimerDuration } from '../services/timer/TimerCalculator'
import { TimerService, type TimerConfigUpdate } from '../services/timer/TimerService'
import { DEFAULT_TIMER_CONFIG, TimerDomainError, type FocusRecord, type TimerConfig, type TimerMode, type TimerState } from '../types/timer'
import { useAppStore } from './app'
import { useFocusSessionStore } from './focusSessionStore'

const timerRepository = new TimerRepository()
const settingsRepository = new SettingsRepository()
const service = new TimerService(timerRepository)
let initialization: Promise<void> | null = null
let tickInFlight = false

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
    async initialize() {
      if (this.initialized) return
      if (initialization) return initialization
      initialization = (async () => {
        try {
          await timerRepository.initialize()
          this.timerState = service.restore()
          await timerRepository.flush()
          this.config = service.getConfig()
          if (!await settingsRepository.get<TimerConfig>('timer-config')) await settingsRepository.set('timer-config', this.config)
          this.records = service.getRecords()
          this.nowMs = Math.max(Date.now(), this.timerState.lastObservedAt)
          const focusSessions = useFocusSessionStore()
          await focusSessions.initialize()
          await focusSessions.syncTimerRecords(this.records, false)
          this.initialized = true
        } catch (error) { this.fail(error) }
      })()
      await initialization
      initialization = null
    },
    async tick() {
      if (tickInFlight) return
      tickInFlight = true
      if (!this.initialized) await this.initialize()
      const previousPhase = this.timerState.currentPhase
      const previousStatus = this.timerState.status
      this.nowMs = Math.max(this.nowMs, Date.now(), this.timerState.lastObservedAt)
      try {
        const synchronized = service.synchronize()
        const changed = synchronized.updatedAt !== this.timerState.updatedAt || synchronized.status !== previousStatus || synchronized.currentPhase !== previousPhase
        if (!changed) return
        await timerRepository.flush()
        this.timerState = synchronized
        this.records = service.getRecords()
        await useFocusSessionStore().syncTimerRecords(this.records, true)
        if (synchronized.status === 'COMPLETED' && previousStatus !== 'COMPLETED') useAppStore().notify('计时已完成')
        else if (synchronized.currentPhase !== previousPhase) useAppStore().notify(synchronized.currentPhase === 'FOCUS' ? '休息结束，进入下一轮' : '专注完成，开始休息')
      } catch (error) { this.fail(error) }
      finally { tickInFlight = false }
    },
    async refreshFromPersistence() {
      await timerRepository.reload()
      this.timerState = service.restore(true)
      this.config = service.getConfig()
      this.records = service.getRecords()
      this.nowMs = Math.max(Date.now(), this.timerState.lastObservedAt)
    },
    async selectMode(mode: TimerMode) {
      return this.run(() => service.prepare(mode))
    },
    async start(taskId?: string | null) {
      const linkedTaskId = taskId === undefined ? this.timerState.taskId : taskId
      const state = await this.run(() => service.start(this.timerState.mode, { taskId: linkedTaskId }))
      if (state) useAppStore().notify('专注计时已开始')
      return state
    },
    async pause() { return this.run(() => service.pause()) },
    async resume() { return this.run(() => service.resume()) },
    async toggle() {
      if (this.timerState.status === 'RUNNING') return this.pause()
      if (this.timerState.status === 'PAUSED') return this.resume()
      return this.start()
    },
    async finish() {
      const state = await this.run(() => service.finish())
      if (state) useAppStore().notify('本次专注已结束')
      return state
    },
    async cancel() {
      const before = structuredClone(this.timerState)
      const cancelAt = Math.max(this.nowMs, Date.now(), before.lastObservedAt)
      const cancelledDuration = before.currentPhase === 'FOCUS' ? TimerCalculator.phaseElapsed(before, cancelAt) : 0
      const state = await this.run(() => service.cancel())
      if (state) {
        await useFocusSessionStore().recordCancellation(before, cancelledDuration, state.endTime ?? this.nowMs)
        useAppStore().notify('已放弃本次计时，不计入统计')
      }
      return state
    },
    async reset() { return this.run(() => service.reset()) },
    async setTask(taskId: string | null) { return this.run(() => service.setTask(taskId)) },
    async updateConfig(update: TimerConfigUpdate) {
      try {
        if (!this.initialized) await this.initialize()
        this.config = service.updateConfig(update)
        await timerRepository.flush()
        await settingsRepository.set('timer-config', this.config)
        this.timerState = service.getState()
        useAppStore().notify('计时设置已保存')
        return true
      } catch (error) { this.fail(error); return false }
    },
    async run(operation: () => TimerState): Promise<TimerState | null> {
      if (!this.initialized) await this.initialize()
      try {
        this.timerState = operation()
        await timerRepository.flush()
        this.config = service.getConfig()
        this.records = service.getRecords()
        await useFocusSessionStore().syncTimerRecords(this.records, true)
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
