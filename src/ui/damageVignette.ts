// Damage vignette — red-edge CSS overlay that pulses when the player is
// hurt. Intensity scales with how low the player's HP is; the pulse comes
// from the hitLanded event. All GSAP-driven; no Pixi filter cost.
//
// Base alpha = max(0, 1 - hp/maxHp) * 0.25, so at low HP the edges stay
// visibly tinted even between hits.

import { gsap } from 'gsap'
import { on } from '../session/eventBus'

interface VignetteBinding {
  el: HTMLElement
  getHpFraction: () => number // 0..1
}

export function mountDamageVignette(getHpFraction: () => number): () => void {
  const el = document.createElement('div')
  el.className = 'damage-vignette'
  el.style.opacity = '0'
  document.body.appendChild(el)

  const binding: VignetteBinding = { el, getHpFraction }

  // Baseline opacity follows HP. Updated on a slow ticker so it doesn't
  // fight the pulse animation.
  let baselineTick: number | null = null
  function pumpBaseline(): void {
    const hp = Math.max(0, Math.min(1, binding.getHpFraction()))
    const target = (1 - hp) * 0.25
    // If we're mid-pulse (opacity > baseline), don't fight it.
    const current = Number.parseFloat(binding.el.style.opacity || '0')
    if (current < target + 0.02)
      binding.el.style.opacity = String(target)
  }
  baselineTick = window.setInterval(pumpBaseline, 120)

  function pulse(intensity: number): void {
    gsap.killTweensOf(binding.el)
    const peak = Math.min(0.85, 0.35 + intensity * 0.15)
    gsap.to(binding.el, {
      opacity: peak,
      duration: 0.08,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(binding.el, {
          opacity: Math.max(0, (1 - binding.getHpFraction()) * 0.25),
          duration: 0.55,
          ease: 'power2.out',
        })
      },
    })
  }

  const offHit = on('hitLanded', (e) => {
    if (e.target === 'player') pulse(e.damage)
  })
  const offDied = on('playerDied', () => pulse(3))
  const offLoaded = on('levelLoaded', () => {
    gsap.killTweensOf(binding.el)
    binding.el.style.opacity = '0'
  })

  return () => {
    if (baselineTick != null) window.clearInterval(baselineTick)
    offHit()
    offDied()
    offLoaded()
    gsap.killTweensOf(binding.el)
    binding.el.remove()
  }
}
