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
  skyTop: 0x2A3868,
  skyBottom: 0x3A5080,
  vignette: 0x000000,
  parallaxFar: 0x243858,
  parallaxNear: 0x344868,
  windMote: 0x506888,
  player: 0xE0D8C8,
  playerEdge: 0xFFFFFF,
  playerShadow: 0x1A2A38,
  auraCool: 0x4060C0,
  auraWarm: 0xC8A020,
  auraHot: 0xCC2020,
  meterDim: 0x5A7050,
  meterBright: 0xD83030,
  meterChassis: 0x181820,
  hintText: 0xA0B0C0,
  hintDim: 0x505060,
  materials: {
    // Pale blue-grey, translucent. Fragile light.
    glass: {
      fill: 0xB8CFE0,
      edge: 0xE8F4FF,
      shadow: 0x1A2A38,
      highlight: 0xFFFFFF,
    },
    // Yellowed off-white. The floor of this world is old bone.
    bone: {
      fill: 0xC8B89A,
      edge: 0xE8D8B8,
      shadow: 0x2A1E10,
      highlight: 0xF0E8D0,
    },
    // Yellowed, aging bone. Reads as "this won't last."
    bone_fragile: {
      fill: 0xB8A878,
      edge: 0xD0C090,
      shadow: 0x2A1E10,
      highlight: 0xE0D8A0,
    },
    // Deep cold navy — hums even when still.
    resonant: {
      fill: 0x1A1E3A,
      edge: 0x4060C0,
      shadow: 0x05070F,
      highlight: 0x8090FF,
    },
    // Mauve-grey, slightly pillowy. Inviting, expensive.
    soft: {
      fill: 0x7A5A70,
      edge: 0xC090B0,
      shadow: 0x1A0A18,
      highlight: 0xE0B0D0,
    },
    // Shards left by glass breaks. Harsh red, always present.
    shard: {
      fill: 0xCC2020,
      edge: 0xFF6040,
      shadow: 0x200000,
      highlight: 0xFFAAAA,
    },
  },
}

export function activePalette(): Palette {
  return PALETTE
}
