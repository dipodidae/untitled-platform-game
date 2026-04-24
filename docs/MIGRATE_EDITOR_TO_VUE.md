# Migrate Level Editor to Vue

**Status:** Plan  
**Decision:** Plain Vue 3 + Vite + Nuxt UI standalone + Pinia. No Nuxt, no monorepo, no SSR.

---

## Why migrate

The editor is ~3,500 LOC of vanilla DOM management across 12 files. Every panel
rebuilds via `host.innerHTML = ''` on every state change. This works today but
scales poorly: adding property grids, tree views, drag-reorder, or multi-select
inspectors in raw `createElement` is grunt work that component frameworks exist
to eliminate.

The game is **not** migrated. A Pixi render loop has no business inside a reactive
framework. The game's 3 vanilla UI screens (`mainMenu`, `resultsScreen`, `dropIn`)
stay vanilla.

## Why not Nuxt

| Nuxt feature | Do we need it? |
|---|---|
| SSR / hydration | No. Editor is a local SPA. |
| File-based routing | No. Editor is one page with panels. |
| `/server/api` routes | No. We have a 40-line Vite middleware. |
| Nuxt UI components | Yes — but Nuxt UI v3 works standalone in plain Vue. |

Nuxt adds ~15 dependencies and a build pipeline we don't need. Plain Vue + Vite
gives us everything with fewer moving parts.

## Why not a monorepo

We have exactly two entry points (`index.html`, `editor.html`) already sharing
code via relative imports through `src/shared-kernel/`. A `packages/` +
`apps/` split with pnpm workspaces is premature until a third package appears
(CLI tool, hosted server, etc.). Graduate to workspaces when you feel the pain.

---

## Architecture after migration

```
src/
├── shared-kernel/           ← types + pure helpers (both sides import)
│   ├── polygon.ts           (exists)
│   ├── vec2.ts              (exists)
│   └── types.ts             (NEW — LevelJson, MaterialName, ZoneJson, etc.)
│
├── editor/                  ← Vue 3 SPA
│   ├── main.ts              ← createApp(), mount to #app
│   ├── App.vue              ← root layout (grid: top-bar, left, canvas, right, bottom)
│   ├── stores/
│   │   └── editor.ts        ← Pinia store (port of state.ts)
│   ├── composables/
│   │   ├── useCanvas.ts     ← Pixi viewport (port of canvas.ts)
│   │   └── useMinimap.ts    ← Canvas-2D minimap (port of minimap.ts)
│   ├── components/
│   │   ├── TopBar.vue
│   │   ├── LeftPanel.vue
│   │   ├── RightPanel.vue
│   │   ├── BottomBar.vue
│   │   ├── CanvasHost.vue   ← <div ref>, creates Pixi, exposes store-driven reactivity
│   │   ├── MinimapHost.vue
│   │   └── PropertyGrid.vue ← reusable inspector rows (replaces row() helper)
│   ├── brushes.ts           ← unchanged (pure data)
│   └── style.css            ← global editor styles (Nuxt UI handles component styles)
│
├── game code (UNTOUCHED)
│   ├── combat/  enemies/  input/  items/  levels/  physics/
│   ├── player/  render/  session/  ui/  world/
│   ├── config.ts  main.ts  style.css
│
├── index.html               ← game entry (unchanged)
└── editor.html              ← editor entry (now mounts Vue app)
```

### Key boundaries

- **Game reads `LevelJson` from `src/levels/*.json`.** This contract never changes.
- **Editor writes `LevelJson` via `POST /__editor/save`.** Middleware stays in `vite.config.ts`.
- **Shared types** live in `src/shared-kernel/types.ts`. Both sides import from there.
- **Pixi canvas** lives inside a Vue component but is **not reactive**. The component
  owns a `<div ref>`, instantiates Pixi into it, and reads the Pinia store for
  tool/selection state. Pixi owns its own render loop; Vue never touches the canvas.

---

## Phases

### Phase 0 — Dependencies (30 min)

```bash
pnpm add vue @vitejs/plugin-vue pinia @nuxt/ui
pnpm add -D @vue/tsconfig
```

Update `vite.config.ts`:
- Add `vue()` plugin.
- Keep existing `editor-save` middleware.
- Keep multi-entry build (`index.html` + `editor.html`).
- Game entry (`index.html` → `src/main.ts`) does NOT import Vue. The Vue plugin
  only activates for `.vue` files, which the game never imports.

Update `tsconfig.json`:
- Add `"jsx": "preserve"` and Vue-specific compiler options if needed.
- Extend `@vue/tsconfig/tsconfig.dom.json` for the editor entry only, or keep
  a single tsconfig that covers both (simpler).

### Phase 1 — Extract shared types (1 hour)

**Goal:** Move editor↔game contract types into `src/shared-kernel/types.ts` so
both sides import from the same place. Pure refactor, zero behavior change.

Types to extract:

| Type | Current location | Used by |
|---|---|---|
| `LevelJson` | `src/world/level.ts:128` | editor (state, topBar, main), game (session) |
| `MaterialName` | `src/world/level.ts:83` | editor (state, leftPanel, rightPanel, sidebar), game (level, destruction) |
| `ZoneJson` | `src/world/level.ts:44` | editor (state), game (level, player) |
| `ZoneType` | `src/world/level.ts:42` | editor (state, canvas), game (level) |
| `KineticJson` | `src/world/kinetic/index.ts:33` | editor (state, canvas, brushes), game (kinetic, level) |
| `ItemKind` | `src/items/types.ts:13` | editor (state, rightPanel, sidebar), game (items) |

**Approach:** Create `src/shared-kernel/types.ts` re-exporting these types. Update
`src/world/level.ts` and `src/world/kinetic/index.ts` to import from the shared
kernel instead of defining inline. Update all editor imports. This is a mechanical
find-and-replace.

**Verify:** `pnpm typecheck && pnpm build` still passes. Game and editor both work.

### Phase 2 — Pinia store (2–3 hours)

Port `src/editor/state.ts` (305 lines) to a Pinia store.

```
src/editor/stores/editor.ts
```

**What changes:**
- `EditorState` → `defineStore('editor', () => { ... })` with `ref()` for each field.
- `markDirty()` → gone. Vue reactivity replaces the manual listener set.
- `pushUndo()` / `undo()` / `redo()` → store actions.
- `fromLevelJson()` / `toLevelJson()` → store actions or standalone helpers
  imported by the store.
- Geometry helpers (`snap`, `polygonCenter`, etc.) stay as pure functions, not
  store methods.

**What stays the same:**
- `EditorLevel`, `EditorCollider`, `UndoEntry`, `Tool`, `Selection` interfaces.
- All serialization logic.
- `allocId` semantics.

**Types stay in `src/editor/stores/editor.ts` or a sibling `types.ts` —**
they are editor-internal, not shared with the game.

**Verify:** Write a minimal `App.vue` that mounts the store, calls `fromLevelJson`
with level1 data, and renders `store.level.worldWidth` in a `<pre>`. Confirm
reactivity works.

### Phase 3 — Shell layout + panels (4–6 hours)

Port the 5 UI panels from raw DOM to Vue components.

| Vanilla file | Vue component | LOC | Complexity |
|---|---|---|---|
| `ui/topBar.ts` (224) | `TopBar.vue` | ~120 | Low — buttons, dropdown, file dialogs |
| `ui/leftPanel.ts` (125) | `LeftPanel.vue` | ~80 | Low — tool buttons, material picker |
| `ui/rightPanel.ts` (417) | `RightPanel.vue` | ~250 | Medium — property inspector, conditionals |
| `ui/bottomBar.ts` (56) | `BottomBar.vue` | ~40 | Trivial — status text |
| `ui/toast.ts` (19) | `useToast` composable | ~15 | Trivial — Nuxt UI has `useToast()` built in |

**Order:** BottomBar → TopBar → LeftPanel → RightPanel (easiest first).

Each component reads from the Pinia store and calls store actions on user input.
No props drilling for editor state — the store is the single source of truth.

**Nuxt UI components to use:**
- `UButton`, `UButtonGroup` — tool palette, file actions
- `USelect`, `USelectMenu` — material picker, brush presets, zone type
- `UInput` — numeric fields (world size, snap, zone params)
- `UCheckbox`, `UToggle` — oneWay, kinetic flags
- `UModal` — save-as dialog, open-file dialog
- `UToast` — save confirmation, error messages
- `UCard` — panel sections (replaces the `section()` helper)
- `UForm`, `UFormField` — property inspector rows (replaces `row()` helper)

**Delete `sidebar.ts`** — it's a 523-line duplicate of `rightPanel.ts`.
Confirm it's unused by the current `main.ts` (it's not mounted anywhere).

**Update `editor.html`:**
```html
<body>
  <div id="app"></div>
  <script type="module" src="/src/editor/main.ts"></script>
</body>
```

Vue's `App.vue` owns the grid layout. The hardcoded `<div id="left-panel">` etc.
move into the Vue template.

### Phase 4 — Canvas + Minimap (3–4 hours)

Port `canvas.ts` (1,108 lines) into a Vue composable + wrapper component.

```
src/editor/composables/useCanvas.ts   ← all Pixi + input logic (bulk of canvas.ts)
src/editor/components/CanvasHost.vue   ← <div ref>, lifecycle, resize observer
```

**CanvasHost.vue:**
```vue
<template>
  <div ref="hostRef" class="canvas-host">
    <MinimapHost />
  </div>
</template>
```

`onMounted` → call `useCanvas(hostRef, store)` which creates the Pixi `Application`,
wires pointer events, and returns `{ frameWorldViewport }`.

**What changes:**
- `state.listeners.add(render)` → `watch(store.level, render)` or manual
  `store.$subscribe()` for Pixi redraws.
- Tool/selection reads come from the store instead of a passed-in `state` object.
- `pushUndo` calls become `store.pushUndo()`.

**What stays the same:**
- All Pixi drawing code (the Graphics calls, hit testing, drag logic).
- The pointer-event state machine.
- Scale handle / rotation handle math.

This is the largest file and the most tedious port, but it's mechanical: replace
`state.x` with `store.x` throughout. No logic changes.

**Minimap:** Same pattern. `useMinimap(hostRef, store)` composable, thin
`MinimapHost.vue` wrapper.

### Phase 5 — Cleanup + verify (1–2 hours)

- Delete all vanilla editor files (`sidebar.ts`, `ui/topBar.ts`, etc.).
- Remove the `<link rel="stylesheet">` from `editor.html` (Vue/Nuxt UI handles styles).
- Remove the Iconify CDN script (use `@iconify/vue` or Nuxt UI's built-in icons).
- Run `pnpm typecheck && pnpm build`.
- Manual test: open editor, load level1, draw a polygon, move it, undo, save.
- Manual test: open game, play level1. Confirm nothing broke.

---

## Estimated effort

| Phase | Hours | Risk |
|---|---|---|
| 0. Dependencies | 0.5 | Low |
| 1. Shared types | 1 | Low — mechanical refactor |
| 2. Pinia store | 2–3 | Low — state.ts is already clean |
| 3. Panels | 4–6 | Medium — rightPanel has the most conditionals |
| 4. Canvas + minimap | 3–4 | Medium — large file, mechanical port |
| 5. Cleanup + verify | 1–2 | Low |
| **Total** | **12–17** | |

One focused weekend, or spread across a week of evenings.

---

## What NOT to do

- **Don't touch game code.** No Vue imports anywhere outside `src/editor/`.
- **Don't change `LevelJson` schema.** The contract is sacred.
- **Don't make the Pixi canvas reactive.** Vue observes the store; Pixi reads
  the store. They don't observe each other. One-directional flow:
  `user input → store action → Vue re-renders panels, Pixi re-renders canvas`.
- **Don't add Vue Router.** The editor is one page. Use `v-if` for modal states.
- **Don't add SSR, Nuxt, or server-side anything.** SPA. Local dev tool. Keep it simple.
- **Don't delete the vanilla editor until the Vue version is feature-complete.**
  Keep both entry points working during migration. Delete vanilla files only in
  Phase 5 when everything is verified.

---

## Migration commit sequence

```
1. feat(shared-kernel): extract editor↔game contract types
2. feat(editor): add Vue + Pinia + Nuxt UI dependencies
3. feat(editor): port state.ts → Pinia store
4. feat(editor): scaffold App.vue + shell layout
5. feat(editor): port BottomBar panel
6. feat(editor): port TopBar panel
7. feat(editor): port LeftPanel panel
8. feat(editor): port RightPanel panel (property inspector)
9. feat(editor): port canvas.ts → useCanvas composable + CanvasHost.vue
10. feat(editor): port minimap.ts → useMinimap composable + MinimapHost.vue
11. chore(editor): delete vanilla editor files, update editor.html
12. chore: verify full build + manual test
```

Each commit is independently buildable and testable. If the rewrite stalls,
you can stop at any commit and the vanilla editor still works.
