import type { FxState } from './fx'
import type { InstabilityState } from './instability'
import type { Vec2 } from './math/vec2'
import type { BroadphaseGrid } from './physics/broadphase'
import type { RuptureResult } from './rupture'
import type { Level } from './world/level'
import { CONFIG } from './config'
import { triggerFractureFx } from './fx'
import {
  containHeld,
  downDown,
  jumpPressed,
  jumpReleased,
  leftDown,
  rightDown,
} from './input'
import {
  createInstabilityState,
  onFractured,
  resetInstability,
  updateInstability,
} from './instability'
import { applySlopeProjection, moveAndCollide, overlapsLethal, tryStickToGround } from './physics'
import { performRupture } from './rupture'
import { resetLevel } from './world/level'

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

  instability: InstabilityState
  touchingWall: boolean // written by moveAndCollide each tick
  jumpedThisTick: boolean // set only on ticks where a jump actually fired
  iframeTimer: number // post-fracture invulnerability window
  alive: boolean // false ⇒ game.ts triggers a respawn at frame end

  // Polygon-world bookkeeping. groundNormal is the last frame's grounded
  // contact; slope projection + stick-to-ground both read it. null while
  // airborne.
  groundNormal: Vec2 | null
  dropThroughTimer: number // seconds remaining where one-way platforms are ignored

  // Renderer handle for the last rupture — cleared once iframes close.
  lastRupture: RuptureResult | null
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
    instability: createInstabilityState(),
    touchingWall: false,
    jumpedThisTick: false,
    iframeTimer: 0,
    alive: true,
    lastRupture: null,
    groundNormal: null,
    dropThroughTimer: 0,
  }
}

function handleInput(p: Player, dt: number, locked: boolean): void {
  // "locked" = containment is active OR post-containment stun. No
  // input-driven movement, no jump firing. Gravity + current vx decay
  // still apply below.
  const inputX = locked ? 0 : (rightDown() ? 1 : 0) - (leftDown() ? 1 : 0)
  if (inputX !== 0)
    p.facing = inputX === 1 ? 1 : -1

  // Buffer a jump press even if we're not yet grounded — it fires on touchdown.
  if (!locked && jumpPressed())
    p.bufferTimer = CONFIG.JUMP_BUFFER

  // Degradation modifiers (post-controller). Base numbers unchanged —
  // we only scale their output. The body is failing; the controller
  // isn't.
  const instab = p.instability.value / CONFIG.INSTABILITY_MAX
  const effectiveMaxRun = CONFIG.MAX_RUN * (1 + instab * CONFIG.DEGRADE_OVERSPEED)

  // Horizontal acceleration. Turnaround boost kicks in when input opposes vx.
  const targetVx = inputX * effectiveMaxRun
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

  // Damping reduction: whenever we're applying a deceleration (input is
  // zero, or turning against current velocity), scale the effective
  // response down as instability rises. Accelerating in-direction keeps
  // full responsiveness — so the feeling is "I can still go, I just
  // can't stop." No change to base accel/decel constants.
  const currentSign = Math.sign(p.vx)
  const intendSign = inputX === 0 ? -currentSign : Math.sign(inputX)
  const decelerating = currentSign !== 0 && intendSign === -currentSign
  if (decelerating)
    accel *= 1 - instab * CONFIG.DEGRADE_DAMPING_REDUCTION

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

// Kill + reset. The world does not forgive — destruction is wiped on death.
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
  p.lastRupture = null
  p.groundNormal = null
  p.dropThroughTimer = 0
  resetInstability(p.instability)
  resetLevel(level)
}

export function updatePlayer(
  p: Player,
  level: Level,
  fx: FxState,
  broadphase: BroadphaseGrid,
  now: number,
  dt: number,
): void {
  if (!p.alive)
    return // respawn handled one tick later by game.ts

  // `lastRupture` is an ephemeral renderer handle. Drop it once the
  // i-frame window closes — by then flash/shake/debris are all finished.
  if (p.lastRupture && p.iframeTimer <= 0)
    p.lastRupture = null

  // ─── deferred fracture ──────────────────────────────────────
  // Fires at the top of the tick AFTER instability hit max, so the
  // renderer got one guaranteed frame to show the preview at peak.
  // Hitstop is triggered inside triggerFractureFx — game.ts skips the
  // next few ticks based on fx.hitstopTicks.
  if (p.instability.fractureQueued) {
    const cx = p.x + p.w / 2
    const cy = p.y + p.h / 2
    const rupture = performRupture(level, cx, cy, p.vx, p.vy, now)
    p.vx = rupture.impulse.x
    p.vy = rupture.impulse.y
    p.iframeTimer = CONFIG.FRACTURE_IFRAMES
    p.grounded = false // launch clears ground contact for the next tick
    p.lastRupture = rupture
    onFractured(p.instability)
    triggerFractureFx(fx, rupture)
    // Consume the rest of this tick — the rupture IS the tick's action.
    return
  }

  // Timers
  if (p.coyoteTimer > 0)
    p.coyoteTimer -= dt
  if (p.bufferTimer > 0)
    p.bufferTimer -= dt
  if (p.iframeTimer > 0)
    p.iframeTimer -= dt
  if (p.dropThroughTimer > 0)
    p.dropThroughTimer -= dt

  p.jumpedThisTick = false

  // Drop-through: down + jump while standing on a one-way platform.
  // Arms a short timer during which physics ignores one-way colliders.
  if (downDown() && jumpPressed() && p.grounded)
    p.dropThroughTimer = CONFIG.ONE_WAY_DROPTHROUGH_TIME

  // Containment state: holding V/Shift with no stun and not fracturing
  // locks movement this tick. The instability module decides the
  // authoritative state + draining; we just need to know up-front to
  // gate input.
  const locked
    = containHeld() && p.instability.containmentStunTimer <= 0 && !p.instability.fractureQueued

  handleInput(p, dt, locked)

  // Slope projection: if grounded on a slope, re-express horizontal intent
  // as tangent-aligned velocity so we walk up at full input speed.
  applySlopeProjection(p)

  // Gravity is suppressed while grounded on a walkable surface — otherwise
  // it accumulates under our feet and causes jitter against the slope.
  // Jumping (p.jumpedThisTick) cleared p.grounded already.
  if (!p.grounded) {
    const instabRatio = p.instability.value / CONFIG.INSTABILITY_MAX
    const gravMult = 1 + instabRatio * CONFIG.DEGRADE_GRAVITY_AMP
    const gravity = (p.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY) * gravMult
    p.vy += gravity * dt
    if (p.vy > CONFIG.MAX_FALL)
      p.vy = CONFIG.MAX_FALL
  }

  // Capture pre-collision vy so we can score landing impact.
  const prevVy = p.vy
  const wasGrounded = p.grounded

  broadphase.build(level)
  // Substep the move + collide at 120 Hz (2 × 60 Hz). Slopes need this
  // precision or the MTV overshoots and pops the player into the air.
  const subDt = dt / CONFIG.PHYSICS_SUBSTEPS
  for (let i = 0; i < CONFIG.PHYSICS_SUBSTEPS; i++)
    moveAndCollide(p, level, subDt, broadphase)

  // Stick-to-ground — prevents launching off small downslope bumps when
  // we were grounded last frame and only lost contact this tick.
  if (wasGrounded && !p.grounded && !p.jumpedThisTick)
    tryStickToGround(p, broadphase)

  // Landing impact (measured at peak vy before collision stopped us).
  // Zero if we weren't actually airborne before this tick.
  const landed = !wasGrounded && p.grounded
  const landedImpactVy = landed ? Math.max(0, prevVy) : 0

  // Arm coyote window iff we just walked off an edge.
  if (wasGrounded && !p.grounded && p.vy >= 0) {
    p.coyoteTimer = CONFIG.COYOTE_TIME
  }

  // Lethal overlap AFTER movement. Shards (left by broken glass) kill on
  // AABB overlap. In FAULTLINE the only thing that can hurt you is what
  // you broke — "you don't die, you break."
  if (overlapsLethal(level, p.x, p.y, p.w, p.h)) {
    die(p, level)
    return
  }

  // Fall-out safety net — if you carve too greedily you just die.
  if (p.y > level.worldHeight + 100) {
    die(p, level)
    return
  }

  // "Pressed into a wall while moving" — input direction must match the
  // wall side we just collided with.
  const inputX = locked ? 0 : (rightDown() ? 1 : 0) - (leftDown() ? 1 : 0)
  const wallMoving = p.touchingWall && inputX !== 0

  updateInstability(
    p.instability,
    {
      grounded: p.grounded,
      vxAbs: Math.abs(p.vx),
      jumpedThisTick: p.jumpedThisTick,
      landedImpactVy,
      touchingWallMoving: wallMoving,
      containHeld: containHeld(),
      iframes: p.iframeTimer > 0,
    },
    dt,
  )
}
