<script setup lang="ts">
import { ActivityTimeline } from '@anase/stage-ui/components'
</script>

<template>
  <ActivityTimeline />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.activity.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.activity.description
  icon: i-solar:chart-bold-duotone
  settingsEntry: true
  order: 7
  stageTransition:
    name: slide
</route>
