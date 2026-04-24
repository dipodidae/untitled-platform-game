// ─── Simple velocity / gravity physics body ─────────────────────────────────

import {
  GRAVITY,
  GROUND_Y,
  JUMP_VELOCITY,
  MAX_FALL,
  MOVE_ACCEL,
  MOVE_DECEL,
  MOVE_SPEED,
} from './config'

export class PhysicsBody {
  x: number
  y: number
  vx = 0
  vy = 0
  grounded = false
  /** True only on the tick we first touch ground after being airborne */
  justLanded = false

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  update(dt: number, inputX: number, jumpPressed: boolean): void {
    const wasGrounded = this.grounded
    this.justLanded = false

    // ─── horizontal ─────────────────────────────────────────────
    if (inputX !== 0) {
      const target = inputX * MOVE_SPEED
      const accel = MOVE_ACCEL * dt
      if (this.vx < target) this.vx = Math.min(this.vx + accel, target)
      else if (this.vx > target) this.vx = Math.max(this.vx - accel, target)
    } else {
      const decel = MOVE_DECEL * dt
      if (this.vx > 0) this.vx = Math.max(0, this.vx - decel)
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + decel)
    }

    // ─── jump ───────────────────────────────────────────────────
    if (jumpPressed && this.grounded) {
      this.vy = JUMP_VELOCITY
      this.grounded = false
    }

    // ─── gravity ────────────────────────────────────────────────
    if (!this.grounded) {
      this.vy += GRAVITY * dt
      if (this.vy > MAX_FALL) this.vy = MAX_FALL
    }

    // ─── integrate ──────────────────────────────────────────────
    this.x += this.vx * dt
    this.y += this.vy * dt

    // ─── ground collision (simple threshold) ────────────────────
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y
      if (this.vy > 0) this.vy = 0
      this.grounded = true
      if (!wasGrounded) {
        this.justLanded = true
      }
    } else {
      this.grounded = false
    }
  }
}
