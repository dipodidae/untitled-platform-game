<script setup lang="ts">
import { useEditorStore } from '../../stores/editor'
import type { Tool } from '../../brushes'

const store = useEditorStore()

const TOOLS: { id: Tool, label: string, hint: string, icon: string }[] = [
  { id: 'select', label: 'Select', hint: 'V', icon: 'i-mdi-cursor-default' },
  { id: 'polygon', label: 'Polygon', hint: 'P', icon: 'i-mdi-vector-polygon' },
  { id: 'rect', label: 'Rect', hint: 'R', icon: 'i-mdi-rectangle-outline' },
  { id: 'zone', label: 'Zone', hint: '', icon: 'i-mdi-shape-rectangle-plus' },
  { id: 'spawn', label: 'Spawn', hint: '', icon: 'i-mdi-flag' },
  { id: 'prowler', label: 'Prowler', hint: '', icon: 'i-mdi-spider' },
  { id: 'dummy', label: 'Dummy', hint: '', icon: 'i-mdi-target' },
  { id: 'pickup', label: 'Pickup', hint: '', icon: 'i-mdi-diamond-stone' },
]

function setTool(t: Tool) {
  store.tool = t
  store.polyBuffer = null
}
</script>

<template>
  <div class="flex flex-col gap-[6px] p-2 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-1 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      Tools
    </h3>
    <div class="flex gap-1 flex-wrap">
      <UButton
        v-for="t in TOOLS"
        :key="t.id"
        :color="store.tool === t.id ? 'primary' : 'neutral'"
        :variant="store.tool === t.id ? 'solid' : 'ghost'"
        :icon="t.icon"
        :label="t.hint ? `${t.label} (${t.hint})` : t.label"
        :title="t.hint ? `${t.label} — shortcut ${t.hint}` : t.label"
        size="xs"
        class="flex-1 min-w-[72px]"
        @click="setTool(t.id)"
      />
    </div>
  </div>
</template>
