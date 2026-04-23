// Every tunable number lives here. Tweak in-place; no rebuild needed in dev.
// `as const` keeps values as literal types (e.g. JUMP_VELOCITY: 275, not number),
// which sometimes helps inference in downstream modules.
export const CONFIG = {
  // World / render
  TILE_SIZE: 16,
  LOGICAL_WIDTH: 480, // low-res buffer, integer-scaled up via CSS
  LOGICAL_HEIGHT: 270,

  // Player AABB (slightly smaller than a tile so the character reads as a character)
  PLAYER_W: 12,
  PLAYER_H: 14,
  SPAWN_X: 32,
  SPAWN_Y: 200,

  // Horizontal movement
  MAX_RUN: 110, // top horizontal speed, px/s
  GROUND_ACCEL: 700, // accel while input held, on ground
  GROUND_DECEL: 900, // decel when no input, on ground (slightly > accel = firm stops)
  AIR_ACCEL: 500, // accel while input held, mid-air (lower so jumps commit)
  AIR_DECEL: 300, // decel when no input, mid-air
  TURN_BOOST: 1.5, // accel × this when input direction is opposite current vx — snappy turns

  // Jump — tuned so v0=275, g_up=785 → apex ≈ 48 px (3 tiles), t_apex ≈ 0.35 s
  //   h_apex = v0² / (2·g) ≈ 48.1
  //   t_apex = v0 / g      ≈ 0.35
  JUMP_VELOCITY: 275, // instant upward velocity on jump
  JUMP_GRAVITY: 785, // gravity while vy < 0 (ascent)
  FALL_GRAVITY: 1700, // gravity while vy ≥ 0 (descent) — ~2.16× ascent, classic floaty-up/snappy-down
  MAX_FALL: 360, // terminal velocity cap
  JUMP_CUT_MULT: 0.5, // multiply upward vy by this when jump is released early — variable jump height

  // Feel / input forgiveness
  COYOTE_TIME: 0.1, // seconds after leaving a ledge during which jump still fires
  JUMP_BUFFER: 0.12, // seconds before landing a jump press is remembered
  CORNER_NUDGE: 4, // max px of head-corner clip to auto-nudge sideways while jumping

  // Camera
  CAM_DEADZONE_W: 40, // player can drift this wide before cam pans horizontally
  CAM_DEADZONE_H: 32, // vertical deadzone (taller so jumps don't yo-yo the cam)
  CAM_LERP: 0.18, // 0 = no follow, 1 = instant snap

  // Fixed-timestep main loop
  FIXED_DT: 1 / 60, // physics step
  MAX_FRAME_DT: 0.25, // guard against tab-stall spiral of death

  // ───────────────────────── PRESSURE ─────────────────────────
  // Core resource. 0..PRESSURE_MAX. Detonates at PRESSURE_MAX.
  PRESSURE_MAX: 100,
  PRESSURE_JUMP: 8, // flat add per jump fired
  PRESSURE_WALL_PER_SEC: 3, // while pressed into a wall AND moving into it
  PRESSURE_DASH: 20, // reserved for a future dash action — applied via addPressure hook
  PRESSURE_LAND_MIN_VY: 150, // below this impact |vy| → 0 gain (soft landings free)
  PRESSURE_LAND_MAX_GAIN: 15, // gain at MAX_FALL impact (scales linearly between min and max)
  PRESSURE_RUN_PER_SEC: 2, // gain while on ground at ≥ max run speed
  PRESSURE_RUN_THRESHOLD: 0.95, // fraction of MAX_RUN that counts as "max speed"
  PRESSURE_IDLE_BLEED_PER_SEC: 6, // stand still on ground → this much drains per second
  PRESSURE_IDLE_VX_MAX: 8, // |vx| must be under this to count as "standing still"
  PRESSURE_VENT_DRAIN_PER_SEC: 40, // active-vent drain rate
  VENT_STUN: 0.15, // post-vent stun: can't jump or vent again during this window

  // ───────────────────────── DETONATION ─────────────────────────
  BLAST_BASE_RADIUS: 32, // symmetric radius at zero velocity
  BLAST_MAJOR_MAX: 56, // long axis at max speed
  BLAST_MINOR_MIN: 24, // short axis (perpendicular) at max speed
  BLAST_SPEED_NORM: 260, // |v| at which shape saturates (≈ MAX_RUN + typical fall contribution)
  BLAST_IMPULSE: 320, // base self-impulse magnitude (px/s). ~4 tiles lift off ground with JUMP_GRAVITY.
  BLAST_MIN_SPEED_FOR_V_DIR: 40, // |v| below this → use terrain-normal instead of -velocity for impulse direction
  BLAST_STEEL_BONUS: 180, // extra impulse added away from steel surfaces the blast touches
  BLAST_IFRAMES: 0.3, // post-detonation invulnerability / pressure-gain freeze
  BLAST_HITSTOP_FRAMES: 4, // physics paused for this many frames on detonation (at FIXED_DT each)
  BLAST_SHAKE_AMPLITUDE: 6, // px
  BLAST_SHAKE_DURATION: 0.25, // seconds
  BLAST_FLASH_DURATION: 0.18, // seconds of white-over-world flash
  BLAST_PARTICLES: 16, // spawned on detonation

  STONE_HITS: 2, // blast hits before stone breaks

  // ───────────────────────── READABILITY ─────────────────────────
  // Aura: radial glow under the player, tinted by pressure.
  AURA_THRESH_COOL: 0.33, // ≤ this → blue
  AURA_THRESH_WARM: 0.66, // ≤ this → yellow
  AURA_THRESH_HOT: 0.9, // ≤ this → orange; above → pulsing red
  AURA_BASE_RADIUS: 10, // px at 0 pressure
  AURA_MAX_RADIUS: 22, // px at 100 pressure
  AURA_PULSE_MIN_HZ: 3, // red-pulse frequency at 90%
  AURA_PULSE_MAX_HZ: 12, // red-pulse frequency at 100%
  AURA_COLOR_COOL: 0x4AA3FF,
  AURA_COLOR_WARM: 0xF2D048,
  AURA_COLOR_HOT: 0xF08A3C,
  AURA_COLOR_RED: 0xFF3A3A,

  GHOST_PRESSURE_THRESHOLD: 92, // start rendering blast preview at this pressure

  // UI meter
  METER_X: 8,
  METER_Y: 8,
  METER_W: 120,
  METER_H: 12,

  // Colors (replace any Graphics in render.ts with Sprites when swapping in art)
  COLOR_SKY: 0x1A1A2E,
  COLOR_PLAYER: 0xE8D05D,
  COLOR_PLAYER_EYE: 0x222234,

  // Material palette. Kept here so `render.ts` doesn't own the visual language.
  COLOR_DIRT: 0x8A5A3A,
  COLOR_DIRT_TOP: 0xB07A4D,
  COLOR_STONE: 0x6A6F7A,
  COLOR_STONE_TOP: 0x8A909A,
  COLOR_STONE_CRACKED: 0x4A4F58, // drawn under crack overlay to desaturate
  COLOR_STONE_CRACK: 0x1A1C20,
  COLOR_STEEL: 0x9AA5B4,
  COLOR_STEEL_TOP: 0xC8D2E0,
  COLOR_HAZARD: 0xD8444E,
  COLOR_HAZARD_SPIKE: 0xF09098,
} as const

export type Config = typeof CONFIG
