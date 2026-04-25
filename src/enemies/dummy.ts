// Dummy — AI-less enemy actor. Sits where placed, takes bullet damage, flashes
// red on hit, disappears when HP drains. No update logic beyond decrementing
// the hit-flash timer. Intended for testing weapon feel + impact effects in
// isolation from prowler AI.

export interface Dummy {
  x: number
  y: number
  readonly w: number
  readonly h: number
  hp: number
  readonly maxHp: number
  alive: boolean
  // Seconds of red flash remaining after a hit — renderer reads this.
  hitFlashTimer: number
}

export const DUMMY_CONFIG = {
  w: 24,
  h: 24,
  maxHp: 5,
  hitFlashSec: 0.12,
} as const

export function createDummy(x: number, y: number, maxHp: number = DUMMY_CONFIG.maxHp): Dummy {
  return {
    x,
    y,
    w: DUMMY_CONFIG.w,
    h: DUMMY_CONFIG.h,
    hp: maxHp,
    maxHp,
    alive: true,
    hitFlashTimer: 0,
  }
}

// Tick timers — no position/velocity changes. Called once per fixed update.
export function updateDummy(d: Dummy, dt: number): void {
  if (d.hitFlashTimer > 0)
    d.hitFlashTimer = Math.max(0, d.hitFlashTimer - dt)
}

// Cheap AABB-vs-point-with-radius. Bullet.size is effectively a point radius
// for hit tests, so we inflate the dummy box by it on each axis.
export function overlapsDummy(d: Dummy, px: number, py: number, radius: number): boolean {
  if (!d.alive)
    return false
  return px >= d.x - radius
    && px <= d.x + d.w + radius
    && py >= d.y - radius
    && py <= d.y + d.h + radius
}

export function damageDummy(d: Dummy, dmg: number): void {
  if (!d.alive)
    return
  d.hp -= dmg
  d.hitFlashTimer = DUMMY_CONFIG.hitFlashSec
  if (d.hp <= 0) {
    d.hp = 0
    d.alive = false
  }
}

// Helper for renderers / physics callers that want the dummy's AABB.
export function dummyAabb(d: Dummy): { x: number, y: number, w: number, h: number } {
  return { x: d.x, y: d.y, w: d.w, h: d.h }
}
