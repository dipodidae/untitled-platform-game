<script setup lang="ts">
import BottomBar from './components/BottomBar.vue'
import CanvasHost from './components/CanvasHost.vue'
import LeftPanel from './components/LeftPanel.vue'
import RightPanel from './components/RightPanel.vue'
import TopBar from './components/TopBar.vue'
</script>

<template>
  <UApp>
    <div class="editor-grid">
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
    </div>
  </UApp>
</template>

<style>
/* Grid layout identical to the vanilla editor. UApp wraps the whole tree
   so the grid lives on a child container, not directly on #app. */
#app {
  height: 100%;
}

.editor-grid {
  display: grid;
  grid-template-columns: 18rem 1fr 20rem;
  grid-template-rows: 38px 1fr 28px;
  height: 100%;
}

#vue-top-bar {
  grid-column: 1 / -1;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 0 14px;
  font-size: 12px;
}

#vue-left-panel {
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

#vue-right-panel {
  background: var(--panel);
  border-left: 1px solid var(--border);
  padding: 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
