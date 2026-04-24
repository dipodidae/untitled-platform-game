// ─── Cinematic 2D platformer camera ──────────────────────────────────
// Three-layer ghost system inspired by Rayman Legends:
//   Player (real position)
//     → FocusPoint (chases player with lookahead + deadzone rules)
//       → Camera (chases focus with damping)
//
// The camera never directly tracks the player — it anticipates the action.

import type { Player } from './player/player'
import type { Level } from './world/level'
import { CONFIG } from './config'

// ─── CAMERA_CONFIG — single source of truth ─────────────────────────
export const CAMERA_CONFIG = {
  // Damping — lower = slower/dreamier, higher = snappier
  dampX: 0.08,
  dampY: 0.06,

  // Lookahead
  lookaheadDistance: 70, // px ahead of player in facing direction
  lookaheadSpeed: 0.06, // how fast the lookahead point slides across

  // Deadzone (player can move freely inside without camera moving)
  deadzoneW: 50,
  deadzoneH: 36,

  // Vertical bias — camera sits slightly above center so player sees more above
  verticalOffset: -30,

  // Vertical asymmetry
  fallDampY: 0.03, // loose when falling
  riseDampY: 0.10, // eager when rising

  // Speed zoom. Tightened to 2.4 so Spineboy + weapon feel dominates the
  // frame; zoomMin preserves the ~8% zoom-out-at-speed effect (2.4 × 0.92).
  zoomBase: 2.4,
  zoomMin: 2.2,
  zoomLerpSpeed: 0.04,

  // Trauma shake
  maxShakeX: 14,
  maxShakeY: 10,
  traumaDecay: 0.92, // multiplied per frame

  // Soft bound resistance — camera eases into walls
  boundSoftness: 0.15,

  // Facing direction flip hysteresis — require consistent input before switching
  facingFlipDelay: 0.08, // seconds of movement in new dir before facing switches
}

// ─── Camera state ────────────────────────────────────────────────────

export interface Camera {
  // Final camera position (top-left of viewport in world space)
  x: number
  y: number

  // Focus point — the ghost the camera chases
  focusX: number
  focusY: number

  // Lookahead sliding target
  lookaheadX: number

  // Facing direction for lookahead (+1 or -1), with hysteresis
  facingDir: 1 | -1
  facingTimer: number // time spent moving in the new direction

  // Zoom
  zoom: number

  // Trauma (0..1) — squared for shake, decays each frame
  trauma: number

  // Per-frame shake offset (computed in update, read in render)
  shakeX: number
  shakeY: number
}

export function createCamera(player: Player): Camera {
  const px = player.x + player.w / 2
  const py = player.y + player.h / 2
  return {
    x: px - CONFIG.LOGICAL_WIDTH / 2,
    y: py - CONFIG.LOGICAL_HEIGHT / 2 + CAMERA_CONFIG.verticalOffset,
    focusX: px,
    focusY: py + CAMERA_CONFIG.verticalOffset,
    lookaheadX: px,
    facingDir: player.facing as 1 | -1,
    facingTimer: 0,
    zoom: CAMERA_CONFIG.zoomBase,
    trauma: 0,
    shakeX: 0,
    shakeY: 0,
  }
}

// ─── Public API ──────────────────────────────────────────────────────

export function addTrauma(camera: Camera, amount: number): void {
  camera.trauma = Math.min(1, camera.trauma + amount)
}

export function updateCamera(camera: Camera, player: Player, level: Level): void {
  const C = CAMERA_CONFIG
  const halfW = CONFIG.LOGICAL_WIDTH / 2
  const halfH = CONFIG.LOGICAL_HEIGHT / 2
  const px = player.x + player.w / 2
  const py = player.y + player.h / 2

  // ─── Facing direction with hysteresis ─────────────────────────
  const moveDir = player.vx > 5 ? 1 : player.vx < -5 ? -1 : 0
  if (moveDir !== 0 && moveDir !== camera.facingDir) {
    camera.facingTimer += CONFIG.FIXED_DT
    if (camera.facingTimer >= C.facingFlipDelay) {
      camera.facingDir = moveDir as 1 | -1
      camera.facingTimer = 0
    }
  }
  else {
    camera.facingTimer = 0
  }

  // ─── Horizontal: deadzone + lookahead ─────────────────────────
  // Lookahead target slides toward player + facing offset
  const facingOffset = camera.facingDir * C.lookaheadDistance
  const lookaheadTarget = px + facingOffset
  camera.lookaheadX += (lookaheadTarget - camera.lookaheadX) * C.lookaheadSpeed

  // Deadzone: only move focus if player exits the deadzone
  const dzHalfW = C.deadzoneW / 2
  const relX = px - camera.focusX
  if (relX < -dzHalfW) {
    camera.focusX += (px + dzHalfW - camera.focusX) * C.dampX
  }
  else if (relX > dzHalfW) {
    camera.focusX += (px - dzHalfW - camera.focusX) * C.dampX
  }
  // Blend lookahead into focus
  camera.focusX += (camera.lookaheadX - camera.focusX) * C.dampX

  // ─── Vertical: asymmetric damping ─────────────────────────────
  const targetY = py + C.verticalOffset
  const yDamp = player.vy > 0 ? C.fallDampY : C.riseDampY
  // Deadzone vertical
  const dzHalfH = C.deadzoneH / 2
  const relY = py - camera.focusY
  if (relY < -dzHalfH) {
    camera.focusY += (py + dzHalfH - camera.focusY) * yDamp
  }
  else if (relY > dzHalfH) {
    camera.focusY += (py - dzHalfH - camera.focusY) * yDamp
  }
  // Blend vertical offset
  camera.focusY += (targetY - camera.focusY) * yDamp

  // ─── Camera chases focus point ────────────────────────────────
  const camTargetX = camera.focusX - halfW
  const camTargetY = camera.focusY - halfH
  camera.x += (camTargetX - camera.x) * C.dampX
  camera.y += (camTargetY - camera.y) * C.dampY

  // ─── Soft world bounds ────────────────────────────────────────
  // Render.ts applies zoom pivoted on screen center, so `camera.x` is
  // focusX - halfW, not the top-left of the visible area. At zoom > 1 the
  // visible area is narrower than LOGICAL_WIDTH, so the correct bounds
  // (so focusX stays inside [visHalfW, worldWidth - visHalfW]) translate to:
  //   camera.x ∈ [visHalfW - halfW, worldWidth - visHalfW - halfW]
  // At zoom=1 this collapses to [0, worldWidth - LOGICAL_WIDTH]. At zoom=1.5
  // minX becomes negative — needed so the camera can show the left world
  // edge while keeping the player at screen center on spawn. Without this,
  // the player spawns off-screen until they walk into view.
  const visHalfW = halfW / camera.zoom
  const visHalfH = halfH / camera.zoom
  const minX = visHalfW - halfW
  const maxX = Math.max(minX, level.worldWidth - visHalfW - halfW)
  const minY = visHalfH - halfH
  const maxY = Math.max(minY, level.worldHeight - visHalfH - halfH)
  if (camera.x < minX)
    camera.x += (minX - camera.x) * (1 - C.boundSoftness)
  if (camera.x > maxX)
    camera.x += (maxX - camera.x) * (1 - C.boundSoftness)
  if (camera.y < minY)
    camera.y += (minY - camera.y) * (1 - C.boundSoftness)
  if (camera.y > maxY)
    camera.y += (maxY - camera.y) * (1 - C.boundSoftness)

  // ─── Speed zoom ───────────────────────────────────────────────
  const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy)
  const speedNorm = Math.min(speed / 400, 1) // 400 ≈ max expected speed
  const targetZoom = C.zoomBase + (C.zoomMin - C.zoomBase) * speedNorm
  camera.zoom += (targetZoom - camera.zoom) * C.zoomLerpSpeed

  // ─── Trauma shake ─────────────────────────────────────────────
  const shake = camera.trauma * camera.trauma // squared falloff
  camera.shakeX = C.maxShakeX * shake * (Math.random() * 2 - 1)
  camera.shakeY = C.maxShakeY * shake * (Math.random() * 2 - 1)
  camera.trauma *= C.traumaDecay
  if (camera.trauma < 0.001)
    camera.trauma = 0
}
