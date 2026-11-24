import { describe, expect, it, vi } from 'vitest'
import { AccountService } from './AccountService'

describe('AccountService', () => {
  it('仅在当前会话已认证时调用安全删除函数', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }, rpc }
    await new AccountService(async () => client as any).deleteCurrentAccount()
    expect(rpc).toHaveBeenCalledWith('delete_current_user')
  })

  it('登录过期时拒绝账号删除', async () => {
    const rpc = vi.fn()
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) }, rpc }
    await expect(new AccountService(async () => client as any).deleteCurrentAccount()).rejects.toThrow('登录状态已过期')
    expect(rpc).not.toHaveBeenCalled()
  })
})
