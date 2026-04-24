// Main menu — full-screen HTML overlay shown above the Pixi canvas while
// gameSession.phase === 'menu'. Emits 'menuPlayPressed' on the EventBus
// when the player commits to Play (either via the button or Enter/Space).
//
// Animation uses GSAP (already a dep). Staggered reveal:
//   1. Overlay fades in (200ms)
//   2. Logo title lands (400ms, bounce-ease)
//   3. Subtitle fades (250ms, delayed 200)
//   4. "Press any key" pulse (loops until first keypress)
//   5. On keypress → menu items stagger in, press-any-key fades out

import { gsap } from 'gsap'
import { emit } from '../session/eventBus'

export interface MainMenuHandlers {
  onPlay: () => void
  onQuit: () => void
  onSettings?: () => void
  onContinue?: () => void
}

export function mountMainMenu(handlers: MainMenuHandlers): () => void {
  const overlay = document.createElement('div')
  overlay.className = 'menu-overlay'
  overlay.innerHTML = `
    <div class="menu-bg">
      <div class="menu-bg-layer menu-bg-far"></div>
      <div class="menu-bg-layer menu-bg-mid"></div>
      <div class="menu-bg-layer menu-bg-near"></div>
      <div class="menu-bg-vignette"></div>
    </div>
    <div class="menu-panel">
      <h1 class="menu-logo" data-slot="logo"><span>FAULTLINE</span></h1>
      <p class="menu-subtitle" data-slot="subtitle">the world does not forgive</p>
      <div class="menu-presskey" data-slot="presskey">press any key</div>
      <nav class="menu-items" data-slot="items" aria-hidden="true">
        <button class="menu-item" data-action="play">Play</button>
        <button class="menu-item" data-action="continue" disabled>Continue</button>
        <button class="menu-item" data-action="settings" disabled>Settings</button>
        <button class="menu-item" data-action="quit">Quit</button>
      </nav>
    </div>
  `
  document.body.appendChild(overlay)

  const logoEl = overlay.querySelector<HTMLElement>('[data-slot="logo"]')!
  const subtitleEl = overlay.querySelector<HTMLElement>('[data-slot="subtitle"]')!
  const presskeyEl = overlay.querySelector<HTMLElement>('[data-slot="presskey"]')!
  const itemsEl = overlay.querySelector<HTMLElement>('[data-slot="items"]')!
  const itemNodes = Array.from(itemsEl.querySelectorAll<HTMLButtonElement>('.menu-item'))

  let itemsRevealed = false

  // ─── intro sequence ───────────────────────────────────────────────────
  gsap.set(overlay, { opacity: 0 })
  gsap.set(logoEl, { opacity: 0, y: -12, letterSpacing: '1em' })
  gsap.set(subtitleEl, { opacity: 0 })
  gsap.set(presskeyEl, { opacity: 0 })
  gsap.set(itemNodes, { opacity: 0, y: 10 })

  const tl = gsap.timeline()
  tl.to(overlay, { opacity: 1, duration: 0.2, ease: 'power1.out' })
    .to(logoEl, { opacity: 1, y: 0, letterSpacing: '0.25em', duration: 0.8, ease: 'power2.out' }, '-=0.05')
    .to(subtitleEl, { opacity: 1, duration: 0.35 }, '-=0.3')
    .to(presskeyEl, { opacity: 0.85, duration: 0.3 }, '-=0.1')
    .to(presskeyEl, {
      opacity: 0.35,
      duration: 0.9,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })

  function revealItems(): void {
    if (itemsRevealed) return
    itemsRevealed = true
    itemsEl.setAttribute('aria-hidden', 'false')
    gsap.to(presskeyEl, {
      opacity: 0,
      duration: 0.25,
      overwrite: true,
      onComplete: () => { presskeyEl.style.display = 'none' },
    })
    gsap.to(itemNodes, {
      opacity: 1,
      y: 0,
      duration: 0.28,
      stagger: 0.07,
      ease: 'power2.out',
      onComplete: () => {
        // Focus the Play button once items land, so keyboard nav works
        // immediately (Enter commits, arrow keys change focus natively).
        itemNodes[0]?.focus()
      },
    })
  }

  // Any key reveals the menu items — but ignore pure modifier presses so
  // holding Shift alone doesn't blow past the press-any-key beat.
  function onAnyKey(e: KeyboardEvent): void {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return
    revealItems()
  }
  window.addEventListener('keydown', onAnyKey, { once: false })
  overlay.addEventListener('pointerdown', revealItems, { once: true })

  // ─── item actions ─────────────────────────────────────────────────────
  for (const btn of itemNodes) {
    btn.addEventListener('click', () => {
      if (btn.disabled) return
      const action = btn.dataset.action
      if (action === 'play') handlers.onPlay()
      else if (action === 'continue') handlers.onContinue?.()
      else if (action === 'settings') handlers.onSettings?.()
      else if (action === 'quit') handlers.onQuit()
    })
  }

  // Enter while items visible = activate focused button (native handles most
  // of this; the explicit path makes keyboard-only flow crisp).
  function onCommit(e: KeyboardEvent): void {
    if (!itemsRevealed) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    const focused = document.activeElement
    if (focused instanceof HTMLButtonElement && focused.classList.contains('menu-item'))
      return // let the click fire natively
    // If nothing focused (e.g. pointer user), default to Play.
    e.preventDefault()
    handlers.onPlay()
  }
  window.addEventListener('keydown', onCommit)

  emit('menuShown', null)

  // ─── teardown ─────────────────────────────────────────────────────────
  function dismiss(): void {
    window.removeEventListener('keydown', onAnyKey)
    window.removeEventListener('keydown', onCommit)
    gsap.killTweensOf([overlay, logoEl, subtitleEl, presskeyEl, itemNodes])
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.25,
      ease: 'power1.in',
      onComplete: () => overlay.remove(),
    })
  }

  return dismiss
}
