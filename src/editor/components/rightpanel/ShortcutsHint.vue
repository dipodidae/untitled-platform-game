<script setup lang="ts">
const SHORTCUTS: { key: string, desc: string }[] = [
  { key: 'Space', desc: '+drag: pan' },
  { key: 'Wheel', desc: ': zoom' },
  { key: 'F', desc: ': frame world' },
  { key: 'Enter', desc: ': finish poly' },
  { key: 'Esc', desc: ': cancel' },
  { key: 'Del', desc: ': delete sel.' },
  { key: 'Shift', desc: '+vtx: delete' },
  { key: 'Alt', desc: '+edge: insert' },
  { key: 'G', desc: ': motion (hold)' },
]
</script>

<template>
  <div class="flex flex-col gap-[6px] p-2 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-1 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      Shortcuts
    </h3>
    <div class="flex flex-col gap-1 text-[var(--dim)] text-[11px]">
      <div
        v-for="s in SHORTCUTS"
        :key="s.key"
        class="flex items-center gap-1.5 whitespace-nowrap overflow-hidden"
      >
        <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px] font-semibold text-[var(--text)] shrink-0">{{ s.key }}</span>
        <span class="overflow-hidden text-ellipsis">{{ s.desc }}</span>
      </div>
    </div>
  </div>
</template>
