import type { FocusSession } from './focusSession'
import type { Task, TaskCategory } from './task'
import type { TimerSnapshot } from './timer'
import type { Habit, HabitRecord } from './habit'
import type { SyncConflict, SyncEntityType, SyncOperation, SyncQueueStatus } from './sync'

export const SYNC_STATUSES = ['LOCAL', 'PENDING', 'SYNCED', 'CONFLICT'] as const
export type SyncStatus = (typeof SYNC_STATUSES)[number]

export interface PersistenceMetadata {
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  syncStatus: SyncStatus
  version: number
}

export type TaskRecord = Task & Pick<PersistenceMetadata, 'deletedAt' | 'syncStatus' | 'version'>
export type CategoryRecord = TaskCategory & Pick<PersistenceMetadata, 'deletedAt' | 'syncStatus' | 'version'>
export type HabitEntityRecord = Habit & Pick<PersistenceMetadata, 'syncStatus' | 'version'>
export type HabitRecordEntity = HabitRecord & Pick<PersistenceMetadata, 'syncStatus' | 'version'>

export interface FocusSessionRecord extends Omit<FocusSession, 'createdAt'> {
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  syncStatus: SyncStatus
  version: number
}

export interface TimerStateRecord extends PersistenceMetadata {
  id: 'active'
  snapshot: TimerSnapshot
}

export interface UserSettingsRecord extends PersistenceMetadata {
  id: string
  value: unknown
}

export interface SyncQueueRecord extends PersistenceMetadata {
  id: string
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperation
  payload: unknown
  baseVersion: number
  baseUpdatedAt: string | null
  retryCount: number
  nextAttemptAt: string | null
  status: SyncQueueStatus
  lastError: string | null
}

export interface SyncConflictRecord extends SyncConflict {
  deletedAt: string | null
}

export interface SyncMetadataRecord extends PersistenceMetadata {
  id: string
  lastSyncedAt: string | null
  cursor: string | null
  value: unknown
}

export interface DatabaseExport {
  format: 'focus-day-database'
  schemaVersion: number
  exportedAt: string
  data: {
    tasks: TaskRecord[]
    categories: CategoryRecord[]
    focusSessions: FocusSessionRecord[]
    timerStates: TimerStateRecord[]
    userSettings: UserSettingsRecord[]
    syncQueue: SyncQueueRecord[]
    syncMetadata: SyncMetadataRecord[]
    syncConflicts: SyncConflictRecord[]
    habits: HabitEntityRecord[]
    habitRecords: HabitRecordEntity[]
  }
}

export function persistenceMetadata(now = new Date().toISOString()): PersistenceMetadata {
  return { createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'LOCAL', version: 1 }
}
