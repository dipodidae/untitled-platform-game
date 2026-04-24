<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="flex gap-[6px] items-center">
    <label class="flex-1 text-[var(--dim)] whitespace-nowrap overflow-hidden text-ellipsis">{{ label }}</label>
    <slot />
  </div>
</template>
