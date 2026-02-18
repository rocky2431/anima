export type TransportType = 'stdio' | 'sse' | 'http'

interface McpServerConfigBase {
  id: string
  name: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface StdioServerConfig extends McpServerConfigBase {
  transport: 'stdio'
  command: string
  args?: string[]
}

export interface SseServerConfig extends McpServerConfigBase {
  transport: 'sse'
  url: string
  headers?: Record<string, string>
}

export interface HttpServerConfig extends McpServerConfigBase {
  transport: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = StdioServerConfig | SseServerConfig | HttpServerConfig

interface McpServerConfigInputBase {
  name: string
  enabled?: boolean
}

export interface StdioServerConfigInput extends McpServerConfigInputBase {
  transport: 'stdio'
  command: string
  args?: string[]
}

export interface SseServerConfigInput extends McpServerConfigInputBase {
  transport: 'sse'
  url: string
  headers?: Record<string, string>
}

export interface HttpServerConfigInput extends McpServerConfigInputBase {
  transport: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfigInput = StdioServerConfigInput | SseServerConfigInput | HttpServerConfigInput

export const VALID_TRANSPORTS: readonly TransportType[] = ['stdio', 'sse', 'http'] as const
