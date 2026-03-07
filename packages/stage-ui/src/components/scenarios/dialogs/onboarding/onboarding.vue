<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, provide, ref } from 'vue'

import StepCharacterSelection from './step-character-selection.vue'
import StepFeaturesSummary from './step-features-summary.vue'
import StepModelSelection from './step-model-selection.vue'
import StepProviderSelection from './step-provider-selection.vue'
import StepWelcome from './step-welcome.vue'

import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { useUnifiedProvidersStore } from '../../../../stores/unified-providers'
import { OnboardingContextKey } from './utils'

interface Emits {
  (e: 'configured'): void
  (e: 'skipped'): void
}

const emit = defineEmits<Emits>()

const step = ref(1)
const direction = ref<'next' | 'previous'>('next')

const unifiedStore = useUnifiedProvidersStore()
const consciousnessStore = useConsciousnessStore()
const {
  activeProvider,
} = storeToRefs(consciousnessStore)

// Providers shown during onboarding: primary + local + compatible (chat-capable only)
const onboardingProviders = computed(() => {
  const targetIds = ['openrouter', 'dashscope', 'ollama', 'lm-studio', 'openai-compatible']
  return targetIds
    .map(id => unifiedStore.getProvider(id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.capabilities.chat)
    .map(p => ({
      ...p,
      localizedName: p.name,
      localizedDescription: p.description,
    }))
})

// Selected provider and form data
const selectedProviderId = ref('')

// Computed selected provider
const selectedProvider = computed(() => {
  return onboardingProviders.value.find(p => p.id === selectedProviderId.value) || null
})

// Reset validation state when provider changes
function selectProvider(provider: { id: string }) {
  selectedProviderId.value = provider.id
}

function handlePreviousStep() {
  if (step.value > 1) {
    direction.value = 'previous'
    step.value--
  }
}

async function handleNextStep(configData?: { apiKey: string, baseUrl: string, accountId: string }) {
  // Step 2: Provider setup (merged selection + configuration) — validate and save before proceeding
  if (step.value === 2 && configData) {
    await saveProviderConfiguration(configData)
    direction.value = 'next'
    step.value++
    return
  }

  // Other steps: just proceed
  if (step.value < 5) {
    direction.value = 'next'
    step.value++
  }
  else {
    handleSave()
  }
}

async function saveProviderConfiguration(data: { apiKey: string, baseUrl: string, accountId: string }) {
  if (!selectedProvider.value)
    return

  const config: Record<string, unknown> = {}

  if (data.apiKey)
    config.apiKey = data.apiKey.trim()
  if (data.baseUrl)
    config.baseUrl = data.baseUrl.trim()
  if (data.accountId)
    config.accountId = data.accountId.trim()

  // Save credentials to unified provider store
  unifiedStore.providers[selectedProvider.value.id] = {
    ...unifiedStore.providers[selectedProvider.value.id],
    ...config,
  }

  unifiedStore.markProviderAdded(selectedProvider.value.id)
  activeProvider.value = selectedProvider.value.id
  await nextTick()

  try {
    await unifiedStore.fetchModelsForProvider(selectedProvider.value.id, 'chat')
  }
  catch (err) {
    console.error('error', err)
  }
}

async function handleSave() {
  emit('configured')
}

provide(OnboardingContextKey, {
  selectedProviderId,
  selectedProvider,
  onboardingProviders,
  selectProvider,
  handleNextStep,
  handlePreviousStep,
  handleSave,
})
</script>

<template>
  <div h-full w-full>
    <Transition :name="direction === 'next' ? 'slide-next' : 'slide-prev'" mode="out-in">
      <StepWelcome v-if="step === 1" :key="1" />
      <StepProviderSelection v-else-if="step === 2" :key="2" />
      <StepModelSelection v-else-if="step === 3" :key="3" />
      <StepCharacterSelection v-else-if="step === 4" :key="4" />
      <StepFeaturesSummary v-else-if="step === 5" :key="5" />
    </Transition>
  </div>
</template>

<style scoped>
.slide-next-enter-active,
.slide-next-leave-active {
  transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
}

.slide-next-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-next-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.slide-next-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.slide-next-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Slide Previous Animation */
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
}

.slide-prev-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-prev-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.slide-prev-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.slide-prev-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
