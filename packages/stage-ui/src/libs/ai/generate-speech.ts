/**
 * Lightweight TTS wrapper — replaces `@xsai/generate-speech`.
 *
 * Posts to the OpenAI-compatible `/audio/speech` endpoint and
 * returns the raw audio as an ArrayBuffer.
 */

export async function generateSpeech(options: {
  baseURL: string | URL
  apiKey?: string
  model: string
  input: string
  voice: string
  headers?: Headers | Record<string, string>
  [key: string]: unknown
}): Promise<ArrayBuffer> {
  const base = String(options.baseURL).replace(/\/$/, '')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`
  }
  if (options.headers) {
    const extra: Record<string, string> = {}
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => { extra[k] = v })
    }
    else {
      Object.assign(extra, options.headers)
    }
    Object.assign(headers, extra)
  }

  // Separate transport keys from body payload
  const { baseURL: _, apiKey: _a, headers: _h, ...bodyParams } = options

  const response = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyParams),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `generateSpeech failed: HTTP ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ''}`,
    )
  }

  return response.arrayBuffer()
}
