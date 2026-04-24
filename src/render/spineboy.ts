// ─── Spineboy bridge ─────────────────────────────────────────────────────────
// Owns the Spine instance, the visual FSM, and translates Player state into
// animation track commands. Replaces the custom src/character/ procedural rig
// + src/render/characterBridge.ts.
//
// What the old system did (audit from removal):
//   - characterBridge.ts: createCharacterBridge / syncCharacter / resetCharacterBridge
//     called from render.ts; FSM (IDLE/RUN/JUMP/FALL/LAND/WALL_SLIDE); land self-
//     resolving; instability jitter applied externally; alpha blinked on iframes.
//   - character/ rig: hand-rolled PIXI skeleton + GSAP pose tweening, glow layer.
//
// New contract:
//   - loadSpineboyAssets(): Assets.add + Assets.load for skel/atlas (call before game init).
//   - createSpineboyBridge(): build the Spine instance, wire state.setMix table.
//   - updateSpineboyVisual(bridge, player, dt): render-phase — drives FSM, spine.update(dt),
//     position/flip/alpha. Called once per rendered frame from render.ts.
//   - resetSpineboyBridge(bridge): on respawn.
//
// Render-buffer note: FAULTLINE renders full-resolution antialiased vector art
// (main.ts sets autoDensity:true, roundPixels:false, resolution up to 2). So the
// Spine skeleton draws cleanly at native device resolution inside worldContainer —
// no low-res pixel-snap or overlay-camera-mirror tricks needed.

import type { Container } from 'pixi.js'
import type { Player } from '../player'
import { Spine } from '@esotericsoftware/spine-pixi-v8'
import { Assets } from 'pixi.js'

// ─── asset aliases ────────────────────────────────────────────────────────────
const SKEL_ALIAS = 'spineboy-skel'
const ATLAS_ALIAS = 'spineboy-atlas'

// ─── tunables ─────────────────────────────────────────────────────────────────
export const SPINE_CONFIG = {
  // Skeleton origin is at the feet. Visual height ≈ 0.22 × native (~400px) ≈ 88px.
  // AABB is 12×14 — character is bigger than AABB on purpose for readability.
  scale: 0.22,
  // Feet of Spineboy live at skeleton y=0. AABB's feet = player.y + player.h.
  // Lift the spine by a couple px to plant feet naturally; tune by eye.
  yOffset: 0,

  // Ground flip has a threshold so micro-reversals don't whip the sprite.
  // Airborne flips are instant — mid-air direction changes should commit.
  flipThresholdSec: 0.08,

  // Minimum time visual states hold for before derivation can replace them.
  // Without these, LAND snaps back to IDLE on frame 2 and never plays.
  landMinSec: 0.18,
  wallJumpMinSec: 0.18,
  hurtMinSec: 0.25,

  // Air-state thresholds (reads vy in px/s — Player uses seconds, not ticks).
  jumpVyThreshold: -30,
  fallVyThreshold: 60,

  // Invincibility flash (hazard i-frames).
  iframeFlashHz: 10,
  iframeAlphaLow: 0.3,
} as const

// ─── asset loading ────────────────────────────────────────────────────────────
let _assetsLoaded = false

export async function loadSpineboyAssets(): Promise<void> {
  if (_assetsLoaded)
    return
  Assets.add({ alias: SKEL_ALIAS, src: '/assets/spineboy/spineboy-pro.skel' })
  Assets.add({ alias: ATLAS_ALIAS, src: '/assets/spineboy/spineboy-pma.atlas' })
  await Assets.load([SKEL_ALIAS, ATLAS_ALIAS])
  _assetsLoaded = true
}

// ─── gun stances ──────────────────────────────────────────────────────────────
// Spineboy 4.2 only ships one 'aim' animation, so stances are mostly about
// *where* we let the muzzle actually point regardless of what the anim says.
// Each stance chooses an upper-body track-1 animation + post-processes the
// bone-derived aim direction before bullets spawn:
//
//   hip      — no track-1 override (gun hangs per idle). Mitigation near-1
//              forces bullets to fly horizontally despite the hanging gun —
//              looks more off-hand, still playable.
//   forward  — track 1 locked to 'aim'. Mild mitigation, slight upward bias
//              to compensate for the aim anim's tiny downward tilt.
//   high     — same anim, strong upward bias (diagonal-up shots).
//   low      — same anim, strong downward bias (diagonal-down shots).
//
// Future: if real up-aim / down-aim animations get authored, swap their
// track-1 refs in and drop mitigation toward 0.
export type GunStance = 'hip' | 'forward' | 'high' | 'low'

interface StanceDef {
  track1Anim: string | null
  mitigation: number // 0 = trust bone aim fully, 1 = ignore bone, pure facing
  biasY: number // added to direction Y before renormalize (negative = up)
}

// Forward stance trusts the bone aim almost completely — Spineboy's 'aim'
// animation already holds the gun horizontal, and the user expects bullets
// to travel in that visible direction (bone direction = gun barrel). A
// small mitigation only damps mid-animation sway. Hip has no aim overlay so
// the gun hangs; we force-horizontalize that case. High/low stances are
// tilts applied on top of the horizontal-mitigated direction.
const STANCES: Record<GunStance, StanceDef> = {
  hip: { track1Anim: null, mitigation: 0.95, biasY: 0 },
  forward: { track1Anim: 'aim', mitigation: 0.2, biasY: 0 },
  high: { track1Anim: 'aim', mitigation: 0.4, biasY: -0.5 },
  low: { track1Anim: 'aim', mitigation: 0.4, biasY: 0.5 },
}

export const STANCE_ORDER: readonly GunStance[] = ['forward', 'high', 'low', 'hip']

// ─── visual state ─────────────────────────────────────────────────────────────
export type VisualState
  = | 'idle'
    | 'run'
    | 'jump'
    | 'fall'
    | 'land'
    | 'wallslide'
    | 'walljump'
    | 'hurt'
    | 'death'

const TRANSITIONS: Record<VisualState, readonly VisualState[]> = {
  idle: ['run', 'jump', 'fall', 'wallslide', 'hurt', 'death'],
  run: ['idle', 'jump', 'fall', 'wallslide', 'hurt', 'death'],
  jump: ['fall', 'land', 'wallslide', 'walljump', 'hurt', 'death'],
  fall: ['land', 'wallslide', 'walljump', 'hurt', 'death'],
  wallslide: ['walljump', 'fall', 'land', 'hurt', 'death'],
  walljump: ['fall', 'jump', 'wallslide', 'hurt', 'death'],
  land: ['idle', 'run', 'hurt', 'jump', 'fall'],
  hurt: ['idle', 'run', 'fall', 'death'],
  death: [],
}

// Animation-name mapping, built from the real skeleton's animations list logged
// at boot. Spineboy 4.2 ships: aim, death, hoverboard, idle, idle-turn, jump,
// portal, run, run-to-idle, shoot, walk.
// resolvedAnim() falls back to 'idle' if a name is absent — safety net, not a
// cover for guessing. Everything below was confirmed present in the log.
// FUTURE: 'aim', 'shoot', 'portal', 'hoverboard', 'idle-turn', 'walk' exist but
// the player can't currently trigger them. Unlocked by: aiming/firing a weapon,
// a level-transition portal effect, vehicle/board states, slow-walk context.
const ANIM: Record<VisualState, { name: string, loop: boolean }> = {
  idle: { name: 'idle', loop: true },
  run: { name: 'run', loop: true },
  jump: { name: 'jump', loop: false },
  // No dedicated 'fall' — holding 'jump' at its last frame reads as fall.
  fall: { name: 'jump', loop: false },
  // No dedicated 'land'. 'run-to-idle' is a ~400ms recovery that reads as
  // landing-and-settling; min-duration lock keeps it from getting stomped.
  land: { name: 'run-to-idle', loop: false },
  // No wall-cling pose. Holding 'jump' mid-pose with arms out reads tolerably.
  // FUTURE: author a true wall-cling animation if wall play becomes central.
  wallslide: { name: 'jump', loop: false },
  // No dedicated 'walljump'. 'jump' replays from frame 0 on re-entry.
  walljump: { name: 'jump', loop: false },
  // No dedicated 'hurt'. Using 'death' briefly reads as a flinch; min-duration
  // lock in deriveTarget caps how long it plays before recovery.
  hurt: { name: 'death', loop: false },
  death: { name: 'death', loop: false },
}

// ─── bridge ───────────────────────────────────────────────────────────────────
export interface SpineboyBridge {
  readonly spine: Spine
  readonly container: Container
  state: VisualState
  stateAge: number // seconds since last state change
  facing: 1 | -1
  facingTimer: number // seconds player has intended new direction
  wasGrounded: boolean
  wasAlive: boolean
  prevWallSliding: boolean
  prevWallJumpLock: number
  flashPhase: number
  // Muzzle snapshot — updated each render tick from bone world coords. Bullets
  // read this to match the visibly-drawn aim (gun swing mid-jump, etc). Pixi
  // world coords (relative to spine's parent container, which is worldContainer,
  // so they line up with bullet/collider coords). muzzleReady is false until
  // the first render-phase update populates them.
  muzzleReady: boolean
  muzzleX: number
  muzzleY: number
  muzzleDirX: number
  muzzleDirY: number
  stance: GunStance
}

// Animation-name resolution: fall back to 'idle' if mapped name is absent.
function resolvedAnim(spine: Spine, v: VisualState): { name: string, loop: boolean } {
  const want = ANIM[v]
  const data = spine.skeleton.data
  if (data.findAnimation(want.name))
    return want
  console.warn(`[spineboy] missing animation '${want.name}' for state '${v}', falling back to 'idle'`)
  return { name: 'idle', loop: true }
}

export function createSpineboyBridge(): SpineboyBridge {
  const spine = Spine.from({
    skeleton: SKEL_ALIAS,
    atlas: ATLAS_ALIAS,
    scale: SPINE_CONFIG.scale,
    autoUpdate: false, // we drive update() with wall-clock dt
  })

  // Log the full animation + bone lists once per boot — ground-truth for
  // mapping. console.warn (not log) because the project's eslint disallows
  // console.log.
  const animNames = spine.skeleton.data.animations.map(a => a.name)
  const boneNames = spine.skeleton.data.bones.map(b => b.name)
  console.warn('[spineboy] animations:', animNames.join(', '))
  console.warn('[spineboy] bones:', boneNames.join(', '))

  // Mix table — crossfades between common transitions. Only reference names
  // that exist in the skeleton: aim, death, hoverboard, idle, idle-turn, jump,
  // portal, run, run-to-idle, shoot, walk.
  const sd = spine.state.data
  sd.defaultMix = 0.12
  sd.setMix('idle', 'run', 0.15)
  sd.setMix('run', 'idle', 0.20)
  sd.setMix('idle', 'jump', 0.08)
  sd.setMix('run', 'jump', 0.08)
  sd.setMix('jump', 'run-to-idle', 0.04) // land — snap on impact
  sd.setMix('run-to-idle', 'idle', 0.20)
  sd.setMix('run-to-idle', 'run', 0.15)
  sd.setMix('death', 'idle', 0.25)

  // Kick off idle on track 0.
  const firstAnim = resolvedAnim(spine, 'idle')
  spine.state.setAnimation(0, firstAnim.name, firstAnim.loop)

  // Apply the default stance's track-1 animation. setStance() below drives
  // this going forward; the initial call plants the forward-aim pose.

  const bridge: SpineboyBridge = {
    spine,
    container: spine as unknown as Container,
    state: 'idle',
    stateAge: 0,
    facing: 1,
    facingTimer: 0,
    wasGrounded: false,
    wasAlive: true,
    prevWallSliding: false,
    prevWallJumpLock: 0,
    flashPhase: 0,
    muzzleReady: false,
    muzzleX: 0,
    muzzleY: 0,
    muzzleDirX: 1,
    muzzleDirY: 0,
    stance: 'forward',
  }
  return applyStanceTrack(bridge, 'forward')
}

function applyStanceTrack(bridge: SpineboyBridge, stance: GunStance): SpineboyBridge {
  bridge.stance = stance
  const def = STANCES[stance]
  if (def.track1Anim && bridge.spine.skeleton.data.findAnimation(def.track1Anim))
    bridge.spine.state.setAnimation(1, def.track1Anim, true)
  else
    bridge.spine.state.setEmptyAnimation(1, 0.15)
  return bridge
}

// Public setter — swap stance with a short cross-fade. Called from the game
// loop on user input or by AI-driven stance changes later.
export function setStance(bridge: SpineboyBridge, stance: GunStance): void {
  if (bridge.stance === stance)
    return
  applyStanceTrack(bridge, stance)
}

export function cycleStance(bridge: SpineboyBridge): GunStance {
  const i = STANCE_ORDER.indexOf(bridge.stance)
  const next = STANCE_ORDER[(i + 1) % STANCE_ORDER.length]!
  applyStanceTrack(bridge, next)
  return next
}

// Snapshot the muzzle position + aim direction from the live bone transforms.
//
// Coordinate convention (verified empirically against the loaded skeleton):
// spine-pixi-v8 delivers bone world transforms in Y-DOWN space (same as Pixi).
// So `spine.y + bone.worldY * scale.y` is the correct Pixi pixel position —
// do NOT negate the Y term. And `(bone.a, bone.c)` is already the bone's
// world X-axis in Y-down, so direction components don't need a Y flip.
//
// Direction source: the `crosshair` bone. Spineboy's 'aim' animation drives
// hand/arm poses via IK that targets this bone — its X-axis IS the authored
// aim direction (horizontal at rest). That gives us "gun points where the
// rig says it's pointing" for free, without reconstructing a vector from
// (gun → gun-tip) which encodes the gun's *tilt* rather than its *aim*.
//
// The raw direction gets post-processed per stance:
//   1) Blend toward pure-horizontal facing by `mitigation` — reduces sway so
//      the gun doesn't wildly change aim during jump/run animations.
//   2) Add `biasY` to the direction Y and renormalize — shifts aim up/down
//      for high/low stances without needing per-stance animations.
function snapshotMuzzle(bridge: SpineboyBridge): void {
  const sk = bridge.spine.skeleton
  const tip = sk.findBone('muzzle') ?? sk.findBone('gun-tip') ?? sk.findBone('front-fist') ?? sk.findBone('hip')
  if (!tip) {
    bridge.muzzleReady = false
    return
  }
  const sx = bridge.spine.scale.x
  const sy = bridge.spine.scale.y
  bridge.muzzleX = bridge.spine.x + tip.worldX * sx
  bridge.muzzleY = bridge.spine.y + tip.worldY * sy

  // Aim direction from the crosshair bone's X-axis (or tip's as fallback).
  const aimBone = sk.findBone('crosshair') ?? tip
  const flipSign = Math.sign(sx || 1)
  let rawX = aimBone.a * flipSign
  let rawY = aimBone.c
  const rawLen = Math.hypot(rawX, rawY)
  if (rawLen > 0.01) {
    rawX /= rawLen
    rawY /= rawLen
  }
  else {
    rawX = bridge.facing
    rawY = 0
  }

  // Stance-driven post-process.
  const def = STANCES[bridge.stance]
  const horizX = bridge.facing
  const horizY = 0
  let dx = rawX * (1 - def.mitigation) + horizX * def.mitigation
  let dy = rawY * (1 - def.mitigation) + horizY * def.mitigation + def.biasY
  const len = Math.hypot(dx, dy)
  if (len > 0.01) {
    dx /= len
    dy /= len
  }
  bridge.muzzleDirX = dx
  bridge.muzzleDirY = dy
  bridge.muzzleReady = true
}

// Call after firing a bullet to play the upper-body shoot overlay and
// immediately queue the current stance's aim animation back on the same
// track so arms don't get stuck in the shoot pose. If the stance has no
// track-1 anim (hip), we return to empty instead.
export function triggerShootOverlay(bridge: SpineboyBridge): void {
  const hasShoot = bridge.spine.skeleton.data.findAnimation('shoot')
  if (!hasShoot)
    return
  bridge.spine.state.setAnimation(1, 'shoot', false)
  const def = STANCES[bridge.stance]
  if (def.track1Anim && bridge.spine.skeleton.data.findAnimation(def.track1Anim))
    bridge.spine.state.addAnimation(1, def.track1Anim, true, 0)
  else
    bridge.spine.state.addEmptyAnimation(1, 0.18, 0)
}

function canTransition(from: VisualState, to: VisualState): boolean {
  if (from === to)
    return false
  return TRANSITIONS[from].includes(to)
}

function setVisualState(bridge: SpineboyBridge, next: VisualState): void {
  if (!canTransition(bridge.state, next)) {
    if (next !== bridge.state)
      console.warn(`[spineboy] illegal transition ${bridge.state} → ${next}`)
    return
  }
  bridge.state = next
  bridge.stateAge = 0
  const a = resolvedAnim(bridge.spine, next)
  bridge.spine.state.setAnimation(0, a.name, a.loop)
}

// Two-phase visual state derivation:
//   1. Event transitions (edges — fire exactly once): land, walljump, hurt, death
//   2. Steady-state (snapshot): wallslide / jump / fall / run / idle
//   Min-duration locks on land/walljump/hurt keep them from being stomped.
function deriveTarget(
  bridge: SpineboyBridge,
  player: Player,
  justLanded: boolean,
  justWallJumped: boolean,
  justHurt: boolean,
  justDied: boolean,
): VisualState {
  if (justDied)
    return 'death'
  if (!player.alive)
    return bridge.state === 'death' ? 'death' : 'idle'

  // Event transitions first. These fire on edges only.
  if (justHurt)
    return 'hurt'
  if (justWallJumped)
    return 'walljump'
  if (justLanded)
    return 'land'

  // Respect min-duration locks on event states.
  if (bridge.state === 'land' && bridge.stateAge < SPINE_CONFIG.landMinSec)
    return 'land'
  if (bridge.state === 'walljump' && bridge.stateAge < SPINE_CONFIG.wallJumpMinSec)
    return 'walljump'
  if (bridge.state === 'hurt' && bridge.stateAge < SPINE_CONFIG.hurtMinSec)
    return 'hurt'

  // Steady-state derivation.
  if (player.wallSliding)
    return 'wallslide'
  if (!player.grounded) {
    if (player.vy < SPINE_CONFIG.jumpVyThreshold)
      return 'jump'
    if (player.vy > SPINE_CONFIG.fallVyThreshold)
      return 'fall'
    // Between the two: hold whatever air state we were in.
    if (bridge.state === 'jump' || bridge.state === 'fall' || bridge.state === 'walljump')
      return bridge.state === 'walljump' ? 'fall' : bridge.state
    return 'fall'
  }
  // Grounded.
  if (Math.abs(player.vx) > 15)
    return 'run'
  return 'idle'
}

// ─── per-frame update ─────────────────────────────────────────────────────────
export function updateSpineboyVisual(
  bridge: SpineboyBridge,
  player: Player,
  dt: number,
): void {
  // ─── position ──────────────────────────────────────────────────
  // Skeleton origin at feet: place at AABB bottom. CHAR config's yOffset is a
  // visual tweak on top of that.
  const feetY = player.y + player.h
  bridge.spine.x = player.x + player.w / 2
  bridge.spine.y = feetY + SPINE_CONFIG.yOffset

  // ─── facing (threshold on ground, instant in air) ──────────────
  const inputDir = player.vx > 3 ? 1 : player.vx < -3 ? -1 : 0
  if (inputDir !== 0 && inputDir !== bridge.facing) {
    if (!player.grounded) {
      bridge.facing = inputDir
      bridge.facingTimer = 0
    }
    else {
      bridge.facingTimer += dt
      if (bridge.facingTimer >= SPINE_CONFIG.flipThresholdSec) {
        bridge.facing = inputDir
        bridge.facingTimer = 0
      }
    }
  }
  else {
    bridge.facingTimer = 0
  }
  bridge.spine.scale.x = SPINE_CONFIG.scale * bridge.facing
  bridge.spine.scale.y = SPINE_CONFIG.scale

  // ─── edge detection for event transitions ──────────────────────
  const justLanded = !bridge.wasGrounded && player.grounded && bridge.wasAlive && player.alive
  const justWallJumped
    = bridge.prevWallJumpLock <= 0 && player.wallJumpInputLock > 0
  const justHurt
    = player.hazardIframe > 0 && (bridge.state !== 'hurt' || bridge.stateAge > 0.05)
      && !bridge.prevWallSliding && bridge.prevWallJumpLock === player.wallJumpInputLock
      && player.alive && bridge.wasAlive // don't fire hurt on same tick as death
  const justDied = bridge.wasAlive && !player.alive

  // Landing trauma is owned by game.ts (fixedUpdate), not here.

  // ─── target state + transition ─────────────────────────────────
  const target = deriveTarget(bridge, player, justLanded, justWallJumped, justHurt, justDied)
  if (target !== bridge.state) {
    if (canTransition(bridge.state, target))
      setVisualState(bridge, target)
  }
  bridge.stateAge += dt

  // ─── spine.update + muzzle snapshot + hazard-iframe alpha flash ──
  bridge.spine.update(dt)
  // After spine.update the bone world transforms are current — safe to read.
  snapshotMuzzle(bridge)

  if (player.hazardIframe > 0 && player.alive) {
    bridge.flashPhase += dt * SPINE_CONFIG.iframeFlashHz
    const on = Math.floor(bridge.flashPhase) % 2 === 0
    bridge.spine.alpha = on ? 1.0 : SPINE_CONFIG.iframeAlphaLow
  }
  else if (player.iframeTimer > 0) {
    // Post-rupture iframes — faster blink, different feel
    const blink = Math.floor(bridge.flashPhase + dt * 30) % 2 === 0
    bridge.flashPhase += dt
    bridge.spine.alpha = blink ? 1.0 : 0.4
  }
  else {
    bridge.spine.alpha = 1.0
  }

  bridge.spine.visible = player.alive || bridge.state === 'death'

  // Bookkeep
  bridge.wasGrounded = player.grounded
  bridge.wasAlive = player.alive
  bridge.prevWallSliding = player.wallSliding
  bridge.prevWallJumpLock = player.wallJumpInputLock
}

export function resetSpineboyBridge(bridge: SpineboyBridge): void {
  bridge.state = 'idle'
  bridge.stateAge = 0
  bridge.facing = 1
  bridge.facingTimer = 0
  bridge.wasGrounded = false
  bridge.wasAlive = true
  bridge.prevWallSliding = false
  bridge.prevWallJumpLock = 0
  bridge.flashPhase = 0
  bridge.muzzleReady = false
  bridge.spine.alpha = 1.0
  bridge.spine.visible = true
  const a = resolvedAnim(bridge.spine, 'idle')
  bridge.spine.state.setAnimation(0, a.name, a.loop)
  bridge.spine.state.clearTrack(1)
}
