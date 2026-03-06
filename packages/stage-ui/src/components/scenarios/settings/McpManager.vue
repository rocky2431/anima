<script setup lang="ts">
import type { McpServerUiConfig } from '../../../stores/modules/mcp'

import { Button, FieldInput } from '@anase/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMcpModuleStore } from '../../../stores/modules/mcp'

const { t } = useI18n()
const mcpStore = useMcpModuleStore()
const { servers, recommendedServers, connectedCount } = storeToRefs(mcpStore)

const isAddDialogOpen = ref(false)
const editingServer = ref<McpServerUiConfig | null>(null)

const newServerName = ref('')
const newServerTransport = ref<'stdio' | 'sse' | 'http'>('stdio')
const newServerCommand = ref('')
const newServerArgs = ref('')
const newServerUrl = ref('')

const showRecommended = ref(true)

const addedRecommendedIds = computed(() =>
  new Set(servers.value.map(s => s.name)),
)

function resetForm() {
  newServerName.value = ''
  newServerTransport.value = 'stdio'
  newServerCommand.value = ''
  newServerArgs.value = ''
  newServerUrl.value = ''
  editingServer.value = null
}

function handleAdd() {
  if (!newServerName.value.trim())
    return

  if (editingServer.value) {
    mcpStore.updateServer(editingServer.value.id, {
      name: newServerName.value,
      transport: newServerTransport.value,
      command: newServerTransport.value === 'stdio' ? newServerCommand.value : undefined,
      args: newServerTransport.value === 'stdio' ? newServerArgs.value.split(' ').filter(Boolean) : undefined,
      url: newServerTransport.value !== 'stdio' ? newServerUrl.value : undefined,
    })
  }
  else {
    mcpStore.addServer({
      name: newServerName.value,
      transport: newServerTransport.value,
      enabled: true,
      command: newServerTransport.value === 'stdio' ? newServerCommand.value : undefined,
      args: newServerTransport.value === 'stdio' ? newServerArgs.value.split(' ').filter(Boolean) : undefined,
      url: newServerTransport.value !== 'stdio' ? newServerUrl.value : undefined,
    })
  }

  resetForm()
  isAddDialogOpen.value = false
}

function handleEdit(server: McpServerUiConfig) {
  editingServer.value = server
  newServerName.value = server.name
  newServerTransport.value = server.transport
  newServerCommand.value = server.command ?? ''
  newServerArgs.value = (server.args ?? []).join(' ')
  newServerUrl.value = server.url ?? ''
  isAddDialogOpen.value = true
}

function handleDelete(id: string) {
  mcpStore.removeServer(id)
}

function handleAddRecommended(recommendedId: string) {
  mcpStore.addFromRecommended(recommendedId)
}

function getStatusColor(id: string): string {
  const status = mcpStore.getStatus(id)
  if (status === 'connected')
    return 'bg-green-500'
  if (status === 'error')
    return 'bg-red-500'
  return 'bg-neutral-400'
}

function getStatusText(id: string): string {
  const status = mcpStore.getStatus(id)
  if (status === 'connected')
    return t('settings.pages.mcp.status.connected')
  if (status === 'error')
    return t('settings.pages.mcp.status.error')
  return t('settings.pages.mcp.status.disconnected')
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <!-- Header with stats -->
    <div :class="['flex items-center justify-between']">
      <div :class="['flex items-center gap-2']">
        <div :class="['text-sm', 'text-neutral-500']">
          {{ t('settings.pages.mcp.server_count', { count: servers.length }) }}
        </div>
        <div
          v-if="connectedCount > 0"
          :class="['text-xs', 'text-green-600', 'dark:text-green-400']"
        >
          {{ t('settings.pages.mcp.connected_count', { count: connectedCount }) }}
        </div>
      </div>
      <Button @click="isAddDialogOpen = true">
        <div :class="['i-solar:add-circle-bold-duotone', 'text-lg']" />
        {{ t('settings.pages.mcp.add_server') }}
      </Button>
    </div>

    <!-- Server list -->
    <div
      v-if="servers.length > 0"
      :class="['flex flex-col gap-2']"
    >
      <div
        v-for="server in servers"
        :key="server.id"
        :class="[
          'flex items-center justify-between',
          'rounded-lg px-4 py-3',
          'bg-neutral-50 dark:bg-neutral-800',
          'transition-all duration-250',
        ]"
      >
        <div :class="['flex items-center gap-3']">
          <div
            :class="['w-2 h-2 rounded-full', getStatusColor(server.id)]"
          />
          <div>
            <div :class="['text-sm font-medium']">
              {{ server.name }}
            </div>
            <div :class="['text-xs text-neutral-500']">
              {{ server.transport }} · {{ getStatusText(server.id) }}
            </div>
          </div>
        </div>
        <div :class="['flex items-center gap-1']">
          <button
            :class="[
              'p-1.5 rounded-md',
              'text-neutral-500 hover:text-neutral-700',
              'dark:hover:text-neutral-300',
              'transition-colors',
            ]"
            @click="handleEdit(server)"
          >
            <div :class="['i-solar:pen-bold-duotone', 'text-base']" />
          </button>
          <button
            :class="[
              'p-1.5 rounded-md',
              'text-neutral-500 hover:text-red-500',
              'transition-colors',
            ]"
            @click="handleDelete(server.id)"
          >
            <div :class="['i-solar:trash-bin-trash-bold-duotone', 'text-base']" />
          </button>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      :class="[
        'flex flex-col items-center justify-center',
        'py-12 rounded-lg',
        'bg-neutral-50 dark:bg-neutral-800',
        'text-neutral-500',
      ]"
    >
      <div :class="['i-solar:server-bold-duotone', 'text-4xl mb-3 opacity-50']" />
      <div :class="['text-sm']">
        {{ t('settings.pages.mcp.empty') }}
      </div>
    </div>

    <!-- Add/Edit dialog -->
    <div
      v-if="isAddDialogOpen"
      :class="[
        'flex flex-col gap-4',
        'rounded-lg p-4',
        'bg-neutral-100 dark:bg-neutral-900',
        'border border-neutral-200 dark:border-neutral-700',
      ]"
    >
      <div :class="['text-sm font-medium']">
        {{ editingServer ? t('settings.pages.mcp.edit_server') : t('settings.pages.mcp.add_server') }}
      </div>

      <FieldInput
        v-model="newServerName"
        :label="t('settings.pages.mcp.form.name')"
        :placeholder="t('settings.pages.mcp.form.name_placeholder')"
      />

      <div :class="['flex gap-2']">
        <button
          v-for="tp in ['stdio', 'sse', 'http'] as const"
          :key="tp"
          :class="[
            'px-3 py-1.5 rounded-md text-xs',
            'transition-colors',
            newServerTransport === tp
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'bg-neutral-200 dark:bg-neutral-700',
          ]"
          @click="newServerTransport = tp"
        >
          {{ tp.toUpperCase() }}
        </button>
      </div>

      <FieldInput
        v-if="newServerTransport === 'stdio'"
        v-model="newServerCommand"
        :label="t('settings.pages.mcp.form.command')"
        placeholder="npx"
      />

      <FieldInput
        v-if="newServerTransport === 'stdio'"
        v-model="newServerArgs"
        :label="t('settings.pages.mcp.form.args')"
        placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
      />

      <FieldInput
        v-if="newServerTransport !== 'stdio'"
        v-model="newServerUrl"
        :label="t('settings.pages.mcp.form.url')"
        placeholder="https://example.com/mcp"
      />

      <div :class="['flex gap-2 justify-end']">
        <Button
          @click="isAddDialogOpen = false; resetForm()"
        >
          {{ t('settings.pages.mcp.form.cancel') }}
        </Button>
        <Button
          @click="handleAdd"
        >
          {{ editingServer ? t('settings.pages.mcp.form.save') : t('settings.pages.mcp.form.add') }}
        </Button>
      </div>
    </div>

    <!-- Recommended servers -->
    <div :class="['flex flex-col gap-3']">
      <button
        :class="['flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors']"
        @click="showRecommended = !showRecommended"
      >
        <div
          :class="[
            'i-solar:alt-arrow-right-bold-duotone',
            'text-base transition-transform',
            showRecommended ? 'rotate-90' : '',
          ]"
        />
        {{ t('settings.pages.mcp.recommended') }}
      </button>

      <div
        v-if="showRecommended"
        :class="['grid grid-cols-1 gap-2', 'sm:grid-cols-2']"
      >
        <div
          v-for="rec in recommendedServers"
          :key="rec.id"
          :class="[
            'flex items-center justify-between',
            'rounded-lg px-3 py-2.5',
            'bg-neutral-50 dark:bg-neutral-800',
            'transition-all duration-250',
          ]"
        >
          <div :class="['flex-1 min-w-0']">
            <div :class="['flex items-center gap-1.5']">
              <div :class="['text-sm font-medium truncate']">
                {{ rec.name }}
              </div>
              <div
                v-if="rec.official"
                :class="['text-xs text-blue-500']"
              >
                ✓
              </div>
            </div>
            <div :class="['text-xs text-neutral-500 truncate']">
              {{ rec.description }}
            </div>
          </div>
          <button
            :class="[
              'ml-2 p-1.5 rounded-md shrink-0',
              'text-neutral-500 hover:text-neutral-700',
              'dark:hover:text-neutral-300',
              'transition-colors',
              addedRecommendedIds.has(rec.name) ? 'opacity-30 pointer-events-none' : '',
            ]"
            :disabled="addedRecommendedIds.has(rec.name)"
            @click="handleAddRecommended(rec.id)"
          >
            <div :class="['i-solar:add-circle-bold-duotone', 'text-base']" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
