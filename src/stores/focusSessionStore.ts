import { defineStore } from 'pinia'
import { FocusSessionService, LocalStorageFocusSessionStorage } from '../services/focus/FocusSessionService'
import type { FocusRecord } from '../types/timer'
import type { FocusSession, FocusSummary } from '../types/focusSession'
import type { TimerState } from '../types/timer'

const service = new FocusSessionService(new LocalStorageFocusSessionStorage())
const emptySummary = (): FocusSummary => ({ duration: 0, focusCount: 0, completedPomodoros: 0 })

export const useFocusSessionStore = defineStore('focusSessions', {
  state: () => ({
    sessions: [] as FocusSession[],
    initialized: false,
    completionSessionId: null as string | null,
  }),
  getters: {
    validSessions: state => state.sessions.filter(session => session.status === 'COMPLETED'),
    completionSession: state => state.sessions.find(session => session.id === state.completionSessionId) ?? null,
    taskSessions: state => (taskId: string) => state.sessions.filter(session => session.taskId === taskId).sort((a, b) => b.endTime - a.endTime),
    taskSummary: state => (taskId: string): FocusSummary => {
      void state.sessions.length
      return service.getTaskSummary(taskId)
    },
    todaySummary: state => {
      void state.sessions.length
      return service.getSummaryForDay(new Date())
    },
    rangeSummary: state => (startTime: number, endTime: number): FocusSummary => {
      void state.sessions.length
      return service.getSummaryForRange(startTime, endTime)
    },
  },
  actions: {
    initialize() {
      if (this.initialized) return
      this.sessions = service.initialize()
      this.initialized = true
    },
    syncTimerRecords(records: FocusRecord[], showFeedback = true): FocusSession[] {
      if (!this.initialized) this.initialize()
      const result = service.syncTimerRecords(records)
      this.sessions = result.sessions
      const latest = result.created[result.created.length - 1]
      if (showFeedback && latest) this.completionSessionId = latest.id
      return result.created
    },
    recordCancellation(timerState: TimerState, duration: number, endedAt: number) {
      if (!this.initialized) this.initialize()
      service.recordCancellation({ timerState, duration, endedAt })
      this.sessions = service.getAll()
    },
    dismissCompletion() { this.completionSessionId = null },
    clearCompletionAndUse(sessionId: string | null) { this.completionSessionId = sessionId },
    getTodaySummary(): FocusSummary { return this.todaySummary ?? emptySummary() },
  },
})
