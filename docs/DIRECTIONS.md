# DIRECTIONS — what FAULTLINE could become

A planning doc, not a spec. Point of this file is to make the decision
*about* the game more visible than the systems already inside it. Read it
end to end before committing to any one track.

Status: prototype. Most assets are placeholder rects. Physics is good
enough to test feel, not shipped-feel. The systems below are real but
the game around them isn't yet.

---

## 1. What you actually have

A short inventory, because it's stronger than you might be giving it
credit for.

### The pillar mechanic — destructible terrain + gun

Bullets carve the world through `applyRupture`. Every material reacts
differently (bone cracks and stays cracked; glass leaves shards;
resonant rebounds; soft absorbs), so a designer composes consequence by
choosing materials. The gun is the only terrain-destruction verb.

Instability still exists as a movement-degradation system (overspeed,
weaker deceleration), but it no longer triggers self-destruction.

### Movement controller

Celeste-grade: coyote time, jump buffer, wall-stick grace, wall jump
with input lock, double jump, corner nudge, slope projection,
stick-to-ground, generous-but-tight feel. Tuned in `src/config.ts`
with literal types. Already feels good before any art.

### Combat — gun + stances

Arcing slugs with a forward-simulated crosshair, four aim stances
(forward/high/low/hip), Spineboy rig drives muzzle position, bullets
carve the world through the same `applyRupture` path. Two weapon
profiles registered (`slug`, `bigShot`). The piping is real.

### Enemies (already implemented, mostly placeholder rects)

- **Prowler** — weighted ground-hugging organism; breaks glass under
  itself.
- **Dummy** — HP bag for tuning.
- **Specials** (10 kinds in `src/enemies/specials.ts`) — Mirror, Hush,
  Candlewick, Pendulum Knight, Bloomrot, Echo, Husk Crows, Cartographer,
  Reliquary Cart, Pilgrim. Each twists *how the player thinks*, not just
  what they dodge.
- **Classics** (13 kinds in `src/enemies/classics.ts`) — Medusa Head,
  Buzzy Beetle, Boo, Wallmaster, Stalker, Eggplant Wizard, Garpede, Iron
  Knuckle, Cagney, Dry Bones, Plantera, Hammer Bro, Mantis Lord. Riffs
  on the canon.

That's **23 enemy kinds with playable logic** and zero finished art.
This is unusual — most prototypes are inverted.

### Materials

`glass | bone | bone_fragile | resonant | soft | shard`. Each has a
distinct authoring contract (collapse-after-N-ruptures, contact-timer,
rebound-bonus, rupture-dampening, runtime-only-shrapnel). Shipping
material count is healthy.

### Authoring + level editor

Standalone Vue editor (`src/editor/`), JSON level format, round-trips
materials/zones/kinetics/entities. Three levels exist (`level1`,
`level2`, `showcase`); only `showcase` has been designed to a teaching
arc.

### World features

Kinetic platforms (rotor / breather / spring / linear), zones (gravity,
wind, hazard, trigger, goal, spawnPoint), polygon destruction, polygon
collision via SAT.

### Atmosphere

CRT shader, particle system, screen shake, hitstop, parallax,
vignette, wind motes, palette in one file (`render/palette.ts`) so
the whole mood swings off one edit.

### Items

Health pack, armor shard, coin, platinum coin, crown, big-shot weapon
pickup. Magnetism + claim FX wired.

### What's missing or thin

- **Audio**: not visible in the tree. Add this and the game changes.
- **Story / character / why-am-I-here**: README hints at body horror
  ("you can't hold yourself together") but no in-world delivery.
- **Progression spine**: no save, no metaprogression, no unlock
  vocabulary. The level catalog is a flat array.
- **Difficulty / pacing tools**: no checkpoints used in the levels, no
  death counter surfaced in UI, no "section completed" rhythm.
- **Goal beyond reaching the right wall**: level transitions are spatial
  edge triggers. There's no boss fight realized yet.
- **Real assets**: most enemies are crude rects; player is Spineboy
  placeholder; tiles are flat polygon fills.

---

## 2. The decision you're avoiding

You have content for at least four different games inside the same
repo. Pick one. The systems are general enough that doubling back later
is cheap, but the *art, story, level structure, and progression spine*
are not.

### A — Tight linear arcade-platformer (Celeste-shape)

**Pitch**: 40–60 hand-crafted screens. Death = retry instantly. No
metaprogression. The journey is the mastery curve.

**Plays to**: your movement controller, destructible-terrain-via-gun
mechanic, showcase-style 4-section authoring. Your `showcase.json`
already gestures at this with Trust → Consequence → Control → Payoff.

**Cuts**: most of the 23 enemy kinds. You'd ship 3–6, repeated and
recombined.

**Risk**: hand-crafted screen design is the single hardest discipline in
games. You'd be competing on level-design craft against Maddy
Thorson-tier benchmarks.

**Why this might be right**: every system you've built points here
except the enemy roster. The gun-carves-terrain mechanic *is* the level
designer's toolkit. Materials are puzzle pieces.

### B — Roguelike action-platformer (Dead Cells / Hollow Knight EOK)

**Pitch**: procedural or seeded room layouts, run-based progression,
weapon/item drops, death restart-from-start, meta-currency unlocks
between runs.

**Plays to**: the deep enemy roster, the weapon-registration system, the
items pipeline, the rupture-as-combat mechanic. Coins exist. Drops on
enemy-killed already wired (`session/game.ts`). Pickup attraction
implemented.

**Cuts**: hand-crafted screen design philosophy. The `showcase`
4-section teaching arc is a one-time thing in this version.

**Risk**: RNG-driven runs don't reward careful spatial planning the way
hand-crafted levels do.

**Why this might be right**: 23 enemy kinds is a roguelike-scale
enemy budget. The wave-based "specials" mechanics-twisting roster is
*made* for procedural pulls.

### C — Boss-rush focus (Cuphead / Furi)

**Pitch**: 6–10 hand-crafted boss fights, thin connective tissue
between.

**Plays to**: Cagney and Mantis Lord are already coded as
phase-cycling/skill-gate bosses. The combat pillar (gun + arcing slugs
+ stances + rupture-as-knockback) supports tight bullet-hell engagement.

**Cuts**: traversal levels become menus or thin atriums. Most platformer
chops drop.

**Risk**: visually expensive — bosses live or die on telegraphing
animation. With placeholder art this is the genre that suffers most.

**Why this might be right**: the gun and stances already form the verbs
of a boss fight.

### D — Atmospheric narrative platformer (INSIDE / Limbo)

**Pitch**: ~3 hours, no UI, no HP number — every mechanic becomes
diegetic.

**Plays to**: your aesthetic instincts (CRT, palette-driven mood,
sensory restraint).

**Cuts**: gun, stances, most enemies, items, coins, weapon pickups. Your
combat surface dies.

**Risk**: art-direction-driven game. Without an artist you can't ship
this. The systems work you've done is largely thrown away.

**Why this might be right**: it's the only direction where the pitch
*lives* in the brand voice you already write in. Every other path
requires you to find a different tone.

### Honest read

You've built mechanics that bias toward **A** (linear platformer with
craft levels) and content that biases toward **B** (roguelike, deep
roster).

Pick A if you want to be a designer. Pick B if you want to ship a
larger game with the systems you've got. Pick C if you trust your
combat more than your level design. Pick D only with a collaborator.

The next two sections assume you don't fully decide — they're sliced so
either A or B can pull from them.

---

## 3. Direction-agnostic features that buy time

These widen the game without forcing a genre choice. Cheap to add now,
useful later regardless of which path you commit to.

### 3.1 Audio (HIGHEST ROI)

You have **no sound** in the tree. Bullet impacts, hitstop, and
destruction all deserve audio. Ship one weekend of work here:

- Footsteps per material (bone tap, glass crack, soft thud, resonant
  hum).
- Bullet-vs-material — different per material.
- Destruction debris burst.
- Ambient mood bed.

Howler.js or `pixi-sound` integrates clean. New `audio/` bounded
context, ADR, materials checklist updated.

### 3.2 Save + run state

Even direction A wants this. localStorage is already used for level
catalog (`session/levelManager.ts`).

- Level-completion flags + best time + lowest-deaths per level.
- Settings persistence (volume, CRT intensity, key remap).
- For B: run seed + meta-currency + unlocked weapons.

### 3.3 Player identity (still placeholder Spineboy)

The character is the most-on-screen asset. A real rig — even crude pixel
art that matches the bone/oxblood palette — buys 80% of the perceived
polish. The game-assets / pixel-art-sprites skills can be used for this.
Spineboy is great for prototyping aim/stance, terrible for selling tone.

### 3.4 Death + retry rhythm

Currently `DEATH_FREEZE_MS: 400` then auto-respawn. This is mechanically
correct but dramatically flat. Steal Celeste's pattern:

- Brief freeze on the death frame (you have this).
- Subtle audio cue (a string snapping, a held breath).
- Camera pull-out / vignette tighten.
- Respawn fade-in with your shape *forming* from particles, not just
  appearing.

Cost: ~half a day. Effect: every retry feels intentional rather than
abrupt. This is direction-agnostic.

### 3.5 Onboarding without text

You have `src/ui/dropIn.ts` and a main menu. No tutorial. Players won't discover stance cycling or gun carving without guidance.
Two options:

- **Diegetic gating** — first level introduces one mechanic at a time
  by physical layout (you already gesture at this in
  `showcase.json`'s Trust section).
- **Minimal prompts** — a single faded glyph that fades when used. No
  tooltips, no "press X to". The minimalism reads as style, not
  laziness.

### 3.6 Editor quality-of-life

The editor is competent. The bottleneck on you shipping more levels
will be authoring speed. Cheap wins:

- Snap-to-grid + nudge keys.
- Duplicate/mirror selection.
- Test-from-here (drop player at clicked location).
- Material brush hotkeys.
- Live recompile of the running game on save (HMR for level JSON).

If you go A, this becomes critical. If you go B, less so (procedural
takes over).

---

## 4. Polish & feel — short list, ordered

This is the *small* stuff that makes a prototype look like a game. None
of it requires direction commitment.

| Item | Effort | Why |
|---|---|---|
| Real footstep + impact SFX | day | Sells every other system |
| Camera speed-zoom polish | half day | Camera zoom response on fast movement. Free tension. |
| Particles tinted by ground material | half day | You scaffolded this; finish it |
| Damage numbers fade-by-distance | hours | Less HUD noise during chaos |
| Speedrunner mode (timer, segment splits) | day | Direction-A-friendly, free engagement |
| Photo mode / pause-and-look | hours | The CRT + palette deserves it |
| Stance switch with visible *gun pose* held for a beat | half day | Right now stance cycle is invisible mid-action; the game's read suffers |
| Chromatic aberration spike on bullet impact | hours | CRTFilter already there; piggyback |
| Resonant chain visual — connect-the-dots line during a launch | day | Sells the "some launches you'll love" beat |
| Time dilation on big impacts | hours | Brief 0.5× slowdown before hitstop resolves. The rest reads bigger by contrast. |
| Death-cause line on retry ("the bone gave") | half day | Story-without-story. Free flavor. |
| Level-load drop-in (you have `dropIn.ts`) cinematic-tightening | day | The first frames define how a level reads |

---

## 5. Content tracks — what to build under each direction

### If you commit to A (linear platformer)

Build in this order:

1. **Audio pass** (§3.1).
2. **Player rig** (§3.3) — at minimum a character with cracks.
3. **5–8 levels** in the showcase template:
   - L1 Tutorial (Trust → Consequence → Control → Payoff). You have
     this.
   - L2 Glass-heavy, teaches priming.
   - L3 Bone_fragile-heavy, teaches time pressure.
   - L4 Resonant-heavy, teaches chain launches.
   - L5 Soft-heavy, teaches when to *stop*.
   - L6 All four materials, no new mechanics — pure execution.
   - L7+ Boss-shaped: a Pendulum Knight or Mantis Lord arena.
4. **One enemy per level**, drawn from existing roster, picked because
   it teaches what the level teaches:
   - Glass level → Prowler (breaks glass under itself).
   - Fragile level → Wallmaster zone (forces movement off fragile).
   - Resonant level → Hammer Bro (arcs need mid-air rerouting via
     resonant launches).
5. **Final level / boss** — Cagney or Mantis Lord, both already coded.
6. **Speedrun mode** (§4).
7. Cut everything else from this version — mark it `experimental/` and
   hide it.

You ship in 3–4 months and the result is a tight, honest game.

### If you commit to B (roguelike)

Build in this order:

1. **Audio pass** (§3.1).
2. **Run-state model** — `Run` record with seed, depth, hp, armor,
   inventory.
3. **Room generation** — a *room* is a polygon level with one entrance
   and 1–N exits. Author 30–50 rooms in the editor; the run picks from
   a tagged pool by depth.
4. **Map layer** — a metaprogression UI showing branching paths between
   rooms. Player picks routes.
5. **Tag system** for rooms — `glass-heavy`, `prowler-room`,
   `boss-room`, `shop`, `rest`. Generation respects tags.
6. **Shop** — you have coins. Make the platinum coin actually
   meaningful.
7. **Meta-unlocks** — weapons (already a registry), starting loadouts,
   permanent stat bumps. Save in localStorage.
8. **Two more weapons** — you have `slug` and `bigShot`. Add 4 more for
   variety. Each should change how rupture-via-bullet feels (e.g.
   `lance` — line shot that carves a slot; `pulse` — sphere-aoe that
   carves multiple materials).
9. **Boss roster** — Cagney, Mantis Lord, Iron Knuckle exist; each
   becomes a depth-N gate.
10. **Death = full restart** — the systems already lean this way; lean
    further.

You ship in 6–9 months, the result is a deeper game with content
parity.

### If you commit to C (boss rush)

1. **Audio pass** (§3.1).
2. **Six bosses** — Cagney and Mantis Lord exist. Pick four more from:
   Cartographer (transformed), Pendulum Knight (boss-scaled), a new
   "Choir" multi-Hush boss, a Bloomrot final.
3. **Per-boss arena** — small, themed, possibly destructible by the
   fight itself.
4. **Telegraph polish** — each boss attack must read 0.5–1.5 seconds
   before it lands. This is your single biggest art investment.
5. **Stance-vs-boss design** — each boss has a window each stance is
   optimal in. Rewards the cycle.
6. **Hub world** — small connecting space with a save shrine; you can
   reuse the level system for this.

You ship in 4–6 months. Result: a smaller game that's mostly
combat-feel.

### If you commit to D (atmospheric)

Bring an artist. Then re-plan.

---

## 6. The pivots you should NOT make

Putting this here so the next version of you doesn't burn a month on
them.

- **Multiplayer.** The gun destroys terrain. Two-player determinism on
  destructible polygon worlds is a research problem.
- **3D.** The aesthetic is 2D. Going 3D throws away every render
  decision.
- **Open world.** The mechanic rewards short, designed encounters. Open
  world dilutes every system.
- **Free-to-play / live service.** No game shaped like this should be
  on that economic model.
- **A second renderer / port adapter.** ADR-0011 already says no. Don't
  reopen.

---

## 7. Concrete next two weeks

If you don't pick a direction yet, this is what you should do anyway:

- **Day 1–2**: Audio pass — at least: footsteps (4 materials), bullet
  impact, destruction debris.
- **Day 3–4**: Player rig — even crude pixel art that matches the
  palette. Replace Spineboy or skin over it.
- **Day 5**: Death-and-retry rhythm polish (§3.4).
- **Day 6**: A single deep level designed to its mechanic — pick one
  material (say, `bone_fragile`) and build a five-screen arc that
  explores nothing else.
- **Day 7–8**: Playtest with two people. *Watch them play.* Don't
  explain. The notes from this session decide your direction better
  than this doc.
- **Day 9–10**: Implement two of the polish items in §4 based on what
  the playtest revealed.

After this, you'll have a much sharper read on which of A/B/C is
actually fun, and which the controls support.

---

## 8. Open questions to answer for yourself

These don't need answers in this doc, but they need answers before you
commit to a direction:

1. **Who is the player character?** Right now they're a small warm
   thing with a gun. Is that a metaphor, a literal body, an animal,
   a ghost?
3. **What is the world?** README implies it's "already losing its
   grip". Whose grip? Why are you here? Is there an exit?
4. **Why can you shoot?** A small warm body that fires arcing slugs is
   tonally specific but unexplained. Is the gun part of you? An
   external prosthetic? Found?
5. **Where does the game end?** Boss? Apex? Realisation? Loop?

You don't have to write a story to answer these. Even one-word answers
will direct everything from palette to enemy choice to level layout.

---

## 9. Read this when you're stuck

The thing nobody else has is a platformer where **your gun reshapes the
level, and every carve you make is terrain you have to live with**.
Every direction above is just a question of how much surrounding
scaffolding to build around that one sentence.

If a feature serves that sentence: build it.
If it doesn't: it belongs in a different game.
