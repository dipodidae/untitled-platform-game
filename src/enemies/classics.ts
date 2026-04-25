// Thirteen variants riffing on classic-game enemies. Bundled like specials
// with a single ClassicsState + one update + one bullet-hit routing + one
// draw. Parallel to specials.ts so either bundle can be iterated on
// without touching the other.
//
// Kinds (short gloss):
//   MedusaHead       — floating head in a sine wave, strong knockback.
//   BuzzyBeetle      — slug-immune walker; needs a different weapon kind.
//   Boo              — only advances when the player faces away.
//   Wallmaster       — descends from ceiling in a zone; grab → respawn.
//   Stalker (Nosk)   — persistent slow chaser, damages on contact.
//   EggplantWizard   — stationary; projectile disables player shooting.
//   Garpede          — scheduled horizontal dash hazard along a fixed path.
//   IronKnuckle      — front armor; bullets only hurt from behind.
//   Cagney           — phase-cycling stationary boss w/ different attacks.
//   DryBones         — walker that revives after going dormant.
//   Plantera         — enraged when player leaves its leash range.
//   HammerBro        — throws arcing projectiles on a rhythm.
//   MantisLord       — armored skill-gate boss w/ telegraphed windows.

import type { BulletKindName } from '../combat/bullet'
import type { BroadphaseGrid } from '../physics/broadphase'
import type { Player } from '../player/player'
import type { ParticleSystem } from '../render/particles'
import type { Level } from '../world/level'
import { respawn, takeHit } from '../player/player'
import { emit as emitParticles } from '../render/particles'
import { emit } from '../session/eventBus'

// ─── shared helpers ──────────────────────────────────────────────────
function overlapsAabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function pointInAabbInflated(px: number, py: number, a: { x: number, y: number, w: number, h: number }, r: number): boolean {
  return px >= a.x - r && px <= a.x + a.w + r && py >= a.y - r && py <= a.y + a.h + r
}

// ─── shared projectile pool ──────────────────────────────────────────
// Used by wizards, hammer bros, plantera, cagney. Distinguished by type.
export type ClassicProjectileType = 'wizard' | 'hammer' | 'plantera' | 'cagney'

export interface ClassicProjectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  type: ClassicProjectileType
  alive: boolean
  // 0 = no gravity; otherwise px/s² downward.
  gravity: number
  // Visual rotation in radians (for spinning projectiles like hammers).
  rotation: number
  // Spin speed in rad/s (0 = no spin).
  spin: number
}

function spawnProjectile(
  list: ClassicProjectile[],
  x: number,
  y: number,
  vx: number,
  vy: number,
  type: ClassicProjectileType,
  life: number,
  gravity: number,
): ClassicProjectile {
  const proj: ClassicProjectile = { x, y, vx, vy, life, type, alive: true, gravity, rotation: 0, spin: 0 }
  list.push(proj)
  return proj
}

function updateProjectiles(
  state: ClassicsState,
  player: Player,
  level: Level,
  dt: number,
  particles: ParticleSystem | null = null,
): void {
  for (const p of state.projectiles) {
    if (!p.alive)
      continue
    p.vy += p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rotation += p.spin * dt
    p.life -= dt
    if (p.life <= 0) {
      p.alive = false
      continue
    }
    if (p.x < -64 || p.x > level.worldWidth + 64 || p.y > level.worldHeight + 64) {
      p.alive = false
      continue
    }
    // Hammer projectile: particle trail + glow
    if (p.type === 'hammer' && particles) {
      emitParticles(particles, 'ember', p.x, p.y, 1, -p.vx, -p.vy, {
        scaleMul: 0.3,
        speedMul: 0.15,
        tintOverride: 0xFFA040,
      })
    }
    if (player.alive && overlapsAabb(p.x - 3, p.y - 3, 6, 6, player.x, player.y, player.w, player.h)) {
      if (p.type === 'wizard') {
        // Doesn't damage — just disables the player's shooting.
        state.shootDisabledTimer = 4.0
      }
      else {
        takeHit(player, level, p.x, p.y, 1)
      }
      p.alive = false
    }
  }
  // Compact.
  let w = 0
  for (let r = 0; r < state.projectiles.length; r++) {
    const p = state.projectiles[r]!
    if (p.alive)
      state.projectiles[w++] = p
  }
  state.projectiles.length = w
}

// ─── 1) Medusa Head ──────────────────────────────────────────────────
export interface MedusaHead {
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
  phase: number
  facing: 1 | -1
  respawnTimer: number
}

export function createMedusaHead(x: number, y: number): MedusaHead {
  return {
    x,
    y,
    w: 12,
    h: 12,
    hp: 2,
    maxHp: 2,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    phase: Math.random() * Math.PI * 2,
    facing: -1,
    respawnTimer: 0,
  }
}

function updateMedusa(m: MedusaHead, player: Player, level: Level, dt: number): void {
  if (!m.alive) {
    if (m.respawnTimer > 0) {
      m.respawnTimer = Math.max(0, m.respawnTimer - dt)
      if (m.respawnTimer <= 0) {
        m.alive = true
        m.hp = m.maxHp
        m.x = m.spawnX
        m.y = m.spawnY
      }
    }
    return
  }
  if (m.hitFlashTimer > 0)
    m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt)
  m.phase += dt * 1.5
  m.x += m.facing * 35 * dt
  m.y = m.spawnY + Math.sin(m.phase) * 24
  // Wrap around the patrol band.
  if (m.x < m.spawnX - 160)
    m.facing = 1
  else if (m.x > m.spawnX + 160)
    m.facing = -1
  if (player.alive && overlapsAabb(m.x, m.y, m.w, m.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, m.x + m.w / 2, m.y + m.h / 2, 1)
    // Extra horizontal knockback — the Castlevania trademark.
    const dir = player.x + player.w / 2 >= m.x + m.w / 2 ? 1 : -1
    player.vx = dir * 340
    player.vy = -220
    player.grounded = false
  }
}

// ─── 2) Buzzy Beetle ─────────────────────────────────────────────────
// Immune to 'slug'. Vulnerable to 'bigShot' (anything non-slug).
export interface BuzzyBeetle {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  facing: 1 | -1
  patrolHalfWidth: number
  // Weapon kind that can damage it. 'slug' → immune, anything else → hit.
  immuneWeapon: BulletKindName
}

export function createBuzzyBeetle(x: number, y: number): BuzzyBeetle {
  return {
    x,
    y,
    w: 14,
    h: 14,
    hp: 1,
    maxHp: 1,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    facing: -1,
    patrolHalfWidth: 48,
    immuneWeapon: 'slug',
  }
}

function updateBeetle(b: BuzzyBeetle, player: Player, level: Level, dt: number): void {
  if (!b.alive)
    return
  if (b.hitFlashTimer > 0)
    b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt)
  b.x += b.facing * 30 * dt
  if (b.x < b.spawnX - b.patrolHalfWidth) {
    b.x = b.spawnX - b.patrolHalfWidth
    b.facing = 1
  }
  else if (b.x > b.spawnX + b.patrolHalfWidth) {
    b.x = b.spawnX + b.patrolHalfWidth
    b.facing = -1
  }
  if (player.alive && overlapsAabb(b.x, b.y, b.w, b.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, b.x + b.w / 2, b.y + b.h / 2, 1)
  }
}

// ─── 3) Boo ──────────────────────────────────────────────────────────
// Only advances toward the player when facing away. Visually "covers its
// face" when looked at.
export interface Boo {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  facing: 1 | -1
  // True when the player is facing this Boo (it hides).
  hiding: boolean
}

export function createBoo(x: number, y: number): Boo {
  return {
    x,
    y,
    w: 16,
    h: 16,
    hp: 2,
    maxHp: 2,
    alive: true,
    hitFlashTimer: 0,
    facing: -1,
    hiding: false,
  }
}

function updateBoo(b: Boo, player: Player, level: Level, dt: number): void {
  if (!b.alive)
    return
  if (b.hitFlashTimer > 0)
    b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt)
  const bcx = b.x + b.w / 2
  const pcx = player.x + player.w / 2
  // Player's facing points AT the boo when player.facing sign matches (bcx - pcx).
  const dirToBoo = bcx > pcx ? 1 : -1
  b.hiding = player.facing === dirToBoo && player.alive
  b.facing = dirToBoo as 1 | -1
  if (!b.hiding && player.alive) {
    const dx = pcx - bcx
    const dy = (player.y + player.h / 2) - (b.y + b.h / 2)
    const d = Math.hypot(dx, dy)
    const speed = 50
    if (d > 1) {
      b.x += (dx / d) * speed * dt
      b.y += (dy / d) * speed * dt
    }
  }
  if (player.alive && overlapsAabb(b.x, b.y, b.w, b.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, b.x + b.w / 2, b.y + b.h / 2, 1)
  }
}

// ─── 4) Wallmaster ───────────────────────────────────────────────────
// Hangs from the ceiling (its spawn position). When the player's center
// is within the trigger zone horizontally, descends fast. Grab → the
// player is teleported back to spawn/checkpoint.
const WALLMASTER_TRIGGER_HALF_W = 36
const WALLMASTER_DESCEND_SPEED = 260

export interface Wallmaster {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  ceilingY: number
  mode: 'idle' | 'descend' | 'retract'
  retractTimer: number
}

export function createWallmaster(x: number, y: number): Wallmaster {
  return {
    x,
    y,
    w: 16,
    h: 16,
    hp: 3,
    maxHp: 3,
    alive: true,
    hitFlashTimer: 0,
    ceilingY: y,
    mode: 'idle',
    retractTimer: 0,
  }
}

function updateWallmaster(w: Wallmaster, player: Player, level: Level, dt: number): void {
  if (!w.alive)
    return
  if (w.hitFlashTimer > 0)
    w.hitFlashTimer = Math.max(0, w.hitFlashTimer - dt)
  const pcx = player.x + player.w / 2
  const cx = w.x + w.w / 2
  if (w.mode === 'idle') {
    if (player.alive && Math.abs(pcx - cx) < WALLMASTER_TRIGGER_HALF_W) {
      w.mode = 'descend'
    }
  }
  else if (w.mode === 'descend') {
    w.y += WALLMASTER_DESCEND_SPEED * dt
    if (player.alive && overlapsAabb(w.x, w.y, w.w, w.h, player.x, player.y, player.w, player.h)) {
      // Grab — yank the player back to the last spawn.
      respawn(player, level)
      w.mode = 'retract'
      w.retractTimer = 0.8
    }
    if (w.y > w.ceilingY + 180) {
      w.mode = 'retract'
      w.retractTimer = 0.8
    }
  }
  else if (w.mode === 'retract') {
    w.retractTimer -= dt
    w.y -= WALLMASTER_DESCEND_SPEED * 0.5 * dt
    if (w.y <= w.ceilingY) {
      w.y = w.ceilingY
    }
    if (w.retractTimer <= 0 && w.y <= w.ceilingY + 1) {
      w.mode = 'idle'
    }
  }
}

// ─── 5) Stalker (Nosk) ───────────────────────────────────────────────
// Persistent slow chaser. Tracks player horizontally across the full
// level. Not deflected by terrain — mostly floats, with a little sink.
export interface Stalker {
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
  respawnTimer: number
  facing: 1 | -1
}

export function createStalker(x: number, y: number): Stalker {
  return {
    x,
    y,
    w: 20,
    h: 20,
    hp: 3,
    maxHp: 3,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    spawnY: y,
    respawnTimer: 0,
    facing: -1,
  }
}

function updateStalker(s: Stalker, player: Player, level: Level, dt: number): void {
  if (!s.alive) {
    if (s.respawnTimer > 0) {
      s.respawnTimer = Math.max(0, s.respawnTimer - dt)
      if (s.respawnTimer <= 0) {
        s.alive = true
        s.hp = s.maxHp
        s.x = s.spawnX
        s.y = s.spawnY
      }
    }
    return
  }
  if (s.hitFlashTimer > 0)
    s.hitFlashTimer = Math.max(0, s.hitFlashTimer - dt)
  if (!player.alive)
    return
  const dx = (player.x + player.w / 2) - (s.x + s.w / 2)
  const dy = (player.y + player.h / 2) - (s.y + s.h / 2)
  const d = Math.hypot(dx, dy)
  if (Math.abs(dx) > 0.5)
    s.facing = dx > 0 ? 1 : -1
  const speed = 42
  if (d > 1) {
    s.x += (dx / d) * speed * dt
    s.y += (dy / d) * speed * dt
  }
  if (overlapsAabb(s.x, s.y, s.w, s.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, s.x + s.w / 2, s.y + s.h / 2, 1)
  }
}

// ─── 6) Eggplant Wizard ──────────────────────────────────────────────
// Stationary. Fires a slow arcing projectile toward the player on a
// timer. Wizard projectiles don't damage — they disable shooting for
// SHOOT_DISABLE_SECS seconds.
export interface EggplantWizard {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  fireTimer: number
  facing: 1 | -1
}

export function createWizard(x: number, y: number): EggplantWizard {
  return {
    x,
    y,
    w: 20,
    h: 20,
    hp: 3,
    maxHp: 3,
    alive: true,
    hitFlashTimer: 0,
    fireTimer: 2.0,
    facing: -1,
  }
}

function updateWizard(w: EggplantWizard, state: ClassicsState, player: Player, dt: number): void {
  if (!w.alive)
    return
  if (w.hitFlashTimer > 0)
    w.hitFlashTimer = Math.max(0, w.hitFlashTimer - dt)
  if (player.alive) {
    const wcx = w.x + w.w / 2
    const pcx = player.x + player.w / 2
    w.facing = pcx > wcx ? 1 : -1
  }
  w.fireTimer -= dt
  if (w.fireTimer <= 0 && player.alive) {
    w.fireTimer = 3.2
    const sx = w.x + w.w / 2
    const sy = w.y + w.h / 2
    const dx = (player.x + player.w / 2) - sx
    const dy = (player.y + player.h / 2) - sy
    const d = Math.max(1, Math.hypot(dx, dy))
    const speed = 90
    spawnProjectile(state.projectiles, sx, sy, (dx / d) * speed, (dy / d) * speed - 30, 'wizard', 3.5, 60)
  }
}

// ─── 7) Garpede ──────────────────────────────────────────────────────
// Scheduled hazard. Periodically traverses from (x0, y) to (x1, y) at
// high speed; instant-kill on overlap. Cooldown between runs.
export interface Garpede {
  x: number
  y: number
  w: number
  h: number
  alive: boolean
  hitFlashTimer: number // hp-less — unkillable hazard
  hp: 0
  maxHp: 0
  x0: number
  x1: number
  baseY: number
  phase: 'idle' | 'run'
  timer: number
  period: number
  runSpeed: number
  facing: 1 | -1
}

export function createGarpede(x0: number, y: number, x1: number, period: number): Garpede {
  return {
    x: x0,
    y,
    w: 20,
    h: 20,
    alive: true,
    hitFlashTimer: 0,
    hp: 0,
    maxHp: 0,
    x0,
    x1,
    baseY: y,
    phase: 'idle',
    timer: period * 0.5,
    period,
    runSpeed: 320,
    facing: 1,
  }
}

function updateGarpede(g: Garpede, player: Player, level: Level, dt: number): void {
  g.timer -= dt
  if (g.phase === 'idle') {
    if (g.timer <= 0) {
      g.phase = 'run'
      g.x = g.x0
      g.y = g.baseY
    }
  }
  else {
    g.x += g.runSpeed * dt
    if (g.x >= g.x1) {
      g.phase = 'idle'
      g.timer = g.period
      g.x = g.x0 // park offscreen-equivalent
    }
    if (player.alive && overlapsAabb(g.x, g.y, g.w, g.h, player.x, player.y, player.w, player.h)) {
      takeHit(player, level, g.x + g.w / 2, g.y + g.h / 2, 3)
    }
  }
}

// ─── 8) Iron Knuckle ─────────────────────────────────────────────────
// Stationary. Faces a direction. Bullets from the facing side bounce off
// (absorbed + flash, no damage). Bullets from behind deal damage.
export interface IronKnuckle {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  facing: 1 | -1
  blockFlashTimer: number
}

export function createIronKnuckle(x: number, y: number, facing: 1 | -1 = 1): IronKnuckle {
  return {
    x,
    y,
    w: 22,
    h: 22,
    hp: 5,
    maxHp: 5,
    alive: true,
    hitFlashTimer: 0,
    facing,
    blockFlashTimer: 0,
  }
}

function updateIronKnuckle(k: IronKnuckle, player: Player, level: Level, dt: number): void {
  if (!k.alive)
    return
  if (k.hitFlashTimer > 0)
    k.hitFlashTimer = Math.max(0, k.hitFlashTimer - dt)
  if (k.blockFlashTimer > 0)
    k.blockFlashTimer = Math.max(0, k.blockFlashTimer - dt)
  // Melee: if player is adjacent, slash.
  if (player.alive && overlapsAabb(k.x - 8, k.y, k.w + 16, k.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, k.x + k.w / 2, k.y + k.h / 2, 1)
  }
}

// ─── 9) Cagney (phase boss) ──────────────────────────────────────────
// Stationary. Cycles through 3 phases as HP drains. Each phase has a
// different attack cadence + projectile pattern.
export interface Cagney {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  fireTimer: number
}

export function createCagney(x: number, y: number): Cagney {
  return {
    x,
    y,
    w: 34,
    h: 34,
    hp: 12,
    maxHp: 12,
    alive: true,
    hitFlashTimer: 0,
    fireTimer: 1.5,
  }
}

function cagneyPhase(c: Cagney): 0 | 1 | 2 {
  const r = c.hp / c.maxHp
  if (r > 0.66)
    return 0
  if (r > 0.33)
    return 1
  return 2
}

function updateCagney(c: Cagney, state: ClassicsState, player: Player, dt: number): void {
  if (!c.alive)
    return
  if (c.hitFlashTimer > 0)
    c.hitFlashTimer = Math.max(0, c.hitFlashTimer - dt)
  c.fireTimer -= dt
  if (c.fireTimer <= 0 && player.alive) {
    const phase = cagneyPhase(c)
    const sx = c.x + c.w / 2
    const sy = c.y + c.h * 0.2
    if (phase === 0) {
      // Radial spore ring, 8 directions.
      c.fireTimer = 2.2
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        spawnProjectile(state.projectiles, sx, sy, Math.cos(a) * 100, Math.sin(a) * 100, 'cagney', 2.0, 0)
      }
    }
    else if (phase === 1) {
      // Aimed homing-ish pair of spores.
      c.fireTimer = 1.1
      const dx = (player.x + player.w / 2) - sx
      const dy = (player.y + player.h / 2) - sy
      const d = Math.max(1, Math.hypot(dx, dy))
      const speed = 140
      spawnProjectile(state.projectiles, sx, sy, (dx / d) * speed - 40, (dy / d) * speed, 'cagney', 2.4, 30)
      spawnProjectile(state.projectiles, sx, sy, (dx / d) * speed + 40, (dy / d) * speed, 'cagney', 2.4, 30)
    }
    else {
      // Desperation: triple burst upward raining back down.
      c.fireTimer = 0.8
      for (let i = -1; i <= 1; i++) {
        spawnProjectile(state.projectiles, sx, sy, i * 60, -260, 'cagney', 3.5, 240)
      }
    }
  }
}

// ─── 10) Dry Bones ───────────────────────────────────────────────────
// Walker. On "death" crumbles, goes dormant, then reassembles.
export interface DryBones {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  spawnX: number
  facing: 1 | -1
  patrolHalfWidth: number
  reviveTimer: number // 0 = active; >0 = dormant
}

export function createDryBones(x: number, y: number): DryBones {
  return {
    x,
    y,
    w: 16,
    h: 16,
    hp: 1,
    maxHp: 1,
    alive: true,
    hitFlashTimer: 0,
    spawnX: x,
    facing: -1,
    patrolHalfWidth: 60,
    reviveTimer: 0,
  }
}

function updateDryBones(d: DryBones, player: Player, level: Level, dt: number): void {
  if (!d.alive) {
    d.reviveTimer = Math.max(0, d.reviveTimer - dt)
    if (d.reviveTimer <= 0) {
      d.alive = true
      d.hp = d.maxHp
    }
    return
  }
  if (d.hitFlashTimer > 0)
    d.hitFlashTimer = Math.max(0, d.hitFlashTimer - dt)
  d.x += d.facing * 28 * dt
  if (d.x < d.spawnX - d.patrolHalfWidth) {
    d.x = d.spawnX - d.patrolHalfWidth
    d.facing = 1
  }
  else if (d.x > d.spawnX + d.patrolHalfWidth) {
    d.x = d.spawnX + d.patrolHalfWidth
    d.facing = -1
  }
  if (player.alive && overlapsAabb(d.x, d.y, d.w, d.h, player.x, player.y, player.w, player.h)) {
    takeHit(player, level, d.x + d.w / 2, d.y + d.h / 2, 1)
  }
}

// ─── 11) Plantera ────────────────────────────────────────────────────
// Stationary. Passive while player is within leash radius; enraged when
// player leaves, flinging tendril projectiles.
export interface Plantera {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  leash: number
  fireTimer: number
  enraged: boolean
  facing: 1 | -1
}

export function createPlantera(x: number, y: number): Plantera {
  return {
    x,
    y,
    w: 28,
    h: 28,
    hp: 10,
    maxHp: 10,
    alive: true,
    hitFlashTimer: 0,
    leash: 220,
    fireTimer: 1.0,
    enraged: false,
    facing: -1,
  }
}

function updatePlantera(p: Plantera, state: ClassicsState, player: Player, dt: number): void {
  if (!p.alive)
    return
  if (p.hitFlashTimer > 0)
    p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt)
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  const dx = (player.x + player.w / 2) - cx
  const dy = (player.y + player.h / 2) - cy
  const dist = Math.hypot(dx, dy)
  if (player.alive && Math.abs(dx) > 0.5)
    p.facing = dx > 0 ? 1 : -1
  p.enraged = dist > p.leash && player.alive
  if (!p.enraged)
    return
  p.fireTimer -= dt
  if (p.fireTimer <= 0) {
    p.fireTimer = 0.55
    const d = Math.max(1, dist)
    const speed = 170
    spawnProjectile(state.projectiles, cx, cy, (dx / d) * speed, (dy / d) * speed, 'plantera', 2.2, 0)
  }
}

// ─── 12) Hammer Bro ──────────────────────────────────────────────────
// Stationary. Throws an arcing projectile on a rhythm — projectile has
// gravity, falling back toward the player's lane.
export interface HammerBro {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  throwTimer: number
  period: number
  facing: 1 | -1
  // Charge state — hammer bro winds up before each throw.
  charging: boolean
  chargeTimer: number
  chargeDuration: number
}

const HAMMER_CHARGE_MIN = 0.4
const HAMMER_CHARGE_MAX = 0.9
const HAMMER_AIM_JITTER = 10 // ±px random offset on target
const HAMMER_PERIOD_JITTER = 0.5 // ± random added to period

export function createHammerBro(x: number, y: number, period = 1.6): HammerBro {
  return {
    x,
    y,
    w: 18,
    h: 18,
    hp: 4,
    maxHp: 4,
    alive: true,
    hitFlashTimer: 0,
    throwTimer: period * (0.5 + Math.random()),
    period,
    facing: -1,
    charging: false,
    chargeTimer: 0,
    chargeDuration: 0,
  }
}

function updateHammerBro(b: HammerBro, state: ClassicsState, player: Player, dt: number, particles: ParticleSystem | null): void {
  if (!b.alive)
    return
  if (b.hitFlashTimer > 0)
    b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt)
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  b.facing = (player.alive && player.x + player.w / 2 < cx) ? -1 : 1

  // ─── Charging phase ───────────────────────────────────────────
  if (b.charging) {
    b.chargeTimer += dt
    // Emit growing charge-glow particles behind the bro
    if (particles) {
      const intensity = Math.min(1, b.chargeTimer / b.chargeDuration)
      const count = intensity > 0.6 ? 2 : 1
      emitParticles(particles, 'ember', cx, cy, count, 0, -1, {
        scaleMul: 0.4 + intensity * 0.8,
        speedMul: 0.3 + intensity * 0.5,
        tintOverride: 0xFFA040,
      })
    }
    if (b.chargeTimer >= b.chargeDuration) {
      // Fire!
      b.charging = false
      const GRAVITY = 400
      const px = player.x + player.w / 2
      const py = player.y + player.h / 2
      const LOOK_AHEAD = 0.3
      // Aim jitter — small random offset so it's not pixel-perfect
      const jitterX = (Math.random() - 0.5) * 2 * HAMMER_AIM_JITTER
      const jitterY = (Math.random() - 0.5) * 2 * HAMMER_AIM_JITTER
      const tgtX = px + player.vx * LOOK_AHEAD + jitterX
      const tgtY = py + player.vy * LOOK_AHEAD + jitterY
      const dx = tgtX - cx
      const dy = tgtY - cy
      const dist = Math.abs(dx)
      const flightTime = Math.max(0.5, Math.min(1.8, dist / 140))
      const vx = dx / flightTime
      const vy = (dy - 0.5 * GRAVITY * flightTime * flightTime) / flightTime
      const proj = spawnProjectile(state.projectiles, cx, cy, vx, vy, 'hammer', 3.5, GRAVITY)
      proj.spin = (b.facing === -1 ? -1 : 1) * 12
      // Next throw: sporadic timing
      b.throwTimer = b.period + (Math.random() - 0.5) * 2 * HAMMER_PERIOD_JITTER
    }
    return
  }

  // ─── Idle countdown → begin charge ────────────────────────────
  b.throwTimer -= dt
  if (b.throwTimer <= 0 && player.alive) {
    b.charging = true
    b.chargeTimer = 0
    b.chargeDuration = HAMMER_CHARGE_MIN + Math.random() * (HAMMER_CHARGE_MAX - HAMMER_CHARGE_MIN)
  }
}

// ─── 13) Mantis Lord ─────────────────────────────────────────────────
// Armored stationary boss. Periodic telegraphed dash-cut window during
// which a nearby AABB is lethal. Bullets only damage during vulnerable
// windows (between dashes).
export interface MantisLord {
  x: number
  y: number
  w: number
  h: number
  hp: number
  maxHp: number
  alive: boolean
  hitFlashTimer: number
  phase: number
  facing: 1 | -1
}

export function createMantisLord(x: number, y: number): MantisLord {
  return {
    x,
    y,
    w: 26,
    h: 26,
    hp: 14,
    maxHp: 14,
    alive: true,
    hitFlashTimer: 0,
    phase: 0,
    facing: -1,
  }
}

const MANTIS_CYCLE = 4.0
const MANTIS_WINDUP = 1.2
const MANTIS_STRIKE = 0.25
// Vulnerable during windup only — perfect parry-style timing.

function updateMantisLord(m: MantisLord, player: Player, level: Level, dt: number): void {
  if (!m.alive)
    return
  if (m.hitFlashTimer > 0)
    m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt)
  if (player.alive) {
    const mcx = m.x + m.w / 2
    m.facing = (player.x + player.w / 2) > mcx ? 1 : -1
  }
  m.phase += dt
  if (m.phase >= MANTIS_CYCLE)
    m.phase = 0
  const striking = m.phase >= MANTIS_WINDUP && m.phase < MANTIS_WINDUP + MANTIS_STRIKE
  if (striking && player.alive) {
    const cx = m.x + m.w / 2
    const cy = m.y + m.h / 2
    // Wide strike range; player must be outside it OR the brief vulnerability
    // window lapse for safety.
    if (Math.abs(player.x + player.w / 2 - cx) < 80 && Math.abs(player.y + player.h / 2 - cy) < 60) {
      takeHit(player, level, cx, cy, 2)
    }
  }
}

export function mantisIsVulnerable(m: MantisLord): boolean {
  return m.phase < MANTIS_WINDUP
}

// ─── state bundle ────────────────────────────────────────────────────
export interface ClassicsState {
  medusas: MedusaHead[]
  beetles: BuzzyBeetle[]
  boos: Boo[]
  wallmasters: Wallmaster[]
  stalkers: Stalker[]
  wizards: EggplantWizard[]
  garpedes: Garpede[]
  ironKnuckles: IronKnuckle[]
  cagneys: Cagney[]
  dryBones: DryBones[]
  planteras: Plantera[]
  hammerBros: HammerBro[]
  mantisLords: MantisLord[]
  // Shared projectile pool.
  projectiles: ClassicProjectile[]
  // Wizard-hit effect: seconds where player shooting is suppressed.
  shootDisabledTimer: number
}

export interface ClassicsSpawns {
  medusas?: readonly { x: number, y: number }[]
  beetles?: readonly { x: number, y: number }[]
  boos?: readonly { x: number, y: number }[]
  wallmasters?: readonly { x: number, y: number }[]
  stalkers?: readonly { x: number, y: number }[]
  wizards?: readonly { x: number, y: number }[]
  garpedes?: readonly { x0: number, y: number, x1: number, period?: number }[]
  ironKnuckles?: readonly { x: number, y: number, facing?: 1 | -1 }[]
  cagneys?: readonly { x: number, y: number }[]
  dryBones?: readonly { x: number, y: number }[]
  planteras?: readonly { x: number, y: number }[]
  hammerBros?: readonly { x: number, y: number, period?: number }[]
  mantisLords?: readonly { x: number, y: number }[]
}

export function createClassicsFromSpawns(s: ClassicsSpawns): ClassicsState {
  return {
    medusas: (s.medusas ?? []).map(p => createMedusaHead(p.x, p.y)),
    beetles: (s.beetles ?? []).map(p => createBuzzyBeetle(p.x, p.y)),
    boos: (s.boos ?? []).map(p => createBoo(p.x, p.y)),
    wallmasters: (s.wallmasters ?? []).map(p => createWallmaster(p.x, p.y)),
    stalkers: (s.stalkers ?? []).map(p => createStalker(p.x, p.y)),
    wizards: (s.wizards ?? []).map(p => createWizard(p.x, p.y)),
    garpedes: (s.garpedes ?? []).map(p => createGarpede(p.x0, p.y, p.x1, p.period ?? 4)),
    ironKnuckles: (s.ironKnuckles ?? []).map(p => createIronKnuckle(p.x, p.y, p.facing ?? 1)),
    cagneys: (s.cagneys ?? []).map(p => createCagney(p.x, p.y)),
    dryBones: (s.dryBones ?? []).map(p => createDryBones(p.x, p.y)),
    planteras: (s.planteras ?? []).map(p => createPlantera(p.x, p.y)),
    hammerBros: (s.hammerBros ?? []).map(p => createHammerBro(p.x, p.y, p.period ?? 1.6)),
    mantisLords: (s.mantisLords ?? []).map(p => createMantisLord(p.x, p.y)),
    projectiles: [],
    shootDisabledTimer: 0,
  }
}

// ─── one-shot update ─────────────────────────────────────────────────
export function updateClassics(
  state: ClassicsState,
  player: Player,
  level: Level,
  _broadphase: BroadphaseGrid,
  dt: number,
  _now: number,
  particles: ParticleSystem | null = null,
): void {
  if (state.shootDisabledTimer > 0)
    state.shootDisabledTimer = Math.max(0, state.shootDisabledTimer - dt)

  for (const m of state.medusas) updateMedusa(m, player, level, dt)
  for (const b of state.beetles) updateBeetle(b, player, level, dt)
  for (const b of state.boos) updateBoo(b, player, level, dt)
  for (const w of state.wallmasters) updateWallmaster(w, player, level, dt)
  for (const s of state.stalkers) updateStalker(s, player, level, dt)
  for (const w of state.wizards) updateWizard(w, state, player, dt)
  for (const g of state.garpedes) updateGarpede(g, player, level, dt)
  for (const k of state.ironKnuckles) updateIronKnuckle(k, player, level, dt)
  for (const c of state.cagneys) updateCagney(c, state, player, dt)
  for (const d of state.dryBones) updateDryBones(d, player, level, dt)
  for (const p of state.planteras) updatePlantera(p, state, player, dt)
  for (const h of state.hammerBros) updateHammerBro(h, state, player, dt, particles)
  for (const m of state.mantisLords) updateMantisLord(m, player, level, dt)

  updateProjectiles(state, player, level, dt, particles)
}

// ─── bullet routing ──────────────────────────────────────────────────
export function checkBulletHitClassics(
  state: ClassicsState,
  bx: number,
  by: number,
  radius: number,
  weapon: BulletKindName,
  _now: number,
  onDamage: (x: number, y: number, damage: number) => void,
): boolean {
  // Buzzy Beetle — immune to its immuneWeapon kind.
  for (const b of state.beetles) {
    if (!b.alive)
      continue
    if (!pointInAabbInflated(bx, by, b, radius))
      continue
    if (weapon === b.immuneWeapon) {
      b.hitFlashTimer = 0.08
      onDamage(bx, by, 0)
      return true
    }
    b.hp = Math.max(0, b.hp - 1)
    b.hitFlashTimer = 0.12
    if (b.hp <= 0) { b.alive = false; emit('enemyKilled', { x: b.x + b.w / 2, y: b.y + b.h / 2 }) }
    onDamage(bx, by, 1)
    return true
  }

  // Boo — immune while hiding.
  for (const b of state.boos) {
    if (!b.alive)
      continue
    if (!pointInAabbInflated(bx, by, b, radius))
      continue
    if (b.hiding) {
      onDamage(bx, by, 0)
      return true
    }
    b.hp = Math.max(0, b.hp - 1)
    b.hitFlashTimer = 0.12
    if (b.hp <= 0) { b.alive = false; emit('enemyKilled', { x: b.x + b.w / 2, y: b.y + b.h / 2 }) }
    onDamage(bx, by, 1)
    return true
  }

  // Iron Knuckle — damage only from behind (opposite of facing).
  for (const k of state.ironKnuckles) {
    if (!k.alive)
      continue
    if (!pointInAabbInflated(bx, by, k, radius))
      continue
    const cx = k.x + k.w / 2
    const fromBehind = (k.facing === 1 && bx < cx) || (k.facing === -1 && bx > cx)
    if (!fromBehind) {
      k.blockFlashTimer = 0.12
      onDamage(bx, by, 0)
      return true
    }
    k.hp = Math.max(0, k.hp - 1)
    k.hitFlashTimer = 0.12
    if (k.hp <= 0) { k.alive = false; emit('enemyKilled', { x: k.x + k.w / 2, y: k.y + k.h / 2 }) }
    onDamage(bx, by, 1)
    return true
  }

  // Mantis Lord — invulnerable except during vulnerable window.
  for (const m of state.mantisLords) {
    if (!m.alive)
      continue
    if (!pointInAabbInflated(bx, by, m, radius))
      continue
    if (!mantisIsVulnerable(m)) {
      m.hitFlashTimer = 0.08
      onDamage(bx, by, 0)
      return true
    }
    m.hp = Math.max(0, m.hp - 1)
    m.hitFlashTimer = 0.12
    if (m.hp <= 0) { m.alive = false; emit('enemyKilled', { x: m.x + m.w / 2, y: m.y + m.h / 2 }) }
    onDamage(bx, by, 1)
    return true
  }

  // Dry Bones — normal damage; reset reviveTimer to REVIVE_SECS.
  for (const d of state.dryBones) {
    if (!d.alive)
      continue
    if (!pointInAabbInflated(bx, by, d, radius))
      continue
    d.hp = 0
    d.alive = false
    d.reviveTimer = 4.0
    d.hitFlashTimer = 0.12
    emit('enemyKilled', { x: d.x + d.w / 2, y: d.y + d.h / 2 })
    onDamage(bx, by, 1)
    return true
  }

  // Medusa Head — normal damage; on death set respawn timer.
  for (const m of state.medusas) {
    if (!m.alive)
      continue
    if (!pointInAabbInflated(bx, by, m, radius))
      continue
    m.hp = Math.max(0, m.hp - 1)
    m.hitFlashTimer = 0.12
    if (m.hp <= 0) {
      m.alive = false
      m.respawnTimer = 5.0
      emit('enemyKilled', { x: m.x + m.w / 2, y: m.y + m.h / 2 })
    }
    onDamage(bx, by, 1)
    return true
  }

  // Stalker — normal damage; on death set respawn timer.
  for (const s of state.stalkers) {
    if (!s.alive)
      continue
    if (!pointInAabbInflated(bx, by, s, radius))
      continue
    s.hp = Math.max(0, s.hp - 1)
    s.hitFlashTimer = 0.12
    if (s.hp <= 0) {
      s.alive = false
      s.respawnTimer = 8.0
      emit('enemyKilled', { x: s.x + s.w / 2, y: s.y + s.h / 2 })
    }
    onDamage(bx, by, 1)
    return true
  }

  // Generic HP-bearing — Wallmaster, Wizard, Cagney, Plantera, HammerBro.
  const lists: { list: { x: number, y: number, w: number, h: number, hp: number, alive: boolean, hitFlashTimer: number }[] }[] = [
    { list: state.wallmasters },
    { list: state.wizards },
    { list: state.cagneys },
    { list: state.planteras },
    { list: state.hammerBros },
  ]
  for (const kind of lists) {
    for (const t of kind.list) {
      if (!t.alive)
        continue
      if (!pointInAabbInflated(bx, by, t, radius))
        continue
      t.hp = Math.max(0, t.hp - 1)
      t.hitFlashTimer = 0.12
      if (t.hp <= 0) { t.alive = false; emit('enemyKilled', { x: t.x + t.w / 2, y: t.y + t.h / 2 }) }
      onDamage(bx, by, 1)
      return true
    }
  }

  // Garpede — bullets pass through; it's a hazard, not a creature.
  return false
}

// Public predicate for the game.ts shoot gate.
export function shootingDisabled(state: ClassicsState): boolean {
  return state.shootDisabledTimer > 0
}
