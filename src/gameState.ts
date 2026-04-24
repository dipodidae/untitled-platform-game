// Game-session state — the frame-to-frame stuff that isn't the player, level,
// or FX but *is* cross-system: current phase (gameplay / results / dead),
// deaths tally, level id, and the current checkpoint.
//
// Plain mutable record like the rest of this project's state modules. One
// singleton instance is exported; everyone mutates it in place.

export type GamePhase = 'gameplay' | 'results' | 'dead'

export interface GameState {
  phase: GamePhase
  currentLevelId: string
  deaths: number
  // performance.now() at the start of the current attempt. Reset on respawn?
  // No — timed runs measure the whole attempt including respawns, so this is
  // only reset when a fresh level is loaded.
  startTime: number
  // The most recent checkpoint the player touched. Falls back to the level's
  // authored spawn when null. Cleared on level load.
  lastSpawnPoint: { x: number, y: number } | null
  // performance.now() timestamp at which the current death freeze ends.
  // 0 = no freeze active. Input is suppressed until this passes.
  deathFreezeEndsAt: number
}

export function createGameState(): GameState {
  return {
    phase: 'gameplay',
    currentLevelId: '',
    deaths: 0,
    startTime: performance.now(),
    lastSpawnPoint: null,
    deathFreezeEndsAt: 0,
  }
}

// Prepare for a new level: fresh attempt, no checkpoint, no deaths, no freeze.
// Called by LevelManager on loadLevel.
export function resetForLevel(gs: GameState, levelId: string): void {
  gs.phase = 'gameplay'
  gs.currentLevelId = levelId
  gs.deaths = 0
  gs.startTime = performance.now()
  gs.lastSpawnPoint = null
  gs.deathFreezeEndsAt = 0
}

// The singleton. Import and read/mutate directly.
export const gameState: GameState = createGameState()
