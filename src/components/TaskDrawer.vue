<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, CalendarDays, Flag, Tags, Clock3, AlignLeft, Check, Play, Pencil, Trash2, Save } from 'lucide-vue-next'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const editing = ref(false)
const confirmingDelete = ref(false)
const draftTitle = ref('')
const draftDue = ref('')
const draftEstimate = ref(25)

watch(() => store.selectedTaskId, () => {
  if (!store.selectedTask) return
  draftTitle.value = store.selectedTask.title
  draftDue.value = store.selectedTask.due
  draftEstimate.value = store.selectedTask.estimate
  editing.value = false
  confirmingDelete.value = false
}, { immediate: true })

function save() {
  const task = store.selectedTask
  if (!task || !draftTitle.value.trim()) return
  store.updateTask(task.id, { title: draftTitle.value.trim(), due: draftDue.value.trim() || '今天', estimate: Math.max(1, draftEstimate.value || 1) })
  editing.value = false
}

function remove() {
  const task = store.selectedTask
  if (!task) return
  if (!confirmingDelete.value) { confirmingDelete.value = true; return }
  store.deleteTask(task.id)
}
</script>

<template>
  <Teleport to="body"><transition name="drawer"><div v-if="store.taskDrawerOpen" class="drawer-layer" @mousedown.self="store.taskDrawerOpen = false">
    <aside class="task-drawer" v-if="store.selectedTask" role="dialog" aria-modal="true" aria-label="任务详情">
      <header>
        <span class="drawer-status"><i />{{ store.selectedTask.completed ? '已完成' : '进行中' }}</span>
        <div class="drawer-header-actions"><button class="icon-button" title="编辑任务" @click="editing = !editing; confirmingDelete = false"><Pencil :size="18" /></button><button class="icon-button" title="关闭" @click="store.taskDrawerOpen = false"><X :size="20" /></button></div>
      </header>
      <div class="drawer-body">
        <button class="drawer-check" :class="{ checked: store.selectedTask.completed }" :aria-label="store.selectedTask.completed ? '恢复任务' : '完成任务'" @click="store.toggleTask(store.selectedTask.id)"><Check :size="18" /></button>
        <template v-if="editing">
          <input v-model="draftTitle" class="drawer-title-input" aria-label="任务名称" @keyup.enter="save" />
          <p class="drawer-project">Focus Day · 产品设计</p>
          <div class="drawer-edit-grid"><label>截止日期<input v-model="draftDue" /></label><label>预计用时<span><input v-model.number="draftEstimate" type="number" min="1" />分钟</span></label></div>
        </template>
        <template v-else><h2>{{ store.selectedTask.title }}</h2><p class="drawer-project">Focus Day · 产品设计</p></template>
        <div class="detail-grid">
          <div><span><CalendarDays :size="16" />截止日期</span><strong>{{ store.selectedTask.due }}</strong></div>
          <div><span><Flag :size="16" />优先级</span><strong class="priority">{{ store.selectedTask.priority === 'high' ? '高优先级' : store.selectedTask.priority === 'medium' ? '中优先级' : '低优先级' }}</strong></div>
          <div><span><Tags :size="16" />分类</span><strong><i :style="{ background: store.selectedTask.color }" />{{ store.selectedTask.category }}</strong></div>
          <div><span><Clock3 :size="16" />预计用时</span><strong>{{ store.selectedTask.estimate }} 分钟</strong></div>
        </div>
        <div class="notes"><span><AlignLeft :size="16" />备注</span><p>梳理核心场景与交互路径，完成高保真页面并检查响应式布局。保持克制、清晰，让每一次点击都有恰到好处的反馈。</p></div>
        <div class="subtasks"><div class="section-heading"><h3>子任务</h3><span>2 / 3</span></div><label><input type="checkbox" checked />整理页面信息层级</label><label><input type="checkbox" checked />完成核心组件设计</label><label><input type="checkbox" />移动端适配检查</label></div>
      </div>
      <footer>
        <button class="delete-button" :class="{ confirming: confirmingDelete }" @click="remove"><Trash2 :size="16" />{{ confirmingDelete ? '再次点击确认删除' : '删除' }}</button>
        <span class="drawer-footer-spacer" />
        <button v-if="editing" class="primary-button" @click="save"><Save :size="17" />保存修改</button>
        <template v-else><button class="secondary-button" @click="store.updateTask(store.selectedTask.id, { due: '明天' })">移到明天</button><button class="primary-button" @click="$router.push('/focus'); store.taskDrawerOpen=false"><Play :size="17" fill="currentColor"/>开始专注</button></template>
      </footer>
    </aside>
  </div></transition></Teleport>
</template>
