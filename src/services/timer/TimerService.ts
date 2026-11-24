import { TimerCalculator } from './TimerCalculator'
import {
  DEFAULT_TIMER_CONFIG,
  TIMER_MODES,
  TIMER_PHASES,
  TIMER_STATUSES,
  TimerDomainError,
  type Clock,
  type FocusRecord,
  type PomodoroConfig,
  type StartTimerOptions,
  type TimerConfig,
  type TimerMode,
  type TimerSnapshot,
  type TimerState,
  type TimerStorage,
} from '../../types/timer'

const systemClock: Clock = { now: () => Date.now() }

function clone<T>(value: T): T { return structuredClone(value) }

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export interface TimerConfigUpdate {
  pomodoro?: Partial<PomodoroConfig>
  countdownDuration?: number
}

export class TimerService {
  private state!: TimerState
  private records: FocusRecord[] = []
  private config: TimerConfig = clone(DEFAULT_TIMER_CONFIG)
  private initialized = false
  private monotonicNow = 0

  constructor(
    private readonly storage: TimerStorage,
    private readonly clock: Clock = systemClock,
  ) {}

  restore(force = false): TimerState {
    if (this.initialized && !force) return this.synchronize()
    const snapshot = this.storage.load()
    if (snapshot) {
      this.validateConfig(snapshot.config)
      this.validateState(snapshot.state)
      this.config = clone(snapshot.config)
      this.state = { ...clone(snapshot.state), config: clone(snapshot.config) }
      this.records = clone(snapshot.records)
      this.monotonicNow = this.state.lastObservedAt
    } else {
      const now = this.readRawNow()
      this.state = this.createIdleState('POMODORO', now)
      this.records = []
      this.persist()
    }
    this.initialized = true
    return this.synchronize()
  }

  getState(): TimerState { this.ensureInitialized(); return clone(this.state) }
  getRecords(): FocusRecord[] { this.ensureInitialized(); return clone(this.records) }
  getConfig(): TimerConfig { this.ensureInitialized(); return clone(this.config) }

  prepare(mode: TimerMode, options: StartTimerOptions = {}): TimerState {
    this.ensureInitialized()
    this.assertMode(mode)
    this.assertInactive('切换模式')
    if (options.countdownDuration !== undefined) {
      this.assertDuration(options.countdownDuration, '倒计时时长')
      this.config.countdownDuration = options.countdownDuration
    }
    const now = this.now()
    this.state = this.createIdleState(mode, now, options.taskId ?? this.state.taskId)
    this.persist()
    return this.getState()
  }

  start(mode: TimerMode = this.state?.mode ?? 'POMODORO', options: StartTimerOptions = {}): TimerState {
    this.ensureInitialized()
    this.assertMode(mode)
    if (this.state.status === 'RUNNING' || this.state.status === 'PAUSED') {
      throw new TimerDomainError('计时已经开始，请勿重复操作', 'INVALID_TRANSITION')
    }
    if (options.countdownDuration !== undefined) {
      this.assertDuration(options.countdownDuration, '倒计时时长')
      this.config.countdownDuration = options.countdownDuration
    }
    const now = this.now()
    const taskId = options.taskId === undefined ? this.state.taskId : options.taskId
    this.state = this.createIdleState(mode, now, taskId)
    this.state.sessionId = createId()
    this.state.status = 'RUNNING'
    this.state.startTime = now
    this.state.phaseStartedAt = now
    this.state.segmentStartedAt = now
    this.state.endTime = mode === 'STOPWATCH' ? null : now + this.state.targetDuration
    this.state.updatedAt = now
    this.state.lastObservedAt = now
    this.persist()
    return this.getState()
  }

  pause(): TimerState {
    this.ensureInitialized()
    this.synchronize()
    if (this.state.status !== 'RUNNING') throw new TimerDomainError('只有运行中的计时可以暂停', 'INVALID_TRANSITION')
    const now = this.now()
    this.bankRunningSegment(now)
    this.state.status = 'PAUSED'
    this.state.pausedAt = now
    this.state.segmentStartedAt = null
    this.state.endTime = null
    this.touch(now)
    this.persist()
    return this.getState()
  }

  resume(): TimerState {
    this.ensureInitialized()
    if (this.state.status !== 'PAUSED') throw new TimerDomainError('只有暂停的计时可以继续', 'INVALID_TRANSITION')
    const now = this.now()
    this.state.status = 'RUNNING'
    this.state.pausedAt = null
    this.state.segmentStartedAt = now
    const remaining = Math.max(0, this.state.targetDuration - this.state.phaseAccumulatedDuration)
    this.state.endTime = this.state.mode === 'STOPWATCH' ? null : now + remaining
    this.touch(now)
    this.persist()
    return this.getState()
  }

  finish(): TimerState {
    this.ensureInitialized()
    this.synchronize()
    if (this.state.status === 'COMPLETED') return this.getState()
    if (this.state.status !== 'RUNNING' && this.state.status !== 'PAUSED') {
      throw new TimerDomainError('当前计时不能结束', 'INVALID_TRANSITION')
    }
    const now = this.now()
    if (this.state.status === 'RUNNING') this.bankRunningSegment(now)
    if (this.state.currentPhase === 'FOCUS' && this.state.phaseAccumulatedDuration > 0) {
      this.upsertFocusRecord(now, false, this.state.phaseAccumulatedDuration)
    }
    this.state.status = 'COMPLETED'
    this.state.endTime = now
    this.state.segmentStartedAt = null
    this.state.pausedAt = null
    this.touch(now)
    this.persist()
    return this.getState()
  }

  cancel(): TimerState {
    this.ensureInitialized()
    this.synchronize()
    if (this.state.status === 'CANCELLED') return this.getState()
    if (this.state.status !== 'RUNNING' && this.state.status !== 'PAUSED') {
      throw new TimerDomainError('当前没有可放弃的计时', 'INVALID_TRANSITION')
    }
    const now = this.now()
    this.state.status = 'CANCELLED'
    this.state.endTime = now
    this.state.segmentStartedAt = null
    this.state.pausedAt = null
    this.touch(now)
    this.persist()
    return this.getState()
  }

  reset(): TimerState {
    this.ensureInitialized()
    if (this.state.mode !== 'COUNTDOWN') throw new TimerDomainError('只有倒计时支持重置', 'INVALID_TRANSITION')
    const now = this.now()
    this.state = this.createIdleState('COUNTDOWN', now, this.state.taskId)
    this.persist()
    return this.getState()
  }

  setTask(taskId: string | null): TimerState {
    this.ensureInitialized()
    this.assertInactive('修改关联任务')
    const now = this.now()
    this.state.taskId = taskId
    this.touch(now)
    this.persist()
    return this.getState()
  }

  updateConfig(update: TimerConfigUpdate): TimerConfig {
    this.ensureInitialized()
    this.assertInactive('修改计时配置')
    const next: TimerConfig = {
      pomodoro: { ...this.config.pomodoro, ...update.pomodoro },
      countdownDuration: update.countdownDuration ?? this.config.countdownDuration,
    }
    this.validateConfig(next)
    this.config = next
    const now = this.now()
    this.state.config = clone(next)
    if (this.state.status === 'IDLE' || this.state.status === 'COMPLETED' || this.state.status === 'CANCELLED') {
      this.state.targetDuration = this.targetFor(this.state.mode, this.state.currentPhase)
    }
    this.touch(now)
    this.persist()
    return this.getConfig()
  }

  synchronize(): TimerState {
    this.ensureInitialized(false)
    if (!this.initialized || this.state.status !== 'RUNNING' || this.state.mode === 'STOPWATCH') return clone(this.state)
    const now = this.now()
    let transitions = 0
    while (this.state.status === 'RUNNING' && TimerCalculator.remaining(this.state, now) === 0) {
      if (++transitions > 10000) throw new TimerDomainError('检测到异常的系统时间跨度，请重新开始计时', 'INVALID_STATE')
      const boundary = this.state.endTime ?? now
      this.completeCurrentPhase(boundary)
    }
    if (transitions > 0) {
      this.touch(now)
      this.persist()
    }
    return clone(this.state)
  }

  private completeCurrentPhase(boundary: number): void {
    const remaining = Math.max(0, this.state.targetDuration - this.state.phaseAccumulatedDuration)
    this.state.phaseAccumulatedDuration += remaining
    if (this.state.currentPhase === 'FOCUS') this.state.accumulatedDuration += remaining

    if (this.state.mode === 'COUNTDOWN') {
      this.upsertFocusRecord(boundary, true, this.state.targetDuration)
      this.state.status = 'COMPLETED'
      this.state.endTime = boundary
      this.state.segmentStartedAt = null
      return
    }

    if (this.state.currentPhase === 'FOCUS') {
      this.upsertFocusRecord(boundary, true, this.state.targetDuration)
      this.state.completedPomodoros += 1
      const isLongBreak = this.state.currentRound % this.config.pomodoro.longBreakEvery === 0
      this.beginPhase(isLongBreak ? 'LONG_BREAK' : 'SHORT_BREAK', boundary)
    } else {
      this.state.currentRound += 1
      this.beginPhase('FOCUS', boundary)
    }
  }

  private beginPhase(phase: TimerState['currentPhase'], boundary: number): void {
    this.state.phaseSequence += 1
    this.state.currentPhase = phase
    this.state.phaseStartedAt = boundary
    this.state.segmentStartedAt = boundary
    this.state.phaseAccumulatedDuration = 0
    this.state.targetDuration = this.targetFor(this.state.mode, phase)
    this.state.endTime = boundary + this.state.targetDuration
    this.state.pausedAt = null
  }

  private bankRunningSegment(now: number): void {
    if (this.state.segmentStartedAt == null) return
    const rawDelta = Math.max(0, now - this.state.segmentStartedAt)
    const delta = this.state.mode === 'STOPWATCH'
      ? rawDelta
      : Math.min(rawDelta, Math.max(0, this.state.targetDuration - this.state.phaseAccumulatedDuration))
    this.state.phaseAccumulatedDuration += delta
    if (this.state.currentPhase === 'FOCUS') this.state.accumulatedDuration += delta
  }

  private upsertFocusRecord(endedAt: number, completedNaturally: boolean, duration: number): void {
    if (duration <= 0) return
    const id = `${this.state.sessionId}:${this.state.phaseSequence}`
    const record: FocusRecord = {
      id,
      sessionId: this.state.sessionId,
      taskId: this.state.taskId,
      mode: this.state.mode,
      round: this.state.currentRound,
      startedAt: this.state.phaseStartedAt ?? Math.max(0, endedAt - duration),
      endedAt,
      duration,
      completedNaturally,
      createdAt: endedAt,
    }
    const index = this.records.findIndex(item => item.id === id)
    if (index >= 0) this.records[index] = record
    else this.records.push(record)
  }

  private createIdleState(mode: TimerMode, now: number, taskId: string | null = null): TimerState {
    const phase = 'FOCUS' as const
    return {
      version: 1,
      sessionId: createId(),
      mode,
      status: 'IDLE',
      taskId,
      startTime: null,
      endTime: null,
      targetDuration: this.targetFor(mode, phase),
      accumulatedDuration: 0,
      pausedAt: null,
      currentRound: 1,
      currentPhase: phase,
      completedPomodoros: 0,
      phaseSequence: 0,
      phaseStartedAt: null,
      segmentStartedAt: null,
      phaseAccumulatedDuration: 0,
      lastObservedAt: now,
      updatedAt: now,
      config: clone(this.config),
    }
  }

  private targetFor(mode: TimerMode, phase: TimerState['currentPhase']): number {
    if (mode === 'STOPWATCH') return 0
    if (mode === 'COUNTDOWN') return this.config.countdownDuration
    if (phase === 'SHORT_BREAK') return this.config.pomodoro.shortBreakDuration
    if (phase === 'LONG_BREAK') return this.config.pomodoro.longBreakDuration
    return this.config.pomodoro.focusDuration
  }

  private touch(now: number): void {
    this.state.lastObservedAt = now
    this.state.updatedAt = now
    this.state.config = clone(this.config)
  }

  private persist(): void {
    this.storage.save({ state: clone(this.state), records: clone(this.records), config: clone(this.config) })
  }

  private now(): number {
    const raw = this.readRawNow()
    const baseline = this.state?.lastObservedAt ?? 0
    this.monotonicNow = Math.max(raw, baseline, this.monotonicNow)
    return this.monotonicNow
  }

  private readRawNow(): number {
    const now = this.clock.now()
    if (!Number.isFinite(now) || now < 0) throw new TimerDomainError('系统时间异常', 'INVALID_STATE')
    return now
  }

  private assertInactive(action: string): void {
    if (this.state.status === 'RUNNING' || this.state.status === 'PAUSED') {
      throw new TimerDomainError(`计时进行中，不能${action}`, 'INVALID_TRANSITION')
    }
  }

  private assertDuration(value: number, label: string): void {
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new TimerDomainError(`${label}必须是正整数毫秒`, 'INVALID_CONFIG')
    }
  }

  private validateConfig(config: TimerConfig): void {
    this.assertDuration(config.pomodoro.focusDuration, '专注时长')
    this.assertDuration(config.pomodoro.shortBreakDuration, '短休息时长')
    this.assertDuration(config.pomodoro.longBreakDuration, '长休息时长')
    this.assertDuration(config.countdownDuration, '倒计时时长')
    if (!Number.isInteger(config.pomodoro.longBreakEvery) || config.pomodoro.longBreakEvery <= 0) {
      throw new TimerDomainError('长休息轮次必须是正整数', 'INVALID_CONFIG')
    }
  }

  private validateState(state: TimerState): void {
    this.assertMode(state.mode)
    if (!TIMER_STATUSES.includes(state.status)) throw new TimerDomainError('计时状态无效', 'INVALID_STATE')
    if (!TIMER_PHASES.includes(state.currentPhase)) throw new TimerDomainError('计时阶段无效', 'INVALID_STATE')
    const numbers = [state.targetDuration, state.accumulatedDuration, state.currentRound, state.phaseSequence, state.phaseAccumulatedDuration, state.updatedAt]
    if (numbers.some(value => !Number.isFinite(value) || value < 0)) throw new TimerDomainError('计时数据已损坏', 'INVALID_STATE')
    if (!Number.isInteger(state.currentRound) || state.currentRound < 1 || !Number.isInteger(state.phaseSequence)) {
      throw new TimerDomainError('计时轮次数据无效', 'INVALID_STATE')
    }
  }

  private assertMode(mode: string): asserts mode is TimerMode {
    if (!TIMER_MODES.includes(mode as TimerMode)) throw new TimerDomainError('计时模式无效', 'INVALID_STATE')
  }

  private ensureInitialized(restore = true): void {
    if (!this.initialized && restore) this.restore()
  }
}
