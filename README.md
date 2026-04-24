# FAULTLINE

*You break. You also shoot back.*

You're a small warm thing moving through a world that's already losing
its grip. Your body can't hold itself together — every step, every
landing, every scrape adds to the instability inside you. At some point,
sooner than you meant — always sooner than you meant — you fracture,
and the shape of that fracture is cut out of whatever you happen to be
standing on.

You also carry a gun. You use it to shape the world before the world
shapes you. The slugs arc. The ground gives. What you destroy this pass
is what you have to live with on the next one.

Holding **V** clamps down on the pressure, but you can't move while you
do it, and releasing costs you a beat of balance. That's containment.
It's your only way to push back against yourself. Everything else breaks.

---

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

Node 20+. PixiJS v8 + Spine runtime (4.2) + Vite + TypeScript. Physics:
polygon collision via SAT, slopes up to 50°, one-way platforms, 120 Hz
substepped internally so the MTV doesn't pop you off bumpy terrain.
Destruction: polygon boolean difference, re-decomposed into convex
pieces per carve. Character: Spineboy rig via
`@esotericsoftware/spine-pixi-v8`.

## Controls

| Action        | Keys                               |
| ------------- | ---------------------------------- |
| Move          | `← →` / `A D`                      |
| Jump          | `Space` / `Z` / `↑` / `W`          |
| Shoot         | `X`                                |
| Stance cycle  | `C` (forward → high → low → hip)   |
| Contain       | `V` / `Shift` (hold; can't move)   |
| Drop-through  | `↓` / `S` + jump on a one-way      |
| Begin again   | `R`                                |

## Movement

Celeste-grade feel — coyote time, jump buffer, wall jump with input
lock, wall-stick grace, double jump (with instability cost), slope
projection, stick-to-ground, corner-nudge. The controller is perfect.
What changes under load is the body holding it — see **Degradation**.

## Shooting

The slug arcs. Your gun fires from the visible muzzle, in the direction
the Spineboy rig is aiming — the `crosshair` bone drives it, then a
per-stance `mitigation` + `biasY` post-processes the vector so the
result tracks whatever pose the animation happens to be on.

A live crosshair forward-simulates the trajectory every frame and marks
the predicted impact. Red means a dummy would eat the shot, warm-white
means terrain, grey means the bullet times out empty. You aim with the
crosshair, not the character silhouette.

Bullets damage enemies and carve terrain through the same `applyRupture`
path the fracture uses — so glass shards, bone damage, and soft
absorption all behave consistently whether the rupture came from you
breaking or from a slug landing.

**Stances.** Cycle with `C`:

- `forward` — gun up forward, horizontal aim. Default.
- `high` — tilt upward.
- `low` — tilt downward (shooting at ground-level enemies).
- `hip` — gun hangs at the hip; aim is force-horizontalized. Quicker
  read, looser pose.

## Fracture

Instability accumulates from movement — jump, land hard, press into a
wall, hold max speed on the ground. Containment (`V`) bleeds it off
fast, at the cost of being rooted in place.

Near max, the frame edges begin pulsing red (dread), and a faint blue
ghost shows where your body will be in the next third of a second, plus
the shape of the rupture you'd carve there. Dim on purpose — mastery
tool, not a crutch.

At max, the fracture fires **on the next tick** — nine frames of
hitstop while the ring sings, debris bursts in the color of whatever
material you broke, your body rebounds off the self-impulse, iframes
until the ring fades. The tile map under you is now a hole shaped like
the direction you were moving.

## HP

Three HP. Hazard contact costs one and grants ~0.7s of i-frames so a
continuous overlap doesn't multi-hit you. Fall-out-of-world kills you
regardless — HP doesn't save you from the void.

HP is the mundane failure condition. Instability is the interesting one.

## The world under your feet

Each material fails differently, and your bullets carve them the same
way ruptures do.

- **Glass** — pale, translucent. One hit and it's gone. What's left
  behind is shards — red, jagged, lethal on contact. Breaking glass
  makes the next traversal of the same space worse than the first.
- **Bone** — off-white, structural. Ruptures crack it, and the cracks
  *stay*. Three fractures in the same spot and it finally gives on a
  routine landing a minute later. Things you primed earlier decide your
  run.
- **Bone-fragile** — aging bone. Collapses after cumulative contact
  time, no rupture required. Timer persists across touches.
- **Resonant** — blue-cold, indestructible. Pushes back on rupture and
  bullet impacts both. A chain of resonant surfaces touched in one
  blast stacks the launch bonus. Some of those launches you will love.
  Some you won't.
- **Soft** — mauve, yielding. Dampens you on contact, absorbs part of
  ruptures. Safe. Expensive to leave. You can hide there; it costs
  everything you were trying to do.

`shard` is a runtime-only material, spawned from broken glass. Never
authored directly.

## Enemies

**Prowlers** — AI-driven body actors. They don't aim; they push. Ground
confidence scales their speed (bone 1.0, glass 0.3), and they carry
their own instability meter that spikes off the same events yours does.
High-instability prowlers break the glass they stand on. A rupture
within range throws them clear and stuns them.

**Dummies** — AI-less test targets. Stand where placed, take HP
damage, flash on hit, vanish at zero. For tuning weapon feel and
impact VFX in isolation.

## Degradation

As instability rises, the output layer starts failing around the
perfect controller underneath:

- Top speed climbs past what you intended (you overshoot).
- Deceleration weakens (harder to stop, harder to correct).
- At threshold, your silhouette visibly jitters. You are not entirely
  here.

The controller is still perfect. The thing holding it isn't.

You can still beat the game at high instability. You won't trust
yourself to.

---

## Authoring a level

Levels are JSON in `src/levels/*.json`. Schema:

```jsonc
{
  "spawn": { "x": 80, "y": 300 },
  "worldWidth": 2800,
  "worldHeight": 560,
  "colliders": [
    {
      "id": 1,
      "material": "bone", // glass | bone | bone_fragile | resonant | soft
      "vertices": [[0, 400], [520, 400], [520, 500], [0, 500]],
      "oneWay": false,                                   // optional
      "kinetic": { "type": "rotor", "speed": 0.3 }       // optional
    }
  ],
  "prowlers": [{ "x": 2080, "y": 364 }],
  "dummies": [{ "x": 300, "y": 368, "hp": 5 }]
}
```

Vertices are an implicitly-closed ring, CCW in screen-space (Y-down).
Concave is fine — `poly-decomp-es` decomposes on load. Kinetics support
`rotor`, `breather`, and `spring`. Reaching the right world edge
advances; `src/game.ts` lists the level order.

## Level 1 in six beats

1. **Tutorial** (0–520) — flat ground, first dummy at x=300, breathing
   block to show kinetics exist.
2. **Gap + fragile step** (520–820) — first jump, a `bone_fragile` step
   that collapses if you linger.
3. **Glass barrier** (1120–1400) — a glass pillar blocks the path.
   Shoot through it, or walk through it and deal with the shards at
   your feet. A 3-HP dummy waits just past.
4. **Wall-jump shaft** (1400–1620) — narrow vertical, upper ledge
   rewards the climb with a dummy perched at y=188.
5. **Slope + prowler** (1800–2160) — descent that exercises slope
   projection; a patrolling prowler on the lower ground; a `soft`
   one-way tucked in halfway down.
6. **Resonant chain + exit** (2160–2800) — ascending resonant steps
   compound the launch, a `rotor` for flavor, exit plateau.

## The palette

One palette, one mood. `src/render/palette.ts`. Editing it changes the
game's whole emotional spectrum at once. Two categories:

- **Materials** — `{ fill, edge, shadow, highlight }` per material,
  read by the per-material draw routines in `src/render/world.ts`.
- **World tone** — sky gradient, parallax, vignette, wind motes, aura,
  player, UI.

If you want a different feeling, edit that file. If you want a
different *game*, don't.

## Tuning

Every gameplay number lives in `src/config.ts`, grouped by identity
concern:

- `MAX_RUN` / `*_ACCEL` / `*_DECEL` / `AIR_*` — horizontal feel.
- `JUMP_*` / `WALL_*` / `COYOTE_*` / `JUMP_BUFFER` / `DJ_*` — jump feel.
- `INSTABILITY_*` — the charge rules (how you fail).
- `RUPTURE_*` / `FRACTURE_*` — shape of the wound, moment it happens.
- `DEGRADE_*` — post-controller output modifiers.
- `BONE_HITS` / `GLASS_SHARD_*` / `SOFT_*` / `RESONANT_*` — per-material.
- `DREAD_*` / `PREVIEW_*` / `GHOST_*` — pre-fracture warning + foresight.
- `PLAYER_MAX_HP` / `HAZARD_*` — HP system.
- `WIND_*` / `VIGNETTE_*` / `PARALLAX_SEED` — mood knobs.

Weapon profiles live in `BULLET_KINDS` (`src/bullet.ts`). Gun stances
in `STANCES` (`src/render/spineboy.ts`). Camera feel in `CAMERA_CONFIG`
(`src/camera.ts`). CRT shader constants at the top of
`src/render/CRTFilter.ts`.

Look for `// TUNING:` markers in the destruction and rupture code for
spots the designer should revisit once playtest has a shape.
