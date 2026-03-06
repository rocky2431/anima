import type { EventContext } from '@moeru/eventa'
import type { ModuleCapability } from '@proj-airi/plugin-protocol/types'

import { defineInvoke } from '@moeru/eventa'
import {
  moduleContributeCapabilityActivated,
  moduleContributeCapabilityOffer,
} from '@proj-airi/plugin-protocol/types'

import { protocolCapabilitySnapshot, protocolCapabilityWait } from '../../protocol/capabilities'

export function createCapabilities(ctx: EventContext<any, any>) {
  return {
    offerCapability(identity: { id: string, kind: 'plugin', plugin: { id: string } }, capability: ModuleCapability) {
      ctx.emit(moduleContributeCapabilityOffer, {
        identity,
        capability,
      })
    },

    onCapabilityActivated(handler: (event: { capabilityId: string, active: boolean, reason?: string }) => void) {
      return ctx.on(moduleContributeCapabilityActivated, (envelope) => {
        if (!envelope.body)
          return
        handler({
          capabilityId: envelope.body.capabilityId,
          active: envelope.body.active,
          reason: envelope.body.reason,
        })
      })
    },

    async waitForCapability(key: string, timeoutMs?: number) {
      const invoke = defineInvoke(ctx, protocolCapabilityWait)
      return await invoke({ key, timeoutMs })
    },

    async listCapabilities() {
      const invoke = defineInvoke(ctx, protocolCapabilitySnapshot)
      return await invoke()
    },
  }
}
