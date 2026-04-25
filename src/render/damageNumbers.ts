// Damage numbers — pop-up floating text spawned on hits. Small feedback
// layer: each number rises + fades over ~650ms with a slight horizontal
// jitter so stacked hits don't collide.
//
// Tick cadence: render, not physics. Hitstop won't freeze the animation.
//
// Pool size is soft — Text objects are pooled and reused; the container
// caps at MAX_ACTIVE and drops the oldest overflow.

import { Container, Text } from 'pixi.js'

export interface DamageNumber {
  text: Text
  x: number
  y: number
  vx: number
  vy: number
  life: number // seconds since spawn
  maxLife: number
}

export interface DamageNumbers {
  readonly root: Container
  active: DamageNumber[]
  free: Text[]
}

const MAX_ACTIVE = 64
const MAX_LIFE = 0.65
const RISE_DISTANCE = 28 // px floated upward over maxLife

export function createDamageNumbers(): DamageNumbers {
  return {
    root: new Container(),
    active: [],
    free: [],
  }
}

function acquireText(dn: DamageNumbers): Text {
  const pooled = dn.free.pop()
  if (pooled)
    return pooled
  const t = new Text({
    text: '',
    style: {
      fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: 13,
      fontWeight: 'bold',
      fill: 0xFFD48C,
      stroke: { color: 0x1A0E08, width: 3, join: 'round' },
      align: 'center',
    },
  })
  t.anchor.set(0.5, 0.5)
  return t
}

// Spawn a damage number at world (x,y). `damage` is the number rendered;
// `kind` biases the color.
export function spawnDamageNumber(
  dn: DamageNumbers,
  x: number,
  y: number,
  damage: number,
  kind: 'player' | 'enemy' = 'enemy',
): void {
  if (dn.active.length >= MAX_ACTIVE) {
    // Soft cap — cull the oldest so new hits always show.
    const oldest = dn.active.shift()
    if (oldest) {
      oldest.text.removeFromParent()
      dn.free.push(oldest.text)
    }
  }
  const t = acquireText(dn)
  t.text = String(Math.abs(damage))
  t.style.fill = kind === 'player' ? 0xFF6040 : 0xFFD48C
  t.x = x
  t.y = y
  t.alpha = 1
  t.scale.set(1)
  dn.root.addChild(t)
  dn.active.push({
    text: t,
    x,
    y,
    vx: (Math.random() - 0.5) * 18, // small horizontal scatter
    vy: -40, // initial upward velocity
    life: 0,
    maxLife: MAX_LIFE,
  })
}

// Advance one render frame. Each number rises (ease-out), fades at the
// end, and gets pooled on death. Called from render.ts's frame tick.
export function tickDamageNumbers(dn: DamageNumbers, dt: number): void {
  let write = 0
  for (let read = 0; read < dn.active.length; read++) {
    const n = dn.active[read]!
    n.life += dt
    if (n.life >= n.maxLife) {
      n.text.removeFromParent()
      dn.free.push(n.text)
      continue
    }
    const t = n.life / n.maxLife
    // ease-out for position (starts fast, slows).
    const ease = 1 - (1 - t) * (1 - t)
    n.text.x = n.x + n.vx * t * 0.5
    n.text.y = n.y - RISE_DISTANCE * ease
    // Fade in the last 35% of life.
    n.text.alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35
    // Punch on spawn — scale up from 0.7 to 1.0 over the first 120ms.
    if (t < 0.18) {
      const s = 0.7 + (t / 0.18) * 0.3
      n.text.scale.set(s)
    }
    else {
      n.text.scale.set(1)
    }
    dn.active[write++] = n
  }
  dn.active.length = write
}

// Clear all active numbers (e.g. on level reset).
export function resetDamageNumbers(dn: DamageNumbers): void {
  for (const n of dn.active) {
    n.text.removeFromParent()
    dn.free.push(n.text)
  }
  dn.active.length = 0
}
