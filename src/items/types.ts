// Pickup/item system — shared types.
//
// Each item has its own file in src/items/ that exports an ItemDef; add a
// new file and register it in src/items/index.ts to make it available to
// levels. The runtime state for a placed pickup is the Pickup struct below:
// level JSON lists spawn points, createPickupsFromSpawns hydrates them.

import type { BulletKindName } from '../combat/bullet'

export type { ItemKind } from '../shared-kernel/types'
import type { ItemKind } from '../shared-kernel/types'

export interface ItemDef {
  readonly id: ItemKind
  readonly w: number
  readonly h: number
  // Weapon to equip when picked up. Matches a key in bullet.BULLET_KINDS.
  readonly grantsWeapon: BulletKindName
  // Visual — simple pixel-rendered pickup so it reads without assets.
  readonly bodyColor: number
  readonly accentColor: number
  readonly glowColor: number
}

export interface Pickup {
  x: number
  y: number
  w: number
  h: number
  kind: ItemKind
  alive: boolean
  // Animation phase for bob + pulse. Advances at render cadence.
  bobPhase: number
}
