// Spring — weight-reactive vertical platform. Player presence ramps a
// steady down-force; landing adds an impulse proportional to vy. Standard
// F = -kx - bv + external integrated each tick.

import type { Polygon } from '../../shared-kernel/polygon'
import type { Collider } from '../level'
import type { KineticBase, PlayerLike } from './shared'
import { centroid } from '../../shared-kernel/polygon'
import { refreshCollider } from '../level'
import { playerOnCollider, translateVertices } from './shared'

export interface SpringJson {
  type: 'spring'
  stiffness?: number // default 180
  damping?: number // default 8
}

export interface SpringState extends KineticBase {
  type: 'spring'
  offsetY: number // current vertical displacement from rest
  velocityY: number // current vertical speed
  stiffness: number
  damping: number
  playerWeight: number // 0..1, how much the player is on this
  restY: number // world Y of the rest position
}

export function createSpring(baseVertices: Polygon, json: SpringJson): SpringState {
  const pivot = centroid(baseVertices)
  return {
    baseVertices: baseVertices.map(v => ({ x: v.x, y: v.y })),
    pivotX: pivot.x,
    pivotY: pivot.y,
    type: 'spring',
    offsetY: 0,
    velocityY: 0,
    stiffness: json.stiffness ?? 180,
    damping: json.damping ?? 8,
    playerWeight: 0,
    restY: pivot.y,
  }
}

export function updateSpring(c: Collider, k: SpringState, player: PlayerLike, dt: number): void {
  const isOn = playerOnCollider(player, c)
  const targetWeight = isOn ? 1 : 0
  k.playerWeight += (targetWeight - k.playerWeight) * Math.min(1, 10 * dt)

  const weightForce = k.playerWeight * 50
  let impactForce = 0
  if (isOn && player.vy > 30) {
    impactForce = player.vy * 0.3
  }

  const springForce = -k.stiffness * k.offsetY
  const dampForce = -k.damping * k.velocityY
  const totalForce = springForce + dampForce + weightForce + impactForce

  k.velocityY += totalForce * dt
  k.offsetY += k.velocityY * dt

  // Clamp to prevent wild oscillation.
  const maxOffset = 20
  if (k.offsetY > maxOffset) {
    k.offsetY = maxOffset
    k.velocityY = 0
  }
  if (k.offsetY < -maxOffset) {
    k.offsetY = -maxOffset
    k.velocityY *= -0.5
  }

  c.vertices = translateVertices(k.baseVertices, 0, k.offsetY)
  refreshCollider(c)
}

// Rupture impulse — push down, let spring physics rebound.
export function springReactToRupture(k: SpringState, falloff: number): void {
  k.velocityY += falloff * 80
}

// Exported so the destruction pass can remap carved vertices back to base.
export { translateVertices } from './shared'
export type { Polygon } from '../../shared-kernel/polygon'
