import type { FocusSessionSnapshot } from '../../../types/focusSession'
import type { CategoryRecord, FocusSessionRecord, SyncMetadataRecord, TaskRecord, TimerStateRecord } from '../../../types/database'
import type { TimerSnapshot } from '../../../types/timer'
import { createSeedTaskData, TASK_STORAGE_KEY, type StoredTaskData } from '../../../repositories/task/LocalStorageTaskRepository'
import { FOCUS_SESSION_STORAGE_KEY } from '../../focus/FocusSessionService'
import { TIMER_STORAGE_KEY } from '../../timer/LocalStorageTimerStorage'
import type { FocusDayDatabase } from '../DatabaseService'

const MIGRATION_ID = 'migration:local-storage:v1'

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null
  const value = localStorage.getItem(key)
  if (!value) return null
  try { return JSON.parse(value) as T } catch { return null }
}

export async function migrateLocalStorage(db: FocusDayDatabase): Promise<void> {
  if (await db.syncMetadata.get(MIGRATION_ID)) return
  const legacyTasks = readJson<StoredTaskData>(TASK_STORAGE_KEY)
  const taskData = legacyTasks?.version === 1 ? legacyTasks : createSeedTaskData()
  const focusData = readJson<FocusSessionSnapshot>(FOCUS_SESSION_STORAGE_KEY)
  const timerData = readJson<TimerSnapshot>(TIMER_STORAGE_KEY)
  const now = new Date().toISOString()

  await db.transaction('rw', db.tasks, db.categories, db.focusSessions, db.timerStates, db.syncMetadata, async () => {
    if (await db.tasks.count() === 0) {
      const tasks: TaskRecord[] = taskData.tasks.map(task => ({ ...task, deletedAt: null, syncStatus: 'LOCAL', version: 1 }))
      await db.tasks.bulkPut(tasks)
    }
    if (await db.categories.count() === 0) {
      const categories: CategoryRecord[] = taskData.categories.map(category => ({ ...category, deletedAt: null, syncStatus: 'LOCAL', version: 1 }))
      await db.categories.bulkPut(categories)
    }
    if (await db.focusSessions.count() === 0 && focusData?.version === 1) {
      const sessions: FocusSessionRecord[] = focusData.sessions.map(session => ({
        ...session, updatedAt: session.createdAt, deletedAt: null, syncStatus: 'LOCAL', version: 1,
      }))
      await db.focusSessions.bulkPut(sessions)
    }
    if (await db.timerStates.count() === 0 && timerData?.state?.version === 1) {
      const timer: TimerStateRecord = {
        id: 'active', snapshot: timerData, createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'LOCAL', version: 1,
      }
      await db.timerStates.put(timer)
    }
    const marker: SyncMetadataRecord = {
      id: MIGRATION_ID,
      lastSyncedAt: null,
      cursor: null,
      value: { completedAt: now, imported: { tasks: !!legacyTasks, timer: !!timerData, focusSessions: !!focusData } },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'LOCAL',
      version: 1,
    }
    await db.syncMetadata.put(marker)
  })
}
