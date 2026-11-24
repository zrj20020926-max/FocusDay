import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../supabase/client'
import { toUserMessage } from '../errors/userMessage'

export class AccountService {
  constructor(private readonly clientFactory: () => Promise<SupabaseClient<any>> = getSupabaseClient as () => Promise<SupabaseClient<any>>) {}

  async deleteCurrentAccount(): Promise<void> {
    const client = await this.clientFactory()
    const { data, error: userError } = await client.auth.getUser()
    if (userError || !data.user) throw new Error('登录状态已过期，请重新登录后再试')
    const { error } = await client.rpc('delete_current_user')
    if (error) throw new Error(toUserMessage(error, '账号删除失败，请稍后重试'))
  }
}

export const accountService = new AccountService()
