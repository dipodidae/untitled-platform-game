// Keyboard input with per-tick press/release edges.
//
// The module diffs `keys` against `prevKeys` each tick; `justPressed` /
// `justReleased` are therefore true for exactly one physics step, which is
// what the jump-buffer and jump-cut logic in player.ts depend on.
//
// Call `initInput()` once at boot to attach listeners, and call `endFrame()`
// at the end of every fixed-step update to latch the current state into
// prevKeys.

const keys: Record<string, boolean> = Object.create(null) as Record<string, boolean>
const prevKeys: Record<string, boolean> = Object.create(null) as Record<string, boolean>

// Keys we own — we preventDefault on these so the browser doesn't scroll the page
// when the player presses Space / arrows.
const GAME_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyZ',
  'KeyV',
  'KeyR',
  'ShiftLeft',
  'ShiftRight',
  'Space',
])

let initialized = false

export function initInput(): void {
  if (initialized)
    return
  initialized = true

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code))
      e.preventDefault()
    keys[e.code] = true
  })
  window.addEventListener('keyup', (e) => {
    if (GAME_KEYS.has(e.code))
      e.preventDefault()
    keys[e.code] = false
  })
  // If the window loses focus we miss the keyup and keys "stick". Clear on blur.
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false
  })
}

export function isDown(...codes: readonly string[]): boolean {
  for (const c of codes) {
    if (keys[c])
      return true
  }
  return false
}

export function justPressed(...codes: readonly string[]): boolean {
  for (const c of codes) {
    if (keys[c] && !prevKeys[c])
      return true
  }
  return false
}

export function justReleased(...codes: readonly string[]): boolean {
  for (const c of codes) {
    if (!keys[c] && prevKeys[c])
      return true
  }
  return false
}

// Snapshot current key state into prevKeys. Run this once per fixed-step update,
// after everything that needs to read press/release edges has done so.
export function endFrame(): void {
  for (const k in keys) prevKeys[k] = keys[k] === true
}

// Gameplay-level aliases so callers don't hard-code key codes.
export const leftDown = (): boolean => isDown('ArrowLeft', 'KeyA')
export const rightDown = (): boolean => isDown('ArrowRight', 'KeyD')
export const downDown = (): boolean => isDown('ArrowDown', 'KeyS')
export const jumpPressed = (): boolean => justPressed('Space', 'KeyZ', 'ArrowUp', 'KeyW')
export const jumpReleased = (): boolean => justReleased('Space', 'KeyZ', 'ArrowUp', 'KeyW')
export const containHeld = (): boolean => isDown('KeyV', 'ShiftLeft', 'ShiftRight')
export const respawnPressed = (): boolean => justPressed('KeyR')
