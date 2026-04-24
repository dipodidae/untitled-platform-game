// Damage vignette — Pixi sprite with a pre-baked radial-gradient red glow,
// alpha-tweened by GSAP on hit/death. Lives inside the screen-overlay
// container so the CRT filter runs over it (chromatic aberration on the
// red edge tint sells the "wound" feel even more).
//
// Base alpha follows HP: max(0, 1 - hp/maxHp) * 0.25. Pulses on `hitLanded`.

import type { Container as PixiContainer } from 'pixi.js'
import { gsap } from 'gsap'
import { Sprite, Texture } from 'pixi.js'
import { CONFIG } from '../config'
import { on } from '../session/eventBus'

const W = CONFIG.LOGICAL_WIDTH
const H = CONFIG.LOGICAL_HEIGHT

// Build the gradient texture once and cache it. Authored at logical
// resolution so the CRT scanlines step through it cleanly.
let gradientTex: Texture | null = null
function getGradientTexture(): Texture {
  if (gradientTex)
    return gradientTex
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  // Slightly elliptical to feel framed rather than cinematic-circle.
  const cx = W / 2
  const cy = H / 2
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6)
  grad.addColorStop(0.45, 'rgba(0,0,0,0)')
  grad.addColorStop(0.78, 'rgba(180, 30, 20, 0.45)')
  grad.addColorStop(1.0, 'rgba(220, 30, 20, 1.0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)
  gradientTex = Texture.from({ resource: c })
  return gradientTex
}

export function mountDamageVignette(parent: PixiContainer, getHpFraction: () => number): () => void {
  const sprite = new Sprite(getGradientTexture())
  sprite.width = W
  sprite.height = H
  sprite.alpha = 0
  parent.addChild(sprite)

  // Baseline opacity follows HP. Slow ticker so it doesn't fight pulses.
  const baselineTick = window.setInterval(() => {
    const hp = Math.max(0, Math.min(1, getHpFraction()))
    const target = (1 - hp) * 0.25
    if (sprite.alpha < target + 0.02)
      sprite.alpha = target
  }, 120)

  function pulse(intensity: number): void {
    gsap.killTweensOf(sprite)
    const peak = Math.min(0.85, 0.35 + intensity * 0.15)
    gsap.to(sprite, {
      alpha: peak,
      duration: 0.08,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(sprite, {
          alpha: Math.max(0, (1 - getHpFraction()) * 0.25),
          duration: 0.55,
          ease: 'power2.out',
        })
      },
    })
  }

  const offHit = on('hitLanded', (e) => {
    if (e.target === 'player')
      pulse(e.damage)
  })
  const offDied = on('playerDied', () => pulse(3))
  const offLoaded = on('levelLoaded', () => {
    gsap.killTweensOf(sprite)
    sprite.alpha = 0
  })

  return () => {
    window.clearInterval(baselineTick)
    offHit()
    offDied()
    offLoaded()
    gsap.killTweensOf(sprite)
    sprite.destroy()
  }
}
