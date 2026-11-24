import type { SyncMetadataRecord, SyncQueueRecord } from '../../../types/database'
import type { EnqueueInput } from '../../sync/SyncQueueService'
import { SyncQueueService } from '../../sync/SyncQueueService'
import { DatabaseService, databaseService } from '../DatabaseService'

export class SyncQueueRepository {
  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }

  enqueue(input: EnqueueInput): Promise<SyncQueueRecord> { return this.queue.enqueue(input) }

  async pending(): Promise<SyncQueueRecord[]> {
    await this.database.initialize()
    return this.queue.ready(Number.MAX_SAFE_INTEGER)
  }

  async remove(id: string): Promise<boolean> {
    await this.database.initialize()
    const exists = Boolean(await this.database.db.syncQueue.get(id))
    if (exists) await this.queue.complete(id)
    return exists
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
