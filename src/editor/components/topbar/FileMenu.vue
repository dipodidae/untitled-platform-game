<script setup lang="ts">
import type { LevelJson } from '../../../world/level'
import { useEditorStore } from '../../stores/editor'

const store = useEditorStore()
const toast = useToast()

function newBlank() {
  if (!confirm('Clear the current level and start blank?'))
    return
  store.loadFromJson({
    spawn: { x: 80, y: 300 },
    worldWidth: 3200,
    worldHeight: 720,
    colliders: [{ id: 1, material: 'bone', vertices: [[0, 500], [3200, 500], [3200, 600], [0, 600]] }],
  })
  store.activeFileHandle = null
  store.activeFileName = null
  store.activePresetName = null
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
    store.activeFileHandle = handle
    store.activeFileName = handle.name
    store.activePresetName = null
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
</script>

<template>
  <UDropdownMenu :items="fileMenuItems">
    <UButton color="neutral" variant="soft" icon="i-mdi-file-outline" label="File" size="xs" />
  </UDropdownMenu>
</template>
