import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseService } from '../database/DatabaseService'
import { SyncConflictResolver } from './SyncConflictResolver'

const databases: DatabaseService[] = []
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())) })

describe('SyncConflictResolver', () => {
  it('先检测版本并以更新时间选择普通数据的胜者', () => {
    const db = new DatabaseService(`conflict-${crypto.randomUUID()}`); databases.push(db)
    const resolver = new SyncConflictResolver(db)
    expect(resolver.choose(
      { version: 3, updatedAt: '2026-11-24T08:02:00Z', deletedAt: null, payload: {} },
      { version: 4, updatedAt: '2026-11-24T08:01:00Z', deletedAt: null, payload: {} },
    )).toEqual({ winner: 'LOCAL', reason: 'VERSION_MISMATCH' })
  })

  it('识别删除与修改冲突并持久化解决审计', async () => {
    const db = new DatabaseService(`conflict-${crypto.randomUUID()}`); databases.push(db); await db.initialize()
    const resolver = new SyncConflictResolver(db)
    const result = resolver.choose(
      { version: 2, updatedAt: '2026-11-24T08:00:00Z', deletedAt: '2026-11-24T08:00:00Z', payload: {} },
      { version: 2, updatedAt: '2026-11-24T08:01:00Z', deletedAt: null, payload: {} },
    )
    expect(result).toEqual({ winner: 'REMOTE', reason: 'DELETE_UPDATE' })
    await resolver.record('TASK', crypto.randomUUID(), { deleted: true }, { title: 'remote' }, result.winner, result.reason)
    expect(await db.db.syncConflicts.count()).toBe(1)
  })
})
