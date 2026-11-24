import type { SyncQueueRecord } from '../../types/database'
import type { SyncEntityType, SyncOperation } from '../../types/sync'
import { DatabaseService, databaseService } from '../database/DatabaseService'

const queueEvents = new EventTarget()

export interface EnqueueInput {
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperation
  payload: unknown
  baseVersion: number
  baseUpdatedAt: string | null
}

const operationAfter = (current: SyncOperation, next: SyncOperation): SyncOperation => {
  if (next === 'DELETE') return 'DELETE'
  if (current === 'INSERT') return 'INSERT'
  if (current === 'DELETE') return 'UPDATE'
  return next
}

export class SyncQueueService {
  constructor(private readonly database: DatabaseService = databaseService) {}
  subscribe(listener: EventListener): () => void { queueEvents.addEventListener('change', listener); return () => queueEvents.removeEventListener('change', listener) }

  async enqueue(input: EnqueueInput): Promise<SyncQueueRecord> {
    await this.database.initialize()
    const record = await this.database.transaction(() => this.enqueueWithinTransaction(input))
    queueEvents.dispatchEvent(new Event('change'))
    return record
  }

  async enqueueWithinTransaction(input: EnqueueInput): Promise<SyncQueueRecord> {
    const now = new Date().toISOString()
    const existing = (await this.database.db.syncQueue.where('[entityType+entityId]')
      .equals([input.entityType, input.entityId]).toArray())
      .filter(item => !item.deletedAt && item.status !== 'CONFLICT')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    if (existing) {
      const merged: SyncQueueRecord = {
        ...existing,
        operation: operationAfter(existing.operation, input.operation), payload: structuredClone(input.payload),
        updatedAt: now, status: 'PENDING', retryCount: 0, nextAttemptAt: null, lastError: null,
      }
      await this.database.db.syncQueue.put(merged)
      queueEvents.dispatchEvent(new Event('change'))
      return structuredClone(merged)
    }
    const record: SyncQueueRecord = {
      id: crypto.randomUUID(), entityType: input.entityType, entityId: input.entityId, operation: input.operation,
      payload: structuredClone(input.payload), baseVersion: input.baseVersion, baseUpdatedAt: input.baseUpdatedAt,
      createdAt: now, updatedAt: now, retryCount: 0, nextAttemptAt: null, status: 'PENDING', lastError: null,
      deletedAt: null, syncStatus: 'LOCAL', version: 1,
    }
    await this.database.db.syncQueue.put(record)
    queueEvents.dispatchEvent(new Event('change'))
    return structuredClone(record)
  }

  async ready(limit = 100, now = Date.now()): Promise<SyncQueueRecord[]> {
    await this.database.initialize()
    return (await this.database.db.syncQueue.orderBy('createdAt').toArray())
      .filter(item => !item.deletedAt && item.status !== 'CONFLICT' && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now))
      .slice(0, limit)
  }

  async recoverInterrupted(): Promise<void> {
    await this.database.initialize()
    await this.database.db.syncQueue.where('status').equals('PROCESSING').modify({ status: 'PENDING' })
  }

  async markProcessing(ids: string[]): Promise<void> {
    const now = new Date().toISOString()
    await this.database.db.syncQueue.where('id').anyOf(ids).modify({ status: 'PROCESSING', updatedAt: now })
  }

  async complete(id: string): Promise<void> { await this.database.db.syncQueue.delete(id); queueEvents.dispatchEvent(new Event('change')) }

  async fail(item: SyncQueueRecord, error: unknown, conflict = false): Promise<void> {
    const retryCount = item.retryCount + 1
    const delay = Math.min(5 * 60_000, 1_000 * 2 ** Math.min(retryCount - 1, 8))
    await this.database.db.syncQueue.update(item.id, {
      retryCount, status: conflict ? 'CONFLICT' : 'FAILED', updatedAt: new Date().toISOString(),
      nextAttemptAt: conflict ? null : new Date(Date.now() + delay).toISOString(),
      lastError: error instanceof Error ? error.message : String(error),
    })
    queueEvents.dispatchEvent(new Event('change'))
  }

  async countPending(): Promise<number> {
    await this.database.initialize()
    return (await this.database.db.syncQueue.toArray()).filter(item => !item.deletedAt).length
  }
}

export const syncQueueService = new SyncQueueService()
