/**
 * Lightweight replacement for `@xsai/model`'s `listModels`.
 *
 * Fetches the OpenAI-compatible `/models` endpoint and returns
 * the raw model entries.
 */

export interface ModelListItem {
  id: string
  object?: string
  created?: number
  owned_by?: string
  [key: string]: unknown
}

export interface ListModelsOptions {
  apiKey?: string | null
  baseURL: string | URL
  headers?: Headers | Record<string, string>
}

export async function listModels(opts: ListModelsOptions): Promise<ModelListItem[]> {
  let base = typeof opts.baseURL === 'string' ? opts.baseURL : opts.baseURL.toString()
  if (!base.endsWith('/'))
    base += '/'

  const url = new URL('models', base)

  const headers: Record<string, string> = {}
  if (opts.headers) {
    if (opts.headers instanceof Headers) {
      opts.headers.forEach((v, k) => { headers[k] = v })
    }
    else {
      Object.assign(headers, opts.headers)
    }
  }
  if (opts.apiKey)
    headers.Authorization = `Bearer ${opts.apiKey}`

  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`Failed to list models: ${response.status} ${response.statusText}`)
  }

  const json = await response.json() as { data?: ModelListItem[], object?: string }

  return json.data ?? []
}
