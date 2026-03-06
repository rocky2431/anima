<script setup lang="ts">
import { useChannelsStore } from '@anase/stage-ui/stores/modules/channels'
import { FieldCheckbox } from '@anase/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const store = useChannelsStore()
const {
  slackEnabled,
  slackBotToken,
  slackAppToken,
  whatsappEnabled,
  emailEnabled,
  feishuEnabled,
  dingtalkEnabled,
  enabledCount,
  connectedCount,
} = storeToRefs(store)

interface ChannelInfo {
  id: string
  name: string
  icon: string
  iconColor: string
  enabled: boolean
  description: string
  envHint: string
}

const channels = computed<ChannelInfo[]>(() => [
  {
    id: 'slack',
    name: 'Slack',
    icon: 'i-simple-icons:slack',
    iconColor: 'text-[#4A154B]',
    enabled: slackEnabled.value,
    description: t('settings.pages.modules.channels.slack.description'),
    envHint: 'ANASE_SLACK_BOT_TOKEN + ANASE_SLACK_APP_TOKEN',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: 'i-simple-icons:whatsapp',
    iconColor: 'text-[#25D366]',
    enabled: whatsappEnabled.value,
    description: t('settings.pages.modules.channels.whatsapp.description'),
    envHint: t('settings.pages.modules.channels.whatsapp.env_hint'),
  },
  {
    id: 'email',
    name: 'Email',
    icon: 'i-solar:letter-bold-duotone',
    iconColor: 'text-blue-500',
    enabled: emailEnabled.value,
    description: t('settings.pages.modules.channels.email.description'),
    envHint: 'ANASE_EMAIL_IMAP_HOST + ANASE_EMAIL_SMTP_HOST',
  },
  {
    id: 'feishu',
    name: 'Feishu',
    icon: 'i-simple-icons:lark',
    iconColor: 'text-blue-600',
    enabled: feishuEnabled.value,
    description: t('settings.pages.modules.channels.feishu.description'),
    envHint: 'ANASE_FEISHU_APP_ID + ANASE_FEISHU_APP_SECRET',
  },
  {
    id: 'dingtalk',
    name: 'DingTalk',
    icon: 'i-simple-icons:dingtalk',
    iconColor: 'text-blue-500',
    enabled: dingtalkEnabled.value,
    description: t('settings.pages.modules.channels.dingtalk.description'),
    envHint: 'ANASE_DINGTALK_APP_KEY + ANASE_DINGTALK_APP_SECRET',
  },
])
</script>

<template>
  <!-- Stats header -->
  <div bg="neutral-50 dark:[rgba(0,0,0,0.3)]" flex="~ col gap-4" mb-4 rounded-xl p-4>
    <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
      {{ $t('settings.pages.modules.channels.messaging_channels') }}
    </h2>
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50">
        <div class="i-solar:chat-round-dots-bold-duotone text-lg" />
        <span class="text-sm font-medium">{{ $t('settings.pages.modules.channels.enabled_count', { count: enabledCount }) }}</span>
      </div>
      <div class="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50">
        <div
          class="h-2 w-2 rounded-full"
          :class="connectedCount > 0 ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-600'"
        />
        <span class="text-sm font-medium">{{ $t('settings.pages.modules.channels.connected_count', { count: connectedCount }) }}</span>
      </div>
    </div>
  </div>

  <!-- Info banner -->
  <div bg="primary-500/10 dark:primary-800/25" mb-4 rounded-lg p-4>
    <div class="flex items-start gap-3">
      <div i-solar:info-circle-bold-duotone class="mt-0.5 flex-shrink-0 text-xl text-primary-600 dark:text-primary-400" />
      <div>
        <div class="text-sm text-primary-800 font-medium dark:text-primary-200">
          {{ $t('settings.pages.modules.channels.config_title') }}
        </div>
        <div class="mt-1 text-xs text-primary-700 dark:text-primary-300">
          {{ $t('settings.pages.modules.channels.config_desc') }}
        </div>
      </div>
    </div>
  </div>

  <!-- Channel cards -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div
      v-for="channel in channels"
      :key="channel.id"
      bg="neutral-50 dark:[rgba(0,0,0,0.3)]"
      class="rounded-xl p-4"
    >
      <div class="mb-3 flex items-center gap-3">
        <div
          :class="[channel.icon, channel.iconColor]"
          class="text-2xl"
        />
        <div>
          <h3 class="text-sm font-semibold">
            {{ channel.name }}
          </h3>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ channel.description }}
          </p>
        </div>
      </div>

      <!-- Slack specific config -->
      <template v-if="channel.id === 'slack'">
        <FieldCheckbox
          v-model="slackEnabled"
          :label="$t('settings.pages.modules.channels.slack.enable')"
          :description="$t('settings.pages.modules.channels.slack.enable_desc')"
        />
        <template v-if="slackEnabled">
          <div class="mt-3 space-y-2">
            <div>
              <label class="mb-1 block text-xs text-neutral-500 font-medium">{{ $t('settings.pages.modules.channels.slack.bot_token') }}</label>
              <input
                v-model="slackBotToken"
                type="password"
                class="w-full border border-neutral-300 rounded bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                placeholder="xoxb-..."
              >
            </div>
            <div>
              <label class="mb-1 block text-xs text-neutral-500 font-medium">{{ $t('settings.pages.modules.channels.slack.app_token') }}</label>
              <input
                v-model="slackAppToken"
                type="password"
                class="w-full border border-neutral-300 rounded bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                placeholder="xapp-..."
              >
            </div>
          </div>
        </template>
      </template>

      <!-- WhatsApp -->
      <template v-else-if="channel.id === 'whatsapp'">
        <FieldCheckbox
          v-model="whatsappEnabled"
          :label="$t('settings.pages.modules.channels.whatsapp.enable')"
          :description="$t('settings.pages.modules.channels.whatsapp.enable_desc')"
        />
      </template>

      <!-- Email -->
      <template v-else-if="channel.id === 'email'">
        <FieldCheckbox
          v-model="emailEnabled"
          :label="$t('settings.pages.modules.channels.email.enable')"
          :description="$t('settings.pages.modules.channels.email.enable_desc')"
        />
      </template>

      <!-- Feishu -->
      <template v-else-if="channel.id === 'feishu'">
        <FieldCheckbox
          v-model="feishuEnabled"
          :label="$t('settings.pages.modules.channels.feishu.enable')"
          :description="$t('settings.pages.modules.channels.feishu.enable_desc')"
        />
      </template>

      <!-- DingTalk -->
      <template v-else-if="channel.id === 'dingtalk'">
        <FieldCheckbox
          v-model="dingtalkEnabled"
          :label="$t('settings.pages.modules.channels.dingtalk.enable')"
          :description="$t('settings.pages.modules.channels.dingtalk.enable_desc')"
        />
      </template>

      <!-- Env hint -->
      <div class="mt-3 border-t border-neutral-200 pt-2 dark:border-neutral-700">
        <div class="flex items-center gap-1.5 text-xs text-neutral-400">
          <div class="i-solar:key-line-duotone text-sm" />
          <code class="font-mono">{{ channel.envHint }}</code>
        </div>
      </div>
    </div>
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:chat-round-dots-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.channels.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
