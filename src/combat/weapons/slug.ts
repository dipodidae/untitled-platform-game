// Slug — the default sidearm. Heavy, visibly arcs mid-flight, reads as a
// pistol-level round. Drop over full lifetime ≈ 0.5 * 280 * 1² = 140 px
// against ~360 px range, so shots visibly curve down past medium range.

import type { BulletKind } from './types'

export const SLUG: BulletKind = {
  speed: 420,
  gravity: 120,
  lifeSec: 0.8,
  size: 2,
  ruptureRadius: 10,
  damage: 1,
  coreColor: 0xFFD48C,
  haloColor: 0x8A2A1C,
  fireCooldownSec: 0.055,
}
