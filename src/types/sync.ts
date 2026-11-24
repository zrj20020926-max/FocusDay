export const SYNC_ENTITY_TYPES = ['CATEGORY', 'TASK', 'FOCUS_SESSION', 'TIMER_STATE', 'USER_SETTING'] as const
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number]

export type SyncOperation = 'INSERT' | 'UPDATE' | 'DELETE'
export type SyncQueueStatus = 'PENDING' | 'PROCESSING' | 'FAILED' | 'CONFLICT'
export type SyncUiStatus = 'SYNCED' | 'SYNCING' | 'PENDING' | 'OFFLINE' | 'ERROR' | 'CONFLICT'

export interface SyncQueueItem {
  id: string
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperation
  payload: unknown
  baseVersion: number
  baseUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  retryCount: number
  nextAttemptAt: string | null
  status: SyncQueueStatus
  lastError: string | null
}

export interface SyncConflict {
  id: string
  entityType: SyncEntityType
  entityId: string
  localPayload: unknown
  remotePayload: unknown
  winner: 'LOCAL' | 'REMOTE'
  reason: 'VERSION_MISMATCH' | 'DELETE_UPDATE' | 'SIMULTANEOUS_TIMER'
  resolvedAt: string
  createdAt: string
}

export interface SyncStatusSnapshot {
  status: SyncUiStatus
  pendingCount: number
  lastSyncedAt: string | null
  lastError: string | null
  conflicts: number
}
