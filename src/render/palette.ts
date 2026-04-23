// FAULTLINE palette. One emotional spectrum. Every color belongs to the
// same twilight — ashen materials, muted rust for threat, a small warm
// body against a bruised sky.

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
  skyTop: 0x15161E,
  skyBottom: 0x2A2530,
  vignette: 0x08080D,
  parallaxFar: 0x1C1E28,
  parallaxNear: 0x262833,
  windMote: 0x6E6C78,
  player: 0xC8B48E,
  playerEdge: 0xDFC8A0,
  playerShadow: 0x3A2F22,
  auraCool: 0x4A5C6A,
  auraWarm: 0xA87450,
  auraHot: 0xC24634,
  meterDim: 0x2A2530,
  meterBright: 0xC24634,
  meterChassis: 0x0A0A10,
  hintText: 0x8A8690,
  hintDim: 0x3A3640,
  materials: {
    // Pale bluish-green, almost translucent. Reads as fragile instantly.
    glass: {
      fill: 0x4E6470,
      edge: 0x9ABCC6,
      shadow: 0x22303A,
      highlight: 0xCDE4EA,
    },
    // Off-white yellow-gray. The floor of this world is old bone.
    bone: {
      fill: 0xB6A684,
      edge: 0xD4C8A4,
      shadow: 0x564A34,
      highlight: 0xE8DDBA,
    },
    // Steel-cold with a subtle violet cast — hums even when still.
    resonant: {
      fill: 0x5E6A80,
      edge: 0x9FAEC8,
      shadow: 0x2E3442,
      highlight: 0xC6D4E8,
    },
    // Mauve-pink, slightly pillowy. Inviting, expensive.
    soft: {
      fill: 0x7C5C6A,
      edge: 0xA1838F,
      shadow: 0x3E2A34,
      highlight: 0xBE9EAA,
    },
    // Shards left by glass breaks. Rust-red, always present.
    shard: {
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
