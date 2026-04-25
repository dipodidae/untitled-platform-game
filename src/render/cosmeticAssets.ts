// Cosmetic asset loader. Reads the `cosmetics` field from a LevelJson
// and loads the referenced parallax PNGs + prop sprite sheets into
// GPU-ready textures. Pure data — no rendering logic here.

import type { CosmeticJson } from '../shared-kernel/types'
import { Assets, Rectangle, Texture } from 'pixi.js'

export interface ParallaxLayer {
  texture: Texture
  depth: number
  yDepth: number
  baseY: number
}

export interface PropDef {
  name: string
  texture: Texture
  anchor: [number, number]
}

export interface CosmeticData {
  parallax: ParallaxLayer[]
  props: PropDef[]
  propDensity: number
  propScatterSeed: number
}

export async function loadCosmeticAssets(json: CosmeticJson | undefined): Promise<CosmeticData | null> {
  if (!json)
    return null

  // Load parallax layers
  const parallaxLayers: ParallaxLayer[] = []
  if (json.parallax) {
    for (const p of json.parallax) {
      try {
        const tex = await Assets.load(p.file) as Texture
        parallaxLayers.push({
          texture: tex,
          depth: p.depth,
          yDepth: p.yDepth,
          baseY: p.baseY,
        })
      }
      catch {
        // Missing parallax layer — skip silently
      }
    }
  }

  // Load prop sheet and slice into individual textures
  const propDefs: PropDef[] = []
  let propDensity = 0
  let propScatterSeed = 0

  if (json.props) {
    propDensity = json.props.density
    propScatterSeed = json.props.scatterSeed
    try {
      const sheetTex = await Assets.load(json.props.file) as Texture
      for (const sp of json.props.sprites) {
        const frame = new Rectangle(sp.x, sp.y, sp.w, sp.h)
        const tex = new Texture({ source: sheetTex.source, frame })
        propDefs.push({ name: sp.name, texture: tex, anchor: sp.anchor })
      }
    }
    catch {
      // Missing prop sheet — skip silently
    }
  }

  return {
    parallax: parallaxLayers,
    props: propDefs,
    propDensity,
    propScatterSeed,
  }
}
