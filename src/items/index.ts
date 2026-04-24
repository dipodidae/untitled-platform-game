// Item registry — every pickup kind authored in levels must be registered
// here so the runtime can look up its ItemDef by string id.

import type { ItemDef, ItemKind, Pickup } from './types'
import { BIG_SHOT } from './bigShot'

const ITEMS: Record<ItemKind, ItemDef> = {
  bigShot: BIG_SHOT,
}

export function getItemDef(kind: ItemKind): ItemDef {
  return ITEMS[kind]
}

export interface PickupSpawn {
  x: number
  y: number
  kind: ItemKind
}

export function createPickupsFromSpawns(spawns: readonly PickupSpawn[]): Pickup[] {
  return spawns.map((s) => {
    const def = ITEMS[s.kind]
    return {
      x: s.x - def.w / 2,
      y: s.y - def.h / 2,
      w: def.w,
      h: def.h,
      kind: s.kind,
      alive: true,
      bobPhase: Math.random() * Math.PI * 2,
    }
  })
}

export function tickPickups(pickups: readonly Pickup[], dt: number): void {
  for (const p of pickups) {
    if (!p.alive)
      continue
    p.bobPhase += dt * 2.2
  }
}

// AABB overlap for pickup → player contact.
export function pickupOverlapsPlayer(
  p: Pickup,
  player: { x: number, y: number, w: number, h: number },
): boolean {
  return p.alive
    && player.x < p.x + p.w
    && player.x + player.w > p.x
    && player.y < p.y + p.h
    && player.y + player.h > p.y
}

export type { ItemDef, ItemKind, Pickup } from './types'
