<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'

const store = useEditorStore()

const stats = computed(() => {
  const lv = store.level
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
const redoCells = computed(() => store.redoStack.slice().reverse())

function jumpUndo(targetIndex: number) {
  // targetIndex is 0-based into undoStack; we need to undo (undoStack.length - targetIndex) steps
  const steps = store.undoStack.length - targetIndex
  for (let k = 0; k < steps; k++) store.undo()
}

function jumpRedo(targetIndex: number) {
  // targetIndex is 0-based into redoCells (chronological); redo (targetIndex+1) steps
  for (let k = 0; k <= targetIndex; k++) store.redo()
}
</script>

<template>
  <span>{{ stats }}</span>
  <!-- Undo strip: a row of 8×14 px cells representing the undo/redo history -->
  <div class="flex gap-[2px] ml-4 flex-1 max-w-[50%] overflow-hidden">
    <!-- Past cells (oldest → newest) -->
    <UTooltip
      v-for="(entry, i) in store.undoStack"
      :key="`past-${i}`"
      :text="entry.label"
    >
      <div
        class="w-2 h-[14px] rounded-sm cursor-pointer shrink-0 bg-[var(--border)] hover:bg-[var(--dim)]"
        @click="jumpUndo(i)"
      />
    </UTooltip>
    <!-- Pivot -->
    <div class="w-2 h-[14px] rounded-sm shrink-0 bg-[var(--accent)]" title="current state" />
    <!-- Future cells (chronological, i.e. next redo first) -->
    <UTooltip
      v-for="(entry, i) in redoCells"
      :key="`future-${i}`"
      :text="entry.label"
    >
      <div
        class="w-2 h-[14px] rounded-sm cursor-pointer shrink-0 bg-[var(--panel-2)] border border-[var(--border)] hover:bg-[var(--border)]"
        @click="jumpRedo(i)"
      />
    </UTooltip>
  </div>
</template>
