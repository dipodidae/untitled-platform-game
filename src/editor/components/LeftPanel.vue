<script setup lang="ts">
import { ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import { BRUSH_CATEGORY_LABEL, BRUSHES } from '../brushes'
import type { Tool } from '../stores/editor'
import type { MaterialName } from '../../world/level'

const store = useEditorStore()

// Toast state (local — panels are isolated)
const toastMsg = ref('')
const toastKind = ref<'err' | ''>('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string, kind: 'err' | '' = '') {
  toastMsg.value = msg
  toastKind.value = kind
  toastVisible.value = true
  if (toastTimer)
    clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 2400)
}

const TOOLS: { id: Tool, label: string, hint: string, icon: string }[] = [
  { id: 'select', label: 'Select', hint: 'V', icon: 'mdi:cursor-default' },
  { id: 'polygon', label: 'Polygon', hint: 'P', icon: 'mdi:vector-polygon' },
  { id: 'rect', label: 'Rect', hint: 'R', icon: 'mdi:rectangle-outline' },
  { id: 'zone', label: 'Zone', hint: '', icon: 'mdi:shape-rectangle-plus' },
  { id: 'spawn', label: 'Spawn', hint: '', icon: 'mdi:flag' },
  { id: 'prowler', label: 'Prowler', hint: '', icon: 'mdi:spider' },
  { id: 'dummy', label: 'Dummy', hint: '', icon: 'mdi:target' },
  { id: 'pickup', label: 'Pickup', hint: '', icon: 'mdi:diamond-stone' },
]

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']

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
    showToast(`${brush.label}: no runtime effect yet`, 'err')

  // Build an adapter that the brush.apply function can mutate
  const adapter = {
    get tool() { return store.tool.value },
    set tool(t: Tool) { store.tool.value = t },
    get createMaterial() { return store.createMaterial.value },
    set createMaterial(m: MaterialName) { store.createMaterial.value = m },
    get pendingPreset() { return store.pendingPreset.value },
    set pendingPreset(p) { store.pendingPreset.value = p },
    get pendingZone() { return store.pendingZone.value },
    set pendingZone(z) { store.pendingZone.value = z },
    // Unused fields from EditorState but needed for type compatibility
    selection: null as never,
    camera: null as never,
    snap: 0,
    polyBuffer: null as never,
    undoStack: [] as never,
    redoStack: [] as never,
    activeFileHandle: null as never,
    activeFileName: null as never,
    activePresetName: null as never,
    layers: null as never,
    listeners: null as never,
    level: null as never,
  }

  brush.apply(adapter)
}
</script>

<template>
  <!-- Toast -->
  <div class="editor-toast" :class="{ visible: toastVisible }" :data-kind="toastKind || undefined" style="position:fixed;top:12px;right:12px;z-index:200;">
    {{ toastMsg }}
  </div>

  <!-- Tools section -->
  <div class="section">
    <h3>Tools</h3>
    <div class="button-row">
      <button
        v-for="t in TOOLS"
        :key="t.id"
        :class="{ active: store.tool.value === t.id }"
        :title="t.hint ? `${t.label} — shortcut ${t.hint}` : t.label"
        @click="setTool(t.id)"
      >
        <iconify-icon :icon="t.icon" />
        <span>{{ t.hint ? `${t.label} (${t.hint})` : t.label }}</span>
      </button>
    </div>
  </div>

  <!-- Brushes section -->
  <div class="section">
    <h3>Brushes</h3>
    <template v-for="[cat, list] in brushesByCategory" :key="cat">
      <div class="mono" style="margin-top:4px;">
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
          <iconify-icon :icon="b.icon" />
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
      <select v-model="store.createMaterial.value">
        <option v-for="m in MATERIALS" :key="m" :value="m">
          {{ m }}
        </option>
      </select>
    </div>
  </div>
</template>
