<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMinimap } from '../composables/useMinimap'
import { useEditorStore } from '../stores/editor'

const hostRef = ref<HTMLDivElement>()
const store = useEditorStore()

onMounted(() => {
  if (!hostRef.value)
    return
  const host = hostRef.value
  useMinimap(host, store, () => ({ w: host.clientWidth, h: host.clientHeight }))
})
</script>

<template>
  <div ref="hostRef" class="minimap-host" />
</template>

<style scoped>
.minimap-host {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 180px;
  height: 100px;
  background: #0a0b0f;
  border: 1px solid #2a2f3a;
  border-radius: 3px;
  overflow: hidden;
  pointer-events: auto;
}
</style>
