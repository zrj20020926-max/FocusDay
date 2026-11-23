import { defineStore } from 'pinia'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export interface Task {
  id: number
  title: string
  category: string
  color: string
  due: string
  estimate: number
  priority: Priority
  status: TaskStatus
  completed: boolean
}

const initialTasks: Task[] = [
  { id: 1, title: '完成 Focus Day 首页视觉稿', category: '工作', color: '#8fa78a', due: '今天 11:30', estimate: 45, priority: 'high', status: 'doing', completed: false },
  { id: 2, title: '整理本周阅读笔记', category: '学习', color: '#9aa8be', due: '今天 14:00', estimate: 30, priority: 'medium', status: 'todo', completed: false },
  { id: 3, title: '预约周末网球场', category: '生活', color: '#d5a98e', due: '今天 18:00', estimate: 10, priority: 'low', status: 'todo', completed: false },
  { id: 4, title: '晨间拉伸 15 分钟', category: '健康', color: '#a7b99b', due: '已完成', estimate: 15, priority: 'medium', status: 'done', completed: true },
  { id: 5, title: '回复项目合作邮件', category: '工作', color: '#8fa78a', due: '明天', estimate: 20, priority: 'high', status: 'todo', completed: false },
  { id: 6, title: '更新个人作品集文案', category: '创作', color: '#b69caf', due: '11月25日', estimate: 60, priority: 'medium', status: 'doing', completed: false },
  { id: 7, title: '复盘十月目标', category: '成长', color: '#d2b276', due: '11月26日', estimate: 40, priority: 'low', status: 'done', completed: true }
]

export const useAppStore = defineStore('app', {
  state: () => ({
    tasks: initialTasks,
    commandOpen: false,
    taskDrawerOpen: false,
    selectedTaskId: null as number | null,
    rightPanelOpen: true,
    focusFullscreen: false,
    toast: ''
  }),
  getters: {
    selectedTask: (state) => state.tasks.find(t => t.id === state.selectedTaskId),
    todayTasks: (state) => state.tasks.slice(0, 4),
    doneCount: (state) => state.tasks.filter(t => t.completed).length
  },
  actions: {
    toggleTask(id: number) {
      const task = this.tasks.find(t => t.id === id)
      if (!task) return
      task.completed = !task.completed
      task.status = task.completed ? 'done' : 'todo'
      this.notify(task.completed ? '任务已完成，做得好' : '任务已恢复')
    },
    addTask(title: string) {
      if (!title.trim()) return
      this.tasks.unshift({ id: Date.now(), title: title.trim(), category: '收集箱', color: '#8c8c80', due: '今天', estimate: 25, priority: 'medium', status: 'todo', completed: false })
      this.notify('已添加到今天')
    },
    openTask(id: number) { this.selectedTaskId = id; this.taskDrawerOpen = true },
    moveTask(id: number, status: TaskStatus) {
      const task = this.tasks.find(t => t.id === id)
      if (task) { task.status = status; task.completed = status === 'done'; this.notify('任务状态已更新') }
    },
    reorderTask(draggedId: number, targetId: number) {
      if (draggedId === targetId) return
      const from = this.tasks.findIndex(t => t.id === draggedId)
      const to = this.tasks.findIndex(t => t.id === targetId)
      if (from < 0 || to < 0) return
      const [task] = this.tasks.splice(from, 1)
      this.tasks.splice(to, 0, task)
      this.notify('任务顺序已更新')
    },
    updateTask(id: number, updates: Partial<Pick<Task, 'title' | 'due' | 'estimate'>>) {
      const task = this.tasks.find(t => t.id === id)
      if (!task) return
      Object.assign(task, updates)
      this.notify('任务详情已保存')
    },
    deleteTask(id: number) {
      const index = this.tasks.findIndex(t => t.id === id)
      if (index < 0) return
      this.tasks.splice(index, 1)
      this.taskDrawerOpen = false
      this.selectedTaskId = null
      this.notify('任务已删除')
    },
    notify(message: string) {
      this.toast = message
      window.setTimeout(() => { if (this.toast === message) this.toast = '' }, 2600)
    }
  }
})
