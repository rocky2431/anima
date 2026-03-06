import { join } from 'node:path'

import { createContext, defineEventa, defineInvokeHandler } from '@moeru/eventa'
import { describe, expect, it, vi } from 'vitest'

import { FileSystemLoader, PluginHost } from '.'
import { createApis } from '../plugin/apis/client'
import { protocolCapabilityWait, protocolProviders } from '../plugin/apis/protocol'

function reportPluginCapability(
  host: PluginHost,
  payload: { key: string, state: 'announced' | 'ready', metadata?: Record<string, unknown> },
) {
  if (payload.state === 'announced') {
    return host.announceCapability(payload.key, payload.metadata)
  }

  return host.markCapabilityReady(payload.key, payload.metadata)
}

describe('for FileSystemPluginHost', () => {
  it('should load test-normal-plugin from manifest', async () => {
    const host = new FileSystemLoader()

    const pluginDef = await host.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.anase.app',
      name: 'test-plugin',
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    const ctx = createContext()
    const apis = createApis(ctx)
    const onVitestCall = vi.fn()
    ctx.on(defineEventa('vitest-call:init'), onVitestCall)

    await expect(pluginDef.init?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onVitestCall).toHaveBeenCalledTimes(1)
  })

  it('should resolve runtime-specific entrypoint with node fallback', async () => {
    const host = new FileSystemLoader()

    const pluginDef = await host.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.anase.app',
      name: 'test-plugin',
      entrypoints: {
        node: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '', runtime: 'node' })

    expect(pluginDef).toBeDefined()
    expect(typeof pluginDef.init).toBe('function')
  })

  it('should be able to handle test-error-plugin from manifest', async () => {
    const host = new FileSystemLoader()

    await expect(host.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.anase.app',
      name: 'test-plugin',
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-error-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })).rejects.toThrow('Test error plugin always throws an error during loading.')
  })
})

describe('for PluginHost', () => {
  const providersCapability = 'anase:plugin-sdk:apis:protocol:resources:providers:list-providers'
  const testManifest = {
    apiVersion: 'v1' as const,
    kind: 'manifest.plugin.anase.app' as const,
    name: 'test-plugin',
    entrypoints: {
      electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
    },
  }

  it('should run plugin lifecycle to ready in-memory', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, { cwd: '' })

    await host.markConfigurationNeeded(session.id, 'manual-check')

    expect(session.phase).toBe('configuration-needed')

    await host.applyConfiguration(session.id, {
      configId: `${session.identity.id}:manual`,
      revision: 2,
      schemaVersion: 1,
      full: { mode: 'manual' },
    })

    expect(session.phase).toBe('configured')

    const stopped = host.stop(session.id)
    expect(stopped?.phase).toBe('stopped')
    expect(host.getSession(session.id)).toBeUndefined()
  })

  it('should fail initialization when plugin init returns false', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    const session = await host.load({
      apiVersion: 'v1',
      kind: 'manifest.plugin.anase.app',
      name: 'test-plugin-no-connect',
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-no-connect-plugin.ts'),
      },
    }, { cwd: '' })

    await expect(host.init(session.id)).rejects.toThrow('Plugin initialization aborted by plugin: test-plugin-no-connect')

    const latest = host.getSession(session.id)
    expect(latest?.phase).toBe('failed')
  })

  it('should accept websocket transport and load plugin session', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'websocket', url: 'ws://localhost:19876' },
    })

    const session = await host.load(testManifest, { cwd: '' })
    expect(session.phase).toBe('loaded')
    expect(session.transport.kind).toBe('websocket')
    host.stop(session.id)
  })

  it('should be able to expose setupModules', async () => {
    const loader = new FileSystemLoader()

    const pluginDef = await loader.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.anase.app',
      name: 'test-plugin',
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '' })

    const ctx = createContext()
    const apis = createApis(ctx)
    const onVitestCall = vi.fn()
    ctx.on(defineEventa('vitest-call:init'), onVitestCall)

    await expect(pluginDef.init?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onVitestCall).toHaveBeenCalledTimes(1)

    defineInvokeHandler(ctx, protocolProviders.listProviders, async () => {
      return [
        { name: 'provider1' },
      ]
    })
    defineInvokeHandler(ctx, protocolCapabilityWait, async () => {
      return {
        key: 'anase:plugin-sdk:apis:protocol:resources:providers:list-providers',
        state: 'ready',
        updatedAt: Date.now(),
      }
    })

    const onProviderListCall = vi.fn()
    ctx.on(protocolProviders.listProviders.sendEvent, onProviderListCall)
    await expect(pluginDef.setupModules?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onProviderListCall).toHaveBeenCalledTimes(1)
  })

  it('should wait for required capabilities before proceeding init', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const started = host.start(testManifest, {
      cwd: '',
      requiredCapabilities: ['cap:providers:list'],
      capabilityWaitTimeoutMs: 2000,
    })

    await new Promise(resolve => setTimeout(resolve, 20))
    const loadingSession = host.listSessions().find(item => item.manifest.name === testManifest.name)
    expect(loadingSession?.phase).toBe('waiting-deps')

    reportPluginCapability(host, {
      key: 'cap:providers:list',
      state: 'ready',
      metadata: { source: 'test' },
    })
    const session = await started
    expect(session.phase).toBe('ready')
  })

  it('should fail when required capabilities timeout', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    await expect(host.start(testManifest, {
      cwd: '',
      requiredCapabilities: ['cap:missing'],
      capabilityWaitTimeoutMs: 10,
    })).rejects.toThrow('Capability `cap:missing` is not ready after 10ms.')
  })

  it('should register capability offers from plugins and allow accept/reject', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, { cwd: '' })

    // Simulate plugin offering a capability via event
    const { moduleContributeCapabilityOffer } = await import('@anase/plugin-protocol/types')
    session.channels.host.emit(moduleContributeCapabilityOffer, {
      identity: session.identity,
      capability: { id: 'test:cap:vision', name: 'Vision OCR' },
    })

    const offered = host.getOfferedCapabilities(session.id)
    expect(offered).toHaveLength(1)
    expect(offered[0].id).toBe('test:cap:vision')

    // Capability should be announced
    expect(host.isCapabilityReady('test:cap:vision')).toBe(false)
    const caps = host.listCapabilities()
    expect(caps.find(c => c.key === 'test:cap:vision')?.state).toBe('announced')

    // Accept the capability
    host.acceptCapabilityOffer(session.id, 'test:cap:vision')
    expect(host.isCapabilityReady('test:cap:vision')).toBe(true)

    host.stop(session.id)
  })

  it('should reject capability offer and notify plugin', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, { cwd: '' })

    const { moduleContributeCapabilityOffer, moduleContributeCapabilityActivated } = await import('@anase/plugin-protocol/types')
    session.channels.host.emit(moduleContributeCapabilityOffer, {
      identity: session.identity,
      capability: { id: 'test:cap:reject', name: 'To be rejected' },
    })

    const activatedEvents: Array<{ active: boolean, reason?: string }> = []
    session.channels.host.on(moduleContributeCapabilityActivated, (envelope) => {
      if (envelope.body)
        activatedEvents.push({ active: envelope.body.active, reason: envelope.body.reason })
    })

    host.rejectCapabilityOffer(session.id, 'test:cap:reject', 'Not supported')
    expect(activatedEvents).toHaveLength(1)
    expect(activatedEvents[0].active).toBe(false)
    expect(activatedEvents[0].reason).toBe('Not supported')

    // Rejected capability should NOT be marked ready
    expect(host.isCapabilityReady('test:cap:reject')).toBe(false)

    host.stop(session.id)
  })

  it('should run validate → plan → commit configuration flow', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, {
      cwd: '',
      requireConfiguration: true,
    })
    expect(session.phase).toBe('configuration-needed')

    // Register plugin-side handlers via event listeners
    const {
      moduleConfigurationValidateRequest,
      moduleConfigurationValidateResponse,
      moduleConfigurationPlanRequest,
      moduleConfigurationPlanResponse,
      moduleConfigurationCommit,
      moduleConfigurationCommitStatus,
    } = await import('@anase/plugin-protocol/types')

    // Plugin validates
    session.channels.host.on(moduleConfigurationValidateRequest, (envelope) => {
      if (!envelope.body)
        return
      session.channels.host.emit(moduleConfigurationValidateResponse, {
        identity: envelope.body.identity,
        validation: { status: 'valid' },
      })
    })

    // Plugin plans
    session.channels.host.on(moduleConfigurationPlanRequest, (envelope) => {
      if (!envelope.body)
        return
      session.channels.host.emit(moduleConfigurationPlanResponse, {
        identity: envelope.body.identity,
        plan: { schema: { id: 'test-config', version: 1 } },
      })
    })

    // Plugin commits
    session.channels.host.on(moduleConfigurationCommit, (envelope) => {
      if (!envelope.body)
        return
      session.channels.host.emit(moduleConfigurationCommitStatus, {
        identity: envelope.body.identity,
        state: 'done',
      })
    })

    // Host drives the flow
    const validateResult = await host.validateConfiguration(session.id)
    expect(validateResult.validation.status).toBe('valid')

    const planResult = await host.planConfiguration(session.id)
    expect(planResult.plan.schema.id).toBe('test-config')

    await host.commitConfiguration(session.id, {
      configId: 'test-config:1',
      revision: 1,
      schemaVersion: 1,
      full: { key: 'value' },
    })
    expect(session.phase).toBe('configured')

    host.stop(session.id)
  })

  it('should accept plugin with exact version match (no constraints)', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      protocolVersion: 'v1',
      apiVersion: 'v1',
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, { cwd: '' })
    expect(session.phase).toBe('ready')
    host.stop(session.id)
  })

  it('should accept plugin with exact version in supported list', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      protocolVersion: 'v1',
      apiVersion: 'v1',
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, {
      cwd: '',
      compatibility: {
        supportedProtocolVersions: ['v1', 'v2'],
        supportedApiVersions: ['v1'],
      },
    })
    expect(session.phase).toBe('ready')
    host.stop(session.id)
  })

  it('should downgrade when host preferred not in plugin list but overlap exists', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      protocolVersion: 'v2',
      apiVersion: 'v2',
      supportedProtocolVersions: ['v2', 'v1'],
      supportedApiVersions: ['v2', 'v1'],
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, {
      cwd: '',
      compatibility: {
        supportedProtocolVersions: ['v1'],
        supportedApiVersions: ['v1'],
      },
    })
    expect(session.phase).toBe('ready')
    host.stop(session.id)
  })

  it('should reject plugin when no compatible version exists', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      protocolVersion: 'v2',
      apiVersion: 'v2',
    })

    const session = await host.load(testManifest, { cwd: '' })

    await expect(host.init(session.id, {
      compatibility: {
        supportedProtocolVersions: ['v3'],
        supportedApiVersions: ['v3'],
      },
    })).rejects.toThrow('rejected')

    const latest = host.getSession(session.id)
    expect(latest?.phase).toBe('failed')
  })

  it('should handle commit failure in configuration flow', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, {
      cwd: '',
      requireConfiguration: true,
    })

    const {
      moduleConfigurationCommit,
      moduleConfigurationCommitStatus,
    } = await import('@anase/plugin-protocol/types')

    session.channels.host.on(moduleConfigurationCommit, (envelope) => {
      if (!envelope.body)
        return
      session.channels.host.emit(moduleConfigurationCommitStatus, {
        identity: envelope.body.identity,
        state: 'failed',
        note: 'Database connection refused',
      })
    })

    await expect(host.commitConfiguration(session.id, {
      configId: 'test:fail',
      revision: 1,
      schemaVersion: 1,
      full: {},
    })).rejects.toThrow('Configuration commit failed: Database connection refused')

    host.stop(session.id)
  })
})
