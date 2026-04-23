import type { BlastResult } from './blast'
import type { FxState } from './fx'
import type { Level } from './level'
import type { PressureState } from './pressure'
import { performBlast } from './blast'
import { CONFIG } from './config'
import { triggerDetonationFx } from './fx'
import {
  jumpPressed,
  jumpReleased,
  leftDown,
  rightDown,
  ventHeld,
} from './input'
import { resetLevel } from './level'
import {
  moveAndCollideX,
  moveAndCollideY,
  rectOverlapsHazard,
  tryCornerCorrection,
} from './physics'
import {
  createPressureState,
  onDetonated,
  resetPressure,
  updatePressure,
} from './pressure'

export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  grounded: boolean
  coyoteTimer: number
  bufferTimer: number
  facing: 1 | -1

  // ─── new: dynamite-platformer state ───
  pressure: PressureState
  touchingWall: boolean // written by moveAndCollideX each tick
  jumpedThisTick: boolean // set only on ticks where a jump actually fired
  iframeTimer: number // post-detonation invulnerability window
  alive: boolean // false ⇒ game.ts triggers a respawn at frame end

  // Signalling for the renderer — last detonation's blast, cleared after one frame.
  lastBlast: BlastResult | null
}

export function createPlayer(level: Level): Player {
  return {
    x: level.spawn.x,
    y: level.spawn.y,
    vx: 0,
    vy: 0,
    w: CONFIG.PLAYER_W,
    h: CONFIG.PLAYER_H,
    grounded: false,
    coyoteTimer: 0,
    bufferTimer: 0,
    facing: 1,
    pressure: createPressureState(),
    touchingWall: false,
    jumpedThisTick: false,
    iframeTimer: 0,
    alive: true,
    lastBlast: null,
  }
}

function handleInput(p: Player, dt: number, locked: boolean): void {
  // "locked" = vent is active OR post-vent stun. No input-driven movement,
  // no jump firing. Gravity and current vx decay still apply below.
  const inputX = locked ? 0 : (rightDown() ? 1 : 0) - (leftDown() ? 1 : 0)
  if (inputX !== 0)
    p.facing = inputX === 1 ? 1 : -1

  // Buffer a jump press even if we're not yet grounded — it fires on touchdown.
  if (!locked && jumpPressed())
    p.bufferTimer = CONFIG.JUMP_BUFFER

  // Horizontal acceleration. Turnaround boost kicks in when input opposes vx.
  const targetVx = inputX * CONFIG.MAX_RUN
  let accel: number
  if (inputX !== 0) {
    const turning = p.vx !== 0 && Math.sign(inputX) !== Math.sign(p.vx)
    accel = p.grounded ? CONFIG.GROUND_ACCEL : CONFIG.AIR_ACCEL
    if (turning)
      accel *= CONFIG.TURN_BOOST
  }
  else {
    accel = p.grounded ? CONFIG.GROUND_DECEL : CONFIG.AIR_DECEL
  }
  const dv = accel * dt
  if (p.vx < targetVx)
    p.vx = Math.min(p.vx + dv, targetVx)
  else if (p.vx > targetVx)
    p.vx = Math.max(p.vx - dv, targetVx)

  // Fire jump if (a) buffered, (b) grounded or within coyote window, (c) not locked.
  const canJump = !locked && (p.grounded || p.coyoteTimer > 0)
  let firedJump = false
  if (p.bufferTimer > 0 && canJump) {
    p.vy = -CONFIG.JUMP_VELOCITY
    p.bufferTimer = 0
    p.coyoteTimer = 0
    p.grounded = false
    firedJump = true
    p.jumpedThisTick = true
  }

  // Variable jump height: release-to-cut. Skip on the tick a buffered jump fires
  // — otherwise a quick tap-before-landing would become an unwanted short hop.
  if (!firedJump && jumpReleased() && p.vy < 0) {
    p.vy *= CONFIG.JUMP_CUT_MULT
  }
}

// Kill + reset. Destruction is wiped on death per the brief.
function die(p: Player, level: Level): void {
  p.alive = false
  p.vx = 0
  p.vy = 0
  resetLevel(level)
}

// Put the player back at the spawn with a fresh state. Called by game.ts
// after a death (on the next frame) so the death visuals can land first.
export function respawn(p: Player, level: Level): void {
  p.x = level.spawn.x
  p.y = level.spawn.y
  p.vx = 0
  p.vy = 0
  p.grounded = false
  p.coyoteTimer = 0
  p.bufferTimer = 0
  p.facing = 1
  p.touchingWall = false
  p.jumpedThisTick = false
  p.iframeTimer = 0
  p.alive = true
  p.lastBlast = null
  resetPressure(p.pressure)
  resetLevel(level)
}

export function updatePlayer(p: Player, level: Level, fx: FxState, dt: number): void {
  if (!p.alive)
    return // respawn handled one tick later by game.ts

  // `lastBlast` is an ephemeral renderer handle. Drop it once the i-frame
  // window closes — by then the flash/shake/debris have all finished.
  if (p.lastBlast && p.iframeTimer <= 0)
    p.lastBlast = null

  // ─── deferred detonation ──────────────────────────────────────
  // Fires at the top of the tick AFTER pressure hit max, so the renderer
  // got one guaranteed frame to show the ghost preview at peak. Hitstop
  // is triggered inside triggerDetonationFx — game.ts will skip the next
  // few ticks based on fx.hitstopTicks.
  if (p.pressure.detonateQueued) {
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    const blast = performBlast(level, cx, cy, p.vx, p.vy)
    p.vx = blast.impulse.x
    p.vy = blast.impulse.y
    p.iframeTimer = CONFIG.BLAST_IFRAMES
    p.grounded = false // launch clears ground contact for the next tick
    p.lastBlast = blast
    onDetonated(p.pressure)
    triggerDetonationFx(fx, blast)
    // Consume the rest of this tick — the blast IS the tick's action.
    return
  }

  // Timers
  if (p.coyoteTimer > 0)
    p.coyoteTimer -= dt
  if (p.bufferTimer > 0)
    p.bufferTimer -= dt
  if (p.iframeTimer > 0)
    p.iframeTimer -= dt

  p.jumpedThisTick = false

  // Vent state: if player is holding vent AND has no stun AND not detonating,
  // we lock movement this tick. Pressure module still decides the authoritative
  // state and handles draining; we just need to know up-front to lock input.
  const locked
    = ventHeld() && p.pressure.ventStunTimer <= 0 && !p.pressure.detonateQueued

  handleInput(p, dt, locked)

  // Asymmetric gravity: lighter on the way up, heavier on the way down.
  const gravity = p.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY
  p.vy += gravity * dt
  if (p.vy > CONFIG.MAX_FALL)
    p.vy = CONFIG.MAX_FALL

  // Capture pre-collision vy so we can score landing impact.
  const prevVy = p.vy
  const wasGrounded = p.grounded

  moveAndCollideX(p, level, dt)
  tryCornerCorrection(p, level, dt)
  moveAndCollideY(p, level, dt)

  // Landing impact for pressure (measured at the peak vy before the Y-collide
  // stopped us). Zero if we weren't actually airborne before this tick.
  const landed = !wasGrounded && p.grounded
  const landedImpactVy = landed ? Math.max(0, prevVy) : 0

  // Arm coyote window iff we just walked off an edge.
  if (wasGrounded && !p.grounded && p.vy >= 0) {
    p.coyoteTimer = CONFIG.COYOTE_TIME
  }

  // Hazard check AFTER movement. Pass-through hazards kill on AABB overlap.
  if (rectOverlapsHazard(level, p.x, p.y, p.w, p.h)) {
    die(p, level)
    return
  }

  // Fall-out safety net — still die and respawn. Won't normally trigger now
  // that the floor is bedrock, but useful if you carve too greedily.
  if (p.y > level.height * CONFIG.TILE_SIZE + 100) {
    die(p, level)
    return
  }

  // "Pressed into a wall while moving" — input direction must match the
  // wall side we just collided with. facing tracks last non-zero inputX, so
  // if input is live this tick the facing matches the direction we pushed.
  const inputX = locked ? 0 : (rightDown() ? 1 : 0) - (leftDown() ? 1 : 0)
  const wallMoving = p.touchingWall && inputX !== 0

  updatePressure(
    p.pressure,
    {
      grounded: p.grounded,
      vxAbs: Math.abs(p.vx),
      jumpedThisTick: p.jumpedThisTick,
      landedImpactVy,
      touchingWallMoving: wallMoving,
      ventHeld: ventHeld(),
      iframes: p.iframeTimer > 0,
    },
    dt,
  )
}
