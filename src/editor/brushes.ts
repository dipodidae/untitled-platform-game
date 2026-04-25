// Brush registry — every authored brush preset lives here. A brush is a
// named preset that knows which tool to arm and which metadata to apply
// when the user draws a new shape or clicks an existing one.
//
// LIVE columns below indicate runtime support as of this session:
//   live       — the game engine reads this metadata and changes behaviour.
//   editor     — metadata lands in the level JSON but the runtime ignores
//                it (TODO comments in the runtime mark where it would hook in).
//
// Adding a brush: append to BRUSHES, give it a category, apply semantics
// in `applyBrushTo` if it touches existing state.

import type { ItemKind } from '../shared-kernel/types'
import type { KineticJson } from '../world/kinetic'
import type { MaterialName, ZoneJson, ZoneType } from '../world/level'

export type Tool = 'select' | 'polygon' | 'rect' | 'spawn' | 'prowler' | 'dummy' | 'pickup' | 'zone'

interface PendingColliderPreset {
  oneWay?: boolean
  kinetic?: KineticJson
  surfaceMotion?: { vx: number }
  launchPad?: { force: number, angle?: number }
  note?: string
}

interface BrushTarget {
  tool: Tool
  createMaterial: MaterialName
  pendingPreset: PendingColliderPreset | null
  pendingZone: (Partial<ZoneJson> & { type: ZoneType }) | null
  pendingPickupKind: ItemKind
}

export type BrushCategory = 'movement' | 'hazard' | 'timing' | 'guidance' | 'pickups' | 'meta'

export interface Brush {
  id: string
  label: string
  category: BrushCategory
  summary: string
  tool: Tool
  // Iconify icon name (https://icon-sets.iconify.design/). Rendered in the
  // brush button alongside the label.
  icon: string
  // runtime-live? — rendered as a subtle badge in the sidebar.
  live: boolean
  // Default payload applied when the brush creates a shape or zone.
  apply: (target: BrushTarget) => void
}

function setTool(target: BrushTarget, tool: Tool) {
  target.tool = tool
}

export const BRUSHES: Brush[] = [
  // ─── Core movement ───────────────────────────────────────────────────
  {
    id: 'platform-static',
    label: 'Static Platform',
    category: 'movement',
    summary: 'Plain solid geometry.',
    tool: 'rect',
    icon: 'mdi:rectangle-outline',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = null
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-linear',
    label: 'Linear Mover',
    category: 'movement',
    summary: 'Point-A → point-B path, configurable mode.',
    tool: 'rect',
    icon: 'mdi:arrow-left-right-bold',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = { kinetic: { type: 'linear', path: [[0, 0], [120, 0]], speed: 40, mode: 'pingpong' } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-loop',
    label: 'Looping Path',
    category: 'movement',
    summary: 'Cycles through waypoints in order.',
    tool: 'rect',
    icon: 'mdi:sync',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = { kinetic: { type: 'linear', path: [[0, 0], [80, 0], [80, 60], [0, 60]], speed: 40, mode: 'loop' } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-pingpong',
    label: 'Ping-Pong Path',
    category: 'movement',
    summary: 'Walks A↔B and bounces at the ends.',
    tool: 'rect',
    icon: 'mdi:swap-horizontal-bold',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = { kinetic: { type: 'linear', path: [[0, 0], [160, 0]], speed: 60, mode: 'pingpong', pauseAtEnds: 0.3 } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-rotor',
    label: 'Rotating Platform',
    category: 'movement',
    summary: 'Constant-rate rotor around its centroid.',
    tool: 'rect',
    icon: 'mdi:rotate-right',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = { kinetic: { type: 'rotor', speed: 0.5 } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-breather',
    label: 'Breather (Oscillating)',
    category: 'movement',
    summary: 'Subtle vertex oscillation along normals.',
    tool: 'rect',
    icon: 'mdi:pulse',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = { kinetic: { type: 'breather', frequency: 0.6, amplitude: 2 } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-spring',
    label: 'Spring Platform',
    category: 'movement',
    summary: 'Weight-reactive vertical bounce.',
    tool: 'rect',
    icon: 'mdi:arrow-up-bold-box-outline',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = { kinetic: { type: 'spring', stiffness: 180, damping: 8 } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-collapse',
    label: 'Collapse / Decay',
    category: 'movement',
    summary: 'Cracks after player contact; persists across play.',
    tool: 'rect',
    icon: 'mdi:image-broken-variant',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone_fragile'
      s.pendingPreset = null
      setTool(s, 'rect')
    },
  },
  {
    id: 'platform-oneway',
    label: 'One-way Platform',
    category: 'movement',
    summary: 'Solid from above, pass-through from below.',
    tool: 'rect',
    icon: 'mdi:arrow-up-bold',
    live: true,
    apply: (s) => {
      s.createMaterial = 'soft'
      s.pendingPreset = { oneWay: true }
      setTool(s, 'rect')
    },
  },
  {
    id: 'bounce-launch',
    label: 'Bounce / Launch Pad',
    category: 'movement',
    summary: 'Replaces vy with -force on contact.',
    tool: 'rect',
    icon: 'mdi:rocket-launch-outline',
    live: true,
    apply: (s) => {
      s.createMaterial = 'resonant'
      s.pendingPreset = { launchPad: { force: 420, angle: 0 } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'conveyor',
    label: 'Conveyor Surface',
    category: 'movement',
    summary: 'Horizontal nudge while grounded.',
    tool: 'rect',
    icon: 'mdi:conveyor-belt',
    live: true,
    apply: (s) => {
      s.createMaterial = 'bone'
      s.pendingPreset = { surfaceMotion: { vx: 80 } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'wind-zone',
    label: 'Wind / Force Field',
    category: 'movement',
    summary: 'Volumetric force on anything inside.',
    tool: 'zone',
    icon: 'mdi:weather-windy',
    live: true,
    apply: (s) => {
      s.pendingZone = { type: 'wind', windVx: 200, windVy: 0, windTurbulence: 0.1 }
      setTool(s, 'zone')
    },
  },
  {
    id: 'gravity-zone',
    label: 'Gravity Modifier',
    category: 'movement',
    summary: 'Multiplies player gravity inside the volume.',
    tool: 'zone',
    icon: 'mdi:arrow-collapse-down',
    live: true,
    apply: (s) => {
      s.pendingZone = { type: 'gravity', gravityScale: 0.4, airControlScale: 1.2 }
      setTool(s, 'zone')
    },
  },

  // ─── Hazards ─────────────────────────────────────────────────────────
  {
    id: 'hazard-spike',
    label: 'Spike / Damage Surface',
    category: 'hazard',
    summary: 'Static damaging geometry.',
    tool: 'rect',
    icon: 'mdi:triangle-outline',
    live: true,
    apply: (s) => {
      s.createMaterial = 'shard' as never
      s.pendingPreset = null
      setTool(s, 'rect')
    },
  },
  {
    id: 'hazard-sweeping',
    label: 'Sweeping Hazard',
    category: 'hazard',
    summary: 'Hazard surface on a rotor — rhythm piece.',
    tool: 'rect',
    icon: 'mdi:axe',
    live: true,
    apply: (s) => {
      s.createMaterial = 'shard' as never
      s.pendingPreset = { kinetic: { type: 'rotor', speed: 1.5 } }
      setTool(s, 'rect')
    },
  },
  {
    id: 'hazard-volume',
    label: 'Environmental Hazard Volume',
    category: 'hazard',
    summary: 'Damage-per-tick zone (acid/void/lava).',
    tool: 'zone',
    icon: 'mdi:skull-outline',
    live: true,
    apply: (s) => {
      s.pendingZone = { type: 'hazard', hazardDamage: 2 }
      setTool(s, 'zone')
    },
  },

  // ─── Timing / control ────────────────────────────────────────────────
  {
    id: 'trigger-zone',
    label: 'Trigger Volume',
    category: 'timing',
    summary: 'Fires an event on enter/exit. Editor-only for now.',
    tool: 'zone',
    icon: 'mdi:lightning-bolt-outline',
    live: false,
    apply: (s) => {
      s.pendingZone = { type: 'trigger', triggerId: 'trigger-a' }
      setTool(s, 'zone')
    },
  },
  {
    id: 'toggle-state',
    label: 'Toggle / State',
    category: 'timing',
    summary: 'On/off geometry. Editor-only.',
    tool: 'rect',
    icon: 'mdi:toggle-switch-outline',
    live: false,
    apply: (s) => {
      s.pendingPreset = { note: 'toggle:default-off' }
      setTool(s, 'rect')
    },
  },
  {
    id: 'timer-rhythm',
    label: 'Timer / Rhythm',
    category: 'timing',
    summary: 'Global beat controller. Editor-only.',
    tool: 'zone',
    icon: 'mdi:metronome',
    live: false,
    apply: (s) => {
      s.pendingZone = { type: 'trigger', triggerId: 'rhythm-track' }
      setTool(s, 'zone')
    },
  },

  // ─── Guidance ────────────────────────────────────────────────────────
  {
    id: 'arc-hint',
    label: 'Arc Hint',
    category: 'guidance',
    summary: 'Ghost jump arc. Editor-only.',
    tool: 'zone',
    icon: 'mdi:vector-curve',
    live: false,
    apply: (s) => {
      s.pendingZone = { type: 'trigger', triggerId: 'arc-hint' }
      setTool(s, 'zone')
    },
  },
  {
    id: 'zone-goal',
    label: 'Goal Zone',
    category: 'guidance',
    summary: 'Player overlap completes the level.',
    tool: 'zone',
    icon: 'mdi:flag-checkered',
    live: true,
    apply: (s) => {
      s.pendingZone = { type: 'goal' }
      setTool(s, 'zone')
    },
  },
  {
    id: 'zone-checkpoint',
    label: 'Checkpoint',
    category: 'guidance',
    summary: 'Player overlap sets the active respawn point.',
    tool: 'zone',
    icon: 'mdi:map-marker-check',
    live: true,
    apply: (s) => {
      s.pendingZone = { type: 'spawnPoint' }
      setTool(s, 'zone')
    },
  },

  // ─── Pickups ──────────────────────────────────────────────────────────
  {
    id: 'pickup-coin',
    label: 'Coin',
    category: 'pickups',
    summary: 'Gold coin — worth 1. Common collectible.',
    tool: 'pickup',
    icon: 'mdi:circle-medium',
    live: true,
    apply: (s) => {
      s.pendingPickupKind = 'coin'
      setTool(s, 'pickup')
    },
  },
  {
    id: 'pickup-platinum-coin',
    label: 'Platinum Coin',
    category: 'pickups',
    summary: 'Platinum coin — worth 10. Rarer collectible.',
    tool: 'pickup',
    icon: 'mdi:circle-double',
    live: true,
    apply: (s) => {
      s.pendingPickupKind = 'platinumCoin'
      setTool(s, 'pickup')
    },
  },
  {
    id: 'pickup-crown',
    label: 'Diamond Crown',
    category: 'pickups',
    summary: 'Diamond-crested crown — worth 30. Ultra-rare treasure.',
    tool: 'pickup',
    icon: 'mdi:crown',
    live: true,
    apply: (s) => {
      s.pendingPickupKind = 'crown'
      setTool(s, 'pickup')
    },
  },
  {
    id: 'pickup-health',
    label: 'Health Pack',
    category: 'pickups',
    summary: 'Heals 1 HP on pickup.',
    tool: 'pickup',
    icon: 'mdi:heart-plus',
    live: true,
    apply: (s) => {
      s.pendingPickupKind = 'healthPack'
      setTool(s, 'pickup')
    },
  },
  {
    id: 'pickup-armor',
    label: 'Armor Shard',
    category: 'pickups',
    summary: 'Grants 25 armor (shadow HP).',
    tool: 'pickup',
    icon: 'mdi:shield-plus',
    live: true,
    apply: (s) => {
      s.pendingPickupKind = 'armorShard'
      setTool(s, 'pickup')
    },
  },
  {
    id: 'pickup-bigshot',
    label: 'Big Shot',
    category: 'pickups',
    summary: 'Heavy ammo weapon pickup.',
    tool: 'pickup',
    icon: 'mdi:ammunition',
    live: true,
    apply: (s) => {
      s.pendingPickupKind = 'bigShot'
      setTool(s, 'pickup')
    },
  },

  // ─── Meta ────────────────────────────────────────────────────────────
  {
    id: 'modifier-brush',
    label: 'Modifier (all-in-volume)',
    category: 'meta',
    summary: 'Apply a transform to everything inside. Editor-only.',
    tool: 'zone',
    icon: 'mdi:tune-variant',
    live: false,
    apply: (s) => {
      s.pendingZone = { type: 'trigger', triggerId: 'modifier' }
      setTool(s, 'zone')
    },
  },
  {
    id: 'group-link',
    label: 'Group / Link',
    category: 'meta',
    summary: 'Bind movement/timing across shapes. Editor-only.',
    tool: 'select',
    icon: 'mdi:link-variant',
    live: false,
    apply: (s) => {
      setTool(s, 'select')
    },
  },
  {
    id: 'state-stack',
    label: 'State Stack',
    category: 'meta',
    summary: 'Compose multiple modifiers. Editor-only.',
    tool: 'zone',
    icon: 'mdi:layers-outline',
    live: false,
    apply: (s) => {
      s.pendingZone = { type: 'trigger', triggerId: 'state-stack' }
      setTool(s, 'zone')
    },
  },
]

export const BRUSH_CATEGORY_LABEL: Record<BrushCategory, string> = {
  movement: 'Movement',
  hazard: 'Hazards',
  timing: 'Timing',
  guidance: 'Guidance',
  pickups: 'Pickups',
  meta: 'Meta',
}
