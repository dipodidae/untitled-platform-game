// ─── Character ↔ Player bridge ───────────────────────────────────────────────
// Manages a Character instance driven by the game's Player state.
// Owns the PixiJS Container that gets added to the world scene.

import { Container } from 'pixi.js'
import { Character } from '../character/Character'
import type { CharacterState } from '../character/Character'
import type { Player } from '../player'
import { CONFIG } from '../config'
import { LEG_HEIGHT } from '../character/config'

// Scale factor: the skeleton is authored at ~135px tall; the game AABB is 14px.
// We want the character to be visually bigger than the AABB (~34px tall, ~2 tiles)
// for readability. Stroke width (5) × scale (0.25) = 1.25px on screen.
const CHAR_SCALE = 0.25

// Velocity threshold above which we consider the player "running"
const RUN_VX_THRESHOLD = 15

// Module state for the land callback closure
let _lastSyncedVx = 0

export interface CharacterBridge {
  readonly character: Character
  readonly container: Container // same as character.container, but typed for scene graph
  currentState: CharacterState
  wasGrounded: boolean
}

export function createCharacterBridge(): CharacterBridge {
  const character = new Character()
  character.container.scale.set(CHAR_SCALE)

  // Wire land→run flow check (will be connected to player in sync)
  // Stored externally so syncCharacter can update it
  const bridge: CharacterBridge = {
    character,
    container: character.container,
    currentState: 'IDLE',
    wasGrounded: true,
  }

  // Land→run flow: check if player has horizontal velocity at land recovery
  character.setLandMovingCheck(() => Math.abs(_lastSyncedVx) > RUN_VX_THRESHOLD)

  return bridge
}

/**
 * Sync the Character to the Player's current state each frame.
 * Call once per render frame (NOT per fixed tick).
 */
export function syncCharacter(
  bridge: CharacterBridge,
  player: Player,
  dt: number,
): void {
  const { character } = bridge

  _lastSyncedVx = player.vx

  // ─── Facing ──────────────────────────────────────────────────
  if (player.facing !== character.facing) {
    character.facing = player.facing
  }

  // ─── Resolve desired state from Player ────────────────────────
  const justLanded = !bridge.wasGrounded && player.grounded
  const desired = resolveDesiredState(player, bridge.currentState, justLanded)

  if (desired !== bridge.currentState) {
    // LAND self-resolves — don't interrupt it for IDLE/RUN
    if (bridge.currentState === 'LAND' && (desired === 'IDLE' || desired === 'RUN')) {
      // Let land finish naturally
    } else {
      bridge.currentState = desired
      character.setState(desired)
    }
  }

  // Track land→idle/run internal transitions
  if (bridge.currentState === 'LAND' && (character.state === 'IDLE' || character.state === 'RUN')) {
    bridge.currentState = character.state
  }

  // ─── Position ──────────────────────────────────────────────────
  // Character root is at hip level. The AABB center is at
  // (player.x + W/2, player.y + H/2). We position the character container
  // at the AABB bottom (feet level), offset up so the skeleton's feet
  // roughly align with the bottom of the AABB.
  // At CHAR_SCALE, the leg height below hip is ~57 * CHAR_SCALE ≈ 12px.
  // We want the character centered roughly on the AABB, feet near bottom.
  const feetY = player.y + CONFIG.PLAYER_H // bottom of AABB
  const hipY = feetY - LEG_HEIGHT * CHAR_SCALE // hip sits above feet
  character.container.x = player.x + CONFIG.PLAYER_W / 2
  character.container.y = hipY

  // ─── Update procedural effects ─────────────────────────────────
  character.update(dt)

  // ─── Bookkeeping ───────────────────────────────────────────────
  bridge.wasGrounded = player.grounded
}

function resolveDesiredState(
  player: Player,
  currentState: CharacterState,
  justLanded: boolean,
): CharacterState {
  // Death: fall pose
  if (!player.alive) return 'FALL'

  // Landing
  if (justLanded) return 'LAND'

  // Wall sliding
  if (player.wallSliding) return 'WALL_SLIDE'

  // Airborne
  if (!player.grounded) {
    if (player.vy > 80) return 'FALL'
    return 'JUMP'
  }

  // On ground
  if (currentState === 'LAND') return 'LAND' // let land finish
  if (Math.abs(player.vx) > RUN_VX_THRESHOLD) return 'RUN'
  return 'IDLE'
}

/**
 * Reset the bridge state (call on respawn / level transition).
 */
export function resetCharacterBridge(bridge: CharacterBridge): void {
  bridge.currentState = 'IDLE'
  bridge.wasGrounded = true
  bridge.character.setState('IDLE')
}
