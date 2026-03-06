<script setup lang="ts">
import { TodoPanel } from '@anase/stage-ui/components'
</script>

<template>
  <TodoPanel />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.todo.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.todo.description
  icon: i-solar:checklist-bold-duotone
  settingsEntry: true
  order: 6
  stageTransition:
    name: slide
</route>
