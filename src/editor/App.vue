<script setup lang="ts">
import TopBar from './components/TopBar.vue'
import LeftPanel from './components/LeftPanel.vue'
import RightPanel from './components/RightPanel.vue'
import BottomBar from './components/BottomBar.vue'
import CanvasHost from './components/CanvasHost.vue'
import './style.css'
</script>

<template>
  <div id="vue-top-bar">
    <TopBar />
  </div>

  <div id="vue-left-panel">
    <LeftPanel />
  </div>

  <CanvasHost />

  <div id="vue-right-panel">
    <RightPanel />
  </div>

  <div id="vue-bottom-bar">
    <BottomBar />
  </div>
</template>

<style>
/* Grid layout identical to the vanilla editor */
#app {
  display: grid;
  grid-template-columns: 220px 1fr 260px;
  grid-template-rows: 32px 1fr 28px;
  height: 100%;
}

#vue-top-bar {
  grid-column: 1 / -1;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 0 10px;
  font-size: 11px;
}

#vue-left-panel {
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#vue-right-panel {
  background: var(--panel);
  border-left: 1px solid var(--border);
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#vue-bottom-bar {
  grid-column: 1 / -1;
  background: var(--panel-2);
  border-top: 1px solid var(--border);
  padding: 4px 10px;
  font-size: 11px;
  color: var(--dim);
  display: flex;
  gap: 16px;
  align-items: center;
}
</style>
