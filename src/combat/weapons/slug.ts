// Slug — the default sidearm. Heavy, visibly arcs mid-flight, reads as a
// pistol-level round. Drop over full lifetime ≈ 0.5 * 280 * 1² = 140 px
// against ~360 px range, so shots visibly curve down past medium range.

import type { BulletKind } from './types'

export const SLUG: BulletKind = {
  speed: 380,
  gravity: 180,
  lifeSec: 1.0,
  size: 3,
  ruptureRadius: 12,
  damage: 1,
  coreColor: 0xFFD48C,
  haloColor: 0x8A2A1C,
  fireCooldownSec: 0.14,
}
