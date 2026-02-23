/**
 * Local tool() factory — replaces `@xsai/tool`.
 *
 * Converts a Zod schema into the OpenAI-compatible Tool format
 * used throughout the codebase.
 */

import type { Tool, ToolExecuteOptions, ToolExecuteResult } from '../../types/ai-messages'

import { toJSONSchema } from 'zod'

export async function tool(options: {
  name: string
  description: string

  parameters: any
  execute: (input: any, options: ToolExecuteOptions) => Promise<ToolExecuteResult>
}): Promise<Tool> {
  return {
    type: 'function',
    function: {
      name: options.name,
      description: options.description,
      parameters: toJSONSchema(options.parameters) as Record<string, unknown>,
    },
    execute: options.execute,
  }
}
