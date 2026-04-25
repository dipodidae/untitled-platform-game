<script setup lang="ts">
import { useEditorStore } from '../../stores/editor'
import LabeledRow from '../shared/LabeledRow.vue'

const store = useEditorStore()
</script>

<template>
  <!-- World Size -->
  <div class="flex flex-col gap-2 p-3 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-0.5 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      World Size
    </h3>
    <LabeledRow label="width">
      <UInput v-model.number="store.level.worldWidth" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="height">
      <UInput v-model.number="store.level.worldHeight" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
  </div>

  <!-- Grid / Snap -->
  <div class="flex flex-col gap-2 p-3 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-0.5 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      Grid / Snap
    </h3>
    <LabeledRow label="snap px">
      <UInput v-model.number="store.snapStep" type="number" min="0" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <div class="text-[var(--dim)] text-[11px] leading-[1.4]">
      0 = off
    </div>
  </div>
</template>
