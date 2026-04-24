// Big-shot pickup — grants a heavy-slug weapon that does 10× damage on
// each hit but enforces a 12-second cooldown between shots. Balanced as
// a "boss key" rather than a general upgrade: you want to save it.
//
// Matching bullet profile lives at BULLET_KINDS.bigShot in src/bullet.ts.

import type { ItemDef } from './types'

export const BIG_SHOT: ItemDef = {
  id: 'bigShot',
  w: 12,
  h: 12,
  grantsWeapon: 'bigShot',
  bodyColor: 0xC04020,
  accentColor: 0xFFD48C,
  glowColor: 0xFFA030,
}
