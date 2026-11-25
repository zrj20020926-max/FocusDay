<script setup lang="ts">
import { CheckCheck, Clock3, Flame, MoonStar, Sparkles, Sunrise } from 'lucide-vue-next'
import type { AchievementDefinition } from '../../types/achievement'

defineProps<{ definition: AchievementDefinition; unlocked?: boolean }>()
const icons = { spark: Sparkles, flame: Flame, clock: Clock3, check: CheckCheck, sun: Sunrise, moon: MoonStar }
</script>

<template>
  <span class="achievement-badge" :class="['badge-' + definition.tone, { 'is-unlocked': unlocked }]" aria-hidden="true">
    <component :is="icons[definition.icon]" :size="23" :stroke-width="1.75" />
  </span>
</template>
