// Classic-inspired enemy renderer. One Graphics, crude rect style.

import type { Graphics } from 'pixi.js'
import type { ClassicsState } from '../enemies/classics'
import { mantisIsVulnerable } from '../enemies/classics'

const COLOR_BONE = 0xC8B89A
const COLOR_OXBLOOD = 0x8A2A1C
const COLOR_COLD = 0x4060C0
const COLOR_WARM = 0xC8A020
const COLOR_HOT = 0xCC2020
const COLOR_EDGE = 0x202632
const COLOR_FLASH = 0xFF4A4A

interface Hp { hp: number, maxHp: number }

function pip(g: Graphics, x: number, y: number, w: number, hp: Hp, col = COLOR_OXBLOOD): void {
  if (hp.maxHp <= 0)
    return
  const r = hp.hp / hp.maxHp
  if (r >= 1 || r <= 0)
    return
  const pw = Math.max(2, w - 2)
  g.rect(x + 1, y - 3, pw, 1).fill({ color: 0x1A1A20, alpha: 0.8 })
  g.rect(x + 1, y - 3, pw * r, 1).fill({ color: col })
}

export function drawClassics(g: Graphics, s: ClassicsState, time: number): void {
  g.clear()

  // ─── Medusa Heads ────────────────────────────────────────
  for (const m of s.medusas) {
    if (!m.alive)
      continue
    const flash = m.hitFlashTimer > 0
    g.ellipse(m.x + m.w / 2, m.y + m.h / 2, m.w / 2, m.h / 2)
      .fill({ color: flash ? COLOR_FLASH : 0x3A2A1A, alpha: 0.95 })
      .stroke({ width: 1, color: COLOR_BONE, alpha: 0.8 })
    // Snakes — little stroke frills.
    for (let i = 0; i < 3; i++) {
      const a = time * 3 + i
      const sx = m.x + m.w / 2 + Math.cos(a) * (m.w / 2 + 2)
      const sy = m.y + m.h / 2 + Math.sin(a) * (m.h / 2 + 2)
      g.rect(sx - 1, sy - 1, 2, 2).fill({ color: COLOR_OXBLOOD, alpha: 0.9 })
    }
    pip(g, m.x, m.y, m.w, m)
  }

  // ─── Buzzy Beetles ───────────────────────────────────────
  for (const b of s.beetles) {
    if (!b.alive)
      continue
    const flash = b.hitFlashTimer > 0
    g.rect(b.x, b.y, b.w, b.h)
      .fill({ color: flash ? COLOR_FLASH : 0x1A2838, alpha: 0.95 })
      .stroke({ width: 1, color: COLOR_COLD, alpha: 0.8 })
    // Shell sheen.
    g.rect(b.x + 2, b.y + 2, b.w - 4, 2).fill({ color: 0x4060C0, alpha: 0.5 })
    pip(g, b.x, b.y, b.w, b)
  }

  // ─── Boos ────────────────────────────────────────────────
  for (const b of s.boos) {
    if (!b.alive)
      continue
    const flash = b.hitFlashTimer > 0
    const alpha = b.hiding ? 0.35 : 0.9
    g.circle(b.x + b.w / 2, b.y + b.h / 2, b.w / 2)
      .fill({ color: flash ? COLOR_FLASH : 0xE0D8C8, alpha })
    if (!b.hiding) {
      // Eyes — cold dots.
      g.circle(b.x + 4, b.y + 5, 1).fill({ color: COLOR_EDGE })
      g.circle(b.x + b.w - 4, b.y + 5, 1).fill({ color: COLOR_EDGE })
    }
    else {
      // Hands over face — two arcs.
      g.rect(b.x + 2, b.y + 4, b.w - 4, 2).fill({ color: 0xB8A88A, alpha: 0.9 })
    }
    pip(g, b.x, b.y, b.w, b)
  }

  // ─── Wallmasters ─────────────────────────────────────────
  for (const w of s.wallmasters) {
    if (!w.alive)
      continue
    const flash = w.hitFlashTimer > 0
    // Tether line back to ceiling.
    g.moveTo(w.x + w.w / 2, w.ceilingY).lineTo(w.x + w.w / 2, w.y)
      .stroke({ width: 1, color: COLOR_EDGE, alpha: 0.7 })
    // Hand body.
    g.rect(w.x, w.y, w.w, w.h)
      .fill({ color: flash ? COLOR_FLASH : 0x2A1818, alpha: 0.95 })
      .stroke({ width: 1, color: COLOR_BONE, alpha: 0.7 })
    // Fingers.
    for (let i = 0; i < 4; i++) {
      const fx = w.x + 2 + i * 4
      g.rect(fx, w.y + w.h, 2, 3).fill({ color: 0x2A1818 })
    }
    pip(g, w.x, w.y, w.w, w)
  }

  // ─── Stalkers (Nosk-likes) ──────────────────────────────
  for (const st of s.stalkers) {
    if (!st.alive)
      continue
    const flash = st.hitFlashTimer > 0
    g.rect(st.x, st.y, st.w, st.h)
      .fill({ color: flash ? COLOR_FLASH : 0x181018, alpha: 0.95 })
      .stroke({ width: 1, color: COLOR_OXBLOOD, alpha: 0.9 })
    // Baleful glow.
    g.rect(st.x + 4, st.y + 5, 3, 2).fill({ color: COLOR_HOT, alpha: 0.9 })
    g.rect(st.x + st.w - 7, st.y + 5, 3, 2).fill({ color: COLOR_HOT, alpha: 0.9 })
    pip(g, st.x, st.y, st.w, st)
  }

  // ─── Eggplant Wizards ───────────────────────────────────
  for (const w of s.wizards) {
    if (!w.alive)
      continue
    const flash = w.hitFlashTimer > 0
    g.rect(w.x, w.y + 6, w.w, w.h - 6)
      .fill({ color: flash ? COLOR_FLASH : 0x4A2A60, alpha: 0.9 })
      .stroke({ width: 1, color: 0xC090B0, alpha: 0.8 })
    // Pointy hat.
    g.poly([w.x - 2, w.y + 6, w.x + w.w + 2, w.y + 6, w.x + w.w / 2, w.y - 2])
      .fill({ color: 0x2A1840, alpha: 0.95 })
    pip(g, w.x, w.y, w.w, w)
  }

  // ─── Garpedes ────────────────────────────────────────────
  for (const gp of s.garpedes) {
    if (gp.phase !== 'run')
      continue
    // Segmented body.
    for (let i = 0; i < 4; i++) {
      g.rect(gp.x - i * 6, gp.y, 5, gp.h)
        .fill({ color: i === 0 ? COLOR_HOT : 0x3A2020, alpha: 1 - i * 0.15 })
        .stroke({ width: 1, color: COLOR_EDGE, alpha: 0.7 })
    }
  }

  // ─── Iron Knuckles ───────────────────────────────────────
  for (const k of s.ironKnuckles) {
    if (!k.alive)
      continue
    const flash = k.hitFlashTimer > 0
    const block = k.blockFlashTimer > 0
    g.rect(k.x, k.y, k.w, k.h)
      .fill({ color: flash ? COLOR_FLASH : 0x304050, alpha: 0.95 })
      .stroke({ width: 1, color: block ? COLOR_COLD : COLOR_BONE, alpha: 0.9 })
    // Shield on facing side.
    const shieldX = k.facing === 1 ? k.x + k.w : k.x - 2
    g.rect(shieldX, k.y + 4, 2, k.h - 8)
      .fill({ color: block ? COLOR_COLD : COLOR_BONE, alpha: 1 })
    pip(g, k.x, k.y, k.w, k)
  }

  // ─── Cagneys ─────────────────────────────────────────────
  for (const c of s.cagneys) {
    if (!c.alive)
      continue
    const flash = c.hitFlashTimer > 0
    g.ellipse(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2)
      .fill({ color: flash ? COLOR_FLASH : 0x2A4A30, alpha: 0.95 })
      .stroke({ width: 1, color: 0xC0A040, alpha: 0.8 })
    // Petals around the face.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + time * 0.3
      const px = c.x + c.w / 2 + Math.cos(a) * (c.w / 2 + 3)
      const py = c.y + c.h / 2 + Math.sin(a) * (c.h / 2 + 3)
      g.circle(px, py, 2).fill({ color: COLOR_WARM, alpha: 0.9 })
    }
    pip(g, c.x, c.y, c.w, c)
  }

  // ─── Dry Bones ───────────────────────────────────────────
  for (const d of s.dryBones) {
    if (!d.alive) {
      // Dormant pile — small bone chunks on the ground.
      g.rect(d.x, d.y + d.h - 3, d.w, 3).fill({ color: COLOR_BONE, alpha: 0.7 })
      continue
    }
    const flash = d.hitFlashTimer > 0
    g.rect(d.x, d.y, d.w, d.h)
      .fill({ color: flash ? COLOR_FLASH : COLOR_BONE, alpha: 0.95 })
      .stroke({ width: 1, color: COLOR_EDGE, alpha: 0.9 })
    // Eye sockets.
    g.rect(d.x + 3, d.y + 4, 2, 2).fill({ color: COLOR_EDGE })
    g.rect(d.x + d.w - 5, d.y + 4, 2, 2).fill({ color: COLOR_EDGE })
    pip(g, d.x, d.y, d.w, d)
  }

  // ─── Planteras ──────────────────────────────────────────
  for (const p of s.planteras) {
    if (!p.alive)
      continue
    const flash = p.hitFlashTimer > 0
    // Leash ring.
    g.circle(p.x + p.w / 2, p.y + p.h / 2, p.leash)
      .stroke({ width: 1, color: p.enraged ? COLOR_HOT : COLOR_COLD, alpha: 0.15 })
    g.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, p.h / 2)
      .fill({ color: flash ? COLOR_FLASH : (p.enraged ? 0x6A1A20 : 0x3A1830), alpha: 0.95 })
      .stroke({ width: 1, color: 0xC040A0, alpha: 0.9 })
    pip(g, p.x, p.y, p.w, p)
  }

  // ─── Hammer Bros ────────────────────────────────────────
  for (const b of s.hammerBros) {
    if (!b.alive)
      continue
    const flash = b.hitFlashTimer > 0
    g.rect(b.x, b.y, b.w, b.h)
      .fill({ color: flash ? COLOR_FLASH : 0x304030, alpha: 0.95 })
      .stroke({ width: 1, color: COLOR_BONE, alpha: 0.9 })
    // Helmet crest.
    g.rect(b.x - 1, b.y - 2, b.w + 2, 3).fill({ color: 0x504030 })
    pip(g, b.x, b.y, b.w, b)
  }

  // ─── Mantis Lords ───────────────────────────────────────
  for (const m of s.mantisLords) {
    if (!m.alive)
      continue
    const flash = m.hitFlashTimer > 0
    const vuln = mantisIsVulnerable(m)
    g.rect(m.x, m.y, m.w, m.h)
      .fill({ color: flash ? COLOR_FLASH : (vuln ? 0x404060 : 0x20242E), alpha: 0.95 })
      .stroke({ width: 1, color: vuln ? COLOR_COLD : COLOR_BONE, alpha: 0.9 })
    // Blade arms.
    g.rect(m.x - 3, m.y + 6, 3, m.h - 12).fill({ color: COLOR_BONE, alpha: 0.9 })
    g.rect(m.x + m.w, m.y + 6, 3, m.h - 12).fill({ color: COLOR_BONE, alpha: 0.9 })
    pip(g, m.x, m.y, m.w, m)
  }

  // ─── Shared projectiles ─────────────────────────────────
  for (const p of s.projectiles) {
    if (!p.alive)
      continue
    const col = p.type === 'wizard'
      ? 0xC090B0
      : p.type === 'plantera'
        ? 0xC0408C
        : p.type === 'hammer'
          ? 0x605040
          : 0xFFD48C // cagney
    g.circle(p.x, p.y, 3).fill({ color: col, alpha: 0.95 })
    g.circle(p.x, p.y, 2).fill({ color: 0xFFFFFF, alpha: 0.25 })
  }

  // ─── Shoot-disabled overlay cue ─────────────────────────
  // Render subtle "?" bracket near the player-readable HUD? Skip — the
  // missing crosshair + muzzle effect is felt, not drawn.
}
