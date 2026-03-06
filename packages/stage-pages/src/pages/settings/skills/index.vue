<script setup lang="ts">
import { SkillsManager } from '@anase/stage-ui/components'
</script>

<template>
  <SkillsManager />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.skills.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.skills.description
  icon: i-solar:magic-stick-3-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
</route>
