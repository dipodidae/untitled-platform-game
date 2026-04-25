<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useCanvas } from '../composables/useCanvas'
import { useEditorStore } from '../stores/editor'
import MinimapHost from './MinimapHost.vue'

const hostRef = ref<HTMLDivElement>()
const store = useEditorStore()
let canvas: Awaited<ReturnType<typeof useCanvas>> | null = null

onMounted(async () => {
  if (!hostRef.value)
    return
  canvas = await useCanvas(hostRef.value, store)
  // Frame the world once initial size is known.
  requestAnimationFrame(() => canvas?.frameWorldViewport?.())
})

onBeforeUnmount(() => {
  canvas?.dispose()
  canvas?.app.destroy(true, { children: true, texture: true })
})
</script>

<template>
  <div id="vue-canvas-host" ref="hostRef" class="canvas-host">
    <MinimapHost />
  </div>
</template>

<style scoped>
.canvas-host {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0b0f;
}
</style>
