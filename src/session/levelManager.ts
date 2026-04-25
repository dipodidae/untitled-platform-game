// LevelManager — loads levels by id, persists edits to localStorage,
// and exposes next-level advancement.
//
// Bundled JSON imports in game.ts are the seed. Once the player (or editor)
// saves over a level, the stored copy wins. This lets the editor's in-app
// save flow feed the running game without a rebuild.
//
// Persistence key format: `levels:{id}` → serialized LevelJson string.

import type { LevelJson } from '../world/level'
import level1Json from '../levels/level1.json'
import level2Json from '../levels/level2.json'
import { emit } from './eventBus'
import { gameState, resetForLevel } from './gameState'

// Ordered progression. Add ids here (and bundle the JSON import above) to
// extend the progression. The name shown on the results screen comes from
// this map.
const LEVEL_CATALOG: { id: string, name: string, bundled: LevelJson }[] = [
  { id: 'level1', name: 'Hammer Arena', bundled: level1Json as unknown as LevelJson },
  { id: 'level2', name: 'Resonance Hall', bundled: level2Json as LevelJson },
]

const STORAGE_PREFIX = 'levels:'

export function listLevels(): readonly { id: string, name: string }[] {
  return LEVEL_CATALOG.map(l => ({ id: l.id, name: l.name }))
}

export function levelName(id: string): string {
  return LEVEL_CATALOG.find(l => l.id === id)?.name ?? id
}

export function hasNextLevel(id: string): boolean {
  const i = LEVEL_CATALOG.findIndex(l => l.id === id)
  return i >= 0 && i + 1 < LEVEL_CATALOG.length
}

// Read the current authored JSON for `id`. Localstorage wins over bundled.
// Returns null if the id isn't in the catalog (and nothing's stored either).
export function loadLevel(id: string): LevelJson | null {
  const stored = readStored(id)
  if (stored)
    return stored
  const entry = LEVEL_CATALOG.find(l => l.id === id)
  return entry ? entry.bundled : null
}

// Persist the in-memory level under `id`. Used by the editor's Overwrite
// flow for bundled levels — but also available to the running game if we
// ever want auto-save on completion.
export function saveLevel(id: string, data: LevelJson): void {
  localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(data))
}

// Which id comes after `id`? null if this is the last level.
export function nextLevelId(id: string): string | null {
  const i = LEVEL_CATALOG.findIndex(l => l.id === id)
  if (i < 0 || i + 1 >= LEVEL_CATALOG.length)
    return null
  return LEVEL_CATALOG[i + 1]!.id
}

// Reset session for a level. `game.ts#advanceLevel` does the heavy Pixi-side
// work (scene teardown, re-spawns, particle reset). This just bumps the
// session bookkeeping + fires the event. Split so non-game callers (e.g. a
// future level-select menu) can re-use it without rebuilding the scene.
export function markLevelLoaded(id: string): void {
  resetForLevel(gameState, id)
  emit('levelLoaded', { levelId: id })
}

// Return the catalog id at a given zero-based index. Returns null when the
// index is out of range (caller should handle as end-of-catalog).
export function levelIdAt(index: number): string | null {
  return LEVEL_CATALOG[index]?.id ?? null
}

function readStored(id: string): LevelJson | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id)
    if (!raw)
      return null
    return JSON.parse(raw) as LevelJson
  }
  catch {
    return null
  }
}
