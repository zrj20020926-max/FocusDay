<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Clock3, ListTodo, Play, X } from 'lucide-vue-next'
import { useFocusSessionStore } from '../stores/focusSessionStore'
import { useTaskStore } from '../stores/taskStore'
import { useTimerStore } from '../stores/timerStore'
import { useAppStore } from '../stores/app'
import { formatTimerDuration } from '../services/timer/TimerCalculator'

const router = useRouter()
const sessions = useFocusSessionStore()
const tasks = useTaskStore()
const timer = useTimerStore()
const app = useAppStore()
const session = computed(() => sessions.completionSession)
const task = computed(() => session.value?.taskId ? tasks.getTaskById(session.value.taskId) : null)
const modeName = computed(() => session.value?.mode === 'POMODORO' ? '番茄钟' : session.value?.mode === 'STOPWATCH' ? '正计时' : '倒计时')

async function continueFocus() {
  if (!session.value) return
  sessions.dismissCompletion()
  if (!['RUNNING', 'PAUSED'].includes(timer.timerState.status)) {
    timer.selectMode(session.value.mode)
    timer.setTask(session.value.taskId)
    timer.start(session.value.taskId)
  }
  await router.push('/focus')
}

async function backToTasks() {
  sessions.dismissCompletion()
  await router.push('/tasks')
}

function openTask() {
  if (!task.value) return
  sessions.dismissCompletion()
  app.openTask(task.value.id)
}
</script>

<template>
  <Teleport to="body"><transition name="modal"><div v-if="session" class="modal-backdrop focus-complete-layer" @mousedown.self="sessions.dismissCompletion()">
    <section class="focus-complete-dialog" role="dialog" aria-modal="true" aria-label="专注完成">
      <button class="icon-button focus-complete-close" title="关闭" @click="sessions.dismissCompletion()"><X :size="19"/></button>
      <span class="focus-complete-mark"><Check :size="27"/></span>
      <span class="eyebrow">SESSION COMPLETE</span>
      <h2>完成了一段专注</h2>
      <p>{{task?.title ?? (session.taskId ? '已删除的任务' : '自由专注')}}</p>
      <div class="focus-complete-metrics"><div><Clock3 :size="17"/><span>本次时长<strong>{{formatTimerDuration(session.duration)}}</strong></span></div><div><span class="focus-mode-dot"/><span>计时模式<strong>{{modeName}}</strong></span></div></div>
      <button v-if="task" class="focus-detail-link" @click="openTask">查看关联任务与历史记录</button>
      <div class="focus-complete-actions"><button class="secondary-button" @click="backToTasks"><ListTodo :size="16"/>返回任务列表</button><button class="primary-button" @click="continueFocus"><Play :size="16" fill="currentColor"/>继续下一轮</button></div>
      <button class="start-other" @click="backToTasks">开始其他任务</button>
    </section>
  </div></transition></Teleport>
</template>
