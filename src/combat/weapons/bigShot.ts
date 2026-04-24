// Big-shot — granted by the matching pickup in src/items/bigShot.ts. Fatter
// projectile, 10× damage, wider rupture; the 12-second fire cooldown makes
// each shot a deliberate choice. Boss-key rather than a general upgrade:
// each use is a deliberate commitment.

import type { BulletKind } from './types'

export const BIG_SHOT: BulletKind = {
  speed: 340,
  gravity: 140,
  lifeSec: 1.2,
  size: 6,
  ruptureRadius: 24,
  damage: 10,
  coreColor: 0xFFD48C,
  haloColor: 0xC04020,
  fireCooldownSec: 12,
}
