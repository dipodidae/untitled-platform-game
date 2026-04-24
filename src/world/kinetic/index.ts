// Kinetic-elements dispatcher. Each kind (rotor, breather, spring, linear)
// lives in its own file; this index glues them into a single factory and
// per-tick updater so callers see one module.
//
// Adding a new kinetic type means: new file exporting Json + State +
// create + update + (optional) reactToRupture, then registered below in
// the unions + dispatchers.

import type { Polygon } from '../../shared-kernel/polygon'
import type { Level } from '../level'
import type { PlayerLike } from './shared'
import type { BreatherJson, BreatherState } from './breather'
import type { LinearJson, LinearState } from './linear'
import type { RotorJson, RotorState } from './rotor'
import type { SpringJson, SpringState } from './spring'
import { breatherReactToRupture, createBreather, updateBreather } from './breather'
import { createLinear, updateLinear } from './linear'
import { createRotor, rotorReactToRupture, updateRotor } from './rotor'
import { createSpring, springReactToRupture, updateSpring } from './spring'

export type {
  BreatherJson,
  BreatherState,
  LinearJson,
  LinearState,
  PlayerLike,
  RotorJson,
  RotorState,
  SpringJson,
  SpringState,
}

export type { KineticJson } from '../../shared-kernel/types'
import type { KineticJson } from '../../shared-kernel/types'
export type KineticState = RotorState | BreatherState | SpringState | LinearState

export function createKineticState(baseVertices: Polygon, json: KineticJson): KineticState {
  switch (json.type) {
    case 'rotor': return createRotor(baseVertices, json)
    case 'breather': return createBreather(baseVertices, json)
    case 'spring': return createSpring(baseVertices, json)
    case 'linear': return createLinear(baseVertices, json)
  }
}

// Once-per-physics-step dispatch. Cheap — one branch per collider.
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
      case 'linear':
        updateLinear(c, k, player, dt)
        break
    }
  }
}

// Rupture shockwave — nearby kinetic elements react per-type. Falloff is
// computed centrally so per-type handlers stay focused on their reaction.
export function kineticReactToRupture(level: Level, rx: number, ry: number): void {
  for (const c of level.colliders) {
    if (!c.alive || !c.kinetic)
      continue
    const k = c.kinetic
    const dx = k.pivotX - rx
    const dy = k.pivotY - ry
    const dist = Math.hypot(dx, dy)
    if (dist > 120)
      continue
    const falloff = 1 - dist / 120
    switch (k.type) {
      case 'rotor':
        rotorReactToRupture(k, rx, ry, falloff)
        break
      case 'breather':
        breatherReactToRupture(k, falloff)
        break
      case 'spring':
        springReactToRupture(k, falloff)
        break
      case 'linear':
        // Linear platforms don't react to ruptures — their motion is on a
        // fixed schedule. Future: add a stagger here if the visual wants it.
        break
    }
  }
}
