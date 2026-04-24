<script setup lang="ts">
import { useEditorStore } from '../../stores/editor'
import LabeledRow from '../shared/LabeledRow.vue'

const store = useEditorStore()
</script>

<template>
  <!-- World Size -->
  <div class="section">
    <h3>World Size</h3>
    <LabeledRow label="worldWidth">
      <UInput v-model.number="store.level.worldWidth" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="worldHeight">
      <UInput v-model.number="store.level.worldHeight" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
  </div>

  <!-- Grid / Snap -->
  <div class="section">
    <h3>Grid / Snap</h3>
    <LabeledRow label="snap (px)">
      <UInput v-model.number="store.snapStep" type="number" min="0" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <div class="hint">
      0 = off
    </div>
  </div>
</template>
