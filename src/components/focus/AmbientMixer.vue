<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { CloudRain, Coffee, Trees, Volume2, VolumeX, Waves } from 'lucide-vue-next'
import { useAmbientStore } from '../../stores/ambientStore'
import { AMBIENT_SOUND_IDS, FOCUS_SCENES, type AmbientSoundId, type FocusSceneId } from '../../types/ambient'

defineProps<{ compact?: boolean }>()
const ambient = useAmbientStore()
const sounds: Record<AmbientSoundId, { label: string; icon: typeof CloudRain }> = {
  RAIN: { label: '雨声', icon: CloudRain }, FOREST: { label: '森林', icon: Trees }, OCEAN: { label: '海浪', icon: Waves }, CAFE: { label: '咖啡馆', icon: Coffee },
}
const sceneList = computed(() => Object.values(FOCUS_SCENES))
const percentage = (soundId: AmbientSoundId) => Math.round(ambient.preferences.sounds[soundId].volume * 100)
const setVolume = (soundId: AmbientSoundId, event: Event) => ambient.setVolume(soundId, Number((event.target as HTMLInputElement).value) / 100)
const chooseScene = (sceneId: FocusSceneId) => void ambient.selectScene(sceneId, true)
onMounted(() => void ambient.initialize())
</script>

<template>
  <section class="ambient-mixer" :class="{ compact }">
    <header class="ambient-mixer-header">
      <div><span>AMBIENT SCENE</span><strong>{{ ambient.scene.name }}</strong><small>{{ ambient.scene.description }}</small></div>
      <div class="ambient-master-actions">
        <button v-if="ambient.enabledCount && !ambient.audioActive" class="resume-audio" @click="ambient.resumeEnabled()"><Volume2 :size="15"/>播放已选声音</button>
        <button class="mute-audio" :class="{ active: ambient.preferences.muted }" :aria-label="ambient.preferences.muted ? '取消静音' : '一键静音'" @click="ambient.toggleMute()"><component :is="ambient.preferences.muted ? VolumeX : Volume2" :size="17"/></button>
      </div>
    </header>

    <div class="scene-selector" aria-label="选择专注场景">
      <button v-for="scene in sceneList" :key="scene.id" :class="[{ active: ambient.preferences.sceneId === scene.id }, `scene-choice-${scene.id.toLowerCase()}`]" @click="chooseScene(scene.id)"><i/><span>{{ scene.name }}</span></button>
    </div>

    <div class="ambient-channels">
      <div v-for="soundId in AMBIENT_SOUND_IDS" :key="soundId" class="ambient-channel" :class="{ enabled: ambient.preferences.sounds[soundId].enabled }">
        <button class="sound-toggle" :aria-pressed="ambient.preferences.sounds[soundId].enabled" :disabled="ambient.busySounds.includes(soundId)" @click="ambient.toggleSound(soundId)">
          <span><component :is="sounds[soundId].icon" :size="16"/></span><strong>{{ sounds[soundId].label }}</strong><small>{{ ambient.busySounds.includes(soundId) ? '连接中' : ambient.preferences.sounds[soundId].enabled ? '播放中' : '已关闭' }}</small>
        </button>
        <label><span>{{ percentage(soundId) }}%</span><input type="range" min="0" max="100" :value="percentage(soundId)" :aria-label="`${sounds[soundId].label}音量`" @input="setVolume(soundId,$event)"/></label>
      </div>
    </div>
    <p class="ambient-note">声音由浏览器本地实时生成；首次播放需要点击操作，不会自动播放。</p>
  </section>
</template>
