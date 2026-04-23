# Dynamite Platformer

*Celeste, but you're a stick of dynamite and the level is a sandcastle.*

You're a walking bomb. Movement generates **pressure**; at 100% you detonate
and carve chunks out of the level. Destruction is permanent within a run —
the level resets when you die. Built on PixiJS v8, Vite, and TypeScript over
a fixed-step AABB platformer core (coyote time, jump buffering, variable
jump height, asymmetric gravity, corner correction, turnaround boost).

## Run

Requires Node 20+ and npm.

```sh
npm install
npm run dev      # dev server on http://localhost:5173 with HMR
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build locally
```

## Controls

| Action  | Keys                              |
| ------- | --------------------------------- |
| Move    | `←` / `→` or `A` / `D`            |
| Jump    | `Space`, `Z`, `↑`, or `W` (hold for higher) |
| Vent    | `V` or `Shift` (hold to bleed pressure; movement is locked; 0.15s post-release stun) |
| Respawn | `R`                               |

## The pressure loop

- **Gain** pressure by jumping (+8 each), sprinting at max speed, pressing into
  walls, and landing hard from a fall.
- **Bleed** pressure by standing still on the ground (−6/sec) or by venting
  with `V` / `Shift` (−40/sec, but you can't move while venting and you eat
  a brief stun on release).
- At **100 %** you detonate on the next physics tick. The blast is shaped by
  your velocity at that instant — standing still is a symmetric circle;
  moving bends it into a cone along your motion.
- The detonation rocket-jumps you in the direction **opposite** the blast's
  dominant axis. Grounded → lift. Sprinting → forward shockwave. Falling
  fast → launched back up.

## The three readability signals

1. **Aura** — the glow under the player is blue at low pressure, yellow in
   the middle, orange past 66 %, then pulsing red above 90 %. Radius grows
   with pressure so peripheral vision catches it.
2. **Ghost blast preview** — at ≥ 92 % pressure, a faint outline of the
   predicted blast shape tracks your live velocity so you can aim the
   detonation before it happens.
3. **Vent indicator** — meter label + downward-arrow VFX while venting,
   dimmed while you're in post-vent stun.

## Material legend

| Tile | Glyph | Behavior                                                  |
| ---- | ----- | --------------------------------------------------------- |
| empty   | `.`  | —                                                      |
| dirt    | `d`  | Crumbles **completely** on one blast hit.              |
| stone   | `s`  | **Chips**: takes 2 blast hits; shows cracks after #1.  |
| steel   | `S`  | **Indestructible**. Blasts reflect off it — kicks you harder away. |
| hazard  | `x`  | **Kills on contact.** Blasts don't remove it.          |

## Where to tweak

| I want to...                              | Edit                                                 |
| ----------------------------------------- | ---------------------------------------------------- |
| Change jump height / gravity / speed      | `src/config.ts` (every tunable lives here)           |
| Tune pressure gains / bleeds / vent rate  | `src/config.ts` (`PRESSURE_*`, `VENT_STUN`)          |
| Tune blast size / impulse / steel bonus   | `src/config.ts` (`BLAST_*`, `STONE_HITS`)            |
| Tune hitstop / shake / flash              | `src/config.ts` (`BLAST_HITSTOP_FRAMES`, `BLAST_SHAKE_*`, `BLAST_FLASH_DURATION`) |
| Change aura colors or thresholds          | `src/config.ts` (`AURA_*`)                           |
| Reshape the test level                    | `src/level.ts` — `LEVEL_STRINGS`                     |
| Add a new material                        | `src/materials.ts` + parser chars + palette in config |
| Change pressure rules                     | `src/pressure.ts`                                    |
| Change blast shape / damage / reflection  | `src/blast.ts`                                       |
| Change juice (particles, shake curves)    | `src/fx.ts`                                          |
| Controls / add a key                      | `src/input.ts`                                       |

Look for `// TUNING:` comments in `src/blast.ts` for spots the designer
should revisit after playtesting.

## Project layout

```
index.html              — mount point + module entry
src/
  main.ts               — boot: Pixi Application, resize, input init
  config.ts             — all tunables (jump + pressure + blast + fx + aura)
  input.ts              — keyboard state & press/release edges
  level.ts              — tilemap strings, parser, Level type, resetLevel
  materials.ts          — tile ids, solid/destructible/reflective/hazard tables
  physics.ts            — AABB resolve, corner correction, material-aware solidity
  pressure.ts           — pressure state machine, vent rules
  blast.ts              — blast shape, tile damage, self-impulse, steel reflection
  fx.ts                 — hitstop, screenshake, flash, particles
  player.ts             — Player type, character controller, detonation wiring
  camera.ts             — deadzone follow + world-bounds clamp
  render.ts             — scene graph, per-material draw, aura, ghost, UI
  game.ts               — composition + fixed-step loop + hitstop gate
  style.css             — page + canvas scaling
public/                 — static assets served at /
vite.config.ts
tsconfig.json
```
