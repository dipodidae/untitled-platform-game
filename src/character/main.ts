// ─── Standalone character renderer demo ─────────────────────────────────────
// Pixi app → Character + InputHandler + PhysicsBody → ticker wires it all.

import { Application, Graphics } from 'pixi.js'
import { Character } from './Character'
import type { CharacterState } from './Character'
import { InputHandler } from './InputHandler'
import { PhysicsBody } from './PhysicsBody'
import {
  DEBUG,
  FALL_THRESHOLD,
  GROUND_Y,
  LEG_HEIGHT,
  SCANLINE_ALPHA,
  SCANLINE_SPACING,
} from './config'

const SCREEN_W = 800
const SCREEN_H = 600

async function main(): Promise<void> {
  const app = new Application()
  await app.init({
    width: SCREEN_W,
    height: SCREEN_H,
    background: 0x000000,
    preference: 'webgl',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
  })
  document.body.appendChild(app.canvas)
  app.canvas.style.display = 'block'
  app.canvas.style.margin = '0 auto'

  // ─── Character ──────────────────────────────────────────────
  const character = new Character()
  character.container.position.set(SCREEN_W / 2, GROUND_Y)
  app.stage.addChild(character.container)

  // ─── Input ──────────────────────────────────────────────────
  const input = new InputHandler()

  // Wire land→run flow check (needs body reference, set up after physics)
  // Deferred below after body creation

  // ─── Physics ────────────────────────────────────────────────
  const body = new PhysicsBody(SCREEN_W / 2, GROUND_Y)

  // Land→run flow: character checks if player is moving when land recovery finishes
  character.setLandMovingCheck(() => Math.abs(body.vx) > 30)

  // ─── Ground line ────────────────────────────────────────────────
  const groundLine = new Graphics()
  groundLine.moveTo(0, GROUND_Y)
  groundLine.lineTo(SCREEN_W, GROUND_Y)
  groundLine.stroke({ width: 1, color: 0x00FFFF, alpha: 0.15 })
  app.stage.addChild(groundLine)

  // ─── CRT scanline overlay ──────────────────────────────────────
  const scanlines = new Graphics()
  for (let y = 0; y < SCREEN_H; y += SCANLINE_SPACING) {
    scanlines.rect(0, y, SCREEN_W, 1)
  }
  scanlines.fill({ color: 0x000000, alpha: SCANLINE_ALPHA })
  app.stage.addChild(scanlines)

  // ─── Debug HUD ──────────────────────────────────────────────
  let debugEl: HTMLDivElement | null = null
  if (DEBUG) {
    debugEl = document.createElement('div')
    debugEl.style.cssText = 'position:fixed;top:8px;left:8px;color:#0ff;font:12px monospace;pointer-events:none;z-index:99'
    document.body.appendChild(debugEl)
  }

  // ─── State machine logic ────────────────────────────────────
  let currentState: CharacterState = 'IDLE'

  function resolveState(): CharacterState {
    if (body.justLanded) return 'LAND'
    if (!body.grounded && body.vy > FALL_THRESHOLD) return 'FALL'
    if (!body.grounded) return 'JUMP'
    // On ground
    if (currentState === 'LAND') return 'LAND' // let land finish via Character
    if (Math.abs(body.vx) > 10) return 'RUN'
    return 'IDLE'
  }

  // ─── Main loop ──────────────────────────────────────────────
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.05)

    // Input → direction
    const inputX = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    const jumpPressed = input.jump

    // Physics
    body.update(dt, inputX, jumpPressed)

    // Facing
    if (inputX !== 0) {
      character.facing = inputX > 0 ? 1 : -1
    }

    // State machine
    const desired = resolveState()
    if (desired !== currentState) {
      // LAND state is self-resolving (transitions to IDLE internally).
      // Only override LAND if we need to jump/run/fall again.
      if (currentState === 'LAND' && (desired === 'IDLE' || desired === 'RUN')) {
        // Let land finish naturally — it will self-resolve to idle or run
      } else {
        currentState = desired
        character.setState(currentState)
      }
    }

    // Keep track of character's internal state for LAND→IDLE/RUN transition
    if (currentState === 'LAND' && (character.state === 'IDLE' || character.state === 'RUN')) {
      currentState = character.state
    }

    // Position character on screen — root is at hip, offset up by leg height
    character.container.position.set(body.x, body.y - LEG_HEIGHT)

    // Update (syncs glow)
    character.update(dt)

    // Latch input
    input.endFrame()

    // Debug
    if (debugEl) {
      debugEl.textContent = `state: ${currentState} | vx: ${body.vx.toFixed(0)} vy: ${body.vy.toFixed(0)} | grounded: ${body.grounded}`
    }
  })

  // ─── Resize ─────────────────────────────────────────────────
  const resize = (): void => {
    const sx = window.innerWidth / SCREEN_W
    const sy = window.innerHeight / SCREEN_H
    const s = Math.min(sx, sy)
    app.canvas.style.width = `${SCREEN_W * s}px`
    app.canvas.style.height = `${SCREEN_H * s}px`
  }
  window.addEventListener('resize', resize)
  resize()
}

main().catch(console.error)
