/**
 * OpenAI-compatible provider factory — replaces `@xsai-ext/providers/create`.
 *
 * Returns a "ProviderBundle" whose methods (.chat, .speech, .transcription,
 * .embed, .model) produce the same `{ baseURL, apiKey, model }` config
 * objects that the rest of the codebase expects.
 */

export interface ProviderConfig {
  baseURL: string | URL
  apiKey?: string
  model: string
  headers?: Headers | Record<string, string>
}

export interface ProviderBaseConfig {
  baseURL: string | URL
  apiKey?: string
  headers?: Headers | Record<string, string>
}

export interface ProviderBundle {
  chat: (model: string, extra?: Record<string, unknown>) => ProviderConfig
  speech: (model: string, extra?: Record<string, unknown>) => ProviderConfig
  transcription: (model: string, extra?: Record<string, unknown>) => ProviderConfig
  embed: (model: string) => ProviderConfig
  model: () => ProviderBaseConfig
}

function normalizeBaseUrl(value: string): string {
  let base = value.trim()
  if (base && !base.endsWith('/'))
    base += '/'
  return base
}

function createBundle(apiKey: string, baseURL: string, defaultHeaders?: Record<string, string>): ProviderBundle {
  const normalizedBase = normalizeBaseUrl(baseURL)
  return {
    chat: (model, extra) => ({ baseURL: normalizedBase, apiKey, model, headers: defaultHeaders, ...extra }),
    speech: (model, extra) => ({ baseURL: normalizedBase, apiKey, model, headers: defaultHeaders, ...extra }),
    transcription: (model, extra) => ({ baseURL: normalizedBase, apiKey, model, headers: defaultHeaders, ...extra }),
    embed: model => ({ baseURL: normalizedBase, apiKey, model, headers: defaultHeaders }),
    model: () => ({ baseURL: normalizedBase, apiKey, headers: defaultHeaders }),
  }
}

// Named factories matching existing `@xsai-ext/providers/create` exports

export function createOpenAICompatible(apiKey: string, baseURL: string): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createOpenAI(apiKey: string, baseURL: string = 'https://api.openai.com/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createOpenRouter(apiKey: string, baseURL: string = 'https://openrouter.ai/api/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

/**
 * Ollama has a special convention: the first arg can be either apiKey
 * (for chat where the second arg is baseURL) or baseURL (for model-only
 * queries where apiKey is empty).
 */
export function createOllama(apiKeyOrBaseUrl: string, baseURL?: string): ProviderBundle {
  if (baseURL !== undefined) {
    return createBundle(apiKeyOrBaseUrl, baseURL)
  }
  // When only one arg is given, it's the base URL (no api key needed for Ollama)
  return createBundle('', apiKeyOrBaseUrl)
}

export function createDeepSeek(apiKey: string, baseURL: string = 'https://api.deepseek.com/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createGroq(apiKey: string, baseURL: string = 'https://api.groq.com/openai/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createMistralAI(apiKey: string, baseURL: string = 'https://api.mistral.ai/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createTogetherAI(apiKey: string, baseURL: string = 'https://api.together.xyz/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createFireworksAI(apiKey: string, baseURL: string = 'https://api.fireworks.ai/inference/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createPerplexityAI(apiKey: string, baseURL: string = 'https://api.perplexity.ai/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createCerebrasAI(apiKey: string, baseURL: string = 'https://api.cerebras.ai/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createXAI(apiKey: string, baseURL: string = 'https://api.x.ai/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createNovitaAI(apiKey: string, baseURL: string = 'https://api.novita.ai/v3/openai/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createMinimax(apiKey: string, baseURL: string = 'https://api.minimax.chat/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createMoonshotAI(apiKey: string, baseURL: string = 'https://api.moonshot.cn/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createAnthropic(apiKey: string, baseURL: string = 'https://api.anthropic.com/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createGoogleGenerativeAI(apiKey: string, baseURL: string = 'https://generativelanguage.googleapis.com/v1beta/openai/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createCloudflareWorkersAI(apiKey: string, baseURL: string): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createModelScope(apiKey: string, baseURL: string = 'https://dashscope.aliyuncs.com/compatible-mode/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createN1N(apiKey: string, baseURL: string = 'https://openrouter.ai/api/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createFeatherlessAI(apiKey: string, baseURL: string = 'https://api.featherless.ai/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function createCometAPI(apiKey: string, baseURL: string = 'https://api.cometapi.com/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

export function create302AI(apiKey: string, baseURL: string = 'https://api.302.ai/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}

// Re-export for LM Studio (just OpenAI-compatible with custom baseURL)
export function createLMStudio(apiKey: string = '', baseURL: string = 'http://localhost:1234/v1/'): ProviderBundle {
  return createBundle(apiKey, baseURL)
}
