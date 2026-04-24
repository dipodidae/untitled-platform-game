// Kinetic level elements — living geometry that moves, breathes, and reacts.
//
// Three behavior types share one physics language:
//   rotor    — slow inertia-based rotation, torqued by player weight/momentum
//   breather — subtle vertex oscillation along normals, material-driven rhythm
//   spring   — weight-reactive vertical displacement with spring physics
//
// All kinetic colliders store `baseVertices` (the authored shape) and
// recompute `vertices` each tick from base + transform. Physics and
// rendering read `vertices` directly, so everything downstream just works.

import type { Polygon } from './math/polygon'
import type { Vec2 } from './math/vec2'
import type { Collider, Level, MaterialName } from './world/level'
import { centroid } from './math/polygon'
import { refreshCollider } from './world/level'

// ─── types ────────────────────────────────────────────────────────────────

interface KineticBase {
  baseVertices: Polygon
  pivotX: number
  pivotY: number
}

export interface RotorState extends KineticBase {
  type: 'rotor'
  angle: number
  angularVelocity: number
  baseAngularVelocity: number // natural drift (rad/s)
  torqueDecay: number // how fast applied torque bleeds (fraction/s)
}

export interface BreatherState extends KineticBase {
  type: 'breather'
  phase: number
  frequency: number // cycles per second
  amplitude: number // max vertex displacement in px
  dampMult: number // current damping (1 = normal, player landing temporarily lowers this)
  dampRecovery: number // how fast dampMult returns to 1 (/s)
}

export interface SpringState extends KineticBase {
  type: 'spring'
  offsetY: number // current vertical displacement from rest
  velocityY: number // current vertical speed
  stiffness: number // spring constant (higher = snappier)
  damping: number // friction coefficient
  playerWeight: number // 0..1, how much the player is "on" this (ramps up/down)
  restY: number // world Y of the rest position (= pivotY)
}

export type KineticState = RotorState | BreatherState | SpringState

// ─── JSON config shapes (authored in level files) ─────────────────────────

export interface RotorJson {
  type: 'rotor'
  speed?: number // rad/s base rotation, default 0.4
  torqueDecay?: number // default 3.0
}

export interface BreatherJson {
  type: 'breather'
  frequency?: number // Hz, default 0.6
  amplitude?: number // px, default 2.0
}

export interface SpringJson {
  type: 'spring'
  stiffness?: number // default 180
  damping?: number // default 8
}

export type KineticJson = RotorJson | BreatherJson | SpringJson

// ─── factory ──────────────────────────────────────────────────────────────

export function createKineticState(
  baseVertices: Polygon,
  json: KineticJson,
): KineticState {
  const pivot = centroid(baseVertices)
  const base: KineticBase = {
    baseVertices: baseVertices.map(v => ({ x: v.x, y: v.y })),
    pivotX: pivot.x,
    pivotY: pivot.y,
  }

  switch (json.type) {
    case 'rotor':
      return {
        ...base,
        type: 'rotor',
        angle: 0,
        angularVelocity: json.speed ?? 0.4,
        baseAngularVelocity: json.speed ?? 0.4,
        torqueDecay: json.torqueDecay ?? 3.0,
      }
    case 'breather':
      return {
        ...base,
        type: 'breather',
        phase: Math.random() * Math.PI * 2, // stagger so breathers aren't in sync
        frequency: json.frequency ?? 0.6,
        amplitude: json.amplitude ?? 2.0,
        dampMult: 1,
        dampRecovery: 2.0,
      }
    case 'spring':
      return {
        ...base,
        type: 'spring',
        offsetY: 0,
        velocityY: 0,
        stiffness: json.stiffness ?? 180,
        damping: json.damping ?? 8,
        playerWeight: 0,
        restY: pivot.y,
      }
  }
}

// ─── per-vertex normal computation (outward-facing) ───────────────────────

function vertexNormals(poly: Polygon): Vec2[] {
  const n = poly.length
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]!
    const next = poly[(i + 1) % n]!
    let nx = -(next.y - prev.y)
    let ny = next.x - prev.x
    const len = Math.hypot(nx, ny) || 1
    nx /= len
    ny /= len
    out.push({ x: nx, y: ny })
  }
  return out
}

// ─── transform helpers ────────────────────────────────────────────────────

function rotateVertices(base: Polygon, pivotX: number, pivotY: number, angle: number): Polygon {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return base.map((v) => {
    const dx = v.x - pivotX
    const dy = v.y - pivotY
    return {
      x: pivotX + dx * c - dy * s,
      y: pivotY + dx * s + dy * c,
    }
  })
}

function translateVertices(base: Polygon, ox: number, oy: number): Polygon {
  return base.map(v => ({ x: v.x + ox, y: v.y + oy }))
}

function breatheVertices(base: Polygon, normals: Vec2[], t: number): Polygon {
  return base.map((v, i) => {
    const n = normals[i]!
    return {
      x: v.x + n.x * t,
      y: v.y + n.y * t,
    }
  })
}

// ─── player detection helpers ─────────────────────────────────────────────

interface PlayerLike {
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  grounded: boolean
}

function playerOnCollider(p: PlayerLike, c: Collider): boolean {
  if (!p.grounded)
    return false
  // Check if player's bottom overlaps collider's top region
  const pBottom = p.y + p.h
  const pLeft = p.x
  const pRight = p.x + p.w
  // Player bottom must be near collider top and horizontally overlapping
  return pBottom >= c.minY - 2 && pBottom <= c.minY + 6
    && pRight > c.minX && pLeft < c.maxX
}

// ─── update ───────────────────────────────────────────────────────────────

function updateRotor(c: Collider, k: RotorState, player: PlayerLike, dt: number): void {
  // Player torque: standing on one side of the pivot pushes rotation
  if (playerOnCollider(player, c)) {
    const playerCx = player.x + player.w / 2
    const leverArm = playerCx - k.pivotX
    // Torque proportional to lever arm and player momentum
    const torque = leverArm * 0.0008 + player.vx * 0.0003
    k.angularVelocity += torque * dt
  }

  // Decay toward base velocity
  const diff = k.angularVelocity - k.baseAngularVelocity
  k.angularVelocity -= diff * k.torqueDecay * dt

  // Integrate angle
  k.angle += k.angularVelocity * dt

  // Transform vertices
  c.vertices = rotateVertices(k.baseVertices, k.pivotX, k.pivotY, k.angle)
  refreshCollider(c)
}

function updateBreather(c: Collider, k: BreatherState, player: PlayerLike, _material: MaterialName, dt: number): void {
  // Advance phase
  k.phase += k.frequency * Math.PI * 2 * dt

  // Player landing dampens the breath temporarily
  if (playerOnCollider(player, c) && Math.abs(player.vy) < 5) {
    k.dampMult = Math.max(0.2, k.dampMult - 1.5 * dt)
  }
  // Recover toward 1
  if (k.dampMult < 1) {
    k.dampMult = Math.min(1, k.dampMult + k.dampRecovery * dt)
  }

  // Material-driven breath character:
  //   bone    — slow flex (sin)
  //   soft    — ripple (sin + harmonic)
  //   resonant — crisp pulse (abs sin, sharper)
  let displacement: number
  const mat = c.material
  if (mat === 'resonant') {
    // Sharp pulse — abs(sin) gives a "hum" feel
    displacement = Math.abs(Math.sin(k.phase)) * k.amplitude * k.dampMult
  }
  else if (mat === 'soft') {
    // Ripple — primary + third harmonic for organic wobble
    displacement = (Math.sin(k.phase) * 0.7 + Math.sin(k.phase * 3) * 0.3) * k.amplitude * k.dampMult
  }
  else {
    // Bone/default — simple slow flex
    displacement = Math.sin(k.phase) * k.amplitude * k.dampMult
  }

  const normals = vertexNormals(k.baseVertices)
  c.vertices = breatheVertices(k.baseVertices, normals, displacement)
  refreshCollider(c)
}

function updateSpring(c: Collider, k: SpringState, player: PlayerLike, dt: number): void {
  // Detect player presence on the platform
  const isOn = playerOnCollider(player, c)
  const targetWeight = isOn ? 1 : 0
  // Smooth weight ramp (not instant snap)
  k.playerWeight += (targetWeight - k.playerWeight) * Math.min(1, 10 * dt)

  // External force: player weight + landing impact
  const weightForce = k.playerWeight * 50 // steady downward force when standing
  let impactForce = 0
  if (isOn && player.vy > 30) {
    // Landing impact adds a burst proportional to velocity
    impactForce = player.vy * 0.3
  }

  // Spring physics: F = -kx - bv + external
  const springForce = -k.stiffness * k.offsetY
  const dampForce = -k.damping * k.velocityY
  const totalForce = springForce + dampForce + weightForce + impactForce

  k.velocityY += totalForce * dt
  k.offsetY += k.velocityY * dt

  // Clamp to prevent wild oscillation
  const maxOffset = 20
  if (k.offsetY > maxOffset) {
    k.offsetY = maxOffset
    k.velocityY = 0
  }
  if (k.offsetY < -maxOffset) {
    k.offsetY = -maxOffset
    k.velocityY *= -0.5
  }

  // Transform: translate all vertices by offsetY
  c.vertices = translateVertices(k.baseVertices, 0, k.offsetY)
  refreshCollider(c)
}

// ─── main tick — call once per physics step ───────────────────────────────

export function updateKinetics(level: Level, player: PlayerLike, dt: number): void {
  for (const c of level.colliders) {
    if (!c.alive || !c.kinetic)
      continue
    const k = c.kinetic
    switch (k.type) {
      case 'rotor':
        updateRotor(c, k, player, dt)
        break
      case 'breather':
        updateBreather(c, k, player, c.material, dt)
        break
      case 'spring':
        updateSpring(c, k, player, dt)
        break
    }
  }
}

// ─── rupture interaction ──────────────────────────────────────────────────
// Called after a rupture fires. Nearby kinetic elements react:
//   rotors  — jolt angular velocity
//   breathers — momentarily freeze (dampen to 0)
//   springs — impulse downward then rebound

export function kineticReactToRupture(level: Level, rx: number, ry: number): void {
  for (const c of level.colliders) {
    if (!c.alive || !c.kinetic)
      continue
    const k = c.kinetic
    const dx = k.pivotX - rx
    const dy = k.pivotY - ry
    const dist = Math.hypot(dx, dy)
    if (dist > 120)
      continue // out of range

    const falloff = 1 - dist / 120 // 1 at center, 0 at edge

    switch (k.type) {
      case 'rotor': {
        // Jolt rotation based on relative angle
        const torqueDir = dx > 0 ? 1 : -1
        k.angularVelocity += torqueDir * falloff * 2.0
        break
      }
      case 'breather':
        // Freeze momentarily
        k.dampMult = Math.max(0, k.dampMult - falloff * 0.8)
        break
      case 'spring':
        // Impulse: push down then let spring physics rebound
        k.velocityY += falloff * 80
        break
    }
  }
}
