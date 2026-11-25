<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { useAppStore } from '../../stores/app'
import { useTaskStore } from '../../stores/taskStore'
import { localDateKey, type TaskPriority } from '../../types/task'

const app = useAppStore()
const tasks = useTaskStore()
const dialog = ref<HTMLDialogElement>()
const name = ref('')
const description = ref('')
const category = ref('')
const priority = ref<TaskPriority>('MEDIUM')
const planned = ref('')
const due = ref('')
const saving = ref(false)
const error = ref('')

watch(() => app.taskCreateOpen, async shown => {
  if (!shown) { dialog.value?.close(); return }
  name.value = description.value = category.value = due.value = ''
  planned.value = localDateKey()
  error.value = ''
  priority.value = 'MEDIUM'
  await nextTick()
  if (app.taskCreateOpen && !dialog.value?.open) dialog.value?.showModal()
})

function close() { if (!saving.value) app.taskCreateOpen = false }

async function save() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const task = await tasks.createTask({
      title: name.value,
      description: description.value,
      categoryId: category.value || undefined,
      priority: priority.value,
      plannedDate: planned.value || null,
      dueDate: due.value || null,
    })
    if (task) app.taskCreateOpen = false
    else error.value = tasks.lastError || '无法保存任务，请重试。'
  } finally { saving.value = false }
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="mobile-create-sheet" aria-labelledby="mobile-create-title"
      @cancel.prevent="close" @click.self="close">
      <form @submit.prevent="save">
        <header><h2 id="mobile-create-title">新建任务</h2><button type="button" aria-label="关闭新建任务" class="icon-button" @click="close"><X :size="21" /></button></header>
        <div class="mobile-create-fields">
          <label>任务名称<input v-model="name" placeholder="要做什么？" required maxlength="120" enterkeyhint="next" /></label>
          <div class="mobile-create-grid">
            <label>分类<select v-model="category"><option value="">默认分类</option><option v-for="item in tasks.categories" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
            <label>优先级<select v-model="priority"><option value="LOW">低</option><option value="MEDIUM">中</option><option value="HIGH">高</option></select></label>
            <label>计划日期<input v-model="planned" type="date" /></label>
            <label>截止日期<input v-model="due" type="date" /></label>
          </div>
          <label>备注<textarea v-model="description" rows="3" placeholder="可选" /></label>
          <p v-if="error" role="alert" class="reminder-error">{{ error }}</p>
        </div>
        <footer><button class="primary-button" :disabled="saving"><Plus :size="18" />{{ saving ? '正在保存…' : '创建任务' }}</button></footer>
      </form>
    </dialog>
  </Teleport>
</template>
