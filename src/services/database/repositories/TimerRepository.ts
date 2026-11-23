import type { TimerSnapshot, TimerStorage } from '../../../types/timer'
import { DatabaseService, databaseService } from '../DatabaseService'

export interface DurableTimerStorage extends TimerStorage {
  initialize(): Promise<void>
  flush(): Promise<void>
}

export class TimerRepository implements DurableTimerStorage {
  private snapshot: TimerSnapshot | null = null
  private pendingWrite: Promise<void> = Promise.resolve()
  private initialized = false

  constructor(private readonly database: DatabaseService = databaseService) {}

  async initialize(): Promise<void> {
    if (this.initialized) return
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
      await this.database.db.timerStates.put({
        id: 'active',
        snapshot: queued,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'PENDING',
        version: (previous?.version ?? 0) + 1,
      })
    })
  }

  async flush(): Promise<void> { await this.pendingWrite }
}
