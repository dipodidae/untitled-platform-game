# Context: editor

**Path:** `src/editor/`
**One-line purpose:** Standalone level editor application — its own Vite entry, its own Pixi instance, its own state — for authoring and saving `LevelJson` files.

## What this context owns

- `main.ts` — entry point; mounts all panels and the canvas, seeds the initial level, wires the layout ResizeObserver.
- `state.ts` — `EditorState`, `EditorLevel`, `EditorCollider`, `UndoEntry`, `Tool`, `Selection`, `PendingColliderPreset`; `createEditorState`, `createEmptyLevel`, `fromLevelJson`, `toLevelJson`; undo/redo stack (`pushUndo`, `undo`, `redo`); `markDirty`, `allocId`; polygon geometry helpers (`rotatePolygon`, `scalePolygon`, `polygonCenter`, `polygonBounds`, `snap`).
- `canvas.ts` — Pixi-backed main viewport; handles all pointer input (pan, zoom, select, drag-move, polygon draw, rect draw, spawn/prowler/dummy/pickup/zone placement, scale handles, rotation handle, vertex drag); `createCanvas`, `frameWorldViewport`.
- `minimap.ts` — `mountMinimap` — canvas-2D thumbnail of the world + current viewport rect.
- `sidebar.ts` — (if present; see file list — sidebar is split into panel modules below).
- `brushes.ts` — brush-related logic for kinetic presets and zone presets.
- `ui/topBar.ts` — `mountTopBar` — File menu (New, Open…, Overwrite, Save As…), preset dropdown.
- `ui/bottomBar.ts` — `mountBottomBar` — status bar (mouse coords, snap, zoom).
- `ui/leftPanel.ts` — `mountLeftPanel` — tool palette + material picker.
- `ui/rightPanel.ts` — `mountRightPanel` — property inspector for the selected object (collider material, one-way, kinetic type, zone params, etc.).
- `ui/toast.ts` — `mountToast` / toast notification helper.
- `style.css` — editor-only CSS (scoped to `editor.html`).

## What it does NOT own (and where to look)

- Game runtime state — `src/session/`
- Player physics or enemy behavior — `src/player/`, `src/enemies/`
- Persistent level loading in the running game — `src/session/levelManager`
- Save-to-disk implementation — `vite.config.ts` (`/__editor/save` POST endpoint); the editor POSTs JSON to this dev-server middleware, which writes `src/levels/{name}.json`

## Public surface

The editor is a self-contained app; it does not export anything consumed by the game runtime. Its only shared types come from other contexts:

- Reads: `LevelJson`, `MaterialName`, `ZoneJson`, `ZoneType` from `src/world/level`
- Reads: `KineticJson` from `src/world/kinetic`
- Reads: `ItemKind` from `src/items/types`

## External dependencies

- Pixi v8 modules used: `Application`, `Container`, `Graphics`, `Text` (editor canvas only — separate Pixi instance from the game)
- Other contexts:
  - `src/world/level` — `LevelJson`, `MaterialName`, `ZoneJson`, `ZoneType` (schema only)
  - `src/world/kinetic` — `KineticJson` (for kinetic preset brushes)
  - `src/items/types` — `ItemKind`

## Invariants / rules

- `EditorLevel` is a mutable editable copy of `LevelJson` — it adds `nextId` for stable collider id allocation and normalises optional fields. `toLevelJson` converts it back for serialization.
- Undo/redo stores full serialized snapshots (`JSON.stringify(toLevelJson(level))` → string). Max 50 entries. `pushUndo` must be called BEFORE any mutation — on pointer-down or action-start, not after.
- `markDirty(state)` is the single notification mechanism — it calls every registered listener synchronously. All UI panels register via `state.listeners.add(fn)`.
- `allocId` monotonically increments `state.level.nextId` — never reuse or externally set IDs.
- Saving via the dev server uses a POST to `/__editor/save?name={presetName}`. The endpoint path-validates the name with `/^[\w-]+$/` and resolves against `src/levels/`. Saving to arbitrary paths is blocked by the endpoint.
- Saving to disk via the File System Access API (`activeFileHandle`) and saving via the dev server (`activePresetName`) are mutually exclusive — whichever is set most recently clears the other.
- The editor has its own Pixi `Application` instance entirely separate from the game's. Sharing a renderer or stage with the game is not supported.

## Why this context exists as its own thing

The editor is a different application, not a feature of the running game. It needs different tooling (pointer input, undo stack, property inspectors, save flows) that would pollute the game runtime if merged. Its own Vite entry (`editor.html`) keeps the two bundles completely independent — the game bundle never includes editor code. Sharing only the `LevelJson` schema from `src/world/level` is the minimal, correct coupling point.
