<script setup lang="ts">
import { useEditorStore } from '../../stores/editor'

const store = useEditorStore()
const toast = useToast()

function overwriteLabel(): string | null {
  if (store.activeFileName)
    return store.activeFileName
  if (store.activePresetName)
    return `${store.activePresetName}.json`
  return null
}

async function overwritePreset(name: string): Promise<void> {
  const body = `${JSON.stringify(store.toJson(), null, 2)}\n`
  const res = await fetch(`/__editor/save?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${text || res.statusText}`)
  }
}

async function doOverwrite() {
  const target = overwriteLabel()
  if (!target)
    return
  if (!confirm(`Overwrite ${target}? This cannot be undone.`))
    return
  try {
    if (store.activeFileHandle) {
      const writable = await store.activeFileHandle.createWritable()
      await writable.write(`${JSON.stringify(store.toJson(), null, 2)}\n`)
      await writable.close()
    }
    else if (store.activePresetName) {
      await overwritePreset(store.activePresetName)
    }
    toast.add({ title: `Saved ${target}`, icon: 'i-mdi-check', color: 'success' })
  }
  catch (e) {
    console.error('overwrite failed', e)
    toast.add({ title: 'Overwrite failed', description: String((e as Error).message ?? e), icon: 'i-mdi-alert', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-col gap-[6px] p-2 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-1 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      Save / Load
    </h3>
    <div class="flex gap-1 flex-wrap">
      <UButton
        color="primary"
        variant="solid"
        icon="i-mdi-content-save-outline"
        :label="overwriteLabel() ? `Overwrite (${overwriteLabel()})` : 'Overwrite'"
        :disabled="!overwriteLabel()"
        :title="overwriteLabel() ? `Overwrite ${overwriteLabel()}` : 'Load a bundled preset or open a file first.'"
        size="xs"
        class="flex-1"
        @click="doOverwrite"
      />
    </div>
    <div class="flex gap-1 flex-wrap">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-mdi-undo"
        :label="`Undo (${store.undoStack.length})`"
        :disabled="store.undoStack.length === 0"
        title="Ctrl+Z"
        size="xs"
        class="flex-1"
        @click="store.undo()"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-mdi-redo"
        :label="`Redo (${store.redoStack.length})`"
        :disabled="store.redoStack.length === 0"
        title="Ctrl+Shift+Z / Ctrl+Y"
        size="xs"
        class="flex-1"
        @click="store.redo()"
      />
    </div>
  </div>
</template>
