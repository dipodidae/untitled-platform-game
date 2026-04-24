<script setup lang="ts">
import type { Brush } from '../../brushes'

const props = defineProps<{ brush: Brush }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <button
    :class="[
      'bg-[var(--bronze-bg)] text-[var(--bronze-text)] border border-[var(--bronze-border)]',
      'hover:bg-[var(--bronze-bg-hover)] hover:border-[var(--bronze-accent)]',
      'min-w-0 px-2 py-1.5 text-xs whitespace-nowrap',
      'inline-flex items-center gap-1 rounded cursor-pointer font-[inherit]',
      'overflow-hidden text-ellipsis',
      !props.brush.live && 'opacity-55',
    ]"
    :title="props.brush.summary + (props.brush.live ? '' : ' (editor-only, runtime TODO)')"
    @click="emit('click')"
  >
    <!-- Convert 'mdi:icon-name' → 'i-mdi-icon-name' for UIcon -->
    <UIcon
      :name="props.brush.icon.replace(':', '-').replace(/^/, 'i-')"
      :class="['flex-shrink-0 text-base', props.brush.live ? 'text-[var(--bronze-accent)]' : 'text-[var(--dim)]']"
    />
    <span>{{ props.brush.label }}{{ props.brush.live ? '' : ' *' }}</span>
  </button>
</template>
