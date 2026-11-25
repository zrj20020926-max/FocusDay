<script setup lang="ts">
import { computed, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useAchievementStore } from '../../stores/achievementStore'
import AchievementBadge from './AchievementBadge.vue'

const store = useAchievementStore()
const first = computed(() => store.unlockedNotice[0])
watch(() => store.unlockedNotice.length, (length, _, cleanup) => {
  if (length) {
    const timeout = setTimeout(store.dismiss, 7000)
    cleanup(() => clearTimeout(timeout))
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="achievement-notice">
      <aside v-if="first" class="achievement-notice">
        <AchievementBadge :definition="first.definition" unlocked />
        <div role="status">
          <small>成就已解锁</small>
          <strong>{{ first.definition.title }}<template v-if="store.unlockedNotice.length > 1"> 等 {{ store.unlockedNotice.length }} 项</template></strong>
          <RouterLink to="/achievements" @click="store.dismiss()">查看成就</RouterLink>
        </div>
        <button type="button" class="icon-button" aria-label="关闭成就提示" @click="store.dismiss()"><X :size="17" /></button>
      </aside>
    </Transition>
  </Teleport>
</template>
