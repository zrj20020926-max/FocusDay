import type { Json, UserSettingRow } from '../../../types/cloud'
import { cloudError, requireUser, type CloudClient } from './helpers'

export class CloudSettingsRepository {
  constructor(private readonly client: CloudClient) {}

  async get<T>(key: string): Promise<T | null> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('user_settings').select('*').eq('user_id', user.id).eq('key', key).is('deleted_at', null).maybeSingle()
    if (error) cloudError('get-setting', error)
    return data ? structuredClone(data.value as unknown as T) : null
  }

  async set<T>(key: string, value: T): Promise<void> {
    const user = await requireUser(this.client)
    const { data: current, error: readError } = await this.client.from('user_settings').select('id, version, created_at').eq('user_id', user.id).eq('key', key).maybeSingle()
    if (readError) cloudError('find-setting', readError)
    const now = new Date().toISOString()
    const row: UserSettingRow = {
      id: current?.id ?? crypto.randomUUID(), user_id: user.id, key, value: structuredClone(value) as unknown as Json,
      created_at: current?.created_at ?? now, updated_at: now, deleted_at: null, version: (current?.version ?? 0) + 1,
    }
    const { error } = await this.client.from('user_settings').upsert(row, { onConflict: 'user_id,key' })
    if (error) cloudError('save-setting', error)
  }

  async delete(key: string): Promise<boolean> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('user_settings').update({ deleted_at: new Date().toISOString() }).eq('user_id', user.id).eq('key', key).is('deleted_at', null).select('id')
    if (error) cloudError('delete-setting', error)
    return Boolean(data?.length)
  }
}
