import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { CategoryRecord, FocusSessionRecord, SyncQueueRecord, TaskRecord, TimerStateRecord, UserSettingsRecord } from '../../types/database'
import type { Json } from '../../types/cloud'
import type { SyncEntityType } from '../../types/sync'
import { DatabaseService, databaseService } from '../database/DatabaseService'
import { getSupabaseClient } from '../supabase/client'
import { SyncConflictResolver, type VersionedValue } from './SyncConflictResolver'
import { SyncQueueService, syncQueueService } from './SyncQueueService'
import { SyncStatusService, syncStatusService } from './SyncStatusService'
import { toUserMessage } from '../errors/userMessage'

type Client = SupabaseClient<any>
type RemoteRow = Record<string, any> & { id: string; version: number; updated_at: string; deleted_at: string | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ENTITY_ORDER: SyncEntityType[] = ['CATEGORY', 'TASK', 'FOCUS_SESSION', 'USER_SETTING', 'TIMER_STATE']
const TABLES: Record<SyncEntityType, string> = {
  CATEGORY: 'categories', TASK: 'tasks', FOCUS_SESSION: 'focus_sessions', TIMER_STATE: 'timer_states', USER_SETTING: 'user_settings',
}

export class SyncError extends Error {
  constructor(message: string, readonly kind: 'NETWORK' | 'AUTH' | 'PERMISSION' | 'CONFLICT' | 'DATA' = 'DATA') { super(message) }
}

export class SyncService {
  private running: Promise<void> | null = null
  private readonly conflicts: SyncConflictResolver
  constructor(
    private readonly database: DatabaseService = databaseService,
    private readonly queue: SyncQueueService = syncQueueService,
    private readonly status: SyncStatusService = syncStatusService,
    private readonly clientFactory: () => Promise<Client> = getSupabaseClient as () => Promise<Client>,
    private readonly timeoutMs = 20_000,
  ) { this.conflicts = new SyncConflictResolver(database) }

  syncNow(): Promise<void> {
    if (!this.running) this.running = this.perform().finally(() => { this.running = null })
    return this.withTimeout(this.running)
  }

  private async perform(): Promise<void> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { await this.refreshStatus('OFFLINE'); return }
    this.status.setStatus('SYNCING')
    try {
      const client = await this.clientFactory()
      const user = await this.requireUser(client)
      await this.database.initialize()
      await this.bindUser(user)
      await this.normalizeLocalIds()
      await this.queue.recoverInterrupted()
      await this.seedMissingQueueItems()
      await this.push(client, user)
      await this.pull(client, user)
      const now = new Date().toISOString()
      await this.setMetadata('sync:last-success', { at: now }, null, now)
      await this.refreshStatus('SYNCED', now)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('focus-day:data-synced'))
    } catch (error) {
      const message = toUserMessage(error, '同步失败，本地数据已安全保留')
      const conflicts = await this.database.db.syncQueue.where('status').equals('CONFLICT').count().catch(() => 0)
      this.status.update({ status: conflicts ? 'CONFLICT' : 'ERROR', lastError: message, conflicts })
      throw error
    }
  }

  private async requireUser(client: Client): Promise<User> {
    const { data, error } = await client.auth.getUser()
    if (error) throw new SyncError(error.message, 'AUTH')
    if (!data.user) throw new SyncError('登录后才能同步云端数据', 'AUTH')
    return data.user
  }

  private async bindUser(user: User): Promise<void> {
    const existing = await this.database.db.syncMetadata.get('sync:bound-user')
    const bound = (existing?.value as { userId?: string } | null)?.userId
    if (bound && bound !== user.id) throw new SyncError('此设备的本地数据已绑定其他账号，请先导出数据或使用原账号登录', 'AUTH')
    if (!bound) await this.setMetadata('sync:bound-user', { userId: user.id })
  }

  private async normalizeLocalIds(): Promise<void> {
    const marker = await this.database.db.syncMetadata.get('sync:uuid-normalized')
    if (marker) return
    await this.database.transaction(async () => {
      const categories = await this.database.db.categories.toArray()
      const categoryIds = new Map(categories.filter(item => !UUID.test(item.id)).map(item => [item.id, crypto.randomUUID()]))
      const tasks = await this.database.db.tasks.toArray()
      const taskIds = new Map(tasks.filter(item => !UUID.test(item.id)).map(item => [item.id, crypto.randomUUID()]))
      const sessions = await this.database.db.focusSessions.toArray()
      const sessionIds = new Map(sessions.filter(item => !UUID.test(item.id)).map(item => [item.id, crypto.randomUUID()]))
      if (categoryIds.size) {
        await this.database.db.categories.bulkDelete([...categoryIds.keys()])
        await this.database.db.categories.bulkPut(categories.map(item => ({ ...item, id: categoryIds.get(item.id) ?? item.id })))
      }
      if (taskIds.size || categoryIds.size) {
        await this.database.db.tasks.bulkDelete([...taskIds.keys()])
        await this.database.db.tasks.bulkPut(tasks.map(item => ({ ...item, id: taskIds.get(item.id) ?? item.id,
          categoryId: categoryIds.get(item.categoryId) ?? item.categoryId })))
      }
      if (sessionIds.size || taskIds.size) {
        await this.database.db.focusSessions.bulkDelete([...sessionIds.keys()])
        await this.database.db.focusSessions.bulkPut(sessions.map(item => ({ ...item, id: sessionIds.get(item.id) ?? item.id,
          taskId: item.taskId ? taskIds.get(item.taskId) ?? item.taskId : null })))
      }
      const timer = await this.database.db.timerStates.get('active')
      if (timer && taskIds.size) {
        const snapshot = structuredClone(timer.snapshot)
        if (snapshot.state.taskId) snapshot.state.taskId = taskIds.get(snapshot.state.taskId) ?? snapshot.state.taskId
        snapshot.records = snapshot.records.map(record => ({ ...record, taskId: record.taskId ? taskIds.get(record.taskId) ?? record.taskId : null }))
        await this.database.db.timerStates.put({ ...timer, snapshot })
      }
      await this.database.db.syncQueue.clear()
      const now = new Date().toISOString()
      await this.database.db.syncMetadata.put({ id: 'sync:uuid-normalized', lastSyncedAt: null, cursor: null, value: { at: now },
        createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'LOCAL', version: 1 })
    })
  }

  private async seedMissingQueueItems(): Promise<void> {
    await this.database.transaction(async () => {
      const existing = new Set((await this.database.db.syncQueue.toArray()).filter(item => !item.deletedAt).map(item => `${item.entityType}:${item.entityId}`))
      const add = async (entityType: SyncEntityType, entityId: string, record: any) => {
        if (record.syncStatus === 'SYNCED' || existing.has(`${entityType}:${entityId}`)) return
        await this.queue.enqueueWithinTransaction({ entityType, entityId, operation: record.deletedAt ? 'DELETE' : record.version <= 1 ? 'INSERT' : 'UPDATE',
          payload: record, baseVersion: Math.max(0, record.version - 1), baseUpdatedAt: null })
      }
      for (const item of await this.database.db.categories.toArray()) await add('CATEGORY', item.id, item)
      for (const item of await this.database.db.tasks.toArray()) await add('TASK', item.id, item)
      for (const item of await this.database.db.focusSessions.toArray()) await add('FOCUS_SESSION', item.id, item)
      for (const item of await this.database.db.userSettings.toArray()) await add('USER_SETTING', item.id, item)
      for (const item of await this.database.db.timerStates.toArray()) await add('TIMER_STATE', item.id, item)
    })
  }

  private async push(client: Client, user: User): Promise<void> {
    const items = await this.queue.ready(200)
    items.sort((a, b) => ENTITY_ORDER.indexOf(a.entityType) - ENTITY_ORDER.indexOf(b.entityType) || a.createdAt.localeCompare(b.createdAt))
    if (!items.length) return
    await this.queue.markProcessing(items.map(item => item.id))
    for (const entityType of ENTITY_ORDER) {
      const group = items.filter(item => item.entityType === entityType)
      const batchable = group.filter(item => item.operation === 'INSERT' && !['TIMER_STATE', 'USER_SETTING'].includes(item.entityType))
      const batched = batchable.length > 1 ? batchable : []
      if (batched.length) {
        try { await this.pushInsertBatch(client, user, batched) }
        catch (error) {
          for (const item of batched) await this.queue.fail(item, error)
          if (error instanceof SyncError && ['NETWORK', 'AUTH', 'PERMISSION'].includes(error.kind)) throw error
        }
      }
      for (const item of group.filter(item => !batched.includes(item))) {
        try { await this.pushItem(client, user, item); await this.queue.complete(item.id) }
        catch (error) {
          const conflict = error instanceof SyncError && error.kind === 'CONFLICT'
          await this.queue.fail(item, error, conflict)
          if (!conflict && error instanceof SyncError && ['NETWORK', 'AUTH', 'PERMISSION'].includes(error.kind)) throw error
        }
      }
    }
  }

  private async pushInsertBatch(client: Client, user: User, items: SyncQueueRecord[]): Promise<void> {
    const table = TABLES[items[0].entityType]
    const { data: existing, error: readError } = await client.from(table).select('*').eq('user_id', user.id).in('id', items.map(item => item.entityId))
    if (readError) throw this.cloudError(readError)
    const existingById = new Map((existing ?? []).map((row: RemoteRow) => [row.id, row]))
    const fresh = items.filter(item => !existingById.has(item.entityId))
    if (fresh.length) {
      const { data, error } = await client.from(table).insert(fresh.map(item => this.toRemote(item, user.id, null))).select('*')
      if (error) throw this.cloudError(error)
      const inserted = new Map((data ?? []).map((row: RemoteRow) => [row.id, row]))
      for (const item of fresh) {
        const row = inserted.get(item.entityId)
        if (!row) throw new SyncError('批量上传结果不完整', 'DATA')
        await this.markLocalSynced(item, row)
        await this.queue.complete(item.id)
      }
    }
    for (const item of items.filter(item => existingById.has(item.entityId))) {
      await this.resolveUploadConflict(client, user, item, existingById.get(item.entityId)!)
      await this.queue.complete(item.id)
    }
  }

  private async pushItem(client: Client, user: User, item: SyncQueueRecord): Promise<void> {
    const table = TABLES[item.entityType]
    const remote = await this.findRemote(client, user.id, item)
    if (item.operation === 'INSERT' && !remote) {
      const row = this.toRemote(item, user.id, null)
      const { data, error } = await client.from(table).insert(row).select('*').single()
      if (error) throw this.cloudError(error)
      await this.markLocalSynced(item, data)
      return
    }
    if (!remote && item.operation !== 'DELETE') {
      const { data, error } = await client.from(table).insert(this.toRemote(item, user.id, null)).select('*').single()
      if (error) throw this.cloudError(error)
      await this.markLocalSynced(item, data)
      return
    }
    if (!remote && item.operation === 'DELETE') { await this.markLocalSynced(item, null); return }
    if (remote && (remote.version !== item.baseVersion || item.operation === 'INSERT')) {
      await this.resolveUploadConflict(client, user, item, remote)
      return
    }
    const row = this.toRemote(item, user.id, remote)
    let query = client.from(table).update(row).eq('user_id', user.id).eq('version', item.baseVersion)
    query = item.entityType === 'TIMER_STATE' || item.entityType === 'USER_SETTING'
      ? query.eq(item.entityType === 'TIMER_STATE' ? 'id' : 'key', item.entityType === 'TIMER_STATE' ? remote!.id : item.entityId)
      : query.eq('id', item.entityId)
    const { data, error } = await query.select('*').maybeSingle()
    if (error) throw this.cloudError(error)
    if (!data) throw new SyncError('远端版本已变化，请重新同步', 'CONFLICT')
    await this.markLocalSynced(item, data)
  }

  private async resolveUploadConflict(client: Client, user: User, item: SyncQueueRecord, remote: RemoteRow): Promise<void> {
    const local = this.localVersion(item.payload)
    const remoteVersion: VersionedValue = { version: remote.version, updatedAt: remote.updated_at, deletedAt: remote.deleted_at, payload: remote }
    const decision = this.conflicts.choose(local, remoteVersion)
    const reason = item.entityType === 'TIMER_STATE' ? 'SIMULTANEOUS_TIMER' : decision.reason
    await this.conflicts.record(item.entityType, item.entityId, item.payload, remote, decision.winner, reason)
    if (decision.winner === 'REMOTE') { await this.applyRemote(item.entityType, remote); await this.queue.complete(item.id); return }
    const row = this.toRemote({ ...item, baseVersion: remote.version }, user.id, remote)
    const { data, error } = await client.from(TABLES[item.entityType]).update(row).eq('user_id', user.id).eq('id', remote.id).eq('version', remote.version).select('*').maybeSingle()
    if (error) throw this.cloudError(error)
    if (!data) throw new SyncError('冲突解决期间远端数据再次变化', 'CONFLICT')
    await this.markLocalSynced(item, data)
  }

  private async pull(client: Client, user: User): Promise<void> {
    for (const entityType of ENTITY_ORDER) await this.pullEntity(client, user.id, entityType)
  }

  private async pullEntity(client: Client, userId: string, entityType: SyncEntityType): Promise<void> {
    const metadata = await this.database.db.syncMetadata.get(`sync:cursor:${entityType}`)
    const cursor = metadata?.cursor ? JSON.parse(metadata.cursor) as { updatedAt: string; id: string } : null
    let offset = 0
    const pageSize = 200
    while (true) {
      let query = client.from(TABLES[entityType]).select('*').eq('user_id', userId).order('updated_at').order('id').range(offset, offset + pageSize - 1)
      if (cursor) query = query.gte('updated_at', cursor.updatedAt)
      const { data, error } = await query
      if (error) throw this.cloudError(error)
      const rows = (data ?? []).filter((row: RemoteRow) => !cursor || row.updated_at > cursor.updatedAt || (row.updated_at === cursor.updatedAt && row.id > cursor.id))
      for (const row of rows) await this.mergeRemote(entityType, row)
      if (rows.length) {
        const last = rows[rows.length - 1]
        await this.setMetadata(`sync:cursor:${entityType}`, null, JSON.stringify({ updatedAt: last.updated_at, id: last.id }), last.updated_at)
      }
      if ((data ?? []).length < pageSize) break
      offset += pageSize
    }
  }

  private async mergeRemote(entityType: SyncEntityType, row: RemoteRow): Promise<void> {
    const entityId = entityType === 'USER_SETTING' ? row.key : entityType === 'TIMER_STATE' ? 'active' : row.id
    const pending = (await this.database.db.syncQueue.where('[entityType+entityId]').equals([entityType, entityId]).toArray()).find(item => !item.deletedAt)
    if (!pending) { await this.applyRemote(entityType, row); return }
    const decision = this.conflicts.choose(this.localVersion(pending.payload), { version: row.version, updatedAt: row.updated_at, deletedAt: row.deleted_at, payload: row })
    await this.conflicts.record(entityType, entityId, pending.payload, row, decision.winner,
      entityType === 'TIMER_STATE' ? 'SIMULTANEOUS_TIMER' : decision.reason)
    if (decision.winner === 'REMOTE') { await this.applyRemote(entityType, row); await this.queue.complete(pending.id) }
    else await this.database.db.syncQueue.update(pending.id, { baseVersion: row.version, baseUpdatedAt: row.updated_at, status: 'PENDING', nextAttemptAt: null })
  }

  private async findRemote(client: Client, userId: string, item: SyncQueueRecord): Promise<RemoteRow | null> {
    let query = client.from(TABLES[item.entityType]).select('*').eq('user_id', userId)
    query = item.entityType === 'TIMER_STATE' ? query.limit(1) : item.entityType === 'USER_SETTING' ? query.eq('key', item.entityId) : query.eq('id', item.entityId)
    const { data, error } = await query.maybeSingle()
    if (error) throw this.cloudError(error)
    return data
  }

  private toRemote(item: SyncQueueRecord, userId: string, remote: RemoteRow | null): Record<string, unknown> {
    const value: any = item.payload
    const common = { user_id: userId, version: Math.max(item.baseVersion + 1, value.version ?? 1), deleted_at: this.iso(value.deletedAt), updated_at: this.iso(value.updatedAt) }
    if (item.entityType === 'CATEGORY') return { id: item.entityId, ...common, name: value.name, color: value.color, icon: value.icon, is_default: value.isDefault }
    if (item.entityType === 'TASK') return { id: item.entityId, ...common, title: value.title, description: value.description, category_id: value.categoryId || null,
      priority: value.priority, status: value.status, planned_date: value.plannedDate, due_date: value.dueDate, estimated_duration: value.estimatedDuration,
      estimated_pomodoros: value.estimatedPomodoros, sort_order: value.sortOrder, completed_at: value.completedAt }
    if (item.entityType === 'FOCUS_SESSION') return { id: item.entityId, ...common, task_id: value.taskId, mode: value.mode,
      start_time: this.iso(value.startTime), end_time: this.iso(value.endTime), duration: value.duration, status: value.status,
      source_record_id: value.sourceRecordId, completed_naturally: value.completedNaturally, completed_pomodoros: value.completedPomodoros }
    if (item.entityType === 'TIMER_STATE') return { id: remote?.id ?? crypto.randomUUID(), ...common, state: value.snapshot as Json }
    return { id: remote?.id ?? crypto.randomUUID(), ...common, key: item.entityId, value: value.value as Json }
  }

  private async applyRemote(entityType: SyncEntityType, row: RemoteRow): Promise<void> {
    if (entityType === 'CATEGORY') {
      const record: CategoryRecord = { id: row.id, name: row.name, color: row.color, icon: row.icon, isDefault: row.is_default,
        createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at, syncStatus: 'SYNCED', version: row.version }
      await this.database.db.categories.put(record)
    } else if (entityType === 'TASK') {
      const record: TaskRecord = { id: row.id, title: row.title, description: row.description, categoryId: row.category_id ?? '', priority: row.priority,
        status: row.status, plannedDate: row.planned_date, dueDate: row.due_date, estimatedDuration: row.estimated_duration,
        estimatedPomodoros: row.estimated_pomodoros, sortOrder: row.sort_order, completedAt: row.completed_at,
        createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at, syncStatus: 'SYNCED', version: row.version }
      await this.database.db.tasks.put(record)
    } else if (entityType === 'FOCUS_SESSION') {
      const record: FocusSessionRecord = { id: row.id, taskId: row.task_id, mode: row.mode, startTime: Date.parse(row.start_time), endTime: Date.parse(row.end_time),
        duration: row.duration, status: row.status, createdAt: Date.parse(row.created_at), updatedAt: Date.parse(row.updated_at), deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : null,
        sourceRecordId: row.source_record_id, completedNaturally: row.completed_naturally, completedPomodoros: row.completed_pomodoros,
        syncStatus: 'SYNCED', version: row.version }
      await this.database.db.focusSessions.put(record)
    } else if (entityType === 'TIMER_STATE') {
      const record: TimerStateRecord = { id: 'active', snapshot: row.state, createdAt: row.created_at, updatedAt: row.updated_at,
        deletedAt: row.deleted_at, syncStatus: 'SYNCED', version: row.version }
      await this.database.db.timerStates.put(record)
    } else {
      const record: UserSettingsRecord = { id: row.key, value: row.value, createdAt: row.created_at, updatedAt: row.updated_at,
        deletedAt: row.deleted_at, syncStatus: 'SYNCED', version: row.version }
      await this.database.db.userSettings.put(record)
    }
  }

  private async markLocalSynced(item: SyncQueueRecord, remote: RemoteRow | null): Promise<void> {
    if (!remote) {
      const table = this.localTable(item.entityType)
      await table.update(item.entityId, { syncStatus: 'SYNCED' })
      return
    }
    await this.applyRemote(item.entityType, remote)
  }

  private localTable(entityType: SyncEntityType): any {
    if (entityType === 'CATEGORY') return this.database.db.categories
    if (entityType === 'TASK') return this.database.db.tasks
    if (entityType === 'FOCUS_SESSION') return this.database.db.focusSessions
    if (entityType === 'TIMER_STATE') return this.database.db.timerStates
    return this.database.db.userSettings
  }

  private localVersion(payload: any): VersionedValue {
    return { version: payload.version ?? 1, updatedAt: this.iso(payload.updatedAt) ?? new Date(0).toISOString(), deletedAt: this.iso(payload.deletedAt), payload }
  }
  private iso(value: string | number | null | undefined): string | null {
    if (value == null) return null
    return typeof value === 'number' ? new Date(value).toISOString() : value
  }
  private cloudError(error: { message: string; code?: string }): SyncError {
    if (error.code === '42501') return new SyncError('云端权限拒绝，请重新登录后再试', 'PERMISSION')
    if (/fetch|network|offline/i.test(error.message)) return new SyncError(error.message, 'NETWORK')
    return new SyncError(error.message, 'DATA')
  }
  private async setMetadata(id: string, value: unknown, cursor: string | null = null, lastSyncedAt: string | null = null): Promise<void> {
    const current = await this.database.db.syncMetadata.get(id)
    const now = new Date().toISOString()
    await this.database.db.syncMetadata.put({ id, value, cursor, lastSyncedAt, createdAt: current?.createdAt ?? now, updatedAt: now,
      deletedAt: null, syncStatus: 'LOCAL', version: (current?.version ?? 0) + 1 })
  }
  private async refreshStatus(preferred?: 'SYNCED' | 'OFFLINE', lastSyncedAt?: string): Promise<void> {
    const pendingCount = await this.queue.countPending()
    const conflicts = await this.database.db.syncQueue.where('status').equals('CONFLICT').count()
    this.status.update({ status: conflicts ? 'CONFLICT' : pendingCount ? 'PENDING' : preferred ?? 'SYNCED', pendingCount, conflicts,
      lastSyncedAt: lastSyncedAt ?? this.status.getSnapshot().lastSyncedAt, lastError: null })
  }
  private withTimeout(operation: Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new SyncError('云端响应超时，本地数据已安全保留，请稍后重试', 'NETWORK')
        this.status.setStatus('ERROR', error.message)
        reject(error)
      }, this.timeoutMs)
      operation.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
    })
  }
}

export const syncService = new SyncService()
