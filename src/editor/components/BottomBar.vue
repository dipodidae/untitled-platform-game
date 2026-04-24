<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'

const store = useEditorStore()

const stats = computed(() => {
  const lv = store.level.value
  return [
    `colliders: ${lv.colliders.length}`,
    `zones: ${lv.zones.length}`,
    `prowlers: ${lv.prowlers.length}`,
    `dummies: ${lv.dummies.length}`,
    `pickups: ${lv.pickups.length}`,
    `world: ${lv.worldWidth}×${lv.worldHeight}`,
  ].join(' · ')
})

// Redo stack displayed in chronological order (most-recently-undone last)
const redoCells = computed(() => store.redoStack.value.slice().reverse())

function jumpUndo(targetIndex: number) {
  // targetIndex is 0-based into undoStack; we need to undo (undoStack.length - targetIndex) steps
  const steps = store.undoStack.value.length - targetIndex
  for (let k = 0; k < steps; k++) store.undo()
}

function jumpRedo(targetIndex: number) {
  // targetIndex is 0-based into redoCells (chronological); redo (targetIndex+1) steps
  for (let k = 0; k <= targetIndex; k++) store.redo()
}
</script>

<template>
  <span>{{ stats }}</span>
  <div class="undo-strip">
    <!-- Past cells (oldest → newest) -->
    <UTooltip
      v-for="(entry, i) in store.undoStack.value"
      :key="`past-${i}`"
      :text="entry.label"
    >
      <div
        class="undo-cell past"
        @click="jumpUndo(i)"
      />
    </UTooltip>
    <!-- Pivot -->
    <div class="undo-cell pivot" title="current state" />
    <!-- Future cells (chronological, i.e. next redo first) -->
    <UTooltip
      v-for="(entry, i) in redoCells"
      :key="`future-${i}`"
      :text="entry.label"
    >
      <div
        class="undo-cell future"
        @click="jumpRedo(i)"
      />
    </UTooltip>
  </div>
</template>
