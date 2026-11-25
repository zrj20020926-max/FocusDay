<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { X } from 'lucide-vue-next'
import type { CreateHabitInput, Habit } from '../../types/habit'

const props = defineProps<{ habit: Habit | null; today: string; busy: boolean; error: string }>()
const emit = defineEmits<{ close: []; save: [input: CreateHabitInput] }>()
const dialog = ref<HTMLDialogElement>()
const habit = props.habit
const draft = reactive<CreateHabitInput>({
  name: habit?.name ?? '', description: habit?.description ?? '', icon: habit?.icon ?? '🌿',
  color: habit?.color ?? '#92aa8b', goalType: habit?.goalType ?? 'DAILY_CHECKIN',
  targetValue: habit?.goalType === 'DAILY_DURATION' ? habit.targetValue / 60_000 : 30,
  frequency: habit?.frequency ?? 'DAILY', weekdays: habit ? [...habit.weekdays] : [1, 2, 3, 4, 5],
  weeklyTarget: habit?.weeklyTarget ?? 3, startDate: habit?.startDate ?? props.today,
})

onMounted(() => dialog.value?.showModal())
function submit() {
  emit('save', {
    ...draft, weekdays: [...draft.weekdays],
    targetValue: draft.goalType === 'DAILY_DURATION' ? Math.round(draft.targetValue * 60_000)
      : draft.goalType === 'WEEKLY_COUNT' ? draft.weeklyTarget : 1,
  })
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="habit-form" aria-labelledby="habit-form-title"
      @cancel.prevent="!busy && emit('close')" @click.self="!busy && emit('close')">
      <form @submit.prevent="submit">
        <header>
          <h2 id="habit-form-title">{{ habit ? '编辑习惯' : '新建习惯' }}</h2>
          <button type="button" class="icon-button" aria-label="关闭" :disabled="busy" @click="emit('close')"><X :size="20"/></button>
        </header>
        <label>习惯名称<input v-model="draft.name" required maxlength="120" placeholder="例如：每天阅读" autofocus /></label>
        <label>说明<textarea v-model="draft.description" rows="2" maxlength="1000" /></label>
        <div class="habit-form-row">
          <label>图标<input v-model="draft.icon" required maxlength="8" /></label>
          <label>颜色<input v-model="draft.color" type="color" /></label>
        </div>
        <label>目标类型
          <select v-model="draft.goalType">
            <option value="DAILY_CHECKIN">每日打卡</option>
            <option value="DAILY_DURATION">每日累计时长</option>
            <option value="WEEKLY_COUNT">每周完成次数</option>
          </select>
        </label>
        <label v-if="draft.goalType==='DAILY_DURATION'">每日分钟数<input v-model.number="draft.targetValue" type="number" required min="1" max="1440" /></label>
        <label>频率
          <select v-model="draft.frequency">
            <option value="DAILY">每天</option>
            <option value="WEEKDAYS">每周指定日期</option>
            <option value="WEEKLY_TARGET">自定义每周次数</option>
          </select>
        </label>
        <div v-if="draft.frequency==='WEEKDAYS'" class="weekday-picker" role="group" aria-label="选择星期">
          <button v-for="(day, i) in '日一二三四五六'" :key="i" type="button"
            :class="{ active: draft.weekdays.includes(i) }" :aria-pressed="draft.weekdays.includes(i)" :aria-label="'星期'+day"
            @click="draft.weekdays = draft.weekdays.includes(i) ? draft.weekdays.filter(value => value !== i) : [...draft.weekdays, i]">{{ day }}</button>
        </div>
        <label v-if="draft.goalType==='WEEKLY_COUNT' || draft.frequency==='WEEKLY_TARGET'">每周目标天数
          <input v-model.number="draft.weeklyTarget" type="number" required min="1" :max="draft.frequency==='WEEKDAYS' ? draft.weekdays.length : 7" />
        </label>
        <label>开始日期<input v-model="draft.startDate" type="date" required /></label>
        <p v-if="error" class="habit-error" role="alert">{{ error }}</p>
        <button class="primary-button habit-form-submit" type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存习惯' }}</button>
      </form>
    </dialog>
  </Teleport>
</template>
