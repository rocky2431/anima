import type { EventContext } from '@moeru/eventa'

import { createCapabilities } from './capabilities'
import { createConfiguration } from './configuration'
import { createProviders } from './resources'

export function createApis(ctx: EventContext<any, any>) {
  return {
    providers: createProviders(ctx),
    capabilities: createCapabilities(ctx),
    configuration: createConfiguration(ctx),
  }
}

export type PluginApis = ReturnType<typeof createApis>
export * from './capabilities'
export * from './configuration'
export * from './resources'
