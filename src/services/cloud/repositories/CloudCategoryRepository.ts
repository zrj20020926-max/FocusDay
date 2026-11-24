import type { CategoryDataRepository } from '../../../repositories/task/TaskRepository'
import type { CategoryRow } from '../../../types/cloud'
import type { TaskCategory } from '../../../types/task'
import { CloudRepositoryError, assertUuid } from '../CloudRepositoryError'
import { cloudError, requireUser, type CloudClient } from './helpers'

function fromRow(row: CategoryRow): TaskCategory {
  return { id: row.id, name: row.name, color: row.color, icon: row.icon, isDefault: row.is_default, createdAt: row.created_at, updatedAt: row.updated_at }
}

function toRow(category: TaskCategory, userId: string): CategoryRow {
  assertUuid(category.id, '分类 ID')
  return { id: category.id, user_id: userId, name: category.name, color: category.color, icon: category.icon,
    is_default: category.isDefault, created_at: category.createdAt, updated_at: category.updatedAt, deleted_at: null, version: 1 }
}

export class CloudCategoryRepository implements CategoryDataRepository {
  constructor(private readonly client: CloudClient) {}

  async listCategories(): Promise<TaskCategory[]> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('categories').select('*').eq('user_id', user.id).is('deleted_at', null).order('created_at')
    if (error) cloudError('list-categories', error)
    return (data ?? []).map(fromRow)
  }

  async findCategoryById(id: string): Promise<TaskCategory | null> {
    assertUuid(id, '分类 ID')
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('categories').select('*').eq('user_id', user.id).eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) cloudError('find-category', error)
    return data ? fromRow(data) : null
  }

  async saveCategory(category: TaskCategory): Promise<TaskCategory> {
    const user = await requireUser(this.client)
    const { data, error } = await this.client.from('categories').upsert(toRow(category, user.id), { onConflict: 'id' }).select('*').single()
    if (error || !data) cloudError('save-category', error)
    return fromRow(data)
  }

  async deleteCategory(categoryId: string, replacementCategoryId: string): Promise<boolean> {
    assertUuid(categoryId, '分类 ID'); assertUuid(replacementCategoryId, '替代分类 ID')
    const user = await requireUser(this.client)
    const { data, error } = await this.client.rpc('soft_delete_category', {
      category_to_delete: categoryId,
      replacement_category: replacementCategoryId,
    } as never)
    if (error) cloudError('delete-category', error)
    if (data !== true) throw new CloudRepositoryError('分类不存在或替代分类无效', 'delete-category')
    return true
  }
}
