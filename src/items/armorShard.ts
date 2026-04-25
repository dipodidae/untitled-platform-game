// Armor shard — adds 25 armor points (shadow HP, 100 max). Blue-cyan glow
// so it reads as defensive/shielding.

import type { ItemDef } from './types'

export const ARMOR_SHARD: ItemDef = {
  id: 'armorShard',
  w: 10,
  h: 10,
  grantsArmor: 25,
  bodyColor: 0x3060CC,
  accentColor: 0xB0D0FF,
  glowColor: 0x4080FF,
}
