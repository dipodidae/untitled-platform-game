# Level Structure System — Celeste Pacing

## Philosophy

Each level teaches **one core mechanic**, then remixes it, then resolves it.
Four-zone structure per level:

```
Introduction → Practice → Challenge → Payoff
  (safe)       (isolated)  (pressure)   (reward)
```

Players slow down before learning moments, accelerate after mastery.
Every failure is instantly readable. No multi-mechanic introductions.
Each level ends with a **reward space** that contrasts preceding tension.

---

## Level 1: "Ground Truth"

**Core mechanic**: Glass (instability → rupture → breaks → shards)
**Secondary**: Bone (safe structural ground — the constant)
**World**: 1800 × 480 px

### Zone A — Introduction (x 0–500)
Wide bone floor, left wall. Small practice step (bone ledge).
No hazards, no glass. Pure movement trust-building.
Player learns: run, jump, land. The world is solid.

### Zone B — Curiosity (x 500–850)
Bone floor continues. A glass shelf floats high above — visible but
unreachable. Plants the question: "what is that?"
A small bone ledge provides another hop. Still safe.

### Zone C — First Contact (x 850–1250)
Gap in the bone floor. A glass bridge spans the gap.
Recovery bone floor sits below — falling is not death.
Player learns: glass breaks when instability ruptures near it.
Glass shards kill. But the stakes are low — recovery is trivial.

### Zone D — Execution (x 1250–1800)
Wider glass bridge. No shortcuts — must cross it.
Either manage instability (don't rupture mid-bridge) or accept the
fall to recovery bone below and climb back up.
**Reward**: Elevated open bone platform at the far end. Right wall
closes the level. Safe, spacious, done.

**Mastery beat**: "I understand that my instability shapes the world."

---

## Level 2: "Routing"

**Core pairing**: Resonant momentum inheritance + Glass priming
**Callback**: Glass (from L1, now teaches conditional solidity)
**World**: 2400 × 480 px

### Zone A — Recall (x 0–620)
Bone floor + short glass bridge. Player already knows glass.
This is a 5-second confidence reminder, not a lesson.

### Zone B — Resonant Intro (x 620–1020)
First resonant platform. Safe bone recovery below.
Bone ledge sits high to the right — reachable only with the
resonant jump boost. Player learns: "this material launches me."
No pressure, just discovery.

### Zone C — Glass Priming (x 1020–1420)
Glass bridge over a gap. Land on it from above — it works.
Once touched, glass dims: it's now one-way (passable from below).
Bone recovery floor below. Climb-back step available.
Player learns: "glass I've touched lets me pass through it."
Route commitment — you can't come back the same way.

### Zone D — Combination (x 1420–1920)
Resonant platform with glass ceiling above it. Must use resonant
boost to reach the glass from below (passing through primed glass).
Bone ledge on the far side above. Glass bridge primes behind you.
Creates a "flow line": boost → pass through → land on high route.
Bone recovery + safety net below throughout.

### Zone E — Payoff (x 1920–2400)
Two consecutive resonant surfaces (chain bonus). Glass ceiling
above the second. Must chain the resonant boost to clear the
glass, which primes as you pass through it.
**Reward**: Elevated bone platform, right wall. Open, safe, done.

**Mastery beat**: "I understand how momentum creates routing lines.
Materials shape my path, not just my survival."

---

## Cross-Level Rules

| Rule | Implementation |
|------|---------------|
| One new mechanic per level | L1: glass (instability → consequence). L2: resonant boost + glass priming (momentum → routing). |
| Failure is readable | Falls always land on bone. Shards are bright red. Primed glass dims visibly. |
| Spatial pacing | Wide flat bone before each new element. Narrow/elevated at climax. |
| Reward contrast | Open elevated bone after tight sequences. |
| Forward momentum | Right wall closes level. Reaching it triggers next level load. |

## Level Progression

- Game tracks `levelIndex` (0-based)
- Level list: `[level1.json, level2.json]`
- Transition trigger: player touches right wall boundary
- On transition: load next level, reset player to new spawn, reset camera
- After last level: wrap to level 1 (or hold — TBD)
