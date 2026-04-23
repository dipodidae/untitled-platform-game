import type { Application } from 'pixi.js'
import type { Camera } from './camera'
import type { FxState } from './fx'
import type { Level } from './level'
import type { Player } from './player'
import { Container, Graphics, Text } from 'pixi.js'
import { computeBlastShape } from './blast'
import { CONFIG } from './config'
import { flashAlpha, shakeOffset } from './fx'
import {
  MAT_DIRT,
  MAT_EMPTY,
  MAT_HAZARD,
  MAT_STEEL,
  MAT_STONE,
} from './materials'
import { tileAt } from './physics'

// The scene graph.
//   worldContainer  → camera-panned; tiles, player, aura, particles, ghost
//   uiContainer     → screen-fixed; meter, hints, flash overlay
//
// Re-draws of the tile layer happen when the tilemap is "dirty" (destruction),
// not every frame. We detect dirt by checksumming the tile+damage grids and
// only rebuild when the checksum changes — cheap and keeps the hot path tight.
export interface RenderContext {
  readonly app: Application
  readonly worldContainer: Container
  readonly uiContainer: Container
  readonly tilesGfx: Graphics
  readonly auraGfx: Graphics
  readonly playerGfx: Graphics
  readonly eyeGfx: Graphics
  readonly ghostGfx: Graphics
  readonly ventArrowGfx: Graphics
  readonly blastRingGfx: Graphics
  readonly particlesGfx: Graphics
  readonly flashGfx: Graphics
  readonly meterBg: Graphics
  readonly meterFg: Graphics
  readonly hint: Text
  readonly ventHint: Text
  readonly matLegend: Text
  tileCacheKey: number // last tile-grid hash we drew
  time: number // accumulated render time for pulse / procedural effects
}

export function buildScene(app: Application, level: Level): RenderContext {
  const worldContainer = new Container()
  const uiContainer = new Container()
  app.stage.addChild(worldContainer)
  app.stage.addChild(uiContainer)

  const tilesGfx = new Graphics()
  drawTiles(tilesGfx, level)
  worldContainer.addChild(tilesGfx)

  // Aura under the player — added first so it draws behind the player AABB.
  const auraGfx = new Graphics()
  worldContainer.addChild(auraGfx)

  const particlesGfx = new Graphics()
  worldContainer.addChild(particlesGfx)

  const ghostGfx = new Graphics()
  worldContainer.addChild(ghostGfx)

  const blastRingGfx = new Graphics()
  worldContainer.addChild(blastRingGfx)

  const playerGfx = new Graphics()
  playerGfx.rect(0, 0, CONFIG.PLAYER_W, CONFIG.PLAYER_H).fill(CONFIG.COLOR_PLAYER)
  const eyeGfx = new Graphics()
  eyeGfx.rect(0, 0, 2, 2).fill(CONFIG.COLOR_PLAYER_EYE)
  playerGfx.addChild(eyeGfx)
  worldContainer.addChild(playerGfx)

  const ventArrowGfx = new Graphics()
  worldContainer.addChild(ventArrowGfx)

  const meterBg = new Graphics()
  meterBg
    .rect(CONFIG.METER_X - 1, CONFIG.METER_Y - 1, CONFIG.METER_W + 2, CONFIG.METER_H + 2)
    .fill(0x000000)
    .rect(CONFIG.METER_X, CONFIG.METER_Y, CONFIG.METER_W, CONFIG.METER_H)
    .fill(0x2A2F3C)
  // Quarter-segment dividers — hand-placed so the meter reads as 4 chunks.
  for (let i = 1; i < 4; i++) {
    const x = CONFIG.METER_X + Math.round((CONFIG.METER_W * i) / 4)
    meterBg.rect(x, CONFIG.METER_Y, 1, CONFIG.METER_H).fill(0x1A1A2E)
  }
  uiContainer.addChild(meterBg)

  const meterFg = new Graphics()
  uiContainer.addChild(meterFg)

  const hint = new Text({
    text: 'Arrows/WASD move  •  Space/Z jump  •  V or Shift vent  •  R respawn',
    style: { fontFamily: 'monospace', fontSize: 10, fill: 0xCBD0DC },
  })
  hint.x = 6
  hint.y = CONFIG.METER_Y + CONFIG.METER_H + 6
  uiContainer.addChild(hint)

  const ventHint = new Text({
    text: 'VENT',
    style: { fontFamily: 'monospace', fontSize: 9, fill: 0x6FD1FF },
  })
  ventHint.x = CONFIG.METER_X + CONFIG.METER_W + 6
  ventHint.y = CONFIG.METER_Y + 1
  uiContainer.addChild(ventHint)

  const matLegend = new Text({
    text: 'dirt · stone(2hit) · steel→ricochet · hazard!',
    style: { fontFamily: 'monospace', fontSize: 9, fill: 0x8A90A0 },
  })
  matLegend.x = 6
  matLegend.y = hint.y + 14
  uiContainer.addChild(matLegend)

  const flashGfx = new Graphics()
  uiContainer.addChild(flashGfx)

  return {
    app,
    worldContainer,
    uiContainer,
    tilesGfx,
    auraGfx,
    playerGfx,
    eyeGfx,
    ghostGfx,
    ventArrowGfx,
    blastRingGfx,
    particlesGfx,
    flashGfx,
    meterBg,
    meterFg,
    hint,
    ventHint,
    matLegend,
    tileCacheKey: hashTiles(level),
    time: 0,
  }
}

// Cheap mixing-hash of (material, damage) so we can detect destruction.
function hashTiles(level: Level): number {
  let h = 0x811C9DC5 // FNV-ish
  for (let y = 0; y < level.height; y++) {
    const tr = level.tiles[y]
    const dr = level.damage[y]
    if (!tr || !dr)
      continue
    for (let x = 0; x < level.width; x++) {
      const v = ((tr[x] ?? 0) << 3) | (dr[x] ?? 0)
      h ^= v
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return h
}

function drawTiles(g: Graphics, level: Level): void {
  g.clear()
  const TS = CONFIG.TILE_SIZE
  for (let ty = 0; ty < level.height; ty++) {
    for (let tx = 0; tx < level.width; tx++) {
      const mat = tileAt(level, tx, ty)
      if (mat === MAT_EMPTY)
        continue
      const x = tx * TS
      const y = ty * TS
      const aboveIsEmpty = tileAt(level, tx, ty - 1) === MAT_EMPTY

      if (mat === MAT_DIRT) {
        g.rect(x, y, TS, TS).fill(CONFIG.COLOR_DIRT)
        if (aboveIsEmpty)
          g.rect(x, y, TS, 2).fill(CONFIG.COLOR_DIRT_TOP)
      }
      else if (mat === MAT_STONE) {
        const dmg = level.damage[ty]?.[tx] ?? 0
        const body = dmg > 0 ? CONFIG.COLOR_STONE_CRACKED : CONFIG.COLOR_STONE
        g.rect(x, y, TS, TS).fill(body)
        if (aboveIsEmpty)
          g.rect(x, y, TS, 2).fill(CONFIG.COLOR_STONE_TOP)
        if (dmg > 0) {
          // Hand-drawn cracks so damaged stone reads distinctly at a glance.
          g.rect(x + 3, y + 3, 2, 6).fill(CONFIG.COLOR_STONE_CRACK)
          g.rect(x + 3, y + 9, 8, 2).fill(CONFIG.COLOR_STONE_CRACK)
          g.rect(x + 9, y + 5, 2, 4).fill(CONFIG.COLOR_STONE_CRACK)
        }
      }
      else if (mat === MAT_STEEL) {
        g.rect(x, y, TS, TS).fill(CONFIG.COLOR_STEEL)
        if (aboveIsEmpty)
          g.rect(x, y, TS, 2).fill(CONFIG.COLOR_STEEL_TOP)
        // Rivet dots — telegraph "this one reflects" with a distinct texture.
        g.rect(x + 3, y + 3, 2, 2).fill(CONFIG.COLOR_STEEL_TOP)
        g.rect(x + TS - 5, y + 3, 2, 2).fill(CONFIG.COLOR_STEEL_TOP)
        g.rect(x + 3, y + TS - 5, 2, 2).fill(CONFIG.COLOR_STEEL_TOP)
        g.rect(x + TS - 5, y + TS - 5, 2, 2).fill(CONFIG.COLOR_STEEL_TOP)
      }
      else if (mat === MAT_HAZARD) {
        // Spike glyph — triangles along the top edge. Kept abstract (we're
        // using Graphics), but reads as "don't touch".
        g.rect(x, y + TS - 4, TS, 4).fill(CONFIG.COLOR_HAZARD)
        for (let i = 0; i < 3; i++) {
          const sx = x + 1 + i * 5
          g.poly([sx, y + TS - 4, sx + 2, y + 2, sx + 4, y + TS - 4]).fill(
            CONFIG.COLOR_HAZARD_SPIKE,
          )
        }
      }
    }
  }
}

// Piecewise aura color by pressure ratio (0..1). Above HOT we return RED and
// modulate alpha via a time-based pulse elsewhere.
function auraColorFor(ratio: number): number {
  if (ratio <= CONFIG.AURA_THRESH_COOL)
    return CONFIG.AURA_COLOR_COOL
  if (ratio <= CONFIG.AURA_THRESH_WARM)
    return CONFIG.AURA_COLOR_WARM
  if (ratio <= CONFIG.AURA_THRESH_HOT)
    return CONFIG.AURA_COLOR_HOT
  return CONFIG.AURA_COLOR_RED
}

// Blast shape drawn at origin; caller positions + rotates the Graphics node.
function drawEllipseOutline(
  g: Graphics,
  rx: number,
  ry: number,
  color: number,
  alpha: number,
  fillAlpha: number,
): void {
  g.ellipse(0, 0, rx, ry).fill({ color, alpha: fillAlpha }).stroke({
    width: 1,
    color,
    alpha,
  })
}

// Camera & sprite positions only. All state lives in `player` / `camera` /
// `fx`; this function is a pure projection of that state onto Pixi nodes.
export function render(
  ctx: RenderContext,
  player: Player,
  camera: Camera,
  fx: FxState,
  level: Level,
  dt: number,
): void {
  ctx.time += dt

  // Rebuild tile Graphics only when the tilemap actually changed.
  const key = hashTiles(level)
  if (key !== ctx.tileCacheKey) {
    drawTiles(ctx.tilesGfx, level)
    ctx.tileCacheKey = key
  }

  // Apply camera + shake in one go.
  const off = shakeOffset(fx)
  ctx.worldContainer.x = -Math.round(camera.x) + Math.round(off.x)
  ctx.worldContainer.y = -Math.round(camera.y) + Math.round(off.y)

  ctx.playerGfx.x = Math.round(player.x)
  ctx.playerGfx.y = Math.round(player.y)
  // Hide the player during i-frames by flickering — classic dynamite telegraph.
  const iframeBlink
    = player.iframeTimer > 0 ? (Math.floor(ctx.time * 30) % 2 === 0 ? 0.4 : 1.0) : 1.0
  ctx.playerGfx.alpha = iframeBlink
  ctx.eyeGfx.x = player.facing >= 0 ? CONFIG.PLAYER_W - 4 : 2
  ctx.eyeGfx.y = 4

  // ─── aura ───────────────────────────────────────────────
  const ratio = player.pressure.value / CONFIG.PRESSURE_MAX
  const auraR
    = CONFIG.AURA_BASE_RADIUS + ratio * (CONFIG.AURA_MAX_RADIUS - CONFIG.AURA_BASE_RADIUS)
  const color = auraColorFor(ratio)
  let auraAlpha = 0.15 + ratio * 0.35
  if (ratio > CONFIG.AURA_THRESH_HOT) {
    const t
      = (ratio - CONFIG.AURA_THRESH_HOT) / (1 - CONFIG.AURA_THRESH_HOT)
    const hz
      = CONFIG.AURA_PULSE_MIN_HZ
        + t * (CONFIG.AURA_PULSE_MAX_HZ - CONFIG.AURA_PULSE_MIN_HZ)
    const pulse = 0.5 + 0.5 * Math.sin(ctx.time * hz * Math.PI * 2)
    auraAlpha = 0.35 + 0.4 * pulse
  }
  ctx.auraGfx.clear()
  ctx.auraGfx
    .circle(
      Math.round(player.x + CONFIG.PLAYER_W / 2),
      Math.round(player.y + CONFIG.PLAYER_H / 2),
      auraR,
    )
    .fill({ color, alpha: auraAlpha })

  // ─── ghost blast preview ────────────────────────────────
  ctx.ghostGfx.clear()
  if (
    player.alive
    && player.pressure.value >= CONFIG.GHOST_PRESSURE_THRESHOLD
    && player.iframeTimer <= 0
  ) {
    const shape = computeBlastShape(player.vx, player.vy)
    ctx.ghostGfx.x = Math.round(player.x + CONFIG.PLAYER_W / 2)
    ctx.ghostGfx.y = Math.round(player.y + CONFIG.PLAYER_H / 2)
    ctx.ghostGfx.rotation = shape.angle
    drawEllipseOutline(ctx.ghostGfx, shape.rx, shape.ry, 0xFFFFFF, 0.55, 0.08)
  }

  // ─── post-detonation ring (lingers during iframes) ─────
  ctx.blastRingGfx.clear()
  if (player.lastBlast && player.iframeTimer > 0) {
    const b = player.lastBlast
    const t = player.iframeTimer / CONFIG.BLAST_IFRAMES
    const scale = 1 + (1 - t) * 0.6 // expand out as it fades
    ctx.blastRingGfx.x = Math.round(b.center.x)
    ctx.blastRingGfx.y = Math.round(b.center.y)
    ctx.blastRingGfx.rotation = b.shape.angle
    const ringColor = b.reflection.active ? CONFIG.AURA_COLOR_HOT : CONFIG.AURA_COLOR_RED
    drawEllipseOutline(
      ctx.blastRingGfx,
      b.shape.rx * scale,
      b.shape.ry * scale,
      ringColor,
      t,
      0.0,
    )
  }

  // ─── vent arrow ─────────────────────────────────────────
  ctx.ventArrowGfx.clear()
  if (player.pressure.venting) {
    // Downward-arrow pair, small pulse on ctx.time for juice.
    const bob = Math.sin(ctx.time * 18) * 1.5
    const bx = Math.round(player.x + CONFIG.PLAYER_W / 2)
    const by = Math.round(player.y + CONFIG.PLAYER_H + 4 + bob)
    ctx.ventArrowGfx
      .poly([bx - 4, by, bx + 4, by, bx, by + 5])
      .fill({ color: 0x6FD1FF, alpha: 0.85 })
    ctx.ventArrowGfx
      .poly([bx - 3, by + 6, bx + 3, by + 6, bx, by + 10])
      .fill({ color: 0x6FD1FF, alpha: 0.55 })
  }

  // ─── particles ──────────────────────────────────────────
  ctx.particlesGfx.clear()
  for (const p of fx.particles) {
    const a = Math.max(0, p.life / p.maxLife)
    ctx.particlesGfx
      .rect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2)
      .fill({ color: p.color, alpha: a })
  }

  // ─── UI: pressure meter ─────────────────────────────────
  ctx.meterFg.clear()
  const fillW = Math.round(CONFIG.METER_W * ratio)
  if (fillW > 0) {
    let metColor = auraColorFor(ratio)
    if (ratio > CONFIG.AURA_THRESH_HOT) {
      // Match the aura pulse so the bar and the player feel linked.
      const pulse = 0.5 + 0.5 * Math.sin(ctx.time * 12 * Math.PI * 2)
      metColor = pulse > 0.5 ? CONFIG.AURA_COLOR_RED : CONFIG.AURA_COLOR_HOT
    }
    ctx.meterFg.rect(CONFIG.METER_X, CONFIG.METER_Y, fillW, CONFIG.METER_H).fill(metColor)
  }

  // Vent-hint color: highlighted while venting, dim while stunned.
  if (player.pressure.venting)
    ctx.ventHint.style.fill = 0xFFFFFF
  else if (player.pressure.ventStunTimer > 0)
    ctx.ventHint.style.fill = 0x4A4F58
  else ctx.ventHint.style.fill = 0x6FD1FF

  // ─── flash overlay ──────────────────────────────────────
  ctx.flashGfx.clear()
  const fa = flashAlpha(fx)
  if (fa > 0) {
    ctx.flashGfx
      .rect(0, 0, CONFIG.LOGICAL_WIDTH, CONFIG.LOGICAL_HEIGHT)
      .fill({ color: 0xFFFFFF, alpha: fa * 0.7 })
  }
}
