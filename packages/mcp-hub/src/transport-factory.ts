import type { McpServerConfig } from './types'

import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'

export type McpTransport
  = | InstanceType<typeof Experimental_StdioMCPTransport>
    | { type: 'sse', url: string, headers?: Record<string, string> }
    | { type: 'http', url: string, headers?: Record<string, string> }

export function createTransport(config: McpServerConfig): McpTransport {
  switch (config.transport) {
    case 'stdio':
      return new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args,
      })

    case 'sse':
    case 'http':
      return {
        type: config.transport,
        url: config.url,
        ...(config.headers && { headers: config.headers }),
      }
  }
}
