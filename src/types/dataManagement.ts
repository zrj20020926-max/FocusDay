import type { FocusSession } from './focusSession'
import type { Task, TaskCategory } from './task'
import type { Habit, HabitRecord } from './habit'

export const USER_DATA_FORMAT = 'focus-day-user-data' as const
export const USER_DATA_SCHEMA_VERSION = 2 as const

export interface ExportedSetting { key: string; value: unknown }

export interface UserDataBackup {
  format: typeof USER_DATA_FORMAT
  schemaVersion: 1 | typeof USER_DATA_SCHEMA_VERSION
  backupId: string
  exportedAt: string
  ownerId: string | null
  data: {
    tasks: Task[]
    categories: TaskCategory[]
    focusSessions: FocusSession[]
    userSettings: ExportedSetting[]
    habits: Habit[]
    habitRecords: HabitRecord[]
  }
}

export interface ImportSummary {
  tasks: number
  categories: number
  focusSessions: number
  userSettings: number
  habits: number
  habitRecords: number
}

export class DataManagementError extends Error {
  constructor(message: string, readonly code: 'INVALID_FORMAT' | 'UNSUPPORTED_VERSION' | 'INVALID_DATA' | 'OWNER_MISMATCH' | 'DUPLICATE_BACKUP' | 'DATABASE_ERROR') {
    super(message)
    this.name = 'DataManagementError'
  }
}
