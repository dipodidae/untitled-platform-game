// Linear — path-follower platform. Walks between cached waypoints under
// one of three modes:
//   linear   — A→B then teleport back to A (rare; harsh motion)
//   pingpong — A→B→A→B…  (default, reads as a shuttle)
//   loop     — cycles through all waypoints, returning to start
// Easing smooths progress on the current segment; pauseAtEnds dwells at
// endpoints so the motion reads as a rhythm rather than a treadmill.

import type { Polygon } from '../shared-kernel/polygon'
import type { Collider } from '../world/level'
import type { KineticBase, PlayerLike } from './shared'
import { centroid } from '../shared-kernel/polygon'
import { refreshCollider } from '../world/level'
import { translateVertices } from './shared'

export interface LinearJson {
  type: 'linear'
  path: [number, number][] // offsets relative to the authored position
  speed?: number // px/s, default 40
  mode?: 'linear' | 'pingpong' | 'loop'
  easing?: 'linear' | 'sine' | 'stop-start'
  pauseAtEnds?: number // seconds to dwell at each endpoint, default 0
}

export interface LinearState extends KineticBase {
  type: 'linear'
  path: { x: number, y: number }[]
  speed: number
  mode: 'linear' | 'pingpong' | 'loop'
  easing: 'linear' | 'sine' | 'stop-start'
  pauseAtEnds: number
  segment: number
  progress: number
  dwellTimer: number
  direction: 1 | -1
  offsetX: number
  offsetY: number
}

export function createLinear(baseVertices: Polygon, json: LinearJson): LinearState {
  const pivot = centroid(baseVertices)
  const pathAbs = (json.path ?? [[0, 0], [64, 0]]).map(([x, y]) => ({ x, y }))
  return {
    baseVertices: baseVertices.map(v => ({ x: v.x, y: v.y })),
    pivotX: pivot.x,
    pivotY: pivot.y,
    type: 'linear',
    path: pathAbs,
    speed: json.speed ?? 40,
    mode: json.mode ?? 'pingpong',
    easing: json.easing ?? 'linear',
    pauseAtEnds: json.pauseAtEnds ?? 0,
    segment: 0,
    progress: 0,
    dwellTimer: 0,
    direction: 1,
    offsetX: 0,
    offsetY: 0,
  }
}

export function updateLinear(c: Collider, k: LinearState, _player: PlayerLike, dt: number): void {
  if (k.path.length < 2) {
    c.vertices = translateVertices(k.baseVertices, k.offsetX, k.offsetY)
    refreshCollider(c)
    return
  }

  if (k.dwellTimer > 0) {
    k.dwellTimer = Math.max(0, k.dwellTimer - dt)
  }
  else {
    const fromIdx = k.segment
    const toIdx
      = k.mode === 'loop'
        ? (fromIdx + 1) % k.path.length
        : fromIdx + k.direction
    const from = k.path[fromIdx]!
    const to = k.path[toIdx]!
    const dx = to.x - from.x
    const dy = to.y - from.y
    const segLen = Math.hypot(dx, dy) || 1
    k.progress += (k.speed * dt) / segLen
    if (k.progress >= 1) {
      k.progress = 0
      if (k.mode === 'loop') {
        k.segment = toIdx
      }
      else if (k.mode === 'pingpong') {
        const atEnd = (k.direction === 1 && toIdx === k.path.length - 1)
          || (k.direction === -1 && toIdx === 0)
        k.segment = toIdx
        if (atEnd) {
          k.direction = (k.direction * -1) as 1 | -1
          k.dwellTimer = k.pauseAtEnds
        }
      }
      else {
        // 'linear' — A→end then teleport back to 0 (coarse, but deterministic).
        if (toIdx === k.path.length - 1) {
          k.segment = 0
          k.dwellTimer = k.pauseAtEnds
        }
        else {
          k.segment = toIdx
        }
      }
    }
  }

  const fromIdx = k.segment
  const toIdx
    = k.mode === 'loop'
      ? (fromIdx + 1) % k.path.length
      : fromIdx + k.direction
  const from = k.path[Math.max(0, Math.min(k.path.length - 1, fromIdx))]!
  const to = k.path[Math.max(0, Math.min(k.path.length - 1, toIdx))] ?? from
  let t = k.progress
  if (k.easing === 'sine') t = 0.5 - 0.5 * Math.cos(t * Math.PI)
  else if (k.easing === 'stop-start') t = t * t * (3 - 2 * t) // smoothstep
  k.offsetX = from.x + (to.x - from.x) * t
  k.offsetY = from.y + (to.y - from.y) * t

  c.vertices = translateVertices(k.baseVertices, k.offsetX, k.offsetY)
  refreshCollider(c)
}
