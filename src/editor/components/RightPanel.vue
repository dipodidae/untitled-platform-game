<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorStore } from '../stores/editor'
import type { MaterialName } from '../../world/level'
import type { ItemKind } from '../../items/types'

const store = useEditorStore()

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']
const ITEM_KINDS: ItemKind[] = ['bigShot']

// Toast
const toastMsg = ref('')
const toastKind = ref<'ok' | 'err' | ''>('')
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string, kind: 'ok' | 'err' | '' = '') {
  toastMsg.value = msg
  toastKind.value = kind
  toastVisible.value = true
  if (toastTimer)
    clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastVisible.value = false }, 2400)
}

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
    showToast(`Saved ${target}`, 'ok')
  }
  catch (e) {
    console.error('overwrite failed', e)
    showToast(`Overwrite failed: ${String((e as Error).message ?? e)}`, 'err')
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
  <!-- Toast -->
  <div class="editor-toast" :class="{ visible: toastVisible }" :data-kind="toastKind || undefined" style="position:fixed;top:12px;right:12px;z-index:200;">
    {{ toastMsg }}
  </div>

  <!-- World Size -->
  <div class="section">
    <h3>World Size</h3>
    <div class="row">
      <label>worldWidth</label>
      <input v-model.number="store.level.value.worldWidth" type="number">
    </div>
    <div class="row">
      <label>worldHeight</label>
      <input v-model.number="store.level.value.worldHeight" type="number">
    </div>
  </div>

  <!-- Grid / Snap -->
  <div class="section">
    <h3>Grid / Snap</h3>
    <div class="row">
      <label>snap (px)</label>
      <input v-model.number="store.snapStep.value" type="number" min="0">
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
        <select v-model="selectedCollider.material">
          <option v-for="m in MATERIALS" :key="m" :value="m">
            {{ m }}
          </option>
        </select>
      </div>

      <div class="row">
        <label>oneWay</label>
        <input
          type="checkbox"
          :checked="!!selectedCollider.oneWay"
          @change="(e) => {
            if ((e.target as HTMLInputElement).checked) selectedCollider!.oneWay = true
            else delete selectedCollider!.oneWay
          }"
        >
      </div>

      <div class="row">
        <label>kinetic</label>
        <select :value="getKineticType()" @change="(e) => setKineticType((e.target as HTMLSelectElement).value)">
          <option value="none">
            none
          </option>
          <option value="rotor">
            rotor
          </option>
          <option value="breather">
            breather
          </option>
          <option value="spring">
            spring
          </option>
        </select>
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
          <input
            type="text"
            :value="val"
            @change="(e) => setKineticField(key, (e.target as HTMLInputElement).value)"
          >
        </div>
        <div v-else class="row">
          <label>{{ key }}</label>
          <input
            type="number"
            :value="val as number"
            @change="(e) => {
              const n = Number((e.target as HTMLInputElement).value)
              if (Number.isFinite(n)) setKineticField(key, n)
            }"
          >
        </div>
      </template>

      <!-- Conveyor -->
      <div class="row">
        <label>conveyor</label>
        <input
          type="checkbox"
          :checked="getConveyor()"
          @change="(e) => setConveyor((e.target as HTMLInputElement).checked)"
        >
      </div>
      <div v-if="selectedCollider.surfaceMotion && selectedCollider.surfaceMotion.vx !== 0" class="row">
        <label>surface vx</label>
        <input
          type="number"
          :value="selectedCollider.surfaceMotion.vx"
          @change="(e) => {
            const n = Number((e.target as HTMLInputElement).value)
            if (Number.isFinite(n)) selectedCollider!.surfaceMotion = { vx: n }
          }"
        >
      </div>

      <!-- Launch pad -->
      <div class="row">
        <label>launch pad</label>
        <input
          type="checkbox"
          :checked="getLaunchPad()"
          @change="(e) => setLaunchPad((e.target as HTMLInputElement).checked)"
        >
      </div>
      <template v-if="selectedCollider.launchPad">
        <div class="row">
          <label>force</label>
          <input
            type="number"
            :value="selectedCollider.launchPad.force"
            @change="(e) => {
              const n = Number((e.target as HTMLInputElement).value)
              if (Number.isFinite(n) && selectedCollider!.launchPad) selectedCollider!.launchPad.force = n
            }"
          >
        </div>
        <div class="row">
          <label>angle (rad)</label>
          <input
            type="number"
            :value="selectedCollider.launchPad.angle ?? 0"
            @change="(e) => {
              const n = Number((e.target as HTMLInputElement).value)
              if (Number.isFinite(n) && selectedCollider!.launchPad) selectedCollider!.launchPad.angle = n
            }"
          >
        </div>
      </template>

      <button class="danger" @click="deleteSelection">
        Delete
      </button>
    </template>

    <!-- Zone -->
    <template v-else-if="sel.kind === 'zone' && selectedZone">
      <div class="hint">
        zone #{{ selectedZone.id }} · {{ selectedZone.type }}
      </div>
      <div class="row">
        <label>x</label>
        <input v-model.number="selectedZone.x" type="number">
      </div>
      <div class="row">
        <label>y</label>
        <input v-model.number="selectedZone.y" type="number">
      </div>
      <div class="row">
        <label>w</label>
        <input v-model.number="selectedZone.w" type="number">
      </div>
      <div class="row">
        <label>h</label>
        <input v-model.number="selectedZone.h" type="number">
      </div>
      <template v-if="selectedZone.type === 'gravity'">
        <div class="row">
          <label>gravityScale</label>
          <input v-model.number="selectedZone.gravityScale" type="number" step="0.1">
        </div>
        <div class="row">
          <label>airControlScale</label>
          <input v-model.number="selectedZone.airControlScale" type="number" step="0.1">
        </div>
      </template>
      <template v-else-if="selectedZone.type === 'wind'">
        <div class="row">
          <label>windVx</label>
          <input v-model.number="selectedZone.windVx" type="number">
        </div>
        <div class="row">
          <label>windVy</label>
          <input v-model.number="selectedZone.windVy" type="number">
        </div>
        <div class="row">
          <label>turbulence</label>
          <input v-model.number="selectedZone.windTurbulence" type="number" step="0.01">
        </div>
      </template>
      <template v-else-if="selectedZone.type === 'hazard'">
        <div class="row">
          <label>hazardDamage</label>
          <input v-model.number="selectedZone.hazardDamage" type="number">
        </div>
      </template>
      <template v-else-if="selectedZone.type === 'trigger'">
        <div class="row">
          <label>triggerId</label>
          <input v-model="selectedZone.triggerId" type="text">
        </div>
      </template>
      <button class="danger" @click="deleteSelection">
        Delete
      </button>
    </template>

    <!-- Spawn -->
    <template v-else-if="sel.kind === 'spawn'">
      <div class="row">
        <label>spawn x</label>
        <input v-model.number="store.level.value.spawn.x" type="number">
      </div>
      <div class="row">
        <label>spawn y</label>
        <input v-model.number="store.level.value.spawn.y" type="number">
      </div>
    </template>

    <!-- Prowler -->
    <template v-else-if="sel.kind === 'prowler' && selectedProwler">
      <div class="row">
        <label>x</label>
        <input v-model.number="selectedProwler.x" type="number">
      </div>
      <div class="row">
        <label>y</label>
        <input v-model.number="selectedProwler.y" type="number">
      </div>
      <button class="danger" @click="deleteSelection">
        Delete
      </button>
    </template>

    <!-- Dummy -->
    <template v-else-if="sel.kind === 'dummy' && selectedDummy">
      <div class="row">
        <label>x</label>
        <input v-model.number="selectedDummy.x" type="number">
      </div>
      <div class="row">
        <label>y</label>
        <input v-model.number="selectedDummy.y" type="number">
      </div>
      <div class="row">
        <label>hp</label>
        <input
          type="number"
          :value="selectedDummy.hp ?? 1"
          @change="(e) => {
            const n = Number((e.target as HTMLInputElement).value)
            if (Number.isFinite(n) && selectedDummy) {
              if (n === 1) delete selectedDummy.hp
              else selectedDummy.hp = n
            }
          }"
        >
      </div>
      <button class="danger" @click="deleteSelection">
        Delete
      </button>
    </template>

    <!-- Pickup -->
    <template v-else-if="sel.kind === 'pickup' && selectedPickup">
      <div class="row">
        <label>x</label>
        <input v-model.number="selectedPickup.x" type="number">
      </div>
      <div class="row">
        <label>y</label>
        <input v-model.number="selectedPickup.y" type="number">
      </div>
      <div class="row">
        <label>kind</label>
        <select v-model="selectedPickup.kind">
          <option v-for="k in ITEM_KINDS" :key="k" :value="k">
            {{ k }}
          </option>
        </select>
      </div>
      <button class="danger" @click="deleteSelection">
        Delete
      </button>
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
      <button
        class="primary"
        :disabled="!overwriteLabel()"
        :title="overwriteLabel() ? `Overwrite ${overwriteLabel()}` : 'Load a bundled preset or open a file first.'"
        @click="doOverwrite"
      >
        <iconify-icon icon="mdi:content-save-outline" />
        <span>{{ overwriteLabel() ? `Overwrite (${overwriteLabel()})` : 'Overwrite' }}</span>
      </button>
    </div>
    <div class="button-row">
      <button
        :disabled="store.undoStack.value.length === 0"
        title="Ctrl+Z"
        @click="store.undo()"
      >
        <iconify-icon icon="mdi:undo" />
        <span>Undo ({{ store.undoStack.value.length }})</span>
      </button>
      <button
        :disabled="store.redoStack.value.length === 0"
        title="Ctrl+Shift+Z / Ctrl+Y"
        @click="store.redo()"
      >
        <iconify-icon icon="mdi:redo" />
        <span>Redo ({{ store.redoStack.value.length }})</span>
      </button>
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
