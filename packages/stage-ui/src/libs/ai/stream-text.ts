/**
 * Lightweight streaming chat-completion wrapper -- replaces `@xsai/stream-text`.
 *
 * Sends a request to the OpenAI-compatible `/chat/completions` endpoint
 * with `stream: true` and returns an async-iterable `fullStream` of
 * `StreamTextEvent` chunks compatible with the xsAI stream-text contract.
 */

export interface StreamTextEvent {
  type: 'text-delta' | 'error' | 'finish'
  text?: string
  error?: unknown
}

export interface StreamTextResult {
  fullStream: ReadableStream<StreamTextEvent>
}

export function streamText(options: {
  baseURL: string | URL
  apiKey?: string
  model: string
  messages: Array<{ role: string, content: unknown }>
  headers?: Record<string, string>
  [key: string]: unknown
}): StreamTextResult {
  const base = String(options.baseURL).replace(/\/$/, '')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.apiKey)
    headers.Authorization = `Bearer ${options.apiKey}`
  if (options.headers)
    Object.assign(headers, options.headers)

  const fullStream = new ReadableStream<StreamTextEvent>({
    async start(controller) {
      try {
        const response = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: options.model,
            messages: options.messages,
            stream: true,
          }),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => '')
          controller.enqueue({
            type: 'error',
            error: new Error(
              `streamText failed: HTTP ${response.status} ${response.statusText}${errorText ? ` -- ${errorText}` : ''}`,
            ),
          })
          controller.close()
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          controller.enqueue({ type: 'error', error: new Error('Response body is null') })
          controller.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:'))
              continue

            const data = trimmed.slice(5).trim()
            if (data === '[DONE]')
              continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta
              if (delta?.content) {
                controller.enqueue({ type: 'text-delta', text: delta.content })
              }
            }
            catch {
              // skip malformed SSE lines
            }
          }
        }

        controller.enqueue({ type: 'finish' })
        controller.close()
      }
      catch (err) {
        controller.enqueue({ type: 'error', error: err })
        controller.close()
      }
    },
  })

  return { fullStream }
}
