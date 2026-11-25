<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bell } from 'lucide-vue-next'
import { reminderRepository } from '../../services/notification/notificationRuntime'
import { isHabitReminder, isTaskReminder } from '../../services/notification/ReminderScheduler'
import { localDateKey } from '../../types/task'
import type { ReminderRule, ReminderTarget } from '../../types/notification'

const props = defineProps<{ target: ReminderTarget; targetId: string; dueDate?: string | null }>()
const mode = ref<ReminderRule['kind'] | 'NONE'>('NONE')
const at = ref('')
const minutes = ref<number | string>(60)
const time = ref('09:00')
const editing = ref(false)
const loaded = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref(false)
const saved = ref<ReminderRule | null>(null)

function dateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${localDateKey(date)}T${hour}:${minute}`
}

function resetDraft(rule: ReminderRule | null) {
  mode.value = rule?.kind ?? 'NONE'
  at.value = rule?.kind === 'AT' ? dateTimeLocal(rule.at) : ''
  minutes.value = rule?.kind === 'BEFORE_DUE' ? rule.minutes : 60
  time.value = rule?.kind === 'DAILY' ? rule.time : '09:00'
}

watch(() => [props.target, props.targetId] as const, ([target, id], _, onCleanup) => {
  editing.value = false
  loaded.value = false
  message.value = ''
  const subscription = reminderRepository.observeRule(target, id).subscribe({
    next: rule => {
      saved.value = rule
      if (!editing.value) resetDraft(rule)
      loaded.value = true
    },
    error: () => { error.value = true; message.value = '无法读取提醒。' },
  })
  onCleanup(() => subscription.unsubscribe())
}, { immediate: true })

const description = computed(() => {
  const rule = saved.value
  if (rule?.kind === 'AT') return new Date(rule.at).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  if (rule?.kind === 'DAILY') return `计划日 ${rule.time}（设备本地时间）`
  if (rule?.kind === 'BEFORE_DUE') {
    if (!props.dueDate) return '设置任务截止日期后生效'
    return rule.minutes ? `截止前 ${rule.minutes} 分钟` : '截止日结束时'
  }
  return '未设置'
})

async function save() {
  if (busy.value || !loaded.value) return
  let rule: ReminderRule | null = null
  if (mode.value === 'AT') rule = { kind: 'AT', at: new Date(at.value).getTime() }
  else if (mode.value === 'DAILY') rule = { kind: 'DAILY', time: time.value }
  else if (mode.value === 'BEFORE_DUE') rule = { kind: 'BEFORE_DUE', minutes: minutes.value === '' ? NaN : Number(minutes.value) }

  const valid = props.target === 'habit' ? isHabitReminder(rule) : isTaskReminder(rule)
  if (rule && (!valid || (rule.kind === 'BEFORE_DUE' && !props.dueDate))) {
    error.value = true
    message.value = '请选择有效的提醒时间。'
    return
  }
  busy.value = true
  const { target, targetId } = props
  try {
    await reminderRepository.saveRule(target, targetId, rule)
    if (props.targetId !== targetId) return
    saved.value = rule
    error.value = false
    message.value = rule ? '提醒已保存。' : '提醒已取消。'
    editing.value = false
  } catch {
    error.value = true
    message.value = '提醒未保存，请重试。'
  } finally { busy.value = false }
}
</script>

<template>
  <section class="reminder-editor" :aria-label="target==='task' ? '任务提醒' : '习惯提醒'">
    <header>
      <div><Bell :size="16" /><strong>提醒</strong></div>
      <button v-if="!editing" type="button" class="secondary-button" :disabled="!loaded"
        @click="editing=true; resetDraft(saved); message=''">{{ saved ? '编辑提醒' : '设置提醒' }}</button>
    </header>
    <p v-if="!editing && loaded">{{ description }}</p>
    <form v-if="editing" @submit.prevent="save">
      <label>提醒方式
        <select v-model="mode">
          <option value="NONE">不提醒</option>
          <template v-if="target==='task'">
            <option value="AT">指定日期和时间</option>
            <option value="BEFORE_DUE" :disabled="!dueDate">截止前提醒</option>
          </template>
          <option v-else value="DAILY">每日固定时间</option>
        </select>
      </label>
      <label v-if="mode==='AT'">提醒时间<input v-model="at" type="datetime-local" required /></label>
      <label v-else-if="mode==='DAILY'">本地提醒时间<input v-model="time" type="time" required /></label>
      <label v-else-if="mode==='BEFORE_DUE'">提前分钟数
        <input v-model.number="minutes" type="number" min="0" max="10080" required />
        <small>按截止日结束时间计算，0 表示当天结束时。{{ dueDate ? '' : '请先给任务设置截止日期。' }}</small>
      </label>
      <div class="reminder-actions">
        <button type="button" class="secondary-button" :disabled="busy" @click="editing=false; message=''">返回</button>
        <button type="submit" class="primary-button" :disabled="busy">保存提醒</button>
      </div>
    </form>
    <p v-if="message" :class="{ 'reminder-error': error }" role="status">{{ message }}</p>
  </section>
</template>
