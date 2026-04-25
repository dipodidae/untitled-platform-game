// Specials enemy renderer. Sprite textures for enemy bodies, Graphics
// overlay for HP pips, telegraphs, chain wires, and spore bursts.

import type { Graphics } from 'pixi.js'
import type {
  Bloomrot,
  Echo,
  HuskCrow,
  MimicShrine,
  PendulumKnight,
  SpecialsState,
} from '../enemies/specials'
import type { EnemySpritePool } from './enemySpritePool'
import { hideExcessSprites, positionEnemySprite } from './enemySpritePool'

const COLOR_OXBLOOD = 0x8A2A1C
const COLOR_COLD = 0x4060C0
const COLOR_WARM = 0xC8A020
const COLOR_HOT = 0xCC2020

interface Hp {
  hp: number
  maxHp: number
}

function drawHpPip(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  hp: Hp,
  flashCol?: number,
): void {
  const pipW = Math.max(2, w - 2)
  const ratio = hp.maxHp > 0 ? hp.hp / hp.maxHp : 0
  if (ratio >= 1 || ratio <= 0)
    return
  g.rect(x + 1, y - 3, pipW, 1).fill({ color: 0x1A1A20, alpha: 0.8 })
  if (ratio > 0) {
    g.rect(x + 1, y - 3, pipW * ratio, 1).fill({ color: flashCol ?? COLOR_OXBLOOD })
  }
}

export function drawSpecials(g: Graphics, state: SpecialsState, time: number, pool: EnemySpritePool): void {
  g.clear()
  let si = 0

  // ─── Mirrors ──────────────────────────────────────────────
  for (const m of state.mirrors) {
    positionEnemySprite(pool, si, 'mirror', m.x, m.y, m.w, m.h, m.alive, m.hitFlashTimer > 0, 1, m.facing === -1, time, si)
    si++
    if (!m.alive)
      continue
    drawHpPip(g, m.x, m.y, m.w, m, m.hitFlashTimer > 0 ? COLOR_WARM : undefined)
  }

  // ─── Hush floaters ────────────────────────────────────────
  for (const h of state.hushes) {
    positionEnemySprite(pool, si, 'hush', h.x, h.y, h.w, h.h, h.alive, h.hitFlashTimer > 0, 1, false, time, si)
    si++
    if (!h.alive)
      continue
    // Radius field — dashed ring.
    const hcx = h.x + h.w / 2
    const hcy = h.y + h.h / 2
    g.circle(hcx, hcy, h.radius)
      .stroke({ width: 1, color: COLOR_COLD, alpha: 0.12 })
    drawHpPip(g, h.x, h.y, h.w, h)
  }

  // ─── Candlewicks ─────────────────────────────────────────
  for (const c of state.candlewicks) {
    positionEnemySprite(pool, si, 'candlewick', c.x, c.y, c.w, c.h, c.alive, c.hitFlashTimer > 0, 1, c.facing === -1, time, si)
    si++
    if (!c.alive)
      continue
    // Lantern glow above.
    const gx = c.x + c.w / 2
    const gy = c.y - 2
    const flicker = 0.6 + Math.sin(time * 9) * 0.25 + Math.random() * 0.1
    g.circle(gx, gy, 5).fill({ color: COLOR_WARM, alpha: 0.25 * flicker })
    g.circle(gx, gy, 2).fill({ color: 0xFFD48C, alpha: flicker })
  }

  // ─── Pendulum Knight ─────────────────────────────────────
  for (const k of state.knights as PendulumKnight[]) {
    positionEnemySprite(pool, si, 'knight', k.x, k.y, k.w, k.h, k.alive, k.hitFlashTimer > 0, 0.95, k.facing === -1, time, si)
    si++
    if (!k.alive)
      continue
    // Arc telegraph.
    const phase = k.phase
    const knightW = 1.2
    const knightA = 0.35
    const w = 1.0
    const inWindup = phase < knightW * w
    const inSwing = phase >= knightW * w && phase < knightW * w + knightA
    const kcx = k.x + k.w / 2
    const kcy = k.y + k.h / 2
    const reach = 140
    const vReach = 56
    if (inWindup) {
      const t = phase / (knightW * w)
      g.rect(kcx - reach, kcy - vReach, reach * 2, vReach * 2)
        .stroke({ width: 1, color: COLOR_HOT, alpha: 0.15 + t * 0.35 })
    }
    else if (inSwing) {
      g.rect(kcx - reach, kcy - vReach, reach * 2, vReach * 2)
        .fill({ color: COLOR_HOT, alpha: 0.15 })
        .stroke({ width: 2, color: COLOR_HOT, alpha: 0.9 })
      g.circle(kcx, kcy, 24).stroke({ width: 1, color: COLOR_COLD, alpha: 0.7 })
    }
    // Direction indicator.
    const arrowX = kcx + k.facing * (k.w / 2 + 4)
    g.rect(arrowX - 1, kcy - 1, 3, 2).fill({ color: COLOR_HOT, alpha: 0.9 })
  }

  // ─── Bloomrot ────────────────────────────────────────────
  for (const b of state.blooms as Bloomrot[]) {
    const breath = 1 + Math.sin(b.pulse) * 0.08
    positionEnemySprite(pool, si, 'bloomrot', b.x, b.y, b.w * breath, b.h * breath, b.alive, b.hitFlashTimer > 0, 1, false, time, si)
    si++
    if (!b.alive)
      continue
    // Spore ring (active during burst).
    if (b.burstTimer > 0) {
      const bcx = b.x + b.w / 2
      const bcy = b.y + b.h / 2
      const frac = 1 - b.burstTimer / 0.5
      const radius = 46 * (0.4 + frac * 0.6)
      g.circle(bcx, bcy, radius)
        .stroke({ width: 2, color: COLOR_HOT, alpha: 1 - frac })
    }
    drawHpPip(g, b.x, b.y, b.w, b)
  }

  // ─── Echoes ──────────────────────────────────────────────
  for (const e of state.echoes as Echo[]) {
    const alpha = 0.45 + Math.sin(e.hoverPhase * 3) * 0.12
    positionEnemySprite(pool, si, 'echo', e.x, e.y, e.w, e.h, e.alive, e.hitFlashTimer > 0, alpha, false, time, si)
    si++
    if (!e.alive)
      continue
    // Memory dot — colored by currently-memorized weapon.
    if (e.lastWeapon) {
      const dotCol = e.lastWeapon === 'slug' ? 0xFFD48C : 0xFF6040
      g.circle(e.x + e.w / 2, e.y - 4, 1.5).fill({ color: dotCol })
    }
    drawHpPip(g, e.x, e.y, e.w, e)
  }

  // ─── Husk Crows ──────────────────────────────────────────
  const crows = state.crows as HuskCrow[]
  // Chain wires first (drawn behind sprites).
  for (let i = 0; i < crows.length; i++) {
    const c = crows[i]
    if (!c || !c.alive)
      continue
    if (c.linkIdx >= 0 && c.linkIdx < crows.length) {
      const o = crows[c.linkIdx]
      if (o && o.alive) {
        const ax = c.x + c.w / 2
        const ay = c.y + c.h / 2
        const bx = o.x + o.w / 2
        const by = o.y + o.h / 2
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 3, color: 0x202632, alpha: 0.7 })
        g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 1, color: COLOR_OXBLOOD, alpha: 0.9 })
      }
    }
  }
  for (const c of crows) {
    const bob = c.alive ? Math.sin(c.bobPhase) * 1 : 0
    positionEnemySprite(pool, si, 'huskcrow', c.x, c.y + bob, c.w, c.h, c.alive, c.hitFlashTimer > 0, 1, false, time, si)
    si++
  }

  // ─── Cartographer ────────────────────────────────────────
  for (const c of state.carts) {
    positionEnemySprite(pool, si, 'cartographer', c.x, c.y, c.w, c.h, c.alive, c.hitFlashTimer > 0, 0.9, c.facing === -1, time, si)
    si++
    if (!c.alive)
      continue
    drawHpPip(g, c.x, c.y, c.w, c)
  }

  // ─── Mimic Shrine ────────────────────────────────────────
  for (const m of state.shrines as MimicShrine[]) {
    positionEnemySprite(pool, si, 'shrine', m.x, m.y, m.w, m.h, m.alive, m.hitFlashTimer > 0, 1, false, time, si)
    si++
    if (!m.alive)
      continue
    // Flame — wrong-colored cold-red, irregular flicker.
    const fx0 = m.x + m.w / 2 + Math.sin(m.flickerPhase * 3) * 2
    const fy0 = m.y - 3
    g.circle(fx0, fy0, 2).fill({ color: COLOR_HOT, alpha: 0.9 })
    g.circle(fx0, fy0, 4).fill({ color: COLOR_HOT, alpha: 0.2 })
    drawHpPip(g, m.x, m.y, m.w, m)
  }

  // ─── Pilgrim ─────────────────────────────────────────────
  for (const p of state.pilgrims) {
    positionEnemySprite(pool, si, 'pilgrim', p.x, p.y, p.w, p.h, p.alive, p.hitFlashTimer > 0, 1, p.facing === -1, time, si)
    si++
    if (!p.alive)
      continue
    drawHpPip(g, p.x, p.y, p.w, p)
  }

  hideExcessSprites(pool, si)
}
