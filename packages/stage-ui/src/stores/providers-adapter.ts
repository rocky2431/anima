import type { LegacyProviderMapping, ProviderCapabilities } from './providers/types'

/**
 * Maps every legacy provider ID (from the old 44-entry flat registry)
 * to its unified provider ID + target capability.
 *
 * Used by:
 * - Credential migration (startup)
 * - Settings UI redirect (old detail page → new detail page)
 * - Module stores that still reference old IDs during transition
 */
export const LEGACY_ID_MAP: Record<string, LegacyProviderMapping> = {
  // ── Direct-connect chat providers → openrouter ──────────────────────
  'openrouter-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'openai': { unifiedId: 'openrouter', capability: 'chat' },
  'anthropic': { unifiedId: 'openrouter', capability: 'chat' },
  'google-generative-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'groq': { unifiedId: 'openrouter', capability: 'chat' },
  'deepseek': { unifiedId: 'openrouter', capability: 'chat' },
  'cerebras-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'together-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'fireworks-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'novita-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'perplexity-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'mistral-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'moonshot-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'minimax': { unifiedId: 'openrouter', capability: 'chat' },
  'minimax-global': { unifiedId: 'openrouter', capability: 'chat' },
  'xai': { unifiedId: 'openrouter', capability: 'chat' },
  '302-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'cloudflare-workers-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'azure-ai-foundry': { unifiedId: 'openrouter', capability: 'chat' },
  'featherless-ai': { unifiedId: 'openrouter', capability: 'chat' },
  'modelscope': { unifiedId: 'openrouter', capability: 'chat' },
  'player2': { unifiedId: 'openrouter', capability: 'chat' },
  'vllm': { unifiedId: 'openrouter', capability: 'chat' },
  'comet-api': { unifiedId: 'openrouter', capability: 'chat' },

  // ── Audio providers → openrouter ────────────────────────────────────
  'openai-audio-speech': { unifiedId: 'openrouter', capability: 'speech' },
  'openai-audio-transcription': { unifiedId: 'openrouter', capability: 'transcription' },
  'player2-speech': { unifiedId: 'openrouter', capability: 'speech' },
  'comet-api-speech': { unifiedId: 'openrouter', capability: 'speech' },
  'comet-api-transcription': { unifiedId: 'openrouter', capability: 'transcription' },
  'index-tts-vllm': { unifiedId: 'openrouter', capability: 'speech' },

  // ── OpenAI compatible ───────────────────────────────────────────────
  'openai-compatible': { unifiedId: 'openai-compatible', capability: 'chat' },
  'openai-compatible-audio-speech': { unifiedId: 'openai-compatible', capability: 'speech' },
  'openai-compatible-audio-transcription': { unifiedId: 'openai-compatible', capability: 'transcription' },

  // ── Local providers ─────────────────────────────────────────────────
  'ollama': { unifiedId: 'ollama', capability: 'chat' },
  'ollama-embedding': { unifiedId: 'ollama', capability: 'embedding' },
  'lm-studio': { unifiedId: 'lm-studio', capability: 'chat' },

  // ── Enhancement — Speech ────────────────────────────────────────────
  'elevenlabs': { unifiedId: 'elevenlabs', capability: 'speech' },
  'kokoro-local': { unifiedId: 'kokoro-local', capability: 'speech' },
  'microsoft-speech': { unifiedId: 'microsoft-speech', capability: 'speech' },
  'deepgram-tts': { unifiedId: 'deepgram', capability: 'speech' },
  'volcengine': { unifiedId: 'volcengine', capability: 'speech' },
  'alibaba-cloud-model-studio': { unifiedId: 'aliyun', capability: 'speech' },

  // ── Enhancement — Transcription ─────────────────────────────────────
  'aliyun-nls-transcription': { unifiedId: 'aliyun', capability: 'transcription' },
  'browser-web-speech-api': { unifiedId: 'web-speech-api', capability: 'transcription' },

  // ── Local Pipeline (consolidated) ───────────────────────────────────
  'app-local-audio-speech': { unifiedId: 'local-pipeline', capability: 'speech' },
  'app-local-audio-transcription': { unifiedId: 'local-pipeline', capability: 'transcription' },
  'browser-local-audio-speech': { unifiedId: 'local-pipeline', capability: 'speech' },
  'browser-local-audio-transcription': { unifiedId: 'local-pipeline', capability: 'transcription' },
}

const BACKUP_KEY = 'settings/credentials/providers-backup'

/**
 * Migrate legacy credentials to unified format.
 *
 * Strategy:
 * - Multiple legacy IDs may map to the same unified ID.
 * - When merging, prefer the entry that has a non-empty apiKey.
 * - Credentials that already exist under a unified ID are left untouched.
 */
export function migrateLegacyCredentials(
  legacyCredentials: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const unified: Record<string, Record<string, unknown>> = {}

  for (const [legacyId, creds] of Object.entries(legacyCredentials)) {
    const mapping = LEGACY_ID_MAP[legacyId]
    if (!mapping)
      continue

    const { unifiedId } = mapping

    // If we already wrote creds for this unified ID, only overwrite when
    // the current entry has an apiKey and the previous one does not.
    if (unified[unifiedId]) {
      if (creds.apiKey && !unified[unifiedId].apiKey) {
        unified[unifiedId] = { ...unified[unifiedId], ...creds }
      }
    }
    else {
      unified[unifiedId] = { ...creds }
    }
  }

  return unified
}

/**
 * Run one-time migration from the old localStorage key to the unified key.
 *
 * - Backs up old credentials to `settings/credentials/providers-backup`
 * - Writes migrated credentials to `settings/unified/credentials`
 * - Only runs if the unified key is empty and the legacy key has data
 */
export function runCredentialMigration(): void {
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function')
    return

  const legacyRaw = localStorage.getItem('settings/credentials/providers')
  const unifiedRaw = localStorage.getItem('settings/unified/credentials')

  // Skip if unified already has data or legacy has nothing
  if (unifiedRaw || !legacyRaw)
    return

  try {
    const legacy = JSON.parse(legacyRaw)
    if (!legacy || typeof legacy !== 'object')
      return

    // Backup
    localStorage.setItem(BACKUP_KEY, legacyRaw)

    // Migrate
    const unified = migrateLegacyCredentials(legacy)
    localStorage.setItem('settings/unified/credentials', JSON.stringify(unified))
  }
  catch {
    // Migration is best-effort; don't block app startup
    console.warn('[providers-adapter] Credential migration failed')
  }
}

/**
 * Resolve a legacy provider ID to its unified equivalent.
 */
export function resolveLegacyId(legacyId: string): LegacyProviderMapping | undefined {
  return LEGACY_ID_MAP[legacyId]
}

/**
 * Map a capability key to the createProviders factory key.
 * `vision` and `functionCalling` are served by the `chat` factory.
 */
export function capabilityToFactoryKey(cap: keyof ProviderCapabilities): 'chat' | 'speech' | 'transcription' | 'embedding' {
  if (cap === 'vision' || cap === 'functionCalling')
    return 'chat'
  return cap
}
