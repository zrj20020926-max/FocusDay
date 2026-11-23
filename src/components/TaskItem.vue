<script setup lang="ts">
import { MoreHorizontal, Play, GripVertical, Clock3 } from 'lucide-vue-next'
import { useAppStore, type Task } from '../stores/app'
const props = defineProps<{ task: Task; compact?: boolean }>()
const store = useAppStore()
function onDragStart(event: DragEvent) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/task-id', String(props.task.id))
}
function onDrop(event: DragEvent) {
  const draggedId = Number(event.dataTransfer?.getData('text/task-id'))
  if (draggedId) store.reorderTask(draggedId, props.task.id)
}
</script>

<template>
  <div class="task-row" :class="{ completed: task.completed, compact }" draggable="true" @dragstart="onDragStart" @dragover.prevent @drop.prevent="onDrop" @click="store.openTask(task.id)">
    <GripVertical class="drag-handle" :size="16" />
    <button class="task-check" :aria-label="task.completed ? '恢复任务' : '完成任务'" @click.stop="store.toggleTask(task.id)"><span /></button>
    <div class="task-copy"><strong>{{ task.title }}</strong><div class="task-meta"><span><i :style="{ background: task.color }" />{{ task.category }}</span><span><Clock3 :size="13" />{{ task.estimate }} 分钟</span><span>{{ task.due }}</span></div></div>
    <div class="task-actions"><button title="开始专注" @click.stop="$router.push('/focus')"><Play :size="15" fill="currentColor" /></button><button title="更多"><MoreHorizontal :size="18" /></button></div>
  </div>
</template>
