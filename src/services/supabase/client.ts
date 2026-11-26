import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/cloud'
import { Capacitor } from '@capacitor/core'
import { AUTH_STORAGE_KEY, nativeAuthStorage } from './NativeAuthStorage'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const isSupabaseConfigured = Boolean(url && publishableKey)
export { AUTH_STORAGE_KEY }

let client: Promise<SupabaseClient<Database>> | null = null

export function shouldRestoreAuth(): boolean {
  if (Capacitor.isNativePlatform()) return true
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  if (search.has('code') || search.has('error_description') || hash.has('access_token') || hash.has('error_description')) return true
  try { return Boolean(localStorage.getItem(AUTH_STORAGE_KEY)) }
  catch { return false }
}

export async function getSupabaseClient(): Promise<SupabaseClient<Database>> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase 尚未配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY')
  }
  if (!client) {
    const native = Capacitor.isNativePlatform()
    client = Promise.all([import('@supabase/supabase-js'), native ? nativeAuthStorage() : undefined])
      .then(([{ createClient }, storage]) => createClient<Database>(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !native,
        flowType: native ? 'pkce' : 'implicit',
        storageKey: AUTH_STORAGE_KEY,
        storage,
      },
    })).catch(error => { client = null; throw error })
  }
  return client
}
