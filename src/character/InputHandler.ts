// ─── Keyboard state map ─────────────────────────────────────────────────────
// Tracks held/justPressed/justReleased per frame. Call update() once per tick.

export class InputHandler {
  private readonly _keys: Map<string, boolean> = new Map()
  private readonly _prev: Map<string, boolean> = new Map()

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault()
      this._keys.set(e.code, true)
    })
    window.addEventListener('keyup', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault()
      this._keys.set(e.code, false)
    })
    window.addEventListener('blur', () => {
      this._keys.clear()
    })
  }

  /** Call at end of each tick to latch previous state */
  endFrame(): void {
    for (const [k, v] of this._keys) {
      this._prev.set(k, v)
    }
  }

  isDown(...codes: string[]): boolean {
    return codes.some(c => this._keys.get(c) === true)
  }

  justPressed(...codes: string[]): boolean {
    return codes.some(c => this._keys.get(c) === true && this._prev.get(c) !== true)
  }

  // Gameplay aliases
  get left(): boolean { return this.isDown('ArrowLeft', 'KeyA') }
  get right(): boolean { return this.isDown('ArrowRight', 'KeyD') }
  get jump(): boolean { return this.justPressed('Space', 'KeyW', 'ArrowUp') }
}

const GAME_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space',
])
