<script setup lang="ts">
import type { ItemKind } from '../../shared-kernel/types'
import type { MaterialName } from '../../world/level'
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import BrushLibrary from './leftpanel/BrushLibrary.vue'
import ToolStrip from './leftpanel/ToolStrip.vue'

const store = useEditorStore()

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']
const materialItems = MATERIALS.map(m => ({ label: m, value: m }))

const ALL_KINDS: ItemKind[] = ['coin', 'platinumCoin', 'crown', 'healthPack', 'armorShard', 'bigShot']
const kindItems = ALL_KINDS.map(k => ({ label: k, value: k }))

const PICKUP_COLOR: Record<string, string> = {
  coin: '#FFD700',
  platinumCoin: '#C0C0E0',
  crown: '#FFE880',
  healthPack: '#30FF50',
  armorShard: '#4080FF',
  bigShot: '#FFA030',
}
const kindColor = computed(() => PICKUP_COLOR[store.pendingPickupKind] ?? '#FF6040')
</script>

<template>
  <ToolStrip />
  <BrushLibrary />

  <!-- Active pickup kind — shows when the pickup tool is selected -->
  <div
    v-if="store.tool === 'pickup'"
    class="flex flex-col gap-2 p-3 bg-[var(--panel-2)] border border-[var(--border)] rounded"
  >
    <h3 class="m-0 mb-0.5 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      Pickup Kind
    </h3>
    <div class="flex gap-2 items-center">
      <span
        class="w-3 h-3 rounded-full flex-shrink-0 border border-[var(--border)]"
        :style="{ background: kindColor }"
      />
      <USelect
        v-model="store.pendingPickupKind"
        :items="kindItems"
        size="xs"
        class="flex-1 min-w-0"
      />
    </div>
    <div class="text-[var(--dim)] text-[10px] leading-[1.3] opacity-70">
      Click on the canvas to place. Or pick a brush above to switch kind.
    </div>
  </div>

  <!-- New Shape Material section -->
  <div class="flex flex-col gap-2 p-3 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-0.5 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      New Shape Material
    </h3>
    <div class="flex gap-2 items-center">
      <label class="flex-1 text-[var(--dim)]">material</label>
      <USelect
        v-model="store.createMaterial"
        :items="materialItems"
        size="xs"
        class="flex-[1.4] min-w-0"
      />
    </div>
  </div>
</template>
