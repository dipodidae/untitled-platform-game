// Procedural player renderer for FAULTLINE.
// Draws a warm, semi-coherent pixel mass — no sprites, no outlines.
// Everything is PixiJS v8 Graphics calls each frame.

import type { Graphics } from 'pixi.js'

// ─── public interface ────────────────────────────────────────────────
export interface PlayerRenderState {
  vx: number
  vy: number
  grounded: boolean
  wasGrounded: boolean // caller tracks: was grounded last frame
  facing: 1 | -1
  alive: boolean
  iframeTimer: number
  ruptureFrame: number // -1 = no rupture; 0,1,2,3… = frames since rupture fired
  respawnFrame: number // -1 = not respawning; 0,1,2,3… = frames since respawn
  djGlowTimer: number // seconds remaining of glitch-glow (0 = inactive)
  djFiredThisTick: boolean // true on the tick DJ activates
  groundMaterial: string | null // for resonant flicker
}

// ─── colors ──────────────────────────────────────────────────────────
const COL_OUTER = 0x7A2A08
const COL_MID = 0xC85A20
const COL_CORE = 0xE87030
const COL_BLOB_A = 0xF0A050
const COL_BLOB_B = 0xFF7030
const COL_DJ_GLOW = 0x7050C8 // cool violet
const COL_DJ_CORE = 0xA080E0 // brighter inner
const COL_DJ_GHOST = 0x503890 // afterimage tint

// ─── base shape (10×14, center = 0,0) ────────────────────────────────
// Slightly taller than wide. Left bulges ~1px. Bottom flat, top rounded.
interface V { x: number, y: number }

const BASE_VERTICES: V[] = [
  { x: -6, y: 7 }, // bottom-left (flat bottom)
  { x: 5, y: 7 }, // bottom-right
  { x: 5, y: 4 }, // right lower
  { x: 5, y: 0 }, // right mid
  { x: 4, y: -4 }, // right upper
  { x: 2, y: -6 }, // top-right
  { x: -1, y: -7 }, // top center (slight left lean)
  { x: -4, y: -6 }, // top-left
  { x: -6, y: -3 }, // left upper (bulges 1px more than right)
  { x: -6, y: 2 }, // left mid
]

// Pre-compute vertex normals (outward-facing) for inset operations
function computeNormals(verts: V[]): V[] {
  const n = verts.length
  const normals: V[] = []
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n]!
    const cur = verts[i]!
    const next = verts[(i + 1) % n]!
    // Average of the two adjacent edge normals
    const dx1 = cur.x - prev.x
    const dy1 = cur.y - prev.y
    const dx2 = next.x - cur.x
    const dy2 = next.y - cur.y
    // Edge normals (outward for CCW winding — our verts go CW visually,
    // so inward is actually outward in screen coords; we negate later)
    let nx = -(dy1 + dy2)
    let ny = dx1 + dx2
    const len = Math.sqrt(nx * nx + ny * ny) || 1
    nx /= len
    ny /= len
    normals.push({ x: nx, y: ny })
  }
  return normals
}

const BASE_NORMALS = computeNormals(BASE_VERTICES)

function insetVerts(verts: V[], normals: V[], amount: number): V[] {
  return verts.map((v, i) => ({
    x: v.x + normals[i]!.x * amount,
    y: v.y + normals[i]!.y * amount,
  }))
}

// ─── module state ──────────────────────────────────────────
// Landing squash
let _squashFrames = 0
let _squashFactor = 1.0

// Direction lag
let _lagFrames = 0
let _lagDir = 0
let _prevFacing: 1 | -1 = 1

// Double jump afterimages
interface DJAfterimage {
  x: number // offset from current player pos at spawn time
  y: number
  life: number // 0..1, decays
  maxLife: number
  verts: V[] // snapshot of vertices at spawn
}
let _djAfterimages: DJAfterimage[] = []
let _djGlowPhase = 0 // continuous phase for glow pulsing

// Respawn birth jitter fade
let _birthJitter = 0 // starts at 0.15, fades over 60 frames

// Frame counter for alternating effects
let _frameCount = 0

// ─── main draw ───────────────────────────────────────────────────────
export function drawPlayer(
  g: Graphics,
  state: PlayerRenderState,
  _instability: number,
  time: number,
): void {
  g.clear()
  _frameCount++

  // ─── rupture sequence ──────────────────────────────────────
  if (state.ruptureFrame >= 0) {
    if (state.ruptureFrame === 0) {
      // Frame 0: render body normally (fall through)
    }
    else if (state.ruptureFrame === 1) {
      // Implosion frame: hollow inward-collapsed stroke only
      const collapsed = insetVerts(BASE_VERTICES, BASE_NORMALS, 3)
      pathPoly(g, collapsed)
      g.stroke({ width: 1, color: COL_CORE, alpha: 1.0 })
      return
    }
    else {
      // Frame 2+: nothing
      return
    }
  }

  // ─── respawn expand ────────────────────────────────────────
  if (state.respawnFrame >= 0 && state.respawnFrame <= 4) {
    if (state.respawnFrame === 0) {
      // Single pixel
      g.rect(-0.5, -0.5, 1, 1).fill({ color: COL_CORE })
      return
    }
    // Expand from point to full over frames 1–4
    const t = state.respawnFrame / 4
    const scaled = BASE_VERTICES.map(v => ({ x: v.x * t, y: v.y * t }))
    pathPoly(g, scaled)
    g.fill({ color: COL_MID })
    return
  }

  // Birth jitter after respawn (15% fading over 60 frames)
  if (state.respawnFrame >= 5 && state.respawnFrame < 65) {
    _birthJitter = 0.15 * (1 - (state.respawnFrame - 5) / 60)
  }
  else if (state.respawnFrame >= 65) {
    _birthJitter = 0
  }

  if (!state.alive)
    return

  // ─── movement deformation ──────────────────────────────────
  let scaleX = 1.0
  let scaleY = 1.0

  // Jump stretch
  if (state.vy < -1.5) {
    const absVy = Math.abs(state.vy) / 60 // normalize: vy is px/s, visuals want px/frame scale
    scaleY = 1.0 + Math.min(absVy * 0.04, 0.25)
    scaleX = 1.0 - Math.min(absVy * 0.02, 0.12)
  }

  // Landing squash
  if (!state.wasGrounded && state.grounded && state.vy >= 0) {
    _squashFrames = 6
    _squashFactor = 0.65
  }
  if (_squashFrames > 0) {
    _squashFrames--
    _squashFactor += (1.0 - _squashFactor) * 0.3 // lerp toward 1
    scaleY *= _squashFactor
    scaleX *= 1.0 + (1.0 - _squashFactor) * 0.6
  }

  // ─── direction lag ─────────────────────────────────────────
  let lagOffsetX = 0
  if (state.facing !== _prevFacing) {
    _lagFrames = 2
    _lagDir = _prevFacing // old direction
    _prevFacing = state.facing
  }
  if (_lagFrames > 0) {
    lagOffsetX = _lagDir * 1 // 1px in old direction
    _lagFrames--
  }

  // ─── build transformed vertices ────────────────────────
  const verts = BASE_VERTICES.map((v) => {
    let bx = v.x
    let by = v.y

    // Movement deformation
    bx *= scaleX
    by *= scaleY

    // Birth jitter
    const birth = _birthJitter > 0 && Math.random() < _birthJitter ? (Math.floor(Math.random() * 3) - 1) : 0
    bx += birth
    by += birth

    return { x: bx + lagOffsetX, y: by }
  })

  // ─── iframes blink (handled externally, but respect alive) ─
  // The caller sets alpha on the container; we just draw.

  // ─── DJ afterimages (drawn BEHIND body) ──────────────────────
  _djAfterimages = _djAfterimages.filter((ai) => {
    ai.life -= 1 / 60
    if (ai.life <= 0)
      return false
    // Non-linear decay: fast initial fade, lingering tail
    const t = ai.life / ai.maxLife
    const alpha = t * t * 0.35
    const ghostVerts = ai.verts.map(v => ({
      x: v.x + ai.x,
      y: v.y + ai.y,
    }))
    pathPoly(g, ghostVerts)
    g.fill({ color: COL_DJ_GHOST, alpha })
    return true
  })

  // Spawn afterimages on DJ activation
  if (state.djFiredThisTick) {
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.04 // stagger spawn offsets
      _djAfterimages.push({
        x: -state.vx * delay * (1 / 60),
        y: -state.vy * delay * (1 / 60),
        life: 0.4 - i * 0.08,
        maxLife: 0.4 - i * 0.08,
        verts: verts.map(v => ({ x: v.x, y: v.y })),
      })
    }
  }

  // ─── DJ glitch-glow aura (drawn BEHIND body) ─────────────────
  if (state.djGlowTimer > 0) {
    _djGlowPhase += 1 / 60
    const glowT = state.djGlowTimer / 1.0 // normalized 0..1 (1 = just fired)
    const glowTSq = glowT * glowT // non-linear: bright at start, fast decay

    // Outer unstable ring — offset slightly for "out of phase" feel
    const offsetX = Math.sin(_djGlowPhase * 17.3) * glowT * 1.5
    const offsetY = Math.cos(_djGlowPhase * 13.7) * glowT * 1.2
    const outerR = 10 + glowT * 6
    // Resonant flicker: near resonant surfaces, glow jitters more
    const resonantMult = state.groundMaterial === 'resonant' ? 1.4 : 1.0
    // Pulsing outer glow — irregular shape via multiple offset circles
    const glowAlpha = glowTSq * 0.25 * resonantMult
    g.circle(offsetX, offsetY, outerR)
      .fill({ color: COL_DJ_GLOW, alpha: glowAlpha })
    g.circle(-offsetX * 0.7, -offsetY * 0.5, outerR * 0.8)
      .fill({ color: COL_DJ_GLOW, alpha: glowAlpha * 0.6 })
    // Inner core flash — brighter, tighter
    const coreR = 5 + glowT * 3
    g.circle(offsetX * 0.3, offsetY * 0.3, coreR)
      .fill({ color: COL_DJ_CORE, alpha: glowTSq * 0.4 })
    // Fragmenting edges at low glow (dissipating)
    if (glowT < 0.4) {
      const fragAlpha = (0.4 - glowT) * 0.5
      for (let i = 0; i < 4; i++) {
        const angle = _djGlowPhase * 5 + i * Math.PI / 2
        const dist = outerR * (1.1 + Math.sin(_djGlowPhase * 11 + i) * 0.3)
        const fx = Math.cos(angle) * dist
        const fy = Math.sin(angle) * dist
        g.circle(fx, fy, 1.5).fill({ color: COL_DJ_GLOW, alpha: fragAlpha })
      }
    }
  }

  // ─── normal body draw ──────────────────────────────
  drawBody(g, verts, time)
}

// ─── body layers ─────────────────────────────────────────────────────
function drawBody(
  g: Graphics,
  verts: V[],
  time: number,
): void {
  if (verts.length < 3)
    return

  const normals = computeNormals(verts)

  // Layer 1: outer body (edge darkening)
  pathPoly(g, verts)
  g.fill({ color: COL_OUTER })

  // Layer 2: mid body (inset 2px)
  const midVerts = insetVerts(verts, normals, 2)
  if (midVerts.length >= 3) {
    pathPoly(g, midVerts)
    g.fill({ color: COL_MID })
  }

  // Layer 3: core glow (inset 5px)
  const coreVerts = insetVerts(verts, normals, 5)
  if (coreVerts.length >= 3) {
    pathPoly(g, coreVerts)
    g.fill({ color: COL_CORE, alpha: 0.8 })
  }

  drawHeatBlobs(g, time)
}

// ─── heat blobs ──────────────────────────────────────────────────────
function drawHeatBlobs(g: Graphics, time: number): void {
  const t = time
  let axPos = {
    x: Math.sin(t * 0.8) * 2,
    y: Math.cos(t * 1.1) * 1.5,
  }
  let bxPos = {
    x: Math.cos(t * 1.3 + 1.0) * 1.5,
    y: Math.sin(t * 0.9 + 2.0) * 2,
  }

  // Clamp inside ~3px radius of center
  const clampR = 3
  const clamp = (p: V): V => {
    const d = Math.sqrt(p.x * p.x + p.y * p.y)
    if (d > clampR)
      return { x: p.x * clampR / d, y: p.y * clampR / d }
    return p
  }
  axPos = clamp(axPos)
  bxPos = clamp(bxPos)

  // Blob A: 3×4, #f0a050, 0.35
  g.ellipse(axPos.x, axPos.y, 1.5, 2).fill({ color: COL_BLOB_A, alpha: 0.35 })
  // Blob B: 2×3, #ff7030, 0.25
  g.ellipse(bxPos.x, bxPos.y, 1, 1.5).fill({ color: COL_BLOB_B, alpha: 0.25 })
}

// ─── helpers ─────────────────────────────────────────────────────────
function pathPoly(g: Graphics, verts: V[]): void {
  if (verts.length < 3)
    return
  const flat: number[] = []
  for (const v of verts) {
    flat.push(v.x, v.y)
  }
  g.poly(flat)
}

// Reset module state (call on respawn)
export function resetPlayerRenderer(): void {
  _squashFrames = 0
  _squashFactor = 1.0
  _lagFrames = 0
  _lagDir = 0
  _birthJitter = 0
  _frameCount = 0
  _djAfterimages = []
  _djGlowPhase = 0
}
