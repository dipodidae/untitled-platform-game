<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import type { MaterialName } from '../../world/level'
import type { ItemKind } from '../../items/types'

const store = useEditorStore()
const toast = useToast()

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']
const ITEM_KINDS: ItemKind[] = ['bigShot']

const materialItems = MATERIALS.map(m => ({ label: m, value: m }))
const itemKindItems = ITEM_KINDS.map(k => ({ label: k, value: k }))
const kineticTypeItems = [
  { label: 'none', value: 'none' },
  { label: 'rotor', value: 'rotor' },
  { label: 'breather', value: 'breather' },
  { label: 'spring', value: 'spring' },
]

// Computed helpers
const sel = computed(() => store.selection.value)

const selectedCollider = computed(() => {
  if (sel.value?.kind !== 'collider')
    return null
  return store.level.value.colliders[sel.value.index] ?? null
})

const selectedZone = computed(() => {
  if (sel.value?.kind !== 'zone')
    return null
  return store.level.value.zones[sel.value.index] ?? null
})

const selectedProwler = computed(() => {
  if (sel.value?.kind !== 'prowler')
    return null
  return store.level.value.prowlers[sel.value.index] ?? null
})

const selectedDummy = computed(() => {
  if (sel.value?.kind !== 'dummy')
    return null
  return store.level.value.dummies[sel.value.index] ?? null
})

const selectedPickup = computed(() => {
  if (sel.value?.kind !== 'pickup')
    return null
  return store.level.value.pickups[sel.value.index] ?? null
})

// Collider kinetic type
function getKineticType(): string {
  return selectedCollider.value?.kinetic?.type ?? 'none'
}

function setKineticType(v: string) {
  const c = selectedCollider.value
  if (!c)
    return
  if (v === 'none') {
    delete c.kinetic
  }
  else if (v === 'rotor') {
    c.kinetic = { type: 'rotor', speed: 0.4 }
  }
  else if (v === 'breather') {
    c.kinetic = { type: 'breather', frequency: 0.6, amplitude: 2 }
  }
  else if (v === 'spring') {
    c.kinetic = { type: 'spring', stiffness: 180, damping: 8 }
  }
}

function getKineticEntries(): [string, unknown][] {
  const k = selectedCollider.value?.kinetic
  if (!k)
    return []
  return Object.entries(k).filter(([key]) => key !== 'type')
}

function setKineticField(key: string, val: unknown) {
  const c = selectedCollider.value
  if (!c?.kinetic)
    return
  ;(c.kinetic as unknown as Record<string, unknown>)[key] = val
}

// Conveyor / surface motion
function getConveyor(): boolean {
  const c = selectedCollider.value
  return !!(c?.surfaceMotion && c.surfaceMotion.vx !== 0)
}
function setConveyor(on: boolean) {
  const c = selectedCollider.value
  if (!c)
    return
  if (on)
    c.surfaceMotion = { vx: 80 }
  else delete c.surfaceMotion
}

// Launch pad
function getLaunchPad(): boolean {
  return !!selectedCollider.value?.launchPad
}
function setLaunchPad(on: boolean) {
  const c = selectedCollider.value
  if (!c)
    return
  if (on)
    c.launchPad = { force: 420, angle: 0 }
  else delete c.launchPad
}

// Overwrite
function overwriteLabel(): string | null {
  if (store.activeFileName.value)
    return store.activeFileName.value
  if (store.activePresetName.value)
    return `${store.activePresetName.value}.json`
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
    if (store.activeFileHandle.value) {
      const writable = await store.activeFileHandle.value.createWritable()
      await writable.write(`${JSON.stringify(store.toJson(), null, 2)}\n`)
      await writable.close()
    }
    else if (store.activePresetName.value) {
      await overwritePreset(store.activePresetName.value)
    }
    toast.add({ title: `Saved ${target}`, icon: 'i-mdi-check', color: 'success' })
  }
  catch (e) {
    console.error('overwrite failed', e)
    toast.add({ title: 'Overwrite failed', description: String((e as Error).message ?? e), icon: 'i-mdi-alert', color: 'error' })
  }
}

function deleteSelection() {
  const s = sel.value
  if (!s)
    return
  if (s.kind === 'collider')
    store.level.value.colliders.splice(s.index, 1)
  else if (s.kind === 'prowler')
    store.level.value.prowlers.splice(s.index, 1)
  else if (s.kind === 'dummy')
    store.level.value.dummies.splice(s.index, 1)
  else if (s.kind === 'pickup')
    store.level.value.pickups.splice(s.index, 1)
  else if (s.kind === 'zone')
    store.level.value.zones.splice(s.index, 1)
  if (s.kind !== 'spawn')
    store.selection.value = null
}

function parsePathJson(val: string): [number, number][] | null {
  try {
    return JSON.parse(val) as [number, number][]
  }
  catch {
    return null
  }
}
</script>

<template>
  <!-- World Size -->
  <div class="section">
    <h3>World Size</h3>
    <div class="row">
      <label>worldWidth</label>
      <UInput v-model.number="store.level.value.worldWidth" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </div>
    <div class="row">
      <label>worldHeight</label>
      <UInput v-model.number="store.level.value.worldHeight" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </div>
  </div>

  <!-- Grid / Snap -->
  <div class="section">
    <h3>Grid / Snap</h3>
    <div class="row">
      <label>snap (px)</label>
      <UInput v-model.number="store.snapStep.value" type="number" min="0" size="xs" class="flex-[1.4] min-w-0" />
    </div>
    <div class="hint">
      0 = off
    </div>
  </div>

  <!-- Selection inspector -->
  <div class="section">
    <h3>Selection</h3>

    <!-- Nothing selected -->
    <div v-if="!sel" class="hint">
      nothing selected
    </div>

    <!-- Collider -->
    <template v-else-if="sel.kind === 'collider' && selectedCollider">
      <div class="hint">
        collider #{{ selectedCollider.id }} · {{ selectedCollider.vertices.length }} verts
      </div>

      <div class="row">
        <label>material</label>
        <USelect v-model="selectedCollider.material" :items="materialItems" size="xs" class="flex-[1.4] min-w-0" />
      </div>

      <div class="row">
        <label>oneWay</label>
        <UCheckbox
          :model-value="!!selectedCollider.oneWay"
          size="sm"
          @update:model-value="(v) => {
            if (v) selectedCollider!.oneWay = true
            else delete selectedCollider!.oneWay
          }"
        />
      </div>

      <div class="row">
        <label>kinetic</label>
        <USelect
          :model-value="getKineticType()"
          :items="kineticTypeItems"
          size="xs"
          class="flex-[1.4] min-w-0"
          @update:model-value="setKineticType"
        />
      </div>

      <!-- Kinetic fields -->
      <template v-for="[key, val] in getKineticEntries()" :key="key">
        <div v-if="Array.isArray(val)" class="row">
          <label>{{ key }}</label>
          <textarea
            :value="JSON.stringify(val)"
            rows="2"
            style="flex:1.4;background:var(--bg);color:var(--text);border:1px solid var(--border);padding:3px 5px;border-radius:3px;font:inherit;min-width:0;resize:vertical;"
            @change="(e) => {
              const parsed = parsePathJson((e.target as HTMLTextAreaElement).value)
              if (parsed) setKineticField(key, parsed)
            }"
          />
        </div>
        <div v-else-if="typeof val === 'string'" class="row">
          <label>{{ key }}</label>
          <UInput
            type="text"
            :model-value="val"
            size="xs"
            class="flex-[1.4] min-w-0"
            @change="(e) => setKineticField(key, (e.target as HTMLInputElement).value)"
          />
        </div>
        <div v-else class="row">
          <label>{{ key }}</label>
          <UInput
            type="number"
            :model-value="val as number"
            size="xs"
            class="flex-[1.4] min-w-0"
            @change="(e) => {
              const n = Number((e.target as HTMLInputElement).value)
              if (Number.isFinite(n)) setKineticField(key, n)
            }"
          />
        </div>
      </template>

      <!-- Conveyor -->
      <div class="row">
        <label>conveyor</label>
        <UCheckbox
          :model-value="getConveyor()"
          size="sm"
          @update:model-value="setConveyor"
        />
      </div>
      <div v-if="selectedCollider.surfaceMotion && selectedCollider.surfaceMotion.vx !== 0" class="row">
        <label>surface vx</label>
        <UInput
          type="number"
          :model-value="selectedCollider.surfaceMotion.vx"
          size="xs"
          class="flex-[1.4] min-w-0"
          @change="(e) => {
            const n = Number((e.target as HTMLInputElement).value)
            if (Number.isFinite(n)) selectedCollider!.surfaceMotion = { vx: n }
          }"
        />
      </div>

      <!-- Launch pad -->
      <div class="row">
        <label>launch pad</label>
        <UCheckbox
          :model-value="getLaunchPad()"
          size="sm"
          @update:model-value="setLaunchPad"
        />
      </div>
      <template v-if="selectedCollider.launchPad">
        <div class="row">
          <label>force</label>
          <UInput
            type="number"
            :model-value="selectedCollider.launchPad.force"
            size="xs"
            class="flex-[1.4] min-w-0"
            @change="(e) => {
              const n = Number((e.target as HTMLInputElement).value)
              if (Number.isFinite(n) && selectedCollider!.launchPad) selectedCollider!.launchPad.force = n
            }"
          />
        </div>
        <div class="row">
          <label>angle (rad)</label>
          <UInput
            type="number"
            :model-value="selectedCollider.launchPad.angle ?? 0"
            size="xs"
            class="flex-[1.4] min-w-0"
            @change="(e) => {
              const n = Number((e.target as HTMLInputElement).value)
              if (Number.isFinite(n) && selectedCollider!.launchPad) selectedCollider!.launchPad.angle = n
            }"
          />
        </div>
      </template>

      <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="deleteSelection" />
    </template>

    <!-- Zone -->
    <template v-else-if="sel.kind === 'zone' && selectedZone">
      <div class="hint">
        zone #{{ selectedZone.id }} · {{ selectedZone.type }}
      </div>
      <div class="row">
        <label>x</label>
        <UInput v-model.number="selectedZone.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>y</label>
        <UInput v-model.number="selectedZone.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>w</label>
        <UInput v-model.number="selectedZone.w" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>h</label>
        <UInput v-model.number="selectedZone.h" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <template v-if="selectedZone.type === 'gravity'">
        <div class="row">
          <label>gravityScale</label>
          <UInput v-model.number="selectedZone.gravityScale" type="number" step="0.1" size="xs" class="flex-[1.4] min-w-0" />
        </div>
        <div class="row">
          <label>airControlScale</label>
          <UInput v-model.number="selectedZone.airControlScale" type="number" step="0.1" size="xs" class="flex-[1.4] min-w-0" />
        </div>
      </template>
      <template v-else-if="selectedZone.type === 'wind'">
        <div class="row">
          <label>windVx</label>
          <UInput v-model.number="selectedZone.windVx" type="number" size="xs" class="flex-[1.4] min-w-0" />
        </div>
        <div class="row">
          <label>windVy</label>
          <UInput v-model.number="selectedZone.windVy" type="number" size="xs" class="flex-[1.4] min-w-0" />
        </div>
        <div class="row">
          <label>turbulence</label>
          <UInput v-model.number="selectedZone.windTurbulence" type="number" step="0.01" size="xs" class="flex-[1.4] min-w-0" />
        </div>
      </template>
      <template v-else-if="selectedZone.type === 'hazard'">
        <div class="row">
          <label>hazardDamage</label>
          <UInput v-model.number="selectedZone.hazardDamage" type="number" size="xs" class="flex-[1.4] min-w-0" />
        </div>
      </template>
      <template v-else-if="selectedZone.type === 'trigger'">
        <div class="row">
          <label>triggerId</label>
          <UInput v-model="selectedZone.triggerId" type="text" size="xs" class="flex-[1.4] min-w-0" />
        </div>
      </template>
      <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="deleteSelection" />
    </template>

    <!-- Spawn -->
    <template v-else-if="sel.kind === 'spawn'">
      <div class="row">
        <label>spawn x</label>
        <UInput v-model.number="store.level.value.spawn.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>spawn y</label>
        <UInput v-model.number="store.level.value.spawn.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
    </template>

    <!-- Prowler -->
    <template v-else-if="sel.kind === 'prowler' && selectedProwler">
      <div class="row">
        <label>x</label>
        <UInput v-model.number="selectedProwler.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>y</label>
        <UInput v-model.number="selectedProwler.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="deleteSelection" />
    </template>

    <!-- Dummy -->
    <template v-else-if="sel.kind === 'dummy' && selectedDummy">
      <div class="row">
        <label>x</label>
        <UInput v-model.number="selectedDummy.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>y</label>
        <UInput v-model.number="selectedDummy.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>hp</label>
        <UInput
          type="number"
          :model-value="selectedDummy.hp ?? 1"
          size="xs"
          class="flex-[1.4] min-w-0"
          @change="(e) => {
            const n = Number((e.target as HTMLInputElement).value)
            if (Number.isFinite(n) && selectedDummy) {
              if (n === 1) delete selectedDummy.hp
              else selectedDummy.hp = n
            }
          }"
        />
      </div>
      <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="deleteSelection" />
    </template>

    <!-- Pickup -->
    <template v-else-if="sel.kind === 'pickup' && selectedPickup">
      <div class="row">
        <label>x</label>
        <UInput v-model.number="selectedPickup.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>y</label>
        <UInput v-model.number="selectedPickup.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <div class="row">
        <label>kind</label>
        <USelect v-model="selectedPickup.kind" :items="itemKindItems" size="xs" class="flex-[1.4] min-w-0" />
      </div>
      <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="deleteSelection" />
    </template>

    <!-- Fallback -->
    <div v-else class="hint">
      nothing selected
    </div>
  </div>

  <!-- Save / Load -->
  <div class="section">
    <h3>Save / Load</h3>
    <div class="button-row">
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
    <div class="button-row">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-mdi-undo"
        :label="`Undo (${store.undoStack.value.length})`"
        :disabled="store.undoStack.value.length === 0"
        title="Ctrl+Z"
        size="xs"
        class="flex-1"
        @click="store.undo()"
      />
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-mdi-redo"
        :label="`Redo (${store.redoStack.value.length})`"
        :disabled="store.redoStack.value.length === 0"
        title="Ctrl+Shift+Z / Ctrl+Y"
        size="xs"
        class="flex-1"
        @click="store.redo()"
      />
    </div>
  </div>

  <!-- Shortcuts -->
  <div class="section">
    <h3>Shortcuts</h3>
    <div class="hint">
      <span class="kbd">Space</span>+drag: pan<br>
      <span class="kbd">Wheel</span>: zoom<br>
      <span class="kbd">F</span>: frame world<br>
      <span class="kbd">Enter</span>: finish polygon<br>
      <span class="kbd">Esc</span>: cancel<br>
      <span class="kbd">Del</span>: delete selection<br>
      <span class="kbd">Shift</span>+click vertex: delete<br>
      <span class="kbd">Alt</span>+click edge: insert vertex<br>
      <span class="kbd">G</span>: motion preview (hold)
    </div>
  </div>
</template>
