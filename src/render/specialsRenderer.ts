// Renders every kind in SpecialsState. One Graphics is reused across all
// kinds — cleared and redrawn each frame. Stays in the crude FAULTLINE
// style: hard rects, bone/oxblood fills, ASCII brackets to hint at form.

import type { Graphics } from 'pixi.js'
import type {
  Bloomrot,
  Candlewick,
  Cartographer,
  Echo,
  HuskCrow,
  Hush,
  MimicShrine,
  Mirror,
  PendulumKnight,
  Pilgrim,
  SpecialsState,
} from '../enemies/specials'
import { isDark } from '../enemies/specials'

const COLOR_BONE = 0xC8B89A
const COLOR_OXBLOOD = 0x8A2A1C
const COLOR_ASH = 0x3A3F4A
const COLOR_COLD = 0x4060C0
const COLOR_WARM = 0xC8A020
const COLOR_HOT = 0xCC2020
const COLOR_EDGE = 0x202632
const COLOR_FLASH = 0xFF4A4A

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

export function drawSpecials(g: Graphics, state: SpecialsState, time: number): void {
  g.clear()

  const dark = isDark(state)

  // ─── Mirrors ──────────────────────────────────────────────
  for (const m of state.mirrors as Mirror[]) {
    if (!m.alive)
      continue
    const flash = m.hitFlashTimer > 0
    const col = flash ? COLOR_FLASH : (m.active ? (dark ? COLOR_HOT : COLOR_ASH) : 0x20242E)
    g.rect(m.x, m.y, m.w, m.h).fill({ color: col, alpha: 0.85 })
      .stroke({ width: 1, color: 0xE0D8C8, alpha: 0.5 })
    // Blank face — two hollow brackets.
    g.rect(m.x + 2, m.y + 3, 2, 2).fill({ color: 0xE0D8C8, alpha: 0.35 })
    g.rect(m.x + m.w - 4, m.y + 3, 2, 2).fill({ color: 0xE0D8C8, alpha: 0.35 })
    drawHpPip(g, m.x, m.y, m.w, m, flash ? COLOR_WARM : undefined)
  }

  // ─── Hush floaters ────────────────────────────────────────
  for (const h of state.hushes as Hush[]) {
    if (!h.alive)
      continue
    const flash = h.hitFlashTimer > 0
    const hcx = h.x + h.w / 2
    const hcy = h.y + h.h / 2
    // Radius field — dashed ring.
    g.circle(hcx, hcy, h.radius)
      .stroke({ width: 1, color: COLOR_COLD, alpha: 0.12 })
    // Body — soft bell.
    g.circle(hcx, hcy, h.w / 2)
      .fill({ color: flash ? COLOR_FLASH : 0x3A3050, alpha: 0.8 })
      .stroke({ width: 1, color: COLOR_COLD, alpha: 0.7 })
    // Tendrils — faint trailing lines.
    for (let i = -2; i <= 2; i++) {
      const tx = hcx + i * 2
      const ty = hcy + h.h / 2
      const pulse = 3 + Math.sin(time * 2 + i) * 2
      g.moveTo(tx, ty).lineTo(tx, ty + pulse)
        .stroke({ width: 1, color: COLOR_COLD, alpha: 0.5 })
    }
    drawHpPip(g, h.x, h.y, h.w, h)
  }

  // ─── Candlewicks ─────────────────────────────────────────
  for (const c of state.candlewicks as Candlewick[]) {
    if (!c.alive)
      continue
    const flash = c.hitFlashTimer > 0
    g.rect(c.x, c.y, c.w, c.h).fill({ color: flash ? COLOR_FLASH : 0x2E2218, alpha: 0.9 })
      .stroke({ width: 1, color: COLOR_EDGE, alpha: 0.8 })
    // Lantern glow above.
    const gx = c.x + c.w / 2
    const gy = c.y - 2
    const flicker = 0.6 + Math.sin(time * 9) * 0.25 + Math.random() * 0.1
    g.circle(gx, gy, 5).fill({ color: COLOR_WARM, alpha: 0.25 * flicker })
    g.circle(gx, gy, 2).fill({ color: 0xFFD48C, alpha: flicker })
  }

  // ─── Pendulum Knight ─────────────────────────────────────
  for (const k of state.knights as PendulumKnight[]) {
    if (!k.alive)
      continue
    const flash = k.hitFlashTimer > 0
    const w = 1.0 // windupMult is internal; draw progress relative to configured values
    // Draw via phase inspection.
    const phase = k.phase
    const knightW = 1.2 // windup base
    const knightA = 0.35 // active base
    const inWindup = phase < knightW * w
    const inSwing = phase >= knightW * w && phase < knightW * w + knightA
    // Body.
    const col = flash ? COLOR_FLASH : (inSwing ? COLOR_HOT : (inWindup ? COLOR_WARM : 0x20242E))
    g.rect(k.x, k.y, k.w, k.h).fill({ color: col, alpha: 0.95 })
      .stroke({ width: 1, color: 0xE0D8C8, alpha: 0.8 })
    // Helmet slit.
    g.rect(k.x + 2, k.y + 4, k.w - 4, 1).fill({ color: 0xFFC060, alpha: 0.7 })
    // Arc telegraph.
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
      // Safe center ring.
      g.circle(kcx, kcy, 24).stroke({ width: 1, color: COLOR_COLD, alpha: 0.7 })
    }
    // Direction indicator.
    const arrowX = kcx + k.facing * (k.w / 2 + 4)
    g.rect(arrowX - 1, kcy - 1, 3, 2).fill({ color: COLOR_HOT, alpha: 0.9 })
  }

  // ─── Bloomrot ────────────────────────────────────────────
  for (const b of state.blooms as Bloomrot[]) {
    if (!b.alive)
      continue
    const flash = b.hitFlashTimer > 0
    const bcx = b.x + b.w / 2
    const bcy = b.y + b.h / 2
    const breath = 1 + Math.sin(b.pulse) * 0.08
    // Mass body.
    g.ellipse(bcx, bcy, (b.w / 2) * breath, (b.h / 2) * breath)
      .fill({ color: flash ? COLOR_FLASH : 0x4A2F50, alpha: 0.9 })
      .stroke({ width: 1, color: 0xC090B0, alpha: 0.7 })
    // Spore ring (active during burst).
    if (b.burstTimer > 0) {
      const frac = 1 - b.burstTimer / 0.5
      const radius = 46 * (0.4 + frac * 0.6)
      g.circle(bcx, bcy, radius)
        .stroke({ width: 2, color: COLOR_HOT, alpha: 1 - frac })
    }
    drawHpPip(g, b.x, b.y, b.w, b)
  }

  // ─── Echoes ──────────────────────────────────────────────
  for (const e of state.echoes as Echo[]) {
    if (!e.alive)
      continue
    const adapt = e.adaptFlashTimer > 0
    const flash = e.hitFlashTimer > 0
    // Body — translucent, flickering.
    const alpha = 0.45 + Math.sin(e.hoverPhase * 3) * 0.12
    const col = flash ? COLOR_FLASH : (adapt ? COLOR_COLD : 0xE0D8C8)
    g.rect(e.x, e.y, e.w, e.h).fill({ color: col, alpha })
    // Inner cold glow.
    g.rect(e.x + 2, e.y + 2, e.w - 4, e.h - 4)
      .stroke({ width: 1, color: COLOR_COLD, alpha: 0.6 })
    // Memory dot — colored by currently-memorized weapon.
    if (e.lastWeapon) {
      const dotCol = e.lastWeapon === 'slug' ? 0xFFD48C : 0xFF6040
      g.circle(e.x + e.w / 2, e.y - 4, 1.5).fill({ color: dotCol })
    }
    drawHpPip(g, e.x, e.y, e.w, e)
  }

  // ─── Husk Crows ──────────────────────────────────────────
  const crows = state.crows as HuskCrow[]
  for (let i = 0; i < crows.length; i++) {
    const c = crows[i]
    if (!c || !c.alive)
      continue
    // Chain wire to link partner.
    if (c.linkIdx >= 0 && c.linkIdx < crows.length) {
      const o = crows[c.linkIdx]
      if (o && o.alive) {
        const ax = c.x + c.w / 2
        const ay = c.y + c.h / 2
        const bx = o.x + o.w / 2
        const by = o.y + o.h / 2
        g.moveTo(ax, ay).lineTo(bx, by)
          .stroke({ width: 3, color: 0x202632, alpha: 0.7 })
        g.moveTo(ax, ay).lineTo(bx, by)
          .stroke({ width: 1, color: COLOR_OXBLOOD, alpha: 0.9 })
      }
    }
  }
  for (const c of crows) {
    if (!c.alive)
      continue
    const flash = c.hitFlashTimer > 0
    const bob = Math.sin(c.bobPhase) * 1
    g.rect(c.x, c.y + bob, c.w, c.h)
      .fill({ color: flash ? COLOR_FLASH : 0x101418, alpha: 0.95 })
    // Beak.
    g.rect(c.x + c.w, c.y + c.h / 2 + bob, 2, 1).fill({ color: COLOR_OXBLOOD })
  }

  // ─── Cartographer ────────────────────────────────────────
  for (const c of state.carts as Cartographer[]) {
    if (!c.alive)
      continue
    const flash = c.hitFlashTimer > 0
    // Hooded body.
    g.rect(c.x, c.y + 2, c.w, c.h - 2)
      .fill({ color: flash ? COLOR_FLASH : 0x2A1818, alpha: 0.9 })
      .stroke({ width: 1, color: COLOR_EDGE, alpha: 0.9 })
    // Cowl.
    g.rect(c.x - 1, c.y, c.w + 2, 4).fill({ color: 0x181010, alpha: 0.95 })
    // Quill — thin stroke in facing direction.
    const qx = c.facing === 1 ? c.x + c.w + 1 : c.x - 4
    g.rect(qx, c.y + c.h / 2, 3, 1).fill({ color: COLOR_BONE, alpha: 0.8 })
    drawHpPip(g, c.x, c.y, c.w, c)
  }

  // ─── Mimic Shrine ────────────────────────────────────────
  for (const m of state.shrines as MimicShrine[]) {
    if (!m.alive)
      continue
    const flash = m.hitFlashTimer > 0
    // Shrine base — bone-colored, like a real checkpoint at first glance.
    g.rect(m.x, m.y, m.w, m.h)
      .fill({ color: flash ? COLOR_FLASH : 0x605040, alpha: 0.9 })
      .stroke({ width: 1, color: COLOR_BONE, alpha: 0.9 })
    // Flame — runs cold-red instead of warm; flickers the "wrong way"
    // (tilted left-right on an irregular beat).
    const fx0 = m.x + m.w / 2 + Math.sin(m.flickerPhase * 3) * 2
    const fy0 = m.y - 3
    g.circle(fx0, fy0, 2).fill({ color: COLOR_HOT, alpha: 0.9 })
    g.circle(fx0, fy0, 4).fill({ color: COLOR_HOT, alpha: 0.2 })
    // Pedestal groove.
    g.rect(m.x + 2, m.y + 4, m.w - 4, 1).fill({ color: COLOR_EDGE, alpha: 0.8 })
    drawHpPip(g, m.x, m.y, m.w, m)
  }

  // ─── Pilgrim ─────────────────────────────────────────────
  for (const p of state.pilgrims as Pilgrim[]) {
    if (!p.alive)
      continue
    const flash = p.hitFlashTimer > 0
    // Robe body.
    g.rect(p.x, p.y + 3, p.w, p.h - 3)
      .fill({ color: flash ? COLOR_FLASH : 0x2A2A38, alpha: 0.95 })
      .stroke({ width: 1, color: COLOR_EDGE, alpha: 0.9 })
    // Hood.
    g.rect(p.x - 1, p.y, p.w + 2, 5).fill({ color: 0x101018, alpha: 0.95 })
    // Face cavity — cold glow where the face would be.
    g.rect(p.x + p.w / 2 - 1, p.y + 1, 2, 1).fill({ color: COLOR_COLD, alpha: 0.8 })
    drawHpPip(g, p.x, p.y, p.w, p)
  }

  // ─── Dark overlay tint ────────────────────────────────────
  // When a Candlewick has dropped its lantern, a faint vignette-ish tint
  // darkens the scene. Keep subtle — the CRT filter carries most mood.
  if (dark) {
    // No-op here — the shared CRT shader handles global mood.
  }
}
