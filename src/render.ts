import type { Application } from 'pixi.js'
import type { Camera } from './camera'
import type { FxState } from './fx'
import type { Player } from './player'
import type { Level } from './world/level'
import { Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from './config'
import { flashAlpha, shakeOffset } from './fx'
import { drawColliders, hashColliders } from './render/world'
import { computeRuptureShape } from './rupture'

// The scene graph.
//   worldContainer  → camera-panned; colliders, player, aura, particles, preview
//   uiContainer     → screen-fixed; meter, hints, flash overlay
//
// Collider Graphics rebuilds only when the collider list mutates (destruction).
// We detect change via hashColliders; see src/render/world.ts.
export interface RenderContext {
  readonly app: Application
  readonly worldContainer: Container
  readonly uiContainer: Container
  readonly worldGfx: Graphics
  readonly auraGfx: Graphics
  readonly playerGfx: Graphics
  readonly eyeGfx: Graphics
  readonly previewGfx: Graphics // upcoming-rupture silhouette (foresight)
  readonly containArrowGfx: Graphics
  readonly ruptureRingGfx: Graphics // lingering ring during post-fracture iframes
  readonly particlesGfx: Graphics
  readonly flashGfx: Graphics
  readonly meterBg: Graphics
  readonly meterFg: Graphics
  readonly hint: Text
  readonly containHint: Text
  readonly matLegend: Text
  worldCacheKey: number
  time: number
}

export function buildScene(app: Application, level: Level): RenderContext {
  const worldContainer = new Container()
  const uiContainer = new Container()
  app.stage.addChild(worldContainer)
  app.stage.addChild(uiContainer)

  const worldGfx = new Graphics()
  drawColliders(worldGfx, level)
  worldContainer.addChild(worldGfx)

  // Aura under the player — added first so it draws behind the player AABB.
  const auraGfx = new Graphics()
  worldContainer.addChild(auraGfx)

  const particlesGfx = new Graphics()
  worldContainer.addChild(particlesGfx)

  const previewGfx = new Graphics()
  worldContainer.addChild(previewGfx)

  const ruptureRingGfx = new Graphics()
  worldContainer.addChild(ruptureRingGfx)

  const playerGfx = new Graphics()
  playerGfx.rect(0, 0, CONFIG.PLAYER_W, CONFIG.PLAYER_H).fill(CONFIG.COLOR_PLAYER)
  const eyeGfx = new Graphics()
  eyeGfx.rect(0, 0, 2, 2).fill(CONFIG.COLOR_PLAYER_EYE)
  playerGfx.addChild(eyeGfx)
  worldContainer.addChild(playerGfx)

  const containArrowGfx = new Graphics()
  worldContainer.addChild(containArrowGfx)

  const meterBg = new Graphics()
  meterBg
    .rect(CONFIG.METER_X - 1, CONFIG.METER_Y - 1, CONFIG.METER_W + 2, CONFIG.METER_H + 2)
    .fill(0x000000)
    .rect(CONFIG.METER_X, CONFIG.METER_Y, CONFIG.METER_W, CONFIG.METER_H)
    .fill(0x2A2F3C)
  for (let i = 1; i < 4; i++) {
    const x = CONFIG.METER_X + Math.round((CONFIG.METER_W * i) / 4)
    meterBg.rect(x, CONFIG.METER_Y, 1, CONFIG.METER_H).fill(0x1A1A2E)
  }
  uiContainer.addChild(meterBg)

  const meterFg = new Graphics()
  uiContainer.addChild(meterFg)

  const hint = new Text({
    text: 'Arrows/WASD move  •  Space/Z jump  •  V or Shift contain  •  R respawn',
    style: { fontFamily: 'monospace', fontSize: 10, fill: 0xCBD0DC },
  })
  hint.x = 6
  hint.y = CONFIG.METER_Y + CONFIG.METER_H + 6
  uiContainer.addChild(hint)

  const containHint = new Text({
    text: 'CONTAIN',
    style: { fontFamily: 'monospace', fontSize: 9, fill: 0x6FD1FF },
  })
  containHint.x = CONFIG.METER_X + CONFIG.METER_W + 6
  containHint.y = CONFIG.METER_Y + 1
  uiContainer.addChild(containHint)

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
    worldGfx,
    auraGfx,
    playerGfx,
    eyeGfx,
    previewGfx,
    containArrowGfx,
    ruptureRingGfx,
    particlesGfx,
    flashGfx,
    meterBg,
    meterFg,
    hint,
    containHint,
    matLegend,
    worldCacheKey: hashColliders(level),
    time: 0,
  }
}

// Piecewise aura color by instability ratio (0..1). Above HOT we return
// RED and modulate alpha via a time-based pulse elsewhere.
function auraColorFor(ratio: number): number {
  if (ratio <= CONFIG.AURA_THRESH_COOL)
    return CONFIG.AURA_COLOR_COOL
  if (ratio <= CONFIG.AURA_THRESH_WARM)
    return CONFIG.AURA_COLOR_WARM
  if (ratio <= CONFIG.AURA_THRESH_HOT)
    return CONFIG.AURA_COLOR_HOT
  return CONFIG.AURA_COLOR_RED
}

// Rupture shape drawn at origin; caller positions + rotates the node.
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

  // Rebuild world Graphics only when a collider list actually changed.
  const key = hashColliders(level)
  if (key !== ctx.worldCacheKey) {
    drawColliders(ctx.worldGfx, level)
    ctx.worldCacheKey = key
  }

  // Apply camera + shake in one go.
  const off = shakeOffset(fx)
  ctx.worldContainer.x = -Math.round(camera.x) + Math.round(off.x)
  ctx.worldContainer.y = -Math.round(camera.y) + Math.round(off.y)

  ctx.playerGfx.x = Math.round(player.x)
  ctx.playerGfx.y = Math.round(player.y)
  // Flicker during iframes — classic post-fracture telegraph.
  const iframeBlink
    = player.iframeTimer > 0 ? (Math.floor(ctx.time * 30) % 2 === 0 ? 0.4 : 1.0) : 1.0
  ctx.playerGfx.alpha = iframeBlink
  ctx.eyeGfx.x = player.facing >= 0 ? CONFIG.PLAYER_W - 4 : 2
  ctx.eyeGfx.y = 4

  // ─── aura ───────────────────────────────────────────────
  const ratio = player.instability.value / CONFIG.INSTABILITY_MAX
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

  // ─── rupture preview ────────────────────────────────────
  ctx.previewGfx.clear()
  if (
    player.alive
    && player.instability.value >= CONFIG.GHOST_INSTABILITY_THRESHOLD
    && player.iframeTimer <= 0
  ) {
    const shape = computeRuptureShape(player.vx, player.vy)
    ctx.previewGfx.x = Math.round(player.x + CONFIG.PLAYER_W / 2)
    ctx.previewGfx.y = Math.round(player.y + CONFIG.PLAYER_H / 2)
    ctx.previewGfx.rotation = shape.angle
    drawEllipseOutline(ctx.previewGfx, shape.rx, shape.ry, 0xFFFFFF, 0.55, 0.08)
  }

  // ─── post-fracture ring (lingers during iframes) ────────
  ctx.ruptureRingGfx.clear()
  if (player.lastRupture && player.iframeTimer > 0) {
    const r = player.lastRupture
    const t = player.iframeTimer / CONFIG.FRACTURE_IFRAMES
    const scale = 1 + (1 - t) * 0.6 // expand out as it fades
    ctx.ruptureRingGfx.x = Math.round(r.center.x)
    ctx.ruptureRingGfx.y = Math.round(r.center.y)
    ctx.ruptureRingGfx.rotation = r.shape.angle
    const ringColor = r.reflection.active ? CONFIG.AURA_COLOR_HOT : CONFIG.AURA_COLOR_RED
    drawEllipseOutline(
      ctx.ruptureRingGfx,
      r.shape.rx * scale,
      r.shape.ry * scale,
      ringColor,
      t,
      0.0,
    )
  }

  // ─── containment arrow ──────────────────────────────────
  ctx.containArrowGfx.clear()
  if (player.instability.containing) {
    const bob = Math.sin(ctx.time * 18) * 1.5
    const bx = Math.round(player.x + CONFIG.PLAYER_W / 2)
    const by = Math.round(player.y + CONFIG.PLAYER_H + 4 + bob)
    ctx.containArrowGfx
      .poly([bx - 4, by, bx + 4, by, bx, by + 5])
      .fill({ color: 0x6FD1FF, alpha: 0.85 })
    ctx.containArrowGfx
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

  // ─── UI: instability meter ──────────────────────────────
  ctx.meterFg.clear()
  const fillW = Math.round(CONFIG.METER_W * ratio)
  if (fillW > 0) {
    let metColor = auraColorFor(ratio)
    if (ratio > CONFIG.AURA_THRESH_HOT) {
      const pulse = 0.5 + 0.5 * Math.sin(ctx.time * 12 * Math.PI * 2)
      metColor = pulse > 0.5 ? CONFIG.AURA_COLOR_RED : CONFIG.AURA_COLOR_HOT
    }
    ctx.meterFg.rect(CONFIG.METER_X, CONFIG.METER_Y, fillW, CONFIG.METER_H).fill(metColor)
  }

  // Containment-hint color: highlighted while containing, dim while stunned.
  if (player.instability.containing)
    ctx.containHint.style.fill = 0xFFFFFF
  else if (player.instability.containmentStunTimer > 0)
    ctx.containHint.style.fill = 0x4A4F58
  else ctx.containHint.style.fill = 0x6FD1FF

  // ─── flash overlay ──────────────────────────────────────
  ctx.flashGfx.clear()
  const fa = flashAlpha(fx)
  if (fa > 0) {
    ctx.flashGfx
      .rect(0, 0, CONFIG.LOGICAL_WIDTH, CONFIG.LOGICAL_HEIGHT)
      .fill({ color: 0xFFFFFF, alpha: fa * 0.7 })
  }
}
