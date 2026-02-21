import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface ChannelStatus {
  platform: string
  connected: boolean
  error?: string
}

export const useChannelsStore = defineStore('channels-module', () => {
  // Persisted config (localStorage)
  const slackEnabled = useLocalStorage('settings/channels/slack-enabled', false)
  const slackBotToken = useLocalStorage('settings/channels/slack-bot-token', '')
  const slackAppToken = useLocalStorage('settings/channels/slack-app-token', '')

  const whatsappEnabled = useLocalStorage('settings/channels/whatsapp-enabled', false)
  const emailEnabled = useLocalStorage('settings/channels/email-enabled', false)
  const feishuEnabled = useLocalStorage('settings/channels/feishu-enabled', false)
  const dingtalkEnabled = useLocalStorage('settings/channels/dingtalk-enabled', false)

  // Runtime state
  const channelStatuses = ref<ChannelStatus[]>([])

  const configured = computed(() => {
    return slackEnabled.value || whatsappEnabled.value || emailEnabled.value || feishuEnabled.value || dingtalkEnabled.value
  })

  const enabledCount = computed(() => {
    let count = 0
    if (slackEnabled.value)
      count++
    if (whatsappEnabled.value)
      count++
    if (emailEnabled.value)
      count++
    if (feishuEnabled.value)
      count++
    if (dingtalkEnabled.value)
      count++
    return count
  })

  const connectedCount = computed(() => {
    return channelStatuses.value.filter(s => s.connected).length
  })

  return {
    // Slack
    slackEnabled,
    slackBotToken,
    slackAppToken,

    // Other channels
    whatsappEnabled,
    emailEnabled,
    feishuEnabled,
    dingtalkEnabled,

    // Runtime
    channelStatuses,

    // Computed
    configured,
    enabledCount,
    connectedCount,
  }
})
