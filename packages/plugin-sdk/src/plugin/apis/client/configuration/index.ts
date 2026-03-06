import type { EventContext } from '@moeru/eventa'
import type {
  ModuleConfigEnvelope,
  ModuleConfigPlan,
  ModuleConfigValidation,
  ModuleIdentity,
} from '@proj-airi/plugin-protocol/types'

import {
  moduleConfigurationCommit,
  moduleConfigurationCommitStatus,
  moduleConfigurationConfigured,
  moduleConfigurationPlanRequest,
  moduleConfigurationPlanResponse,
  moduleConfigurationPlanStatus,
  moduleConfigurationValidateRequest,
  moduleConfigurationValidateResponse,
  moduleConfigurationValidateStatus,
} from '@proj-airi/plugin-protocol/types'

export function createConfiguration(ctx: EventContext<any, any>) {
  return {
    onValidateRequest(handler: (event: {
      identity: ModuleIdentity
      current?: ModuleConfigEnvelope
    }) => Promise<{
      validation: ModuleConfigValidation
      plan?: ModuleConfigPlan
      current?: ModuleConfigEnvelope
    }>) {
      return ctx.on(moduleConfigurationValidateRequest, async (envelope) => {
        if (!envelope.body)
          return
        const event = envelope.body
        ctx.emit(moduleConfigurationValidateStatus, {
          identity: event.identity,
          state: 'working',
        })
        try {
          const result = await handler(event as { identity: ModuleIdentity, current?: ModuleConfigEnvelope })
          ctx.emit(moduleConfigurationValidateResponse, {
            identity: event.identity,
            ...result,
          })
          ctx.emit(moduleConfigurationValidateStatus, {
            identity: event.identity,
            state: 'done',
          })
        }
        catch (err) {
          ctx.emit(moduleConfigurationValidateStatus, {
            identity: event.identity,
            state: 'failed',
            note: err instanceof Error ? err.message : 'Validation failed',
          })
        }
      })
    },

    onPlanRequest(handler: (event: {
      identity: ModuleIdentity
      plan?: ModuleConfigPlan
      current?: ModuleConfigEnvelope
    }) => Promise<{
      plan: ModuleConfigPlan
      current?: ModuleConfigEnvelope
    }>) {
      return ctx.on(moduleConfigurationPlanRequest, async (envelope) => {
        if (!envelope.body)
          return
        const event = envelope.body
        ctx.emit(moduleConfigurationPlanStatus, {
          identity: event.identity,
          state: 'working',
        })
        try {
          const result = await handler(event as { identity: ModuleIdentity, plan?: ModuleConfigPlan, current?: ModuleConfigEnvelope })
          ctx.emit(moduleConfigurationPlanResponse, {
            identity: event.identity,
            ...result,
          })
          ctx.emit(moduleConfigurationPlanStatus, {
            identity: event.identity,
            state: 'done',
          })
        }
        catch (err) {
          ctx.emit(moduleConfigurationPlanStatus, {
            identity: event.identity,
            state: 'failed',
            note: err instanceof Error ? err.message : 'Planning failed',
          })
        }
      })
    },

    onCommit(handler: (event: {
      identity: ModuleIdentity
      config: ModuleConfigEnvelope
    }) => Promise<void>) {
      return ctx.on(moduleConfigurationCommit, async (envelope) => {
        if (!envelope.body)
          return
        const event = envelope.body
        ctx.emit(moduleConfigurationCommitStatus, {
          identity: event.identity,
          state: 'working',
        })
        try {
          await handler(event as { identity: ModuleIdentity, config: ModuleConfigEnvelope })
          ctx.emit(moduleConfigurationCommitStatus, {
            identity: event.identity,
            state: 'done',
          })
          ctx.emit(moduleConfigurationConfigured, {
            identity: event.identity,
            config: event.config,
          })
        }
        catch (err) {
          ctx.emit(moduleConfigurationCommitStatus, {
            identity: event.identity,
            state: 'failed',
            note: err instanceof Error ? err.message : 'Commit failed',
          })
        }
      })
    },
  }
}
