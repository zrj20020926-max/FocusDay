import type { ActiveFocusInterval, FocusRecord, TimerMode, TimerState } from './timer'

export type FocusSessionStatus = 'COMPLETED' | 'CANCELLED'

export interface FocusSession {
  id: string
  taskId: string | null
  habitId?: string | null
  activeIntervals?: ActiveFocusInterval[]
  mode: TimerMode
  startTime: number
  endTime: number
  duration: number
  status: FocusSessionStatus
  createdAt: number
  sourceRecordId: string | null
  completedNaturally: boolean
  completedPomodoros: number
}

export interface FocusSessionSnapshot {
  version: 1
  sessions: FocusSession[]
}

export interface FocusSessionStorage {
  load(): FocusSessionSnapshot | null
  save(snapshot: FocusSessionSnapshot): void
}

export interface FocusSessionRepositoryPort {
  list(includeDeleted?: boolean): Promise<FocusSession[]>
  findById(id: string): Promise<FocusSession | null>
  hasSourceRecord?(sourceRecordId: string): Promise<boolean>
  upsert(session: FocusSession): Promise<FocusSession>
  bulkUpsert(sessions: FocusSession[]): Promise<FocusSession[]>
  softDelete(id: string): Promise<boolean>
}

export interface FocusSummary {
  duration: number
  focusCount: number
  completedPomodoros: number
}

export interface CancelledSessionInput {
  timerState: TimerState
  duration: number
  endedAt: number
}

export interface FocusRecordSyncResult {
  created: FocusSession[]
  sessions: FocusSession[]
}

export type TimerFocusRecord = FocusRecord
