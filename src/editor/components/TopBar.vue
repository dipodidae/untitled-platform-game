<script setup lang="ts">
import FileMenu from './topbar/FileMenu.vue'
import ViewMenu from './topbar/ViewMenu.vue'
import PresetSelect from './topbar/PresetSelect.vue'
</script>

<template>
  <FileMenu />
  <ViewMenu />
  <PresetSelect />

  <div class="flex-1" />

  <!-- Playtest link -->
  <a href="./" class="flex items-center gap-1 text-[var(--dim)] no-underline hover:text-[var(--text)]">
    <UIcon name="i-mdi-play-circle-outline" />
    <span>playtest</span>
  </a>
</template>
