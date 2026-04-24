// Rotor — slow inertia-based rotation, torqued by player weight / momentum.

import type { Polygon } from '../../shared-kernel/polygon'
import type { Collider } from '../level'
import type { KineticBase, PlayerLike } from './shared'
import { centroid } from '../../shared-kernel/polygon'
import { refreshCollider } from '../level'
import { playerOnCollider, rotateVertices } from './shared'

export interface RotorJson {
  type: 'rotor'
  speed?: number // rad/s base rotation, default 0.4
  torqueDecay?: number // default 3.0
}

export interface RotorState extends KineticBase {
  type: 'rotor'
  angle: number
  angularVelocity: number
  baseAngularVelocity: number // natural drift (rad/s)
  torqueDecay: number // how fast applied torque bleeds (fraction/s)
}

export function createRotor(baseVertices: Polygon, json: RotorJson): RotorState {
  const pivot = centroid(baseVertices)
  return {
    baseVertices: baseVertices.map(v => ({ x: v.x, y: v.y })),
    pivotX: pivot.x,
    pivotY: pivot.y,
    type: 'rotor',
    angle: 0,
    angularVelocity: json.speed ?? 0.4,
    baseAngularVelocity: json.speed ?? 0.4,
    torqueDecay: json.torqueDecay ?? 3.0,
  }
}

export function updateRotor(c: Collider, k: RotorState, player: PlayerLike, dt: number): void {
  // Player torque: standing on one side of the pivot pushes rotation
  if (playerOnCollider(player, c)) {
    const playerCx = player.x + player.w / 2
    const leverArm = playerCx - k.pivotX
    const torque = leverArm * 0.0008 + player.vx * 0.0003
    k.angularVelocity += torque * dt
  }
  // Decay toward base velocity
  const diff = k.angularVelocity - k.baseAngularVelocity
  k.angularVelocity -= diff * k.torqueDecay * dt
  // Integrate angle
  k.angle += k.angularVelocity * dt
  c.vertices = rotateVertices(k.baseVertices, k.pivotX, k.pivotY, k.angle)
  refreshCollider(c)
}

// Rupture shockwave — jolts angular velocity away from the blast's lever arm.
export function rotorReactToRupture(k: RotorState, rx: number, _ry: number, falloff: number): void {
  const dx = k.pivotX - rx
  const torqueDir = dx > 0 ? 1 : -1
  k.angularVelocity += torqueDir * falloff * 2.0
}
