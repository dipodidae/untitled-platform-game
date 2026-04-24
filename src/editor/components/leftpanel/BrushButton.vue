<script setup lang="ts">
import type { Brush } from '../../brushes'

const props = defineProps<{ brush: Brush }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    class="brush-btn"
    :class="{ preview: !props.brush.live }"
    :title="props.brush.summary + (props.brush.live ? '' : ' (editor-only, runtime TODO)')"
    @click="emit('click')"
  >
    <!-- Convert 'mdi:icon-name' → 'i-mdi-icon-name' for UIcon -->
    <UIcon :name="props.brush.icon.replace(':', '-').replace(/^/, 'i-')" class="text-[var(--bronze-accent)] text-sm flex-shrink-0" />
    <span>{{ props.brush.label }}{{ props.brush.live ? '' : ' *' }}</span>
  </button>
</template>
