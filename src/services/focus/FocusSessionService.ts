import type {
  CancelledSessionInput,
  FocusRecordSyncResult,
  FocusSession,
  FocusSessionSnapshot,
  FocusSessionStorage,
  FocusSummary,
  TimerFocusRecord,
} from '../../types/focusSession'

const STORAGE_KEY = 'focus-day.focus-sessions.v1'

function clone<T>(value: T): T { return structuredClone(value) }

export class LocalStorageFocusSessionStorage implements FocusSessionStorage {
  load(): FocusSessionSnapshot | null {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const snapshot = JSON.parse(raw) as FocusSessionSnapshot
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.sessions)) throw new Error('专注记录数据无效')
    return clone(snapshot)
  }

  save(snapshot: FocusSessionSnapshot): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  }
}

export class FocusSessionService {
  private sessions: FocusSession[] = []
  private initialized = false

  constructor(private readonly storage: FocusSessionStorage) {}

  initialize(): FocusSession[] {
    if (!this.initialized) {
      this.sessions = this.storage.load()?.sessions ?? []
      this.initialized = true
    }
    return this.getAll()
  }

  getAll(): FocusSession[] {
    if (!this.initialized) this.initialize()
    return clone(this.sessions).sort((a, b) => b.endTime - a.endTime)
  }

  syncTimerRecords(records: TimerFocusRecord[]): FocusRecordSyncResult {
    if (!this.initialized) this.initialize()
    const created: FocusSession[] = []
    for (const record of records) {
      const id = `focus:${record.id}`
      const session: FocusSession = {
        id,
        taskId: record.taskId,
        mode: record.mode,
        startTime: record.startedAt,
        endTime: record.endedAt,
        duration: Math.max(0, record.duration),
        status: 'COMPLETED',
        createdAt: record.createdAt,
        sourceRecordId: record.id,
        completedNaturally: record.completedNaturally,
        completedPomodoros: record.mode === 'POMODORO' && record.completedNaturally ? 1 : 0,
      }
      const index = this.sessions.findIndex(item => item.id === id)
      if (index >= 0) this.sessions[index] = session
      else { this.sessions.push(session); created.push(session) }
    }
    if (created.length > 0) this.persist()
    return { created: clone(created), sessions: this.getAll() }
  }

  recordCancellation(input: CancelledSessionInput): FocusSession {
    if (!this.initialized) this.initialize()
    const { timerState, endedAt } = input
    const id = `focus:${timerState.sessionId}:${timerState.phaseSequence}:cancelled`
    const session: FocusSession = {
      id,
      taskId: timerState.taskId,
      mode: timerState.mode,
      startTime: timerState.phaseStartedAt ?? timerState.startTime ?? endedAt,
      endTime: endedAt,
      duration: timerState.currentPhase === 'FOCUS' ? Math.max(0, input.duration) : 0,
      status: 'CANCELLED',
      createdAt: endedAt,
      sourceRecordId: null,
      completedNaturally: false,
      completedPomodoros: 0,
    }
    const index = this.sessions.findIndex(item => item.id === id)
    if (index >= 0) this.sessions[index] = session
    else this.sessions.push(session)
    this.persist()
    return clone(session)
  }

  getTaskSessions(taskId: string): FocusSession[] {
    return this.getAll().filter(session => session.taskId === taskId)
  }

  getTaskSummary(taskId: string): FocusSummary {
    return this.summarize(this.getTaskSessions(taskId))
  }

  getSummaryForRange(startTime: number, endTime: number): FocusSummary {
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return { duration: 0, focusCount: 0, completedPomodoros: 0 }
    const valid = this.getAll().filter(session => session.status === 'COMPLETED' && session.endTime > startTime && session.startTime < endTime)
    return {
      duration: valid.reduce((total, session) => total + this.durationWithin(session, startTime, endTime), 0),
      focusCount: valid.length,
      completedPomodoros: valid.filter(session => session.endTime > startTime && session.endTime <= endTime).reduce((total, session) => total + session.completedPomodoros, 0),
    }
  }

  getSummaryForDay(date: Date): FocusSummary {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    return this.getSummaryForRange(start, start + 24 * 60 * 60 * 1000)
  }

  private summarize(sessions: FocusSession[]): FocusSummary {
    const valid = sessions.filter(session => session.status === 'COMPLETED')
    return {
      duration: valid.reduce((total, session) => total + session.duration, 0),
      focusCount: valid.length,
      completedPomodoros: valid.reduce((total, session) => total + session.completedPomodoros, 0),
    }
  }

  private durationWithin(session: FocusSession, rangeStart: number, rangeEnd: number): number {
    const overlapStart = Math.max(session.startTime, rangeStart)
    const overlapEnd = Math.min(session.endTime, rangeEnd)
    if (overlapEnd <= overlapStart || session.duration <= 0) return 0
    const wallDuration = Math.max(1, session.endTime - session.startTime)
    const overlapRatio = (overlapEnd - overlapStart) / wallDuration
    return Math.min(session.duration, Math.round(session.duration * overlapRatio))
  }

  private persist(): void {
    this.storage.save({ version: 1, sessions: clone(this.sessions) })
  }
}
