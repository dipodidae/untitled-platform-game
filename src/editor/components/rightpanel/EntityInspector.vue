<script setup lang="ts">
import { useEditorStore } from '../../stores/editor'
import type { ItemKind } from '../../../items/types'
import LabeledRow from '../shared/LabeledRow.vue'

// Receives the selection kind so the parent doesn't need to re-derive entity refs.
// The component reads entities directly from the store to avoid stale ref issues.
const props = defineProps<{
  kind: 'spawn' | 'prowler' | 'dummy' | 'pickup'
  index: number
}>()
const emit = defineEmits<{ delete: [] }>()

const store = useEditorStore()

const ITEM_KINDS: ItemKind[] = ['bigShot']
const itemKindItems = ITEM_KINDS.map(k => ({ label: k, value: k }))
</script>

<template>
  <!-- Spawn -->
  <template v-if="props.kind === 'spawn'">
    <LabeledRow label="spawn x">
      <UInput v-model.number="store.level.spawn.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="spawn y">
      <UInput v-model.number="store.level.spawn.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
  </template>

  <!-- Prowler -->
  <template v-else-if="props.kind === 'prowler' && store.level.prowlers[props.index]">
    <LabeledRow label="x">
      <UInput v-model.number="store.level.prowlers[props.index]!.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="y">
      <UInput v-model.number="store.level.prowlers[props.index]!.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="emit('delete')" />
  </template>

  <!-- Dummy -->
  <template v-else-if="props.kind === 'dummy' && store.level.dummies[props.index]">
    <LabeledRow label="x">
      <UInput v-model.number="store.level.dummies[props.index]!.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="y">
      <UInput v-model.number="store.level.dummies[props.index]!.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="hp">
      <UInput
        type="number"
        :model-value="store.level.dummies[props.index]!.hp ?? 1"
        size="xs"
        class="flex-[1.4] min-w-0"
        @change="(e) => {
          const n = Number((e.target as HTMLInputElement).value)
          const d = store.level.dummies[props.index]
          if (Number.isFinite(n) && d) {
            if (n === 1) delete d.hp
            else d.hp = n
          }
        }"
      />
    </LabeledRow>
    <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="emit('delete')" />
  </template>

  <!-- Pickup -->
  <template v-else-if="props.kind === 'pickup' && store.level.pickups[props.index]">
    <LabeledRow label="x">
      <UInput v-model.number="store.level.pickups[props.index]!.x" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="y">
      <UInput v-model.number="store.level.pickups[props.index]!.y" type="number" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <LabeledRow label="kind">
      <USelect v-model="store.level.pickups[props.index]!.kind" :items="itemKindItems" size="xs" class="flex-[1.4] min-w-0" />
    </LabeledRow>
    <UButton color="error" variant="soft" icon="i-mdi-delete-outline" label="Delete" size="xs" @click="emit('delete')" />
  </template>
</template>
