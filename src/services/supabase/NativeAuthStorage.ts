import type { Session } from '@supabase/supabase-js'

export const AUTH_STORAGE_KEY = 'focus-day.auth'

interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

const legacyKeys = [AUTH_STORAGE_KEY, AUTH_STORAGE_KEY + '-code-verifier', AUTH_STORAGE_KEY + '-user']

export async function migrateAuthStorage(legacy: AuthStorage, secure: AuthStorage) {
  for (const key of legacyKeys) {
    const oldValue = await legacy.getItem(key)
    if (oldValue === null) continue
    if (await secure.getItem(key) === null) await secure.setItem(key, oldValue)
    await legacy.removeItem(key)
  }
}

async function openStorage() {
  const { SecureStorage, KeychainAccess } = await import('@aparajita/capacitor-secure-storage')
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly)
  const adapter = {
    getItem: (key: string) => SecureStorage.getItem(key),
    setItem: (key: string, value: string) => SecureStorage.setItem(key, value),
    removeItem: (key: string) => SecureStorage.removeItem(key),
  }
  await migrateAuthStorage(localStorage, adapter)
  return adapter
}

let storage: ReturnType<typeof openStorage> | undefined
export function nativeAuthStorage() {
  storage ??= openStorage().catch(error => { storage = undefined; throw error })
  return storage
}

export async function readStoredNativeSession(): Promise<Session | null> {
  const raw = await (await nativeAuthStorage()).getItem(AUTH_STORAGE_KEY)
  if (!raw) return null
  const value: Session = JSON.parse(raw)
  if (!value?.user?.id || !value.refresh_token || !value.access_token) throw new Error('本地登录信息无法读取')
  return value
}

export function readStoredWebSession(): Session | null {
  try {
    const value: Session | null = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null')
    return value?.user?.id && value.refresh_token && value.access_token ? value : null
  } catch { return null }
}

export async function clearStoredNativeSession(): Promise<void> {
  const storage = await nativeAuthStorage()
  await Promise.all(legacyKeys.map(key => storage.removeItem(key)))
}
