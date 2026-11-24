import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../types/cloud'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const isSupabaseConfigured = Boolean(url && publishableKey)

let client: SupabaseClient<Database> | null = null

export async function getSupabaseClient(): Promise<SupabaseClient<Database>> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase 尚未配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY')
  }
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient<Database>(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'focus-day.auth',
      },
    })
  }
  return client
}
