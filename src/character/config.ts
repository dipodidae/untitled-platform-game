// ─── Single source of truth for character dimensions and visual constants ────

export const DEBUG = false

export const GLOW_COLOR = 0x00FFFF
export const GLOW_STROKE_WIDTH = 5
export const GLOW_BLUR_STRENGTH = 10
export const GLOW_BLUR_ALPHA = 0.4
export const SCANLINE_ALPHA = 0.04
export const SCANLINE_SPACING = 3

// Derived: total leg length from hip pivot to foot bottom
// hip.h/2 + upperLeg.h + knee.h/2 + lowerLeg.h + ankle.h/2 + foot.h
export const LEG_HEIGHT = 5 + 20 + 4 + 18 + 3.5 + 6 // ≈ 56.5

// Physics
export const GRAVITY = 980
export const GROUND_Y = 540 // feet touch here; hip is at GROUND_Y - LEG_HEIGHT
export const JUMP_VELOCITY = -520
export const MOVE_SPEED = 260
export const MOVE_ACCEL = 1800
export const MOVE_DECEL = 2400
export const MAX_FALL = 600
export const FALL_THRESHOLD = 80 // vy above which we enter FALL state

// Animation durations (seconds)
export const IDLE_POSE_DURATION = 1.8
export const RUN_STRIDE_DURATION = 0.22
export const JUMP_LAUNCH_DURATION = 0.15
export const JUMP_PEAK_DURATION = 0.35
export const FALL_DURATION = 0.30
export const LAND_DURATION = 0.08
export const LAND_RECOVERY_DURATION = 0.20
export const WALL_SLIDE_DURATION = 0.25
export const SECONDARY_DELAY = 0.06 // 60ms lag for head/hands

// Vertical bob amplitude during run (px)
export const RUN_BOB_AMPLITUDE = 3

// Minimum joint bend to avoid dead/locked look (rad)
export const MIN_JOINT_BEND = 0.05

export const BODY_CONFIG = {
  torso: { w: 22, h: 34 },
  head: { w: 18, h: 18 },
  neck: { w: 7, h: 8 },
  shoulder: { w: 8, h: 8 },
  upperArm: { w: 7, h: 18 },
  lowerArm: { w: 6, h: 16 },
  hand: { w: 6, h: 7 },
  hip: { w: 20, h: 10 },
  upperLeg: { w: 9, h: 20 },
  knee: { w: 8, h: 8 },
  lowerLeg: { w: 7, h: 18 },
  ankle: { w: 7, h: 7 },
  foot: { w: 14, h: 6 },
} as const

export type BodyPartName = keyof typeof BODY_CONFIG
