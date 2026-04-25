// Ten "special" enemies that change how the player has to *think*, not just
// dodge. Grouped into one file with a shared SpecialsState bundle so the
// game-loop, bullet, and render sites only learn one handle apiece.
//
// Each kind has its own interface + create + its own slice of updateSpecials.
// Rendering is handled by drawSpecials (single Graphics, crude rect style).
//
// Damage vs. the player: enemies call takeHit(player, level, sx, sy, dmg) on
// contact hits; hazard iframes handle debouncing. Bullet damage is routed
// via checkBulletHitSpecials — returns whether a bullet was absorbed so the
// caller can despawn it.

import type { BulletKindName } from '../combat/bullet'
import type { BroadphaseGrid } from '../physics/broadphase'
import type { Player } from '../player/player'
import type { Level } from '../world/level'
import { takeHit } from '../player/player'
import { emit } from '../session/eventBus'

// ─── shared small helpers ────────────────────────────────────────────
function overlapsAabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function circleHitsAabb(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number): boolean {
  const nx = Math.max(x, Math.min(cx, x + w))
  const ny = Math.max(y, Math.min(cy, y + h))
  const dx = cx - nx
  const dy = cy - ny
  return dx * dx + dy * dy <= r * r
}

// ─── 1) The Mirror ───────────────────────────────────────────────────
// Records the last ~3 s of player position; at the end of that window the
// Mirror walks where the player walked. Overlap = contact damage.
const MIRROR_BUFFER_LEN = 180 // 3 s at 60 Hz
const MIRROR_W = 14
const MIRROR_H = 14
const MIRROR_HP = 4
const MIRROR_DAMAGE = 1
const MIRROR_LEASH = 320 // only records/follows when player is within this

export interface Mirror {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  spawnY: number
  // Ring buffer of [x, y] positions sampled each fixed tick.
  buf: Float32Array
  bufWrite: number
  bufFilled: boolean
  // Set true while the mirror is actively mirroring (player in leash).
  active: boolean
  facing: 1 | -1
}

export function createMirror(x: number, y: number): Mirror {
  return {
    x,
    y,
    w: MIRROR_W,
    h: MIRROR_H,
    hp: MIRROR_HP,
    maxHp: MIRROR_HP,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    buf: new Float32Array(MIRROR_BUFFER_LEN * 2),
    bufWrite: 0,
    bufFilled: false,
    active: false,
    facing: -1,
  }
}

function updateMirror(m: Mirror, player: Player, level: Level, dt: number, speedMult: number): void {
  if (!m.alive)
    return
  if (m.hitFlashTimer > 0)
    m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt)

  const dx = Math.abs(player.x - m.spawnX)
  m.active = dx < MIRROR_LEASH && player.alive

  // Record player every tick (even when inactive, so the delay buffer is full).
  const w = m.bufWrite * 2
  m.buf[w] = player.x
  m.buf[w + 1] = player.y
  m.bufWrite = (m.bufWrite + 1) % MIRROR_BUFFER_LEN
  if (m.bufWrite === 0)
    m.bufFilled = true

  if (!m.bufFilled)
    return

  // Read the oldest sample — that's "3 seconds ago" when buffer is full.
  const rIdx = m.bufWrite // oldest = write head (next slot to overwrite)
  const tx = m.buf[rIdx * 2]!
  const ty = m.buf[rIdx * 2 + 1]!

  // Move toward the recorded position, capped by speed so it reads as motion.
  const mx = m.x + m.w / 2
  const my = m.y + m.h / 2
  const txc = tx + player.w / 2
  const tyc = ty + player.h / 2
  const dx2 = txc - mx
  const dy2 = tyc - my
  const dist = Math.hypot(dx2, dy2)
  const maxStep = 140 * speedMult * dt
  if (dist > 0.001) {
    const step = Math.min(dist, maxStep)
    m.x += (dx2 / dist) * step
    m.y += (dy2 / dist) * step
    if (Math.abs(dx2) > 0.5)
      m.facing = dx2 > 0 ? 1 : -1
  }

  // Contact — damages player.
  if (overlapsAabb(m.x, m.y, m.w, m.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, m.x + m.w / 2, m.y + m.h / 2, MIRROR_DAMAGE)
  }
}

// ─── 2) Hush ─────────────────────────────────────────────────────────
// Jellyfish-like floater. Radius of silence around it suppresses UI
// preview (crosshair + trajectory), forcing the player to aim blind.
const HUSH_W = 16
const HUSH_H = 16
const HUSH_HP = 3
const HUSH_RADIUS = 120

export interface Hush {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  spawnY: number
  bobPhase: number
  readonly radius: number
}

export function createHush(x: number, y: number): Hush {
  return {
    x,
    y,
    w: HUSH_W,
    h: HUSH_H,
    hp: HUSH_HP,
    maxHp: HUSH_HP,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    bobPhase: Math.random() * Math.PI * 2,
    radius: HUSH_RADIUS,
  }
}

function updateHush(h: Hush, dt: number): void {
  if (!h.alive)
    return
  if (h.hitFlashTimer > 0)
    h.hitFlashTimer = Math.max(0, h.hitFlashTimer - dt)
  h.bobPhase += dt * 1.4
  h.y = h.spawnY + Math.sin(h.bobPhase) * 6
  h.x = h.spawnX + Math.cos(h.bobPhase * 0.6) * 4
}

// True if any live Hush has the player within its radius — used by the
// renderer to suppress the crosshair/trajectory preview.
export function hushIsSilencingPlayer(state: SpecialsState, player: Player): boolean {
  const pcx = player.x + player.w / 2
  const pcy = player.y + player.h / 2
  for (const h of state.hushes) {
    if (!h.alive)
      continue
    const hcx = h.x + h.w / 2
    const hcy = h.y + h.h / 2
    const dx = pcx - hcx
    const dy = pcy - hcy
    if (dx * dx + dy * dy <= h.radius * h.radius)
      return true
  }
  return false
}

// ─── 3) Candlewick ───────────────────────────────────────────────────
// Slow walker that cannot hurt you. Killing it plunges the room into
// darkness for a few seconds — while dark, Mirrors chase 1.5× faster and
// PendulumKnights swing on a shorter windup.
const CANDLE_W = 12
const CANDLE_H = 12
const CANDLE_HP = 1
const CANDLE_SPEED = 22
const CANDLE_DARK_TIME = 6

export interface Candlewick {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  spawnY: number
  facing: 1 | -1
  patrolHalfWidth: number
}

export function createCandlewick(x: number, y: number): Candlewick {
  return {
    x,
    y,
    w: CANDLE_W,
    h: CANDLE_H,
    hp: CANDLE_HP,
    maxHp: CANDLE_HP,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    facing: 1,
    patrolHalfWidth: 40,
  }
}

function updateCandlewick(c: Candlewick, dt: number): void {
  if (!c.alive)
    return
  if (c.hitFlashTimer > 0)
    c.hitFlashTimer = Math.max(0, c.hitFlashTimer - dt)
  c.x += c.facing * CANDLE_SPEED * dt
  if (c.x < c.spawnX - c.patrolHalfWidth) {
    c.x = c.spawnX - c.patrolHalfWidth
    c.facing = 1
  }
  else if (c.x > c.spawnX + c.patrolHalfWidth) {
    c.x = c.spawnX + c.patrolHalfWidth
    c.facing = -1
  }
}

// ─── 4) The Pendulum Knight ──────────────────────────────────────────
// Stationary. Periodic wide arc sweep. During the active window every
// point within SWEEP_RANGE horizontally and VERTICAL_REACH vertically of
// the knight kills — *except* the small safe radius hugging his body.
const KNIGHT_W = 24
const KNIGHT_H = 24
const KNIGHT_HP = 999 // effectively invulnerable via normal hits
const KNIGHT_CYCLE = 5.0 // seconds between swings
const KNIGHT_WINDUP = 1.2 // telegraph duration
const KNIGHT_ACTIVE = 0.35 // lethal window
const KNIGHT_SWEEP_RANGE = 140
const KNIGHT_VERTICAL_REACH = 56
const KNIGHT_SAFE_RADIUS = 24
const KNIGHT_DAMAGE = 3

export interface PendulumKnight {
  x: number
  y: number
  w: number
  h: number
  alive: boolean
  hp: number
  maxHp: number
  hitFlashTimer: number
  // Phase: 0..KNIGHT_CYCLE. [0, windup) = winding up, [windup, windup+active) = swinging.
  phase: number
  facing: 1 | -1
}

export function createPendulumKnight(x: number, y: number): PendulumKnight {
  return {
    x,
    y,
    w: KNIGHT_W,
    h: KNIGHT_H,
    alive: true,
    hp: KNIGHT_HP,
    maxHp: KNIGHT_HP,
    hitFlashTimer: 0,
    phase: 0,
    facing: 1,
  }
}

function knightInSwing(k: PendulumKnight, windupMult: number): boolean {
  const w = KNIGHT_WINDUP * windupMult
  return k.phase >= w && k.phase < w + KNIGHT_ACTIVE
}

function updatePendulumKnight(k: PendulumKnight, player: Player, level: Level, dt: number, windupMult: number): void {
  if (!k.alive)
    return
  if (k.hitFlashTimer > 0)
    k.hitFlashTimer = Math.max(0, k.hitFlashTimer - dt)

  const cx = k.x + k.w / 2
  if (player.alive) {
    k.facing = player.x + player.w / 2 >= cx ? 1 : -1
  }

  k.phase += dt
  if (k.phase >= KNIGHT_CYCLE)
    k.phase = 0

  // Lethal during the active window.
  if (knightInSwing(k, windupMult) && player.alive) {
    const pcx = player.x + player.w / 2
    const pcy = player.y + player.h / 2
    const kcx = cx
    const kcy = k.y + k.h / 2
    const dx = pcx - kcx
    const dy = pcy - kcy
    const dist = Math.hypot(dx, dy)
    const inSweep = Math.abs(dx) < KNIGHT_SWEEP_RANGE && Math.abs(dy) < KNIGHT_VERTICAL_REACH
    const safe = dist < KNIGHT_SAFE_RADIUS
    if (inSweep && !safe) {
      takeHit(player, level, kcx, kcy, KNIGHT_DAMAGE)
    }
  }
}

// ─── 5) Bloomrot ─────────────────────────────────────────────────────
// Stationary fungal mass. Takes damage, bursts a damaging spore ring on
// each hit. While alive, slowly regenerates nearby live enemies (dummies
// + other specials) — ignoring it lets the room heal back.
const BLOOM_W = 20
const BLOOM_H = 20
const BLOOM_HP = 6
const BLOOM_SPORE_RADIUS = 46
const BLOOM_SPORE_DAMAGE = 2
const BLOOM_REGEN_RANGE = 200
const BLOOM_REGEN_PER_SEC = 0.4 // hp/sec (fractional accumulator)
const BLOOM_BURST_DURATION = 0.5

export interface Bloomrot {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  // Active seconds remaining on the current spore-ring burst.
  burstTimer: number
  // Pulse phase for the idle breathing effect.
  pulse: number
  regenAccum: number
}

export function createBloomrot(x: number, y: number): Bloomrot {
  return {
    x,
    y,
    w: BLOOM_W,
    h: BLOOM_H,
    hp: BLOOM_HP,
    maxHp: BLOOM_HP,
    alive: true,
    hitFlashTimer: 0,
    burstTimer: 0,
    pulse: 0,
    regenAccum: 0,
  }
}

function updateBloomrot(b: Bloomrot, player: Player, level: Level, dt: number): void {
  if (!b.alive)
    return
  if (b.hitFlashTimer > 0)
    b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt)
  b.pulse += dt * 2.2
  if (b.burstTimer > 0) {
    b.burstTimer = Math.max(0, b.burstTimer - dt)
    // Spore ring kills player if touched during burst.
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const frac = 1 - b.burstTimer / BLOOM_BURST_DURATION
    const radius = BLOOM_SPORE_RADIUS * (0.4 + frac * 0.6)
    if (player.alive && circleHitsAabb(cx, cy, radius, player.x, player.y, player.w, player.h)) {
      takeHit(player, level, cx, cy, BLOOM_SPORE_DAMAGE)
    }
  }
}

// Regenerate a target HP-bearing enemy by dt * BLOOM_REGEN_PER_SEC if within
// range of any living Bloomrot. Caller passes the enemy's aabb + hp mutator.
function regenInRange(state: SpecialsState, cx: number, cy: number, dt: number, heal: (amt: number) => void): void {
  for (const b of state.blooms) {
    if (!b.alive)
      continue
    const bcx = b.x + b.w / 2
    const bcy = b.y + b.h / 2
    const dx = cx - bcx
    const dy = cy - bcy
    if (dx * dx + dy * dy <= BLOOM_REGEN_RANGE * BLOOM_REGEN_RANGE) {
      heal(BLOOM_REGEN_PER_SEC * dt)
      return
    }
  }
}

// ─── 6) The Echo ─────────────────────────────────────────────────────
// Immune by default. Taking damage requires landing the same weapon kind
// twice in a row within ECHO_MEMORY_WINDOW seconds. After taking damage
// the memory clears, so the next hit again needs to be paired.
const ECHO_W = 16
const ECHO_H = 16
const ECHO_HP = 3
const ECHO_MEMORY_WINDOW = 2.5

export interface Echo {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  spawnY: number
  hoverPhase: number
  lastWeapon: BulletKindName | null
  lastWeaponAt: number
  // Brief flash when an "adapt" (mismatched) hit is registered — visual
  // cue that the Echo rejected the shot.
  adaptFlashTimer: number
}

export function createEcho(x: number, y: number): Echo {
  return {
    x,
    y,
    w: ECHO_W,
    h: ECHO_H,
    hp: ECHO_HP,
    maxHp: ECHO_HP,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    hoverPhase: Math.random() * Math.PI * 2,
    lastWeapon: null,
    lastWeaponAt: -999,
    adaptFlashTimer: 0,
  }
}

function updateEcho(e: Echo, dt: number): void {
  if (!e.alive)
    return
  if (e.hitFlashTimer > 0)
    e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt)
  if (e.adaptFlashTimer > 0)
    e.adaptFlashTimer = Math.max(0, e.adaptFlashTimer - dt)
  e.hoverPhase += dt * 1.8
  e.y = e.spawnY + Math.sin(e.hoverPhase) * 10
  e.x = e.spawnX + Math.sin(e.hoverPhase * 0.7) * 6
}

// ─── 7) Husk Crows ───────────────────────────────────────────────────
// Perched birds. A crow can have a `link` index into the crows array —
// when both endpoints are alive, the segment between them damages on
// contact. Shoot any crow to drop its chains.
const CROW_W = 8
const CROW_H = 8
const CROW_HP = 1
const CROW_DAMAGE = 1
const CROW_CHAIN_THICK = 4

export interface HuskCrow {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  // Index of the crow this one links to. -1 = no link.
  linkIdx: number
  bobPhase: number
}

export function createHuskCrow(x: number, y: number, linkIdx: number): HuskCrow {
  return {
    x,
    y,
    w: CROW_W,
    h: CROW_H,
    hp: CROW_HP,
    maxHp: CROW_HP,
    alive: true,
    hitFlashTimer: 0,
    linkIdx,
    bobPhase: Math.random() * Math.PI * 2,
  }
}

function segmentHitsAabb(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  // Coarse: chain = AABB bounding the segment inflated by thickness.
  const minX = Math.min(ax, bx) - CROW_CHAIN_THICK
  const maxX = Math.max(ax, bx) + CROW_CHAIN_THICK
  const minY = Math.min(ay, by) - CROW_CHAIN_THICK
  const maxY = Math.max(ay, by) + CROW_CHAIN_THICK
  if (rx + rw < minX || rx > maxX || ry + rh < minY || ry > maxY)
    return false
  // Fine: distance from segment to AABB center below thickness.
  const cx = rx + rw / 2
  const cy = ry + rh / 2
  const vx = bx - ax
  const vy = by - ay
  const wx = cx - ax
  const wy = cy - ay
  const len2 = vx * vx + vy * vy
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0
  const px = ax + vx * t
  const py = ay + vy * t
  const dx = cx - px
  const dy = cy - py
  const diag = Math.max(rw, rh) / 2
  return dx * dx + dy * dy <= (CROW_CHAIN_THICK + diag) * (CROW_CHAIN_THICK + diag)
}

function updateHuskCrows(crows: HuskCrow[], player: Player, level: Level, dt: number): void {
  for (const c of crows) {
    if (!c.alive)
      continue
    if (c.hitFlashTimer > 0)
      c.hitFlashTimer = Math.max(0, c.hitFlashTimer - dt)
    c.bobPhase += dt * 2
  }
  if (!player.alive)
    return
  // Chain damage check.
  for (const c of crows) {
    if (!c.alive || c.linkIdx < 0 || c.linkIdx >= crows.length)
      continue
    const other = crows[c.linkIdx]!
    if (!other.alive)
      continue
    const ax = c.x + c.w / 2
    const ay = c.y + c.h / 2
    const bx = other.x + other.w / 2
    const by = other.y + other.h / 2
    if (segmentHitsAabb(ax, ay, bx, by, player.x, player.y, player.w, player.h)) {
      takeHit(player, level, (ax + bx) / 2, (ay + by) / 2, CROW_DAMAGE)
      break
    }
  }
}

// ─── 8) The Cartographer ─────────────────────────────────────────────
// Robed walker. Harmless; takes damage readily. In this project there's
// no runtime map to erase, so it's a spatial/theme element — a walker the
// player can ignore, chase, or kill.
const CART_W = 16
const CART_H = 16
const CART_HP = 3
const CART_SPEED = 14

export interface Cartographer {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  spawnY: number
  facing: 1 | -1
  patrolHalfWidth: number
}

export function createCartographer(x: number, y: number): Cartographer {
  return {
    x,
    y,
    w: CART_W,
    h: CART_H,
    hp: CART_HP,
    maxHp: CART_HP,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    facing: -1,
    patrolHalfWidth: 80,
  }
}

function updateCartographer(c: Cartographer, dt: number): void {
  if (!c.alive)
    return
  if (c.hitFlashTimer > 0)
    c.hitFlashTimer = Math.max(0, c.hitFlashTimer - dt)
  c.x += c.facing * CART_SPEED * dt
  if (c.x < c.spawnX - c.patrolHalfWidth) {
    c.x = c.spawnX - c.patrolHalfWidth
    c.facing = 1
  }
  else if (c.x > c.spawnX + c.patrolHalfWidth) {
    c.x = c.spawnX + c.patrolHalfWidth
    c.facing = -1
  }
}

// ─── 9) Mimic Shrine ─────────────────────────────────────────────────
// Looks like a spawnPoint zone. Overlap kills the player. Visual tell:
// its flame pulses on an irregular beat and its color runs cold-red
// instead of the friendly checkpoint warm.
const MIMIC_W = 22
const MIMIC_H = 22
const MIMIC_HP = 2
const MIMIC_DAMAGE = 3

export interface MimicShrine {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  // Tell phase — irregular "wrong" flicker that contrasts with real shrines.
  flickerPhase: number
}

export function createMimicShrine(x: number, y: number): MimicShrine {
  return {
    x,
    y,
    w: MIMIC_W,
    h: MIMIC_H,
    hp: MIMIC_HP,
    maxHp: MIMIC_HP,
    alive: true,
    hitFlashTimer: 0,
    flickerPhase: Math.random() * Math.PI * 2,
  }
}

function updateMimicShrine(m: MimicShrine, player: Player, level: Level, dt: number): void {
  if (!m.alive)
    return
  if (m.hitFlashTimer > 0)
    m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt)
  m.flickerPhase += dt * (3 + Math.sin(m.flickerPhase * 5) * 2)
  if (!player.alive)
    return
  if (overlapsAabb(m.x, m.y, m.w, m.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, m.x + m.w / 2, m.y + m.h / 2, MIMIC_DAMAGE)
  }
}

// ─── 10) The Pilgrim ─────────────────────────────────────────────────
// Walks. Never attacks. Each time the player crosses the pilgrim's x
// (from either side), a configured set of colliders toggle `alive` —
// platforms appear/disappear. Cumulative: cross twice and you're back
// where you started.
const PILGRIM_W = 18
const PILGRIM_H = 18
const PILGRIM_HP = 4
const PILGRIM_SPEED = 18

export interface Pilgrim {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  spawnY: number
  facing: 1 | -1
  patrolHalfWidth: number
  // IDs of authored colliders the pilgrim toggles on each crossing.
  toggleColliderIds: readonly number[]
  // Player side relative to pilgrim last tick (1 = right, -1 = left, 0 = init).
  lastPlayerSide: -1 | 0 | 1
}

export function createPilgrim(x: number, y: number, toggleIds: readonly number[]): Pilgrim {
  return {
    x,
    y,
    w: PILGRIM_W,
    h: PILGRIM_H,
    hp: PILGRIM_HP,
    maxHp: PILGRIM_HP,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    facing: 1,
    patrolHalfWidth: 60,
    toggleColliderIds: toggleIds,
    lastPlayerSide: 0,
  }
}

function updatePilgrim(p: Pilgrim, player: Player, level: Level, dt: number): void {
  if (!p.alive)
    return
  if (p.hitFlashTimer > 0)
    p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt)
  p.x += p.facing * PILGRIM_SPEED * dt
  if (p.x < p.spawnX - p.patrolHalfWidth) {
    p.x = p.spawnX - p.patrolHalfWidth
    p.facing = 1
  }
  else if (p.x > p.spawnX + p.patrolHalfWidth) {
    p.x = p.spawnX + p.patrolHalfWidth
    p.facing = -1
  }

  const pcx = player.x + player.w / 2
  const pivot = p.x + p.w / 2
  const side: -1 | 1 = pcx >= pivot ? 1 : -1
  if (p.lastPlayerSide !== 0 && side !== p.lastPlayerSide) {
    // Crossing detected — toggle the associated colliders.
    for (const id of p.toggleColliderIds) {
      for (const c of level.colliders) {
        if (c.id === id) {
          c.alive = !c.alive
          break
        }
      }
    }
  }
  p.lastPlayerSide = side
}

// ─── specials state bundle ───────────────────────────────────────────
export interface SpecialsState {
  mirrors: Mirror[]
  hushes: Hush[]
  candlewicks: Candlewick[]
  knights: PendulumKnight[]
  blooms: Bloomrot[]
  echoes: Echo[]
  crows: HuskCrow[]
  carts: Cartographer[]
  shrines: MimicShrine[]
  pilgrims: Pilgrim[]
  // Cross-cutting. Lantern-out timer (seconds remaining).
  darkTimer: number
  // Linger for adapt/echo flash if needed (currently per-echo).
}

export interface SpecialsSpawns {
  mirrors?: readonly { x: number, y: number }[]
  hushes?: readonly { x: number, y: number }[]
  candlewicks?: readonly { x: number, y: number }[]
  knights?: readonly { x: number, y: number }[]
  blooms?: readonly { x: number, y: number }[]
  echoes?: readonly { x: number, y: number }[]
  crows?: readonly { x: number, y: number, linkIdx?: number }[]
  carts?: readonly { x: number, y: number }[]
  shrines?: readonly { x: number, y: number }[]
  pilgrims?: readonly { x: number, y: number, toggles?: readonly number[] }[]
}

export function createSpecialsFromSpawns(s: SpecialsSpawns): SpecialsState {
  return {
    mirrors: (s.mirrors ?? []).map(p => createMirror(p.x, p.y)),
    hushes: (s.hushes ?? []).map(p => createHush(p.x, p.y)),
    candlewicks: (s.candlewicks ?? []).map(p => createCandlewick(p.x, p.y)),
    knights: (s.knights ?? []).map(p => createPendulumKnight(p.x, p.y)),
    blooms: (s.blooms ?? []).map(p => createBloomrot(p.x, p.y)),
    echoes: (s.echoes ?? []).map(p => createEcho(p.x, p.y)),
    crows: (s.crows ?? []).map(p => createHuskCrow(p.x, p.y, p.linkIdx ?? -1)),
    carts: (s.carts ?? []).map(p => createCartographer(p.x, p.y)),
    shrines: (s.shrines ?? []).map(p => createMimicShrine(p.x, p.y)),
    pilgrims: (s.pilgrims ?? []).map(p => createPilgrim(p.x, p.y, p.toggles ?? [])),
    darkTimer: 0,
  }
}

// ─── single update entrypoint ────────────────────────────────────────
export function updateSpecials(
  state: SpecialsState,
  player: Player,
  level: Level,
  _broadphase: BroadphaseGrid,
  dt: number,
  _now: number,
): void {
  // Decay dark timer. Mirror + Knight multipliers scale off this.
  if (state.darkTimer > 0)
    state.darkTimer = Math.max(0, state.darkTimer - dt)
  const dark = state.darkTimer > 0
  const mirrorSpeedMult = dark ? 1.5 : 1
  const knightWindupMult = dark ? 0.55 : 1

  for (const m of state.mirrors) updateMirror(m, player, level, dt, mirrorSpeedMult)
  for (const h of state.hushes) updateHush(h, dt)
  for (const c of state.candlewicks) updateCandlewick(c, dt)
  for (const k of state.knights) updatePendulumKnight(k, player, level, dt, knightWindupMult)
  for (const b of state.blooms) updateBloomrot(b, player, level, dt)
  for (const e of state.echoes) updateEcho(e, dt)
  updateHuskCrows(state.crows, player, level, dt)
  for (const c of state.carts) updateCartographer(c, dt)
  for (const s of state.shrines) updateMimicShrine(s, player, level, dt)
  for (const p of state.pilgrims) updatePilgrim(p, player, level, dt)

  // Bloomrot regen — heal nearby specials' HP by a small amount per sec.
  // Currently applies to Echo, Mirror, Candlewick, Cartographer, Pilgrim,
  // MimicShrine, Crows. Knight is invulnerable; Hush + Bloom skipped.
  const healTargets: { cx: number, cy: number, heal: (amt: number) => void }[] = []
  for (const m of state.mirrors) {
    if (!m.alive)
      continue
    healTargets.push({
      cx: m.x + m.w / 2,
      cy: m.y + m.h / 2,
      heal: (amt) => { m.hp = Math.min(m.maxHp, m.hp + amt) },
    })
  }
  for (const e of state.echoes) {
    if (!e.alive)
      continue
    healTargets.push({
      cx: e.x + e.w / 2,
      cy: e.y + e.h / 2,
      heal: (amt) => { e.hp = Math.min(e.maxHp, e.hp + amt) },
    })
  }
  for (const c of state.candlewicks) {
    if (!c.alive)
      continue
    healTargets.push({
      cx: c.x + c.w / 2,
      cy: c.y + c.h / 2,
      heal: (amt) => { c.hp = Math.min(c.maxHp, c.hp + amt) },
    })
  }
  for (const t of healTargets) regenInRange(state, t.cx, t.cy, dt, t.heal)
}

// ─── bullet hit routing ──────────────────────────────────────────────
// Called by combat/bullet.ts before terrain SAT. Returns true when the
// bullet should be absorbed (hit registered, regardless of whether it
// dealt damage — e.g. Echo "adapts" and absorbs without taking damage).
export function checkBulletHitSpecials(
  state: SpecialsState,
  bx: number,
  by: number,
  radius: number,
  weapon: BulletKindName,
  now: number,
  onDamage: (x: number, y: number, damage: number) => void,
): boolean {
  // 1) Echo — special rule: same weapon twice in a row within window deals
  //    damage; otherwise absorbs and resets memory.
  for (const e of state.echoes) {
    if (!e.alive)
      continue
    if (!pointInAabbInflated(bx, by, e, radius))
      continue
    const matched = e.lastWeapon === weapon && now - e.lastWeaponAt <= ECHO_MEMORY_WINDOW
    if (matched) {
      e.hp = Math.max(0, e.hp - 1)
      e.hitFlashTimer = 0.12
      e.lastWeapon = null
      e.lastWeaponAt = -999
      onDamage(bx, by, 1)
      if (e.hp <= 0) {
        e.alive = false
        emit('enemyKilled', { x: e.x + e.w / 2, y: e.y + e.h / 2 })
      }
    }
    else {
      e.lastWeapon = weapon
      e.lastWeaponAt = now
      e.adaptFlashTimer = 0.18
    }
    return true
  }

  // 2) Bloomrot — triggers spore burst on each hit (in addition to HP loss).
  for (const b of state.blooms) {
    if (!b.alive)
      continue
    if (!pointInAabbInflated(bx, by, b, radius))
      continue
    b.hp = Math.max(0, b.hp - 1)
    b.hitFlashTimer = 0.12
    b.burstTimer = BLOOM_BURST_DURATION
    if (b.hp <= 0) {
      b.alive = false
      emit('enemyKilled', { x: b.x + b.w / 2, y: b.y + b.h / 2 })
    }
    onDamage(bx, by, 1)
    return true
  }

  // 3) Candlewick — on kill, trip the lantern-out timer.
  for (const c of state.candlewicks) {
    if (!c.alive)
      continue
    if (!pointInAabbInflated(bx, by, c, radius))
      continue
    c.hp = Math.max(0, c.hp - 1)
    c.hitFlashTimer = 0.12
    if (c.hp <= 0) {
      c.alive = false
      state.darkTimer = CANDLE_DARK_TIME
      emit('enemyKilled', { x: c.x + c.w / 2, y: c.y + c.h / 2 })
    }
    onDamage(bx, by, 1)
    return true
  }

  // 4) Plain HP-bearing kinds — generic damage, no side-effects on kill.
  for (const list of [state.mirrors, state.crows, state.carts, state.shrines, state.pilgrims, state.hushes]) {
    for (const t of list) {
      if (!t.alive)
        continue
      if (!pointInAabbInflated(bx, by, t, radius))
        continue
      t.hp = Math.max(0, t.hp - 1)
      t.hitFlashTimer = 0.12
      if (t.hp <= 0) {
        t.alive = false
        emit('enemyKilled', { x: t.x + t.w / 2, y: t.y + t.h / 2 })
      }
      onDamage(bx, by, 1)
      return true
    }
  }

  // 5) Knight — shrugs off bullets. Hit flashes, no HP change.
  for (const k of state.knights) {
    if (!k.alive)
      continue
    if (!pointInAabbInflated(bx, by, k, radius))
      continue
    k.hitFlashTimer = 0.08
    onDamage(bx, by, 0)
    return true
  }

  return false
}

function pointInAabbInflated(px: number, py: number, a: { x: number, y: number, w: number, h: number }, r: number): boolean {
  return px >= a.x - r && px <= a.x + a.w + r && py >= a.y - r && py <= a.y + a.h + r
}

// ─── public: check live predicates for UI gating ─────────────────────
export function isDark(state: SpecialsState): boolean {
  return state.darkTimer > 0
}
