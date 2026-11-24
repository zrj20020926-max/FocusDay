import type { SupabaseClient, User } from '@supabase/supabase-js'
import { CloudRepositoryError } from '../CloudRepositoryError'

// Repository mapping functions retain strict row types. The SDK client remains generic here so
// repositories can also accept generated Supabase Database types without type-invariance issues.
export type CloudClient = SupabaseClient<any>

export async function requireUser(client: CloudClient): Promise<User> {
  const { data, error } = await client.auth.getUser()
  if (error) throw new CloudRepositoryError(error.message, 'get-user', error)
  if (!data.user) throw new CloudRepositoryError('未登录用户不能访问云端数据', 'authorize')
  return data.user
}

export function cloudError(operation: string, error: { message: string } | null): never {
  throw new CloudRepositoryError(error?.message || '云端数据库操作失败', operation, error)
}
