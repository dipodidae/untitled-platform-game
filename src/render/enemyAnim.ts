// Per-enemy-kind procedural animation profiles + 2-frame texture alternation.
// Each enemy kind gets a combination of:
//   - bob: vertical sine wave (floaters, flyers)
//   - breathe: scale pulse (organic, pulsing enemies)
//   - wobble: rotation oscillation (aggressive, unsteady enemies)
//   - lean: skewX tilt while moving (walkers)
//   - squash: periodic squash-and-stretch (bouncy enemies)
//   - flicker: alpha oscillation (ghostly, phase-shifting enemies)
//   - framePeriod: seconds per 2-frame cycle (0 = no frame swap)

import type { EnemyKind } from './enemyAssets'

export interface AnimProfile {
  bobAmp: number // pixels of vertical bob
  bobHz: number // cycles per second
  breatheAmp: number // scale multiplier amplitude (0.05 = ±5%)
  breatheHz: number // cycles per second
  wobbleAmp: number // radians of rotation wobble
  wobbleHz: number // cycles per second
  leanAmp: number // skewX lean amplitude (radians)
  leanHz: number // lean frequency
  squashAmp: number // squash-stretch amplitude
  squashHz: number // squash-stretch frequency
  flickerAmp: number // alpha flicker amplitude (0-1)
  flickerHz: number // flicker frequency
  framePeriod: number // seconds between frame A/B swap (0 = static)
}

const ZERO: AnimProfile = {
  bobAmp: 0,
  bobHz: 0,
  breatheAmp: 0,
  breatheHz: 0,
  wobbleAmp: 0,
  wobbleHz: 0,
  leanAmp: 0,
  leanHz: 0,
  squashAmp: 0,
  squashHz: 0,
  flickerAmp: 0,
  flickerHz: 0,
  framePeriod: 0,
}

function prof(overrides: Partial<AnimProfile>): AnimProfile {
  return { ...ZERO, ...overrides }
}

const PROFILES: Record<EnemyKind, AnimProfile> = {
  // Dummy — gentle idle sway
  dummy: prof({ wobbleAmp: 0.04, wobbleHz: 0.8, framePeriod: 0.7 }),

  // Prowler — jitter handled externally; just frame swap + subtle breathe
  prowler: prof({ breatheAmp: 0.04, breatheHz: 2.5, framePeriod: 0.3 }),

  // === Specials ===
  // Mirror — ghostly flicker + subtle breathe
  mirror: prof({ flickerAmp: 0.15, flickerHz: 3, breatheAmp: 0.03, breatheHz: 1.2, framePeriod: 0.6 }),

  // Hush — floating jellyfish bob + gentle breathe
  hush: prof({ bobAmp: 3, bobHz: 0.8, breatheAmp: 0.06, breatheHz: 1.0, framePeriod: 0.5 }),

  // Candlewick — walker lean + lantern bob
  candlewick: prof({ leanAmp: 0.06, leanHz: 2.5, bobAmp: 0.5, bobHz: 3, framePeriod: 0.4 }),

  // Knight — heavy breathing, minimal movement
  knight: prof({ breatheAmp: 0.02, breatheHz: 0.7, squashAmp: 0.02, squashHz: 0.7, framePeriod: 0.8 }),

  // Bloomrot — large organic pulse
  bloomrot: prof({ breatheAmp: 0.08, breatheHz: 0.6, wobbleAmp: 0.02, wobbleHz: 0.4, framePeriod: 0.5 }),

  // Echo — flicker + phasing bob
  echo: prof({ flickerAmp: 0.2, flickerHz: 5, bobAmp: 2, bobHz: 1.3, framePeriod: 0.25 }),

  // HuskCrow — bob already in renderer; add wing flap feel
  huskcrow: prof({ squashAmp: 0.05, squashHz: 3, wobbleAmp: 0.05, wobbleHz: 2.5, framePeriod: 0.35 }),

  // Cartographer — walker lean + subtle bob
  cartographer: prof({ leanAmp: 0.05, leanHz: 2.2, bobAmp: 0.3, bobHz: 2.2, framePeriod: 0.45 }),

  // Shrine — subtle wobble to hint it's alive
  shrine: prof({ wobbleAmp: 0.015, wobbleHz: 0.5, breatheAmp: 0.01, breatheHz: 0.5, framePeriod: 1.0 }),

  // Pilgrim — slow deliberate sway
  pilgrim: prof({ leanAmp: 0.04, leanHz: 1.5, bobAmp: 0.4, bobHz: 1.5, framePeriod: 0.55 }),

  // === Classics ===
  // MedusaHead — floating sine bob
  medusa: prof({ bobAmp: 2, bobHz: 1.5, wobbleAmp: 0.06, wobbleHz: 1.5, framePeriod: 0.4 }),

  // BuzzyBeetle — walker lean
  beetle: prof({ leanAmp: 0.05, leanHz: 3, squashAmp: 0.03, squashHz: 3, framePeriod: 0.35 }),

  // Boo — ghostly bob + flicker when transparent
  boo: prof({ bobAmp: 2, bobHz: 0.7, flickerAmp: 0.1, flickerHz: 2, breatheAmp: 0.04, breatheHz: 0.8, framePeriod: 0.5 }),

  // Wallmaster — ominous slow descent bob
  wallmaster: prof({ breatheAmp: 0.05, breatheHz: 0.6, wobbleAmp: 0.03, wobbleHz: 0.5, framePeriod: 0.6 }),

  // Stalker — aggressive jitter + fast frame swap
  stalker: prof({ wobbleAmp: 0.04, wobbleHz: 6, squashAmp: 0.03, squashHz: 4, framePeriod: 0.2 }),

  // EggplantWizard — casting wobble
  wizard: prof({ wobbleAmp: 0.05, wobbleHz: 1.5, bobAmp: 1, bobHz: 1, framePeriod: 0.5 }),

  // Garpede — fast squash-stretch segments
  garpede: prof({ squashAmp: 0.06, squashHz: 5, leanAmp: 0.04, leanHz: 5, framePeriod: 0.15 }),

  // IronKnuckle — barely moves; heavy breathing
  ironknuckle: prof({ breatheAmp: 0.015, breatheHz: 0.5, framePeriod: 1.0 }),

  // Cagney — organic sway + petal rotation feel
  cagney: prof({ wobbleAmp: 0.06, wobbleHz: 1.2, breatheAmp: 0.05, breatheHz: 0.8, framePeriod: 0.4 }),

  // DryBones — stiff walker rattle
  drybones: prof({ leanAmp: 0.04, leanHz: 3.5, wobbleAmp: 0.03, wobbleHz: 5, framePeriod: 0.3 }),

  // Plantera — large organic pulse
  plantera: prof({ breatheAmp: 0.07, breatheHz: 0.7, wobbleAmp: 0.03, wobbleHz: 0.5, framePeriod: 0.5 }),

  // HammerBro — heavy stomp feel
  hammerbro: prof({ squashAmp: 0.04, squashHz: 2, leanAmp: 0.03, leanHz: 2, framePeriod: 0.4 }),

  // MantisLord — elegant sway
  mantislord: prof({ wobbleAmp: 0.04, wobbleHz: 1, breatheAmp: 0.03, breatheHz: 0.8, framePeriod: 0.5 }),
}

export interface AnimResult {
  offsetY: number
  scaleXMul: number
  scaleYMul: number
  rotation: number
  skewX: number
  alphaMul: number
  useFrameB: boolean
}

export function computeAnim(kind: EnemyKind, time: number, seed: number = 0): AnimResult {
  const p = PROFILES[kind]
  // Offset seed so enemies of same kind don't animate in lockstep
  const t = time + seed * 1.618

  const bob = p.bobAmp > 0
    ? Math.sin(t * p.bobHz * Math.PI * 2) * p.bobAmp
    : 0

  const breathe = p.breatheAmp > 0
    ? 1 + Math.sin(t * p.breatheHz * Math.PI * 2) * p.breatheAmp
    : 1

  const wobble = p.wobbleAmp > 0
    ? Math.sin(t * p.wobbleHz * Math.PI * 2) * p.wobbleAmp
    : 0

  const lean = p.leanAmp > 0
    ? Math.sin(t * p.leanHz * Math.PI * 2) * p.leanAmp
    : 0

  const squashPhase = p.squashAmp > 0
    ? Math.sin(t * p.squashHz * Math.PI * 2) * p.squashAmp
    : 0

  const flicker = p.flickerAmp > 0
    ? 1 - Math.abs(Math.sin(t * p.flickerHz * Math.PI * 2)) * p.flickerAmp
    : 1

  const useFrameB = p.framePeriod > 0
    ? Math.floor(t / p.framePeriod) % 2 === 1
    : false

  return {
    offsetY: bob,
    scaleXMul: breathe * (1 + squashPhase),
    scaleYMul: breathe * (1 - squashPhase),
    rotation: wobble,
    skewX: lean,
    alphaMul: flicker,
    useFrameB,
  }
}

export function getAnimProfile(kind: EnemyKind): AnimProfile {
  return PROFILES[kind]
}
