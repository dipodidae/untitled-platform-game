// Every tunable number lives here. Tweak in-place; no rebuild needed in dev.
// `as const` keeps values as literal types (e.g. JUMP_VELOCITY: 275, not number),
// which sometimes helps inference in downstream modules.
export const CONFIG = {
  // World / render
  TILE_SIZE: 16,
  LOGICAL_WIDTH: 640, // FAULTLINE: wider breathing room for the vector art
  LOGICAL_HEIGHT: 360,

  // Player AABB (slightly smaller than a tile so the character reads as a character)
  PLAYER_W: 12,
  PLAYER_H: 14,
  SPAWN_X: 32,
  SPAWN_Y: 200,

  // ───────────────────────── HORIZONTAL MOVEMENT ───────────────────
  // Celeste-grade: near-instant accel, instant stops, full air authority.
  MAX_RUN: 120, // top horizontal speed, px/s
  GROUND_ACCEL: 1800, // near-instant to max speed (~0.07s)
  GROUND_DECEL: 2400, // frame-perfect stops
  AIR_ACCEL: 1400, // strong air steering — player owns their arc
  AIR_DECEL: 900, // meaningful air friction on release
  TURN_BOOST: 2.0, // snappy turnaround multiplier

  // ───────────────────────── JUMP ──────────────────────────────────
  // Tuned: v0=290, g_up=750 → apex ≈ 56 px (~3.5 tiles), t_apex ≈ 0.39 s
  // Descent gravity ~2.3× ascent: floaty-up / snappy-down Celeste feel.
  JUMP_VELOCITY: 290, // instant upward velocity on jump
  JUMP_GRAVITY: 750, // gravity while vy < 0 (ascent) — slightly lower for hang time
  FALL_GRAVITY: 1750, // gravity while vy ≥ 0 (descent)
  MAX_FALL: 380, // terminal velocity cap
  JUMP_CUT_MULT: 0.4, // variable jump height — stronger cut for more height control

  // ───────────────────────── AIR EXPRESSION ────────────────────────
  // Air snap: amplified control window right after jump for trajectory correction.
  AIR_SNAP_WINDOW: 0.08, // seconds after jump with boosted air control
  AIR_SNAP_MULT: 1.8, // air accel multiplier during snap window
  AIR_BRAKE_MULT: 1.4, // air decel boost when reversing direction mid-air

  // ───────────────────────── WALL MECHANICS ────────────────────────
  WALL_SLIDE_SPEED: 60, // max fall speed while wall-sliding
  WALL_SLIDE_ACCEL: 400, // how fast you approach slide speed (gravity replacement)
  WALL_JUMP_VX: 170, // horizontal impulse away from wall
  WALL_JUMP_VY: 270, // vertical impulse (slightly less than ground jump)
  WALL_STICK_TIME: 0.06, // grace period: wall-jump still valid after leaving wall
  WALL_JUMP_INPUT_LOCK: 0.08, // seconds after wall-jump where input toward wall is suppressed

  // ───────────────────────── FEEL / FORGIVENESS ────────────────────
  COYOTE_TIME: 0.12, // generous coyote time
  JUMP_BUFFER: 0.15, // generous buffer
  CORNER_NUDGE: 5, // max px of head-corner clip to auto-nudge sideways while jumping

  // Camera
  CAM_DEADZONE_W: 40, // player can drift this wide before cam pans horizontally
  CAM_DEADZONE_H: 32, // vertical deadzone (taller so jumps don't yo-yo the cam)
  CAM_LERP: 0.18, // 0 = no follow, 1 = instant snap

  // Fixed-timestep main loop
  FIXED_DT: 1 / 60, // physics step
  MAX_FRAME_DT: 0.25, // guard against tab-stall spiral of death
  PHYSICS_SUBSTEPS: 2, // 60 Hz outer × 2 = 120 Hz inner — stabilizes slope MTV

  // ───────────────────────── POLYGON WORLD ─────────────────────────
  // Slopes steeper than this (degrees from horizontal) behave as walls.
  MAX_SLOPE_ANGLE: 50,
  // After collision, if we just walked off a surface at low vy, probe this
  // many px downward to re-ground — keeps descent on rolling terrain smooth.
  STICK_TO_GROUND_MAX_DIST: 6,
  // Seconds of one-way ignore after drop-through (down + jump on a one-way).
  ONE_WAY_DROPTHROUGH_TIME: 0.2,

  // ───────────────────────── INSTABILITY ─────────────────────────
  // The thing holding you together is failing. 0..INSTABILITY_MAX. At max
  // you fracture — cohesion is lost, the world takes the shape of your
  // rupture.
  INSTABILITY_MAX: 100,
  INSTABILITY_JUMP: 8, // flat add per jump fired
  INSTABILITY_WALL_PER_SEC: 3, // while pressed into a wall AND moving into it
  INSTABILITY_DASH: 20, // reserved hook for any future one-shot gain
  INSTABILITY_LAND_MIN_VY: 150, // below this impact |vy| → 0 gain (soft landings free)
  INSTABILITY_LAND_MAX_GAIN: 15, // gain at MAX_FALL impact (scales linearly between min and max)
  INSTABILITY_RUN_PER_SEC: 2, // gain while on ground at ≥ max run speed
  INSTABILITY_RUN_THRESHOLD: 0.95, // fraction of MAX_RUN that counts as "max speed"
  INSTABILITY_IDLE_BLEED_PER_SEC: 6, // stand still on ground → this much drains per second
  INSTABILITY_IDLE_VX_MAX: 8, // |vx| must be under this to count as "standing still"
  INSTABILITY_AIR_BLEED_PER_SEC: 1.5, // slow drain while airborne — skilled movement is rewarded
  INSTABILITY_CONTAIN_DRAIN_PER_SEC: 40, // active containment drain rate
  CONTAINMENT_STUN: 0.15, // post-containment stun: no jump or re-contain during this window

  // ───────────────────────── RUPTURE (shape) ─────────────────────
  RUPTURE_BASE_RADIUS: 32, // symmetric radius at zero velocity
  RUPTURE_MAJOR_MAX: 56, // long axis at max speed
  RUPTURE_MINOR_MIN: 24, // short axis (perpendicular) at max speed
  RUPTURE_SPEED_NORM: 260, // |v| at which shape saturates (≈ MAX_RUN + typical fall contribution)
  RUPTURE_IMPULSE: 320, // base self-impulse magnitude (px/s). ~4 tiles lift off ground with JUMP_GRAVITY.
  RUPTURE_MIN_SPEED_FOR_V_DIR: 40, // |v| below this → use terrain-normal instead of -velocity for impulse direction
  RUPTURE_STEEL_BONUS: 180, // extra impulse added away from hard surfaces the rupture touches

  // ───────────────────────── FRACTURE (event) ────────────────────
  // Tuned so the moment of rupture is felt as *recognition*, not
  // spectacle — "this is happening" beats "whoa cool."
  FRACTURE_IFRAMES: 0.34, // post-fracture invulnerability / instability-gain freeze
  FRACTURE_HITSTOP_FRAMES: 9, // ~150 ms freeze — long enough to register the loss of cohesion
  FRACTURE_SHAKE_AMPLITUDE: 5, // px — lower than a generic "big bang"
  FRACTURE_SHAKE_DURATION: 0.38, // longer decay so the aftermath rings
  FRACTURE_FLASH_DURATION: 0.24, // slightly longer, desaturated
  FRACTURE_FLASH_MAX_ALPHA: 0.45, // softer than a white-out
  FRACTURE_PARTICLES: 22, // polygon shards spawned per fracture
  FRACTURE_SHARD_SIZE_MIN: 2, // px half-extent range
  FRACTURE_SHARD_SIZE_MAX: 4,
  FRACTURE_SHARD_SPIN_MAX: 12, // rad/s, sign randomized
  FRACTURE_ZOOM_PEAK: 0.04, // fraction of camera zoom-in at peak hitstop (0 = off)

  // Pre-fracture dread overlay — pulses red around the frame edges once
  // instability crosses the aura HOT threshold. "It's coming."
  DREAD_MAX_ALPHA: 0.30,
  DREAD_ONSET: 0.85, // ratio at which dread starts painting

  // Material behavior.
  BONE_HITS: 3, // rupture hits before bone fully collapses
  BONE_FRAGILE_COLLAPSE_TIME: 1.8, // seconds of cumulative contact before collapse
  GLASS_SHARD_COUNT: 5, // shards spawned per glass break
  GLASS_SHARD_TTL: 6, // seconds a shard persists
  GLASS_SHARD_SPREAD: 18, // px — shard placement scatter from break center
  GLASS_SHARD_SIZE: 5, // px — half-extent of each shard triangle
  SOFT_DAMPING_PER_SEC: 0.65, // per-second velocity retained while in soft contact (0..1)
  SOFT_RUPTURE_SCALE: 0.55, // rupture radius multiplier when clipping soft (absorbs some)
  RESONANT_IMPULSE_BONUS: 300, // base impulse added away from resonant (replaces steel bonus)
  RESONANT_CHAIN_MULT: 0.35, // +this × (chain length − 1) multiplicative bonus
  RESONANT_JUMP_BOOST: 1.25, // jump velocity multiplier when launching off resonant ground
  RESONANT_CHAIN_JUMP_BONUS: 0.10, // additional multiplier per chain link (stacks)

  // ───────────────────────── READABILITY ─────────────────────────
  // Aura: radial glow under the player, tinted by instability.
  AURA_THRESH_COOL: 0.33, // ≤ this → blue
  AURA_THRESH_WARM: 0.66, // ≤ this → yellow
  AURA_THRESH_HOT: 0.9, // ≤ this → orange; above → pulsing red
  AURA_BASE_RADIUS: 10, // px at 0 instability
  AURA_MAX_RADIUS: 22, // px at 100 instability
  AURA_PULSE_MIN_HZ: 3, // red-pulse frequency at 90%
  AURA_PULSE_MAX_HZ: 12, // red-pulse frequency at 100%
  AURA_COLOR_COOL: 0x4AA3FF,
  AURA_COLOR_WARM: 0xF2D048,
  AURA_COLOR_HOT: 0xF08A3C,
  AURA_COLOR_RED: 0xFF3A3A,

  GHOST_INSTABILITY_THRESHOLD: 92, // start rendering rupture preview at this instability
  // Multi-step foresight: how far forward (seconds) to project + how many
  // samples along that path. Faint by design — mastery layer, not crutch.
  PREVIEW_LOOKAHEAD: 0.28,
  PREVIEW_SAMPLES: 3,
  PREVIEW_ALPHA: 0.32,

  // UI meter
  METER_X: 8,
  METER_Y: 8,
  METER_W: 120,
  METER_H: 3,

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

  // ───────────────────────── DEGRADATION ──────────────────────────
  // Post-controller modifiers. Base accel/decel/gravity untouched. The
  // controller is still perfect; the body is failing. All scale with
  // instability ratio (0..1), applied at the output layer.
  //
  // Litmus: at max, the player should think "I can still win, but I
  // don't trust myself anymore."
  DEGRADE_DAMPING_REDUCTION: 0.30, // decel loses this fraction at ratio=1 (harder to stop, but mild)
  DEGRADE_OVERSPEED: 0.18, // MAX_RUN gains this fraction at ratio=1 (momentum exaggeration)
  DEGRADE_GRAVITY_AMP: 0.0, // NO gravity penalty — never punish air control
  DEGRADE_FRAGMENT_THRESH: 0.7, // ratio above which visual fragmentation kicks in
  DEGRADE_FRAGMENT_JITTER: 1.2, // max jitter amplitude in px at ratio=1

  // ───────────────────────── AESTHETIC / FEEL ─────────────────────
  // Wind: purely aesthetic drift of ambient motes + rupture debris.
  // Never affects gameplay collision. "The world is already falling
  // apart. Wind just reveals it."
  WIND_X: -12, // px/s baseline drift; negative = right→left
  WIND_VARIANCE: 10, // per-particle velocity noise
  WIND_GUST_AMPLITUDE: 6, // slow sinusoidal gust, px/s
  WIND_GUST_HZ: 0.07, // very slow, half-minute-ish cycle
  WIND_MOTE_COUNT: 48, // ambient motes on-screen at any time
  WIND_MOTE_MAX_ALPHA: 0.45,

  // Vignette softness.
  VIGNETTE_STRENGTH: 0.55, // 0 = off, 1 = hard black at corners
  VIGNETTE_INNER: 0.55, // 0..1 of half-diagonal where darkening starts

  // Edge lighting: threshold for "top-facing" on a CCW polygon.
  EDGE_TOP_NORMAL_Y: -0.35, // normal.y < this ⇒ lit edge
  EDGE_BOTTOM_NORMAL_Y: 0.4, // normal.y > this ⇒ shadow edge

  // Parallax.
  PARALLAX_SEED: 0x1A3F, // deterministic silhouette layer generation
} as const

export type Config = typeof CONFIG
