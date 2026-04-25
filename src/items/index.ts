// Item registry — every pickup kind authored in levels must be registered
// here so the runtime can look up its ItemDef by string id.

import type { ItemDef, ItemKind, Pickup } from './types'
import { ARMOR_SHARD } from './armorShard'
import { BIG_SHOT } from './bigShot'
import { COIN } from './coin'
import { CROWN } from './crown'
import { HEALTH_PACK } from './healthPack'
import { PLATINUM_COIN } from './platinumCoin'

const ITEMS: Record<ItemKind, ItemDef> = {
  bigShot: BIG_SHOT,
  coin: COIN,
  crown: CROWN,
  healthPack: HEALTH_PACK,
  armorShard: ARMOR_SHARD,
  platinumCoin: PLATINUM_COIN,
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

export function tickPickups(
  pickups: readonly Pickup[],
  dt: number,
  playerX?: number,
  playerY?: number,
  playerW?: number,
  playerH?: number,
): void {
  const ATTRACT_RADIUS = 60
  const ATTRACT_SPEED = 120
  const pcx = playerX !== undefined ? playerX + (playerW ?? 0) / 2 : undefined
  const pcy = playerY !== undefined ? playerY + (playerH ?? 0) / 2 : undefined
  for (const p of pickups) {
    if (!p.alive)
      continue
    p.bobPhase += dt * 2.2
    // Gravitate toward player when close.
    if (pcx !== undefined && pcy !== undefined) {
      const cx = p.x + p.w / 2
      const cy = p.y + p.h / 2
      const dx = pcx - cx
      const dy = pcy - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < ATTRACT_RADIUS && dist > 1) {
        const strength = (1 - dist / ATTRACT_RADIUS) * ATTRACT_SPEED * dt
        p.x += (dx / dist) * strength
        p.y += (dy / dist) * strength
      }
    }
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
