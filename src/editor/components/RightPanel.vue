<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import WorldSettings from './rightpanel/WorldSettings.vue'
import ColliderInspector from './rightpanel/ColliderInspector.vue'
import ZoneInspector from './rightpanel/ZoneInspector.vue'
import EntityInspector from './rightpanel/EntityInspector.vue'
import SaveLoadActions from './rightpanel/SaveLoadActions.vue'
import ShortcutsHint from './rightpanel/ShortcutsHint.vue'

const store = useEditorStore()

const sel = computed(() => store.selection)

const selectedCollider = computed(() => {
  if (sel.value?.kind !== 'collider')
    return null
  return store.level.colliders[sel.value.index] ?? null
})

const selectedZone = computed(() => {
  if (sel.value?.kind !== 'zone')
    return null
  return store.level.zones[sel.value.index] ?? null
})

function deleteSelection() {
  const s = sel.value
  if (!s)
    return
  if (s.kind === 'collider')
    store.level.colliders.splice(s.index, 1)
  else if (s.kind === 'prowler')
    store.level.prowlers.splice(s.index, 1)
  else if (s.kind === 'dummy')
    store.level.dummies.splice(s.index, 1)
  else if (s.kind === 'pickup')
    store.level.pickups.splice(s.index, 1)
  else if (s.kind === 'zone')
    store.level.zones.splice(s.index, 1)
  if (s.kind !== 'spawn')
    store.selection = null
}
</script>

<template>
  <WorldSettings />

  <!-- Selection inspector -->
  <div class="section">
    <h3>Selection</h3>

    <!-- Nothing selected -->
    <div v-if="!sel" class="hint">
      nothing selected
    </div>

    <!-- Collider -->
    <template v-else-if="sel.kind === 'collider' && selectedCollider">
      <ColliderInspector :collider="selectedCollider" @delete="deleteSelection" />
    </template>

    <!-- Zone -->
    <template v-else-if="sel.kind === 'zone' && selectedZone">
      <ZoneInspector :zone="selectedZone" @delete="deleteSelection" />
    </template>

    <!-- Spawn / Prowler / Dummy / Pickup -->
    <template v-else-if="sel.kind === 'spawn' || sel.kind === 'prowler' || sel.kind === 'dummy' || sel.kind === 'pickup'">
      <EntityInspector :kind="sel.kind" :index="sel.index" @delete="deleteSelection" />
    </template>

    <!-- Fallback -->
    <div v-else class="hint">
      nothing selected
    </div>
  </div>

  <SaveLoadActions />
  <ShortcutsHint />
</template>
