import type { TimerSnapshot, TimerStorage } from '../../../types/timer'
import type { TimerStateRecord } from '../../../types/database'
import { DatabaseService, databaseService } from '../DatabaseService'
import { SyncQueueService } from '../../sync/SyncQueueService'

export interface DurableTimerStorage extends TimerStorage {
  initialize(): Promise<void>
  flush(): Promise<void>
}

export class TimerRepository implements DurableTimerStorage {
  private snapshot: TimerSnapshot | null = null
  private pendingWrite: Promise<void> = Promise.resolve()
  private initialized = false

  private readonly queue: SyncQueueService
  constructor(private readonly database: DatabaseService = databaseService) { this.queue = new SyncQueueService(database) }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.database.initialize()
    const record = await this.database.db.timerStates.get('active')
    this.snapshot = record && !record.deletedAt ? structuredClone(record.snapshot) : null
    this.initialized = true
  }

  async reload(): Promise<void> {
    await this.database.initialize()
    const record = await this.database.db.timerStates.get('active')
    this.snapshot = record && !record.deletedAt ? structuredClone(record.snapshot) : null
    this.initialized = true
  }

  load(): TimerSnapshot | null {
    if (!this.initialized) throw new Error('计时仓库尚未初始化')
    return this.snapshot ? structuredClone(this.snapshot) : null
  }

  save(snapshot: TimerSnapshot): void {
    if (!this.initialized) throw new Error('计时仓库尚未初始化')
    this.snapshot = structuredClone(snapshot)
    const queued = structuredClone(snapshot)
    this.pendingWrite = this.pendingWrite.catch(() => undefined).then(async () => {
      const previous = await this.database.db.timerStates.get('active')
      const now = new Date().toISOString()
      await this.database.transaction(async () => {
        const record: TimerStateRecord = {
        id: 'active',
        snapshot: queued,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'PENDING',
        version: (previous?.version ?? 0) + 1,
        }
        await this.database.db.timerStates.put(record)
        await this.queue.enqueueWithinTransaction({ entityType: 'TIMER_STATE', entityId: 'active', operation: previous ? 'UPDATE' : 'INSERT', payload: record,
          baseVersion: previous?.version ?? 0, baseUpdatedAt: previous?.updatedAt ?? null })
      })
    })
  }

  async flush(): Promise<void> { await this.pendingWrite }
}
