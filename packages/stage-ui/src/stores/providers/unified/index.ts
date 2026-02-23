import type { UnifiedProviderMetadata } from '../types'

import { aliyunProvider } from './aliyun'
import { deepgramProvider } from './deepgram'
import { elevenlabsProvider } from './elevenlabs'
import { kokoroLocalProvider } from './kokoro-local'
import { lmStudioProvider } from './lm-studio'
import { localPipelineProvider } from './local-pipeline'
import { microsoftSpeechProvider } from './microsoft-speech'
import { ollamaProvider } from './ollama'
import { openaiCompatibleProvider } from './openai-compatible'
import { openrouterProvider } from './openrouter'
import { volcengineProvider } from './volcengine'
import { webSpeechApiProvider } from './web-speech-api'

/**
 * All unified providers registered in the OpenRouter-First architecture.
 *
 * Keyed by provider ID. Ordered roughly by tier:
 * 1. primary (OpenRouter)
 * 2. enhancement (ElevenLabs, Kokoro, Microsoft Speech, Deepgram, Aliyun, Volcengine, Web Speech API, Local Pipeline)
 * 3. local (Ollama, LM Studio)
 * 4. compatible (OpenAI Compatible)
 */
export const unifiedProviders: Record<string, UnifiedProviderMetadata> = {
  // Primary
  [openrouterProvider.id]: openrouterProvider,

  // Enhancement — Speech
  [elevenlabsProvider.id]: elevenlabsProvider,
  [microsoftSpeechProvider.id]: microsoftSpeechProvider,
  [deepgramProvider.id]: deepgramProvider,
  [kokoroLocalProvider.id]: kokoroLocalProvider,
  [volcengineProvider.id]: volcengineProvider,

  // Enhancement — Transcription
  [aliyunProvider.id]: aliyunProvider,
  [webSpeechApiProvider.id]: webSpeechApiProvider,

  // Enhancement — Local Audio Pipeline
  [localPipelineProvider.id]: localPipelineProvider,

  // Local
  [ollamaProvider.id]: ollamaProvider,
  [lmStudioProvider.id]: lmStudioProvider,

  // Compatible
  [openaiCompatibleProvider.id]: openaiCompatibleProvider,
}

/**
 * Get unified providers sorted by display order.
 */
export function getUnifiedProvidersSorted(): UnifiedProviderMetadata[] {
  return Object.values(unifiedProviders).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}

/**
 * Get unified providers filtered by tier.
 */
export function getUnifiedProvidersByTier(tier: UnifiedProviderMetadata['tier']): UnifiedProviderMetadata[] {
  return getUnifiedProvidersSorted().filter(p => p.tier === tier)
}

/**
 * Get unified providers filtered by capability.
 */
export function getUnifiedProvidersByCapability(cap: keyof UnifiedProviderMetadata['capabilities']): UnifiedProviderMetadata[] {
  return getUnifiedProvidersSorted().filter(p => p.capabilities[cap])
}

// Re-export individual providers for direct access
export {
  aliyunProvider,
  deepgramProvider,
  elevenlabsProvider,
  kokoroLocalProvider,
  lmStudioProvider,
  localPipelineProvider,
  microsoftSpeechProvider,
  ollamaProvider,
  openaiCompatibleProvider,
  openrouterProvider,
  volcengineProvider,
  webSpeechApiProvider,
}
