<script setup lang="ts">
import type { ChatProvider } from '@anase/stage-ui/stores/providers/types'

import { isStageTamagotchi } from '@anase/stage-shared'
import { VoiceModeOverlay } from '@anase/stage-ui/components/voice'
import { useAudioAnalyzer } from '@anase/stage-ui/composables'
import { useAudioContext } from '@anase/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@anase/stage-ui/stores/chat'
import { useChatSessionStore } from '@anase/stage-ui/stores/chat/session-store'
import { useConsciousnessStore } from '@anase/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline, useHearingStore } from '@anase/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@anase/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@anase/stage-ui/stores/settings'
import { BasicTextarea, FieldSelect } from '@anase/ui'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import IndicatorMicVolume from './IndicatorMicVolume.vue'

const messageInput = ref('')
const hearingTooltipOpen = ref(false)
const isComposing = ref(false)
const isListening = ref(false) // Transcription listening state (separate from microphone enabled)
const voiceModeOpen = ref(false)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission, startStream } = useSettingsAudioDevice()
const { enabled, selectedAudioInput, stream, audioInputs } = storeToRefs(useSettingsAudioDevice())
const chatOrchestrator = useChatOrchestratorStore()
const chatSession = useChatSessionStore()
const { ingest, discoverToolsCompatibility } = chatOrchestrator
const { messages } = storeToRefs(chatSession)
const { audioContext } = useAudioContext()
const { t } = useI18n()

// Transcription pipeline
const hearingStore = useHearingStore()
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const { configured: hearingConfigured, autoSendEnabled, autoSendDelay } = storeToRefs(hearingStore)
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

// Auto-send logic: VAD speech-end driven instead of timer
let speechEndTimeout: ReturnType<typeof setTimeout> | undefined
const pendingAutoSendText = ref('')

function clearPendingAutoSend() {
  if (speechEndTimeout) {
    clearTimeout(speechEndTimeout)
    speechEndTimeout = undefined
  }
  pendingAutoSendText.value = ''
}

function accumulateAutoSendText(text: string) {
  if (!autoSendEnabled.value)
    return
  pendingAutoSendText.value = pendingAutoSendText.value ? `${pendingAutoSendText.value} ${text}` : text
}

async function commitAutoSend() {
  if (!autoSendEnabled.value) {
    clearPendingAutoSend()
    return
  }

  const textToSend = (pendingAutoSendText.value || messageInput.value).trim()
  if (!textToSend)
    return

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)
    await ingest(textToSend, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
    messageInput.value = ''
    pendingAutoSendText.value = ''
  }
  catch (err) {
    console.error('[ChatArea] Auto-send error:', err)
  }
}

function scheduleSpeechEndCommit() {
  if (!autoSendEnabled.value)
    return

  // Clear any existing speech-end timer
  if (speechEndTimeout)
    clearTimeout(speechEndTimeout)

  // Short confirmation window: if no new speech within the configured delay, commit
  speechEndTimeout = setTimeout(() => {
    void commitAutoSend()
    speechEndTimeout = undefined
  }, autoSendDelay.value)
}

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  // Cancel any pending auto-send to prevent duplicate messages
  clearPendingAutoSend()

  const textToSend = messageInput.value
  messageInput.value = ''

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await ingest(textToSend, {
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
  }
  catch (error) {
    messageInput.value = textToSend
    messages.value.pop()
    messages.value.push({
      role: 'error',
      content: (error as Error).message,
    })
  }
}

watch(hearingTooltipOpen, async (value) => {
  if (value) {
    await askPermission()
  }
})

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
  }
})

const { startAnalyzer, stopAnalyzer } = useAudioAnalyzer()
let analyzerSource: MediaStreamAudioSourceNode | undefined

function teardownAnalyzer() {
  try {
    analyzerSource?.disconnect()
  }
  catch (err) {
    console.warn('[ChatArea] Error disconnecting audio analyzer:', err)
  }
  analyzerSource = undefined
  stopAnalyzer()
}

async function setupAnalyzer() {
  teardownAnalyzer()
  if (!hearingTooltipOpen.value || !enabled.value || !stream.value)
    return
  if (audioContext.state === 'suspended')
    await audioContext.resume()
  const analyser = startAnalyzer(audioContext)
  if (!analyser)
    return
  analyzerSource = audioContext.createMediaStreamSource(stream.value)
  analyzerSource.connect(analyser)
}

watch([hearingTooltipOpen, enabled, stream], () => {
  setupAnalyzer()
}, { immediate: true })

onUnmounted(() => {
  teardownAnalyzer()
  stopListening()
  clearPendingAutoSend()
})

// Transcription listening functions
async function startListening() {
  // Allow calling this even if already listening - transcribeForMediaStream will handle session reuse/restart
  try {
    console.info('[ChatArea] Starting listening...', {
      enabled: enabled.value,
      hasStream: !!stream.value,
      supportsStreamInput: supportsStreamInput.value,
      hearingConfigured: hearingConfigured.value,
    })

    // Auto-configure Web Speech API as default if no provider is configured
    if (!hearingConfigured.value) {
      // Check if Web Speech API is available in the browser
      // Web Speech API is NOT available in Electron (stage-tamagotchi) - it requires Google's embedded API keys
      // which are not available in Electron, causing it to fail at runtime
      const isWebSpeechAvailable = typeof window !== 'undefined'
        && !isStageTamagotchi() // Explicitly exclude Electron
        && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

      if (isWebSpeechAvailable) {
        console.info('[ChatArea] No transcription provider configured. Auto-configuring Web Speech API as default...')

        // Initialize the provider in the providers store first
        try {
          providersStore.initializeProvider('browser-web-speech-api')
        }
        catch (err) {
          console.warn('[ChatArea] Error initializing Web Speech API provider:', err)
        }

        // Set as active provider
        hearingStore.activeTranscriptionProvider = 'browser-web-speech-api'

        // Wait for reactivity to update
        await nextTick()

        // Verify the provider was set correctly
        if (hearingStore.activeTranscriptionProvider === 'browser-web-speech-api') {
          console.info('[ChatArea] Web Speech API configured as default provider')
          // Continue with transcription - Web Speech API is ready
        }
        else {
          console.error('[ChatArea] Failed to set Web Speech API as default provider')
          isListening.value = false
          return
        }
      }
      else {
        console.error('[ChatArea] Web Speech API not available. No transcription provider configured and Web Speech API is not available in this browser. Please go to Settings > Modules > Hearing to configure a transcription provider. Browser support:', {
          hasWindow: typeof window !== 'undefined',
          hasWebkitSpeechRecognition: typeof window !== 'undefined' && 'webkitSpeechRecognition' in window,
          hasSpeechRecognition: typeof window !== 'undefined' && 'SpeechRecognition' in window,
        })
        isListening.value = false
        return
      }
    }

    // Request microphone permission if needed (microphone should already be enabled by the user)
    if (!stream.value) {
      console.info('[ChatArea] Requesting microphone permission...')
      await askPermission()

      // If still no stream, try starting it manually
      if (!stream.value && enabled.value) {
        console.info('[ChatArea] Attempting to start stream manually...')
        startStream()
        // Wait for the stream to become available with a timeout.
        try {
          await until(stream).toBeTruthy({ timeout: 3000, throwOnTimeout: true })
        }
        catch {
          console.error('[ChatArea] Timed out waiting for audio stream.')
          isListening.value = false
          return
        }
      }
    }

    if (!stream.value) {
      const errorMsg = 'Failed to get audio stream for transcription. Please check microphone permissions and ensure a device is selected.'
      console.error('[ChatArea]', errorMsg)
      isListening.value = false
      return
    }

    // Check if streaming input is supported
    if (!shouldUseStreamInput.value) {
      const errorMsg = 'Streaming input not supported by the selected transcription provider. Please select a provider that supports streaming (e.g., Web Speech API).'
      console.warn('[ChatArea]', errorMsg)
      // Clean up any existing sessions from other pages (e.g., test page) that might interfere
      await stopStreamingTranscription(true)
      isListening.value = false
      return
    }

    console.info('[ChatArea] Starting streaming transcription with stream:', stream.value.id)

    // Call transcribeForMediaStream - it's async so we await it
    // Set listening state AFTER successful call
    try {
      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: (delta) => {
          if (delta && delta.trim()) {
            const currentText = messageInput.value.trim()
            messageInput.value = currentText ? `${currentText} ${delta}` : delta
            console.info('[ChatArea] Received transcription delta:', delta)

            // Accumulate for VAD-driven auto-send
            accumulateAutoSendText(delta)

            // Reset speech-end timer on new speech activity
            if (speechEndTimeout) {
              clearTimeout(speechEndTimeout)
              speechEndTimeout = undefined
            }
          }
        },
        onSpeechEnd: () => {
          // VAD detected speech end — schedule auto-send after confirmation window
          if (autoSendEnabled.value && pendingAutoSendText.value.trim()) {
            console.info('[ChatArea] Speech end detected, scheduling auto-send')
            scheduleSpeechEndCommit()
          }
        },
      })

      // Only set listening to true if transcription started successfully
      // (transcribeForMediaStream might return early if session already exists)
      isListening.value = true
      console.info('[ChatArea] Streaming transcription initiated successfully')
    }
    catch (err) {
      console.error('[ChatArea] Transcription error:', err)
      isListening.value = false
      throw err // Re-throw to be caught by outer catch
    }
  }
  catch (err) {
    console.error('[ChatArea] Failed to start transcription:', err)
    isListening.value = false
  }
}

async function stopListening() {
  if (!isListening.value)
    return

  try {
    console.info('[ChatArea] Stopping transcription...')

    // Clear auto-send timeout
    clearPendingAutoSend()

    // Send any pending text immediately if auto-send is enabled
    if (autoSendEnabled.value && pendingAutoSendText.value.trim()) {
      const textToSend = pendingAutoSendText.value.trim()
      pendingAutoSendText.value = ''
      try {
        const providerConfig = providersStore.getProviderConfig(activeProvider.value)
        await ingest(textToSend, {
          chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
          model: activeModel.value,
          providerConfig,
        })
        messageInput.value = ''
      }
      catch (err) {
        console.error('[ChatArea] Auto-send error on stop:', err)
      }
    }

    await stopStreamingTranscription(true)
    isListening.value = false
    console.info('[ChatArea] Transcription stopped')
  }
  catch (err) {
    console.error('[ChatArea] Error stopping transcription:', err)
    isListening.value = false
  }
}

// Start listening when microphone is enabled and stream is available
watch(enabled, async (val) => {
  if (val && stream.value) {
    // Microphone was just enabled and we have a stream, start transcription
    await startListening()
  }
  else if (!val && isListening.value) {
    // Microphone was disabled, stop transcription
    await stopListening()
  }
})

// Start listening when stream becomes available (if microphone is enabled)
watch(stream, async (val) => {
  if (val && enabled.value && !isListening.value) {
    // Stream became available and microphone is enabled, start transcription
    await startListening()
  }
  else if (!val && isListening.value) {
    // Stream was lost, stop transcription
    await stopListening()
  }
})

// Watch for auto-send setting changes and clear pending sends if disabled
watch(autoSendEnabled, (enabled) => {
  if (!enabled) {
    // Auto-send was disabled - clear any pending auto-send
    clearPendingAutoSend()
    console.info('[ChatArea] Auto-send disabled, cleared pending text')
  }
})
</script>

<template>
  <div h="<md:full" flex gap-2 class="ph-no-capture">
    <div
      :class="[
        'relative',
        'w-full',
        'bg-primary-200/20 dark:bg-primary-400/20',
      ]"
    >
      <BasicTextarea
        v-model="messageInput"
        :placeholder="t('stage.message')"
        text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
        bg="transparent"
        min-h="[100px]" max-h="[300px]" w-full
        rounded-t-xl p-4 font-medium pb="[60px]"
        outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
        :class="{
          'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic,
        }"
        @submit="handleSend"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />

      <!-- Bottom action bar -->
      <div
        absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between
      >
        <div flex items-center gap-1>
          <!-- Microphone toggle — prominent, always visible -->
          <button
            class="relative h-9 w-9 flex items-center justify-center rounded-lg outline-none transition-all duration-200 active:scale-95"
            :class="[
              enabled
                ? 'bg-primary-500/15 text-primary-500 hover:bg-primary-500/25 dark:bg-primary-400/15 dark:text-primary-400'
                : 'text-neutral-500 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-700/50',
            ]"
            :title="enabled ? t('settings.hearing.micDisable', 'Disable microphone') : t('settings.hearing.micEnable', 'Enable microphone')"
            @click="enabled = !enabled"
          >
            <Transition name="fade" mode="out-in">
              <IndicatorMicVolume v-if="enabled" class="h-5 w-5" />
              <div v-else class="i-ph:microphone-slash h-5 w-5" />
            </Transition>
            <!-- Active pulse indicator -->
            <span
              v-if="enabled && isListening"
              class="absolute h-2.5 w-2.5 rounded-full bg-green-500 -right-0.5 -top-0.5"
            >
              <span class="absolute inset-0 animate-ping rounded-full bg-green-400 opacity-75" />
            </span>
          </button>

          <!-- Voice mode (full-screen conversation) -->
          <button
            class="h-9 w-9 flex items-center justify-center rounded-lg text-neutral-500 outline-none transition-all duration-200 active:scale-95 hover:bg-primary-500/15 dark:text-neutral-400 hover:text-primary-500 dark:hover:bg-primary-400/15 dark:hover:text-primary-400"
            :title="t('settings.hearing.voiceMode', 'Voice Mode')"
            @click="voiceModeOpen = true"
          >
            <div class="i-lucide-audio-waveform h-5 w-5" />
          </button>

          <!-- Audio device selector (popover) -->
          <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
            <TooltipRoot v-model:open="hearingTooltipOpen">
              <TooltipTrigger as-child>
                <button
                  class="h-9 w-9 flex items-center justify-center rounded-lg text-neutral-400 outline-none transition-all duration-200 active:scale-95 hover:bg-neutral-200/50 dark:text-neutral-500 dark:hover:bg-neutral-700/50"
                  :title="t('settings.hearing.title')"
                >
                  <div class="i-ph:gear h-4 w-4" />
                </button>
              </TooltipTrigger>
              <Transition name="fade">
                <TooltipContent
                  side="top"
                  :side-offset="8"
                  :class="[
                    'w-64 max-w-[16rem] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-3',
                    'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
                  ]"
                >
                  <FieldSelect
                    v-model="selectedAudioInput"
                    label="Input device"
                    :options="audioInputs.map(device => ({ label: device.label || 'Unknown Device', value: device.deviceId }))"
                    layout="vertical"
                    placeholder="Select microphone"
                  />
                </TooltipContent>
              </Transition>
            </TooltipRoot>
          </TooltipProvider>
        </div>
      </div>
    </div>
    <!-- Voice Mode Overlay -->
    <VoiceModeOverlay v-if="voiceModeOpen" @close="voiceModeOpen = false" />
  </div>
</template>
