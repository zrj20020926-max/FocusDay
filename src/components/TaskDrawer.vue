<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X, CalendarDays, Flag, Tags, Clock3, AlignLeft, Check, Play, Pencil, Trash2, Save } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'
import { formatTaskDate, useTaskStore } from '../stores/taskStore'
import { localDateKey, type TaskPriority, type TaskStatus } from '../types/task'
import { useFocusSessionStore } from '../stores/focusSessionStore'
import { formatTimerDuration } from '../services/timer/TimerCalculator'
import { useTaskFocus } from '../composables/useTaskFocus'

const store = useAppStore()
const taskStore = useTaskStore()
const focusStore = useFocusSessionStore()
const { startTaskFocus } = useTaskFocus()
const task = computed(() => taskStore.getTaskById(store.selectedTaskId))
const category = computed(() => task.value ? taskStore.getCategoryById(task.value.categoryId) : undefined)
const focusSummary = computed(() => task.value ? focusStore.taskSummary(task.value.id) : { duration: 0, focusCount: 0, completedPomodoros: 0 })
const focusHistory = computed(() => task.value ? focusStore.taskSessions(task.value.id).slice(0, 5) : [])
const editing = ref(false)
const confirmingDelete = ref(false)
const draftTitle = ref('')
const draftDescription = ref('')
const draftCategoryId = ref('other')
const draftPriority = ref<TaskPriority>('MEDIUM')
const draftStatus = ref<TaskStatus>('TODO')
const draftPlannedDate = ref('')
const draftDueDate = ref('')
const draftDuration = ref(25)
const draftPomodoros = ref(1)

function resetDraft() {
  if (!task.value) return
  draftTitle.value = task.value.title
  draftDescription.value = task.value.description
  draftCategoryId.value = task.value.categoryId
  draftPriority.value = task.value.priority
  draftStatus.value = task.value.status
  draftPlannedDate.value = task.value.plannedDate ?? ''
  draftDueDate.value = task.value.dueDate ?? ''
  draftDuration.value = task.value.estimatedDuration
  draftPomodoros.value = task.value.estimatedPomodoros
  editing.value = false
  confirmingDelete.value = false
}

watch([() => store.selectedTaskId, () => store.taskDrawerOpen], resetDraft, { immediate: true })

async function save() {
  if (!task.value) return
  const saved = await taskStore.updateTask(task.value.id, {
    title: draftTitle.value,
    description: draftDescription.value,
    categoryId: draftCategoryId.value,
    priority: draftPriority.value,
    status: draftStatus.value,
    plannedDate: draftPlannedDate.value || null,
    dueDate: draftDueDate.value || null,
    estimatedDuration: Number(draftDuration.value),
    estimatedPomodoros: Number(draftPomodoros.value),
  })
  if (saved) editing.value = false
}

async function remove() {
  if (!task.value) return
  if (!confirmingDelete.value) { confirmingDelete.value = true; return }
  await taskStore.deleteTask(task.value.id)
}

function tomorrow(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return localDateKey(date)
}
</script>

<template>
  <Teleport to="body"><transition name="drawer"><div v-if="store.taskDrawerOpen" class="drawer-layer" @mousedown.self="store.closeTask()">
    <aside class="task-drawer" v-if="task" role="dialog" aria-modal="true" aria-label="任务详情">
      <header>
        <span class="drawer-status"><i />{{ task.status === 'COMPLETED' ? '已完成' : task.status === 'IN_PROGRESS' ? '进行中' : '待办' }}</span>
        <div class="drawer-header-actions"><button class="icon-button" title="编辑任务" @click="editing = !editing; confirmingDelete = false"><Pencil :size="18" /></button><button class="icon-button" title="关闭" @click="store.closeTask()"><X :size="20" /></button></div>
      </header>
      <div class="drawer-body">
        <button class="drawer-check" :class="{ checked: task.status === 'COMPLETED' }" :aria-label="task.status === 'COMPLETED' ? '恢复任务' : '完成任务'" @click="taskStore.toggleTask(task.id)"><Check :size="18" /></button>
        <template v-if="editing">
          <input v-model="draftTitle" class="drawer-title-input" aria-label="任务名称" @keyup.enter="save" />
          <div class="drawer-edit-grid full-form">
            <label>分类<select v-model="draftCategoryId"><option v-for="item in taskStore.categories" :key="item.id" :value="item.id">{{item.name}}</option></select></label>
            <label>状态<select v-model="draftStatus"><option value="TODO">待办</option><option value="IN_PROGRESS">进行中</option><option value="COMPLETED">已完成</option></select></label>
            <label>优先级<select v-model="draftPriority"><option value="LOW">低</option><option value="MEDIUM">中</option><option value="HIGH">高</option></select></label>
            <label>计划日期<input v-model="draftPlannedDate" type="date" /></label>
            <label>截止日期<input v-model="draftDueDate" type="date" /></label>
            <label>预计用时<span><input v-model.number="draftDuration" type="number" min="0" />分钟</span></label>
            <label>预计番茄数<input v-model.number="draftPomodoros" type="number" min="0" /></label>
          </div>
          <label class="drawer-description-field">任务描述<textarea v-model="draftDescription" rows="4" placeholder="补充任务背景、目标或备注" /></label>
        </template>
        <template v-else><h2>{{ task.title }}</h2><p class="drawer-project">{{ category?.name ?? '其他' }} · {{ task.status === 'IN_PROGRESS' ? '正在推进' : 'Focus Day' }}</p></template>
        <div v-if="!editing" class="detail-grid">
          <div><span><CalendarDays :size="16" />计划日期</span><strong>{{ formatTaskDate(task.plannedDate) }}</strong></div>
          <div><span><CalendarDays :size="16" />截止日期</span><strong>{{ formatTaskDate(task.dueDate) }}</strong></div>
          <div><span><Flag :size="16" />优先级</span><strong class="priority">{{ task.priority === 'HIGH' ? '高优先级' : task.priority === 'MEDIUM' ? '中优先级' : '低优先级' }}</strong></div>
          <div><span><Tags :size="16" />分类</span><strong><i :style="{ background: category?.color }" />{{ category?.name ?? '其他' }}</strong></div>
          <div><span><Clock3 :size="16" />预计用时</span><strong>{{ task.estimatedDuration }} 分钟</strong></div>
          <div><span><Clock3 :size="16" />番茄钟</span><strong>{{ task.estimatedPomodoros }} 个</strong></div>
          <div><span><Clock3 :size="16" />实际专注</span><strong>{{ formatTimerDuration(focusSummary.duration) }}</strong></div>
          <div><span><Clock3 :size="16" />完成番茄</span><strong>{{ focusSummary.completedPomodoros }} 个</strong></div>
          <div><span><Clock3 :size="16" />专注次数</span><strong>{{ focusSummary.focusCount }} 次</strong></div>
        </div>
        <div v-if="!editing" class="notes"><span><AlignLeft :size="16" />备注</span><p>{{ task.description || '还没有添加任务描述。' }}</p></div>
        <div v-if="!editing" class="focus-history"><div class="section-heading"><h3>历史专注记录</h3><span>{{focusSummary.focusCount}} 次</span></div><div v-if="focusHistory.length"><div v-for="session in focusHistory" :key="session.id"><span>{{new Date(session.endTime).toLocaleDateString('zh-CN')}} · {{session.mode==='POMODORO'?'番茄钟':session.mode==='STOPWATCH'?'正计时':'倒计时'}}{{session.status==='CANCELLED'?' · 已取消':''}}</span><strong>{{formatTimerDuration(session.duration)}}</strong></div></div><p v-else>还没有专注记录，从一次安静的专注开始吧。</p></div>
      </div>
      <footer>
        <button class="delete-button" :class="{ confirming: confirmingDelete }" @click="remove"><Trash2 :size="16" />{{ confirmingDelete ? '再次点击确认删除' : '删除' }}</button>
        <span class="drawer-footer-spacer" />
        <button v-if="editing" class="primary-button" @click="save"><Save :size="17" />保存修改</button>
        <template v-else><button class="secondary-button" @click="taskStore.updateTask(task.id, { plannedDate: tomorrow(), dueDate: tomorrow() })">移到明天</button><button class="primary-button" @click="startTaskFocus(task.id)"><Play :size="17" fill="currentColor"/>开始专注</button></template>
      </footer>
    </aside>
  </div></transition></Teleport>
</template>
