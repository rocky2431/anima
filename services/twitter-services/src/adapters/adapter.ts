import type { Config } from '../config/types'
import type { Context } from '../core/browser/context'
import type { AnaseAdapter } from './anase-adapter'
import type { MCPAdapter } from './mcp-adapter'

import { logger } from '../utils/logger'

export function useAdapter() {
  const adapters: { airi?: AnaseAdapter, mcp?: MCPAdapter } = {}

  async function initAdapters(config: Config, ctx: Context): Promise<{ airi?: AnaseAdapter, mcp?: MCPAdapter }> {
    if (config.adapters.anase?.enabled) {
      logger.main.log('Starting Airi adapter...')
      const { AnaseAdapter } = await import('./anase-adapter')

      adapters.anase = new AnaseAdapter(ctx, {
        url: config.adapters.anase.url,
        token: config.adapters.anase.token,
        credentials: config.credentials || {},
      })

      await adapters.anase.start()
      logger.main.log('Airi adapter started')
    }

    if (config.adapters.mcp?.enabled) {
      logger.main.log('Starting MCP adapter...')
      const { MCPAdapter } = await import('./mcp-adapter')

      adapters.mcp = new MCPAdapter(config.adapters.mcp.port, ctx)

      await adapters.mcp.start()
      logger.main.log('MCP adapter started')
    }

    return adapters
  }

  return {
    adapters,
    initAdapters,
  }
}
