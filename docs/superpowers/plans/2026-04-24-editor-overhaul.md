# Editor Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the level editor into a four-zone cockpit (top bar · left tools · viewport · right inspector · bottom status) and add transform gizmos, motion preview, layer toggles, ghost placement previews, and a clickable undo stack.

**Architecture:** Same plain-record observer pattern (`EditorState.listeners`). Pixi v8 canvas in the viewport, unchanged. Sidebar decomposes into `ui/leftPanel.ts` + `ui/rightPanel.ts`. New `ui/topBar.ts` and `ui/bottomBar.ts` handle menus and stats. Transform gizmo and motion preview reuse existing `scalePolygon` and kinetic update functions.

**Tech Stack:** TypeScript (strict, noUncheckedIndexedAccess), PixiJS v8, Vite, plain DOM (no framework). No test runner — verification uses `npm run typecheck`, `npm run lint`, and manual browser checks on `http://localhost:5173/editor.html`.

**Spec:** `docs/superpowers/specs/2026-04-24-editor-overhaul-design.md`

## Notes for the implementer

- This repo has **no test runner**. "Run tests" steps are replaced with `npm run typecheck` + targeted manual verification in the editor UI.
- `npm run lint` has pre-existing errors in files outside the editor — don't fix those unless a task explicitly says so. Only add no *new* errors in files you touch.
- Strict TS with `noUncheckedIndexedAccess` and `noUnusedLocals`/`noUnusedParameters` — every array lookup returns `T | undefined` and every local must be used.
- ESLint is `@antfu/eslint-config` (stylistic). Common gotchas: imports sorted alphabetically, `if (cond) stmt` must have a newline, no multi-statement arrow callbacks on one line.
- Commits: after each task's verification step, commit with a conventional message. Co-author line is optional for manual work.
- The editor state already has `activeFileHandle`, `activeFileName`, `activePresetName` (added in the preceding Overwrite bugfix). Don't reintroduce them as module-level vars.

---

## Task 1: Reshape editor.html + CSS grid to the four-zone layout

**Files:**
- Modify: `editor.html` (whole body)
- Modify: `src/editor/style.css:24-73` (`#app`, `#sidebar`, `#status-bar` rules)

**Context:** Today `#app` is a 2-column grid (sidebar 260px | canvas) with `#status-bar` spanning the bottom of the canvas column. We need 3 columns (left 220 | viewport 1fr | right 260) and 3 rows (top 32 | middle 1fr | bottom 28). The sidebar DOM is deleted in a later task; for now we add empty `#left-panel`, `#right-panel`, `#top-bar` hosts alongside the existing `#sidebar` and keep the old one populated until we migrate.

- [ ] **Step 1: Read the current editor.html**

```bash
cat editor.html
```

Expected: `<body>` with `#app > #sidebar + #canvas-host + #minimap-host + #status-bar` and a `<script type="module" src="/src/editor/main.ts">` at the bottom.

- [ ] **Step 2: Replace the body scaffolding with five hosts**

Edit `editor.html` so the `<body>` contains:

```html
<body>
  <div id="app">
    <div id="top-bar"></div>
    <div id="left-panel"></div>
    <div id="canvas-host">
      <div id="minimap-host"></div>
    </div>
    <div id="right-panel"></div>
    <div id="bottom-bar"></div>
  </div>
  <script type="module" src="/src/editor/main.ts"></script>
</body>
```

Keep `<head>` unchanged.

- [ ] **Step 3: Rewrite the grid in style.css**

Replace the `#app`, `#sidebar`, `#status-bar`, and `#canvas-host` rules in `src/editor/style.css:24-73` with:

```css
#app {
  display: grid;
  grid-template-columns: 220px 1fr 260px;
  grid-template-rows: 32px 1fr 28px;
  height: 100%;
}

#top-bar {
  grid-column: 1 / -1;
  background: var(--panel-2);
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 0 10px;
  font-size: 11px;
}

#left-panel {
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#right-panel {
  background: var(--panel);
  border-left: 1px solid var(--border);
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#canvas-host {
  position: relative;
  overflow: hidden;
  background: #0a0b0f;
}

#canvas-host canvas { display: block; }

#minimap-host {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 200px;
  height: 120px;
  background: rgba(0,0,0,0.6);
  border: 1px solid var(--border);
  pointer-events: auto;
  z-index: 10;
}

#minimap-host canvas { display: block; width: 100%; height: 100%; }

#bottom-bar {
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
```

Delete the old `#sidebar` and `#status-bar` rules entirely.

- [ ] **Step 4: Stub main.ts to mount the new hosts**

Modify `src/editor/main.ts` `main()` so it queries `document.getElementById('top-bar')`, `'left-panel'`, `'right-panel'`, `'bottom-bar'` instead of `'sidebar'` and `'status-bar'`. For now, paste the existing `mountSidebar(sidebarHost, ...)` call onto `leftPanelHost` so something renders. Keep `mountStatus(bottomBarHost, ...)` for the status bar content. Remove references to the old hosts.

Exact replacement for the host query block:

```ts
const topBarHost = document.getElementById('top-bar')!
const leftPanelHost = document.getElementById('left-panel')!
const rightPanelHost = document.getElementById('right-panel')!
const canvasHost = document.getElementById('canvas-host')!
const minimapHost = document.getElementById('minimap-host')!
const bottomBarHost = document.getElementById('bottom-bar')!
```

And update the mount calls:

```ts
mountSidebar(leftPanelHost, state, {
  onFrame: () => frameWorldViewport(canvas),
})
mountStatus(bottomBarHost, state, BUNDLED)
```

Leave `topBarHost` and `rightPanelHost` unused for now — they'll be wired in later tasks. Prefix with `_` to satisfy `noUnusedLocals` if needed: `const _topBarHost = ...`.

- [ ] **Step 5: Verify typecheck and visual layout**

```bash
npm run typecheck
```

Expected: PASS.

```bash
npm run dev
```

Open `http://localhost:5173/editor.html`. Expected: top bar strip visible (empty), left panel with the old sidebar content, empty right panel, canvas in the middle with minimap in bottom-right, bottom bar with preset dropdown + stats + back link.

- [ ] **Step 6: Commit**

```bash
git add editor.html src/editor/style.css src/editor/main.ts
git commit -m "refactor(editor): 4-zone grid layout scaffolding"
```

---

## Task 2: Create ui/ directory and move toast helper

**Files:**
- Create: `src/editor/ui/toast.ts`
- Modify: `src/editor/sidebar.ts` (remove inline toast, import from new location)

**Context:** `showToast` was added during the Overwrite bugfix and lives in `sidebar.ts`. It needs to survive the sidebar decomposition, so pull it out first into its own file that can be imported anywhere.

- [ ] **Step 1: Create the toast module**

Write `src/editor/ui/toast.ts`:

```ts
// Lightweight toast — one at a time, auto-dismisses. Used for save feedback
// and "preview-only brush" warnings so actions don't feel silent.

let toastEl: HTMLDivElement | null = null
let toastTimer: number | null = null

export function showToast(message: string, kind: 'ok' | 'err' = 'ok'): void {
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.className = 'editor-toast'
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = message
  toastEl.dataset.kind = kind
  toastEl.classList.add('visible')
  if (toastTimer != null)
    window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastEl?.classList.remove('visible')
  }, 2400)
}
```

- [ ] **Step 2: Remove the inline toast from sidebar.ts**

Delete the `showToast` function, `toastEl`, and `toastTimer` declarations from `src/editor/sidebar.ts` (they were added just before `downloadJson`). Add an import at the top:

```ts
import { showToast } from './ui/toast'
```

Keep the `export function showToast` removed — there's a single source now.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor and click Overwrite on the bundled level — confirm prompt appears, on accept you see the "Saved level1.json" toast in the top-right.

- [ ] **Step 4: Commit**

```bash
git add src/editor/ui/toast.ts src/editor/sidebar.ts
git commit -m "refactor(editor): extract toast helper to ui/toast.ts"
```

---

## Task 3: Extract leftPanel from sidebar (tools + brushes + materials)

**Files:**
- Create: `src/editor/ui/leftPanel.ts`
- Modify: `src/editor/sidebar.ts` (remove tool/brush/material sections)
- Modify: `src/editor/main.ts` (mount leftPanel instead of sidebar for those sections)

**Context:** The current `sidebar.ts` renders six sections: `toolSection`, `brushSection`, `createSection` (material picker), `worldSection`, `gridSection`, `selectionSection`, `ioSection`, `hintSection`. We split into two panels: left = tools/brushes/materials; right = world/selection/grid/io/hints. This task owns the left half.

- [ ] **Step 1: Read sidebar.ts to identify the sections to move**

```bash
grep -n "^function .*Section\|^export function mountSidebar" src/editor/sidebar.ts
```

Expected: listings for `toolSection`, `brushSection`, `createSection`, `worldSection`, `gridSection`, `selectionSection`, `ioSection`, `hintSection`, `mountSidebar`.

- [ ] **Step 2: Create leftPanel.ts with the tools/brushes/materials sections**

Write `src/editor/ui/leftPanel.ts`. Copy the three functions `toolSection`, `brushSection`, `createSection` verbatim from `sidebar.ts` into this file. Also copy the local constants they depend on: `TOOLS`, `MATERIALS`, the `section()` helper, `setTool` helper, and any other private helpers they reference (trace imports carefully — read the entire sidebar.ts first to find them).

Structure:

```ts
// Left panel — tool palette, brush library, and material picker.

import type { ItemKind } from '../../items/types'
import type { MaterialName } from '../../world/level'
import type { EditorState, Tool } from '../state'
import { BRUSH_CATEGORY_LABEL, BRUSHES } from '../brushes'
import { markDirty } from '../state'

const TOOLS: { id: Tool, label: string, hint: string }[] = [
  // ...copy from sidebar.ts
]

const MATERIALS: MaterialName[] = ['bone', 'bone_fragile', 'glass', 'resonant', 'soft']
const ITEM_KINDS: ItemKind[] = ['bigShot']

export function mountLeftPanel(host: HTMLElement, state: EditorState): void {
  const render = (): void => {
    host.innerHTML = ''
    host.appendChild(toolSection(state))
    host.appendChild(brushSection(state))
    host.appendChild(createSection(state))
  }
  state.listeners.add(render)
  render()
}

function section(title: string): HTMLElement {
  const s = document.createElement('section')
  s.className = 'section'
  const h = document.createElement('h3')
  h.textContent = title
  s.appendChild(h)
  return s
}

function setTool(state: EditorState, tool: Tool): void {
  state.tool = tool
  markDirty(state)
}

// toolSection, brushSection, createSection function bodies copied here
// — adjust import paths (e.g. '../brushes' not './brushes') as needed.
```

The exact bodies of the three section functions come from reading `sidebar.ts`. Copy them verbatim but adjust any `./foo` imports to `../foo`. Do NOT paraphrase — preserve the existing behavior byte-for-byte.

- [ ] **Step 3: Delete those sections from sidebar.ts**

Remove the `toolSection`, `brushSection`, `createSection`, `TOOLS`, `MATERIALS`, `ITEM_KINDS`, `setTool` definitions from `sidebar.ts`. The `section()` helper stays (still used by the remaining sections).

In `mountSidebar`'s `render()`, remove the three `host.appendChild(toolSection(...))` etc. lines.

- [ ] **Step 4: Mount both panels in main.ts**

Update `src/editor/main.ts`:

```ts
import { mountLeftPanel } from './ui/leftPanel'
// existing imports unchanged

// in main():
mountLeftPanel(leftPanelHost, state)
mountSidebar(rightPanelHost, state, {
  onFrame: () => frameWorldViewport(canvas),
})
```

The right panel now hosts the remaining sidebar sections (world/grid/selection/io/hints). Task 4 will split that up.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm run lint src/editor/
```

Expected: typecheck passes. Lint may have pre-existing errors elsewhere but nothing new in `src/editor/ui/leftPanel.ts`.

Open the editor. Left panel shows Tools + Brushes + Materials. Right panel shows world size, grid, selection props, save/load, shortcuts. Click a tool — it selects. Click a brush — it arms and the material picker reflects its material.

- [ ] **Step 6: Commit**

```bash
git add src/editor/ui/leftPanel.ts src/editor/sidebar.ts src/editor/main.ts
git commit -m "refactor(editor): extract left panel (tools, brushes, materials)"
```

---

## Task 4: Extract rightPanel from sidebar (world, grid, selection, IO, hints)

**Files:**
- Create: `src/editor/ui/rightPanel.ts`
- Delete: `src/editor/sidebar.ts`
- Modify: `src/editor/main.ts`

**Context:** Move the remaining five sections into `rightPanel.ts`, then delete `sidebar.ts` entirely. Same approach: copy-paste function bodies, adjust import paths.

- [ ] **Step 1: Create rightPanel.ts**

Write `src/editor/ui/rightPanel.ts`. Copy from `sidebar.ts`:

- `worldSection`, `gridSection`, `selectionSection`, `ioSection`, `hintSection`
- Helpers: `section()`, `numberInput()`, `fsaSupport()`, `overwriteLabel()`, `overwritePreset()`, `downloadJson()`, `openLoadDialog()`
- Anything else referenced by those (follow imports)

```ts
// Right panel — world settings (when nothing selected), entity inspector,
// grid/snap, save/load, and shortcuts.

import type { ItemKind } from '../../items/types'
import type { EditorState } from '../state'
import { showToast } from './toast'
import {
  allocId,
  fromLevelJson,
  markDirty,
  pushUndo,
  redo,
  toLevelJson,
  undo,
} from '../state'

export function mountRightPanel(
  host: HTMLElement,
  state: EditorState,
  opts: { onFrame: () => void },
): void {
  const render = (): void => {
    host.innerHTML = ''
    host.appendChild(worldSection(state))
    host.appendChild(gridSection(state))
    host.appendChild(selectionSection(state))
    host.appendChild(ioSection(state))
    host.appendChild(hintSection(opts))
  }
  state.listeners.add(render)
  render()
}

// ...all copied function bodies below
```

The section function bodies are copied verbatim from `sidebar.ts`. Adjust `./foo` → `../foo` for imports from the `editor/` directory.

- [ ] **Step 2: Delete sidebar.ts**

```bash
rm src/editor/sidebar.ts
```

- [ ] **Step 3: Update main.ts**

Replace the `import { mountSidebar } from './sidebar'` line with:

```ts
import { mountRightPanel } from './ui/rightPanel'
```

Replace the call:

```ts
mountRightPanel(rightPanelHost, state, {
  onFrame: () => frameWorldViewport(canvas),
})
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
```

Expected: PASS. If errors mention missing helpers in rightPanel.ts, check which private helper wasn't copied across.

Open the editor. Right panel shows world size, grid, selection props (when something is selected), save/load, and shortcuts. Overwrite still works with confirm prompt + toast.

- [ ] **Step 5: Commit**

```bash
git add src/editor/ui/rightPanel.ts src/editor/main.ts
git rm src/editor/sidebar.ts
git commit -m "refactor(editor): extract right panel, remove sidebar.ts"
```

---

## Task 5: Build top bar with File menu, Presets, and Playtest

**Files:**
- Create: `src/editor/ui/topBar.ts`
- Modify: `src/editor/main.ts` (mount topBar, drop mountStatus preset dropdown)
- Modify: `src/editor/ui/rightPanel.ts` (remove io buttons that move to File menu; keep Overwrite in-panel)

**Context:** The top bar hosts a lightweight menu: **File** (New blank, Open File…, Download JSON, Copy JSON), **Presets** (bundled-level dropdown moved from the old status bar), **Playtest** (← back to game link). Overwrite stays in the right-panel IO section because it's action-frequent. View menu (layer toggles) comes in Task 8.

- [ ] **Step 1: Create topBar.ts**

Write `src/editor/ui/topBar.ts`:

```ts
// Top bar — File menu, bundled-preset dropdown, playtest link.
// Keeps frequent actions close at hand without cluttering the left panel.

import type { LevelJson } from '../../world/level'
import type { EditorState } from '../state'
import { showToast } from './toast'
import { fromLevelJson, markDirty, toLevelJson } from '../state'

interface BundledLevel {
  name: string
  data: LevelJson
}

export function mountTopBar(
  host: HTMLElement,
  state: EditorState,
  bundled: BundledLevel[],
): void {
  host.innerHTML = ''

  const fileMenu = buildFileMenu(state)
  host.appendChild(fileMenu)

  const presetSel = buildPresetSelect(state, bundled)
  host.appendChild(presetSel)

  const spacer = document.createElement('div')
  spacer.style.flex = '1'
  host.appendChild(spacer)

  const playtest = document.createElement('a')
  playtest.href = './'
  playtest.textContent = '← playtest'
  playtest.style.color = 'var(--dim)'
  host.appendChild(playtest)
}

function buildFileMenu(state: EditorState): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'topbar-menu'

  const btn = document.createElement('button')
  btn.textContent = 'File'
  wrap.appendChild(btn)

  const pop = document.createElement('div')
  pop.className = 'topbar-popover'
  pop.hidden = true
  wrap.appendChild(pop)

  btn.onclick = () => { pop.hidden = !pop.hidden }

  const newBlank = menuItem('New blank', () => {
    if (!confirm('Clear the current level and start blank?')) return
    state.level = fromLevelJson({
      spawn: { x: 80, y: 300 },
      worldWidth: 3200,
      worldHeight: 720,
      colliders: [
        { id: 1, material: 'bone', vertices: [[0, 500], [3200, 500], [3200, 600], [0, 600]] },
      ],
    })
    state.selection = null
    state.activeFileHandle = null
    state.activeFileName = null
    state.activePresetName = null
    markDirty(state)
    pop.hidden = true
  })
  pop.appendChild(newBlank)

  const open = menuItem('Open File…', async () => {
    pop.hidden = true
    const w = window as unknown as {
      showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle[]>
    }
    if (typeof w.showOpenFilePicker !== 'function') {
      openFallbackLoader(state)
      return
    }
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'Level JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      })
      if (!handle) return
      state.activeFileHandle = handle
      state.activeFileName = handle.name
      state.activePresetName = null
      const file = await handle.getFile()
      state.level = fromLevelJson(JSON.parse(await file.text()))
      state.selection = null
      state.undoStack.length = 0
      state.redoStack.length = 0
      markDirty(state)
    }
    catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
      showToast(`Open failed: ${String((e as Error).message ?? e)}`, 'err')
    }
  })
  pop.appendChild(open)

  const download = menuItem('Download JSON', () => {
    const blob = new Blob([`${JSON.stringify(toLevelJson(state.level), null, 2)}\n`], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'level.json'
    a.click()
    URL.revokeObjectURL(url)
    pop.hidden = true
  })
  pop.appendChild(download)

  const copy = menuItem('Copy JSON', async () => {
    await navigator.clipboard.writeText(JSON.stringify(toLevelJson(state.level), null, 2))
    showToast('Copied to clipboard')
    pop.hidden = true
  })
  pop.appendChild(copy)

  // Close the popover when clicking outside it.
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) pop.hidden = true
  })

  return wrap
}

function buildPresetSelect(state: EditorState, bundled: BundledLevel[]): HTMLElement {
  const sel = document.createElement('select')
  const def = document.createElement('option')
  def.value = ''
  def.textContent = '— load bundled —'
  def.disabled = true
  def.selected = true
  sel.appendChild(def)
  for (const b of bundled) {
    const o = document.createElement('option')
    o.value = b.name
    o.textContent = b.name
    sel.appendChild(o)
  }
  sel.onchange = () => {
    const chosen = bundled.find(b => b.name === sel.value)
    if (chosen) {
      state.level = fromLevelJson(chosen.data)
      state.selection = null
      state.activeFileHandle = null
      state.activeFileName = null
      state.activePresetName = chosen.name
      state.undoStack.length = 0
      state.redoStack.length = 0
      markDirty(state)
      showToast(`Loaded ${chosen.name}`)
    }
    sel.value = ''
  }
  return sel
}

function menuItem(label: string, onClick: () => void | Promise<void>): HTMLElement {
  const b = document.createElement('button')
  b.textContent = label
  b.className = 'topbar-menu-item'
  b.onclick = () => { void onClick() }
  return b
}

function openFallbackLoader(state: EditorState): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f) return
    try {
      state.level = fromLevelJson(JSON.parse(await f.text()))
      state.selection = null
      markDirty(state)
    }
    catch (e) {
      showToast(`Failed to parse JSON: ${String(e)}`, 'err')
    }
  }
  input.click()
}
```

- [ ] **Step 2: Style the menu in style.css**

Append to `src/editor/style.css`:

```css
.topbar-menu {
  position: relative;
}

.topbar-menu > button {
  background: transparent;
  color: var(--text);
  border: none;
  padding: 6px 10px;
  cursor: pointer;
  font: inherit;
}

.topbar-menu > button:hover { background: var(--border); }

.topbar-popover {
  position: absolute;
  top: 100%;
  left: 0;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 0 0 4px 4px;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  z-index: 20;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.topbar-menu-item {
  background: transparent;
  border: none;
  text-align: left;
  padding: 6px 10px;
  color: var(--text);
  cursor: pointer;
  font: inherit;
}

.topbar-menu-item:hover { background: var(--border); }
```

- [ ] **Step 3: Wire topBar in main.ts, drop mountStatus**

Delete the `mountStatus` function from `main.ts` and its call. Replace with:

```ts
import { mountTopBar } from './ui/topBar'

// inside main():
mountTopBar(topBarHost, state, BUNDLED)
```

The bottom bar is still empty; Task 7 fills it with stats.

- [ ] **Step 4: Remove duplicated IO buttons from rightPanel.ts**

In the `ioSection` function, delete the "Download JSON", "Open File…", "Load JSON…", "New blank", and "Copy JSON" buttons — those now live in the File menu. Keep **Overwrite** and **Undo / Redo** rows in the IO section.

- [ ] **Step 5: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Top bar: **File** opens a dropdown with New blank / Open File / Download / Copy; preset dropdown loads bundled levels and toasts "Loaded level1"; playtest link at the right. Right-panel Save/Load section only shows Overwrite + Undo/Redo. Overwrite still works (toast appears).

- [ ] **Step 6: Commit**

```bash
git add src/editor/ui/topBar.ts src/editor/style.css src/editor/main.ts src/editor/ui/rightPanel.ts
git commit -m "feat(editor): top bar with File menu and preset loader"
```

---

## Task 6: Add bottomBar with live stats

**Files:**
- Create: `src/editor/ui/bottomBar.ts`
- Modify: `src/editor/main.ts`

**Context:** Bottom bar shows live entity counts and world size (replacing the content of the old `mountStatus`). The undo-stack strip is added in Task 10.

- [ ] **Step 1: Create bottomBar.ts**

Write `src/editor/ui/bottomBar.ts`:

```ts
// Bottom bar — live entity counts. Undo strip is attached in a later task.

import type { EditorState } from '../state'

export function mountBottomBar(host: HTMLElement, state: EditorState): void {
  host.innerHTML = ''

  const stats = document.createElement('span')
  host.appendChild(stats)

  const render = (): void => {
    const lv = state.level
    stats.textContent = [
      `colliders: ${lv.colliders.length}`,
      `zones: ${lv.zones.length}`,
      `prowlers: ${lv.prowlers.length}`,
      `dummies: ${lv.dummies.length}`,
      `pickups: ${lv.pickups.length}`,
      `world: ${lv.worldWidth}×${lv.worldHeight}`,
    ].join(' · ')
  }
  state.listeners.add(render)
  render()
}
```

- [ ] **Step 2: Mount in main.ts**

```ts
import { mountBottomBar } from './ui/bottomBar'

// inside main():
mountBottomBar(bottomBarHost, state)
```

- [ ] **Step 3: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Bottom bar shows live stats; they update as you create/delete colliders, zones, entities.

- [ ] **Step 4: Commit**

```bash
git add src/editor/ui/bottomBar.ts src/editor/main.ts
git commit -m "feat(editor): bottom bar with live entity stats"
```

---

## Task 7: Add layer-visibility state and View-menu toggle

**Files:**
- Modify: `src/editor/state.ts` (add `layers` field)
- Modify: `src/editor/canvas.ts` (branch rendering on flags)
- Modify: `src/editor/ui/topBar.ts` (add View menu)

**Context:** Layer toggles let you hide categories of overlays (zones, entity labels, etc.) while you work. Implementation: booleans on `EditorState`, read by the canvas render function, toggled via a View-menu popover.

- [ ] **Step 1: Add layers field to EditorState**

In `src/editor/state.ts`:

Append to the `EditorState` interface (before `listeners`):

```ts
layers: {
  colliders: boolean
  zones: boolean
  wind: boolean
  enemyRanges: boolean
  paths: boolean
  entityLabels: boolean
  grid: boolean
}
```

In `createEditorState`, add:

```ts
layers: {
  colliders: true,
  zones: true,
  wind: true,
  enemyRanges: true,
  paths: true,
  entityLabels: true,
  grid: true,
},
```

- [ ] **Step 2: Gate canvas rendering on the flags**

Open `src/editor/canvas.ts` and find the render loop that draws colliders, zones, enemies, pickups, grid, etc. Wrap each category's draw block in a branch like `if (state.layers.colliders)`. For `paths`, extend the kinetic-linear rendering (if drawn today) behind `state.layers.paths`. For `wind`, any zone-arrow rendering branches on `state.layers.wind && zone.type === 'wind'`. If a category isn't drawn today, skip — Task 11 adds path visualization as part of its own work.

Since `canvas.ts` is substantial, the exact edits will be grep-driven:

```bash
grep -n "draw\|render\|colliders\|zones" src/editor/canvas.ts | head -40
```

For each category found, wrap its section in the appropriate `if (state.layers.<flag>)` guard.

- [ ] **Step 3: Add View menu to topBar.ts**

In `src/editor/ui/topBar.ts`, after the `buildFileMenu(state)` append, insert a `buildViewMenu(state)`:

```ts
const viewMenu = buildViewMenu(state)
host.appendChild(viewMenu)
```

Add the function:

```ts
import { markDirty } from '../state'

function buildViewMenu(state: EditorState): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'topbar-menu'

  const btn = document.createElement('button')
  btn.textContent = 'View'
  wrap.appendChild(btn)

  const pop = document.createElement('div')
  pop.className = 'topbar-popover'
  pop.hidden = true
  wrap.appendChild(pop)

  btn.onclick = () => { pop.hidden = !pop.hidden }

  const layers: [keyof EditorState['layers'], string][] = [
    ['colliders', 'Colliders'],
    ['zones', 'Zones'],
    ['wind', 'Wind arrows'],
    ['paths', 'Kinetic paths'],
    ['enemyRanges', 'Enemy ranges'],
    ['entityLabels', 'Entity labels'],
    ['grid', 'Grid'],
  ]

  for (const [key, label] of layers) {
    const row = document.createElement('label')
    row.className = 'topbar-menu-item'
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '6px'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = state.layers[key]
    cb.onchange = () => {
      state.layers[key] = cb.checked
      markDirty(state)
    }
    row.appendChild(cb)
    row.appendChild(document.createTextNode(label))
    pop.appendChild(row)
  }

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) pop.hidden = true
  })

  return wrap
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Top bar: click **View**, uncheck "Zones" — zone rectangles disappear. Uncheck "Grid" — grid lines disappear. Re-check to restore.

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts src/editor/canvas.ts src/editor/ui/topBar.ts
git commit -m "feat(editor): layer-visibility toggles in View menu"
```

---

## Task 8: Mark non-runtime brushes as "preview"

**Files:**
- Modify: `src/editor/brushes.ts` (add `live: boolean` to each brush)
- Modify: `src/editor/ui/leftPanel.ts` (dim preview brushes, toast on click)

**Context:** Brushes for toggles, timers, rhythm, guidance (arc hints, collectible trails), and meta (modifier, group/link, state stack) have no runtime support. Mark them honestly so authors know they're placeholders.

- [ ] **Step 1: Add live flag to each brush**

Open `src/editor/brushes.ts`. Each brush is a record in the `BRUSHES` array. Add `live: true` or `live: false` to each. Live brushes (runtime exists): all Movement brushes (linear, rotor, spring, breather, one-way, bounce, conveyor), all Hazard brushes (spike, sweeping, environmental volume), Pickup. Preview brushes (no runtime): Timing/Logic (trigger volume, toggle, timer), Guidance (arc hint, collectible trail), Meta (modifier, group/link, state stack).

Extend the type in `brushes.ts`:

```ts
export interface Brush {
  id: string
  label: string
  category: string
  live: boolean
  apply: (s: EditorState) => void
}
```

Add `live: true` or `live: false` to every entry in `BRUSHES`. If you're unsure, consult the "Reality vs. Spec" table in `docs/superpowers/specs/2026-04-24-editor-overhaul-design.md`.

- [ ] **Step 2: Render preview brushes dimmed + warn on click in leftPanel.ts**

In the `brushSection` function, when rendering each brush button, branch on `brush.live`:

```ts
const btn = document.createElement('button')
btn.textContent = brush.live ? brush.label : `${brush.label} · preview`
if (!brush.live) {
  btn.style.opacity = '0.55'
  btn.title = 'No runtime effect yet — brush is a placeholder.'
}
btn.onclick = () => {
  if (!brush.live) showToast(`${brush.label}: no runtime effect yet`, 'err')
  brush.apply(state)
  markDirty(state)
}
```

Add `import { showToast } from './toast'` at the top of `leftPanel.ts`.

- [ ] **Step 3: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Timing/Logic + Guidance + Meta brushes are dimmed with "· preview" suffix. Clicking one toasts the warning but still arms the brush (so the author can still place placeholder data for the future).

- [ ] **Step 4: Commit**

```bash
git add src/editor/brushes.ts src/editor/ui/leftPanel.ts
git commit -m "feat(editor): mark preview brushes (no runtime) as dimmed"
```

---

## Task 9: Label undo entries and expose a visual undo stack

**Files:**
- Modify: `src/editor/state.ts` (change `undoStack: string[]` to `{ snap: string, label: string }[]`, add label param to `pushUndo`)
- Modify: `src/editor/canvas.ts` (update `pushUndo` calls with labels)
- Modify: `src/editor/ui/rightPanel.ts` (update Undo/Redo button labels)
- Modify: `src/editor/ui/bottomBar.ts` (render the undo stack strip)

**Context:** The undo stack today stores snapshot strings only. We give each a human-readable label ("create collider", "move selection", "delete zone") so the bottom-bar strip is informative. Jumping N steps = N calls to `undo()`/`redo()`.

- [ ] **Step 1: Change the undo stack shape**

In `src/editor/state.ts`, update:

```ts
export interface UndoEntry {
  snap: string
  label: string
}

export interface EditorState {
  // ...
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]
  // ...
}
```

Update `createEditorState`: `undoStack: []`, `redoStack: []` (arrays of `UndoEntry`).

Change `pushUndo` signature:

```ts
export function pushUndo(state: EditorState, label: string): void {
  const snap = JSON.stringify(toLevelJson(state.level))
  state.undoStack.push({ snap, label })
  if (state.undoStack.length > UNDO_LIMIT)
    state.undoStack.shift()
  state.redoStack.length = 0
}
```

Update `undo` and `redo`:

```ts
export function undo(state: EditorState): void {
  const prev = state.undoStack.pop()
  if (!prev) return
  const currentLabel = `redo: ${prev.label}`
  state.redoStack.push({ snap: JSON.stringify(toLevelJson(state.level)), label: currentLabel })
  try {
    state.level = fromLevelJson(JSON.parse(prev.snap) as LevelJson)
    state.selection = null
    markDirty(state)
  }
  catch (e) {
    console.error('undo failed', e)
  }
}

export function redo(state: EditorState): void {
  const next = state.redoStack.pop()
  if (!next) return
  state.undoStack.push({ snap: JSON.stringify(toLevelJson(state.level)), label: next.label })
  try {
    state.level = fromLevelJson(JSON.parse(next.snap) as LevelJson)
    state.selection = null
    markDirty(state)
  }
  catch (e) {
    console.error('redo failed', e)
  }
}
```

- [ ] **Step 2: Add labels to every pushUndo call**

```bash
grep -rn "pushUndo(" src/editor/
```

Expected: calls in `canvas.ts` (typical). Add a descriptive label to each, e.g.:

- before creating a collider: `pushUndo(state, 'create collider')`
- before deleting: `pushUndo(state, 'delete selection')`
- before moving: `pushUndo(state, 'move selection')`
- before scaling: `pushUndo(state, 'scale collider')`
- before zone create: `pushUndo(state, 'create zone')`

Match each call to the action that follows it.

- [ ] **Step 3: Verify button labels still compile**

The `Undo (N)` / `Redo (N)` buttons in `rightPanel.ts` read `state.undoStack.length` / `state.redoStack.length` — unchanged. Nothing to modify.

- [ ] **Step 4: Render the undo strip in bottomBar.ts**

Update `src/editor/ui/bottomBar.ts`:

```ts
import type { EditorState } from '../state'
import { redo, undo } from '../state'

export function mountBottomBar(host: HTMLElement, state: EditorState): void {
  host.innerHTML = ''

  const stats = document.createElement('span')
  host.appendChild(stats)

  const strip = document.createElement('div')
  strip.className = 'undo-strip'
  host.appendChild(strip)

  const render = (): void => {
    const lv = state.level
    stats.textContent = [
      `colliders: ${lv.colliders.length}`,
      `zones: ${lv.zones.length}`,
      `prowlers: ${lv.prowlers.length}`,
      `dummies: ${lv.dummies.length}`,
      `pickups: ${lv.pickups.length}`,
      `world: ${lv.worldWidth}×${lv.worldHeight}`,
    ].join(' · ')

    strip.innerHTML = ''
    // Undo entries — left of the pivot, oldest first.
    for (let i = 0; i < state.undoStack.length; i++) {
      const entry = state.undoStack[i]!
      const cell = document.createElement('div')
      cell.className = 'undo-cell past'
      cell.title = entry.label
      cell.onclick = () => {
        const steps = state.undoStack.length - i
        for (let k = 0; k < steps; k++) undo(state)
      }
      strip.appendChild(cell)
    }
    // Pivot cell (current state).
    const pivot = document.createElement('div')
    pivot.className = 'undo-cell pivot'
    pivot.title = 'current state'
    strip.appendChild(pivot)
    // Redo entries — right of the pivot, most-recently-undone first.
    const redoCopy = state.redoStack.slice().reverse()
    for (let i = 0; i < redoCopy.length; i++) {
      const entry = redoCopy[i]!
      const cell = document.createElement('div')
      cell.className = 'undo-cell future'
      cell.title = entry.label
      cell.onclick = () => {
        for (let k = 0; k <= i; k++) redo(state)
      }
      strip.appendChild(cell)
    }
  }
  state.listeners.add(render)
  render()
}
```

- [ ] **Step 5: Style the strip**

Append to `src/editor/style.css`:

```css
.undo-strip {
  display: flex;
  gap: 2px;
  margin-left: 16px;
  flex: 1;
  max-width: 50%;
  overflow: hidden;
}

.undo-cell {
  width: 8px;
  height: 14px;
  border-radius: 2px;
  cursor: pointer;
  flex-shrink: 0;
}

.undo-cell.past { background: var(--border); }
.undo-cell.past:hover { background: var(--dim); }
.undo-cell.pivot { background: var(--accent); cursor: default; }
.undo-cell.future { background: var(--panel-2); border: 1px solid var(--border); }
.undo-cell.future:hover { background: var(--border); }
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Place a few colliders — bottom strip fills with cells to the left of the pivot. Press `Ctrl+Z` — cell moves to the right (becomes future). Hover shows the label. Click a past cell — jumps back multiple steps. Click a future cell — redoes multiple steps.

- [ ] **Step 7: Commit**

```bash
git add src/editor/state.ts src/editor/canvas.ts src/editor/ui/bottomBar.ts src/editor/style.css
git commit -m "feat(editor): labeled undo stack with clickable strip"
```

---

## Task 10: Transform gizmo on selection

**Files:**
- Modify: `src/editor/state.ts` (add `rotatePolygon` helper)
- Modify: `src/editor/canvas.ts` (render gizmo + handle pointer events)

**Context:** When a collider/zone/entity is selected, draw a bounding box with 8 scale handles, 1 rotation handle, and a drag body. Body drag translates; handle drag scales; rotation drag rotates around the centroid. Reuses `scalePolygon` (exists) and a new `rotatePolygon`.

- [ ] **Step 1: Add rotatePolygon helper**

Append to `src/editor/state.ts`:

```ts
// Rotate a polygon's vertices around an anchor by `angle` radians.
// Used by the transform gizmo's rotation handle. Returns a new array.
export function rotatePolygon(
  verts: [number, number][],
  anchorX: number,
  anchorY: number,
  angle: number,
): [number, number][] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return verts.map(([x, y]) => {
    const dx = x - anchorX
    const dy = y - anchorY
    return [anchorX + dx * c - dy * s, anchorY + dx * s + dy * c] as [number, number]
  })
}
```

- [ ] **Step 2: Render the gizmo**

In `src/editor/canvas.ts`, extend the render pass. Where the selection highlight is drawn today, replace with a gizmo render. Pseudocode — adapt to match the codebase's graphics primitives (Pixi Graphics):

```ts
if (state.selection) {
  const bounds = computeSelectionBounds(state)
  if (bounds) {
    // Draw bounding rectangle.
    drawRect(bounds, '#c8a020', 1.5)
    // Draw 8 scale handles (corners + midpoints).
    for (const h of handlesFor(bounds)) {
      drawSquare(h.x, h.y, 6, '#c8a020')
    }
    // Draw rotation handle above the top edge.
    const rot = rotationHandlePos(bounds)
    drawCircle(rot.x, rot.y, 4, '#c8a020')
    drawLine({ x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY }, rot, '#c8a020', 1)
  }
}
```

The actual drawing calls must match the existing API in `canvas.ts` — read the current selection-highlight code first:

```bash
grep -n "selection\|highlight\|draw" src/editor/canvas.ts | head -40
```

Implement `computeSelectionBounds(state)` to return `{ minX, minY, maxX, maxY }` for the selection:

- `collider`: `polygonBounds(state.level.colliders[index].vertices)`
- `zone`: `{ minX: z.x, minY: z.y, maxX: z.x + z.w, maxY: z.y + z.h }`
- `prowler`/`dummy`/`pickup`: entity pos ± 12 px
- `spawn`: `state.level.spawn` ± 12 px

- [ ] **Step 3: Handle pointer events**

Still in `canvas.ts`, extend the pointerdown handler. Before the existing pan/select logic, hit-test the gizmo handles first. Pseudocode:

```ts
function onPointerDown(e: PointerEvent): void {
  if (state.selection) {
    const bounds = computeSelectionBounds(state)
    if (bounds) {
      const world = screenToWorld(e)
      const hit = hitTestGizmo(bounds, world)
      if (hit !== null) {
        beginGizmoDrag(hit, bounds)
        return // consume; pan/select don't run
      }
    }
  }
  // ...existing logic
}
```

`hitTestGizmo` returns `'body' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | null`.

`beginGizmoDrag` stashes the drag kind + starting bounds/vertices/mouse on a module-local object and switches the pointer handler to `onGizmoDrag` until pointerup. The drag applies:

- `body` → translate each vertex/entity by `(curr - start)`
- `nw`/`ne`/`se`/`sw`/`n`/`s`/`e`/`w` → scale using `scalePolygon(verts, anchor, sx, sy)` for colliders, direct width/height edit for zones
- `rotate` → angle from centroid, apply `rotatePolygon(verts, cx, cy, delta)` for colliders (rotation ignored for zones/entities)

Call `pushUndo(state, 'transform selection')` at the start of the drag, before the first mutation.

- [ ] **Step 4: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Select a collider — orange bounding box with handles appears. Drag the body to move. Drag a corner to scale. Drag the rotation handle to rotate. Ctrl+Z reverts the entire drag (one undo entry per drag, labeled "transform selection").

- [ ] **Step 5: Commit**

```bash
git add src/editor/state.ts src/editor/canvas.ts
git commit -m "feat(editor): transform gizmo on selection"
```

---

## Task 11: Motion preview (hold G)

**Files:**
- Modify: `src/editor/canvas.ts` (key handler + scratch render)
- Modify: `src/editor/ui/rightPanel.ts` (add hint line)

**Context:** Hold `G` to animate kinetic platforms in place using the runtime's update functions. Release to restore. No state mutation; the editor reverts on keyup.

- [ ] **Step 1: Read the kinetic dispatcher**

```bash
cat src/kinetic/index.ts
```

Note the exported `updateKinetic(body, dt)` (or equivalent) and the shape of kinetic data on a collider.

- [ ] **Step 2: Add motion-preview state to canvas.ts**

At module scope in `canvas.ts`:

```ts
let motionPreviewActive = false
let motionPreviewLastTime = 0
let motionPreviewScratch: Array<{ index: number, originalVerts: [number, number][], kineticState: unknown }> = []
```

- [ ] **Step 3: Key handler**

Add to the canvas host (or document) in the init block:

```ts
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'g' && !motionPreviewActive) {
    motionPreviewActive = true
    motionPreviewLastTime = performance.now()
    motionPreviewScratch = state.level.colliders
      .map((c, i) => c.kinetic ? { index: i, originalVerts: c.vertices.map(v => [...v] as [number, number]), kineticState: initKineticState(c.kinetic) } : null)
      .filter((x): x is NonNullable<typeof x> => x != null)
    markDirty(state)
  }
})

document.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'g' && motionPreviewActive) {
    motionPreviewActive = false
    // Restore: each entry writes its originalVerts back.
    for (const s of motionPreviewScratch) {
      state.level.colliders[s.index]!.vertices = s.originalVerts
    }
    motionPreviewScratch = []
    markDirty(state)
  }
})
```

`initKineticState` comes from `src/kinetic/index.ts` if available — otherwise inline the initial phase/offset data for each kinetic type.

- [ ] **Step 4: Per-frame tick**

Find the Pixi ticker callback in `canvas.ts`. Append:

```ts
if (motionPreviewActive) {
  const now = performance.now()
  const dt = Math.min(0.05, (now - motionPreviewLastTime) / 1000)
  motionPreviewLastTime = now
  for (const s of motionPreviewScratch) {
    const coll = state.level.colliders[s.index]!
    // Call the runtime kinetic update — it mutates coll.vertices or coll's
    // transform in place. Exact API depends on src/kinetic/.
    advanceKinetic(coll, s.kineticState, dt)
  }
  markDirty(state)
}
```

If the runtime kinetic functions expect a full game-world collider shape (with physics body, etc.), you'll need an adapter. Read `src/kinetic/linear.ts` and friends to learn their input shape, and construct a minimal adapter record per scratch entry.

- [ ] **Step 5: Add hint line**

In `src/editor/ui/rightPanel.ts`'s `hintSection`, add `'<span class="kbd">G</span>: motion preview (hold)'` to the hint HTML list.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Load `level1` — it has kinetic platforms. Hold `G` — they animate in place. Release — they snap back to the authored position. No state is saved.

- [ ] **Step 7: Commit**

```bash
git add src/editor/canvas.ts src/editor/ui/rightPanel.ts
git commit -m "feat(editor): hold G to preview kinetic motion in place"
```

---

## Task 12: Ghost placement previews

**Files:**
- Modify: `src/editor/canvas.ts` (extend placement render hooks)

**Context:** Rect tool partly previews today. Extend to polygon and entity tools so the author always sees what they're about to place.

- [ ] **Step 1: Audit existing placement rendering**

```bash
grep -n "polyBuffer\|cursor\|preview" src/editor/canvas.ts
```

Identify where the rect tool draws its drag preview. We'll add analogous branches for other tools.

- [ ] **Step 2: Polygon tool preview**

When `state.tool === 'polygon'` and `state.polyBuffer != null && polyBuffer.length >= 1`, draw:

- Line strip connecting existing polyBuffer points (already exists today; confirm).
- A dashed line from `polyBuffer[polyBuffer.length - 1]` to the **snapped cursor world position**.

Add the dashed line with whatever graphics API `canvas.ts` already uses. If Pixi Graphics, use `.moveTo().lineTo()` with a dotted pattern approximated by many short segments, or just a solid lighter-alpha line.

- [ ] **Step 3: Entity tool preview**

When `state.tool` is `spawn`, `prowler`, `dummy`, `pickup`, or `zone`, draw a translucent icon at the snapped cursor position. Reuse the same icon-draw function the canvas already uses for committed entities; call it with `alpha: 0.4` and at the cursor. For `zone`, draw an outlined rect of the default new-zone size.

- [ ] **Step 4: Rect tool — verify still works**

No changes expected. Verify manually.

- [ ] **Step 5: Verify**

```bash
npm run typecheck
```

Expected: PASS.

Open the editor. Click Polygon tool, click once — a dashed line follows the cursor. Click Prowler tool — a translucent prowler icon follows the cursor. Same for all entity tools.

- [ ] **Step 6: Commit**

```bash
git add src/editor/canvas.ts
git commit -m "feat(editor): ghost placement previews for polygon and entity tools"
```

---

## Task 13: Final sweep — lint hygiene for files touched, manual QA

**Context:** Make sure no new lint errors were introduced in touched files, and run a brief manual QA checklist.

- [ ] **Step 1: Lint check on editor files only**

```bash
npm run lint src/editor/ editor.html 2>&1 | grep -v "^$" | head -40
```

Note: pre-existing errors in files outside `src/editor/` are unrelated — ignore. For any new error introduced inside `src/editor/`, fix it. Common ones from the antfu config:

- `perfectionist/sort-imports`: reorder imports alphabetically
- `antfu/if-newline`: break single-line `if (cond) stmt` into two lines
- `style/max-statements-per-line`: split multi-statement arrow bodies into block form

- [ ] **Step 2: Manual QA checklist**

Open `http://localhost:5173/editor.html` and verify:

- [ ] Top bar: File menu opens/closes; each item works; clicking outside closes it.
- [ ] Top bar: View menu toggles each layer flag and the canvas reflects it.
- [ ] Top bar: Presets dropdown loads level1 / level2; toast confirms.
- [ ] Left panel: tool strip selects tools; brush library arms brushes; preview brushes are dimmed and toast on click.
- [ ] Viewport: select a collider — gizmo appears with handles. Translate/scale/rotate each work and commit one undo entry per drag.
- [ ] Viewport: hold `G` with `level1` loaded — kinetic platforms animate; release snaps back.
- [ ] Viewport: polygon tool shows a dashed line to the cursor; entity tools show a translucent preview.
- [ ] Right panel: world settings visible when nothing selected; entity inspector visible when something is selected. Overwrite still works with confirm + toast.
- [ ] Bottom bar: live stats update on every create/delete; undo strip reflects history; clicking a past cell jumps back; clicking a future cell replays forward.

- [ ] **Step 3: Commit any lint fixes**

```bash
git add -A src/editor/
git commit -m "chore(editor): lint fixes for overhaul"
```

---

## Spec coverage check

Each spec requirement maps to a task:

| Spec section | Tasks |
|---|---|
| 3 — Architecture / file structure | 1, 2, 3, 4 |
| 4 — Top bar | 5, 7 |
| 4 — Left panel | 3, 8 |
| 4 — Right panel (inspector) | 4 |
| 4 — Bottom bar | 6, 9 |
| 5.1 — Transform gizmo | 10 |
| 5.2 — Motion preview | 11 |
| 5.3 — Layer toggles | 7 |
| 5.4 — Ghost placement preview | 12 |
| 5.5 — Visual undo stack | 9 |
| 6 — Keyboard shortcuts | 7 (L), 11 (G). Other shortcuts (V/P/R/F/0/[/]/Shift/Alt) are out of scope of the overhaul — existing or deferred. |
| 7 — Persistence compatibility | Covered implicitly; no format changes. |
| 8 — Out of scope | Confirmed — Tasks do not touch runtime, heatmaps, skin. |
