# Context: editor

**Path:** `src/editor/`
**One-line purpose:** Standalone level editor application — its own Vite entry, its own Pixi instance, its own state — for authoring and saving `LevelJson` files.

## What this context owns

- `main.ts` — Vue entry point; creates the Pinia store and mounts `App.vue` onto `#app`.
- `App.vue` — root shell; grid layout, imports `style.css`, composes the five panel components.
- `components/TopBar.vue` — file menu (New, Open…, Download JSON, Copy JSON), View-layer toggles, bundled-preset dropdown, playtest link.
- `components/LeftPanel.vue` — tool palette, material picker, brush selector (uses `brushes.ts`).
- `components/RightPanel.vue` — property inspector for the selected object (collider material, one-way, kinetic type and fields, zone params, entity coords, undo/redo buttons, Overwrite save).
- `components/BottomBar.vue` — level stats, undo/redo strip (click-to-jump).
- `components/CanvasHost.vue` — mounts the Pixi canvas via `composables/useCanvas.ts`, hosts `MinimapHost`.
- `components/MinimapHost.vue` — canvas-2D minimap thumbnail via `composables/useMinimap.ts`.
- `composables/useCanvas.ts` — Pixi-backed main viewport; all pointer input (pan, zoom, select, drag-move, polygon draw, rect draw, spawn/prowler/dummy/pickup/zone placement, scale handles, rotation handle, vertex drag); returns a `dispose()` to remove global `keydown`/`keyup` listeners on unmount.
- `composables/useMinimap.ts` — draws the minimap; watches store state.
- `stores/editor.ts` — Pinia store (setup-style); owns `EditorLevel`, `Tool`, `Selection`, `PendingColliderPreset`; serialisation helpers `fromLevelJson`/`toLevelJson`/`createEmptyLevel`; undo/redo stack; `loadFromJson`, `toJson`, `allocId`.
- `brushes.ts` — brush registry; each brush defines a `tool`, icon, category, and `apply(BrushTarget)` that arms the next shape. `BrushTarget` is a slim four-field interface (tool, createMaterial, pendingPreset, pendingZone). Re-exports `Tool`.
- `geometry.ts` — pure geometry helpers (`rotatePolygon`, `scalePolygon`, `polygonCenter`, `polygonBounds`, `snap`); no Vue or Pixi dependencies.
- `style.css` — editor-only CSS (imported by `App.vue`).

## What it does NOT own (and where to look)

- Game runtime state — `src/session/`
- Player physics or enemy behavior — `src/player/`, `src/enemies/`
- Persistent level loading in the running game — `src/session/levelManager`
- Save-to-disk implementation — `vite.config.ts` (`/__editor/save` POST endpoint); the editor POSTs JSON to this dev-server middleware, which writes `src/levels/{name}.json`

## Public surface

The editor is a self-contained app; it does not export anything consumed by the game runtime. Its only shared types come from other contexts:

- Reads: `LevelJson`, `MaterialName`, `ZoneJson`, `ZoneType` from `src/world/level` (via `shared-kernel/types` re-exports where available)
- Reads: `KineticJson` from `src/world/kinetic`
- Reads: `ItemKind` from `src/items/types`

## External dependencies

- Pixi v8 modules used: `Application`, `Container`, `Graphics`, `Text` (editor canvas only — separate Pixi instance from the game)
- `vue` — reactivity, components, composables
- `pinia` — store (`stores/editor.ts`); mounted in `main.ts`
- Other contexts:
  - `src/world/level` — `LevelJson`, `MaterialName`, `ZoneJson`, `ZoneType` (schema only)
  - `src/world/kinetic` — `KineticJson` (for kinetic preset brushes)
  - `src/items/types` — `ItemKind`

## Invariants / rules

- `EditorLevel` is a mutable editable copy of `LevelJson` — it adds `nextId` for stable collider id allocation and normalises optional fields. `toLevelJson` converts it back for serialization.
- Undo/redo stores full serialized snapshots (`JSON.stringify(toLevelJson(level))` → string). Max 50 entries. `pushUndo` must be called BEFORE any mutation — on pointer-down or action-start, not after.
- Vue reactivity (Pinia refs + `watchEffect` in `useCanvas`) replaces the vanilla `markDirty`/`listeners` pattern. There is no `markDirty` in the Vue editor.
- `allocId` monotonically increments `level.nextId` — never reuse or externally set IDs.
- Saving via the dev server uses a POST to `/__editor/save?name={presetName}`. The endpoint path-validates the name with `/^[\w-]+$/` and resolves against `src/levels/`. Saving to arbitrary paths is blocked by the endpoint.
- Saving to disk via the File System Access API (`activeFileHandle`) and saving via the dev server (`activePresetName`) are mutually exclusive — whichever is set most recently clears the other.
- The editor has its own Pixi `Application` instance entirely separate from the game's. Sharing a renderer or stage with the game is not supported.
- `useCanvas` registers global `window` keydown/keyup listeners. `CanvasHost.vue` calls `canvas.dispose()` in `onBeforeUnmount` to remove them before destroying the Pixi app.

## Why this context exists as its own thing

The editor is a different application, not a feature of the running game. It needs different tooling (pointer input, undo stack, property inspectors, save flows) that would pollute the game runtime if merged. Its own Vite entry (`editor.html`) keeps the two bundles completely independent — the game bundle never includes editor code. Sharing only the `LevelJson` schema from `src/world/level` is the minimal, correct coupling point.
