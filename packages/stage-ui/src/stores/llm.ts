import type { CommonContentPart, CompletionToolCall, Message, Tool } from '../types/ai-messages'
import type { ChatProvider } from './providers/types'

import { stepCountIs, streamText } from 'ai'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { convertXsaiToolsToAiSdk, createAiSdkModel } from '../composables/use-ai-sdk'
import { listModels } from '../libs/ai/list-models'
import { debug, mcp } from '../tools'

export type StreamEvent
  = | { type: 'text-delta', text: string }
    | { type: 'finish', finishReason: string, usage?: { promptTokens: number, completionTokens: number, totalTokens: number } }
    | ({ type: 'tool-call' } & CompletionToolCall)
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'error', error: any }

export interface StreamOptions {
  headers?: Record<string, string>
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  toolsCompatibility?: Map<string, boolean>
  supportsTools?: boolean
  waitForTools?: boolean
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
}

// Converts non-standard message roles (e.g. 'error') into valid user messages
function sanitizeMessages(messages: unknown[]): Message[] {
  return messages.map((m: any) => {
    if (m && m.role === 'error') {
      return {
        role: 'user',
        content: `User encountered error: ${String(m.content ?? '')}`,
      } as Message
    }
    return m as Message
  })
}

function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, _: Message[], options?: StreamOptions): boolean {
  return !!(options?.supportsTools || options?.toolsCompatibility?.get(`${chatProvider.chat(model).baseURL}-${model}`))
}

async function resolveXsaiTools(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions): Promise<Tool[] | undefined> {
  const resolveTools = async () => {
    const tools = typeof options?.tools === 'function'
      ? await options.tools()
      : options?.tools
    return tools ?? []
  }

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
  if (!supportedTools)
    return undefined

  try {
    return [
      ...await mcp() as Tool[],
      ...await debug() as Tool[],
      ...await resolveTools(),
    ]
  }
  catch (err) {
    throw new Error(`Failed to resolve tools for model ${model}`, { cause: err })
  }
}

async function streamFrom(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
  const chatConfig = chatProvider.chat(model) as unknown as Record<string, unknown>
  const baseURL = String(chatConfig.baseURL ?? '')
  const apiKey = String(chatConfig.apiKey ?? '')

  if (!baseURL) {
    throw new Error(`AI SDK stream requires a baseURL in the chat provider config (model: ${model})`)
  }
  if (!apiKey) {
    throw new Error(`AI SDK stream requires an apiKey in the chat provider config (model: ${model})`)
  }

  const aiModel = createAiSdkModel({
    baseURL,
    apiKey,
    modelId: model,
    headers: { ...(chatConfig.headers as Record<string, string> | undefined), ...options?.headers },
  })

  const sanitized = sanitizeMessages(messages as unknown[])
  const xsaiTools = await resolveXsaiTools(model, chatProvider, messages, options)
  const aiSdkTools = xsaiTools ? convertXsaiToolsToAiSdk(xsaiTools as any) : undefined

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const resolveOnce = () => { if (!settled) { settled = true; resolve() } }
    const rejectOnce = (err: unknown) => { if (!settled) { settled = true; reject(err) } }

    try {
      const result = streamText({
        model: aiModel,
        messages: sanitized as unknown as import('ai').ModelMessage[],
        tools: aiSdkTools,
        stopWhen: stepCountIs(10),
        onChunk: async ({ chunk }) => {
          try {
            if (chunk.type === 'text-delta') {
              await options?.onStreamEvent?.({ type: 'text-delta', text: chunk.text })
            }
            else if (chunk.type === 'tool-call') {
              await options?.onStreamEvent?.({
                type: 'tool-call',
                toolName: chunk.toolName,
                toolCallId: chunk.toolCallId,
                args: JSON.stringify(chunk.input),
                toolCallType: 'function',
              } as StreamEvent)
            }
            else if (chunk.type === 'tool-result') {
              await options?.onStreamEvent?.({
                type: 'tool-result',
                toolCallId: chunk.toolCallId,
                result: chunk.output as string,
              })
            }
          }
          catch (err) {
            rejectOnce(err)
          }
        },
        onFinish: async ({ finishReason }) => {
          try {
            await options?.onStreamEvent?.({ type: 'finish', finishReason })
            if (finishReason !== 'tool-calls' || !options?.waitForTools)
              resolveOnce()
          }
          catch (err) {
            rejectOnce(err)
          }
        },
        onError: async ({ error }) => {
          try {
            await options?.onStreamEvent?.({ type: 'error', error })
          }
          catch { /* ignore callback error during error reporting */ }
          rejectOnce(error)
        },
      })

      // Ensure promise resolves when stream completes even if onFinish doesn't fire
      Promise.resolve(result.text).then(() => resolveOnce()).catch(rejectOnce)
    }
    catch (err) {
      rejectOnce(err)
    }
  })
}

export { streamFrom as streamFromAiSdk }

export async function attemptForToolsCompatibilityDiscovery(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>): Promise<boolean> {
  async function attempt(enable: boolean) {
    try {
      await streamFrom(model, chatProvider, [{ role: 'user', content: 'Hello, world!' }], { ...options, supportsTools: enable })
      return true
    }
    catch (err) {
      if (err instanceof Error) {
        const errStr = String(err)
        // Known provider-specific tool incompatibility errors
        // Ollama: "does not support tools"
        if (errStr.includes('does not support tools')) {
          return false
        }
        // OpenRouter: "No endpoints found that support tool use."
        if (errStr.includes('No endpoints found that support tool use.')) {
          return false
        }
      }

      throw err
    }
  }

  function promiseAllWithInterval<T>(promises: (() => Promise<T>)[], interval: number): Promise<{ result?: T, error?: any }[]> {
    return new Promise((resolve) => {
      const results: { result?: T, error?: any }[] = []
      let completed = 0

      promises.forEach((promiseFn, index) => {
        setTimeout(() => {
          promiseFn()
            .then((result) => {
              results[index] = { result }
            })
            .catch((err) => {
              results[index] = { error: err }
            })
            .finally(() => {
              completed++
              if (completed === promises.length) {
                resolve(results)
              }
            })
        }, index * interval)
      })
    })
  }

  const attempts = [
    () => attempt(true),
    () => attempt(false),
  ]

  const attemptsResults = await promiseAllWithInterval<boolean | undefined>(attempts, 1000)
  if (attemptsResults.some(res => res.error)) {
    const err = new Error(`Error during tools compatibility discovery for model: ${model}. Errors: ${attemptsResults.map(res => res.error).filter(Boolean).join(', ')}`)
    err.cause = attemptsResults.map(res => res.error).filter(Boolean)
    throw err
  }

  return attemptsResults[0].result === true && attemptsResults[1].result === true
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())

  async function discoverToolsCompatibility(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>) {
    // Cached, no need to discover again
    if (toolsCompatibility.value.has(`${chatProvider.chat(model).baseURL}-${model}`)) {
      return
    }

    const res = await attemptForToolsCompatibilityDiscovery(model, chatProvider, _, { ...options, toolsCompatibility: toolsCompatibility.value })
    toolsCompatibility.value.set(`${chatProvider.chat(model).baseURL}-${model}`, res)
  }

  function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const mergedOptions = { ...options, toolsCompatibility: toolsCompatibility.value }
    return streamFrom(model, chatProvider, messages, mergedOptions)
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '') {
      return []
    }

    try {
      return await listModels({
        baseURL: apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`)) {
        console.warn('[LLM] Invalid API URL, returning empty model list', { apiUrl })
        return []
      }

      throw err
    }
  }

  return {
    models,
    stream,
    discoverToolsCompatibility,
  }
})
