import Dexie from 'dexie'
import { createSeedTaskData } from '../../../repositories/task/LocalStorageTaskRepository'
import { persistenceMetadata } from '../../../types/database'
import type { FocusDayDatabase } from '../DatabaseService'
import { tableNames, type DatabaseTables, type Row, type TableName } from '../DatabaseTables'

export const ACCOUNT_IMPORT_ID = 'migration:native-indexeddb:v1'
export const DEFAULT_CATEGORIES_ID = 'sync:native-default-categories'

export async function migrateAccountStorage(owner: string | null, database: DatabaseTables, legacy: FocusDayDatabase,
  transaction: (action: (db: DatabaseTables) => Promise<void>) => Promise<void>) {
  const imported = await database.syncMetadata.get(ACCOUNT_IMPORT_ID)
  if (imported && await database.categories.count()) return
  const snapshot = imported ? null : await readLegacy(legacy, owner)
  const categorySeeds = await Promise.all(createSeedTaskData().categories.map(async category => {
    if (owner) {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(`focus-day:category:${owner}:${category.name}`))).slice(0, 16)
      bytes[6] = (bytes[6] & 15) | 80
      bytes[8] = (bytes[8] & 63) | 128
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
      category.id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
    }
    return { ...category, ...persistenceMetadata() }
  }))
  await transaction(async db => {
    const marker = await db.syncMetadata.get(ACCOUNT_IMPORT_ID)
    if (!marker && snapshot && !(await Promise.all(tableNames.map(name => db[name].count()))).some(Boolean)) {
      const copy = async <K extends TableName>(name: K) => {
        await db[name].bulkPut(snapshot[name] as Row<K>[])
      }
      for (const name of tableNames) await copy(name)
    }
    if (!await db.categories.count()) {
      await db.categories.bulkPut(categorySeeds)
      if (owner) await db.syncMetadata.put({
        id: DEFAULT_CATEGORIES_ID, cursor: null, lastSyncedAt: null,
        value: categorySeeds.map(({ id, name }) => ({ id, name })), ...persistenceMetadata(),
      })
    }
    if (!marker) await db.syncMetadata.put({
      id: ACCOUNT_IMPORT_ID, cursor: null, lastSyncedAt: null, value: { source: snapshot ? 'indexeddb' : null },
      ...persistenceMetadata(),
    })
  })
}

async function readLegacy(legacy: FocusDayDatabase, owner: string | null) {
  if (!await Dexie.exists(legacy.name)) return null
  await legacy.open()
  try {
    return await legacy.transaction('r', tableNames.map(name => legacy[name]), async () => {
      const binding = await legacy.syncMetadata.get('sync:bound-user')
      const value = binding?.value as { userId?: unknown } | null | undefined
      if (binding && typeof value?.userId !== 'string') throw new Error('旧数据库账号归属无法验证')
      if ((value?.userId ?? null) !== owner) return null
      return Object.fromEntries(await Promise.all(tableNames.map(async name => [name, await legacy[name].toArray()])))
    })
  } finally { legacy.close() }
}
