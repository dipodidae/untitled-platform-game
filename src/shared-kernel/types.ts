// Editor↔game contract types — the single source of truth for types that
// cross the boundary between the level editor and the game runtime.
//
// Nothing in this file should import from game-side modules. Per-kinetic-type
// JSON shapes are imported from their own files (which only depend on
// shared-kernel itself) to compose the KineticJson union.

import type { BreatherJson } from '../world/kinetic/breather'
import type { LinearJson } from '../world/kinetic/linear'
import type { RotorJson } from '../world/kinetic/rotor'
import type { SpringJson } from '../world/kinetic/spring'

// ─── zone types ──────────────────────────────────────────────────────────
//
// Zone types:
//   gravity    — multiplies player gravity + air control inside the volume
//   wind       — per-axis nudge + optional turbulence jitter
//   hazard     — damage-per-tick; 0 = instant kill
//   trigger    — opaque id forwarded to subscribers (dispatch is TBD)
//   goal       — player overlap emits levelComplete on the EventBus
//   spawnPoint — player overlap updates GameState.lastSpawnPoint (checkpoint)
export type ZoneType = 'gravity' | 'wind' | 'hazard' | 'trigger' | 'goal' | 'spawnPoint'

export interface ZoneJson {
  id: number
  type: ZoneType
  x: number
  y: number
  w: number
  h: number
  // gravity: gravityScale multiplies base gravity, airControlScale scales input.
  gravityScale?: number
  airControlScale?: number
  // wind: per-axis velocity nudge + turbulence jitter.
  windVx?: number
  windVy?: number
  windTurbulence?: number
  // hazard: 0 = instant kill on overlap, >0 = damage per physics tick.
  hazardDamage?: number
  // trigger: opaque id forwarded to a subscriber — runtime dispatch is TBD.
  triggerId?: string
}

// ─── materials ───────────────────────────────────────────────────────────
// Four authored materials, each producing its own kind of story:
//
//   glass        — breaks on a single rupture. Leaves SHARDS behind that kill
//                  on contact. Overzealous destruction becomes its own trap.
//   bone         — old, structural. Damage accumulates across ruptures
//                  (BONE_HITS before it fully collapses). The thing you
//                  primed earlier and forgot about.
//   bone_fragile — aging bone. Collapses after BONE_FRAGILE_COLLAPSE_TIME
//                  seconds of cumulative player contact. Timer persists
//                  across touches — once primed, it's counting down.
//   resonant     — indestructible. Rupture impulse compounds when you touch
//                  a chain of it — launches you farther than you meant.
//   soft         — solid but yielding. Dampens motion on contact; ruptures
//                  carve it at a reduced radius. Safe, but costly: you
//                  cannot keep your momentum here.
//
// `shard` is a runtime-only material spawned from broken glass. Never
// authored in a level file.
export type MaterialName = 'glass' | 'bone' | 'bone_fragile' | 'resonant' | 'soft' | 'shard'

// ─── kinetic JSON ────────────────────────────────────────────────────────
// Union of all per-kinetic-type JSON shapes. The per-type details stay in
// their own files; this composes the union for editor and level-loader use.
export type KineticJson = RotorJson | BreatherJson | SpringJson | LinearJson

// ─── item kinds ──────────────────────────────────────────────────────────
// String keys that levels use to refer to a pickup definition. Add the
// literal here and the matching file name (no hyphen/case) when you add
// a new item.
export type ItemKind = 'bigShot'

// ─── level JSON ──────────────────────────────────────────────────────────
export interface LevelJson {
  spawn: { x: number, y: number }
  worldWidth: number
  worldHeight: number
  colliders: {
    id: number
    material: MaterialName
    vertices: [number, number][]
    oneWay?: boolean
    kinetic?: KineticJson
    // Conveyor-like surface: grounded player gets nudged by vx px/s.
    surfaceMotion?: { vx: number }
    // Launch pad: on contact, overwrites player vy with force along angle.
    launchPad?: { force: number, angle?: number }
  }[]
  prowlers?: { x: number, y: number }[]
  dummies?: { x: number, y: number, hp?: number }[]
  pickups?: { x: number, y: number, kind: ItemKind }[]
  zones?: ZoneJson[]
  // ─── special enemies ───────────────────────────────────────────────
  // Each array is an optional list of spawn points for the matching kind.
  // Schema stays flat (x/y) except where a kind carries extra params —
  // husk crows track an optional link partner, pilgrims list toggles.
  mirrors?: { x: number, y: number }[]
  hushes?: { x: number, y: number }[]
  candlewicks?: { x: number, y: number }[]
  knights?: { x: number, y: number }[]
  blooms?: { x: number, y: number }[]
  echoes?: { x: number, y: number }[]
  crows?: { x: number, y: number, linkIdx?: number }[]
  carts?: { x: number, y: number }[]
  shrines?: { x: number, y: number }[]
  pilgrims?: { x: number, y: number, toggles?: number[] }[]
  // ─── classic-inspired enemies ──────────────────────────────────────
  medusas?: { x: number, y: number }[]
  beetles?: { x: number, y: number }[]
  boos?: { x: number, y: number }[]
  wallmasters?: { x: number, y: number }[]
  stalkers?: { x: number, y: number }[]
  wizards?: { x: number, y: number }[]
  garpedes?: { x0: number, y: number, x1: number, period?: number }[]
  ironKnuckles?: { x: number, y: number, facing?: 1 | -1 }[]
  cagneys?: { x: number, y: number }[]
  dryBones?: { x: number, y: number }[]
  planteras?: { x: number, y: number }[]
  hammerBros?: { x: number, y: number, period?: number }[]
  mantisLords?: { x: number, y: number }[]
}
