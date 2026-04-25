// Tiny typed event bus. Cross-system signals (player death, level complete,
// checkpoint reached, etc.) flow through this bus instead of direct coupling
// so LevelManager, results UI, and game.ts don't need to know about each
// other.
//
// Strongly typed — if you add a new event, add it to `EngineEvents` below.

export interface EngineEvents {
  playerDied: { x: number, y: number, cause: 'hazard' | 'fallout' }
  levelComplete: { levelId: string, deaths: number, timeMs: number }
  checkpointReached: { x: number, y: number }
  levelLoaded: { levelId: string }
  retryPressed: null
  menuShown: null
  menuPlayPressed: null
  dropInComplete: null
  // Visual-feedback hook: emitted every time damage lands, so damage-number
  // popups / screen-shake / vignette tints can react without each source
  // having to know about each other. Damage is positive; `target` lets
  // consumers tint differently for hits TO the player vs hits FROM the player.
  hitLanded: { x: number, y: number, damage: number, target: 'player' | 'enemy' }
  enemyKilled: { x: number, y: number }
  pickupClaimed: { x: number, y: number, kind: 'health' | 'armor' | 'weapon' | 'coin' }
}

type Handler<E> = (payload: E) => void

type Listeners = {
  [K in keyof EngineEvents]?: Set<Handler<EngineEvents[K]>>
}

const listeners: Listeners = {}

export function on<K extends keyof EngineEvents>(
  event: K,
  handler: Handler<EngineEvents[K]>,
): () => void {
  let set = listeners[event] as Set<Handler<EngineEvents[K]>> | undefined
  if (!set) {
    set = new Set<Handler<EngineEvents[K]>>()
    listeners[event] = set as Listeners[K]
  }
  set.add(handler)
  return () => { set?.delete(handler) }
}

export function off<K extends keyof EngineEvents>(
  event: K,
  handler: Handler<EngineEvents[K]>,
): void {
  listeners[event]?.delete(handler)
}

export function emit<K extends keyof EngineEvents>(
  event: K,
  payload: EngineEvents[K],
): void {
  const set = listeners[event] as Set<Handler<EngineEvents[K]>> | undefined
  if (!set) return
  for (const h of set) h(payload)
}
