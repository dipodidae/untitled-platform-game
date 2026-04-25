<script setup lang="ts">
import { ref } from 'vue'
import { listLevels, loadLevel } from '../../../session/levelManager'
import { useEditorStore } from '../../stores/editor'

const store = useEditorStore()
const toast = useToast()

const levels = listLevels()
// Use undefined (no selection) rather than '' so Nuxt UI's <SelectItem>
// never receives an empty-string value (which it rejects with a console error).
const selectedPreset = ref<string | undefined>(undefined)

const presetItems = levels.map(lv => ({ label: lv.name, value: lv.id }))

function onPresetChange(val: string | undefined) {
  if (!val)
    return
  const data = loadLevel(val)
  if (data) {
    store.loadFromJson(data)
    store.activeFileHandle = null
    store.activeFileName = null
    store.activePresetName = val
    toast.add({ title: `Loaded ${val}`, icon: 'i-mdi-check', color: 'success' })
  }
  // Reset to undefined so the placeholder text shows again
  selectedPreset.value = undefined
}
</script>

<template>
  <USelect
    :items="presetItems"
    :model-value="selectedPreset"
    placeholder="— load bundled —"
    size="xs"
    class="w-40"
    @update:model-value="(val: string | undefined) => onPresetChange(val)"
  />
</template>
