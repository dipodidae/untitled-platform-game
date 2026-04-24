# Level Editor Overhaul — Design

**Date:** 2026-04-24
**Status:** Approved, pending plan
**Scope:** Editor UI restructure + features that have live runtime support. Excludes runtime systems not yet implemented.

## 1. Motivation

The current editor (`editor.html` + `src/editor/`) is functional but shaped like a single-column tool list. Authoring a level means scrolling one sidebar that mixes tool selection, brush library, world settings, selection inspector, and save/load. Selection properties are buried mid-sidebar; there is no transform gizmo on the canvas; layer visibility is hardcoded; brushes for systems that don't exist at runtime (toggles, timers, rhythm) appear alongside brushes that work, with no visual distinction.

The overhaul reorganizes the editor into a four-zone cockpit, adds direct-manipulation affordances in the viewport, and honestly flags which brushes are live vs. placeholder. It does **not** add new runtime systems.

## 2. Scope

| Layer | Description | In/Out |
|---|---|---|
| A | UI shell (4-zone layout, right inspector, bottom bar, top bar) | **In** |
| B | Editor features with runtime backing (transform gizmo, motion preview, layer toggles, ghost placement previews, visual undo stack) | **In** |
| C | Brushes without runtime (toggles, timers, rhythm, state stacks, groups) | **Kept but visually marked "preview"** |
| D | New runtime systems (trigger dispatch, timers, links) | **Out — separate project** |
| E | Heatmap / telemetry overlay | **Out — no data source** |
| F | Visual reskin ("SMW/CRT horror") | **Out — separate task** |

## 3. Architecture

State management, rendering stack, and persistence format are unchanged:

- Plain-record mutable state (`EditorState`) with a `listeners: Set<() => void>` observer pattern — same as today.
- Pixi v8 canvas in the viewport — same as today.
- `LevelJson` on-disk format is untouched.
- Vite entry (`editor.html` → `src/editor/main.ts`) is unchanged.

File layout after the overhaul:

```
src/editor/
  main.ts              # entry, unchanged outwardly; wires new panels
  state.ts             # + layerVisibility flags, + gizmo state
  canvas.ts            # + gizmo rendering, + overlay toggles, + motion preview
  brushes.ts           # + `live: boolean` flag per brush
  minimap.ts           # unchanged
  style.css            # + grid layout, + toast, + gizmo colors
  ui/
    topBar.ts          # NEW — File / View / Presets / Playtest
    leftPanel.ts       # SPLIT from sidebar.ts — tools + brush library
    rightPanel.ts      # SPLIT from sidebar.ts — context-sensitive inspector
    bottomBar.ts       # NEW — stats + undo stack
```

`sidebar.ts` will be decomposed into `ui/leftPanel.ts` and `ui/rightPanel.ts`; the file goes away. All functions that currently live in `sidebar.ts` (e.g. `ioSection`, `selectionSection`) relocate to whichever panel owns them. The just-added `showToast` helper moves to `ui/toast.ts`.

## 4. Layout

```
┌─ TOP BAR ────────────────────────────────────────────────────┐
│ File · View · Presets · Playtest · Snap(0) · Frame(F)        │
├──────┬──────────────────────────────────────┬────────────────┤
│ LEFT │                                      │ RIGHT          │
│ 220px│              VIEWPORT                │ INSPECTOR      │
│      │       (Pixi canvas, gizmos,          │ 260px          │
│ Tool │        layer overlays, previews)     │                │
│ strip│                                      │ Context-       │
│      │                                      │ sensitive:     │
│ Brush│                                      │ world | entity │
│ libr.│                                      │                │
├──────┴──────────────────────────────────────┴────────────────┤
│ BOTTOM · stats · undo stack · playtest link                  │
└──────────────────────────────────────────────────────────────┘
```

CSS grid on `#app`: three rows (top 32px, middle 1fr, bottom 28px) and three columns (left 220px, viewport 1fr, right 260px). Minimap stays overlaid on the viewport bottom-right. ResizeObserver already handles canvas resizing; the grid only changes host sizes.

### Top bar
- **File**: New blank, Open File…, Download JSON, Copy JSON
- **View**: layer toggles (colliders, zones, wind vectors, enemy ranges, paths, entity labels) — opens a popover with checkboxes
- **Presets**: bundled level loader (moved from status bar)
- **Playtest**: "← back to game" link
- **Snap / Frame**: quick-access buttons and their keyboard hints

### Left panel (tools + brushes)
- Tool strip on top: Select, Polygon, Rect, Zone, Spawn, Prowler, Dummy, Pickup.
- Brush library below, grouped as today: Movement, Hazard, Guidance, Meta, plus "Timing / Logic (preview)" for placeholder brushes.
- Placeholder brushes render dimmed with a small "preview" tag on hover; clicking still arms the brush but toast warns "this brush has no runtime effect yet".
- Material sub-picker appears only when the armed tool/brush takes a material.

### Right panel (inspector)
- **Nothing selected**: World settings (width, height, grid size, snap toggle, spawn coords).
- **Collider selected**: transform (position, rotation, scale of the bounding box), material, oneWay, kinetic params (if any), surfaceMotion, launchPad.
- **Zone selected**: type, bounds, per-type params (gravity scale, wind vec, hazard damage, trigger id).
- **Enemy/pickup selected**: position, kind, HP (dummies), pickup kind.
- Per-entity Delete button stays at the bottom of the inspector.

### Bottom bar
- Live counts (colliders, prowlers, dummies, pickups, world size).
- Undo stack visualization: horizontal strip of 50 small cells; current position highlighted; click a cell to jump.
- Save status indicator (last-saved timestamp if known, or "unsaved").

## 5. New editor features

### 5.1 Transform gizmo
When a collider/zone/entity is selected, draw a bounding rect with 8 scale handles, a rotation handle above the top edge, and a drag-body region. Behavior:

- Body drag → translate; snap applies.
- Corner/edge handle drag → scale the polygon around the opposite anchor using `scalePolygon()` in `state.ts` (already exists).
- Rotation handle → rotates the polygon's vertices around its centroid (new helper in `state.ts`). This rotates the **authored geometry**, not the runtime rotor speed. Rotor angular velocity is still edited numerically in the inspector.
- Zones: scale only (no rotation; zones are AABBs).
- Entities: translate only.

Gizmo state lives on `EditorState.gizmo = { mode: 'translate' | 'scale' | 'rotate', anchor: [x,y] | null }`; updated during pointer drag in `canvas.ts`.

### 5.2 Motion preview
Hold `G` to animate kinetic platforms (linear, rotor, spring, breather) in place. Implementation:

- On keydown, clone `state.level.colliders` into a scratch copy.
- Each canvas tick, advance a local `dt` accumulator and run the existing update functions from `src/kinetic/` against the scratch copy.
- Render from the scratch copy while held.
- On keyup, discard the scratch and re-render from `state.level`.

This re-uses runtime kinetic code with no changes. Any additional kinetic types added later automatically participate.

### 5.3 Layer toggles
`EditorState.layers = { colliders, zones, wind, enemyRanges, paths, entityLabels, grid }` — all booleans, all default true. The canvas render function branches on these. `L` key opens a quick overlay to toggle them.

- `wind` draws arrows inside wind zones sampled from the zone's velocity vector.
- `paths` draws line-strip overlays for colliders with `kinetic.type === 'linear'` using their `path` waypoints.
- `enemyRanges` draws prowler patrol ranges (if encoded on the enemy) and the dummy's HP label radius.
- `entityLabels` draws text labels near each spawn/prowler/dummy/pickup icon.

### 5.4 Ghost placement preview
Rect tool partly does this today. Extend so:

- Polygon tool shows the in-progress polygon + a live preview line from the last point to the cursor.
- Entity tools (spawn, prowler, dummy, pickup, zone corner) show a translucent icon/outline tracking the cursor before click.
- All previews respect snap.

### 5.5 Visual undo stack
Bottom-bar cell strip, 50 slots. Two regions separated by the current position: undo to the left, redo to the right. Hover shows a tooltip like "before: create collider". Click jumps the stack: clicking N cells to the left invokes `undo(state)` N times; N cells to the right invokes `redo(state)` N times. No new mechanism — just batched calls to the existing functions in `state.ts`. Tooltip labels come from a new `undoStack: { snap: string, label: string }[]` shape; `pushUndo(state, label)` gains an optional label argument.

## 6. Keyboard shortcuts

Preserved: `V` select, `P` polygon, `R` rect, `F` frame world, `Space+drag` pan, `Wheel` zoom, `Enter` finish polygon, `Esc` cancel, `Del` delete selection, `Shift+click vertex` delete, `Alt+click edge` insert vertex, `Ctrl+Z` undo, `Ctrl+Shift+Z` / `Ctrl+Y` redo.

Added: `G` hold for motion preview, `L` open layer toggle popover, `0` toggle snap, `[` / `]` cycle material, `Shift+drag` constrain to axis, `Alt+drag` duplicate selection.

## 7. Persistence and compatibility

`LevelJson` format does not change. Existing `level1.json` / `level2.json` continue to load and save unchanged. The Overwrite flow added in the preceding bugfix (dev middleware + preset name tracking) remains intact.

## 8. Out of scope (explicit)

- Runtime dispatch for triggers, toggles, timers, rhythm, state stacks, group links. Brushes for these remain as "preview" with no runtime effect.
- Heatmap or any telemetry-driven overlay.
- Multiplayer / collaborative editing.
- Visual style reskin; only minor CSS additions for the new zones/gizmo/toasts.
- Path / spline editing UI beyond what linear-platform brushes already hardcode.

## 9. Risks and mitigations

- **Regression in existing flows.** Decomposing `sidebar.ts` into `leftPanel.ts` + `rightPanel.ts` is a mechanical split with unchanged function bodies; the risk is import/export breakage. Mitigation: land the split as one self-contained step before adding new features.
- **Gizmo interaction conflicts with pan/zoom.** Pointer events need priority: gizmo handles beat viewport pan. Mitigation: hit-test handles first in `canvas.ts`'s pointerdown dispatch.
- **Motion preview stale state.** If a kinetic type is added later without a corresponding editor scratch path, the preview silently skips it. Mitigation: route the preview through the same `updateKinetic` dispatcher the game uses (`src/kinetic/index.ts`).
- **Undo-stack visualization cost.** The strip re-renders on every mutation. Mitigation: reuse the existing listener pattern; at 50 slots the DOM cost is negligible.

## 10. Delivery

Single PR, no feature flag. Change lands as a single visible shift on the next page reload of the editor. No migrations required.
