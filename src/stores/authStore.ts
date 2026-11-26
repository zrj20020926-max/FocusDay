import { defineStore } from 'pinia'
import type { Session, User } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { AuthService, type AuthSubscription } from '../services/auth/AuthService'
import { getSupabaseClient, isSupabaseConfigured, shouldRestoreAuth } from '../services/supabase/client'
import { accountService } from '../services/account/AccountService'
import { toUserMessage } from '../services/errors/userMessage'
import { databaseService } from '../services/database/DatabaseService'
import { dataManagementService } from '../services/data/DataManagementService'
import { clearStoredNativeSession, readStoredWebSession } from '../services/supabase/NativeAuthStorage'
import { syncScheduler } from '../services/sync/SyncScheduler'
import { syncService } from '../services/sync/SyncService'

let service: AuthService | null = null
let subscription: AuthSubscription | null = null
let initialization: Promise<void> | null = null
let changingSession = false
let reloading = false

async function authService(): Promise<AuthService> {
  const client = await getSupabaseClient()
  service ??= new AuthService(client.auth as unknown as ConstructorParameters<typeof AuthService>[0])
  return service
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : '认证服务暂时不可用'
  if (/invalid login credentials/i.test(message)) return '邮箱或密码不正确'
  if (/email not confirmed/i.test(message)) return '请先完成邮箱验证'
  if (/user already registered/i.test(message)) return '该邮箱已经注册'
  if (/rate limit/i.test(message)) return '请求过于频繁，请稍后再试'
  return toUserMessage(error, '认证服务暂时不可用，请稍后重试')
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    configured: isSupabaseConfigured,
    initialized: false,
    loading: false,
    session: null as Session | null,
    user: null as User | null,
    error: '',
  }),
  getters: {
    isAuthenticated: state => Boolean(state.user && state.session),
    displayName: state => state.user?.user_metadata?.display_name as string | undefined || state.user?.email?.split('@')[0] || '本地用户',
  },
  actions: {
    async exchangeNativeAuthCode(code: string, recoverPassword = false): Promise<boolean> {
      const result = await this.perform(async () => {
        const { data, error } = await (await getSupabaseClient()).auth.exchangeCodeForSession(code)
        if (error || !data.session) throw new Error('认证链接无效或已过期，请在此设备重新申请')
        this.applySession(data.session, recoverPassword ? '/account?mode=update-password' : '/account')
        return true
      })
      return result === true
    },
    async initialize(force = false) {
      if (!this.configured || (this.initialized && !force)) { this.initialized = true; return }
      if (initialization) return initialization
      if (!force && !shouldRestoreAuth()) { this.initialized = true; return }
      initialization = (async () => {
        this.loading = true
        try {
          const auth = await authService()
          this.applySession(await auth.getSession())
          subscription ??= auth.onAuthStateChange((_event, session) => {
            if (!changingSession) this.applySession(session)
          })
        } catch (error) {
          this.error = messageOf(error)
          // A refresh/network failure does not invalidate the secure offline user.
          if (!Capacitor.isNativePlatform() && !readStoredWebSession()) this.applySession(null)
        }
        finally { this.loading = false; this.initialized = true }
      })()
      await initialization
      initialization = null
    },
    async signUp(email: string, password: string, displayName = '') {
      return this.perform(async () => {
        const data = await (await authService()).signUp(email, password, displayName)
        this.applySession(data.session)
        return data
      })
    },
    async signIn(email: string, password: string) {
      return this.perform(async () => {
        const data = await (await authService()).signIn(email, password)
        this.applySession(data.session)
        return data
      })
    },
    async signOut(clearLocal = false) {
      return this.perform(async () => {
        await (await authService()).signOut()
        try { if (clearLocal) await this.clearLocalAfterSignOut() }
        finally { this.applySession(null) }
        return true
      })
    },
    async deleteAccount() {
      return this.perform(async () => {
        await accountService.deleteCurrentAccount()
        if (Capacitor.isNativePlatform()) await clearStoredNativeSession()
        else await (await authService()).signOut()
        try { await this.clearLocalAfterSignOut() }
        finally { this.applySession(null) }
        return true
      })
    },
    async clearLocalAfterSignOut() {
      syncScheduler.stop()
      await syncService.whenIdle()
      await dataManagementService.clearLocalData()
    },
    async requestPasswordReset(email: string) {
      return this.perform(async () => { await (await authService()).requestPasswordReset(email); return true })
    },
    async updatePassword(password: string) {
      return this.perform(async () => { await (await authService()).updatePassword(password); return true })
    },
    applySession(session: Session | null, destination = '/account') {
      const owner = databaseService.owner
      if (owner !== undefined && owner !== (session?.user.id ?? null)) {
        if (!reloading) {
          reloading = true
          syncScheduler.stop()
          document.body.inert = true
          document.body.style.visibility = 'hidden'
          // Recreate all stores under the new account without exposing cached data.
          const recovery = new URLSearchParams(window.location.search).get('mode') === 'update-password'
          void databaseService.closeForReload().catch(() => undefined).then(() => {
            window.location.replace(recovery ? '/account?mode=update-password' : destination)
          })
        }
        return
      }
      this.session = session
      this.user = session?.user ?? null
    },
    async perform<T>(operation: () => Promise<T>): Promise<T | null> {
      if (!this.configured) { this.error = 'Supabase 尚未配置，本地功能仍可正常使用'; return null }
      if (this.loading || reloading) return null
      changingSession = true
      this.loading = true
      this.error = ''
      try {
        const auth = await authService()
        subscription ??= auth.onAuthStateChange((_event, session) => {
          if (!changingSession) this.applySession(session)
        })
        return await operation()
      }
      catch (error) { this.error = messageOf(error); return null }
      finally { changingSession = false; this.loading = false }
    },
  },
})
