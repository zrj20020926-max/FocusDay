import type { TimerState } from '../../types/timer'

export class TimerCalculator {
  static normalizeNow(state: TimerState, now: number): number {
    if (!Number.isFinite(now)) return state.lastObservedAt
    return Math.max(now, state.lastObservedAt)
  }

  static runningSegmentDuration(state: TimerState, now: number): number {
    if (state.status !== 'RUNNING' || state.segmentStartedAt == null) return 0
    return Math.max(0, this.normalizeNow(state, now) - state.segmentStartedAt)
  }

  static phaseElapsed(state: TimerState, now: number): number {
    const elapsed = state.phaseAccumulatedDuration + this.runningSegmentDuration(state, now)
    return state.mode === 'STOPWATCH' ? elapsed : Math.min(state.targetDuration, elapsed)
  }

  static remaining(state: TimerState, now: number): number {
    if (state.mode === 'STOPWATCH') return 0
    return Math.max(0, state.targetDuration - this.phaseElapsed(state, now))
  }

  static focusDuration(state: TimerState, now: number): number {
    if (state.status !== 'RUNNING' || state.currentPhase !== 'FOCUS') return state.accumulatedDuration
    const segment = this.runningSegmentDuration(state, now)
    if (state.mode === 'STOPWATCH') return state.accumulatedDuration + segment
    const available = Math.max(0, state.targetDuration - state.phaseAccumulatedDuration)
    return state.accumulatedDuration + Math.min(segment, available)
  }

  static progress(state: TimerState, now: number): number {
    if (state.mode === 'STOPWATCH') return Math.min(100, this.phaseElapsed(state, now) / (60 * 60 * 1000) * 100)
    if (state.targetDuration <= 0) return 0
    return Math.min(100, Math.max(0, this.phaseElapsed(state, now) / state.targetDuration * 100))
  }
}

export function formatTimerDuration(duration: number, roundUp = false): string {
  const totalSeconds = Math.max(0, roundUp ? Math.ceil(duration / 1000) : Math.floor(duration / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds % 3600 / 60)
  const seconds = totalSeconds % 60
  const parts = [String(minutes).padStart(2, '0'), String(seconds).padStart(2, '0')]
  if (hours > 0) parts.unshift(String(hours).padStart(2, '0'))
  return parts.join(':')
}
