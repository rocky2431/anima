<script setup lang="ts">
import { McpServer } from '@anase/stage-ui/components'
</script>

<template>
  <McpServer />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.mcp-server.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
