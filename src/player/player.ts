import type { FxState } from '../render/fx'
import type { InstabilityState } from './instability'
import type { Vec2 } from '../shared-kernel/vec2'
import type { BroadphaseGrid } from '../physics/broadphase'
import type { ParticleSystem } from '../render/particles'
import type { RuptureResult } from '../combat/rupture'
import type { Level, MaterialName } from '../world/level'
import type { BulletKindName } from '../combat/bullet'
import { CONFIG } from '../config'
import { emit } from '../session/eventBus'
import { triggerFractureFx } from '../render/fx'
import { gameState } from '../session/gameState'
import { emitFractureBurst } from '../render/particles'
import {
  containHeld,
  downDown,
  jumpPressed,
  jumpReleased,
  leftDown,
  rightDown,
} from '../input/input'
import {
  addInstability,
  createInstabilityState,
  onFractured,
  resetInstability,
  updateInstability,
} from './instability'
import { applySlopeProjection, moveAndCollide, overlapsLethal, tryStickToGround } from '../physics'
import { performRupture } from '../combat/rupture'
import { resetLevel } from '../world/level'

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
  wallSide: -1 | 0 | 1 // -1 = wall on left, 1 = wall on right, 0 = no wall
  wallSliding: boolean // true when sliding on a wall (input toward wall + airborne)
  wallStickTimer: number // grace period after leaving wall where wall-jump still works
  wallJumpInputLock: number // seconds remaining where input toward wall is suppressed
  airSnapTimer: number // seconds remaining in post-jump amplified air control window
  jumpedThisTick: boolean // set only on ticks where a jump actually fired
  iframeTimer: number // post-fracture invulnerability window
  hazardIframe: number // post-hit invulnerability window (hazards only — separate from iframeTimer)
  hp: number // current hit points
  maxHp: number // max hit points (refilled on respawn)
  alive: boolean // false ⇒ game.ts triggers a respawn at frame end

  // Polygon-world bookkeeping. groundNormal is the last frame's grounded
  // contact; slope projection + stick-to-ground both read it. null while
  // airborne.
  groundNormal: Vec2 | null
  groundMaterial: MaterialName | null // material of the collider we're standing on
  resonantChain: number // consecutive resonant contacts without touching other ground
  dropThroughTimer: number // seconds remaining where one-way platforms are ignored

  // Double jump
  doubleJumpAvailable: boolean // reset on ground/wall contact, consumed on DJ
  djGlowTimer: number // seconds remaining of glitch-glow effect (0 = inactive)
  djFiredThisTick: boolean // true only on the tick a double jump fires

  // Renderer handle for the last rupture — cleared once iframes close.
  lastRupture: RuptureResult | null

  // Currently equipped weapon. Set to 'slug' on spawn/respawn; overwritten
  // when the player collects a weapon pickup.
  currentWeapon: BulletKindName
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
    wallSide: 0,
    wallSliding: false,
    wallStickTimer: 0,
    wallJumpInputLock: 0,
    airSnapTimer: 0,
    jumpedThisTick: false,
    iframeTimer: 0,
    hazardIframe: 0,
    hp: CONFIG.PLAYER_MAX_HP,
    maxHp: CONFIG.PLAYER_MAX_HP,
    alive: true,
    lastRupture: null,
    groundNormal: null,
    groundMaterial: null,
    resonantChain: 0,
    dropThroughTimer: 0,
    doubleJumpAvailable: false,
    djGlowTimer: 0,
    djFiredThisTick: false,
    currentWeapon: 'slug',
  }
}

function handleInput(p: Player, dt: number, locked: boolean): void {
  // "locked" = containment is active OR post-containment stun. No
  // input-driven movement, no jump firing. Gravity + current vx decay
  // still apply below.
  let inputX = locked ? 0 : (rightDown() ? 1 : 0) - (leftDown() ? 1 : 0)

  // Wall-jump input lock: suppress input TOWARD the wall we just jumped from.
  // This prevents immediately re-sticking and makes wall-jumps feel decisive.
  if (p.wallJumpInputLock > 0) {
    p.wallJumpInputLock -= dt
    if (inputX === p.wallSide)
      inputX = 0
  }

  if (inputX !== 0)
    p.facing = inputX === 1 ? 1 : -1

  // Buffer a jump press even if we're not yet grounded — it fires on touchdown.
  if (!locked && jumpPressed())
    p.bufferTimer = CONFIG.JUMP_BUFFER

  // Degradation modifiers (post-controller). Base numbers unchanged —
  // we only scale their output. The body is failing; the controller isn't.
  const instab = p.instability.value / CONFIG.INSTABILITY_MAX
  const effectiveMaxRun = CONFIG.MAX_RUN * (1 + instab * CONFIG.DEGRADE_OVERSPEED)

  // ─── wall slide detection ─────────────────────────────────────────
  // Airborne + touching wall + holding input toward wall = wall slide.
  const canWallSlide = !p.grounded && p.touchingWall && p.wallSide !== 0
    && inputX === p.wallSide && p.vy >= 0
  p.wallSliding = canWallSlide

  // Wall stick timer: grace period after leaving a wall where wall-jump
  // is still valid. Starts when we WERE touching and now aren't.
  if (p.touchingWall && p.wallSide !== 0 && !p.grounded) {
    p.wallStickTimer = CONFIG.WALL_STICK_TIME
  }
  else if (p.wallStickTimer > 0) {
    p.wallStickTimer -= dt
  }

  // ─── horizontal acceleration ──────────────────────────────────────
  const targetVx = inputX * effectiveMaxRun
  let accel: number
  if (inputX !== 0) {
    const turning = p.vx !== 0 && Math.sign(inputX) !== Math.sign(p.vx)
    if (p.grounded) {
      accel = CONFIG.GROUND_ACCEL
    }
    else {
      accel = CONFIG.AIR_ACCEL
      // Air snap: boosted control right after a jump
      if (p.airSnapTimer > 0)
        accel *= CONFIG.AIR_SNAP_MULT
      // Air brake: boosted decel when reversing direction mid-air
      if (turning)
        accel *= CONFIG.AIR_BRAKE_MULT
    }
    if (turning)
      accel *= CONFIG.TURN_BOOST
  }
  else {
    accel = p.grounded ? CONFIG.GROUND_DECEL : CONFIG.AIR_DECEL
    if (!p.grounded && p.airSnapTimer > 0)
      accel *= CONFIG.AIR_SNAP_MULT
  }

  // Instability damping reduction: harder to stop, NOT harder to start.
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

  // ─── jump: ground, coyote, OR wall ───────────────────────────────
  const canGroundJump = !locked && (p.grounded || p.coyoteTimer > 0)
  const canWallJump = !locked && !p.grounded
    && (p.touchingWall || p.wallStickTimer > 0) && p.wallSide !== 0
  let firedJump = false

  if (p.bufferTimer > 0 && (canGroundJump || canWallJump)) {
    if (canGroundJump) {
      // ─── ground / coyote jump ────────────────────────────────────
      let jumpV = CONFIG.JUMP_VELOCITY

      // Resonant momentum inheritance
      if (p.groundMaterial === 'resonant') {
        const chainBonus = Math.max(0, p.resonantChain - 1) * CONFIG.RESONANT_CHAIN_JUMP_BONUS
        jumpV *= CONFIG.RESONANT_JUMP_BOOST + chainBonus
      }

      p.vy = -jumpV
      p.grounded = false
    }
    else {
      // ─── wall jump ───────────────────────────────────────────────
      // Strong horizontal impulse AWAY from wall + vertical boost.
      const awayDir = -p.wallSide as -1 | 1
      p.vx = awayDir * CONFIG.WALL_JUMP_VX
      p.vy = -CONFIG.WALL_JUMP_VY
      p.facing = awayDir
      p.wallJumpInputLock = CONFIG.WALL_JUMP_INPUT_LOCK
      p.wallSliding = false
      p.wallStickTimer = 0
    }

    p.bufferTimer = 0
    p.coyoteTimer = 0
    p.airSnapTimer = CONFIG.AIR_SNAP_WINDOW
    firedJump = true
    p.jumpedThisTick = true
  }

  // ─── double jump: mid-air correction ────────────────────────────
  // Fires when: airborne, no ground/wall jump was available, DJ not consumed.
  // "A deliberate correction or escape, not a second chance float."
  p.djFiredThisTick = false
  if (!firedJump && p.bufferTimer > 0 && !locked
    && !p.grounded && p.doubleJumpAvailable) {
    // Preserve horizontal momentum with slight directional influence
    p.vx = p.vx * CONFIG.DJ_MOMENTUM_KEEP + inputX * CONFIG.DJ_HORIZONTAL_INFLUENCE
    // Strong upward impulse — kills existing vy first for precision
    p.vy = -CONFIG.DJ_VELOCITY
    p.doubleJumpAvailable = false
    p.djGlowTimer = CONFIG.DJ_GLOW_DURATION
    p.djFiredThisTick = true
    p.airSnapTimer = CONFIG.AIR_SNAP_WINDOW
    p.bufferTimer = 0
    firedJump = true
    p.jumpedThisTick = true
    addInstability(p.instability, CONFIG.DJ_INSTABILITY_GAIN)
  }

  // Air snap timer decay
  if (p.airSnapTimer > 0)
    p.airSnapTimer -= dt

  // Variable jump height: release-to-cut. Skip on the tick a jump fires.
  if (!firedJump && jumpReleased() && p.vy < 0) {
    p.vy *= CONFIG.JUMP_CUT_MULT
  }
}

// Kill + reset. The world does not forgive — destruction is wiped on death.
// `cause` distinguishes hazard-kill from fall-out for results reporting
// and for the death-feedback freeze applied by game.ts.
function die(p: Player, level: Level, cause: 'hazard' | 'fallout'): void {
  p.alive = false
  p.vx = 0
  p.vy = 0
  resetLevel(level)
  gameState.deaths += 1
  gameState.phase = 'dead'
  gameState.deathFreezeEndsAt = performance.now() + CONFIG.DEATH_FREEZE_MS
  emit('playerDied', { x: p.x + p.w / 2, y: p.y + p.h / 2, cause })
}

// Apply a damaging hit at (sourceX, sourceY). Gated by hazard-iframe window.
// On HP depletion, dies (which also resets the level). Fall-out death skips
// this path — HP doesn't save you from the void.
export function takeHit(
  p: Player,
  level: Level,
  sourceX: number,
  sourceY: number,
  damage: number,
): void {
  if (!p.alive || p.hazardIframe > 0)
    return
  p.hp = Math.max(0, p.hp - damage)
  p.hazardIframe = CONFIG.HAZARD_IFRAMES

  // Knockback away from the source: horizontal by sign, small vertical pop.
  const cx = p.x + p.w / 2
  const cy = p.y + p.h / 2
  const dir = cx >= sourceX ? 1 : -1
  p.vx = dir * CONFIG.HAZARD_KNOCKBACK_VX
  p.vy = cy > sourceY ? -CONFIG.HAZARD_KNOCKBACK_VY : CONFIG.HAZARD_KNOCKBACK_VY * 0.5
  p.grounded = false

  if (p.hp <= 0)
    die(p, level, 'hazard')
}

// Put the player back at the spawn with a fresh state. Called by game.ts
// after a death (on the next frame) so the death visuals can land first.
// Uses GameState.lastSpawnPoint if the player has touched a checkpoint;
// otherwise falls back to the level's authored spawn.
export function respawn(p: Player, level: Level): void {
  const sp = gameState.lastSpawnPoint
  // Checkpoints are centered on the zone; subtract half-extent so the
  // player AABB lands at the zone center instead of overshooting.
  p.x = sp ? sp.x - p.w / 2 : level.spawn.x
  p.y = sp ? sp.y - p.h / 2 : level.spawn.y
  p.vx = 0
  p.vy = 0
  p.grounded = false
  p.coyoteTimer = 0
  p.bufferTimer = 0
  p.facing = 1
  p.touchingWall = false
  p.wallSide = 0
  p.wallSliding = false
  p.wallStickTimer = 0
  p.wallJumpInputLock = 0
  p.airSnapTimer = 0
  p.jumpedThisTick = false
  p.iframeTimer = 0
  p.hazardIframe = CONFIG.RESPAWN_IFRAMES
  p.hp = CONFIG.PLAYER_MAX_HP
  p.maxHp = CONFIG.PLAYER_MAX_HP
  p.alive = true
  p.lastRupture = null
  p.groundNormal = null
  p.groundMaterial = null
  p.resonantChain = 0
  p.dropThroughTimer = 0
  p.doubleJumpAvailable = false
  p.djGlowTimer = 0
  p.djFiredThisTick = false
  p.currentWeapon = 'slug'
  resetInstability(p.instability)
  resetLevel(level)
}

export function updatePlayer(
  p: Player,
  level: Level,
  fx: FxState,
  broadphase: BroadphaseGrid,
  particles: ParticleSystem,
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
    triggerFractureFx(fx)
    // Dominant material of the break drives debris tinting. Fall back to bone
    // if we carved empty air.
    const firstDestroyed = rupture.affected.find(a => a.destroyed)
    const mat = firstDestroyed?.prevMaterial ?? 'bone'
    const dom = mat === 'glass' || mat === 'soft' || mat === 'resonant' ? mat : 'bone'
    emitFractureBurst(particles, cx, cy, dom, p.vx, p.vy)
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
  if (p.hazardIframe > 0)
    p.hazardIframe -= dt
  if (p.dropThroughTimer > 0)
    p.dropThroughTimer -= dt
  if (p.djGlowTimer > 0)
    p.djGlowTimer -= dt

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
    if (p.wallSliding) {
      // Wall slide: reduced gravity — controlled descent.
      if (p.vy < CONFIG.WALL_SLIDE_SPEED)
        p.vy = Math.min(p.vy + CONFIG.WALL_SLIDE_ACCEL * dt, CONFIG.WALL_SLIDE_SPEED)
      else if (p.vy > CONFIG.WALL_SLIDE_SPEED)
        p.vy = Math.max(p.vy - CONFIG.WALL_SLIDE_ACCEL * dt, CONFIG.WALL_SLIDE_SPEED)
    }
    else {
      // Normal gravity — no instability penalty (DEGRADE_GRAVITY_AMP is 0).
      const gravity = p.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY
      p.vy += gravity * dt
      if (p.vy > CONFIG.MAX_FALL)
        p.vy = CONFIG.MAX_FALL
    }
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

  // Double jump resets on ground or wall contact — you earn it by landing.
  if (p.grounded || (p.touchingWall && p.wallSide !== 0)) {
    p.doubleJumpAvailable = true
  }

  // Lethal overlap AFTER movement. Shards (left by broken glass) hit on
  // AABB overlap — now costs HP instead of instant-killing. In FAULTLINE the
  // only thing that can hurt you is what you broke.
  if (overlapsLethal(level, p.x, p.y, p.w, p.h) && p.hazardIframe <= 0) {
    takeHit(p, level, p.x + p.w / 2, p.y + p.h / 2, 1)
    if (!p.alive)
      return
  }

  // Fall-out safety net — HP does not save you from falling off the map.
  if (p.y > level.worldHeight + 100) {
    die(p, level, 'fallout')
    return
  }

  // Zone overlap — goal + spawn point. Checked after movement so the player
  // can't tunnel past a thin goal rectangle on a fast frame.
  for (const z of level.zones) {
    if (p.x + p.w <= z.x || p.x >= z.x + z.w)
      continue
    if (p.y + p.h <= z.y || p.y >= z.y + z.h)
      continue
    if (z.type === 'goal' && gameState.phase === 'gameplay') {
      gameState.phase = 'results'
      emit('levelComplete', {
        levelId: gameState.currentLevelId,
        deaths: gameState.deaths,
        timeMs: performance.now() - gameState.startTime,
      })
      break
    }
    if (z.type === 'spawnPoint') {
      const cx = z.x + z.w / 2
      const cy = z.y + z.h / 2
      const prev = gameState.lastSpawnPoint
      if (!prev || prev.x !== cx || prev.y !== cy) {
        gameState.lastSpawnPoint = { x: cx, y: cy }
        emit('checkpointReached', { x: cx, y: cy })
      }
    }
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
