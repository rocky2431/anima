<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'

import VoiceOrb from './VoiceOrb.vue'

import { useVoiceSessionStore } from '../../stores/voice-session'

const emit = defineEmits<{
  close: []
}>()
const voiceSession = useVoiceSessionStore()
const { uiState, userPartial, assistantPartial, mode, active } = storeToRefs(voiceSession)

const canBargeIn = computed(() =>
  uiState.value === 'speaking' || uiState.value === 'thinking',
)

const modeIcon = computed(() =>
  mode.value === 'hands_free' ? 'i-lucide-ear' : 'i-lucide-hand',
)

const modeLabel = computed(() =>
  mode.value === 'hands_free' ? 'Hands-free' : 'Push to Talk',
)

function handleOrbClick() {
  if (canBargeIn.value) {
    voiceSession.bargeIn()
  }
}

function handleClose() {
  voiceSession.stop()
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  if (!active.value) {
    voiceSession.start()
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// Auto-close when session ends externally
watch(active, (val) => {
  if (!val) {
    emit('close')
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="voice-overlay">
      <div
        class="voice-overlay"
        fixed inset-0 z-9999
        flex="~ col" items-center justify-center
      >
        <!-- Backdrop -->
        <div absolute inset-0 bg-black op-85 />

        <!-- Close button -->
        <button
          absolute right-4 top-4 z-10
          class="rounded-full p-3 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          @click="handleClose"
        >
          <div class="i-lucide-x" text-xl />
        </button>

        <!-- Main content -->
        <div relative z-10 flex="~ col" items-center gap-8 px-6 text-center>
          <!-- Assistant text -->
          <div
            max-w-lg min-h-16
            class="text-lg text-white/80 font-light transition-opacity duration-300"
            :class="{ 'op-0': !assistantPartial }"
          >
            {{ assistantPartial || '...' }}
          </div>

          <!-- Orb -->
          <div
            class="cursor-pointer transition-transform active:scale-95"
            :class="{ 'hover:scale-105': canBargeIn }"
            @click="handleOrbClick"
          >
            <VoiceOrb :state="uiState" :size="160" />
          </div>

          <!-- User text -->
          <div
            max-w-lg min-h-12
            class="text-base text-white/50 font-light italic transition-opacity duration-300"
            :class="{ 'op-0': !userPartial }"
          >
            {{ userPartial || '...' }}
          </div>

          <!-- Barge-in hint -->
          <Transition name="fade">
            <div v-if="canBargeIn" class="text-xs text-white/30">
              Tap orb or speak to interrupt
            </div>
          </Transition>
        </div>

        <!-- Bottom controls -->
        <div absolute bottom-8 z-10 flex items-center gap-6>
          <!-- Mode toggle -->
          <button
            class="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            @click="voiceSession.toggleMode()"
          >
            <div :class="modeIcon" />
            <span>{{ modeLabel }}</span>
          </button>

          <!-- End session -->
          <button
            class="rounded-full bg-red-500/80 p-4 text-white transition-all hover:scale-105 hover:bg-red-500"
            @click="handleClose"
          >
            <div class="i-lucide-phone-off" text-xl />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.voice-overlay-enter-active,
.voice-overlay-leave-active {
  transition: opacity 0.3s ease;
}
.voice-overlay-enter-active .voice-overlay > * {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.voice-overlay-enter-from,
.voice-overlay-leave-to {
  opacity: 0;
}
.voice-overlay-enter-from > * {
  transform: scale(0.95);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
