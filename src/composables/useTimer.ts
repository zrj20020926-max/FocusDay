import { computed } from 'vue'
import { useTimerStore } from '../stores/timerStore'

const modeLabels = { POMODORO: '番茄钟', STOPWATCH: '正计时', COUNTDOWN: '倒计时' } as const
const phaseLabels = { FOCUS: '专注', SHORT_BREAK: '短休息', LONG_BREAK: '长休息' } as const

export function useTimer() {
  const timer = useTimerStore()

  return {
    timer,
    state: computed(() => timer.timerState),
    modeLabel: computed(() => modeLabels[timer.timerState.mode]),
    phaseLabel: computed(() => phaseLabels[timer.timerState.currentPhase]),
    displayTime: computed(() => timer.displayTime),
    progress: computed(() => timer.progress),
    isRunning: computed(() => timer.isRunning),
    isPaused: computed(() => timer.isPaused),
  }
}
