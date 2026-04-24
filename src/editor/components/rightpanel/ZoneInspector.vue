<script setup lang="ts">
import type { ZoneJson } from '../../../world/level'
import LabeledRow from '../shared/LabeledRow.vue'

defineProps<{ zone: ZoneJson }>()
const emit = defineEmits<{ delete: [] }>()
</script>

<template>
  <div class="text-[var(--dim)] text-[11px] leading-[1.4]">
    zone #{{ zone.id }} · {{ zone.type }}
  </div>
  <LabeledRow label="x">
    <UInput v-model.number="zone.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
  </LabeledRow>
  <LabeledRow label="y">
    <UInput v-model.number="zone.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
  </LabeledRow>
  <LabeledRow label="w">
    <UInput v-model.number="zone.w" type="number" size="xs" class="flex-[1.4] min-w-0" />
  </LabeledRow>
  <LabeledRow label="h">
    <UInput v-model.number="zone.h" type="number" size="xs" class="flex-[1.4] min-w-0" />
  </LabeledRow>
  <template v-if="zone.type === 'gravity'">
    <LabeledRow label="gravityScale">
      <UInput v-model.number="zone.gravityScale" type="number" step="0.1" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="airControlScale">
      <UInput v-model.number="zone.airControlScale" type="number" step="0.1" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
  </template>
  <template v-else-if="zone.type === 'wind'">
    <LabeledRow label="windVx">
      <UInput v-model.number="zone.windVx" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="windVy">
      <UInput v-model.number="zone.windVy" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="turbulence">
      <UInput v-model.number="zone.windTurbulence" type="number" step="0.01" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
  </template>
  <template v-else-if="zone.type === 'hazard'">
    <LabeledRow label="hazardDamage">
      <UInput v-model.number="zone.hazardDamage" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
  </template>
  <template v-else-if="zone.type === 'trigger'">
    <LabeledRow label="triggerId">
      <UInput v-model="zone.triggerId" type="text" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
  </template>
  <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="emit('delete')" />
</template>
