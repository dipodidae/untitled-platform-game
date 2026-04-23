// Palette presets. A single CONFIG.PALETTE_PRESET value selects the whole
// look — material colors, parallax tints, sky, vignette. All numbers live
// here; renderer code reads them via `activePalette()` to stay preset-agnostic.
//
// The art pass (step 6) fleshes out edge/shadow/highlight per material so
// renderer can cheaply fake directional lighting. Step 2 only needs fill +
// a top-edge highlight to keep the current look roughly preserved.

import type { MaterialName } from '../world/level'
import { CONFIG } from '../config'

export interface MaterialPalette {
  fill: number
  edge: number // top-facing edge stroke (lit side)
  shadow: number // bottom/inside AO tint
  highlight: number // bright accent (rivets, spike tips)
}

export interface Palette {
  sky: number // background clear color
  skyLow: number // bottom of the sky gradient
  skyHigh: number // top of the sky gradient
  vignette: number
  materials: Record<MaterialName, MaterialPalette>
  // Parallax layer tints, ordered back → front.
  parallax: readonly number[]
}

const DUSK: Palette = {
  sky: 0x1A1A2E,
  skyLow: 0x3A2A44,
  skyHigh: 0x12142A,
  vignette: 0x000010,
  materials: {
    dirt: {
      fill: 0x8A5A3A,
      edge: 0xB07A4D,
      shadow: 0x4A2A1C,
      highlight: 0xD89866,
    },
    stone: {
      fill: 0x6A6F7A,
      edge: 0x8A909A,
      shadow: 0x3A3F48,
      highlight: 0xB0B6C0,
    },
    steel: {
      fill: 0x9AA5B4,
      edge: 0xC8D2E0,
      shadow: 0x4A525C,
      highlight: 0xEAF0F8,
    },
    hazard: {
      fill: 0xD8444E,
      edge: 0xF09098,
      shadow: 0x7A1E26,
      highlight: 0xFFB8BC,
    },
  },
  parallax: [0x2A2840, 0x3A364A, 0x4A4458, 0x5A5668],
}

const DAWN: Palette = {
  sky: 0x2E1A1E,
  skyLow: 0xE89872,
  skyHigh: 0x2E1A3E,
  vignette: 0x100008,
  materials: {
    dirt: {
      fill: 0x7A4A32,
      edge: 0xA86A46,
      shadow: 0x3A1E12,
      highlight: 0xCE8A58,
    },
    stone: {
      fill: 0x70727E,
      edge: 0x9A9AA4,
      shadow: 0x3C3E46,
      highlight: 0xBEC0CC,
    },
    steel: {
      fill: 0xA0ABBA,
      edge: 0xD2DCE8,
      shadow: 0x505862,
      highlight: 0xF2F6FC,
    },
    hazard: {
      fill: 0xE8544E,
      edge: 0xFFA098,
      shadow: 0x821A1C,
      highlight: 0xFFC8C0,
    },
  },
  parallax: [0x5A3A48, 0x6E4A54, 0x866068, 0xA67A7E],
}

const PRESETS = { dusk: DUSK, dawn: DAWN } as const
export type PalettePreset = keyof typeof PRESETS

export function activePalette(): Palette {
  const key = CONFIG.PALETTE_PRESET
  return PRESETS[key] ?? DUSK
}
