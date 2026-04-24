<script setup lang="ts">
import type { EditorCollider } from '../../stores/editor'
import LabeledRow from '../shared/LabeledRow.vue'

const props = defineProps<{ collider: EditorCollider }>()

const MATERIAL_ITEMS = [
  { label: 'bone', value: 'bone' },
  { label: 'bone_fragile', value: 'bone_fragile' },
  { label: 'glass', value: 'glass' },
  { label: 'resonant', value: 'resonant' },
  { label: 'soft', value: 'soft' },
]

const kineticTypeItems = [
  { label: 'none', value: 'none' },
  { label: 'rotor', value: 'rotor' },
  { label: 'breather', value: 'breather' },
  { label: 'spring', value: 'spring' },
]

function getKineticType(): string {
  return props.collider.kinetic?.type ?? 'none'
}

function setKineticType(v: string) {
  const c = props.collider
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
  const k = props.collider.kinetic
  if (!k)
    return []
  return Object.entries(k).filter(([key]) => key !== 'type')
}

function setKineticField(key: string, val: unknown) {
  const c = props.collider
  if (!c.kinetic)
    return
  ;(c.kinetic as unknown as Record<string, unknown>)[key] = val
}

function getConveyor(): boolean {
  const c = props.collider
  return !!(c.surfaceMotion && c.surfaceMotion.vx !== 0)
}
function setConveyor(on: boolean) {
  const c = props.collider
  if (on)
    c.surfaceMotion = { vx: 80 }
  else delete c.surfaceMotion
}

function getLaunchPad(): boolean {
  return !!props.collider.launchPad
}
function setLaunchPad(on: boolean) {
  const c = props.collider
  if (on)
    c.launchPad = { force: 420, angle: 0 }
  else delete c.launchPad
}

function parsePathJson(val: string): [number, number][] | null {
  try {
    return JSON.parse(val) as [number, number][]
  }
  catch {
    return null
  }
}

const emit = defineEmits<{ delete: [] }>()
</script>

<template>
  <div class="text-[var(--dim)] text-[11px] leading-[1.4]">
    collider #{{ collider.id }} · {{ collider.vertices.length }} verts
  </div>

  <LabeledRow label="material">
    <USelect v-model="collider.material" :items="MATERIAL_ITEMS" size="xs" class="flex-[1.4] min-w-0" />
  </LabeledRow>

  <LabeledRow label="oneWay">
    <UCheckbox
      :model-value="!!collider.oneWay"
      size="sm"
      @update:model-value="(v) => {
        if (v) collider.oneWay = true
        else delete collider.oneWay
      }"
    />
  </LabeledRow>

  <LabeledRow label="kinetic">
    <USelect
      :model-value="getKineticType()"
      :items="kineticTypeItems"
      size="xs"
      class="flex-[1.4] min-w-0"
      @update:model-value="setKineticType"
    />
  </LabeledRow>

  <!-- Kinetic fields -->
  <template v-for="[key, val] in getKineticEntries()" :key="key">
    <div v-if="Array.isArray(val)" class="flex gap-[6px] items-center">
      <label class="flex-1 text-[var(--dim)]">{{ key }}</label>
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
    <div v-else-if="typeof val === 'string'" class="flex gap-[6px] items-center">
      <label class="flex-1 text-[var(--dim)]">{{ key }}</label>
      <UInput
        type="text"
        :model-value="val"
        size="xs"
        class="flex-[1.4] min-w-0"
        @change="(e) => setKineticField(key, (e.target as HTMLInputElement).value)"
      />
    </div>
    <div v-else class="flex gap-[6px] items-center">
      <label class="flex-1 text-[var(--dim)]">{{ key }}</label>
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
  <LabeledRow label="conveyor">
    <UCheckbox
      :model-value="getConveyor()"
      size="sm"
      @update:model-value="setConveyor"
    />
  </LabeledRow>
  <LabeledRow v-if="collider.surfaceMotion && collider.surfaceMotion.vx !== 0" label="surface vx">
    <UInput
      type="number"
      :model-value="collider.surfaceMotion.vx"
      size="xs"
      class="flex-[1.4] min-w-0"
      @change="(e) => {
        const n = Number((e.target as HTMLInputElement).value)
        if (Number.isFinite(n)) collider.surfaceMotion = { vx: n }
      }"
    />
  </LabeledRow>

  <!-- Launch pad -->
  <LabeledRow label="launch pad">
    <UCheckbox
      :model-value="getLaunchPad()"
      size="sm"
      @update:model-value="setLaunchPad"
    />
  </LabeledRow>
  <template v-if="collider.launchPad">
    <LabeledRow label="force">
      <UInput
        type="number"
        :model-value="collider.launchPad.force"
        size="xs"
        class="flex-[1.4] min-w-0"
        @change="(e) => {
          const n = Number((e.target as HTMLInputElement).value)
          if (Number.isFinite(n) && collider.launchPad) collider.launchPad.force = n
        }"
      />
    </LabeledRow>
    <LabeledRow label="angle (rad)">
      <UInput
        type="number"
        :model-value="collider.launchPad.angle ?? 0"
        size="xs"
        class="flex-[1.4] min-w-0"
        @change="(e) => {
          const n = Number((e.target as HTMLInputElement).value)
          if (Number.isFinite(n) && collider.launchPad) collider.launchPad.angle = n
        }"
      />
    </LabeledRow>
  </template>

  <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="emit('delete')" />
</template>
