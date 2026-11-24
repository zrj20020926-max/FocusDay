import type { SyncConflictRecord } from '../../types/database'
import type { SyncEntityType } from '../../types/sync'
import { DatabaseService, databaseService } from '../database/DatabaseService'

export interface VersionedValue { version: number; updatedAt: string; deletedAt: string | null; payload: unknown }

export class SyncConflictResolver {
  constructor(private readonly database: DatabaseService = databaseService) {}

  choose(local: VersionedValue, remote: VersionedValue): { winner: 'LOCAL' | 'REMOTE'; reason: 'VERSION_MISMATCH' | 'DELETE_UPDATE' } {
    const reason = Boolean(local.deletedAt) !== Boolean(remote.deletedAt) ? 'DELETE_UPDATE' : 'VERSION_MISMATCH'
    if (local.updatedAt === remote.updatedAt) return { winner: local.version >= remote.version ? 'LOCAL' : 'REMOTE', reason }
    return { winner: Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt) ? 'LOCAL' : 'REMOTE', reason }
  }

  async record(entityType: SyncEntityType, entityId: string, localPayload: unknown, remotePayload: unknown,
    winner: 'LOCAL' | 'REMOTE', reason: SyncConflictRecord['reason']): Promise<SyncConflictRecord> {
    const now = new Date().toISOString()
    const conflict: SyncConflictRecord = {
      id: crypto.randomUUID(), entityType, entityId, localPayload: structuredClone(localPayload),
      remotePayload: structuredClone(remotePayload), winner, reason, resolvedAt: now, createdAt: now, deletedAt: null,
    }
    await this.database.db.syncConflicts.put(conflict)
    return conflict
  }
}
