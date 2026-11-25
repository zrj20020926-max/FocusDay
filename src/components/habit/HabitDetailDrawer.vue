<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { X, Pause, Play, Trash2, Check, Pencil } from 'lucide-vue-next'
import type { Habit, HabitRecord, HabitStats } from '../../types/habit'
import { isWeeklyHabit, formatHabitValue } from '../../services/habit/HabitService'

const props = defineProps<{ habit: Habit; records: HabitRecord[]; stats: HabitStats; busy: boolean; today: string }>()
const emit = defineEmits<{ close: []; edit: []; status: []; remove: [] }>()
const dialog = ref<HTMLDialogElement>()
const confirming = ref(false)
const historyLimit = ref(12)
const unit = computed(() => isWeeklyHabit(props.habit) ? '周' : '天')
const orderedRecords = computed(() => [...props.records].sort((left, right) => right.recordDate.localeCompare(left.recordDate)))
onMounted(() => dialog.value?.showModal())
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="habit-drawer" aria-labelledby="habit-detail-title" @cancel.prevent="emit('close')" @click.self="emit('close')">
      <div class="habit-drawer-content">
        <header>
          <div class="habit-avatar" :style="{ background: habit.color + '22', color: habit.color }">{{ habit.icon }}</div>
          <button class="icon-button" aria-label="关闭详情" autofocus @click="emit('close')"><X :size="20"/></button>
        </header>
        <h2 id="habit-detail-title">{{ habit.name }}</h2>
        <p class="habit-description">{{ habit.description }}</p>
        <p class="habit-description">始于 {{ habit.startDate }} · {{ habit.status==='ACTIVE' ? '进行中' : '已暂停' }}</p>
        <div class="habit-detail-stats">
          <div><strong>{{ stats.currentStreak }} {{ unit }}</strong><span>当前连续</span></div>
          <div><strong>{{ stats.longestStreak }} {{ unit }}</strong><span>历史最长</span></div>
          <div><strong>{{ Math.round(stats.weekRate * 100) }}%</strong><span>本周完成率</span></div>
          <div><strong>{{ Math.round(stats.monthRate * 100) }}%</strong><span>本月完成率</span></div>
        </div>
        <footer>
          <button class="secondary-button" :disabled="busy" @click="emit('edit')"><Pencil :size="16"/>编辑</button>
          <button class="secondary-button" :disabled="busy" @click="emit('status')"><component :is="habit.status==='ACTIVE'?Pause:Play" :size="16"/>{{ habit.status==='ACTIVE' ? '暂停' : '恢复' }}</button>
          <button class="habit-delete" :class="{ confirming }" :disabled="busy" @click="confirming ? emit('remove') : confirming = true"><Trash2 :size="16"/>{{ confirming ? '确认删除' : '删除习惯' }}</button>
        </footer>
        <section class="habit-history">
          <div class="section-heading"><h3>打卡历史</h3><small>{{ records.length }} 天</small></div>
          <div v-if="!records.length" class="habit-empty compact">还没有记录。</div>
          <div v-for="record in orderedRecords.slice(0, historyLimit)" :key="record.id" class="habit-history-row">
            <span :class="{ done: record.completed }"><Check v-if="record.completed" :size="12"/></span>
            <time :datetime="record.recordDate">{{ record.recordDate }}{{record.recordDate===today ? ' · 今日' : ''}}</time>
            <strong>{{ formatHabitValue(habit, record.actualValue) }}</strong>
          </div>
          <button v-if="orderedRecords.length > historyLimit" class="secondary-button" @click="historyLimit += 12">加载更多</button>
        </section>
      </div>
    </dialog>
  </Teleport>
</template>
