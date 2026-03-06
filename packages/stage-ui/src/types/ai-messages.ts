/**
 * Project-local AI message types.
 *
 * These replicate the OpenAI wire-format shapes previously imported from
 * `@xsai/shared-chat`.  They are intentionally kept minimal — only the
 * types actually consumed inside the monorepo are defined here.
 */

// ---------------------------------------------------------------------------
// Content parts
// ---------------------------------------------------------------------------

export interface TextContentPart {
  type: 'text'
  text: string
}

export interface ImageContentPart {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

export interface RefusalContentPart {
  type: 'refusal'
  refusal: string
}

export type CommonContentPart = TextContentPart | ImageContentPart | RefusalContentPart

// ---------------------------------------------------------------------------
// Tool-related
// ---------------------------------------------------------------------------

export interface CompletionToolCall {
  toolCallType: 'function'
  toolCallId: string
  toolName: string
  args: string
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface SystemMessage {
  role: 'system'
  content: string
  [key: string]: unknown
}

export interface DeveloperMessage {
  role: 'developer'
  content: string
  [key: string]: unknown
}

export interface UserMessage {
  role: 'user'
  content: string | CommonContentPart[]
  [key: string]: unknown
}

export interface AssistantMessage {
  role: 'assistant'
  content: string | CommonContentPart[] | null | undefined
  tool_calls?: CompletionToolCall[]
  [key: string]: unknown
}

export interface ToolMessage {
  role: 'tool'
  content: string
  tool_call_id: string
  [key: string]: unknown
}

export type Message
  = | SystemMessage
    | DeveloperMessage
    | UserMessage
    | AssistantMessage
    | ToolMessage

// ---------------------------------------------------------------------------
// Usage / Finish
// ---------------------------------------------------------------------------

export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | (string & {})
