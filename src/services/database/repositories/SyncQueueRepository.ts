import type { SyncMetadataRecord, SyncQueueRecord } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'

export class SyncQueueRepository {
  constructor(private readonly database: DatabaseService = databaseService) {}

  async enqueue(input: Omit<SyncQueueRecord, 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncStatus' | 'version'>): Promise<SyncQueueRecord> {
    await this.database.initialize()
    const now = new Date().toISOString()
    const record: SyncQueueRecord = { ...structuredClone(input), createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'LOCAL', version: 1 }
    await this.database.db.syncQueue.put(record)
    return structuredClone(record)
  }

  async pending(): Promise<SyncQueueRecord[]> {
    await this.database.initialize()
    return (await this.database.db.syncQueue.orderBy('createdAt').toArray()).filter(record => !record.deletedAt)
  }

  async remove(id: string): Promise<boolean> {
    await this.database.initialize()
    const current = await this.database.db.syncQueue.get(id)
    if (!current || current.deletedAt) return false
    const now = new Date().toISOString()
    await this.database.db.syncQueue.put({ ...current, deletedAt: now, updatedAt: now, version: current.version + 1 })
    return true
  }

  async getMetadata(id: string): Promise<SyncMetadataRecord | null> {
    await this.database.initialize()
    const value = await this.database.db.syncMetadata.get(id)
    return value && !value.deletedAt ? structuredClone(value) : null
  }

  async setMetadata(record: Omit<SyncMetadataRecord, 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncStatus' | 'version'>): Promise<void> {
    await this.database.initialize()
    const current = await this.database.db.syncMetadata.get(record.id)
    const now = new Date().toISOString()
    await this.database.db.syncMetadata.put({ ...structuredClone(record), createdAt: current?.createdAt ?? now, updatedAt: now,
      deletedAt: null, syncStatus: 'LOCAL', version: (current?.version ?? 0) + 1 })
  }
}
