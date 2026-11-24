import type { FocusSession } from '../../../types/focusSession'
import type { FocusSessionRepositoryPort } from '../../../types/focusSession'
import type { FocusSessionRecord } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SyncQueueService } from '../../sync/SyncQueueService'

const clone = <T>(value: T): T => structuredClone(value)

function toRecord(session: FocusSession, previous?: FocusSessionRecord): FocusSessionRecord {
  return {
    ...clone(session),
    updatedAt: Date.now(),
    deletedAt: previous?.deletedAt ?? null,
    syncStatus: 'PENDING',
    version: (previous?.version ?? 0) + 1,
  }
}

function toSession(record: FocusSessionRecord): FocusSession {
  const { updatedAt: _updatedAt, deletedAt: _deletedAt, syncStatus: _syncStatus, version: _version, ...session } = record
  return clone(session)
}

export class FocusSessionRepository implements FocusSessionRepositoryPort {
  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }

  async list(includeDeleted = false): Promise<FocusSession[]> {
    await this.database.initialize()
    const records = includeDeleted
      ? await this.database.db.focusSessions.toArray()
      : (await this.database.db.focusSessions.toArray()).filter(record => !record.deletedAt)
    return records.map(toSession).sort((a, b) => b.endTime - a.endTime)
  }

  async findById(id: string): Promise<FocusSession | null> {
    await this.database.initialize()
    const record = await this.database.db.focusSessions.get(id)
    return !record || record.deletedAt ? null : toSession(record)
  }

  async upsert(session: FocusSession): Promise<FocusSession> {
    await this.database.initialize()
    const previous = await this.database.db.focusSessions.get(session.id)
    await this.database.transaction(async () => {
      const record = toRecord(session, previous)
      await this.database.db.focusSessions.put(record)
      await this.queue.enqueueWithinTransaction({ entityType: 'FOCUS_SESSION', entityId: session.id, operation: previous ? 'UPDATE' : 'INSERT', payload: record,
        baseVersion: previous?.version ?? 0, baseUpdatedAt: previous ? new Date(previous.updatedAt).toISOString() : null })
    })
    return clone(session)
  }

  async bulkUpsert(sessions: FocusSession[]): Promise<FocusSession[]> {
    if (sessions.length === 0) return []
    await this.database.transaction(async () => {
      const previous = await this.database.db.focusSessions.bulkGet(sessions.map(session => session.id))
      const records = sessions.map((session, index) => toRecord(session, previous[index]))
      await this.database.db.focusSessions.bulkPut(records)
      await Promise.all(records.map((record, index) => this.queue.enqueueWithinTransaction({ entityType: 'FOCUS_SESSION', entityId: record.id,
        operation: previous[index] ? 'UPDATE' : 'INSERT', payload: record, baseVersion: previous[index]?.version ?? 0,
        baseUpdatedAt: previous[index] ? new Date(previous[index]!.updatedAt).toISOString() : null })))
    })
    return clone(sessions)
  }

  async softDelete(id: string): Promise<boolean> {
    await this.database.initialize()
    const current = await this.database.db.focusSessions.get(id)
    if (!current || current.deletedAt) return false
    const now = Date.now()
    await this.database.transaction(async () => {
      const record = { ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING' as const, version: current.version + 1 }
      await this.database.db.focusSessions.put(record)
      await this.queue.enqueueWithinTransaction({ entityType: 'FOCUS_SESSION', entityId: id, operation: 'DELETE', payload: record,
        baseVersion: current.version, baseUpdatedAt: new Date(current.updatedAt).toISOString() })
    })
    return true
  }
}
