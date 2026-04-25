# Context: render

**Path:** `src/render/`
**One-line purpose:** Owns the entire Pixi scene graph, all draw logic, the camera, FxState (hitstop + shake + flash), the particle system, and the Spineboy skeletal character bridge.

## What this context owns

- `index.ts` — `RenderContext` (the full scene graph record); `buildScene`, `teardownScene`, `render` (the per-frame draw call).
- `camera.ts` — `Camera`, `CAMERA_CONFIG`; `createCamera`, `updateCamera`, `addTrauma`. Three-layer ghost camera: player → focus point → camera, with lookahead, deadzone, asymmetric Y damping, speed zoom, and trauma shake.
- `fx.ts` — `FxState` (hitstop ticks + shake + flash timers); `createFxState`, `consumeHitstopTick`, `tickFxRender`, `triggerShake`, `triggerFlash`, `triggerFractureFx`, `shakeOffset`, `flashAlpha`.
- `particles.ts` — `ParticleSystem`, `ParticleKindName`; `createParticleSystem`, `resetParticleSystem`, `tickParticles`, `emit` (base), and named emitters: `emitImpactBurst`, `emitMuzzleFlash`, `emitLandingDust`, `emitWallSlideSparks`, `emitDisintegration`, `scatterMotes`.
- `world.ts` — `drawColliders`, `hashColliders`. Draws polygon colliders with per-material visual style.
- `playerRenderer.ts` — `resetPlayerRenderer`. Player visual reset on respawn.
- `prowlerRenderer.ts` — `drawProwler`. Minimal prowler visual.
- `spineboy.ts` — `SpineboyBridge`, `SPINE_CONFIG`; `loadSpineboyAssets`, `createSpineboyBridge`, `updateSpineboyVisual`, `resetSpineboyBridge`, `triggerShootOverlay`, `cycleStance`. The Spine skeletal character FSM + muzzle snapshot.
- `camera.ts` — (listed above)
- `parallax.ts` — `ParallaxState`; `createParallax`, `updateParallax`. Seeded two-layer silhouette background.
- `palette.ts` — `PALETTE` (color constants), `activePalette`.
- `post.ts` — `drawSky`, `drawVignette`. Static sky gradient + frame vignette.
- `wind.ts` — `WindState`; `createWindState`, `tickWind`, `drawWind`. Ambient wind-streak particles (render-cadence aesthetic only).
- `CRTFilter.ts` — `CRTFilter` (custom Pixi Filter subclass). CRT scanline post-processing.

## What it does NOT own (and where to look)

- Hitstop physics gating — `session/game.ts` (`consumeHitstopTick` result gates `fixedUpdate`). FxState lives here because rendering owns shake/flash; the tick-count is physics-deterministic but the visual effects run at render cadence.
- Game state and level progression — `src/session/`
- Player entity data — `src/player/player.ts`
- World collider data and destruction — `src/world/`
- HTML overlay UI — `src/ui/`

## Public surface

```ts
// index.ts
export interface RenderContext { app, bgContainer, worldContainer, uiContainer, charBridge, ... }
export function buildScene(app, level, particles): RenderContext
export function teardownScene(ctx): void
export function render(ctx, player, camera, fx, level, dt, prowlers?, bullets?, dummies?, broadphase?): void

// camera.ts
export interface Camera { x, y, focusX, focusY, lookaheadX, facingDir, zoom, trauma, shakeX, shakeY }
export function createCamera(player): Camera
export function updateCamera(camera, player, level): void
export function addTrauma(camera, amount): void

// fx.ts
export interface FxState { hitstopTicks, shakeTimer, shakeDuration, shakeAmplitude, flashTimer, flashDuration }
export function createFxState(): FxState
export function consumeHitstopTick(fx): boolean      // called by session/game.ts
export function tickFxRender(fx, dt): void           // called at render cadence
export function triggerFractureFx(fx): void          // sets hitstop + shake + flash together (used by bullet impacts)
export function shakeOffset(fx): { x, y }
export function flashAlpha(fx): number

// particles.ts
export interface ParticleSystem { root: Container, ... }
export function createParticleSystem(renderer): ParticleSystem
export function resetParticleSystem(ps): void
export function tickParticles(ps, dt): void
export function emitImpactBurst(ps, x, y, material, vx, vy): void
export function emitMuzzleFlash(ps, x, y, dirX, dirY): void
export function emitLandingDust(ps, x, y, impactNorm): void
export function emitWallSlideSparks(ps, x, y, wallSide): void
export function emitDisintegration(ps, cx, cy, vx, vy, intensity): void
export function scatterMotes(ps, worldW, worldH, count): void
```

## External dependencies

- Pixi v8 modules used: `Application`, `Container`, `Graphics`, `Text`, `Texture`, `TilingSprite`, `Particle`, `ParticleContainer`, `RenderTexture`, `Filter`, `Spine` (via `@esotericsoftware/spine-pixi-v8`)
- Other contexts:
  - `src/player/player` — `Player` type (read-only)
  - `src/enemies/dummy` — `Dummy`, `dummyAabb`
  - `src/enemies/prowler` — `Prowler`
  - `src/combat/bullet` — `BulletState`, `predictBulletImpact`
  - `src/world/level` — `Level`, `Collider`, `MaterialName`
  - `src/physics/broadphase` — `BroadphaseGrid`
  - `src/session/eventBus` — none (render does not subscribe to events)
  - `src/config` — all visual tuning constants

## Invariants / rules

- **Hitstop lives here despite gating physics** (ADR-0003 rationale): `FxState.hitstopTicks` is a tick counter decremented by `consumeHitstopTick` (called from the physics loop). Shake/flash timers decay at render cadence via `tickFxRender`. These are two separate clocks; do not merge them.
- **`triggerFractureFx` sets all three FX (hitstop + shake + flash) together.** Do not split the three `fx.*` writes across separate call sites — the simultaneous landing is load-bearing for the impact recognition beat.
- The logical render buffer is 480×270 (`LOGICAL_WIDTH × LOGICAL_HEIGHT`). The scene is pixel-scaled via CSS. Do NOT set `autoDensity` or change `resolution` on the Pixi app — that breaks the pixel grid.
- `worldContainer` is camera-panned and shake-offset each frame. `uiContainer` and `bgContainer` are screen-fixed. Do not add player-world objects to `uiContainer`.
- Particles tick at **physics cadence** (spawned from deterministic blast events) but their `root` container lives in `worldContainer` and moves with the camera.
- `SpineboyBridge.muzzleReady` must be checked before reading `muzzleX/Y/DirX/Y` — they are invalid until Spine's first render frame has run.
- `hashColliders` is called each frame; rendering always redraws colliders. The "draw only on hash change" approach from the old CLAUDE.md has been replaced with unconditional per-frame redraw to support glass flicker and bone jitter animations.

## Why this context exists as its own thing

All rendering concerns are inherently coupled to the Pixi scene graph, which no other context should own. Centralizing the scene graph here means `buildScene`/`teardownScene` cleanly handle level transitions, and the `render` function has a single well-defined call site (the ticker in `session/game.ts`). The `FxState` lives here (not in `session/`) because all three timers drive visual outputs — `shakeOffset` and `flashAlpha` are rendering primitives, even if `hitstopTicks` also gates physics.
