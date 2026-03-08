<script setup lang="ts">
import type { VoiceUIState } from '../../services/voice/voice-session-machine'

import { computed } from 'vue'

const props = withDefaults(defineProps<{
  state: VoiceUIState
  size?: number
}>(), {
  size: 160,
})

const orbColor = computed(() => {
  switch (props.state) {
    case 'listening': return { base: 'rgb(59, 130, 246)', glow: 'rgba(59, 130, 246, 0.4)' }
    case 'user-speaking': return { base: 'rgb(34, 197, 94)', glow: 'rgba(34, 197, 94, 0.5)' }
    case 'thinking': return { base: 'rgb(168, 85, 247)', glow: 'rgba(168, 85, 247, 0.4)' }
    case 'speaking': return { base: 'rgb(244, 114, 182)', glow: 'rgba(244, 114, 182, 0.5)' }
    case 'interrupted': return { base: 'rgb(251, 146, 60)', glow: 'rgba(251, 146, 60, 0.4)' }
    default: return { base: 'rgb(148, 163, 184)', glow: 'rgba(148, 163, 184, 0.2)' }
  }
})

const animationClass = computed(() => {
  switch (props.state) {
    case 'listening': return 'orb-pulse-slow'
    case 'user-speaking': return 'orb-pulse-fast'
    case 'thinking': return 'orb-spin'
    case 'speaking': return 'orb-breathe'
    case 'interrupted': return 'orb-shake'
    default: return 'orb-idle'
  }
})

const stateLabel = computed(() => {
  switch (props.state) {
    case 'listening': return 'Listening...'
    case 'user-speaking': return 'Hearing you...'
    case 'thinking': return 'Thinking...'
    case 'speaking': return 'Speaking...'
    case 'interrupted': return 'Interrupted'
    default: return 'Ready'
  }
})
</script>

<template>
  <div flex="~ col" items-center gap-4>
    <div
      class="orb-container"
      :class="animationClass"
      :style="{
        width: `${size}px`,
        height: `${size}px`,
      }"
    >
      <!-- Glow ring -->
      <div
        class="orb-glow"
        :style="{
          boxShadow: `0 0 ${size * 0.4}px ${size * 0.15}px ${orbColor.glow}`,
          background: `radial-gradient(circle, ${orbColor.glow} 0%, transparent 70%)`,
        }"
      />
      <!-- Core orb -->
      <div
        class="orb-core"
        :style="{
          background: `radial-gradient(circle at 35% 35%, ${orbColor.base}, color-mix(in srgb, ${orbColor.base} 60%, black))`,
        }"
      />
    </div>
    <span class="text-sm font-medium op-60" select-none>{{ stateLabel }}</span>
  </div>
</template>

<style scoped>
.orb-container {
  position: relative;
  border-radius: 50%;
  cursor: pointer;
}

.orb-glow {
  position: absolute;
  inset: -20%;
  border-radius: 50%;
  transition: box-shadow 0.5s ease, background 0.5s ease;
}

.orb-core {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transition: background 0.5s ease;
}

/* Idle: barely visible pulse */
.orb-idle .orb-glow {
  animation: pulse-idle 4s ease-in-out infinite;
}
@keyframes pulse-idle {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.03); }
}

/* Listening: gentle pulse */
.orb-pulse-slow .orb-glow {
  animation: pulse-slow 2.5s ease-in-out infinite;
}
.orb-pulse-slow .orb-core {
  animation: core-pulse-slow 2.5s ease-in-out infinite;
}
@keyframes pulse-slow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.08); }
}
@keyframes core-pulse-slow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

/* User speaking: fast energetic pulse */
.orb-pulse-fast .orb-glow {
  animation: pulse-fast 0.8s ease-in-out infinite;
}
.orb-pulse-fast .orb-core {
  animation: core-pulse-fast 0.8s ease-in-out infinite;
}
@keyframes pulse-fast {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}
@keyframes core-pulse-fast {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* Thinking: rotation */
.orb-spin .orb-glow {
  animation: spin-glow 2s linear infinite;
}
.orb-spin .orb-core {
  animation: spin-core 3s ease-in-out infinite;
}
@keyframes spin-glow {
  0% { transform: rotate(0deg) scale(1.05); opacity: 0.6; }
  50% { transform: rotate(180deg) scale(1.1); opacity: 0.9; }
  100% { transform: rotate(360deg) scale(1.05); opacity: 0.6; }
}
@keyframes spin-core {
  0%, 100% { transform: scale(0.97); }
  50% { transform: scale(1.03); }
}

/* Speaking: smooth breathing */
.orb-breathe .orb-glow {
  animation: breathe-glow 1.5s ease-in-out infinite;
}
.orb-breathe .orb-core {
  animation: breathe-core 1.5s ease-in-out infinite;
}
@keyframes breathe-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.12); }
}
@keyframes breathe-core {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.04); }
}

/* Interrupted: quick shake */
.orb-shake .orb-core {
  animation: shake 0.4s ease-in-out 2;
}
.orb-shake .orb-glow {
  animation: shake-glow 0.4s ease-in-out 2;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
@keyframes shake-glow {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
</style>
