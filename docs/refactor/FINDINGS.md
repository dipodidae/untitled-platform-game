# Findings — bugs / smells noticed during the refactor

The refactor is pure — zero behavior changes. Anything that looked like a
bug, smell, or load-bearing oddity got logged here for a future session
to triage.

## 1. Duplicate `BULLET_KINDS` / `BulletKindName` definitions — **RESOLVED** (`4d71f80`)

**Files:** `src/combat/bullet.ts` and `src/combat/weapons/index.ts`.

Both files independently defined a `BULLET_KINDS` map and a
`BulletKindName` type. They drifted at some point — the two were not
a single source of truth.

**Fix:** Removed the inline `BulletKind` interface, `BULLET_KINDS`
constant, and `BulletKindName` type from `combat/bullet.ts`; now
re-exports them from `./weapons`. `weapons/bigShot.ts` values corrected
to match the runtime-authoritative values (see also finding 7). Commit
`4d71f80`.

## 2. Other zone types (wind/gravity/hazard/trigger) authorable but not wired at runtime

**Context:** earlier in the session a `git reset --hard` wiped uncommitted
work that included the runtime player.ts logic for consuming wind /
gravity / hazard / trigger zones. The zone types still exist in
`world/level.ts`, the editor still places them, and `Level.zones` still
carries them — but `player.ts` only consumes `goal` and `spawnPoint`.

The existing brushes for these types are marked `live: true` in
`editor/brushes.ts` even though the runtime ignores them. This conflicts
with the "Editor ↔ engine sync" rule in CLAUDE.md.

Recommend: either re-implement the runtime consumers (re-add the per-zone
behavior in `updatePlayer`) or set those brushes to `live: false` to be
honest about the current state.

## 3. `src/combat/bullet.ts` and `src/combat/weapons/bigShot.ts` both define `bigShot` weapon profile

Same root cause as finding 1 — the per-weapon files in `weapons/` weren't
wired up as the source of truth. Recommend deleting one and importing
from the other.

## 4. `src/world/level.ts` schema doc-comment is stale

The top-of-file JSON schema example references materials `"dirt" | "stone"
| "steel" | "hazard"` — the actual `MaterialName` union is `'glass' |
'bone' | 'bone_fragile' | 'resonant' | 'soft' | 'shard'`. The schema
comment was left from an earlier iteration.

Recommend: update the doc comment to match `MaterialName`.

## 5. `vite.config.ts` `editor-save` middleware is dev-only and unauthenticated

By design, but worth flagging: anyone with network access to the dev
server can `POST /__editor/save?name=level1` to overwrite a bundled
level. Acceptable because dev server is local-only. If the dev server
ever binds publicly, restrict to localhost or add a token.

## 6. `editor/sidebar.ts` was deleted but the import comment in `editor/state.ts` (and elsewhere) still says "DOM sidebar"

Cosmetic, but the docstring no longer matches the reality (sidebar was
split into `leftPanel.ts` + `rightPanel.ts`). Recommend a doc-comment
sweep across the editor.

## 7. **Functional discrepancy** in duplicated `BULLET_KINDS` — **RESOLVED** (`4d71f80`)

Building on finding 1: the duplicated definitions didn't just exist — they
**disagreed**.

- `combat/bullet.ts` `bigShot`: `speed: 340, size: 6, gravity: 140, lifeSec: 1.2, ruptureRadius: 24`
- `combat/weapons/bigShot.ts` `BIG_SHOT`: `speed: 440, size: 7` (diverged).

**Fix:** `weapons/bigShot.ts` values corrected to the runtime-authoritative
`combat/bullet.ts` values, then the inline copy in `bullet.ts` was removed
(see finding 1). Both findings resolved in the same commit `4d71f80`.

## 8. `session/levelManager.ts` is not wired into the running game — **RESOLVED** (`c75bb27`)

`levelManager.loadLevel(id)`, `saveLevel(id)`, `markLevelLoaded(id)`,
`nextLevelId(id)` all existed. `session/game.ts` was ignoring all of them.

**Concrete consequence:** the editor's "save" flow (which writes to
`localStorage` via `saveLevel`) was never read by the running game.

**Fix:** Deleted private `LEVELS` array and raw JSON imports from
`game.ts`. Added `levelIdAt(index)` helper to `levelManager.ts`.
`createGame` and `loadLevelAtIndex` now call `levelIdAt + loadLevel`
(localStorage-first) and `markLevelLoaded`. `advanceLevel` uses
`listLevels().length` for catalog sizing. Commit `c75bb27`.

## 9. Pickup system is authored but dead at runtime — **RESOLVED** (`716316b`)

`LevelJson.pickups` existed, `createPickupsFromSpawns` /
`tickPickups` / `pickupOverlapsPlayer` were exported from `items/`, the
editor placed pickups — but `session/game.ts` never spawned, ticked,
rendered, or detected collection.

**Fix:** `Level.pickupSpawns` field added; `GameState.pickups` wired in;
`fixedUpdate` ticks + detects + collects pickups (sets
`player.currentWeapon`, emits `emitPickupClaim` burst); `render()` draws
each alive pickup as a glow halo + body + accent dot with vertical bob.
`Player.currentWeapon` field added; `spawnBullet` now passes it so the
equipped weapon fires. Commit `716316b`.

## 10. `physics/narrowphase.ts#sweptToi` is unreachable — **RESOLVED** (`b68dbfc`)

CCD function existed with no call site.

**Fix:** Deleted `sweptToi` and the now-unused `Vec2` import from
`narrowphase.ts`. Tunneling is not a concern at player-speed substep
dt with the current substep count. Commit `b68dbfc`.

## 11. `RenderContext.eyeGfx` is a permanently-empty Graphics node

Allocated, added to `worldContainer`, never drawn. Comment says "unused
but kept for interface compat" — the interface it was compatible with
is gone. Remove on the next render-context cleanup.

## 12. `RenderContext.worldCacheKey` is computed every frame, used by nothing

`hashColliders(level)` runs each render frame and writes the result to
`ctx.worldCacheKey`. The early-return cache path was removed (glass
flicker + bone jitter need per-frame draws), so the hash field is dead
weight.

## How to triage

These are tickets, not the refactor's responsibility. When you decide to
fix one, prefer a small dedicated commit and an ADR if the fix changes
shape significantly.

Findings 1, 7 (BULLET_KINDS), 8 (levelManager wiring), and 9 (pickups)
are functional gaps — players will notice. The rest are dead-code
cleanups.

## 13. No audio system at all

Deliberately skipped during the AAA-polish pass. Intended features that
would need audio as a prerequisite:

- Menu music bed, selection click/whoosh SFX
- "Rising music cue, low rumble, then bass hit" on drop-in
- Triumphant stinger + tick-per-digit on finish
- Footsteps, jump SFX, impact sounds, pickup sounds
- Sound variation (±5% pitch randomization)
- Dynamic music that shifts on combat state / objective proximity

**Recommend:** introduce a thin audio context in a new `src/audio/`
bounded context. Web Audio API is fine for this scale. Single
`AudioEngine` with play(clip, { pitch, volume }) + a tiny bus for music
vs sfx. Mount lazily on first user interaction (browser autoplay rules).

## 14. No gamepad / rumble

Input module is keyboard-only. Controller rumble was in the AAA spec but
not implemented. Future: extend `input/input.ts` to poll `navigator
.getGamepads()` and expose a `rumble(intensity, duration)` helper via
the Gamepad Haptic API.

## 15. No XP / achievements / persistent progression

AAA spec asked for XP bar fills, level-up flourishes, achievement
popups. None exist because there's no progression system. The results
screen's Grade stamp is the closest equivalent (S/A/B/C computed from
time + deaths). A real progression system would need:

- Persistent player record in `localStorage` (totalXp, unlocks, best
  grades per level)
- A new `progression` bounded context
- XP-per-action rules (time bonus, collectible bonus, no-death bonus)
- Achievement triggers listening on EventBus events

## 16. No camera fly-in on drop-in

The AAA spec asked for "Cinematic camera fly-in across the level (3–5
seconds), showing scale and atmosphere" before control hands off.
Skipped because the existing camera is tightly coupled to the player's
position via `updateCamera(camera, player, level)`; overriding it for a
cinematic would mean either pausing the player-follow or driving the
camera from a separate cinematic-camera state.

Recommend: add a `CameraDirector` that can temporarily override camera
position from a keyframed path, then release control back to
`updateCamera` when the cinematic finishes. Gate on
`gameSession.phase === 'dropIn'`.
