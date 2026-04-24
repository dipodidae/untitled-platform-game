<script setup lang="ts">
import { ref } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { listLevels, loadLevel } from '../../../session/levelManager'

const store = useEditorStore()
const toast = useToast()

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
    store.activeFileHandle = null
    store.activeFileName = null
    store.activePresetName = val
    toast.add({ title: `Loaded ${val}`, icon: 'i-mdi-check', color: 'success' })
  }
  selectedPreset.value = ''
}
</script>

<template>
  <USelect
    :items="presetItems"
    :model-value="selectedPreset"
    placeholder="— load bundled —"
    size="xs"
    class="w-40"
    @update:model-value="onPresetChange"
  />
</template>
