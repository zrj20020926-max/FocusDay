import type { TaskRepository } from './TaskRepository'
import type { Task, TaskCategory } from '../../types/task'
import { localDateKey, TaskDomainError } from '../../types/task'

interface StoredTaskData {
  version: 1
  tasks: Task[]
  categories: TaskCategory[]
}

const STORAGE_KEY = 'focus-day.task-data.v1'

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  return localDateKey(date)
}

function createSeedData(): StoredTaskData {
  const now = new Date().toISOString()
  const today = localDateKey()
  const tomorrow = addDays(today, 1)
  const categories: TaskCategory[] = [
    { id: 'study', name: '学习', color: '#9aa8be', icon: 'BookOpen', isDefault: true, createdAt: now, updatedAt: now },
    { id: 'work', name: '工作', color: '#8fa78a', icon: 'Briefcase', isDefault: true, createdAt: now, updatedAt: now },
    { id: 'life', name: '生活', color: '#d5a98e', icon: 'Home', isDefault: true, createdAt: now, updatedAt: now },
    { id: 'sport', name: '运动', color: '#a7b99b', icon: 'Dumbbell', isDefault: true, createdAt: now, updatedAt: now },
    { id: 'other', name: '其他', color: '#b69caf', icon: 'Shapes', isDefault: true, createdAt: now, updatedAt: now },
  ]
  const source = [
    ['完成 Focus Day 首页视觉稿', '梳理核心场景与交互路径，完成页面检查。', 'work', 'HIGH', 'IN_PROGRESS', today, today, 45],
    ['整理本周阅读笔记', '归纳本周阅读中的关键结论。', 'study', 'MEDIUM', 'TODO', today, today, 30],
    ['预约周末网球场', '', 'life', 'LOW', 'TODO', today, today, 10],
    ['晨间拉伸 15 分钟', '', 'sport', 'MEDIUM', 'COMPLETED', today, today, 15],
    ['回复项目合作邮件', '', 'work', 'HIGH', 'TODO', tomorrow, tomorrow, 20],
    ['更新个人作品集文案', '', 'other', 'MEDIUM', 'IN_PROGRESS', null, tomorrow, 60],
    ['复盘本月目标', '', 'other', 'LOW', 'COMPLETED', null, tomorrow, 40],
  ] as const
  const tasks: Task[] = source.map((item, index) => ({
    id: `seed-${index + 1}`,
    title: item[0],
    description: item[1],
    categoryId: item[2],
    priority: item[3],
    status: item[4],
    plannedDate: item[5],
    dueDate: item[6],
    estimatedDuration: item[7],
    estimatedPomodoros: Math.max(1, Math.ceil(item[7] / 25)),
    sortOrder: index,
    completedAt: item[4] === 'COMPLETED' ? now : null,
    createdAt: now,
    updatedAt: now,
  }))
  return { version: 1, tasks, categories }
}

export class LocalStorageTaskRepository implements TaskRepository {
  private read(): StoredTaskData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        const seed = createSeedData()
        this.write(seed)
        return seed
      }
      const parsed = JSON.parse(raw) as StoredTaskData
      if (parsed.version !== 1 || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.categories)) {
        throw new Error('Unsupported task data')
      }
      return parsed
    } catch (error) {
      if (error instanceof TaskDomainError) throw error
      throw new TaskDomainError('无法读取本地任务数据', 'PERSISTENCE_ERROR')
    }
  }

  private write(data: StoredTaskData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      throw new TaskDomainError('无法保存本地任务数据', 'PERSISTENCE_ERROR')
    }
  }

  async listTasks(): Promise<Task[]> { return structuredClone(this.read().tasks) }
  async findTaskById(id: string): Promise<Task | null> { return structuredClone(this.read().tasks.find(task => task.id === id) ?? null) }
  async saveTask(task: Task): Promise<Task> {
    const data = this.read()
    const index = data.tasks.findIndex(item => item.id === task.id)
    if (index >= 0) data.tasks[index] = structuredClone(task)
    else data.tasks.push(structuredClone(task))
    this.write(data)
    return structuredClone(task)
  }
  async saveTasks(tasks: Task[]): Promise<Task[]> {
    const data = this.read()
    data.tasks = structuredClone(tasks)
    this.write(data)
    return structuredClone(tasks)
  }
  async deleteTask(id: string): Promise<boolean> {
    const data = this.read()
    const next = data.tasks.filter(task => task.id !== id)
    if (next.length === data.tasks.length) return false
    data.tasks = next
    this.write(data)
    return true
  }
  async listCategories(): Promise<TaskCategory[]> { return structuredClone(this.read().categories) }
  async findCategoryById(id: string): Promise<TaskCategory | null> { return structuredClone(this.read().categories.find(category => category.id === id) ?? null) }
  async saveCategory(category: TaskCategory): Promise<TaskCategory> {
    const data = this.read()
    const index = data.categories.findIndex(item => item.id === category.id)
    if (index >= 0) data.categories[index] = structuredClone(category)
    else data.categories.push(structuredClone(category))
    this.write(data)
    return structuredClone(category)
  }
  async deleteCategory(categoryId: string, replacementCategoryId: string): Promise<boolean> {
    const data = this.read()
    if (!data.categories.some(category => category.id === replacementCategoryId)) {
      throw new TaskDomainError('替代分类不存在', 'INVALID_RELATION')
    }
    const next = data.categories.filter(category => category.id !== categoryId)
    if (next.length === data.categories.length) return false
    const now = new Date().toISOString()
    data.categories = next
    data.tasks = data.tasks.map(task => task.categoryId === categoryId
      ? { ...task, categoryId: replacementCategoryId, updatedAt: now }
      : task)
    this.write(data)
    return true
  }
}
