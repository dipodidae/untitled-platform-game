<script setup lang="ts">
import { useEditorStore } from '../stores/editor'
import { BRUSH_CATEGORY_LABEL, BRUSHES } from '../brushes'
import type { Tool } from '../brushes'
import type { MaterialName } from '../../world/level'

const store = useEditorStore()
const toast = useToast()

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

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']
const materialItems = MATERIALS.map(m => ({ label: m, value: m }))

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

function setTool(t: Tool) {
  store.tool.value = t
  store.polyBuffer.value = null
}

function applyBrush(brush: typeof BRUSHES[number]) {
  if (!brush.live)
    toast.add({ title: `${brush.label}: no runtime effect yet`, icon: 'i-mdi-alert', color: 'warning' })

  // Build a slim BrushTarget adapter — only the four fields brushes ever touch.
  const adapter = {
    get tool() { return store.tool.value },
    set tool(t: Tool) { store.tool.value = t },
    get createMaterial() { return store.createMaterial.value },
    set createMaterial(m: MaterialName) { store.createMaterial.value = m },
    get pendingPreset() { return store.pendingPreset.value },
    set pendingPreset(p) { store.pendingPreset.value = p },
    get pendingZone() { return store.pendingZone.value },
    set pendingZone(z) { store.pendingZone.value = z },
  }

  brush.apply(adapter)
}
</script>

<template>
  <!-- Tools section -->
  <div class="section">
    <h3>Tools</h3>
    <div class="button-row">
      <UButton
        v-for="t in TOOLS"
        :key="t.id"
        :color="store.tool.value === t.id ? 'primary' : 'neutral'"
        :variant="store.tool.value === t.id ? 'solid' : 'ghost'"
        :icon="t.icon"
        :label="t.hint ? `${t.label} (${t.hint})` : t.label"
        :title="t.hint ? `${t.label} — shortcut ${t.hint}` : t.label"
        size="xs"
        class="flex-1 min-w-[72px]"
        @click="setTool(t.id)"
      />
    </div>
  </div>

  <!-- Brushes section -->
  <div class="section">
    <h3>Brushes</h3>
    <template v-for="[cat, list] in brushesByCategory" :key="cat">
      <div class="mono mt-1">
        {{ BRUSH_CATEGORY_LABEL[cat as keyof typeof BRUSH_CATEGORY_LABEL] }}
      </div>
      <div class="button-row">
        <button
          v-for="b in list"
          :key="b.id"
          class="brush-btn"
          :class="{ preview: !b.live }"
          :title="b.summary + (b.live ? '' : ' (editor-only, runtime TODO)')"
          @click="applyBrush(b)"
        >
          <!-- Convert 'mdi:icon-name' → 'i-mdi-icon-name' for UIcon -->
          <UIcon :name="b.icon.replace(':', '-').replace(/^/, 'i-')" class="text-[var(--bronze-accent)] text-sm flex-shrink-0" />
          <span>{{ b.label }}{{ b.live ? '' : ' *' }}</span>
        </button>
      </div>
    </template>
    <div class="hint">
      * = editor-only (no runtime yet)
    </div>
  </div>

  <!-- New Shape Material section -->
  <div class="section">
    <h3>New Shape Material</h3>
    <div class="row">
      <label>material</label>
      <USelect
        v-model="store.createMaterial.value"
        :items="materialItems"
        size="xs"
        class="flex-[1.4] min-w-0"
      />
    </div>
  </div>
</template>
