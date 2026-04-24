// Breather — subtle vertex oscillation along outward normals. Material-
// driven character: bone flexes, soft ripples with a third harmonic,
// resonant pulses sharply.

import type { Polygon } from '../../shared-kernel/polygon'
import type { Collider, MaterialName } from '../level'
import type { KineticBase, PlayerLike } from './shared'
import { centroid } from '../../shared-kernel/polygon'
import { refreshCollider } from '../level'
import { breatheVertices, playerOnCollider, vertexNormals } from './shared'

export interface BreatherJson {
  type: 'breather'
  frequency?: number // Hz, default 0.6
  amplitude?: number // px, default 2.0
}

export interface BreatherState extends KineticBase {
  type: 'breather'
  phase: number
  frequency: number // cycles per second
  amplitude: number // max vertex displacement in px
  dampMult: number // current damping (1 = normal, player landing lowers this)
  dampRecovery: number // how fast dampMult returns to 1 (/s)
}

export function createBreather(baseVertices: Polygon, json: BreatherJson): BreatherState {
  const pivot = centroid(baseVertices)
  return {
    baseVertices: baseVertices.map(v => ({ x: v.x, y: v.y })),
    pivotX: pivot.x,
    pivotY: pivot.y,
    type: 'breather',
    phase: Math.random() * Math.PI * 2, // stagger so breathers aren't in sync
    frequency: json.frequency ?? 0.6,
    amplitude: json.amplitude ?? 2.0,
    dampMult: 1,
    dampRecovery: 2.0,
  }
}

export function updateBreather(
  c: Collider,
  k: BreatherState,
  player: PlayerLike,
  material: MaterialName,
  dt: number,
): void {
  k.phase += k.frequency * Math.PI * 2 * dt

  // Player landing dampens the breath temporarily
  if (playerOnCollider(player, c) && Math.abs(player.vy) < 5) {
    k.dampMult = Math.max(0.2, k.dampMult - 1.5 * dt)
  }
  if (k.dampMult < 1) {
    k.dampMult = Math.min(1, k.dampMult + k.dampRecovery * dt)
  }

  let displacement: number
  if (material === 'resonant') {
    displacement = Math.abs(Math.sin(k.phase)) * k.amplitude * k.dampMult
  }
  else if (material === 'soft') {
    displacement = (Math.sin(k.phase) * 0.7 + Math.sin(k.phase * 3) * 0.3) * k.amplitude * k.dampMult
  }
  else {
    displacement = Math.sin(k.phase) * k.amplitude * k.dampMult
  }

  const normals = vertexNormals(k.baseVertices)
  c.vertices = breatheVertices(k.baseVertices, normals, displacement)
  refreshCollider(c)
}

// Rupture freezes the breath momentarily — dampMult recovers over seconds.
export function breatherReactToRupture(k: BreatherState, falloff: number): void {
  k.dampMult = Math.max(0, k.dampMult - falloff * 0.8)
}
