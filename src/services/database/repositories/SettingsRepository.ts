import type { UserSettingsRecord } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'

export class SettingsRepository {
  constructor(private readonly database: DatabaseService = databaseService) {}

  async get<T>(id: string): Promise<T | null> {
    await this.database.initialize()
    const record = await this.database.db.userSettings.get(id)
    return !record || record.deletedAt ? null : structuredClone(record.value as T)
  }

  async set<T>(id: string, value: T): Promise<void> {
    await this.database.initialize()
    const current = await this.database.db.userSettings.get(id)
    const now = new Date().toISOString()
    const record: UserSettingsRecord = {
      id, value: structuredClone(value), createdAt: current?.createdAt ?? now, updatedAt: now,
      deletedAt: null, syncStatus: 'PENDING', version: (current?.version ?? 0) + 1,
    }
    await this.database.db.userSettings.put(record)
  }

  async delete(id: string): Promise<boolean> {
    await this.database.initialize()
    const current = await this.database.db.userSettings.get(id)
    if (!current || current.deletedAt) return false
    const now = new Date().toISOString()
    await this.database.db.userSettings.put({ ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING', version: current.version + 1 })
    return true
  }
}
