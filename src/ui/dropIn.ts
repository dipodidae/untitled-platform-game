// Cinematic level drop-in — Pixi-rendered into the screen-overlay container
// so the CRT filter on the stage chromatic-aberrates the title card the same
// way it does the world. Black fade, letterbox, slow-mo, then control hands
// off via the `dropInComplete` event.
//
// Timing (≈2.4s):
//   0.00 — black opaque, card fades in, letterbox bars extended (12% each)
//   1.40 — black fade-out, card fade-out
//   1.60 — letterbox bars retract
//   2.30 — emit 'dropInComplete'

import type { Application, Container as PixiContainer } from 'pixi.js'
import { gsap } from 'gsap'
import { Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../config'
import { emit } from '../session/eventBus'
import { levelName } from '../session/levelManager'

export interface DropInOptions {
  levelId: string
  subtitle?: string
}

const SUBTITLES: Record<string, string> = {
  level1: 'the world does not forgive',
  level2: 'what you break stays broken',
}

const COLOR_BONE = 0xE0D8C8
const COLOR_BONE_DIM = 0x8A8478
const COLOR_OXBLOOD = 0xCC2020

const W = CONFIG.LOGICAL_WIDTH
const H = CONFIG.LOGICAL_HEIGHT
const BAR_H = Math.round(H * 0.12) // letterbox bar thickness

function pickSubtitle(levelId: string, override: string | undefined): string {
  return override ?? SUBTITLES[levelId] ?? 'hold nothing back'
}

export function playDropIn(app: Application, parent: PixiContainer, opts: DropInOptions): void {
  // Successive drop-ins shouldn't stack — strip any prior overlay first.
  for (const child of parent.children.slice()) {
    if ((child as Container).label === 'dropin')
      child.destroy({ children: true })
  }

  const root = new Container()
  root.label = 'dropin'
  parent.addChild(root)

  // Solid black field that fades to transparent.
  const fade = new Graphics()
  fade.rect(0, 0, W, H).fill({ color: 0x000000 })
  root.addChild(fade)

  // Letterbox bars — drawn LAST, so they sit above the card during the
  // retract beat too (looks deliberate).
  // Card sits between fade and bars.
  const card = new Container()
  card.alpha = 0
  root.addChild(card)

  const eyebrow = new Text({
    text: 'ENTERING',
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: COLOR_OXBLOOD,
      letterSpacing: 5,
      fontWeight: '700' as const,
    },
    resolution: 1,
  })
  eyebrow.anchor.set(0.5)
  eyebrow.x = W / 2
  eyebrow.y = H / 2 - 24
  card.addChild(eyebrow)

  const title = new Text({
    text: levelName(opts.levelId).toUpperCase(),
    style: {
      fontFamily: 'monospace',
      fontSize: 28,
      fill: COLOR_BONE,
      letterSpacing: 6,
      fontWeight: '700' as const,
    },
    resolution: 1,
  })
  title.anchor.set(0.5)
  title.x = W / 2
  title.y = H / 2
  card.addChild(title)

  // Hard underline bar
  const bar = new Graphics()
  bar.rect(W / 2 - 80, H / 2 + 14, 160, 1).fill({ color: COLOR_OXBLOOD, alpha: 0.7 })
  card.addChild(bar)

  const subtitle = new Text({
    text: pickSubtitle(opts.levelId, opts.subtitle),
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: COLOR_BONE_DIM,
      letterSpacing: 4,
    },
    resolution: 1,
  })
  subtitle.anchor.set(0.5)
  subtitle.x = W / 2
  subtitle.y = H / 2 + 28
  card.addChild(subtitle)

  // Letterbox bars on top of everything.
  const topBar = new Graphics()
  topBar.rect(0, 0, W, BAR_H).fill({ color: 0x000000 })
  root.addChild(topBar)

  const botBar = new Graphics()
  botBar.rect(0, H - BAR_H, W, BAR_H).fill({ color: 0x000000 })
  root.addChild(botBar)

  // ─── slow-mo ──────────────────────────────────────────────────────
  const release = installSlowMo(app, 0.4, 0.9)

  // ─── timeline ────────────────────────────────────────────────────
  const tl = gsap.timeline({
    onComplete: () => {
      release()
      root.destroy({ children: true })
      emit('dropInComplete', null)
    },
  })

  // 1. Card lands hard (steps ease for crude snap).
  tl.to(card, { alpha: 1, duration: 0.25, ease: 'steps(3)' }, 0.1)
  // 2. Hold then fade black so world bleeds through.
  tl.to(fade, { alpha: 0, duration: 0.5, ease: 'power1.inOut' }, 1.3)
  tl.to(card, { alpha: 0, duration: 0.4, ease: 'power1.in' }, 1.45)
  // 3. Letterbox retracts by sliding off-screen (simpler than redrawing).
  tl.to(topBar, { y: -BAR_H, duration: 0.45, ease: 'power2.inOut' }, 1.6)
  tl.to(botBar, { y: H, duration: 0.45, ease: 'power2.inOut' }, 1.6)
  // 4. Terminal hold so retract finishes before emit.
  tl.to({}, { duration: 0.15 }, 2.05)
}

// ─── slow-motion helper (unchanged from previous version) ───────────────
function installSlowMo(app: Application, startSpeed: number, rampSeconds: number): () => void {
  app.ticker.speed = startSpeed
  const tween = gsap.to(app.ticker, {
    speed: 1,
    duration: rampSeconds,
    ease: 'power2.out',
  })
  return () => {
    tween.kill()
    app.ticker.speed = 1
  }
}
