import { defineStore } from 'pinia'
import { IndexedDbTaskRepository } from '../services/database/repositories/TaskRepository'
import { CategoryService } from '../services/task/CategoryService'
import { TaskService } from '../services/task/TaskService'
import { TaskDomainError, localDateKey, type CreateCategoryInput, type CreateTaskInput, type Task, type TaskCategory, type TaskFilter, type TaskStatus, type UpdateCategoryInput, type UpdateTaskInput } from '../types/task'
import { useAppStore } from './app'

const repository = new IndexedDbTaskRepository()
const taskService = new TaskService(repository)
const categoryService = new CategoryService(repository)

function messageOf(error: unknown): string {
  return error instanceof TaskDomainError ? error.message : '任务操作失败，请稍后重试'
}

export function formatTaskDate(value: string | null): string {
  if (!value) return '未设置'
  const today = localDateKey()
  const tomorrowDate = new Date()
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  if (value === today) return '今天'
  if (value === localDateKey(tomorrowDate)) return '明天'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return `${month}月${day}日`
}

export const useTaskStore = defineStore('tasks', {
  state: () => ({
    tasks: [] as Task[],
    categories: [] as TaskCategory[],
    initialized: false,
    loading: false,
    lastError: '',
  }),
  getters: {
    sortedTasks: state => [...state.tasks].sort((a, b) => a.sortOrder - b.sortOrder),
    todayTasks: state => state.tasks
      .filter(task => task.plannedDate === localDateKey())
      .sort((a, b) => a.sortOrder - b.sortOrder),
    doneCount: state => state.tasks.filter(task => task.status === 'COMPLETED').length,
    getTaskById: state => (id: string | null) => state.tasks.find(task => task.id === id),
    getCategoryById: state => (id: string) => state.categories.find(category => category.id === id),
    filterTasks: state => (filter: TaskFilter) => taskService.filter(state.tasks, filter),
  },
  actions: {
    async initialize() {
      if (this.initialized || this.loading) return
      this.loading = true
      try {
        await this.refresh()
        this.initialized = true
      } catch (error) {
        this.fail(error)
      } finally {
        this.loading = false
      }
    },
    async refresh() {
      const [tasks, categories] = await Promise.all([taskService.getAll(), categoryService.getAll()])
      this.tasks = tasks
      this.categories = categories
    },
    async createTask(input: CreateTaskInput): Promise<Task | null> {
      try {
        const task = await taskService.create(input)
        await this.refresh()
        useAppStore().notify('已添加到任务列表')
        return task
      } catch (error) { this.fail(error); return null }
    },
    async updateTask(id: string, input: UpdateTaskInput): Promise<Task | null> {
      try {
        const task = await taskService.update(id, input)
        await this.refresh()
        useAppStore().notify('任务详情已保存')
        return task
      } catch (error) { this.fail(error); return null }
    },
    async deleteTask(id: string): Promise<boolean> {
      try {
        await taskService.delete(id)
        await this.refresh()
        const app = useAppStore()
        if (app.selectedTaskId === id) app.closeTask()
        app.notify('任务已删除')
        return true
      } catch (error) { this.fail(error); return false }
    },
    async toggleTask(id: string): Promise<Task | null> {
      const current = this.getTaskById(id)
      if (!current) { this.fail(new TaskDomainError('任务不存在', 'TASK_NOT_FOUND')); return null }
      try {
        const task = current.status === 'COMPLETED' ? await taskService.uncomplete(id) : await taskService.complete(id)
        await this.refresh()
        useAppStore().notify(task.status === 'COMPLETED' ? '任务已完成，做得好' : '任务已恢复')
        return task
      } catch (error) { this.fail(error); return null }
    },
    async moveTask(id: string, status: TaskStatus): Promise<Task | null> {
      try {
        const task = await taskService.moveToStatus(id, status)
        await this.refresh()
        useAppStore().notify('任务状态已更新')
        return task
      } catch (error) { this.fail(error); return null }
    },
    async reorderTask(draggedId: string, targetId: string): Promise<boolean> {
      try {
        this.tasks = await taskService.reorder(draggedId, targetId)
        useAppStore().notify('任务顺序已更新')
        return true
      } catch (error) { this.fail(error); return false }
    },
    async createCategory(input: CreateCategoryInput): Promise<TaskCategory | null> {
      try {
        const category = await categoryService.create(input)
        await this.refresh()
        useAppStore().notify('分类已创建')
        return category
      } catch (error) { this.fail(error); return null }
    },
    async updateCategory(id: string, input: UpdateCategoryInput): Promise<TaskCategory | null> {
      try {
        const category = await categoryService.update(id, input)
        await this.refresh()
        useAppStore().notify('分类已更新')
        return category
      } catch (error) { this.fail(error); return null }
    },
    async deleteCategory(id: string): Promise<boolean> {
      try {
        await categoryService.delete(id)
        await this.refresh()
        useAppStore().notify('分类已删除，关联任务已移入“其他”')
        return true
      } catch (error) { this.fail(error); return false }
    },
    fail(error: unknown) {
      this.lastError = messageOf(error)
      useAppStore().notify(this.lastError)
    },
  },
})
