import type { TaskRepository } from '../../repositories/task/TaskRepository'
import { TaskDomainError, type CreateCategoryInput, type TaskCategory, type UpdateCategoryInput } from '../../types/task'

function createId(): string {
  return `category-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

function validate(input: CreateCategoryInput): CreateCategoryInput {
  const name = input.name.trim()
  const icon = input.icon.trim()
  if (!name) throw new TaskDomainError('分类名称不能为空', 'VALIDATION_ERROR')
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) throw new TaskDomainError('分类颜色格式无效', 'VALIDATION_ERROR')
  if (!icon) throw new TaskDomainError('分类图标不能为空', 'VALIDATION_ERROR')
  return { name, color: input.color, icon }
}

export class CategoryService {
  constructor(private readonly repository: TaskRepository) {}

  async getAll(): Promise<TaskCategory[]> { return this.repository.listCategories() }

  async create(input: CreateCategoryInput): Promise<TaskCategory> {
    const value = validate(input)
    const categories = await this.getAll()
    if (categories.some(category => category.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())) {
      throw new TaskDomainError('已存在同名分类', 'DUPLICATE_SUBMISSION')
    }
    const now = new Date().toISOString()
    return this.repository.saveCategory({ id: createId(), ...value, isDefault: false, createdAt: now, updatedAt: now })
  }

  async update(id: string, input: UpdateCategoryInput): Promise<TaskCategory> {
    const current = await this.repository.findCategoryById(id)
    if (!current) throw new TaskDomainError('分类不存在', 'CATEGORY_NOT_FOUND')
    const value = validate({ name: input.name ?? current.name, color: input.color ?? current.color, icon: input.icon ?? current.icon })
    const duplicate = (await this.getAll()).some(category => category.id !== id && category.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())
    if (duplicate) throw new TaskDomainError('已存在同名分类', 'DUPLICATE_SUBMISSION')
    return this.repository.saveCategory({ ...current, ...value, updatedAt: new Date().toISOString() })
  }

  async delete(id: string): Promise<void> {
    if (id === 'other') throw new TaskDomainError('“其他”是任务的兜底分类，不能删除', 'INVALID_RELATION')
    if (!await this.repository.deleteCategory(id, 'other')) throw new TaskDomainError('要删除的分类不存在', 'CATEGORY_NOT_FOUND')
  }
}
