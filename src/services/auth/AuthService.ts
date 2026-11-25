import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { authRedirectUrl } from '../platform/nativeAuth'

export interface AuthSubscription { unsubscribe(): void }

export interface AuthClient {
  signUp(input: { email: string; password: string; options?: { data?: Record<string, unknown>; emailRedirectTo?: string } }): Promise<{ data: { user: User | null; session: Session | null }; error: Error | null }>
  signInWithPassword(input: { email: string; password: string }): Promise<{ data: { user: User; session: Session }; error: Error | null }>
  signOut(): Promise<{ error: Error | null }>
  getSession(): Promise<{ data: { session: Session | null }; error: Error | null }>
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<{ error: Error | null }>
  updateUser(attributes: { password: string }): Promise<{ data: { user: User }; error: Error | null }>
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): { data: { subscription: AuthSubscription } }
}

export class AuthService {
  constructor(private readonly auth: AuthClient) {}

  async signUp(email: string, password: string, displayName = '') {
    this.validateCredentials(email, password)
    const { data, error } = await this.auth.signUp({
      email: email.trim(), password,
      options: { data: { display_name: displayName.trim() || undefined }, emailRedirectTo: authRedirectUrl('/account') },
    })
    if (error) throw error
    return data
  }

  async signIn(email: string, password: string) {
    this.validateCredentials(email, password)
    const { data, error } = await this.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
    return data
  }

  async signOut(): Promise<void> {
    const { error } = await this.auth.signOut()
    if (error) throw error
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.auth.getSession()
    if (error) throw error
    return data.session
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('请输入有效的邮箱地址')
    const { error } = await this.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl('/account?mode=update-password') })
    if (error) throw error
  }

  async updatePassword(password: string): Promise<User> {
    if (password.length < 8) throw new Error('密码至少需要 8 个字符')
    const { data, error } = await this.auth.updateUser({ password })
    if (error) throw error
    return data.user
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): AuthSubscription {
    return this.auth.onAuthStateChange(callback).data.subscription
  }

  private validateCredentials(email: string, password: string): void {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('请输入有效的邮箱地址')
    if (password.length < 8) throw new Error('密码至少需要 8 个字符')
  }

}
