// Classic-inspired enemy renderer. Sprite textures for enemy bodies,
// Graphics overlay for HP pips, telegraphs, and projectiles.

import type { Container, Graphics } from 'pixi.js'
import type { ClassicsState } from '../enemies/classics'
import type { EnemySpritePool } from './enemySpritePool'
import { Assets, Sprite, Texture } from 'pixi.js'
import { mantisIsVulnerable } from '../enemies/classics'
import { hideExcessSprites, positionEnemySprite } from './enemySpritePool'

// Hammer projectile texture — loaded lazily on first use.
let hammerTex: Texture | null = null
let hammerTexLoading = false

function ensureHammerTex(): void {
  if (hammerTex || hammerTexLoading)
    return
  hammerTexLoading = true
  Assets.load<Texture>('/assets/projectiles/hammer.png').then((t) => {
    hammerTex = t
  }).catch(() => { /* no sprite — will fall back to circle */ })
}

const COLOR_BONE = 0xC8B89A
const COLOR_OXBLOOD = 0x8A2A1C
const COLOR_COLD = 0x4060C0
const COLOR_WARM = 0xC8A020
const COLOR_HOT = 0xCC2020
const COLOR_EDGE = 0x202632

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

export function drawClassics(
  g: Graphics,
  s: ClassicsState,
  time: number,
  pool: EnemySpritePool,
  projContainer: Container,
  projSprites: Sprite[],
): void {
  g.clear()
  let si = 0 // sprite index counter across all classic kinds

  // ─── Medusa Heads ────────────────────────────────────────
  for (const m of s.medusas) {
    positionEnemySprite(pool, si, 'medusa', m.x, m.y, m.w, m.h, m.alive, m.hitFlashTimer > 0, 0.95, m.facing === -1, time, si)
    si++
    if (!m.alive)
      continue
    pip(g, m.x, m.y, m.w, m)
  }

  // ─── Buzzy Beetles ───────────────────────────────────────
  for (const b of s.beetles) {
    positionEnemySprite(pool, si, 'beetle', b.x, b.y, b.w, b.h, b.alive, b.hitFlashTimer > 0, 0.95, b.facing === -1, time, si)
    si++
    if (!b.alive)
      continue
    pip(g, b.x, b.y, b.w, b)
  }

  // ─── Boos ────────────────────────────────────────────────
  for (const b of s.boos) {
    const alpha = b.hiding ? 0.35 : 0.9
    positionEnemySprite(pool, si, 'boo', b.x, b.y, b.w, b.h, b.alive, b.hitFlashTimer > 0, alpha, b.facing === -1, time, si)
    si++
    if (!b.alive)
      continue
    pip(g, b.x, b.y, b.w, b)
  }

  // ─── Wallmasters ─────────────────────────────────────────
  for (const w of s.wallmasters) {
    positionEnemySprite(pool, si, 'wallmaster', w.x, w.y, w.w, w.h, w.alive, w.hitFlashTimer > 0, 1, false, time, si)
    si++
    if (!w.alive)
      continue
    // Tether line back to ceiling.
    g.moveTo(w.x + w.w / 2, w.ceilingY).lineTo(w.x + w.w / 2, w.y).stroke({ width: 1, color: COLOR_EDGE, alpha: 0.7 })
    pip(g, w.x, w.y, w.w, w)
  }

  // ─── Stalkers (Nosk-likes) ──────────────────────────────
  for (const st of s.stalkers) {
    positionEnemySprite(pool, si, 'stalker', st.x, st.y, st.w, st.h, st.alive, st.hitFlashTimer > 0, 1, st.facing === -1, time, si)
    si++
    if (!st.alive)
      continue
    pip(g, st.x, st.y, st.w, st)
  }

  // ─── Eggplant Wizards ───────────────────────────────────
  for (const w of s.wizards) {
    positionEnemySprite(pool, si, 'wizard', w.x, w.y, w.w, w.h, w.alive, w.hitFlashTimer > 0, 1, w.facing === -1, time, si)
    si++
    if (!w.alive)
      continue
    pip(g, w.x, w.y, w.w, w)
  }

  // ─── Garpedes ────────────────────────────────────────────
  for (const gp of s.garpedes) {
    const running = gp.phase === 'run'
    positionEnemySprite(pool, si, 'garpede', gp.x, gp.y, gp.w, gp.h, running, false, 1, gp.facing === -1, time, si)
    si++
  }

  // ─── Iron Knuckles ───────────────────────────────────────
  for (const k of s.ironKnuckles) {
    positionEnemySprite(pool, si, 'ironknuckle', k.x, k.y, k.w, k.h, k.alive, k.hitFlashTimer > 0, 0.95, k.facing === -1, time, si)
    si++
    if (!k.alive)
      continue
    // Block flash indicator.
    if (k.blockFlashTimer > 0) {
      const shieldX = k.facing === 1 ? k.x + k.w : k.x - 2
      g.rect(shieldX, k.y + 4, 2, k.h - 8)
        .fill({ color: COLOR_COLD, alpha: 1 })
    }
    pip(g, k.x, k.y, k.w, k)
  }

  // ─── Cagneys ─────────────────────────────────────────────
  for (const c of s.cagneys) {
    positionEnemySprite(pool, si, 'cagney', c.x, c.y, c.w, c.h, c.alive, c.hitFlashTimer > 0, 1, false, time, si)
    si++
    if (!c.alive)
      continue
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
    positionEnemySprite(pool, si, 'drybones', d.x, d.y, d.w, d.h, d.alive, d.hitFlashTimer > 0, d.alive ? 0.95 : 0.5, d.facing === -1, time, si)
    si++
    if (!d.alive) {
      // Dormant pile — small bone chunks on the ground.
      g.rect(d.x, d.y + d.h - 3, d.w, 3).fill({ color: COLOR_BONE, alpha: 0.7 })
      continue
    }
    pip(g, d.x, d.y, d.w, d)
  }

  // ─── Planteras ──────────────────────────────────────────
  for (const p of s.planteras) {
    positionEnemySprite(pool, si, 'plantera', p.x, p.y, p.w, p.h, p.alive, p.hitFlashTimer > 0, 1, p.facing === -1, time, si)
    si++
    if (!p.alive)
      continue
    // Leash ring.
    g.circle(p.x + p.w / 2, p.y + p.h / 2, p.leash)
      .stroke({ width: 1, color: p.enraged ? COLOR_HOT : COLOR_COLD, alpha: 0.15 })
    pip(g, p.x, p.y, p.w, p)
  }

  // ─── Hammer Bros ────────────────────────────────────────
  for (const b of s.hammerBros) {
    positionEnemySprite(pool, si, 'hammerbro', b.x, b.y, b.w, b.h, b.alive, b.hitFlashTimer > 0, 0.95, b.facing === -1, time, si)
    si++
    if (!b.alive)
      continue
    // Charge glow — growing warm ring behind the bro
    if (b.charging && b.chargeDuration > 0) {
      const t = Math.min(1, b.chargeTimer / b.chargeDuration)
      const radius = 6 + t * 14
      const alpha = 0.15 + t * 0.45
      const cx = b.x + b.w / 2
      const cy = b.y + b.h / 2
      g.circle(cx, cy, radius)
        .fill({ color: 0xFFA040, alpha: alpha * 0.3 })
      g.circle(cx, cy, radius * 0.6)
        .fill({ color: 0xFFD080, alpha: alpha * 0.5 })
    }
    pip(g, b.x, b.y, b.w, b)
  }

  // ─── Mantis Lords ───────────────────────────────────────
  for (const m of s.mantisLords) {
    const vuln = mantisIsVulnerable(m)
    positionEnemySprite(pool, si, 'mantislord', m.x, m.y, m.w, m.h, m.alive, m.hitFlashTimer > 0, vuln ? 0.8 : 0.95, m.facing === -1, time, si)
    si++
    if (!m.alive)
      continue
    // Vulnerable glow outline.
    if (vuln) {
      g.rect(m.x - 1, m.y - 1, m.w + 2, m.h + 2)
        .stroke({ width: 1, color: COLOR_COLD, alpha: 0.5 })
    }
    pip(g, m.x, m.y, m.w, m)
  }

  hideExcessSprites(pool, si)

  // ─── Shared projectiles ─────────────────────────────
  ensureHammerTex()
  let hammerIdx = 0
  for (const p of s.projectiles) {
    if (!p.alive)
      continue
    if (p.type === 'hammer' && hammerTex) {
      // Render as a spinning sprite.
      while (projSprites.length <= hammerIdx) {
        const sp = new Sprite({ texture: Texture.EMPTY })
        sp.anchor.set(0.5)
        projContainer.addChild(sp)
        projSprites.push(sp)
      }
      const sp = projSprites[hammerIdx]!
      sp.texture = hammerTex
      sp.x = p.x
      sp.y = p.y
      sp.rotation = p.rotation
      sp.scale.set(16 / hammerTex.width)
      sp.visible = true
      hammerIdx++
    }
    else {
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
  }
  for (let i = hammerIdx; i < projSprites.length; i++)
    projSprites[i]!.visible = false
}
