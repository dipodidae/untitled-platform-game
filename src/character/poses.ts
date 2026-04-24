// ─── Pose definitions ────────────────────────────────────────────────────────
// Each pose is a full snapshot of every bone's target rotation in radians.
// Bones not listed default to 0. All rotations are relative to the parent.

import { MIN_JOINT_BEND } from './config'

export interface Pose {
  torso: number
  head: number
  neck: number
  hip: number
  l_upper_arm: number
  l_lower_arm: number
  l_hand: number
  r_upper_arm: number
  r_lower_arm: number
  r_hand: number
  l_upper_leg: number
  l_lower_leg: number
  l_foot: number
  r_upper_leg: number
  r_lower_leg: number
  r_foot: number
}

const B = MIN_JOINT_BEND

export const POSES: Record<string, Pose> = {
  // ─── IDLE ────────────────────────────────────────────────────────────
  idle_a: {
    torso: 0,
    head: 0.02,
    neck: 0,
    hip: 0,
    l_upper_arm: 0.15,
    l_lower_arm: -0.12,
    l_hand: B,
    r_upper_arm: -0.15,
    r_lower_arm: -0.12,
    r_hand: -B,
    l_upper_leg: B,
    l_lower_leg: B,
    l_foot: 0,
    r_upper_leg: -B,
    r_lower_leg: B,
    r_foot: 0,
  },

  idle_b: {
    torso: 0.02,
    head: -0.03,
    neck: 0.01,
    hip: -0.01,
    l_upper_arm: 0.20,
    l_lower_arm: -0.15,
    l_hand: B,
    r_upper_arm: -0.20,
    r_lower_arm: -0.15,
    r_hand: -B,
    l_upper_leg: B,
    l_lower_leg: 0.08,
    l_foot: 0.02,
    r_upper_leg: -B,
    r_lower_leg: 0.08,
    r_foot: -0.02,
  },

  // ─── RUN ─────────────────────────────────────────────────────────────
  // Left leg forward, right arm forward (opposing swing)
  run_stride_l: {
    torso: 0.10,   // lean forward — slightly less on L stride
    head: -0.06,   // counter torso lean — sways with stride
    neck: 0.03,
    hip: -0.08,    // slight counter-rotate
    // Arms: right forward (opposing left leg)
    l_upper_arm: -0.40,   // back
    l_lower_arm: -0.60,   // bent at elbow
    l_hand: B,
    r_upper_arm: 0.40,    // forward
    r_lower_arm: -0.60,
    r_hand: -B,
    // Legs: left forward, right back
    l_upper_leg: -0.55,   // forward swing
    l_lower_leg: 0.15,    // slight extension
    l_foot: -0.10,
    r_upper_leg: 0.55,    // back swing
    r_lower_leg: 0.80,    // knee bend on back leg
    r_foot: 0.20,
  },

  // Right leg forward, left arm forward (mirror)
  run_stride_r: {
    torso: 0.14,   // lean forward — slightly more on R stride
    head: -0.10,   // counter torso lean — opposite sway
    neck: -0.02,
    hip: 0.08,
    // Arms: left forward (opposing right leg)
    l_upper_arm: 0.40,
    l_lower_arm: -0.60,
    l_hand: B,
    r_upper_arm: -0.40,
    r_lower_arm: -0.60,
    r_hand: -B,
    // Legs: right forward, left back
    l_upper_leg: 0.55,
    l_lower_leg: 0.80,
    l_foot: 0.20,
    r_upper_leg: -0.55,
    r_lower_leg: 0.15,
    r_foot: -0.10,
  },

  // ─── JUMP ────────────────────────────────────────────────────────────
  jump_launch: {
    torso: -0.08,    // slight upward lean
    head: -0.05,
    neck: B,
    hip: 0.10,
    // Arms drive upward
    l_upper_arm: -0.80,
    l_lower_arm: -0.40,
    l_hand: -0.10,
    r_upper_arm: -0.80,
    r_lower_arm: -0.40,
    r_hand: 0.10,
    // Legs tuck slightly
    l_upper_leg: 0.30,
    l_lower_leg: 0.50,
    l_foot: -B,
    r_upper_leg: 0.30,
    r_lower_leg: 0.50,
    r_foot: B,
  },

  jump_peak: {
    torso: -0.03,
    head: 0,
    neck: 0,
    hip: B,
    // Arms float out
    l_upper_arm: 0.60,
    l_lower_arm: -0.25,
    l_hand: B,
    r_upper_arm: -0.60,
    r_lower_arm: -0.25,
    r_hand: -B,
    // Legs extend downward
    l_upper_leg: -0.10,
    l_lower_leg: B,
    l_foot: 0,
    r_upper_leg: 0.10,
    r_lower_leg: B,
    r_foot: 0,
  },

  // ─── FALL ────────────────────────────────────────────────────────────
  fall: {
    torso: 0.06,
    head: -0.08,
    neck: B,
    hip: -B,
    // Arms spread wide
    l_upper_arm: 0.90,
    l_lower_arm: -0.35,
    l_hand: 0.15,
    r_upper_arm: -0.90,
    r_lower_arm: -0.35,
    r_hand: -0.15,
    // Legs hang loose
    l_upper_leg: 0.15,
    l_lower_leg: 0.30,
    l_foot: 0.20,
    r_upper_leg: -0.10,
    r_lower_leg: 0.25,
    r_foot: 0.15,
  },

  // ─── WALL SLIDE ─────────────────────────────────────────────────────
  // Character pressed against wall, legs bent, body angled.
  // Facing direction handles the flip — poses assume wall is to the right.
  wall_slide: {
    torso: -0.10,     // lean slightly toward wall
    head: 0.12,       // look down/away from wall
    neck: 0.06,
    hip: 0.06,
    // Near arm (right) reaches up to grip wall
    l_upper_arm: 0.30,    // far arm hangs
    l_lower_arm: -0.40,
    l_hand: B,
    r_upper_arm: -1.20,   // reaching up
    r_lower_arm: -0.90,   // bent at elbow
    r_hand: -0.15,
    // Legs bent, feet pressing against wall
    l_upper_leg: -0.35,
    l_lower_leg: 0.70,
    l_foot: 0.10,
    r_upper_leg: -0.15,
    r_lower_leg: 0.50,
    r_foot: 0.05,
  },

  // ─── LAND ────────────────────────────────────────────────────────────
  // Asymmetric catch: left foot forward, right back — feels like
  // absorbing impact and catching into a step, not a squat.
  land: {
    torso: 0.20,      // deep crunch
    head: 0.08,
    neck: 0.04,
    hip: -0.06,
    // Arms counterbalance — right forward, left back
    l_upper_arm: -0.30,
    l_lower_arm: -0.55,
    l_hand: B,
    r_upper_arm: 0.40,
    r_lower_arm: -0.65,
    r_hand: -B,
    // Left leg forward (catching), right leg back (trailing)
    l_upper_leg: -0.50,   // forward, deep bend
    l_lower_leg: 0.95,    // knee absorbs impact
    l_foot: -0.10,
    r_upper_leg: 0.15,    // trailing back
    r_lower_leg: 0.55,    // moderate bend
    r_foot: 0.10,
  },
}
