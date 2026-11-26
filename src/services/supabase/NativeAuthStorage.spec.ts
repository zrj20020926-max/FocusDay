import { expect, it } from 'vitest'
import { AUTH_STORAGE_KEY, migrateAuthStorage } from './NativeAuthStorage'

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

it('moves legacy sessions and PKCE verifiers only after the secure write succeeds', async () => {
  const verifier = AUTH_STORAGE_KEY + '-code-verifier'
  const legacy = store({ [AUTH_STORAGE_KEY]: 'legacy-session-fixture', [verifier]: 'verifier-fixture' })
  const secure = store({ [AUTH_STORAGE_KEY]: 'new-session-fixture' })
  await expect(migrateAuthStorage(legacy, { ...secure, setItem() { throw new Error('storage rejected write') } })).rejects.toThrow()
  expect(secure.getItem(AUTH_STORAGE_KEY)).toBe('new-session-fixture')
  expect(legacy.getItem(verifier)).toBe('verifier-fixture')
  await migrateAuthStorage(legacy, secure)
  await migrateAuthStorage(legacy, secure)
  expect(secure.getItem(verifier)).toBe('verifier-fixture')
  expect(legacy.getItem(verifier)).toBeNull()
  expect(legacy.getItem(AUTH_STORAGE_KEY)).toBeNull()
})
