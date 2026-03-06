<script setup lang="ts">
import { useActivityModuleStore } from '@anase/stage-ui/stores/modules/activity'
import { useDesktopShellStore } from '@anase/stage-ui/stores/modules/desktop-shell'
import { FieldCheckbox, FieldRange } from '@anase/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const store = useDesktopShellStore()
const activityStore = useActivityModuleStore()
const { summaryStatus, highlights: summaryHighlights } = storeToRefs(activityStore)
const {
  windowPollingEnabled,
  windowPollingIntervalMs,
  clipboardMonitoringEnabled,
  shortcutsEnabled,
  currentAppName,
  currentWindowTitle,
  lastActivityTimestamp,
} = storeToRefs(store)

onMounted(() => {
  store.initialize()
})

onUnmounted(() => {
  store.dispose()
})

const pollingIntervalSeconds = computed({
  get: () => windowPollingIntervalMs.value / 1000,
  set: (val: number) => { windowPollingIntervalMs.value = val * 1000 },
})

const lastActivityFormatted = computed(() => {
  if (!lastActivityTimestamp.value)
    return t('settings.pages.modules.desktop-shell.no_data')
  const diff = Date.now() - lastActivityTimestamp.value
  if (diff < 60000)
    return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000)
    return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
})

const shortcuts = computed(() => [
  { key: 'Cmd+Shift+A', action: t('settings.pages.modules.desktop-shell.shortcuts.toggle_panel') },
  { key: 'Cmd+Shift+V', action: t('settings.pages.modules.desktop-shell.shortcuts.quick_voice') },
  { key: 'Cmd+Shift+C', action: t('settings.pages.modules.desktop-shell.shortcuts.send_clipboard') },
  { key: 'Cmd+Shift+L', action: t('settings.pages.modules.desktop-shell.shortcuts.lock_screen') },
])
</script>

<template>
  <div flex="~ col md:row gap-6">
    <!-- Left: Settings -->
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[45%]">
      <!-- Window Polling -->
      <FieldCheckbox
        v-model="windowPollingEnabled"
        :label="$t('settings.pages.modules.desktop-shell.window_polling')"
        :description="$t('settings.pages.modules.desktop-shell.window_polling_desc')"
      />

      <template v-if="windowPollingEnabled">
        <FieldRange
          v-model="pollingIntervalSeconds"
          :label="$t('settings.pages.modules.desktop-shell.polling_interval')"
          :description="$t('settings.pages.modules.desktop-shell.polling_interval_desc')"
          :min="5"
          :max="60"
          :step="5"
          :format-value="(v: number) => `${v}s`"
        />
      </template>

      <!-- Clipboard -->
      <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <FieldCheckbox
          v-model="clipboardMonitoringEnabled"
          :label="$t('settings.pages.modules.desktop-shell.clipboard_monitoring')"
          :description="$t('settings.pages.modules.desktop-shell.clipboard_monitoring_desc')"
        />
      </div>

      <!-- Shortcuts -->
      <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <FieldCheckbox
          v-model="shortcutsEnabled"
          :label="$t('settings.pages.modules.desktop-shell.global_shortcuts')"
          :description="$t('settings.pages.modules.desktop-shell.global_shortcuts_desc')"
        />

        <div v-if="shortcutsEnabled" class="mt-3 space-y-2">
          <div
            v-for="shortcut in shortcuts"
            :key="shortcut.key"
            class="flex items-center justify-between rounded-lg bg-white px-3 py-2 dark:bg-neutral-800/50"
          >
            <span class="text-sm text-neutral-600 dark:text-neutral-400">{{ shortcut.action }}</span>
            <code class="rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700 font-mono dark:bg-neutral-700 dark:text-neutral-300">
              {{ shortcut.key }}
            </code>
          </div>
        </div>
      </div>

      <!-- Privacy notice -->
      <div class="border border-amber-200 rounded-lg bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
        <div class="flex items-start gap-2 text-amber-700 dark:text-amber-400">
          <div i-solar:shield-warning-bold-duotone class="mt-0.5 flex-shrink-0 text-lg" />
          <div class="text-xs">
            <span class="font-medium">{{ $t('settings.pages.modules.desktop-shell.privacy_title') }}</span> {{ $t('settings.pages.modules.desktop-shell.privacy_text') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Status -->
    <div flex="~ col gap-4" class="w-full md:w-[55%]">
      <div w-full rounded-xl bg="neutral-50 dark:[rgba(0,0,0,0.3)]" p-4 flex="~ col gap-4">
        <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
          {{ $t('settings.pages.modules.desktop-shell.desktop_status') }}
        </h2>

        <!-- Current window -->
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <div
              class="h-3 w-3 rounded-full"
              :class="currentAppName ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-neutral-300 dark:bg-neutral-600'"
            />
            <span class="text-sm font-medium">
              {{ currentAppName ? $t('settings.pages.modules.desktop-shell.tracking_active') : $t('settings.pages.modules.desktop-shell.waiting_for_data') }}
            </span>
          </div>

          <div v-if="currentAppName" class="rounded-lg bg-white p-3 dark:bg-neutral-800/50">
            <div class="mb-1 text-xs text-neutral-400 dark:text-neutral-500">
              {{ $t('settings.pages.modules.desktop-shell.current_window') }}
            </div>
            <div class="text-sm font-medium">
              {{ currentAppName }}
            </div>
            <div class="mt-0.5 truncate text-xs text-neutral-500">
              {{ currentWindowTitle }}
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div i-solar:clock-circle-line-duotone class="text-lg text-neutral-400" />
            <span class="text-sm">{{ $t('settings.pages.modules.desktop-shell.last_update') }} <span class="font-medium">{{ lastActivityFormatted }}</span></span>
          </div>
        </div>

        <!-- Feature status -->
        <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h3 class="mb-3 text-sm text-neutral-500 font-medium dark:text-neutral-400">
            {{ $t('settings.pages.modules.desktop-shell.feature_status') }}
          </h3>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg bg-white p-3 text-center dark:bg-neutral-800/50">
              <div
                class="mx-auto mb-1 text-xl"
                :class="windowPollingEnabled ? 'i-solar:monitor-bold-duotone text-green-500' : 'i-solar:monitor-line-duotone text-neutral-400'"
              />
              <div class="text-xs text-neutral-500">
                {{ $t('settings.pages.modules.desktop-shell.feature_window') }}
              </div>
            </div>
            <div class="rounded-lg bg-white p-3 text-center dark:bg-neutral-800/50">
              <div
                class="mx-auto mb-1 text-xl"
                :class="clipboardMonitoringEnabled ? 'i-solar:clipboard-bold-duotone text-green-500' : 'i-solar:clipboard-line-duotone text-neutral-400'"
              />
              <div class="text-xs text-neutral-500">
                {{ $t('settings.pages.modules.desktop-shell.feature_clipboard') }}
              </div>
            </div>
            <div class="rounded-lg bg-white p-3 text-center dark:bg-neutral-800/50">
              <div
                class="mx-auto mb-1 text-xl"
                :class="shortcutsEnabled ? 'i-solar:keyboard-bold-duotone text-green-500' : 'i-solar:keyboard-line-duotone text-neutral-400'"
              />
              <div class="text-xs text-neutral-500">
                {{ $t('settings.pages.modules.desktop-shell.feature_shortcuts') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Activity Summary -->
        <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h3 class="mb-3 text-sm text-neutral-500 font-medium dark:text-neutral-400">
            {{ $t('settings.pages.modules.desktop-shell.activity_summary') }}
          </h3>
          <button
            type="button"
            :disabled="summaryStatus === 'running'"
            class="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200"
            :class="[
              summaryStatus === 'running'
                ? 'bg-neutral-200 text-neutral-400 dark:bg-neutral-700 dark:text-neutral-500 cursor-not-allowed'
                : 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 cursor-pointer',
            ]"
            @click="activityStore.triggerSummary()"
          >
            <div v-if="summaryStatus === 'running'" class="animate-spin">
              <div i-solar:spinner-line-duotone />
            </div>
            <div v-else i-solar:document-text-bold-duotone />
            {{ summaryStatus === 'running'
              ? $t('settings.pages.modules.desktop-shell.generating_summary')
              : $t('settings.pages.modules.desktop-shell.generate_summary')
            }}
          </button>

          <!-- Summary highlights -->
          <div v-if="summaryHighlights.length > 0" class="mt-3 space-y-1">
            <div
              v-for="(highlight, idx) in summaryHighlights"
              :key="idx"
              class="rounded-lg bg-white px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400"
            >
              {{ highlight }}
            </div>
          </div>
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
    <div text="60" i-solar:monitor-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.desktop-shell.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
