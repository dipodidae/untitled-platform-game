// Enemy sprite asset loader. Loads all 25 enemy PNG sprites (frame A + B)
// at startup and exposes them as Pixi Textures keyed by enemy kind name.

import { Assets, Texture } from 'pixi.js'

export type EnemyKind
  = | 'dummy' | 'prowler'
    | 'mirror' | 'hush' | 'candlewick' | 'knight' | 'bloomrot'
    | 'echo' | 'huskcrow' | 'cartographer' | 'shrine' | 'pilgrim'
    | 'medusa' | 'beetle' | 'boo' | 'wallmaster' | 'stalker'
    | 'wizard' | 'garpede' | 'ironknuckle' | 'cagney' | 'drybones'
    | 'plantera' | 'hammerbro' | 'mantislord'

const ENEMY_KINDS: EnemyKind[] = [
  'dummy',
  'prowler',
  'mirror',
  'hush',
  'candlewick',
  'knight',
  'bloomrot',
  'echo',
  'huskcrow',
  'cartographer',
  'shrine',
  'pilgrim',
  'medusa',
  'beetle',
  'boo',
  'wallmaster',
  'stalker',
  'wizard',
  'garpede',
  'ironknuckle',
  'cagney',
  'drybones',
  'plantera',
  'hammerbro',
  'mantislord',
]

const texturesA = new Map<EnemyKind, Texture>()
const texturesB = new Map<EnemyKind, Texture>()

export async function loadEnemyAssets(): Promise<void> {
  // Load frame A (required) and frame B (optional) separately so a missing
  // _b file doesn't block the primary sprites.
  const urlsA = ENEMY_KINDS.map(k => `/assets/enemies/${k}.png`)
  const urlsB = ENEMY_KINDS.map(k => `/assets/enemies/${k}_b.png`)

  const loadedA = await Assets.load(urlsA)
  // Frame B may not exist yet — tolerate failures.
  const loadedB = await Assets.load(urlsB).catch(() => ({}))

  for (const kind of ENEMY_KINDS) {
    const keyA = `/assets/enemies/${kind}.png`
    const texA = (loadedA as Record<string, unknown>)[keyA] ?? Assets.get(keyA)
    if (texA instanceof Texture) {
      texturesA.set(kind, texA)
    }
    const keyB = `/assets/enemies/${kind}_b.png`
    const texB = (loadedB as Record<string, unknown>)[keyB] ?? Assets.get(keyB)
    if (texB instanceof Texture) {
      texturesB.set(kind, texB)
    }
  }
}

export function getEnemyTexture(kind: EnemyKind, frameB = false): Texture {
  if (frameB) {
    const b = texturesB.get(kind)
    if (b && b !== Texture.EMPTY)
      return b
  }
  return texturesA.get(kind) ?? Texture.EMPTY
}

export function hasFrameB(kind: EnemyKind): boolean {
  const b = texturesB.get(kind)
  return b != null && b !== Texture.EMPTY
}

export function enemyAssetsReady(): boolean {
  return texturesA.size === ENEMY_KINDS.length
}
