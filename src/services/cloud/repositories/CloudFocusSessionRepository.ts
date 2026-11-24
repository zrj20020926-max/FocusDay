import type { FocusSession, FocusSessionRepositoryPort } from '../../../types/focusSession'
import type { FocusSessionRow } from '../../../types/cloud'
import { assertUuid } from '../CloudRepositoryError'
import { cloudError, requireUser, type CloudClient } from './helpers'

function fromRow(row: FocusSessionRow): FocusSession {
  return {
    id: row.id, taskId: row.task_id, mode: row.mode, startTime: Date.parse(row.start_time), endTime: Date.parse(row.end_time),
    duration: row.duration, status: row.status, createdAt: Date.parse(row.created_at), sourceRecordId: row.source_record_id,
    completedNaturally: row.completed_naturally, completedPomodoros: row.completed_pomodoros,
  }
}

function toRow(session: FocusSession, userId: string): FocusSessionRow {
  assertUuid(session.id, '专注记录 ID')
  if (session.taskId) assertUuid(session.taskId, '任务 ID')
  return {
    id: session.id, user_id: userId, task_id: session.taskId, mode: session.mode,
    start_time: new Date(session.startTime).toISOString(), end_time: new Date(session.endTime).toISOString(),
    duration: session.duration, status: session.status, source_record_id: session.sourceRecordId,
    completed_naturally: session.completedNaturally, completed_pomodoros: session.completedPomodoros,
    created_at: new Date(session.createdAt).toISOString(), updated_at: new Date().toISOString(), deleted_at: null, version: 1,
  }
}

export class CloudFocusSessionRepository implements FocusSessionRepositoryPort {
  constructor(private readonly client: CloudClient) {}

  async list(includeDeleted = false): Promise<FocusSession[]> {
    const user = await requireUser(this.client)
    let query = this.client.from('focus_sessions').select('*').eq('user_id', user.id)
    if (!includeDeleted) query = query.is('deleted_at', null)
    const { data, error } = await query.order('end_time', { ascending: false })
    if (error) cloudError('list-focus-sessions', error)
    return (data ?? []).map(fromRow)
  }

  async findById(id: string): Promise<FocusSession | null> {
    assertUuid(id, '专注记录 ID')
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('focus_sessions').select('*').eq('user_id', user.id).eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) cloudError('find-focus-session', error)
    return data ? fromRow(data) : null
  }

  async upsert(session: FocusSession): Promise<FocusSession> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('focus_sessions').upsert(toRow(session, user.id), { onConflict: 'id' }).select('*').single()
    if (error || !data) cloudError('save-focus-session', error)
    return fromRow(data)
  }

  async bulkUpsert(sessions: FocusSession[]): Promise<FocusSession[]> {
    if (!sessions.length) return []
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('focus_sessions').upsert(sessions.map(session => toRow(session, user.id)), { onConflict: 'id' }).select('*')
    if (error) cloudError('save-focus-sessions', error)
    return (data ?? []).map(fromRow)
  }

  async softDelete(id: string): Promise<boolean> {
    assertUuid(id, '专注记录 ID')
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('focus_sessions').update({ deleted_at: new Date().toISOString() }).eq('user_id', user.id).eq('id', id).is('deleted_at', null).select('id')
    if (error) cloudError('delete-focus-session', error)
    return Boolean(data?.length)
  }
}
