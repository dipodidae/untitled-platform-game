<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="row">
    <label>{{ label }}</label>
    <slot />
  </div>
</template>
