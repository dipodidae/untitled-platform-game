# Context: input

**Path:** `src/input/`
**One-line purpose:** Keyboard state + per-tick press/release edge detection, with gameplay-level aliases so callers never hard-code key codes.

## What this context owns

- `input.ts` — module-level `keys` / `prevKeys` records; `initInput` (attaches window event listeners once); `isDown`, `justPressed`, `justReleased`; `endFrame` (snapshots current state into prevKeys); gameplay aliases: `leftDown`, `rightDown`, `downDown`, `jumpPressed`, `jumpReleased`, `respawnPressed`, `shootPressed`, `stanceCyclePressed`.

## What it does NOT own (and where to look)

- Gamepad / touch input — not implemented
- Input mapping UI — not implemented
- Any game logic triggered by input — `src/player/player.ts`, `src/session/game.ts`

## Public surface

```ts
export function initInput(): void
export function isDown(...codes: string[]): boolean
export function justPressed(...codes: string[]): boolean
export function justReleased(...codes: string[]): boolean
export function endFrame(): void

// Gameplay aliases
export const leftDown: () => boolean // ArrowLeft | KeyA
export const rightDown: () => boolean // ArrowRight | KeyD
export const downDown: () => boolean // ArrowDown | KeyS
export const jumpPressed: () => boolean // Space | KeyZ | ArrowUp | KeyW
export const jumpReleased: () => boolean // same codes
export const respawnPressed: () => boolean // KeyR
export const shootPressed: () => boolean // KeyX
export const stanceCyclePressed: () => boolean // KeyC
```

## External dependencies

- Pixi v8 modules used: none
- Other contexts: none (no imports from other `src/` modules)

## Invariants / rules

- **CRITICAL: `endFrame()` must be called exactly once at the end of every fixed-step physics update**, after all edge reads for that tick. It is deliberately NOT called during hitstop — see `session/game.ts#fixedUpdate`. Skipping `endFrame` causes `justPressed`/`justReleased` to remain true for more than one tick, breaking jump buffering and cut logic.
- `initInput()` is idempotent — it guards with an `initialized` flag and silently returns on re-call.
- Window blur clears all keys to prevent "sticky" keys when the window loses focus mid-press.
- `GAME_KEYS` defines which key codes receive `preventDefault()`. Only keys in this set suppress browser scroll/zoom behavior. Do not add keys here without intention — suppressing unrelated keys breaks accessibility.
- `justPressed` / `justReleased` are true for exactly **one** physics tick. They must only be read within a fixed-step update, not at render cadence.

## Why this context exists as its own thing

Input state needs to be a module-level singleton so multiple systems (player movement, game loop, UI) can all query the same frame's state without passing a context object around. The edge-detection contract (`keys` vs `prevKeys` diff) is a subtle invariant that should live in one place — if it were inlined in `player.ts`, the game loop could not independently check `respawnPressed` without duplicating the diff logic or coupling to the player module.
