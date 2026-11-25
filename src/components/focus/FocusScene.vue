<script setup lang="ts">
import { computed } from 'vue'
import { FOCUS_SCENES, type FocusSceneId } from '../../types/ambient'

const props = defineProps<{ sceneId: FocusSceneId; immersive?: boolean }>()
const scene = computed(() => FOCUS_SCENES[props.sceneId])
const rainStyle = (index: number) => ({ left: `${index * 5.4}%`, animationDelay: `${index * -.17}s` })
const leafStyle = (index: number) => ({ left: `${index * 8}%`, top: `${8 + index * 5}%`, animationDuration: `${5 + index * .22}s`, '--rotation': `${index * 19}deg` })
</script>

<template>
  <div class="focus-scene" :class="[`scene-${sceneId.toLowerCase()}`, { immersive }]" aria-hidden="true">
    <transition name="scene-fade" mode="out-in">
      <div :key="sceneId" class="scene-layer">
        <div class="scene-glow"/><div class="scene-horizon"/><div class="scene-texture"/>
        <div v-if="sceneId === 'RAIN_STUDY'" class="scene-rain"><i v-for="index in 18" :key="index" :style="rainStyle(index)"/></div>
        <div v-else-if="sceneId === 'FOREST_MORNING'" class="scene-leaves"><i v-for="index in 12" :key="index" :style="leafStyle(index)"/></div>
        <div v-else-if="sceneId === 'OCEAN_TIME'" class="scene-waves"><i/><i/><i/></div>
        <div v-else class="scene-steam"><i/><i/><i/></div>
      </div>
    </transition>
    <div class="scene-vignette"/>
  </div>
</template>
