import type { FocusSession } from '../../../types/focusSession'
import type { FocusSessionRepositoryPort } from '../../../types/focusSession'
import type { FocusSessionRecord } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'

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
  constructor(private readonly database: DatabaseService = databaseService) {}

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
    await this.database.db.focusSessions.put(toRecord(session, previous))
    return clone(session)
  }

  async bulkUpsert(sessions: FocusSession[]): Promise<FocusSession[]> {
    if (sessions.length === 0) return []
    await this.database.transaction(async () => {
      const previous = await this.database.db.focusSessions.bulkGet(sessions.map(session => session.id))
      await this.database.db.focusSessions.bulkPut(sessions.map((session, index) => toRecord(session, previous[index])))
    })
    return clone(sessions)
  }

  async softDelete(id: string): Promise<boolean> {
    await this.database.initialize()
    const current = await this.database.db.focusSessions.get(id)
    if (!current || current.deletedAt) return false
    const now = Date.now()
    await this.database.db.focusSessions.put({ ...current, deletedAt: now, updatedAt: now, syncStatus: 'PENDING', version: current.version + 1 })
    return true
  }
}
