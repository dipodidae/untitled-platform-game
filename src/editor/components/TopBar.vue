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
  <a href="./" class="flex items-center gap-1 px-2 py-1 rounded text-[var(--text)] no-underline hover:bg-[var(--border)]">
    <UIcon name="i-mdi-play-circle-outline" class="text-[var(--accent)]" />
    <span>playtest</span>
  </a>
</template>
