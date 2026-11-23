import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { useTaskStore } from '../stores/taskStore'
import { useTimerStore } from '../stores/timerStore'
import type { TimerMode } from '../types/timer'

export function useTaskFocus() {
  const router = useRouter()
  const app = useAppStore()
  const tasks = useTaskStore()
  const timer = useTimerStore()

  async function startTaskFocus(taskId: string, mode: TimerMode = 'POMODORO') {
    await timer.initialize()
    if (['RUNNING', 'PAUSED'].includes(timer.timerState.status)) {
      if (timer.timerState.taskId !== taskId) app.notify('已有正在进行的专注，请先结束或放弃')
      await router.push('/focus')
      return false
    }
    if (!await timer.selectMode(mode)) return false
    if (!await timer.setTask(taskId)) return false
    if (!await timer.start(taskId)) return false
    const task = tasks.getTaskById(taskId)
    if (task && task.status === 'TODO') await tasks.moveTask(taskId, 'IN_PROGRESS')
    app.taskDrawerOpen = false
    await router.push('/focus')
    return true
  }

  async function startFreeFocus(mode: TimerMode = 'POMODORO') {
    await timer.initialize()
    if (['RUNNING', 'PAUSED'].includes(timer.timerState.status)) {
      await router.push('/focus')
      return false
    }
    if (!await timer.selectMode(mode)) return false
    if (!await timer.setTask(null)) return false
    if (!await timer.start(null)) return false
    await router.push('/focus')
    return true
  }

  return { startTaskFocus, startFreeFocus }
}
