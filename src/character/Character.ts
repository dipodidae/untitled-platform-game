// ─── Skeletal Character Renderer ─────────────────────────────────────────────
// Pure PIXI.Graphics rectangles, hand-rolled skeleton, GSAP pose tweening.
// Glow effect via double-render: sharp + blurred layer behind.

import { BlurFilter, Container, Graphics } from 'pixi.js'
import gsap from 'gsap'
import type { Pose } from './poses'
import { POSES } from './poses'
import {
  BODY_CONFIG,
  DEBUG,
  GLOW_BLUR_ALPHA,
  GLOW_BLUR_STRENGTH,
  GLOW_COLOR,
  GLOW_STROKE_WIDTH,
  IDLE_POSE_DURATION,
  LAND_DURATION,
  LAND_RECOVERY_DURATION,
  RUN_BOB_AMPLITUDE,
  RUN_STRIDE_DURATION,
  SECONDARY_DELAY,
  FALL_DURATION,
  JUMP_LAUNCH_DURATION,
  JUMP_PEAK_DURATION,
  WALL_SLIDE_DURATION,
} from './config'

// ─── Types ──────────────────────────────────────────────────────────────────

export type CharacterState = 'IDLE' | 'RUN' | 'JUMP' | 'FALL' | 'LAND' | 'WALL_SLIDE'

// All bone names in the skeleton
const BONE_NAMES = [
  'root', 'torso', 'neck', 'head', 'hip',
  'l_shoulder', 'l_upper_arm', 'l_elbow', 'l_lower_arm', 'l_wrist', 'l_hand',
  'r_shoulder', 'r_upper_arm', 'r_elbow', 'r_lower_arm', 'r_wrist', 'r_hand',
  'l_upper_leg', 'l_knee', 'l_lower_leg', 'l_ankle', 'l_foot',
  'r_upper_leg', 'r_knee', 'r_lower_leg', 'r_ankle', 'r_foot',
] as const

type BoneName = typeof BONE_NAMES[number]
type BoneMap = Record<BoneName, Container>

// Map pose keys to bone container keys
const POSE_TO_BONE: Record<keyof Pose, BoneName> = {
  torso: 'torso',
  head: 'head',
  neck: 'neck',
  hip: 'hip',
  l_upper_arm: 'l_shoulder',
  l_lower_arm: 'l_elbow',
  l_hand: 'l_wrist',
  r_upper_arm: 'r_shoulder',
  r_lower_arm: 'r_elbow',
  r_hand: 'r_wrist',
  l_upper_leg: 'l_upper_leg',
  l_lower_leg: 'l_knee',
  l_foot: 'l_ankle',
  r_upper_leg: 'r_upper_leg',
  r_lower_leg: 'r_knee',
  r_foot: 'r_ankle',
}

// Secondary bones: head, hands — these get a delayed tween
const SECONDARY_BONES: Set<keyof Pose> = new Set([
  'head', 'l_hand', 'r_hand',
])

// ─── Helper: draw a rectangle outline (glow style) ──────────────────────────

// Rect centered at (0,0) — for joint caps (knee, ankle, etc.)
function drawGlowRect(g: Graphics, w: number, h: number): void {
  g.clear()
  g.rect(-w / 2, -h / 2, w, h)
  g.fill({ color: 0x0a0a14, alpha: 0.3 })
  g.rect(-w / 2, -h / 2, w, h)
  g.stroke({ width: GLOW_STROKE_WIDTH, color: GLOW_COLOR, alpha: 1.0 })
}

// Rect extending DOWN from y=0 — for limb bones hanging from a joint
function drawBoneDown(g: Graphics, w: number, h: number): void {
  g.clear()
  g.rect(-w / 2, 0, w, h)
  g.fill({ color: 0x0a0a14, alpha: 0.3 })
  g.rect(-w / 2, 0, w, h)
  g.stroke({ width: GLOW_STROKE_WIDTH, color: GLOW_COLOR, alpha: 1.0 })
}

// Rect extending UP from y=0 — for torso/neck/head (grow upward from pivot)
function drawBoneUp(g: Graphics, w: number, h: number): void {
  g.clear()
  g.rect(-w / 2, -h, w, h)
  g.fill({ color: 0x0a0a14, alpha: 0.3 })
  g.rect(-w / 2, -h, w, h)
  g.stroke({ width: GLOW_STROKE_WIDTH, color: GLOW_COLOR, alpha: 1.0 })
}

// ─── Skeleton Builder (pure function — used for both sharp and glow) ────────

function buildSkeleton(parent: Container): BoneMap {
  const c = BODY_CONFIG

  // Bone extending downward from pivot (limbs)
  const boneDown = (w: number, h: number): Container => {
    const ct = new Container()
    const g = new Graphics()
    drawBoneDown(g, w, h)
    ct.addChild(g)
    return ct
  }

  // Bone extending upward from pivot (torso, neck, head)
  const boneUp = (w: number, h: number): Container => {
    const ct = new Container()
    const g = new Graphics()
    drawBoneUp(g, w, h)
    ct.addChild(g)
    return ct
  }

  // Root at hip level — body extends up, legs extend down
  const root = new Container()
  parent.addChild(root)

  // ── TORSO: pivot at bottom (hip), extends upward ────────────────
  const torso = boneUp(c.torso.w, c.torso.h)
  // pivot at (0,0) = bottom of torso = hip level. Already default.
  root.addChild(torso)

  // ── NECK: at top of torso, extends upward ───────────────────────
  const neck = boneUp(c.neck.w, c.neck.h)
  neck.position.set(0, -c.torso.h) // top of torso
  torso.addChild(neck)

  // ── HEAD: at top of neck, extends upward ────────────────────────
  const head = boneUp(c.head.w, c.head.h)
  head.position.set(0, -c.neck.h) // top of neck
  neck.addChild(head)

  // ── LEFT ARM: shoulder at top-left of torso ─────────────────────
  const l_shoulder = new Container()
  l_shoulder.position.set(-c.torso.w / 2, -c.torso.h + 4)
  torso.addChild(l_shoulder)

  const l_upper_arm = boneDown(c.upperArm.w, c.upperArm.h)
  l_shoulder.addChild(l_upper_arm)

  const l_elbow = new Container()
  l_elbow.position.set(0, c.upperArm.h)
  l_upper_arm.addChild(l_elbow)

  const l_lower_arm = boneDown(c.lowerArm.w, c.lowerArm.h)
  l_elbow.addChild(l_lower_arm)

  const l_wrist = new Container()
  l_wrist.position.set(0, c.lowerArm.h)
  l_lower_arm.addChild(l_wrist)

  const l_hand = boneDown(c.hand.w, c.hand.h)
  l_wrist.addChild(l_hand)

  // ── RIGHT ARM: shoulder at top-right of torso ───────────────────
  const r_shoulder = new Container()
  r_shoulder.position.set(c.torso.w / 2, -c.torso.h + 4)
  torso.addChild(r_shoulder)

  const r_upper_arm = boneDown(c.upperArm.w, c.upperArm.h)
  r_shoulder.addChild(r_upper_arm)

  const r_elbow = new Container()
  r_elbow.position.set(0, c.upperArm.h)
  r_upper_arm.addChild(r_elbow)

  const r_lower_arm = boneDown(c.lowerArm.w, c.lowerArm.h)
  r_elbow.addChild(r_lower_arm)

  const r_wrist = new Container()
  r_wrist.position.set(0, c.lowerArm.h)
  r_lower_arm.addChild(r_wrist)

  const r_hand = boneDown(c.hand.w, c.hand.h)
  r_wrist.addChild(r_hand)

  // ── HIP: centered at root, small rect ──────────────────────────
  const hip = new Container()
  hip.position.set(0, 0) // at root = hip level
  torso.addChild(hip)

  const hipGfx = new Graphics()
  drawGlowRect(hipGfx, c.hip.w, c.hip.h)
  hip.addChild(hipGfx)

  // ── LEFT LEG ────────────────────────────────────────────────────
  const l_upper_leg = new Container()
  l_upper_leg.position.set(-c.hip.w / 4, c.hip.h / 2)
  hip.addChild(l_upper_leg)

  const lulGfx = new Graphics()
  drawBoneDown(lulGfx, c.upperLeg.w, c.upperLeg.h)
  l_upper_leg.addChild(lulGfx)

  const l_knee = new Container()
  l_knee.position.set(0, c.upperLeg.h)
  l_upper_leg.addChild(l_knee)

  const lkGfx = new Graphics()
  drawGlowRect(lkGfx, c.knee.w, c.knee.h)
  l_knee.addChild(lkGfx)

  const l_lower_leg = boneDown(c.lowerLeg.w, c.lowerLeg.h)
  l_lower_leg.position.set(0, c.knee.h / 2)
  l_knee.addChild(l_lower_leg)

  const l_ankle = new Container()
  l_ankle.position.set(0, c.lowerLeg.h)
  l_lower_leg.addChild(l_ankle)

  const laGfx = new Graphics()
  drawGlowRect(laGfx, c.ankle.w, c.ankle.h)
  l_ankle.addChild(laGfx)

  const l_foot = boneDown(c.foot.w, c.foot.h)
  l_foot.position.set(c.foot.w / 4, c.ankle.h / 2)
  l_ankle.addChild(l_foot)

  // ── RIGHT LEG ──────────────────────────────────────────────────
  const r_upper_leg = new Container()
  r_upper_leg.position.set(c.hip.w / 4, c.hip.h / 2)
  hip.addChild(r_upper_leg)

  const rulGfx = new Graphics()
  drawBoneDown(rulGfx, c.upperLeg.w, c.upperLeg.h)
  r_upper_leg.addChild(rulGfx)

  const r_knee = new Container()
  r_knee.position.set(0, c.upperLeg.h)
  r_upper_leg.addChild(r_knee)

  const rkGfx = new Graphics()
  drawGlowRect(rkGfx, c.knee.w, c.knee.h)
  r_knee.addChild(rkGfx)

  const r_lower_leg = boneDown(c.lowerLeg.w, c.lowerLeg.h)
  r_lower_leg.position.set(0, c.knee.h / 2)
  r_knee.addChild(r_lower_leg)

  const r_ankle = new Container()
  r_ankle.position.set(0, c.lowerLeg.h)
  r_lower_leg.addChild(r_ankle)

  const raGfx = new Graphics()
  drawGlowRect(raGfx, c.ankle.w, c.ankle.h)
  r_ankle.addChild(raGfx)

  const r_foot = boneDown(c.foot.w, c.foot.h)
  r_foot.position.set(c.foot.w / 4, c.ankle.h / 2)
  r_ankle.addChild(r_foot)

  return {
    root, torso, neck, head, hip,
    l_shoulder, l_upper_arm, l_elbow, l_lower_arm, l_wrist, l_hand,
    r_shoulder, r_upper_arm, r_elbow, r_lower_arm, r_wrist, r_hand,
    l_upper_leg, l_knee, l_lower_leg, l_ankle, l_foot,
    r_upper_leg, r_knee, r_lower_leg, r_ankle, r_foot,
  }
}

// ─── Character Class ────────────────────────────────────────────────────────

export class Character {
  readonly container: Container // top-level, add this to stage
  readonly bones: BoneMap       // sharp skeleton — GSAP targets these
  private readonly _glowBones: BoneMap // glow skeleton — synced every frame
  private readonly _sharpLayer: Container
  private readonly _glowLayer: Container
  private _state: CharacterState = 'IDLE'
  private _idleTimeline: gsap.core.Timeline | null = null
  private _runTimeline: gsap.core.Timeline | null = null
  private _bobTween: gsap.core.Tween | null = null
  private _breathTween: gsap.core.Tween | null = null
  private _headSwayTween: gsap.core.Tween | null = null
  private _pendulumTweenL: gsap.core.Tween | null = null
  private _pendulumTweenR: gsap.core.Tween | null = null
  private readonly _debugDots: Graphics[] = []

  // Procedural head lag
  private _prevTorsoRot = 0
  private _neckLagVel = 0 // angular velocity of the lag spring
  private _neckLagOffset = 0 // current lag offset applied to neck

  // Facing direction for flip
  private _facing: 1 | -1 = 1

  constructor() {
    this.container = new Container()

    // Glow (blurred) layer behind
    this._glowLayer = new Container()
    this._glowLayer.alpha = GLOW_BLUR_ALPHA
    const blur = new BlurFilter({ strength: GLOW_BLUR_STRENGTH })
    this._glowLayer.filters = [blur]
    this.container.addChild(this._glowLayer)

    // Sharp layer on top
    this._sharpLayer = new Container()
    this.container.addChild(this._sharpLayer)

    // Build BOTH skeletons from the same builder
    this.bones = buildSkeleton(this._sharpLayer)
    this._glowBones = buildSkeleton(this._glowLayer)

    if (DEBUG) this._addDebugDots()

    // Start in idle
    this._enterIdle()
  }

  get state(): CharacterState { return this._state }
  get facing(): 1 | -1 { return this._facing }
  private _flipTween: gsap.core.Tween | null = null
  set facing(dir: 1 | -1) {
    if (dir !== this._facing) {
      this._facing = dir
      // Smooth flip via quick scale tween instead of instant snap
      if (this._flipTween) this._flipTween.kill()
      this._flipTween = gsap.to([this._sharpLayer.scale, this._glowLayer.scale], {
        x: dir,
        duration: 0.08,
        ease: 'power2.out',
      })
      // Kick the head lag spring — turning whips the head
      this._neckLagVel += dir * 12
    }
  }

  // ─── State Machine ──────────────────────────────────────────────────

  setState(newState: CharacterState): void {
    if (newState === this._state) return
    const prev = this._state
    this._state = newState
    if (DEBUG) console.log(`[Character] ${prev} → ${newState}`)

    this._killAll()

    switch (newState) {
      case 'IDLE': this._enterIdle(); break
      case 'RUN': this._enterRun(); break
      case 'JUMP': this._enterJump(); break
      case 'FALL': this._enterFall(); break
      case 'LAND': this._enterLand(); break
      case 'WALL_SLIDE': this._enterWallSlide(); break
    }
  }

  update(delta: number): void {
    // ── Procedural head/neck lag ──────────────────────────────────
    // The neck counter-rotates against torso changes with spring dynamics.
    // This makes the head wobble naturally on every movement.
    const torsoRot = this.bones.torso.rotation
    const torsoDelta = torsoRot - this._prevTorsoRot
    this._prevTorsoRot = torsoRot

    // Spring constants — tuned for visible wobble without jello
    const SPRING = 35      // stiffness: how fast it snaps back
    const DAMPING = 8       // friction: prevents infinite oscillation
    const INFLUENCE = 1.8   // how much torso delta drives the lag
    const MAX_OFFSET = 0.18 // clamp so the head doesn't spin

    // Drive: torso rotation change pushes the lag in the opposite direction
    this._neckLagVel -= torsoDelta * INFLUENCE / Math.max(delta, 0.001)
    // Spring: pull back toward zero
    this._neckLagVel -= this._neckLagOffset * SPRING * delta
    // Damping
    this._neckLagVel *= 1 - DAMPING * delta
    // Integrate
    this._neckLagOffset += this._neckLagVel * delta
    // Clamp
    this._neckLagOffset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, this._neckLagOffset))

    // Apply to neck (on top of whatever GSAP set)
    this.bones.neck.rotation += this._neckLagOffset * 0.6
    this.bones.head.rotation += this._neckLagOffset * 0.4

    // ── Sync glow skeleton ───────────────────────────────────────
    for (const name of BONE_NAMES) {
      const src = this.bones[name]
      const dst = this._glowBones[name]
      dst.position.copyFrom(src.position)
      dst.rotation = src.rotation
      dst.scale.copyFrom(src.scale)
    }
  }

  // ─── Pose Tweening ──────────────────────────────────────────────────

  tweenToPose(
    poseName: string,
    duration: number,
    ease: string = 'sine.inOut',
    onComplete?: () => void,
  ): gsap.core.Timeline {
    const pose = POSES[poseName]
    if (!pose) throw new Error(`Unknown pose: ${poseName}`)

    const tl = gsap.timeline({ onComplete })

    for (const [poseKey, targetRot] of Object.entries(pose) as [keyof Pose, number][]) {
      const boneKey = POSE_TO_BONE[poseKey]
      if (!boneKey) continue
      const bone = this.bones[boneKey]

      const delay = SECONDARY_BONES.has(poseKey) ? SECONDARY_DELAY : 0

      tl.to(bone, {
        rotation: targetRot,
        duration,
        ease,
        delay,
      }, 0)
    }

    return tl
  }

  // ─── State Implementations ──────────────────────────────────────────

  private _enterIdle(): void {
    const tl = gsap.timeline({ repeat: -1, yoyo: true })
    tl.add(this.tweenToPose('idle_a', IDLE_POSE_DURATION, 'sine.inOut'))
    tl.add(this.tweenToPose('idle_b', IDLE_POSE_DURATION, 'sine.inOut'))
    this._idleTimeline = tl

    // Breathing: subtle y scale pulse on torso
    this._breathTween = gsap.to(this.bones.torso.scale, {
      y: 1.02,
      duration: 2.0,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })

    // Head independent sway
    this._headSwayTween = gsap.to(this.bones.head, {
      rotation: 0.05,
      duration: 3.0,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 0.4,
    })

    // Arm pendulum (gentle, 4s)
    this._pendulumTweenL = gsap.to(this.bones.l_shoulder, {
      rotation: 0.25,
      duration: 2.0,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 0.2,
    })
    this._pendulumTweenR = gsap.to(this.bones.r_shoulder, {
      rotation: -0.25,
      duration: 2.0,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: 0.6,
    })
  }

  private _enterRun(): void {
    const duration = RUN_STRIDE_DURATION
    const baseY = 0

    // ── Layered secondary motion (independent of stride poses) ──
    // Breathing: faster than idle, subtle torso scale pulse
    this._breathTween = gsap.to(this.bones.torso.scale, {
      y: 1.015,
      duration: duration * 2.5,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })

    // Head micro-sway: slight independent motion so head feels alive
    this._headSwayTween = gsap.to(this.bones.head, {
      rotation: '-=0.04', // relative oscillation on top of pose value
      duration: duration * 3,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: duration * 0.3,
    })

    // Shoulder rock: dip alternately, offset from stride
    this._pendulumTweenL = gsap.to(this.bones.l_shoulder, {
      y: 1.5,
      duration: duration,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    })
    this._pendulumTweenR = gsap.to(this.bones.r_shoulder, {
      y: 1.5,
      duration: duration,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      delay: duration, // half-cycle offset from left
    })

    // ── Stride cycle ────────────────────────────────────────────
    const cycle = (): void => {
      if (this._state !== 'RUN') return

      const tl = gsap.timeline({
        onComplete: () => {
          if (this._state !== 'RUN') return
          const tl2 = gsap.timeline({
            onComplete: () => { if (this._state === 'RUN') cycle() },
          })
          tl2.add(this.tweenToPose('run_stride_r', duration, 'power1.inOut'))
          tl2.fromTo(this.bones.root, { y: baseY }, {
            y: baseY + RUN_BOB_AMPLITUDE,
            duration: duration / 2,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: 1,
          }, 0)
          this._runTimeline = tl2
        },
      })
      tl.add(this.tweenToPose('run_stride_l', duration, 'power1.inOut'))
      tl.fromTo(this.bones.root, { y: baseY }, {
        y: baseY + RUN_BOB_AMPLITUDE,
        duration: duration / 2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: 1,
      }, 0)
      this._runTimeline = tl
    }

    cycle()
  }

  private _enterJump(): void {
    // Snappy launch
    const tl = this.tweenToPose('jump_launch', JUMP_LAUNCH_DURATION, 'back.out(1.7)')
    tl.eventCallback('onComplete', () => {
      if (this._state !== 'JUMP') return
      // Floaty peak
      this.tweenToPose('jump_peak', JUMP_PEAK_DURATION, 'sine.out')
    })
  }

  private _enterFall(): void {
    this.tweenToPose('fall', FALL_DURATION, 'power2.out')
  }

  private _enterWallSlide(): void {
    this.tweenToPose('wall_slide', WALL_SLIDE_DURATION, 'power2.out')
  }

  private _enterLand(): void {
    // Deep impact crunch
    const tl = this.tweenToPose('land', LAND_DURATION, 'power4.out')
    tl.eventCallback('onComplete', () => {
      if (this._state !== 'LAND') return
      // Check if we should flow into run or recover to idle.
      // _landCallback is set by main.ts to provide velocity context.
      if (this._landCallback && this._landCallback()) {
        // Flow into first stride — the land pose already has left foot forward,
        // so stride_l is a natural continuation (same lead foot).
        const flow = this.tweenToPose('run_stride_l', LAND_RECOVERY_DURATION * 1.2, 'power2.out')
        flow.eventCallback('onComplete', () => {
          if (this._state === 'LAND') {
            this.setState('RUN')
          }
        })
      } else {
        // Standing land — elastic spring back to idle
        const recovery = this.tweenToPose('idle_a', LAND_RECOVERY_DURATION, 'elastic.out(1, 0.5)')
        recovery.eventCallback('onComplete', () => {
          if (this._state === 'LAND') {
            this.setState('IDLE')
          }
        })
      }
    })
  }

  // Callback provided by main loop: returns true if character has horizontal velocity
  private _landCallback: (() => boolean) | null = null
  setLandMovingCheck(fn: () => boolean): void {
    this._landCallback = fn
  }

  // ─── Kill all active tweens ─────────────────────────────────────────

  private _killAll(): void {
    if (this._idleTimeline) { this._idleTimeline.kill(); this._idleTimeline = null }
    if (this._runTimeline) { this._runTimeline.kill(); this._runTimeline = null }
    if (this._bobTween) { this._bobTween.kill(); this._bobTween = null }
    if (this._breathTween) { this._breathTween.kill(); this._breathTween = null }
    if (this._headSwayTween) { this._headSwayTween.kill(); this._headSwayTween = null }
    if (this._pendulumTweenL) { this._pendulumTweenL.kill(); this._pendulumTweenL = null }
    if (this._pendulumTweenR) { this._pendulumTweenR.kill(); this._pendulumTweenR = null }

    // Kill tweens on every bone container
    for (const name of BONE_NAMES) {
      gsap.killTweensOf(this.bones[name])
      gsap.killTweensOf(this.bones[name].scale)
    }

    // Reset torso scale
    this.bones.torso.scale.y = 1.0
    // Reset root bob y
    this.bones.root.y = 0
  }

  // ─── Debug pivot dots ───────────────────────────────────────────────

  private _addDebugDots(): void {
    for (const name of BONE_NAMES) {
      const dot = new Graphics()
      dot.circle(0, 0, 3)
      dot.fill({ color: 0xFF0000, alpha: 1.0 })
      this.bones[name].addChild(dot)
      this._debugDots.push(dot)
    }
  }
}
