<script setup lang="ts">
import type { MaterialName } from '../../../world/level'
import type { Tool } from '../../brushes'
import { BRUSH_CATEGORY_LABEL, BRUSHES } from '../../brushes'
import { useEditorStore } from '../../stores/editor'
import BrushButton from './BrushButton.vue'

const store = useEditorStore()
const toast = useToast()

// Group brushes by category
const brushesByCategory = (() => {
  const cats = new Map<string, typeof BRUSHES>()
  for (const b of BRUSHES) {
    if (!cats.has(b.category))
      cats.set(b.category, [])
    cats.get(b.category)!.push(b)
  }
  return cats
})()

function applyBrush(brush: typeof BRUSHES[number]) {
  if (!brush.live)
    toast.add({ title: `${brush.label}: no runtime effect yet`, icon: 'i-mdi-alert', color: 'warning' })

  // Build a slim BrushTarget adapter — only the four fields brushes ever touch.
  // Pinia setup-store fields are auto-unwrapped at the store boundary, so we
  // read/write `store.x` directly (no `.value`).
  const adapter = {
    get tool() { return store.tool },
    set tool(t: Tool) { store.tool = t },
    get createMaterial() { return store.createMaterial },
    set createMaterial(m: MaterialName) { store.createMaterial = m },
    get pendingPreset() { return store.pendingPreset },
    set pendingPreset(p) { store.pendingPreset = p },
    get pendingZone() { return store.pendingZone },
    set pendingZone(z) { store.pendingZone = z },
    get pendingPickupKind() { return store.pendingPickupKind },
    set pendingPickupKind(k) { store.pendingPickupKind = k },
  }

  brush.apply(adapter)
}
</script>

<template>
  <div class="flex flex-col gap-2 p-3 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-0.5 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      Brushes
    </h3>
    <template v-for="[cat, list] in brushesByCategory" :key="cat">
      <div class="mt-2 mb-0.5 font-[inherit] text-[var(--dim)] text-[10px] uppercase tracking-[0.1em] font-semibold">
        {{ BRUSH_CATEGORY_LABEL[cat as keyof typeof BRUSH_CATEGORY_LABEL] }}
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        <BrushButton
          v-for="b in list"
          :key="b.id"
          :brush="b"
          @click="applyBrush(b)"
        />
      </div>
    </template>
    <div class="text-[var(--dim)] text-[10px] leading-[1.4] mt-1 opacity-70">
      * = editor-only (no runtime yet)
    </div>
  </div>
</template>
