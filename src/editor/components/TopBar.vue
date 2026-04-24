<script setup lang="ts">
import { ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import { listLevels, loadLevel } from '../../session/levelManager'
import type { LevelJson } from '../../world/level'

const store = useEditorStore()
const toast = useToast()

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
}

async function openFile() {
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
    toast.add({ title: 'Open failed', description: String((e as Error).message ?? e), icon: 'i-mdi-alert', color: 'error' })
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
      toast.add({ title: 'Failed to parse JSON', description: String(e), icon: 'i-mdi-alert', color: 'error' })
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
}

async function copyJson() {
  await navigator.clipboard.writeText(JSON.stringify(store.toJson(), null, 2))
  toast.add({ title: 'Copied to clipboard', icon: 'i-mdi-check', color: 'success' })
}

// File menu items
const fileMenuItems = [
  [
    {
      label: 'New blank',
      icon: 'i-mdi-file-plus-outline',
      onSelect: newBlank,
    },
    {
      label: 'Open File…',
      icon: 'i-mdi-folder-open-outline',
      onSelect: openFile,
    },
    {
      label: 'Download JSON',
      icon: 'i-mdi-download',
      onSelect: downloadJson,
    },
    {
      label: 'Copy JSON',
      icon: 'i-mdi-content-copy',
      onSelect: copyJson,
    },
  ],
]

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

const viewMenuItems = LAYER_LABELS.map(([key, label]) => ({
  label,
  type: 'checkbox' as const,
  checked: store.layers.value[key],
  onUpdateChecked: (v: boolean) => { store.layers.value[key] = v },
}))

// Preset dropdown
const levels = listLevels()
const selectedPreset = ref<string>('')

const presetItems = [
  { label: '— load bundled —', value: '', disabled: true },
  ...levels.map(lv => ({ label: lv.name, value: lv.id })),
]

function onPresetChange(val: string) {
  if (!val)
    return
  const data = loadLevel(val)
  if (data) {
    store.loadFromJson(data)
    store.activeFileHandle.value = null
    store.activeFileName.value = null
    store.activePresetName.value = val
    toast.add({ title: `Loaded ${val}`, icon: 'i-mdi-check', color: 'success' })
  }
  selectedPreset.value = ''
}
</script>

<template>
  <!-- File menu -->
  <UDropdownMenu :items="fileMenuItems">
    <UButton color="neutral" variant="ghost" icon="i-mdi-file-outline" label="File" size="xs" />
  </UDropdownMenu>

  <!-- View menu -->
  <UDropdownMenu :items="[viewMenuItems]">
    <UButton color="neutral" variant="ghost" icon="i-mdi-eye-outline" label="View" size="xs" />
  </UDropdownMenu>

  <!-- Preset dropdown -->
  <USelect
    :items="presetItems"
    :model-value="selectedPreset"
    placeholder="— load bundled —"
    size="xs"
    class="w-40"
    @update:model-value="onPresetChange"
  />

  <div class="flex-1" />

  <!-- Playtest link -->
  <a href="./" class="flex items-center gap-1 text-[var(--dim)] no-underline hover:text-[var(--text)]">
    <UIcon name="i-mdi-play-circle-outline" />
    <span>playtest</span>
  </a>
</template>
