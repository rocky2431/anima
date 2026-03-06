import { defineInvokeEventa } from '@moeru/eventa'

export interface CapabilityDescriptor {
  key: string
  state: 'announced' | 'ready'
  metadata?: Record<string, unknown>
  updatedAt: number
}

export const protocolCapabilityWait = defineInvokeEventa<CapabilityDescriptor, { key: string, timeoutMs?: number }>(
  'anase:plugin-sdk:apis:protocol:capabilities:wait',
)

export const protocolCapabilitySnapshot = defineInvokeEventa<CapabilityDescriptor[]>(
  'anase:plugin-sdk:apis:protocol:capabilities:snapshot',
)
