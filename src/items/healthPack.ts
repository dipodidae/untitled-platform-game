// Health pack — restores 1 HP on pickup. Bright green glow so it reads
// instantly as "heal me" against the muted twilight palette.

import type { ItemDef } from './types'

export const HEALTH_PACK: ItemDef = {
  id: 'healthPack',
  w: 10,
  h: 10,
  heals: 1,
  bodyColor: 0x30CC40,
  accentColor: 0xFFFFFF,
  glowColor: 0x40FF60,
}
