// Big-shot — granted by the matching pickup in src/items/bigShot.ts. Fatter
// projectile, 10× damage, wider rupture; the 12-second fire cooldown makes
// each shot a deliberate choice. Slightly faster and flatter arc than the
// slug so heavy rounds read as heavy.
//
// Base `ruptureRadius` is the damage-1 baseline; the bullet runtime scales
// effective radius by sqrt(damage) at hit time (see src/bullet.ts), so
// damage=10 gives a hole ~3.16× the slug's diameter.

import type { BulletKind } from './types'

export const BIG_SHOT: BulletKind = {
  speed: 440,
  gravity: 140,
  lifeSec: 1.2,
  size: 7,
  ruptureRadius: 12,
  damage: 10,
  coreColor: 0xFFF0C0,
  haloColor: 0xC04020,
  fireCooldownSec: 12.0,
}
