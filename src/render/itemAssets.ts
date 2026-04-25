// Load and cache pickup item textures (128×128 PNGs in public/assets/items/).

import type { ItemKind } from '../shared-kernel/types'
import { Assets, Texture } from 'pixi.js'

const textures = new Map<ItemKind, Texture>()

const ALL_ITEMS: ItemKind[] = ['healthPack', 'armorShard', 'bigShot', 'coin', 'platinumCoin', 'crown']

export async function loadItemAssets(): Promise<void> {
  const jobs = ALL_ITEMS.map(async (kind) => {
    const url = `/assets/items/${kind}.png`
    try {
      const tex = await Assets.load<Texture>(url)
      textures.set(kind, tex)
    }
    catch {
      console.warn(`[itemAssets] missing sprite: ${url}`)
    }
  })
  await Promise.all(jobs)
}

export function getItemTexture(kind: ItemKind): Texture {
  return textures.get(kind) ?? Texture.EMPTY
}
