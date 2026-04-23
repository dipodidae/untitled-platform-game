# FAULTLINE

*You don't die. You break.*

You are a small warm thing moving through a world that is already losing
its grip. Your body can't hold itself together. Every step, every
landing, every scrape against a wall adds to the instability inside you.
At some point — sooner than you meant, always sooner than you meant —
you fracture, and the shape of that fracture is cut out of whatever you
happen to be standing on.

You can delay it. Standing still bleeds off a little of the pressure.
Holding **V** clamps down harder, but you can't move while you do it,
and letting go costs you a beat of balance. That's containment. It is
your only way to push back.

What you can't do is prevent it. Eventually, you will break.

The question is what's around you when you do.

---

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
```

Node 20+. PixiJS v8 + Vite + TypeScript. Physics: polygon-based
collision via SAT, slopes up to 50°, one-way platforms, 120 Hz
substepped internally so the MTV doesn't pop you off bumpy terrain.
Destruction: polygon boolean difference, re-decomposed into convex
pieces per tick.

## Controls

| Action     | Keys                               |
| ---------- | ---------------------------------- |
| Move       | `← →` / `A D`                      |
| Jump       | `Space` / `Z` / `↑` / `W`          |
| Contain    | `V` / `Shift` (hold; can't move)   |
| Drop       | `↓` / `S` + `Space` on a platform  |
| Begin again| `R`                                |

## The world under your feet

There are four kinds of matter here, and each one fails differently.

**Glass** is pale and translucent. It breaks the moment you rupture
against it. You only get the one hit, and what it leaves behind is
shards — red, jagged, and lethal on contact. The danger of destroying
glass is that it makes the next traversal of the same space worse than
the first. Be careful where you choose to shatter.

**Bone** is the floor of this world. Off-white, old, structural.
Ruptures crack it, and the cracks *stay*. Each hit compounds — you can
weaken a bone platform across three separate fractures and then land on
it later and have it finally give. Things you primed earlier will
decide your run.

**Resonant** is blue-cold and indestructible. When you rupture against
it, it launches you back harder than it should. A single resonant wall
gives you distance; a chain of them, touched in one rupture, sends you
somewhere you didn't plan to go. The game has moments of this. Some you
will love. Some you won't.

**Soft** is mauve and yielding. It collides, but it dampens you — step
into it and your speed bleeds out. It's safe. It's also expensive:
momentum is hard to regain from inside it, and ruptures carve it
poorly, swallowing part of the blast. You can hide there. It costs
everything you were trying to do.

## Degradation

Your base controller is perfect — acceleration, coyote time, jump
buffer, slope handling, all unchanged through a run. What changes is
your *body*. As instability rises, the output layer starts failing
around the controller:

- Your top speed climbs a little past what you intended (you overshoot).
- Your deceleration gets weaker (it's harder to stop, harder to correct).
- Gravity pulls fractionally harder on falls.
- Past a threshold, your silhouette visibly jitters. You are
  not entirely here.

The controller is still perfect. The thing holding it isn't.

You can still beat the game at high instability. You won't trust
yourself to.

## Foresight

At high instability, a faint outline shows where your body will be in
the next third of a second — and the shape of the rupture you'd carve
there. It's dim on purpose. Watching someone read it fluently should
look like they're predicting physics before it happens. Don't rely on
it; let it teach you.

## Dread

Near the threshold, the edges of the frame start pulsing red. The pulse
gets faster the closer you are. This is not a warning you can disable.
It is the world noticing.

---

## Authoring a level

Levels are JSON, loaded directly from `src/levels/*.json`. The schema:

```jsonc
{
  "spawn":       { "x": 50, "y": 300 },
  "worldWidth":  900,                 // px — camera clamps + fall-out use this
  "worldHeight": 420,
  "colliders": [
    {
      "id":       1,                  // unique within the level
      "material": "bone",             // "glass" | "bone" | "resonant" | "soft"
      "vertices": [[0, 370], [180, 370], [180, 400], [0, 400]],
      "oneWay":   false               // optional; collide only from above, vy ≥ 0
    }
    // ...
  ]
}
```

Vertices are an implicitly-closed ring, CCW in screen-space (top-left
→ top-right → bottom-right → bottom-left gives positive signed area,
which is what `poly-decomp-es` expects). Concave shapes are fine — they
get decomposed into convex pieces on load.

`shard` is a runtime-only material produced when glass breaks. Never
authored directly.

Point `src/game.ts` at a different JSON to swap the showcase level out;
the loader accepts anything conforming to `LevelJson` in
`src/world/level.ts`.

## The palette

Everything visual in the game reads from a single palette in
`src/render/palette.ts`. There are no presets or tints to choose from —
the whole look is one emotional spectrum, and a new palette replaces the
tone of the entire game at once. Two categories:

- **Materials** (`glass / bone / resonant / soft / shard`): each has
  `{ fill, edge, shadow, highlight }` read by the per-material draw
  routines in `src/render/world.ts` for edge lighting + AO.
- **World tone**: sky gradient, parallax layer tints, vignette, wind
  motes, aura, player, and UI presence all live on the same object.

If you want a different feeling, edit that file. If you want a
different *game*, don't.

## Tuning

Every gameplay number lives in `src/config.ts`, grouped by identity
concern:

- `INSTABILITY_*` — the charge-rate table (the rules that make you fail)
- `RUPTURE_*` / `FRACTURE_*` — shape of the wound / moment it happens
- `DEGRADE_*` — post-controller output modifiers
- `BONE_HITS` / `GLASS_SHARD_*` / `SOFT_*` / `RESONANT_*` — per-material
  behavior
- `DREAD_*` / `PREVIEW_*` — pre-fracture warning + foresight tuning
- `WIND_*` / `VIGNETTE_*` / `PARALLAX_SEED` — mood knobs

Look for `// TUNING:` markers in the destruction + rupture code for
spots the designer should revisit once the playtest has a shape.
