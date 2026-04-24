<template>
  <div class="flex flex-col gap-[6px] p-2 bg-[var(--panel-2)] border border-[var(--border)] rounded">
    <h3 class="m-0 mb-1 text-[11px] tracking-[0.08em] text-[var(--dim)] uppercase font-semibold">
      Shortcuts
    </h3>
    <div class="text-[var(--dim)] text-[11px] leading-[1.4]">
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">Space</span>+drag: pan<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">Wheel</span>: zoom<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">F</span>: frame world<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">Enter</span>: finish polygon<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">Esc</span>: cancel<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">Del</span>: delete selection<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">Shift</span>+click vertex: delete<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">Alt</span>+click edge: insert vertex<br>
      <span class="bg-[var(--bg)] border border-[var(--border)] px-1 rounded-sm text-[10px]">G</span>: motion preview (hold)
    </div>
  </div>
</template>
