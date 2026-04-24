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
  <div class="section">
    <h3>New Shape Material</h3>
    <div class="row">
      <label>material</label>
      <USelect
        v-model="store.createMaterial"
        :items="materialItems"
        size="xs"
        class="flex-[1.4] min-w-0"
      />
    </div>
  </div>
</template>
