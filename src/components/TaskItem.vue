<script setup lang="ts">
import { MoreHorizontal, Play, GripVertical, Clock3 } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { formatTaskDate, useTaskStore } from '../stores/taskStore'
import type { Task } from '../types/task'
import { useTaskFocus } from '../composables/useTaskFocus'
const props = defineProps<{ task: Task; compact?: boolean }>()
const store = useAppStore()
const taskStore = useTaskStore()
const { startTaskFocus } = useTaskFocus()
function onDragStart(event: DragEvent) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/task-id', props.task.id)
}
function onDrop(event: DragEvent) {
  const draggedId = event.dataTransfer?.getData('text/task-id')
  if (draggedId) void taskStore.reorderTask(draggedId, props.task.id)
}
</script>

<template>
  <div class="task-row" :class="{ completed: task.status === 'COMPLETED', compact }" draggable="true" @dragstart="onDragStart" @dragover.prevent @drop.prevent="onDrop" @click="store.openTask(task.id)">
    <GripVertical class="drag-handle" :size="16" />
    <button class="task-check" :aria-label="task.status === 'COMPLETED' ? '恢复任务' : '完成任务'" @click.stop="taskStore.toggleTask(task.id)"><span /></button>
    <div class="task-copy"><strong>{{ task.title }}</strong><div class="task-meta"><span><i :style="{ background: taskStore.getCategoryById(task.categoryId)?.color }" />{{ taskStore.getCategoryById(task.categoryId)?.name ?? '其他' }}</span><span><Clock3 :size="13" />{{ task.estimatedDuration }} 分钟</span><span>{{ formatTaskDate(task.dueDate) }}</span></div></div>
    <div class="task-actions"><button title="开始专注" @click.stop="startTaskFocus(task.id)"><Play :size="15" fill="currentColor" /></button><button title="更多"><MoreHorizontal :size="18" /></button></div>
  </div>
</template>
