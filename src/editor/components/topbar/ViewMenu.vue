<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'

const store = useEditorStore()

const LAYER_LABELS: [keyof typeof store.layers, string][] = [
  ['colliders', 'Colliders'],
  ['zones', 'Zones'],
  ['wind', 'Wind arrows'],
  ['paths', 'Kinetic paths'],
  ['enemyRanges', 'Enemy ranges'],
  ['entityLabels', 'Entity labels'],
  ['grid', 'Grid'],
]

// Pinia setup-store fields are auto-unwrapped, so `store.layers` is the layers
// record (not a Ref). Items are wrapped in a computed so the `checked` flag
// stays reactive after toggles.
const viewMenuItems = computed(() => LAYER_LABELS.map(([key, label]) => ({
  label,
  type: 'checkbox' as const,
  checked: store.layers[key],
  onUpdateChecked: (v: boolean) => { store.layers[key] = v },
})))
</script>

<template>
  <UDropdownMenu :items="[viewMenuItems]">
    <UButton color="neutral" variant="ghost" icon="i-mdi-eye-outline" label="View" size="xs" />
  </UDropdownMenu>
</template>
