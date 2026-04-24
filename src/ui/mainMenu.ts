// Main menu — rendered inside the Pixi stage so the same CRT filter that
// distorts gameplay also distorts the menu. No HTML/CSS overlay.
//
// Crude on purpose: hard rectangles, monospace, ASCII bracket markers
// (`> PLAY <`) for selection. Bone-and-oxblood. Two beats:
//   1. Logo + subtitle land. "PRESS ANY KEY" blinks.
//   2. First key/click → items snap in, "PRESS ANY KEY" disappears.

import type { Container as PixiContainer } from 'pixi.js'
import { gsap } from 'gsap'
import { Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from '../config'
import { emit } from '../session/eventBus'

export interface MainMenuHandlers {
  onPlay: () => void
  onQuit: () => void
  onSettings?: () => void
  onContinue?: () => void
}

interface MenuItem {
  container: Container
  label: Text
  bracketL: Text
  bracketR: Text
  action: 'play' | 'continue' | 'settings' | 'quit'
  disabled: boolean
}

const COLOR_BONE = 0xE0D8C8 // primary text
const COLOR_BONE_DIM = 0x8A8478 // unfocused / subtitle
const COLOR_OXBLOOD = 0xCC2020 // focus accent + logo shadow
const COLOR_DISABLED = 0x40404A
const COLOR_BACKING = 0x05060A

const W = CONFIG.LOGICAL_WIDTH
const H = CONFIG.LOGICAL_HEIGHT

export function mountMainMenu(parent: PixiContainer, handlers: MainMenuHandlers): () => void {
  const root = new Container()
  parent.addChild(root)

  // ─── dark backing rect + horizontal scan-bands ────────────────────
  const backing = new Graphics()
  backing.rect(0, 0, W, H).fill({ color: COLOR_BACKING, alpha: 0.82 })
  // Random horizontal "static" bands — purely decorative, redrawn once.
  for (let i = 0; i < 8; i++) {
    const y = Math.floor(Math.random() * H)
    const a = 0.04 + Math.random() * 0.06
    backing.rect(0, y, W, 1).fill({ color: 0xFFFFFF, alpha: a })
  }
  root.addChild(backing)

  // ─── logo: "FAULTLINE" with oxblood ghost behind ──────────────────
  const logoStyle = {
    fontFamily: 'monospace',
    fontSize: 38,
    fontWeight: '700' as const,
    fill: COLOR_BONE,
    letterSpacing: 8,
  }
  const logoShadow = new Text({
    text: 'FAULTLINE',
    style: { ...logoStyle, fill: COLOR_OXBLOOD },
    resolution: 1,
  })
  logoShadow.anchor.set(0.5)
  logoShadow.x = W / 2 + 2
  logoShadow.y = 92 + 2
  logoShadow.alpha = 0.55
  root.addChild(logoShadow)

  const logo = new Text({
    text: 'FAULTLINE',
    style: logoStyle,
    resolution: 1,
  })
  logo.anchor.set(0.5)
  logo.x = W / 2
  logo.y = 92
  root.addChild(logo)

  // Hard underline bar — a single oxblood pixel-row beneath the logo.
  const logoBar = new Graphics()
  logoBar.rect(W / 2 - 110, 116, 220, 1).fill({ color: COLOR_OXBLOOD, alpha: 0.7 })
  root.addChild(logoBar)

  // ─── subtitle ─────────────────────────────────────────────────────
  const subtitle = new Text({
    text: 'the world does not forgive',
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
  subtitle.y = 132
  root.addChild(subtitle)

  // ─── press-any-key beat ───────────────────────────────────────────
  const pressKey = new Text({
    text: 'PRESS ANY KEY',
    style: {
      fontFamily: 'monospace',
      fontSize: 9,
      fill: COLOR_OXBLOOD,
      letterSpacing: 5,
      fontWeight: '700' as const,
    },
    resolution: 1,
  })
  pressKey.anchor.set(0.5)
  pressKey.x = W / 2
  pressKey.y = 220
  root.addChild(pressKey)

  // ─── item list — hidden until first input ─────────────────────────
  const itemsContainer = new Container()
  itemsContainer.x = W / 2
  itemsContainer.y = 200
  itemsContainer.visible = false
  root.addChild(itemsContainer)

  const itemDefs: { label: string, action: MenuItem['action'], disabled?: boolean }[] = [
    { label: 'PLAY', action: 'play' },
    { label: 'CONTINUE', action: 'continue', disabled: true },
    { label: 'SETTINGS', action: 'settings', disabled: true },
    { label: 'QUIT', action: 'quit' },
  ]

  const items: MenuItem[] = itemDefs.map((def, i) => {
    const c = new Container()
    c.y = i * 18
    const fill = def.disabled ? COLOR_DISABLED : COLOR_BONE_DIM
    const label = new Text({
      text: def.label,
      style: {
        fontFamily: 'monospace',
        fontSize: 13,
        fill,
        letterSpacing: 5,
        fontWeight: '700' as const,
      },
      resolution: 1,
    })
    label.anchor.set(0.5)
    c.addChild(label)

    const bracketL = new Text({
      text: '>',
      style: {
        fontFamily: 'monospace',
        fontSize: 13,
        fill: COLOR_OXBLOOD,
        letterSpacing: 0,
        fontWeight: '700' as const,
      },
      resolution: 1,
    })
    bracketL.anchor.set(1, 0.5)
    bracketL.visible = false
    c.addChild(bracketL)

    const bracketR = new Text({
      text: '<',
      style: {
        fontFamily: 'monospace',
        fontSize: 13,
        fill: COLOR_OXBLOOD,
        letterSpacing: 0,
        fontWeight: '700' as const,
      },
      resolution: 1,
    })
    bracketR.anchor.set(0, 0.5)
    bracketR.visible = false
    c.addChild(bracketR)

    if (!def.disabled) {
      c.eventMode = 'static'
      c.cursor = 'pointer'
    }

    itemsContainer.addChild(c)
    return { container: c, label, bracketL, bracketR, action: def.action, disabled: def.disabled ?? false }
  })

  // First non-disabled item starts focused.
  let focusedIdx = items.findIndex(it => !it.disabled)
  function applyFocus(): void {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!
      const focused = i === focusedIdx
      it.bracketL.visible = focused
      it.bracketR.visible = focused
      if (it.disabled) {
        it.label.style.fill = COLOR_DISABLED
      }
      else if (focused) {
        it.label.style.fill = COLOR_BONE
        // Bracket positions track the label's measured width.
        const halfW = it.label.width / 2
        it.bracketL.x = -halfW - 6
        it.bracketR.x = halfW + 6
      }
      else {
        it.label.style.fill = COLOR_BONE_DIM
      }
    }
  }

  function moveFocus(delta: number): void {
    if (items.length === 0)
      return
    let idx = focusedIdx
    for (let i = 0; i < items.length; i++) {
      idx = (idx + delta + items.length) % items.length
      const it = items[idx]!
      if (!it.disabled) {
        focusedIdx = idx
        break
      }
    }
    applyFocus()
  }

  // ─── intro animation: hard reveal, no smooth fades ────────────────
  // Snap reveals: backing is on instantly, logo lands with a 1-frame
  // black-frame pulse, subtitle types in by stepping the visible chars.
  root.alpha = 0
  gsap.to(root, { alpha: 1, duration: 0.18, ease: 'steps(3)' })

  // Subtitle "type-on" — increment a proxy and slice the text.
  const fullSubtitle = subtitle.text
  subtitle.text = ''
  const typeProxy = { i: 0 }
  gsap.to(typeProxy, {
    i: fullSubtitle.length,
    duration: 0.6,
    delay: 0.25,
    ease: `steps(${fullSubtitle.length})`,
    onUpdate: () => {
      subtitle.text = fullSubtitle.slice(0, Math.floor(typeProxy.i))
    },
    onComplete: () => { subtitle.text = fullSubtitle },
  })

  // Press-any-key hard blink.
  let blinkOn = true
  const blinkTween = gsap.to({}, {
    duration: 0.55,
    repeat: -1,
    onRepeat: () => {
      blinkOn = !blinkOn
      pressKey.alpha = blinkOn ? 1 : 0
    },
  })

  // ─── reveal items ─────────────────────────────────────────────────
  let itemsRevealed = false
  function revealItems(): void {
    if (itemsRevealed)
      return
    itemsRevealed = true
    pressKey.visible = false
    blinkTween.kill()
    itemsContainer.visible = true
    // Snap items in one at a time, hard step.
    itemsContainer.alpha = 0
    gsap.to(itemsContainer, { alpha: 1, duration: 0.18, ease: 'steps(2)' })
    applyFocus()
  }

  // ─── input ────────────────────────────────────────────────────────
  function activateFocused(): void {
    const it = items[focusedIdx]
    if (!it || it.disabled)
      return
    if (it.action === 'play')
      handlers.onPlay()
    else if (it.action === 'continue')
      handlers.onContinue?.()
    else if (it.action === 'settings')
      handlers.onSettings?.()
    else if (it.action === 'quit')
      handlers.onQuit()
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta')
      return
    if (!itemsRevealed) {
      revealItems()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      moveFocus(1)
      e.preventDefault()
    }
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      moveFocus(-1)
      e.preventDefault()
    }
    else if (e.key === 'Enter' || e.key === ' ') {
      activateFocused()
      e.preventDefault()
    }
  }
  window.addEventListener('keydown', onKey)

  // Pointer interactions on each item — hover sets focus; click activates.
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!
    if (it.disabled)
      continue
    it.container.on('pointerover', () => {
      focusedIdx = i
      applyFocus()
    })
    it.container.on('pointerdown', () => {
      revealItems()
      focusedIdx = i
      applyFocus()
      activateFocused()
    })
  }

  // First click anywhere reveals items even if they missed an item.
  backing.eventMode = 'static'
  backing.on('pointerdown', revealItems)

  emit('menuShown', null)

  // ─── teardown ────────────────────────────────────────────────────
  function dismiss(): void {
    window.removeEventListener('keydown', onKey)
    gsap.killTweensOf(root)
    blinkTween.kill()
    gsap.to(root, {
      alpha: 0,
      duration: 0.18,
      ease: 'steps(2)',
      onComplete: () => {
        root.destroy({ children: true })
      },
    })
  }

  return dismiss
}
