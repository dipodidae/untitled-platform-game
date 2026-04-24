<script setup lang="ts">
import { useEditorStore } from '../stores/editor'
import ToolStrip from './leftpanel/ToolStrip.vue'
import BrushLibrary from './leftpanel/BrushLibrary.vue'
import type { MaterialName } from '../../world/level'

const store = useEditorStore()

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']
const materialItems = MATERIALS.map(m => ({ label: m, value: m }))
</script>

<template>
  <ToolStrip />
  <BrushLibrary />

  <!-- New Shape Material section -->
  <div class="flex flex-col gap-[6px] p-2 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-1 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      New Shape Material
    </h3>
    <div class="flex gap-[6px] items-center">
      <label class="flex-1 text-[var(--dim)]">material</label>
      <USelect
        v-model="store.createMaterial"
        :items="materialItems"
        size="xs"
        class="flex-[1.4] min-w-0"
      />
    </div>
  </div>
</template>
