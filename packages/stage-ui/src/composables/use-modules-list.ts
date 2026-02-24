import type { BeatSyncDetectorState } from '@proj-airi/stage-shared/beat-sync'

import { getBeatSyncState, listenBeatSyncStateChange } from '@proj-airi/stage-shared/beat-sync'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useChannelsStore } from '../stores/modules/channels'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useDesktopShellStore } from '../stores/modules/desktop-shell'
import { useDiscordStore } from '../stores/modules/discord'
import { useEmbeddingStore } from '../stores/modules/embedding'
import { useHearingStore } from '../stores/modules/hearing'
import { useLlmStore } from '../stores/modules/llm'
import { useMcpModuleStore } from '../stores/modules/mcp'
import { useSpeechStore } from '../stores/modules/speech'
import { useTwitterStore } from '../stores/modules/twitter'
import { useVisionStore } from '../stores/modules/vision'

export interface Module {
  id: string
  name: string
  description: string
  icon?: string
  iconColor?: string
  iconImage?: string
  to: string
  configured: boolean
  category: string
}

export function useModulesList() {
  const { t } = useI18n()

  // Initialize stores
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()
  const discordStore = useDiscordStore()
  const twitterStore = useTwitterStore()
  const mcpStore = useMcpModuleStore()
  const visionStore = useVisionStore()
  const desktopShellStore = useDesktopShellStore()
  const embeddingStore = useEmbeddingStore()
  const llmStore = useLlmStore()
  const channelsStore = useChannelsStore()
  const beatSyncState = ref<BeatSyncDetectorState>()

  const modulesList = computed<Module[]>(() => [
    {
      id: 'consciousness',
      name: t('settings.pages.modules.consciousness.title'),
      description: t('settings.pages.modules.consciousness.description'),
      icon: 'i-solar:ghost-bold-duotone',
      to: '/settings/modules/consciousness',
      configured: consciousnessStore.configured,
      category: 'essential',
    },
    {
      id: 'speech',
      name: t('settings.pages.modules.speech.title'),
      description: t('settings.pages.modules.speech.description'),
      icon: 'i-solar:user-speak-rounded-bold-duotone',
      to: '/settings/modules/speech',
      configured: speechStore.configured,
      category: 'essential',
    },
    {
      id: 'hearing',
      name: t('settings.pages.modules.hearing.title'),
      description: t('settings.pages.modules.hearing.description'),
      icon: 'i-solar:microphone-3-bold-duotone',
      to: '/settings/modules/hearing',
      configured: hearingStore.configured,
      category: 'essential',
    },
    {
      id: 'vision',
      name: t('settings.pages.modules.vision.title'),
      description: t('settings.pages.modules.vision.description'),
      icon: 'i-solar:eye-closed-bold-duotone',
      to: '/settings/modules/vision',
      configured: visionStore.configured,
      category: 'essential',
    },
    {
      id: 'embedding',
      name: t('settings.pages.modules.embedding.title'),
      description: t('settings.pages.modules.embedding.description'),
      icon: 'i-solar:graph-new-bold-duotone',
      to: '/settings/modules/embedding',
      configured: embeddingStore.configured,
      category: 'essential',
    },
    {
      id: 'llm',
      name: t('settings.pages.modules.llm.title'),
      description: t('settings.pages.modules.llm.description'),
      icon: 'i-solar:cpu-bolt-bold-duotone',
      to: '/settings/modules/llm',
      configured: llmStore.configured,
      category: 'essential',
    },
    {
      id: 'messaging-discord',
      name: t('settings.pages.modules.messaging-discord.title'),
      description: t('settings.pages.modules.messaging-discord.description'),
      icon: 'i-simple-icons:discord',
      to: '/settings/modules/messaging-discord',
      configured: discordStore.configured,
      category: 'messaging',
    },
    {
      id: 'x',
      name: t('settings.pages.modules.x.title'),
      description: t('settings.pages.modules.x.description'),
      icon: 'i-simple-icons:x',
      to: '/settings/modules/x',
      configured: twitterStore.configured,
      category: 'messaging',
    },
    {
      id: 'mcp-server',
      name: t('settings.pages.modules.mcp-server.title'),
      description: t('settings.pages.modules.mcp-server.description'),
      icon: 'i-solar:server-bold-duotone',
      to: '/settings/modules/mcp',
      configured: mcpStore.configured,
      category: 'essential',
    },
    {
      id: 'desktop-shell',
      name: t('settings.pages.modules.desktop-shell.title'),
      description: t('settings.pages.modules.desktop-shell.description'),
      icon: 'i-solar:monitor-bold-duotone',
      to: '/settings/modules/desktop-shell',
      configured: desktopShellStore.configured,
      category: 'essential',
    },
    {
      id: 'beat-sync',
      name: t('settings.pages.modules.beat_sync.title'),
      description: t('settings.pages.modules.beat_sync.description'),
      icon: 'i-solar:music-notes-bold-duotone',
      to: '/settings/modules/beat-sync',
      configured: beatSyncState.value?.isActive ?? false,
      category: 'essential',
    },
    {
      id: 'channels',
      name: t('settings.pages.modules.channels.title'),
      description: t('settings.pages.modules.channels.description'),
      icon: 'i-solar:chat-round-dots-bold-duotone',
      to: '/settings/modules/channels',
      configured: channelsStore.configured,
      category: 'messaging',
    },
  ])

  const categorizedModules = computed(() => {
    return modulesList.value.reduce((categories, module) => {
      const { category } = module
      if (!categories[category]) {
        categories[category] = []
      }
      categories[category].push(module)
      return categories
    }, {} as Record<string, Module[]>)
  })

  // Define category display names
  const categoryNames = computed(() => ({
    essential: t('settings.pages.modules.categories.essential'),
    messaging: t('settings.pages.modules.categories.messaging'),
  }))

  // TODO(Makito): We can make this a reactive value from a synthetic store.
  onMounted(() => {
    getBeatSyncState().then(initialState => beatSyncState.value = initialState)
    const removeListener = listenBeatSyncStateChange(newState => beatSyncState.value = { ...newState })
    onUnmounted(() => removeListener())
  })

  return {
    modulesList,
    categorizedModules,
    categoryNames,
  }
}
