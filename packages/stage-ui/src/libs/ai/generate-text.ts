/**
 * Lightweight chat-completion wrapper — replaces `@xsai/generate-text`.
 *
 * Sends a single request to the OpenAI-compatible `/chat/completions`
 * endpoint and returns the first choice's content.
 */

export async function generateText(options: {
  baseURL: string | URL
  apiKey?: string
  model: string
  messages: Array<{ role: string, content: unknown }>
  headers?: Record<string, string>
  max_tokens?: number
  [key: string]: unknown
}): Promise<{ text: string }> {
  const base = String(options.baseURL).replace(/\/$/, '')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.apiKey)
    headers.Authorization = `Bearer ${options.apiKey}`
  if (options.headers)
    Object.assign(headers, options.headers)

  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.max_tokens,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `generateText failed: HTTP ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ''}`,
    )
  }

  const data = await response.json()
  return { text: data.choices?.[0]?.message?.content ?? '' }
}
