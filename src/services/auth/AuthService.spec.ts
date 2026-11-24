import { describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { AuthService, type AuthClient } from './AuthService'

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'focus@example.com' } as User
const session = { access_token: 'token', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user } as Session

function fakeAuth() {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null
  const client = {
    signUp: vi.fn().mockResolvedValue({ data: { user, session: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: { user, session }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    onAuthStateChange: vi.fn((callback: typeof listener) => {
      listener = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
  } as unknown as AuthClient
  return { client, emit: (event: AuthChangeEvent, value: Session | null) => listener?.(event, value) }
}

describe('AuthService', () => {
  it('注册用户并传递显示名称', async () => {
    const { client } = fakeAuth()
    const service = new AuthService(client)
    expect((await service.signUp('focus@example.com', 'password123', '林予安')).user).toEqual(user)
    expect(client.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'focus@example.com', options: expect.objectContaining({ data: { display_name: '林予安' } }) }))
  })

  it('登录、恢复会话并退出', async () => {
    const { client } = fakeAuth()
    const service = new AuthService(client)
    expect((await service.signIn('focus@example.com', 'password123')).session).toEqual(session)
    expect(await service.getSession()).toEqual(session)
    await expect(service.signOut()).resolves.toBeUndefined()
    expect(client.signOut).toHaveBeenCalledOnce()
  })

  it('监听会话过期并返回空登录状态', () => {
    const { client, emit } = fakeAuth()
    const service = new AuthService(client)
    const callback = vi.fn()
    service.onAuthStateChange(callback)
    emit('SIGNED_OUT', null)
    expect(callback).toHaveBeenCalledWith('SIGNED_OUT', null)
  })

  it('发送密码重置并支持更新密码', async () => {
    const { client } = fakeAuth()
    const service = new AuthService(client)
    await service.requestPasswordReset('focus@example.com')
    await expect(service.updatePassword('new-password')).resolves.toEqual(user)
    expect(client.resetPasswordForEmail).toHaveBeenCalledOnce()
    expect(client.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
  })

  it('在请求 Supabase 前校验邮箱和密码', async () => {
    const { client } = fakeAuth()
    const service = new AuthService(client)
    await expect(service.signIn('invalid', 'short')).rejects.toThrow('邮箱')
    expect(client.signInWithPassword).not.toHaveBeenCalled()
  })
})
