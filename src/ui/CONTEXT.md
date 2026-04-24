# Context: ui

**Path:** `src/ui/`
**One-line purpose:** HTML overlays for the running game — currently just the results screen shown after `levelComplete`.

## What this context owns

- `resultsScreen.ts` — `ResultsHandlers`, `mountResultsScreen`. Creates and mounts a fixed-position DOM overlay with level name, time, death count, and Retry/Next buttons. Listens to `levelComplete` (shows) and `levelLoaded` (hides). Returns an unmount cleanup function.

## What it does NOT own (and where to look)

- In-game HUD (instability meter, hint text) — drawn in the Pixi `uiContainer` in `src/render/index.ts`
- Editor UI panels — `src/editor/ui/`
- Game state (deaths, timing) — `src/session/gameState` (values arrive via the `levelComplete` event payload)
- Level name lookup — `src/session/levelManager` (`levelName`, `hasNextLevel`)

## Public surface

```ts
export interface ResultsHandlers {
  onRetry: () => void
  onNext: () => void
}
export function mountResultsScreen(handlers: ResultsHandlers): () => void
// Returns a cleanup function — call it to remove the overlay and unsubscribe from the bus.
```

## External dependencies

- Pixi v8 modules used: none (pure DOM/CSS)
- Other contexts:
  - `src/session/eventBus` — `on('levelComplete', ...)`, `on('levelLoaded', ...)` for show/hide
  - `src/session/levelManager` — `levelName(id)`, `hasNextLevel(id)` for button state and subtitle

## Invariants / rules

- The overlay is layered above the Pixi canvas via `position: fixed` + CSS z-index. It must not contain any Pixi nodes.
- `mountResultsScreen` appends to `document.body` and returns a cleanup teardown. The teardown removes the element and calls both `off` unsubscribers. Always call it before re-mounting.
- `onRetry` and `onNext` both hide the overlay before invoking the handler — this prevents double-fire if the user clicks while an animation is running.
- The "Next Level" button is hidden (`nextBtn.hidden = true`) when `hasNextLevel(levelId)` returns false (i.e. on the last level). The title changes to "You finished!" in that case.
- All timing and death data come from the `levelComplete` event payload — this context does not read `gameState` directly.

## Why this context exists as its own thing

The results screen is pure DOM/CSS and has no dependency on Pixi or game simulation. Putting it in `session/` would mix HTML DOM authoring with loop orchestration. Putting it in `render/` would pull HTML concerns into the Pixi scene graph context. Its own folder makes it clear that the in-game HUD (Pixi) and the results overlay (DOM) are different stacks layered on top of each other.

## Events published / consumed

- Consumes: `levelComplete` — shows the overlay, populates stats.
- Consumes: `levelLoaded` — hides the overlay (handles retry/advance triggered externally).
- Publishes: none.
