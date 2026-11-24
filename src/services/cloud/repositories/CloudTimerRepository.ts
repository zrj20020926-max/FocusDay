import type { TimerSnapshot } from '../../../types/timer'
import type { Json, TimerStateRow } from '../../../types/cloud'
import { cloudError, requireUser, type CloudClient } from './helpers'

export class CloudTimerRepository {
  constructor(private readonly client: CloudClient) {}

  async load(): Promise<TimerSnapshot | null> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('timer_states').select('*').eq('user_id', user.id).is('deleted_at', null).maybeSingle()
    if (error) cloudError('load-timer-state', error)
    return data ? structuredClone(data.state as unknown as TimerSnapshot) : null
  }

  async save(snapshot: TimerSnapshot): Promise<void> {
    const user = await requireUser(this.client)
    const { data: current, error: readError } = await this.client.from('timer_states').select('id, version, created_at').eq('user_id', user.id).maybeSingle()
    if (readError) cloudError('find-timer-state', readError)
    const now = new Date().toISOString()
    const row: TimerStateRow = {
      id: current?.id ?? crypto.randomUUID(), user_id: user.id, state: structuredClone(snapshot) as unknown as Json,
      created_at: current?.created_at ?? now, updated_at: now, deleted_at: null, version: (current?.version ?? 0) + 1,
    }
    const { error } = await this.client.from('timer_states').upsert(row, { onConflict: 'user_id' })
    if (error) cloudError('save-timer-state', error)
  }

  async softDelete(): Promise<boolean> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('timer_states').update({ deleted_at: new Date().toISOString() }).eq('user_id', user.id).is('deleted_at', null).select('id')
    if (error) cloudError('delete-timer-state', error)
    return Boolean(data?.length)
  }
}
