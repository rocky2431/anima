<script setup lang="ts">
import { MemoryManager } from '@proj-airi/stage-ui/components'
</script>

<template>
  <MemoryManager />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:brain-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
