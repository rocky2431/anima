/**
 * Named tool factory -- wraps AI SDK's tool() and attaches a name
 * so callers can build a ToolSet without an intermediate format.
 */

import type { Tool as AiSdkTool } from 'ai'

import { tool as aiSdkTool } from 'ai'

export interface NamedTool {
  name: string
  tool: AiSdkTool
}

export function tool(options: {
  name: string
  description: string
  parameters: any
  execute: (input: any, options: any) => Promise<any>
}): NamedTool {
  return {
    name: options.name,
    tool: aiSdkTool({
      description: options.description,
      inputSchema: options.parameters,
      execute: options.execute,
    }),
  }
}
