export const TIMER_MODES = ['POMODORO', 'STOPWATCH', 'COUNTDOWN'] as const
export type TimerMode = (typeof TIMER_MODES)[number]

export const TIMER_STATUSES = ['IDLE', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const
export type TimerStatus = (typeof TIMER_STATUSES)[number]

export const TIMER_PHASES = ['FOCUS', 'SHORT_BREAK', 'LONG_BREAK'] as const
export type TimerPhase = (typeof TIMER_PHASES)[number]

export interface PomodoroConfig {
  focusDuration: number
  shortBreakDuration: number
  longBreakDuration: number
  longBreakEvery: number
}

export interface TimerConfig {
  pomodoro: PomodoroConfig
  countdownDuration: number
}

export interface TimerState {
  version: 1
  sessionId: string
  mode: TimerMode
  status: TimerStatus
  taskId: string | null
  startTime: number | null
  endTime: number | null
  targetDuration: number
  accumulatedDuration: number
  pausedAt: number | null
  currentRound: number
  currentPhase: TimerPhase
  completedPomodoros: number
  phaseSequence: number
  phaseStartedAt: number | null
  segmentStartedAt: number | null
  phaseAccumulatedDuration: number
  lastObservedAt: number
  updatedAt: number
  config: TimerConfig
}

export interface FocusRecord {
  id: string
  sessionId: string
  taskId: string | null
  mode: TimerMode
  round: number
  startedAt: number
  endedAt: number
  duration: number
  completedNaturally: boolean
  createdAt: number
}

export interface StartTimerOptions {
  taskId?: string | null
  countdownDuration?: number
}

export interface TimerSnapshot {
  state: TimerState
  records: FocusRecord[]
  config: TimerConfig
}

export interface Clock {
  now(): number
}

export interface TimerStorage {
  load(): TimerSnapshot | null
  save(snapshot: TimerSnapshot): void
}

export class TimerDomainError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_TRANSITION' | 'INVALID_CONFIG' | 'INVALID_STATE' | 'PERSISTENCE_ERROR',
  ) {
    super(message)
    this.name = 'TimerDomainError'
  }
}

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  pomodoro: {
    focusDuration: 25 * 60 * 1000,
    shortBreakDuration: 5 * 60 * 1000,
    longBreakDuration: 15 * 60 * 1000,
    longBreakEvery: 4,
  },
  countdownDuration: 45 * 60 * 1000,
}
