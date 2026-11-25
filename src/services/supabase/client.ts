import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/cloud'
import { Capacitor } from '@capacitor/core'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const isSupabaseConfigured = Boolean(url && publishableKey)
export const AUTH_STORAGE_KEY = 'focus-day.auth'

let client: Promise<SupabaseClient<Database>> | null = null

export function shouldRestoreAuth(): boolean {
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
    client = import('@supabase/supabase-js').then(({ createClient }) => createClient<Database>(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !Capacitor.isNativePlatform(),
        flowType: Capacitor.isNativePlatform() ? 'pkce' : 'implicit',
        storageKey: AUTH_STORAGE_KEY,
      },
    })).catch(error => { client = null; throw error })
  }
  return client
}
