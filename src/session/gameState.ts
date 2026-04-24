// Game-session state — the frame-to-frame stuff that isn't the player, level,
// or FX but *is* cross-system: current phase (gameplay / results / dead),
// deaths tally, level id, and the current checkpoint.
//
// Plain mutable record like the rest of this project's state modules. One
// singleton instance is exported; everyone mutates it in place.
//
// Named `GameSession` to avoid colliding with the `GameState` bundle in
// game.ts (player + level + camera + fx + …).

// Phases:
//   menu      — title screen is up; physics paused, input ignored.
//   dropIn    — cinematic title-card + HUD stagger; physics paused.
//   gameplay  — normal play.
//   dead      — die() ran; awaiting respawn (either freeze-over or R).
//   results   — goal reached; results overlay up, physics paused.
export type GamePhase = 'menu' | 'dropIn' | 'gameplay' | 'dead' | 'results'

export interface GameSession {
  phase: GamePhase
  currentLevelId: string
  deaths: number
  // performance.now() at the start of the current attempt. Not reset on
  // respawn — timed runs measure the whole attempt including deaths.
  // Reset only by resetForLevel (fresh level load).
  startTime: number
  // The most recent checkpoint the player touched. Falls back to the level's
  // authored spawn when null. Cleared on level load.
  lastSpawnPoint: { x: number, y: number } | null
  // performance.now() timestamp at which the current death freeze ends.
  // 0 = no freeze active. Input is suppressed by game.ts until this passes.
  deathFreezeEndsAt: number
}

export function createGameSession(): GameSession {
  return {
    // Bootstrap phase. main.ts flips this to 'menu' after createGame so the
    // main menu is the first thing the player sees. Default stays
    // 'gameplay' so a theoretical caller that bypasses main.ts still gets
    // a running world.
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
export function resetForLevel(gs: GameSession, levelId: string): void {
  gs.phase = 'gameplay'
  gs.currentLevelId = levelId
  gs.deaths = 0
  gs.startTime = performance.now()
  gs.lastSpawnPoint = null
  gs.deathFreezeEndsAt = 0
}

// The singleton. Import and read/mutate directly.
export const gameState: GameSession = createGameSession()
