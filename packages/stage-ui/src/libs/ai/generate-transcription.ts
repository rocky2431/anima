/**
 * Lightweight STT wrapper — replaces `@xsai/generate-transcription`.
 *
 * Posts to the OpenAI-compatible `/audio/transcriptions` endpoint
 * and returns { text }.
 */

export async function generateTranscription(options: {
  baseURL: string | URL
  apiKey?: string
  model: string
  file: File | Blob
  headers?: Headers | Record<string, string>
  responseFormat?: string
  language?: string
  prompt?: string
  temperature?: number
  [key: string]: unknown
}): Promise<{ text: string }> {
  const base = String(options.baseURL).replace(/\/$/, '')

  const headers: Record<string, string> = {}
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`
  }
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((v, k) => { headers[k] = v })
    }
    else {
      Object.assign(headers, options.headers)
    }
  }

  const formData = new FormData()
  formData.append('file', options.file, (options.file as File).name || 'audio.wav')
  formData.append('model', options.model)
  if (options.responseFormat)
    formData.append('response_format', options.responseFormat)
  if (options.language)
    formData.append('language', options.language)
  if (options.prompt)
    formData.append('prompt', options.prompt)
  if (options.temperature !== undefined)
    formData.append('temperature', String(options.temperature))

  const response = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `generateTranscription failed: HTTP ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ''}`,
    )
  }

  const data = await response.json()
  return { text: typeof data === 'string' ? data : data.text || '' }
}
