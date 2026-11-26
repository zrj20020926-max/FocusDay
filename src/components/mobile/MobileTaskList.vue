<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronRight, GripVertical, Play, RotateCcw, X } from 'lucide-vue-next'
import { Capacitor } from '@capacitor/core'
import { useAppStore } from '../../stores/app'
import { formatTaskDate, useTaskStore } from '../../stores/taskStore'
import { useTaskFocus } from '../../composables/useTaskFocus'
import { isIOSEdgeBackStart } from '../../services/platform/iosEdgeBack'
import type { Task } from '../../types/task'

const props = withDefaults(defineProps<{ tasks: Task[]; reorderable?: boolean }>(), { reorderable: true })
const store = useAppStore()
const tasksStore = useTaskStore()
const { startTaskFocus } = useTaskFocus()
const list = ref<HTMLElement>()
const open = ref<{ id: string; action: 'focus' | 'toggle' } | null>(null)
const swiping = ref<{ id: string; offset: number } | null>(null)
const dragging = ref<string | null>(null)
const destination = ref<string | null>(null)
const feedback = ref('')
const saving = ref(false)
let swipe: { pointer: number; id: string; startX: number; startY: number; started: boolean; cancelled: boolean } | null = null
let actionPress: { pointer: number; x: number; y: number } | null = null
let handle: { pointer: number; id: string; x: number; y: number } | null = null
let hold: ReturnType<typeof setTimeout> | undefined
let scrollFrame = 0
let preventTapUntil = 0

function slide(event: PointerEvent, task: Task) {
  if (event.pointerType === 'mouse' || !event.isPrimary || (event.target as Element).closest('button')) return
  if (Capacitor.getPlatform() === 'ios' && isIOSEdgeBackStart(event.clientX)) return
  swipe = { pointer: event.pointerId, id: task.id, startX: event.clientX, startY: event.clientY, started: false, cancelled: false }
}

function slideMove(event: PointerEvent) {
  if (!swipe || swipe.pointer !== event.pointerId || swipe.cancelled) return
  const x = event.clientX - swipe.startX
  const y = event.clientY - swipe.startY
  if (!swipe.started && Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { swipe.cancelled = true; return }
  if (!swipe.started && (Math.abs(x) < 12 || Math.abs(x) < Math.abs(y) * 1.4)) return
  swipe.started = true
  open.value = null
  swiping.value = { id: swipe.id, offset: Math.max(-92, Math.min(92, x)) }
}

function slideEnd(event: PointerEvent, cancelled = false) {
  if (swipe?.pointer !== event.pointerId) return
  if (swipe.started) {
    if (!cancelled && swiping.value && Math.abs(swiping.value.offset) >= 52) {
      open.value = { id: swipe.id, action: swiping.value.offset > 0 ? 'focus' : 'toggle' }
    }
    preventTapUntil = performance.now() + 350
  }
  swipe = null
  swiping.value = null
}

function offsetFor(id: string) {
  if (swiping.value?.id === id) return swiping.value.offset
  return open.value?.id === id ? (open.value.action === 'focus' ? 82 : -82) : 0
}

function runSwipeAction(id: string) {
  if (open.value?.id !== id) return
  const { action } = open.value
  open.value = null
  if (action === 'focus') void startTaskFocus(id)
  else void tasksStore.toggleTask(id)
}

function beginActionPress(event: PointerEvent) {
  if (event.pointerType !== 'mouse' && event.isPrimary) {
    actionPress = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
  }
}

function endActionPress(event: PointerEvent, id: string) {
  if (actionPress?.pointer !== event.pointerId) return
  const { x, y } = actionPress
  actionPress = null
  // A browser may suppress the click immediately after a horizontal gesture.
  if (Math.hypot(event.clientX - x, event.clientY - y) < 10) runSwipeAction(id)
}

function openTask(id: string) {
  if (performance.now() < preventTapUntil || dragging.value) return
  if (open.value?.id === id) { open.value = null; return }
  open.value = null
  store.openTask(id)
}

function findTarget() {
  if (!handle) return
  const row = document.elementFromPoint(handle.x, handle.y)?.closest<HTMLElement>('[data-mobile-task]')
  destination.value = row && list.value?.contains(row) ? row.dataset.mobileTask ?? null : null
}

function whileDragging() {
  if (!handle || !dragging.value) return
  const top = 50
  const bottom = (window.visualViewport?.height ?? innerHeight) - 120
  if (handle.y < top || handle.y > bottom) window.scrollBy(0, handle.y < top ? -10 : 10)
  findTarget()
  scrollFrame = requestAnimationFrame(whileDragging)
}

function armDrag(event: PointerEvent, id: string) {
  if (!props.reorderable || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || saving.value) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  handle = { pointer: event.pointerId, id, x: event.clientX, y: event.clientY }
  hold = setTimeout(() => {
    if (!handle) return
    open.value = null
    dragging.value = id
    feedback.value = '正在拖动任务，松开后放置。'
    whileDragging()
  }, 320)
}

function dragMove(event: PointerEvent) {
  if (handle?.pointer !== event.pointerId) return
  if (!dragging.value && Math.hypot(handle.x - event.clientX, handle.y - event.clientY) > 12) {
    clearTimeout(hold)
    return
  }
  if (dragging.value) { handle.x = event.clientX; handle.y = event.clientY; findTarget() }
}

async function dragEnd(event: PointerEvent, cancelled = false) {
  if (handle?.pointer !== event.pointerId) return
  clearTimeout(hold)
  cancelAnimationFrame(scrollFrame)
  const from = dragging.value
  const to = destination.value
  handle = null
  dragging.value = destination.value = null
  if (!from) return
  preventTapUntil = performance.now() + 320
  feedback.value = ''
  if (cancelled || !to || to === from) return
  await reorder(from, to)
}

async function reorder(from: string, to: string) {
  if (saving.value) return
  saving.value = true
  try { feedback.value = await tasksStore.reorderTask(from, to) ? '任务顺序已更新。' : '无法更新任务顺序。' }
  finally { saving.value = false }
}

function moveWithKeyboard(id: string, direction: number) {
  const next = props.tasks[props.tasks.findIndex(task => task.id === id) + direction]
  if (next) void reorder(id, next.id)
}

function closeOutside(event: PointerEvent) {
  if (open.value && !list.value?.contains(event.target as Node)) open.value = null
}
onMounted(() => document.addEventListener('pointerdown', closeOutside))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOutside)
  clearTimeout(hold)
  cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <div ref="list" class="mobile-task-list">
    <p class="sr-mobile" aria-live="polite">{{ feedback }}</p>
    <div v-for="task in tasks" :key="task.id" class="mobile-task-slot" :data-mobile-task="task.id"
      :class="{ 'drag-source': dragging === task.id, 'drag-target': destination === task.id && dragging !== task.id }"
      @pointerdown="slide($event, task)" @pointermove="slideMove" @pointerup="slideEnd($event)" @pointercancel="slideEnd($event, true)">
      <button v-if="open?.id === task.id" class="task-swipe-action"
        :class="open.action === 'focus' ? 'swipe-focus' : 'swipe-toggle'"
        :aria-label="open.action === 'focus' ? '开始专注' : task.status === 'COMPLETED' ? '恢复此任务' : '完成此任务'"
        @pointerdown.stop="beginActionPress" @pointerup.stop="endActionPress($event, task.id)"
        @pointercancel.stop="actionPress = null" @click="runSwipeAction(task.id)">
        <component :is="open.action === 'focus' ? Play : task.status === 'COMPLETED' ? RotateCcw : Check" :size="19" />
        {{ open.action === 'focus' ? '专注' : task.status === 'COMPLETED' ? '恢复' : '完成' }}
      </button>
      <div class="mobile-task-card" :class="{ 'done-card': task.status === 'COMPLETED', 'is-sliding': swiping?.id === task.id }"
        :style="{ transform: `translateX(${offsetFor(task.id)}px)` }">
        <button class="mobile-task-check" :class="{ checked: task.status === 'COMPLETED' }"
          :aria-label="task.status === 'COMPLETED' ? '恢复任务' : '完成任务'" @click="open = null; void tasksStore.toggleTask(task.id)">
          <span><Check v-if="task.status === 'COMPLETED'" :size="14" /></span>
        </button>
        <div class="mobile-task-content" role="button" tabindex="0" @click="openTask(task.id)"
          @keydown.enter.prevent="openTask(task.id)" @keydown.space.prevent="openTask(task.id)">
          <strong>{{ task.title }}</strong>
          <small><i :style="{ background: tasksStore.getCategoryById(task.categoryId)?.color }" />
            {{ tasksStore.getCategoryById(task.categoryId)?.name ?? '其他' }}
            <span v-if="task.dueDate"> · {{ formatTaskDate(task.dueDate) }}</span>
            <span v-if="task.priority === 'HIGH'" class="mobile-task-priority">高优先</span>
          </small>
        </div>
        <button v-if="open?.id === task.id" class="mobile-task-icon" aria-label="收起操作" @click="open = null"><X :size="18" /></button>
        <button v-else-if="task.status !== 'COMPLETED'" class="mobile-task-icon mobile-task-play"
          aria-label="快速开始专注" @click="startTaskFocus(task.id)"><Play :size="17" /></button>
        <button v-if="reorderable" class="mobile-task-icon mobile-drag-handle" type="button" aria-label="长按并拖动调整顺序"
          @pointerdown.stop="armDrag($event, task.id)" @pointermove.stop="dragMove" @pointerup.stop="dragEnd($event)"
          @pointercancel.stop="dragEnd($event, true)" @lostpointercapture.self="dragEnd($event, true)" @contextmenu.prevent
          @keydown.up.prevent="moveWithKeyboard(task.id, -1)" @keydown.down.prevent="moveWithKeyboard(task.id, 1)"><GripVertical :size="17" /></button>
        <ChevronRight v-else :size="15" class="list-chevron" />
      </div>
    </div>
  </div>
</template>
