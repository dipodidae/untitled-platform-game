// Results screen — Pixi-rendered into the screen-overlay container so the
// CRT filter runs over the grade stamp + count-up text. Crude monospace,
// oxblood/bone palette. Listens for `levelComplete`; hides on `levelLoaded`.
//
// Animation:
//   - Panel fades in (steps).
//   - Time then deaths count up sequentially.
//   - Grade letter stamps in with overshoot + screen flash.
//   - Buttons appear last.

import type { Container as PixiContainer } from 'pixi.js'
import type { EngineEvents } from '../session/eventBus'
import { gsap } from 'gsap'
import { Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../config'
import { on } from '../session/eventBus'
import { hasNextLevel, levelName } from '../session/levelManager'

export interface ResultsHandlers {
  onRetry: () => void
  onNext: () => void
}

export type Grade = 'S' | 'A' | 'B' | 'C'

const PARS: Record<string, { timeMs: number, maxDeaths: number }> = {
  level1: { timeMs: 45_000, maxDeaths: 0 },
  level2: { timeMs: 60_000, maxDeaths: 0 },
}
const DEFAULT_PAR = { timeMs: 60_000, maxDeaths: 0 }

const COLOR_BONE = 0xE0D8C8
const COLOR_BONE_DIM = 0x8A8478
const COLOR_OXBLOOD = 0xCC2020
const COLOR_BACKING = 0x05060A

const GRADE_COLORS: Record<Grade, number> = {
  S: 0xFFD700,
  A: 0xC8A020,
  B: 0x8AC58A,
  C: 0x8A8E96,
}

const W = CONFIG.LOGICAL_WIDTH
const H = CONFIG.LOGICAL_HEIGHT

function computeGrade(levelId: string, timeMs: number, deaths: number): Grade {
  const par = PARS[levelId] ?? DEFAULT_PAR
  if (deaths === 0 && timeMs <= par.timeMs)
    return 'S'
  if (deaths <= 1 && timeMs <= par.timeMs * 1.3)
    return 'A'
  if (deaths <= 3 && timeMs <= par.timeMs * 1.8)
    return 'B'
  return 'C'
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  const hundredths = Math.floor((ms % 1000) / 10).toString().padStart(2, '0')
  return `${m}:${s}.${hundredths}`
}

export function mountResultsScreen(parent: PixiContainer, handlers: ResultsHandlers): () => void {
  const root = new Container()
  root.visible = false
  parent.addChild(root)

  // Backing rect — slightly transparent so the stage bleeds through.
  const backing = new Graphics()
  backing.rect(0, 0, W, H).fill({ color: COLOR_BACKING, alpha: 0.78 })
  root.addChild(backing)

  // Panel frame — single-pixel oxblood border around a centered region.
  const panelW = 360
  const panelH = 220
  const panelX = (W - panelW) / 2
  const panelY = (H - panelH) / 2
  const panel = new Graphics()
  panel.rect(panelX, panelY, panelW, panelH)
    .fill({ color: 0x0A0B12, alpha: 0.92 })
    .stroke({ width: 1, color: COLOR_OXBLOOD, alpha: 0.85 })
  root.addChild(panel)

  // Title strip
  const title = new Text({
    text: 'LEVEL COMPLETE',
    style: {
      fontFamily: 'monospace',
      fontSize: 14,
      fill: COLOR_OXBLOOD,
      letterSpacing: 6,
      fontWeight: '700' as const,
    },
    resolution: 1,
  })
  title.anchor.set(0.5, 0)
  title.x = W / 2
  title.y = panelY + 14
  root.addChild(title)

  const subtitle = new Text({
    text: '',
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: COLOR_BONE_DIM,
      letterSpacing: 4,
    },
    resolution: 1,
  })
  subtitle.anchor.set(0.5, 0)
  subtitle.x = W / 2
  subtitle.y = panelY + 36
  root.addChild(subtitle)

  // Stats row
  const statsY = panelY + 70
  const timeLabel = new Text({
    text: 'TIME',
    style: { fontFamily: 'monospace', fontSize: 8, fill: COLOR_BONE_DIM, letterSpacing: 4 },
    resolution: 1,
  })
  timeLabel.anchor.set(0.5, 0)
  timeLabel.x = W / 2 - 70
  timeLabel.y = statsY
  root.addChild(timeLabel)

  const timeValue = new Text({
    text: '00:00.00',
    style: { fontFamily: 'monospace', fontSize: 18, fill: COLOR_BONE, letterSpacing: 1, fontWeight: '700' as const },
    resolution: 1,
  })
  timeValue.anchor.set(0.5, 0)
  timeValue.x = W / 2 - 70
  timeValue.y = statsY + 11
  root.addChild(timeValue)

  const deathsLabel = new Text({
    text: 'DEATHS',
    style: { fontFamily: 'monospace', fontSize: 8, fill: COLOR_BONE_DIM, letterSpacing: 4 },
    resolution: 1,
  })
  deathsLabel.anchor.set(0.5, 0)
  deathsLabel.x = W / 2 + 70
  deathsLabel.y = statsY
  root.addChild(deathsLabel)

  const deathsValue = new Text({
    text: '0',
    style: { fontFamily: 'monospace', fontSize: 18, fill: COLOR_BONE, letterSpacing: 1, fontWeight: '700' as const },
    resolution: 1,
  })
  deathsValue.anchor.set(0.5, 0)
  deathsValue.x = W / 2 + 70
  deathsValue.y = statsY + 11
  root.addChild(deathsValue)

  // Grade box — single big letter inside a hard-bordered square.
  const gradeBox = new Container()
  gradeBox.x = W / 2
  gradeBox.y = panelY + 132
  root.addChild(gradeBox)

  const gradeFrame = new Graphics()
  gradeBox.addChild(gradeFrame)

  const gradeLetter = new Text({
    text: 'C',
    style: {
      fontFamily: 'monospace',
      fontSize: 32,
      fill: GRADE_COLORS.C,
      letterSpacing: 0,
      fontWeight: '700' as const,
    },
    resolution: 1,
  })
  gradeLetter.anchor.set(0.5)
  gradeBox.addChild(gradeLetter)

  const gradeLabel = new Text({
    text: 'GRADE',
    style: { fontFamily: 'monospace', fontSize: 7, fill: COLOR_BONE_DIM, letterSpacing: 4 },
    resolution: 1,
  })
  gradeLabel.anchor.set(0.5, 0)
  gradeLabel.x = 0
  gradeLabel.y = 22
  gradeBox.addChild(gradeLabel)

  // Buttons — keyboard-focusable, pointer-clickable. Bracket markers on
  // the focused one (consistent with the main menu).
  const buttonsContainer = new Container()
  buttonsContainer.y = panelY + panelH - 26
  root.addChild(buttonsContainer)

  const btnDefs: { label: string, action: 'retry' | 'next' }[] = [
    { label: 'RETRY', action: 'retry' },
    { label: 'NEXT', action: 'next' },
  ]
  const buttons = btnDefs.map((def) => {
    const c = new Container()
    const label = new Text({
      text: def.label,
      style: {
        fontFamily: 'monospace',
        fontSize: 12,
        fill: COLOR_BONE_DIM,
        letterSpacing: 4,
        fontWeight: '700' as const,
      },
      resolution: 1,
    })
    label.anchor.set(0.5)
    c.addChild(label)
    const bL = new Text({
      text: '>',
      style: { fontFamily: 'monospace', fontSize: 12, fill: COLOR_OXBLOOD, fontWeight: '700' as const },
      resolution: 1,
    })
    bL.anchor.set(1, 0.5)
    bL.visible = false
    c.addChild(bL)
    const bR = new Text({
      text: '<',
      style: { fontFamily: 'monospace', fontSize: 12, fill: COLOR_OXBLOOD, fontWeight: '700' as const },
      resolution: 1,
    })
    bR.anchor.set(0, 0.5)
    bR.visible = false
    c.addChild(bR)
    c.eventMode = 'static'
    c.cursor = 'pointer'
    buttonsContainer.addChild(c)
    return { container: c, label, bracketL: bL, bracketR: bR, action: def.action, hidden: false }
  })

  // Layout buttons centered side-by-side. Recomputed each show()
  // because we may hide Next on the final level.
  function layoutButtons(): void {
    const visible = buttons.filter(b => !b.hidden)
    const spacing = 24
    let totalW = 0
    for (const b of visible) totalW += b.label.width + spacing
    totalW -= spacing
    let cursor = W / 2 - totalW / 2
    for (const b of visible) {
      const halfW = b.label.width / 2
      b.container.x = cursor + halfW
      b.bracketL.x = -halfW - 6
      b.bracketR.x = halfW + 6
      cursor += b.label.width + spacing
    }
  }

  let focusedIdx = 0
  function applyFocus(): void {
    let visibleSeen = 0
    for (const b of buttons) {
      if (b.hidden) {
        b.container.visible = false
        continue
      }
      b.container.visible = true
      const focused = visibleSeen === focusedIdx
      b.bracketL.visible = focused
      b.bracketR.visible = focused
      b.label.style.fill = focused ? COLOR_BONE : COLOR_BONE_DIM
      visibleSeen++
    }
  }

  function visibleButtons(): typeof buttons {
    return buttons.filter(b => !b.hidden)
  }

  function moveFocus(delta: number): void {
    const v = visibleButtons()
    if (v.length === 0)
      return
    focusedIdx = (focusedIdx + delta + v.length) % v.length
    applyFocus()
  }

  function activateFocused(): void {
    const v = visibleButtons()
    const b = v[focusedIdx]
    if (!b)
      return
    if (b.action === 'retry')
      handlers.onRetry()
    else if (b.action === 'next')
      handlers.onNext()
  }

  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i]!
    b.container.on('pointerover', () => {
      const v = visibleButtons()
      const vi = v.indexOf(b)
      if (vi < 0)
        return
      focusedIdx = vi
      applyFocus()
    })
    b.container.on('pointerdown', () => {
      const v = visibleButtons()
      const vi = v.indexOf(b)
      if (vi < 0)
        return
      focusedIdx = vi
      applyFocus()
      activateFocused()
    })
  }

  // Full-screen white flash that fires when the grade lands.
  const flash = new Graphics()
  flash.rect(0, 0, W, H).fill({ color: 0xFFF8DC, alpha: 1 })
  flash.alpha = 0
  root.addChild(flash)

  // ─── keyboard ─────────────────────────────────────────────────────
  function onKey(e: KeyboardEvent): void {
    if (!root.visible)
      return
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      moveFocus(-1)
      e.preventDefault()
    }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      moveFocus(1)
      e.preventDefault()
    }
    else if (e.key === 'Enter' || e.key === ' ') {
      activateFocused()
      e.preventDefault()
    }
  }
  window.addEventListener('keydown', onKey)

  // ─── show / hide ──────────────────────────────────────────────────
  function show(e: EngineEvents['levelComplete']): void {
    title.text = hasNextLevel(e.levelId) ? 'LEVEL COMPLETE' : 'YOU FINISHED'
    subtitle.text = levelName(e.levelId)
    const grade = computeGrade(e.levelId, e.timeMs, e.deaths)
    gradeLetter.text = grade
    gradeLetter.style.fill = GRADE_COLORS[grade]

    // Redraw the grade frame in the grade's color (single-pixel border).
    gradeFrame.clear()
    gradeFrame.rect(-26, -26, 52, 52)
      .stroke({ width: 1, color: GRADE_COLORS[grade], alpha: 0.9 })

    // Hide Next on the final level; keep Retry focusable.
    const next = buttons.find(b => b.action === 'next')!
    next.hidden = !hasNextLevel(e.levelId)
    focusedIdx = 0
    layoutButtons()
    applyFocus()

    // Initial state.
    timeValue.text = formatTime(0)
    deathsValue.text = '0'
    gradeBox.scale.set(0)
    gradeBox.alpha = 0
    flash.alpha = 0
    buttonsContainer.alpha = 0

    root.visible = true
    root.alpha = 0

    const tl = gsap.timeline()
    tl.to(root, { alpha: 1, duration: 0.18, ease: 'steps(3)' }, 0)

    const timeProxy = { ms: 0 }
    const deathsProxy = { count: 0 }
    tl.to(timeProxy, {
      ms: e.timeMs,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => { timeValue.text = formatTime(timeProxy.ms) },
    }, 0.25)
    tl.to(deathsProxy, {
      count: e.deaths,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => { deathsValue.text = String(Math.floor(deathsProxy.count)) },
    }, 0.9)

    // Grade stamp — flash + overshoot scale-in.
    tl.to(flash, { alpha: 1, duration: 0.05 }, 1.35)
    tl.to(flash, { alpha: 0, duration: 0.4, ease: 'power2.out' }, 1.4)
    tl.to(gradeBox, { alpha: 1, duration: 0.1 }, 1.35)
    tl.to(gradeBox.scale, {
      x: 1,
      y: 1,
      duration: 0.55,
      ease: 'back.out(2.6)',
    }, 1.35)
    tl.to(buttonsContainer, { alpha: 1, duration: 0.25, ease: 'steps(3)' }, 1.95)
  }

  function hide(): void {
    root.visible = false
    gsap.killTweensOf([root, flash, gradeBox, gradeBox.scale, buttonsContainer])
  }

  const offComplete = on('levelComplete', show)
  const offLoaded = on('levelLoaded', hide)

  return () => {
    window.removeEventListener('keydown', onKey)
    offComplete()
    offLoaded()
    gsap.killTweensOf([root, flash, gradeBox, gradeBox.scale, buttonsContainer])
    root.destroy({ children: true })
  }
}
