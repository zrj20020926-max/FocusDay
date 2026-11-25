<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, List, Columns3, Search, SlidersHorizontal, Play, CalendarDays, GripVertical } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { formatTaskDate, useTaskStore } from '../stores/taskStore'
import type { TaskPriority, TaskStatus } from '../types/task'
import { useTaskFocus } from '../composables/useTaskFocus'
const store = useAppStore()
const taskStore = useTaskStore()
const { startTaskFocus } = useTaskFocus()
const view = ref<'list'|'board'>('list')
const search = ref('')
const dragging = ref<string|null>(null)
const filtersOpen = ref(false)
const statusFilter = ref<TaskStatus|''>('')
const priorityFilter = ref<TaskPriority|''>('')
const categoryFilter = ref('')
const filtered = computed(() => taskStore.filterTasks({ search: search.value, status: statusFilter.value || undefined, priority: priorityFilter.value || undefined, categoryId: categoryFilter.value || undefined }))
const columns: { key: TaskStatus; label: string; color: string }[] = [{key:'TODO',label:'待办',color:'#c2a473'},{key:'IN_PROGRESS',label:'进行中',color:'#92aa8b'},{key:'COMPLETED',label:'已完成',color:'#9ba4b3'}]
const boardTasks = computed(() => {
  const groups: Record<TaskStatus, typeof filtered.value> = { TODO: [], IN_PROGRESS: [], COMPLETED: [] }
  for (const task of filtered.value) groups[task.status].push(task)
  return groups
})
function drop(status: TaskStatus) { if (dragging.value) void taskStore.moveTask(dragging.value, status); dragging.value = null }
function reorder(targetId: string) { if (dragging.value) void taskStore.reorderTask(dragging.value, targetId); dragging.value = null }
function clearFilters() { statusFilter.value = ''; priorityFilter.value = ''; categoryFilter.value = '' }
</script>

<template>
  <div class="page tasks-page">
    <header class="page-header tasks-header"><div><span class="eyebrow">TASKS</span><h1>所有任务</h1><p>在这里安放每一件想完成的事。</p></div><button class="primary-button" @click="store.commandOpen=true"><Plus :size="18"/>新建任务</button></header>
    <div class="task-toolbar"><div class="search-box"><Search :size="17"/><input v-model="search" placeholder="搜索任务"/></div><button class="filter-button" :class="{ active: filtersOpen }" @click="filtersOpen=!filtersOpen"><SlidersHorizontal :size="16"/>筛选</button><div class="view-toggle"><button :class="{active:view==='list'}" @click="view='list'"><List :size="17"/>列表</button><button :class="{active:view==='board'}" @click="view='board'"><Columns3 :size="17"/>看板</button></div></div>
    <div v-if="filtersOpen" class="task-filters">
      <select v-model="statusFilter" aria-label="按状态筛选"><option value="">全部状态</option><option value="TODO">待办</option><option value="IN_PROGRESS">进行中</option><option value="COMPLETED">已完成</option></select>
      <select v-model="priorityFilter" aria-label="按优先级筛选"><option value="">全部优先级</option><option value="HIGH">高优先级</option><option value="MEDIUM">中优先级</option><option value="LOW">低优先级</option></select>
      <select v-model="categoryFilter" aria-label="按分类筛选"><option value="">全部分类</option><option v-for="category in taskStore.categories" :key="category.id" :value="category.id">{{category.name}}</option></select>
      <button @click="clearFilters">清除筛选</button>
    </div>
    <transition name="view" mode="out-in">
      <section v-if="view==='list'" key="list" class="all-task-list">
        <div class="list-labels"><span>任务</span><span>优先级</span><span>分类</span><span>截止日期</span><span /></div>
        <div v-for="task in filtered" :key="task.id" class="data-task" :class="{ completed: task.status === 'COMPLETED' }" draggable="true" @dragstart="dragging=task.id" @dragover.prevent @drop.prevent="reorder(task.id)" @click="store.openTask(task.id)">
          <div class="data-title"><button class="task-check" :aria-label="task.status === 'COMPLETED' ? '恢复任务' : '完成任务'" @click.stop="taskStore.toggleTask(task.id)"><span/></button><strong :class="{done:task.status === 'COMPLETED'}">{{task.title}}</strong></div>
          <span class="priority-badge" :class="task.priority.toLowerCase()">{{task.priority==='HIGH'?'高':task.priority==='MEDIUM'?'中':'低'}}</span>
          <span class="category-pill"><i :style="{background:taskStore.getCategoryById(task.categoryId)?.color}"/>{{taskStore.getCategoryById(task.categoryId)?.name ?? '其他'}}</span><span class="due-date"><CalendarDays :size="14"/>{{formatTaskDate(task.dueDate)}}</span><button class="more" title="开始专注" @click.stop="startTaskFocus(task.id)"><Play :size="17" fill="currentColor"/></button>
        </div>
        <div v-if="!filtered.length" class="task-empty"><span>没有找到相关任务</span><p>换一个关键词，或创建一项新任务。</p><button @click="store.commandOpen=true"><Plus :size="16" />新建任务</button></div>
      </section>
      <section v-else key="board" class="kanban">
        <div v-for="column in columns" :key="column.key" class="kanban-column" @dragover.prevent @drop="drop(column.key)">
          <header><div><i :style="{background:column.color}"/><strong>{{column.label}}</strong><span>{{boardTasks[column.key].length}}</span></div><button><Plus :size="16"/></button></header>
          <div v-for="task in boardTasks[column.key]" :key="task.id" class="kanban-card" draggable="true" @dragstart="dragging=task.id" @click="store.openTask(task.id)">
            <GripVertical :size="15" class="kanban-grip"/><span class="category-pill"><i :style="{background:taskStore.getCategoryById(task.categoryId)?.color}"/>{{taskStore.getCategoryById(task.categoryId)?.name ?? '其他'}}</span><strong>{{task.title}}</strong><div><span><CalendarDays :size="14"/>{{formatTaskDate(task.dueDate)}}</span><span>{{task.estimatedDuration}} 分钟</span></div>
          </div><div v-if="!boardTasks[column.key].length" class="column-empty">暂无任务</div><button class="add-card" @click="store.commandOpen=true"><Plus :size="15"/>添加任务</button>
        </div>
      </section>
    </transition>
  </div>
</template>
