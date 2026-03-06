import type { DocumentStore, EmbeddingProvider, LlmProvider, MemoryExtractor, MemoryOrchestrator, PersonaConfig, ReportGenerator, VectorStore } from '@proj-airi/context-engine'

import type { BrainProviders } from './providers'

import { useLogg } from '@guiiai/logg'

import { createEmbeddingProviderAdapter, createLlmProviderAdapter } from './adapters'

const log = useLogg('brain:pipeline').useGlobalConfig()

/**
 * Pipeline components for context-engine consumers.
 *
 * Note: SmartTip and SmartTodo also support `additionalSystemContext` in their
 * Options interfaces (forward-wired), but are not yet instantiated here.
 * They will be added when cron-driven tip/todo generation is integrated.
 */
export interface PipelineComponents {
  vectorStore: VectorStore
  orchestrator: MemoryOrchestrator | null
  reportGenerator: ReportGenerator | null
  memoryExtractor: MemoryExtractor | null
  llmAdapter: LlmProvider | null
  embeddingAdapter: EmbeddingProvider | null
}

const DEFAULT_PERSONA: PersonaConfig = {
  name: 'Airi',
  personality: 'A friendly and curious AI companion who cares about the user.',
  speakingStyle: 'Warm, casual, and supportive. Uses simple language.',
}

/**
 * Create all context-engine pipeline components.
 * Components that require LLM/embedding may be null if providers aren't configured.
 */
export async function createPipeline(opts: {
  vectorStore: VectorStore
  documentStore: DocumentStore
  providers: BrainProviders
  persona?: PersonaConfig
  additionalSystemContext?: string
}): Promise<PipelineComponents> {
  const { vectorStore, documentStore, providers } = opts
  const persona = opts.persona ?? DEFAULT_PERSONA
  const additionalSystemContext = opts.additionalSystemContext

  const llmAdapter = createLlmProviderAdapter(providers)
  const embeddingAdapter = createEmbeddingProviderAdapter(providers)

  let orchestrator: MemoryOrchestrator | null = null
  let reportGenerator: ReportGenerator | null = null
  let memoryExtractor: MemoryExtractor | null = null

  if (embeddingAdapter) {
    try {
      const { MemoryOrchestrator: OrchestratorClass } = await import('@proj-airi/context-engine')
      orchestrator = new OrchestratorClass({
        documentStore,
        vectorStore,
        embedding: embeddingAdapter,
      })
      await orchestrator.init()
      log.log('MemoryOrchestrator initialized')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ error: msg }).warn('Failed to initialize MemoryOrchestrator')
    }
  }
  else {
    log.log('MemoryOrchestrator skipped — embedding provider not configured')
  }

  if (llmAdapter) {
    try {
      const { ReportGenerator: ReportClass } = await import('@proj-airi/context-engine')
      reportGenerator = new ReportClass({ llm: llmAdapter, persona, additionalSystemContext })
      log.log('ReportGenerator initialized')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ error: msg }).warn('Failed to initialize ReportGenerator')
    }
  }
  else {
    log.log('ReportGenerator skipped — LLM provider not configured')
  }

  if (llmAdapter && embeddingAdapter) {
    try {
      const { MemoryExtractor: ExtractorClass } = await import('@proj-airi/context-engine')
      memoryExtractor = new ExtractorClass({
        llm: llmAdapter,
        embedding: embeddingAdapter,
        persona,
        additionalSystemContext,
        dedupThreshold: 0.85,
      })
      log.log('MemoryExtractor initialized')
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.withFields({ error: msg }).warn('Failed to initialize MemoryExtractor')
    }
  }
  else {
    log.log('MemoryExtractor skipped — LLM or embedding provider not configured')
  }

  return { vectorStore, orchestrator, reportGenerator, memoryExtractor, llmAdapter, embeddingAdapter }
}

/**
 * Rebuild pipeline components when providers change.
 * Re-creates adapters and dependent components in-place.
 */
export async function rebuildPipeline(
  current: PipelineComponents,
  opts: {
    documentStore: DocumentStore
    providers: BrainProviders
    persona?: PersonaConfig
    additionalSystemContext?: string
  },
): Promise<PipelineComponents> {
  log.log('Rebuilding pipeline due to provider change')
  return createPipeline({
    vectorStore: current.vectorStore,
    documentStore: opts.documentStore,
    providers: opts.providers,
    persona: opts.persona,
    additionalSystemContext: opts.additionalSystemContext,
  })
}
