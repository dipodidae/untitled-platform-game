# Level Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the showcase level into a 4-section Celeste-style traversal arc with teaching progression, and add the `bone_fragile` material.

**Architecture:** Add `bone_fragile` to the material system (type, physics, rendering, palette). Rewrite `showcase.json` with 22 colliders across 4 sections (Trust → Consequence → Control → Payoff). The new material uses a contact timer tracked in `resolve.ts` alongside the existing soft-damping pattern.

**Tech Stack:** TypeScript, PixiJS v8, polygon physics (SAT), Vite

---

### Task 1: Add `bone_fragile` to the material type and config

**Files:**
- Modify: `src/world/level.ts:46` (MaterialName type)
- Modify: `src/world/level.ts:48-63` (Collider interface)
- Modify: `src/world/level.ts:102-126` (buildCollider)
- Modify: `src/world/level.ts:143-155` (snapshot/PristineCollider)
- Modify: `src/world/level.ts:159-232` (tilemapToPolygons char map)
- Modify: `src/config.ts`

- [ ] **Step 1: Add `bone_fragile` to MaterialName**

In `src/world/level.ts`, change the MaterialName type:

```typescript
export type MaterialName = 'glass' | 'bone' | 'resonant' | 'soft' | 'shard' | 'bone_fragile'
```

- [ ] **Step 2: Add `contactTime` to Collider interface**

In `src/world/level.ts`, add `contactTime` field to the `Collider` interface after `damage`:

```typescript
damage: number // hit counter; consulted by bone (via BONE_HITS)
contactTime: number // seconds player has stood on this; consulted by bone_fragile
alive: boolean
```

- [ ] **Step 3: Initialize `contactTime` in `buildCollider`**

In the `buildCollider` function, add `contactTime: 0` to the collider literal:

```typescript
const c: Collider = {
  id,
  material,
  vertices,
  pieces,
  oneWay,
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
  damage: 0,
  contactTime: 0,
  alive: true,
  expiresAt,
}
```

- [ ] **Step 4: Reset `contactTime` in `resetLevel`**

In the `resetLevel` function, add `existing.contactTime = 0` alongside `existing.damage = 0`:

```typescript
existing.damage = 0
existing.contactTime = 0
existing.alive = true
```

- [ ] **Step 5: Add `bone_fragile` to tilemap char map**

In `tilemapToPolygons`, add to `charMat`:

```typescript
    'f': 'bone_fragile',
```

- [ ] **Step 6: Add config constant**

In `src/config.ts`, add after `BONE_HITS: 3`:

```typescript
  BONE_FRAGILE_COLLAPSE_TIME: 1.8, // seconds of cumulative contact before collapse
```

- [ ] **Step 7: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: errors in `palette.ts` and `render/world.ts` about missing `bone_fragile` key — that's expected, fixed in Task 2 and 3.

- [ ] **Step 8: Commit**

```bash
git add src/world/level.ts src/config.ts
git commit -m "feat: add bone_fragile material type and contactTime to Collider"
```

---

### Task 2: Add `bone_fragile` palette entry

**Files:**
- Modify: `src/render/palette.ts:53-89`

- [ ] **Step 1: Add bone_fragile material colors**

In `src/render/palette.ts`, add the `bone_fragile` entry to the `materials` record, after `bone`:

```typescript
    // Yellowed, aging bone. Reads as "this won't last."
    bone_fragile: {
      fill: 0xB8A878,
      edge: 0xD0C090,
      shadow: 0x2A1E10,
      highlight: 0xE0D8A0,
    },
```

- [ ] **Step 2: Verify typecheck passes for palette**

Run: `npx tsc --noEmit`
Expected: error only in `render/world.ts` (no draw function yet). Palette itself should be clean.

- [ ] **Step 3: Commit**

```bash
git add src/render/palette.ts
git commit -m "feat: add bone_fragile palette (yellowed bone)"
```

---

### Task 3: Add `bone_fragile` rendering

**Files:**
- Modify: `src/render/world.ts:163-173` (drawCollider switch)

- [ ] **Step 1: Add `drawBoneFragile` function**

In `src/render/world.ts`, add this function before `drawCollider`:

```typescript
function drawBoneFragile(g: Graphics, c: Collider): void {
  const m = activePalette().materials.bone_fragile
  const ratio = c.contactTime / CONFIG.BONE_FRAGILE_COLLAPSE_TIME

  // Shake increases with timer ratio
  const shakeAmp = ratio > 0.5 ? (ratio - 0.5) * 3 : 0
  const shakeX = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0
  const shakeY = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp * 0.5 : 0

  // Darken fill as timer progresses
  const fillAlpha = 1.0 - ratio * 0.3

  // Offset all drawing by shake
  const verts = c.vertices.map(v => ({ x: v.x + shakeX, y: v.y + shakeY }))

  pathPolygon(g, verts)
  g.fill({ color: m.fill, alpha: fillAlpha })

  // Per-edge lighting (same as bone)
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const p = verts[i]!
    const q = verts[(i + 1) % n]!
    const nrm = edgeNormal(p.x, p.y, q.x, q.y)
    if (!nrm)
      continue
    if (nrm.ny < CONFIG.EDGE_TOP_NORMAL_Y) {
      g.moveTo(p.x, p.y + 1).lineTo(q.x, q.y + 1)
      g.stroke({ width: 2, color: m.edge, alpha: 0.95 * fillAlpha })
    }
    else if (nrm.ny > CONFIG.EDGE_BOTTOM_NORMAL_Y) {
      g.moveTo(p.x, p.y - 1).lineTo(q.x, q.y - 1)
      g.stroke({ width: 1, color: m.shadow, alpha: 0.6 })
    }
  }
  pathPolygon(g, verts)
  g.stroke({ width: 1, color: m.shadow, alpha: 0.45 })

  // Crack scribbles scale with timer (like bone damage but driven by ratio)
  const cracks = Math.floor(ratio * 4)
  if (cracks > 0) {
    const w = c.maxX - c.minX
    const h = c.maxY - c.minY
    if (w >= 6 && h >= 6) {
      const cx = c.minX + w / 2 + shakeX
      const cy = c.minY + h / 2 + shakeY
      for (let i = 0; i < cracks; i++) {
        const ox = -3 + i * 2
        g.moveTo(cx + ox, cy - 4)
          .lineTo(cx + ox + 1, cy - 1)
          .lineTo(cx + ox - 2, cy + 2)
          .lineTo(cx + ox + 2, cy + 5)
        g.stroke({ width: 1, color: m.shadow, alpha: 0.7 + i * 0.05 })
      }
    }
  }
}
```

- [ ] **Step 2: Add bone_fragile to the switch statement**

In `drawCollider`, add the case before the closing brace:

```typescript
function drawCollider(g: Graphics, c: Collider): void {
  if (!c.alive)
    return
  switch (c.material) {
    case 'shard': drawShard(g, c); return
    case 'glass': drawGlass(g, c); return
    case 'bone': drawBone(g, c); return
    case 'bone_fragile': drawBoneFragile(g, c); return
    case 'resonant': drawResonant(g, c); return
    case 'soft': drawSoft(g, c)
  }
}
```

- [ ] **Step 3: Add CONFIG import if not present**

The file already imports `CONFIG` — verify `BONE_FRAGILE_COLLAPSE_TIME` is accessible (it will be, since it's on the CONFIG object).

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS — all MaterialName cases now handled in rendering.

- [ ] **Step 5: Commit**

```bash
git add src/render/world.ts
git commit -m "feat: add bone_fragile rendering (shake + cracks as timer fills)"
```

---

### Task 4: Add `bone_fragile` physics (contact timer + collapse)

**Files:**
- Modify: `src/physics/resolve.ts:238-260` (after soft damping, before setting p.grounded)

- [ ] **Step 1: Add bone_fragile contact logic**

In `src/physics/resolve.ts`, add this block after the soft-damping block (after `if (touchedSoft) { ... }`) and before `p.grounded = grounded`:

```typescript
// Bone-fragile collapse: increment contactTime for any bone_fragile
// collider the player is standing on this tick. Once the timer fills,
// the collider dies. Timer persists — leaving and returning continues
// the countdown.
if (grounded) {
  for (const c of physical) {
    if (!c.alive || c.material !== 'bone_fragile')
      continue
    if (postBox.x + postBox.w < c.minX - 1 || postBox.x > c.maxX + 1
      || postBox.y + postBox.h < c.minY - 1 || postBox.y > c.maxY + 1) {
      continue
    }
    // Check if grounded specifically on this collider (floor-facing normal)
    for (const piece of c.pieces) {
      const hit = satAabbPoly(postBox, piece)
      if (hit && hit.normal.y < GROUND_NORMAL_Y) {
        c.contactTime += dt
        if (c.contactTime >= CONFIG.BONE_FRAGILE_COLLAPSE_TIME)
          c.alive = false
        break
      }
    }
  }
}
```

- [ ] **Step 2: Ensure `satAabbPoly` and `CONFIG` are imported**

Check top of `src/physics/resolve.ts`. `satAabbPoly` is already imported on line 14. `CONFIG` is already imported on line 13. No changes needed.

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/physics/resolve.ts
git commit -m "feat: bone_fragile contact timer + collapse physics"
```

---

### Task 5: Handle `bone_fragile` in destruction (rupture treats it like bone)

**Files:**
- Modify: `src/world/destruction.ts` (if it special-cases material names)

- [ ] **Step 1: Check destruction code for material handling**

Read `src/world/destruction.ts` and find any material-specific logic. `bone_fragile` should behave like `bone` during rupture (takes damage, breaks after `BONE_HITS`).

- [ ] **Step 2: Add bone_fragile alongside bone in any material checks**

If there are checks like `c.material === 'bone'`, add `|| c.material === 'bone_fragile'`. The exact edits depend on the file content — the key principle is that rupture treats bone_fragile identically to bone.

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/world/destruction.ts
git commit -m "feat: bone_fragile treated as bone during rupture"
```

---

### Task 6: Rewrite `showcase.json` with 4-section level

**Files:**
- Modify: `src/levels/showcase.json` (complete rewrite)

- [ ] **Step 1: Replace showcase.json with the new level**

```json
{
  "spawn": { "x": 80, "y": 320 },
  "worldWidth": 2400,
  "worldHeight": 520,
  "colliders": [
    {
      "id": 1,
      "material": "bone",
      "vertices": [[0, 180], [15, 180], [15, 400], [0, 400]],
      "_note": "S1: left wall"
    },
    {
      "id": 2,
      "material": "bone",
      "vertices": [[0, 360], [580, 360], [580, 400], [0, 400]],
      "_note": "S1: main floor"
    },
    {
      "id": 3,
      "material": "bone",
      "vertices": [[260, 335], [330, 335], [330, 360], [260, 360]],
      "_note": "S1: practice step"
    },
    {
      "id": 4,
      "material": "glass",
      "vertices": [[400, 240], [470, 240], [470, 248], [400, 248]],
      "_note": "S1: glass tease (unreachable)"
    },
    {
      "id": 5,
      "material": "bone",
      "vertices": [[580, 360], [660, 360], [660, 400], [580, 400]],
      "_note": "S2: pre-gap ledge"
    },
    {
      "id": 6,
      "material": "glass",
      "vertices": [[690, 348], [880, 348], [880, 356], [690, 356]],
      "_note": "S2: glass bridge"
    },
    {
      "id": 7,
      "material": "bone",
      "vertices": [[670, 430], [910, 430], [910, 460], [670, 460]],
      "_note": "S2: recovery floor"
    },
    {
      "id": 8,
      "material": "bone",
      "vertices": [[870, 395], [930, 395], [930, 430], [870, 430]],
      "_note": "S2: climb-back step"
    },
    {
      "id": 9,
      "material": "bone",
      "vertices": [[910, 360], [1180, 360], [1180, 400], [910, 400]],
      "_note": "S2: post-gap floor"
    },
    {
      "id": 10,
      "material": "bone",
      "vertices": [[1180, 360], [1290, 360], [1290, 400], [1180, 400]],
      "_note": "S3: breathing space"
    },
    {
      "id": 11,
      "material": "soft",
      "vertices": [[1290, 365], [1540, 365], [1540, 430], [1290, 430]],
      "_note": "S3: soft valley"
    },
    {
      "id": 12,
      "material": "bone",
      "oneWay": true,
      "vertices": [[1340, 328], [1450, 328], [1450, 333], [1340, 333]],
      "_note": "S3: one-way platform above soft"
    },
    {
      "id": 13,
      "material": "bone_fragile",
      "vertices": [[1490, 322], [1580, 322], [1580, 332], [1490, 332]],
      "_note": "S3: crumble platform 1"
    },
    {
      "id": 14,
      "material": "bone_fragile",
      "vertices": [[1620, 308], [1710, 308], [1710, 318], [1620, 318]],
      "_note": "S3: crumble platform 2"
    },
    {
      "id": 15,
      "material": "bone",
      "vertices": [[1540, 365], [1840, 365], [1840, 400], [1540, 400]],
      "_note": "S3: floor under fragile route"
    },
    {
      "id": 16,
      "material": "bone",
      "vertices": [[1750, 338], [1840, 338], [1840, 365], [1750, 365]],
      "_note": "S3: safe landing ledge"
    },
    {
      "id": 17,
      "material": "bone",
      "vertices": [[1840, 365], [2050, 365], [2050, 400], [1840, 400]],
      "_note": "S4: approach floor"
    },
    {
      "id": 18,
      "material": "resonant",
      "vertices": [[2050, 365], [2110, 265], [2110, 365]],
      "_note": "S4: resonant ramp"
    },
    {
      "id": 19,
      "material": "resonant",
      "vertices": [[2110, 245], [2140, 365], [2110, 365]],
      "_note": "S4: resonant chain piece"
    },
    {
      "id": 20,
      "material": "bone",
      "vertices": [[2140, 365], [2400, 365], [2400, 400], [2140, 400]],
      "_note": "S4: catch floor"
    },
    {
      "id": 21,
      "material": "bone",
      "vertices": [[2060, 195], [2280, 195], [2280, 225], [2060, 225]],
      "_note": "S4: victory platform"
    },
    {
      "id": 22,
      "material": "bone",
      "vertices": [[2380, 195], [2400, 195], [2400, 400], [2380, 400]],
      "_note": "S4: right wall"
    }
  ]
}
```

- [ ] **Step 2: Verify the game loads**

Run the dev server (`npm run dev`), open in browser. The level should render with all 4 sections visible when scrolling right.

- [ ] **Step 3: Commit**

```bash
git add src/levels/showcase.json
git commit -m "feat: redesign showcase level — 4-section Celeste-style arc"
```

---

### Task 7: Take new screenshots and verify

**Files:**
- Modify: `screenshots.mjs` (update timings for wider level)

- [ ] **Step 1: Update screenshot script for the wider level**

The level is now 2400px wide. Update `screenshots.mjs` to capture each section:
- Screenshot 1: spawn area (Section 1)
- Screenshot 2: glass bridge area (Section 2) — run right for ~3s
- Screenshot 3: resonant area (Section 4) — run right for ~8s total

- [ ] **Step 2: Run screenshots**

Run: `node screenshots.mjs`
Expected: 3 screenshots in `screenshots/` directory

- [ ] **Step 3: Visual review**

Open each screenshot and verify:
- Section transitions are visually clear
- bone_fragile platforms are distinguishable from bone
- Glass tease is visible in Section 1
- Resonant geometry reads clearly in Section 4

- [ ] **Step 4: Commit**

```bash
git add screenshots.mjs
git commit -m "chore: update screenshot script for wider level"
```

---

### Task 8: Final typecheck and lint

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: lint fixes for level redesign"
```
