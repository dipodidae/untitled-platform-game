<script setup lang="ts">
import { ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import { listLevels, loadLevel } from '../../session/levelManager'
import type { LevelJson } from '../../world/level'

const store = useEditorStore()

// Toast state
const toastMsg = ref('')
const toastKind = ref<'ok' | 'err' | ''>('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string, kind: 'ok' | 'err' | '' = '') {
  toastMsg.value = msg
  toastKind.value = kind
  toastVisible.value = true
  if (toastTimer)
    clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 2400)
}

// File menu
const fileOpen = ref(false)
const viewOpen = ref(false)

function closeAllMenus() {
  fileOpen.value = false
  viewOpen.value = false
}

function onDocClick(e: MouseEvent) {
  const target = e.target as Node
  const fileMenu = document.getElementById('vue-file-menu')
  const viewMenu = document.getElementById('vue-view-menu')
  if (fileMenu && !fileMenu.contains(target))
    fileOpen.value = false
  if (viewMenu && !viewMenu.contains(target))
    viewOpen.value = false
}

// Mount/unmount click-outside listener
import { onMounted, onUnmounted } from 'vue'

onMounted(() => document.addEventListener('click', onDocClick, true))
onUnmounted(() => document.removeEventListener('click', onDocClick, true))

// File actions
function newBlank() {
  if (!confirm('Clear the current level and start blank?'))
    return
  store.loadFromJson({
    spawn: { x: 80, y: 300 },
    worldWidth: 3200,
    worldHeight: 720,
    colliders: [{ id: 1, material: 'bone', vertices: [[0, 500], [3200, 500], [3200, 600], [0, 600]] }],
  })
  store.activeFileHandle.value = null
  store.activeFileName.value = null
  store.activePresetName.value = null
  closeAllMenus()
}

async function openFile() {
  closeAllMenus()
  const w = window as unknown as { showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]> }
  if (typeof w.showOpenFilePicker !== 'function') {
    openFallback()
    return
  }
  try {
    const [handle] = await w.showOpenFilePicker({
      types: [{ description: 'Level JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    })
    if (!handle)
      return
    store.activeFileHandle.value = handle
    store.activeFileName.value = handle.name
    store.activePresetName.value = null
    const file = await handle.getFile()
    store.loadFromJson(JSON.parse(await file.text()) as LevelJson)
  }
  catch (e) {
    if ((e as DOMException)?.name === 'AbortError')
      return
    showToast(`Open failed: ${String((e as Error).message ?? e)}`, 'err')
  }
}

function openFallback() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f)
      return
    try {
      store.loadFromJson(JSON.parse(await f.text()) as LevelJson)
    }
    catch (e) {
      showToast(`Failed to parse JSON: ${String(e)}`, 'err')
    }
  }
  input.click()
}

function downloadJson() {
  const json = store.toJson()
  const blob = new Blob([`${JSON.stringify(json, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'level.json'
  a.click()
  URL.revokeObjectURL(url)
  closeAllMenus()
}

async function copyJson() {
  await navigator.clipboard.writeText(JSON.stringify(store.toJson(), null, 2))
  showToast('Copied to clipboard')
  closeAllMenus()
}

// View layers
const LAYER_LABELS: [keyof typeof store.layers.value, string][] = [
  ['colliders', 'Colliders'],
  ['zones', 'Zones'],
  ['wind', 'Wind arrows'],
  ['paths', 'Kinetic paths'],
  ['enemyRanges', 'Enemy ranges'],
  ['entityLabels', 'Entity labels'],
  ['grid', 'Grid'],
]

// Preset dropdown
const levels = listLevels()
const selectedPreset = ref('')

function onPresetChange() {
  if (!selectedPreset.value)
    return
  const id = selectedPreset.value
  const data = loadLevel(id)
  if (data) {
    store.loadFromJson(data)
    store.activeFileHandle.value = null
    store.activeFileName.value = null
    store.activePresetName.value = id
    showToast(`Loaded ${id}`)
  }
  selectedPreset.value = ''
}
</script>

<template>
  <div class="topbar-toast editor-toast" :class="{ visible: toastVisible, ok: toastKind === 'ok', err: toastKind === 'err' }" :data-kind="toastKind || undefined">
    {{ toastMsg }}
  </div>

  <!-- File menu -->
  <div id="vue-file-menu" class="topbar-menu">
    <button @click.stop="fileOpen = !fileOpen">
      <iconify-icon icon="mdi:file-outline" />
      <span>File</span>
    </button>
    <div v-if="fileOpen" class="topbar-popover">
      <button class="topbar-menu-item" @click="newBlank">
        <iconify-icon icon="mdi:file-plus-outline" /><span>New blank</span>
      </button>
      <button class="topbar-menu-item" @click="openFile">
        <iconify-icon icon="mdi:folder-open-outline" /><span>Open File…</span>
      </button>
      <button class="topbar-menu-item" @click="downloadJson">
        <iconify-icon icon="mdi:download" /><span>Download JSON</span>
      </button>
      <button class="topbar-menu-item" @click="copyJson">
        <iconify-icon icon="mdi:content-copy" /><span>Copy JSON</span>
      </button>
    </div>
  </div>

  <!-- View menu -->
  <div id="vue-view-menu" class="topbar-menu">
    <button @click.stop="viewOpen = !viewOpen">
      <iconify-icon icon="mdi:eye-outline" />
      <span>View</span>
    </button>
    <div v-if="viewOpen" class="topbar-popover">
      <label v-for="[key, label] in LAYER_LABELS" :key="key" class="topbar-menu-item" style="display:flex;align-items:center;gap:6px;">
        <input v-model="store.layers.value[key]" type="checkbox">
        {{ label }}
      </label>
    </div>
  </div>

  <!-- Preset dropdown -->
  <select v-model="selectedPreset" @change="onPresetChange">
    <option value="" disabled>
      — load bundled —
    </option>
    <option v-for="lv in levels" :key="lv.id" :value="lv.id">
      {{ lv.name }}
    </option>
  </select>

  <div style="flex:1" />

  <!-- Playtest link -->
  <a href="./" style="color:var(--dim);display:inline-flex;align-items:center;gap:4px;text-decoration:none;">
    <iconify-icon icon="mdi:play-circle-outline" /><span>playtest</span>
  </a>
</template>
