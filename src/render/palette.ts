// FAULTLINE palette. One emotional spectrum. Every color here belongs to
// the same twilight — cool ashen ground, muted rust for threat, a pale
// living warmth for the player against a bruised sky.
//
// The vibe: things were colorful once. They aren't anymore. You are a
// small warm thing inside a world that's already losing its grip.
//
// Materials get { fill, edge, shadow, highlight } so the renderer can
// fake directional light cheaply — top-facing edges lit, bottom-facing
// edges in shadow, inner AO stroke from `shadow`.

import type { MaterialName } from '../world/level'

export interface MaterialPalette {
  fill: number
  edge: number
  shadow: number
  highlight: number
}

export interface Palette {
  skyTop: number
  skyBottom: number
  vignette: number
  parallaxFar: number
  parallaxNear: number
  windMote: number
  player: number
  playerEdge: number
  playerShadow: number
  auraCool: number
  auraWarm: number
  auraHot: number
  meterDim: number
  meterBright: number
  meterChassis: number
  hintText: number
  hintDim: number
  materials: Record<MaterialName, MaterialPalette>
}

export const PALETTE: Palette = {
  // Bruised evening — not quite night, not quite anything else.
  skyTop: 0x15161E,
  skyBottom: 0x2A2530,
  vignette: 0x08080D,
  parallaxFar: 0x1C1E28,
  parallaxNear: 0x262833,
  windMote: 0x6E6C78,
  // Player reads as the last warm thing. Pale amber, slightly grubby.
  player: 0xC8B48E,
  playerEdge: 0xDFC8A0,
  playerShadow: 0x3A2F22,
  // Instability aura. One color family; only intensity moves.
  auraCool: 0x4A5C6A, // low: cold, contained
  auraWarm: 0xA87450, // rising: warming from within
  auraHot: 0xC24634, // near-max: bleeding red
  // UI. No chrome. The bar is a scar, not a meter.
  meterDim: 0x2A2530,
  meterBright: 0xC24634,
  meterChassis: 0x0A0A10,
  hintText: 0x8A8690,
  hintDim: 0x3A3640,
  materials: {
    dirt: {
      // Ashen sand — loose, cool, forgiving to break.
      fill: 0x6A5853,
      edge: 0x8A7A72,
      shadow: 0x3A2E2A,
      highlight: 0x9C8C82,
    },
    stone: {
      // Colder, bluer — reads as older, more set in its ways.
      fill: 0x4E525E,
      edge: 0x707585,
      shadow: 0x252932,
      highlight: 0x8891A0,
    },
    steel: {
      // Pale blue-gray, nearly white but not warm. The unbreakable thing.
      fill: 0x8895A4,
      edge: 0xBEC8D6,
      shadow: 0x3A424C,
      highlight: 0xDEE4EC,
    },
    hazard: {
      // Dried-blood rust. Never bright. Always present.
      fill: 0x7A3A36,
      edge: 0xA4504A,
      shadow: 0x3A1A18,
      highlight: 0xC66A60,
    },
  },
}

export function activePalette(): Palette {
  return PALETTE
}
