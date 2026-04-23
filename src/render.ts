import type { Application } from 'pixi.js'
import type { Camera } from './camera'
import type { FxState } from './fx'
import type { Player } from './player'
import type { Level } from './world/level'
import type { ParallaxState } from './render/parallax'
import type { WindState } from './render/wind'
import { Container, Graphics, Text } from 'pixi.js'
import { CONFIG } from './config'
import { flashAlpha, shakeOffset } from './fx'
import { createParallax, updateParallax } from './render/parallax'
import { PALETTE } from './render/palette'
import { drawSky, drawVignette } from './render/post'
import { createWindState, drawWind, tickWind, type WindState as WindS } from './render/wind'
import { drawColliders, hashColliders } from './render/world'
import { computeRuptureShape } from './rupture'

// Scene graph:
//   bgContainer      (screen-fixed): sky gradient + parallax layers
//   worldContainer   (camera-panned): wind behind, colliders, player + fx
//   uiContainer      (screen-fixed): meter, hints, flash, vignette
export interface RenderContext {
  readonly app: Application
  readonly bgContainer: Container
  readonly worldContainer: Container
  readonly uiContainer: Container
  readonly skyGfx: Graphics
  readonly parallax: ParallaxState
  readonly windGfx: Graphics
  readonly wind: WindState
  readonly worldGfx: Graphics
  readonly auraGfx: Graphics
  readonly playerGfx: Graphics
  readonly eyeGfx: Graphics
  readonly previewGfx: Graphics
  readonly containArrowGfx: Graphics
  readonly ruptureRingGfx: Graphics
  readonly particlesGfx: Graphics
  readonly flashGfx: Graphics
  readonly dreadGfx: Graphics
  readonly vignetteGfx: Graphics
  readonly meterBg: Graphics
  readonly meterFg: Graphics
  readonly hint: Text
  readonly containHint: Text
  worldCacheKey: number
  time: number
}

export function buildScene(app: Application, level: Level): RenderContext {
  const bgContainer = new Container()
  const worldContainer = new Container()
  const uiContainer = new Container()
  app.stage.addChild(bgContainer)
  app.stage.addChild(worldContainer)
  app.stage.addChild(uiContainer)

  const skyGfx = new Graphics()
  drawSky(skyGfx, CONFIG.LOGICAL_WIDTH, CONFIG.LOGICAL_HEIGHT)
  bgContainer.addChild(skyGfx)

  const parallax = createParallax(level.worldWidth, level.worldHeight)
  bgContainer.addChild(parallax.container)

  const windGfx = new Graphics()
  worldContainer.addChild(windGfx) // behind colliders — occluded by ground

  const worldGfx = new Graphics()
  drawColliders(worldGfx, level)
  worldContainer.addChild(worldGfx)

  const auraGfx = new Graphics()
  worldContainer.addChild(auraGfx)

  const particlesGfx = new Graphics()
  worldContainer.addChild(particlesGfx)

  const previewGfx = new Graphics()
  worldContainer.addChild(previewGfx)

  const ruptureRingGfx = new Graphics()
  worldContainer.addChild(ruptureRingGfx)

  const playerGfx = new Graphics()
  playerGfx.rect(0, 0, CONFIG.PLAYER_W, CONFIG.PLAYER_H).fill(PALETTE.player)
  playerGfx
    .moveTo(0, 0).lineTo(CONFIG.PLAYER_W, 0)
    .stroke({ width: 1, color: PALETTE.playerEdge, alpha: 0.9 })
  playerGfx
    .moveTo(0, CONFIG.PLAYER_H - 1).lineTo(CONFIG.PLAYER_W, CONFIG.PLAYER_H - 1)
    .stroke({ width: 1, color: PALETTE.playerShadow, alpha: 0.7 })
  const eyeGfx = new Graphics()
  eyeGfx.rect(0, 0, 2, 2).fill(PALETTE.playerShadow)
  playerGfx.addChild(eyeGfx)
  worldContainer.addChild(playerGfx)

  const containArrowGfx = new Graphics()
  worldContainer.addChild(containArrowGfx)

  // Instability presence. Not a meter chassis — no segments, no clean
  // chrome. Just a thin baseline that the fill grows out of. The value
  // lives in the fill's behavior (jitter, ember flakes) more than its
  // length.
  const meterBg = new Graphics()
  meterBg.rect(CONFIG.METER_X, CONFIG.METER_Y + CONFIG.METER_H - 1, CONFIG.METER_W, 1)
    .fill({ color: PALETTE.meterDim, alpha: 0.6 })
  uiContainer.addChild(meterBg)

  const meterFg = new Graphics()
  uiContainer.addChild(meterFg)

  const hint = new Text({
    text: '← → / A D  move    SPACE  jump    V  contain    R  begin again',
    style: { fontFamily: 'monospace', fontSize: 10, fill: PALETTE.hintText },
  })
  hint.x = 6
  hint.y = CONFIG.METER_Y + CONFIG.METER_H + 6
  uiContainer.addChild(hint)

  const containHint = new Text({
    text: 'CONTAIN',
    style: { fontFamily: 'monospace', fontSize: 9, fill: PALETTE.hintText },
  })
  containHint.x = CONFIG.METER_X + CONFIG.METER_W + 6
  containHint.y = CONFIG.METER_Y + 1
  uiContainer.addChild(containHint)

  const flashGfx = new Graphics()
  uiContainer.addChild(flashGfx)

  // Dread overlay — pulses red at the edges once instability crosses
  // DREAD_ONSET. Drawn BEFORE the vignette so the vignette's black
  // corners still darken over it.
  const dreadGfx = new Graphics()
  uiContainer.addChild(dreadGfx)

  const vignetteGfx = new Graphics()
  drawVignette(vignetteGfx, CONFIG.LOGICAL_WIDTH, CONFIG.LOGICAL_HEIGHT)
  uiContainer.addChild(vignetteGfx)

  return {
    app,
    bgContainer,
    worldContainer,
    uiContainer,
    skyGfx,
    parallax,
    windGfx,
    wind: createWindState() as WindS,
    worldGfx,
    auraGfx,
    playerGfx,
    eyeGfx,
    previewGfx,
    containArrowGfx,
    ruptureRingGfx,
    particlesGfx,
    flashGfx,
    dreadGfx,
    vignetteGfx,
    meterBg,
    meterFg,
    hint,
    containHint,
    worldCacheKey: hashColliders(level),
    time: 0,
  }
}

// Instability-driven aura color. Single family (cool → warm → hot), no
// rainbow. Alpha and radius carry the weight; color only warms slowly.
function auraColorFor(ratio: number): number {
  if (ratio <= 0.5)
    return PALETTE.auraCool
  if (ratio <= 0.85)
    return PALETTE.auraWarm
  return PALETTE.auraHot
}

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

export function render(
  ctx: RenderContext,
  player: Player,
  camera: Camera,
  fx: FxState,
  level: Level,
  dt: number,
): void {
  ctx.time += dt

  const key = hashColliders(level)
  if (key !== ctx.worldCacheKey) {
    drawColliders(ctx.worldGfx, level)
    ctx.worldCacheKey = key
  }

  // Wind advances at render cadence — purely aesthetic.
  tickWind(ctx.wind, dt, level)
  drawWind(ctx.windGfx, ctx.wind, camera)

  // Camera + shake + recognition zoom.
  // During hitstop we briefly scale the world up to amplify the "this
  // is happening" read. Eases in across the first half of the freeze,
  // eases out across the second.
  const off = shakeOffset(fx)
  const camX = camera.x - off.x
  const camY = camera.y - off.y
  let zoom = 1
  if (fx.hitstopTicks > 0) {
    const frac = fx.hitstopTicks / CONFIG.FRACTURE_HITSTOP_FRAMES
    // Sin curve peaks at mid-freeze, returns to 1 at end.
    zoom = 1 + CONFIG.FRACTURE_ZOOM_PEAK * Math.sin(frac * Math.PI)
  }
  ctx.worldContainer.scale.set(zoom)
  // Zoom around the screen center: offset accordingly.
  const cx0 = CONFIG.LOGICAL_WIDTH / 2
  const cy0 = CONFIG.LOGICAL_HEIGHT / 2
  ctx.worldContainer.x = -camX * zoom + cx0 * (1 - zoom)
  ctx.worldContainer.y = -camY * zoom + cy0 * (1 - zoom)
  updateParallax(ctx.parallax, camX, camY)

  // Visual fragmentation: above the threshold the player's body jitters
  // sub-pixel-ish. Reads as "not entirely here." Jitter scales with
  // instability above threshold; zero below.
  const ratio0 = player.instability.value / CONFIG.INSTABILITY_MAX
  let jx = 0
  let jy = 0
  if (ratio0 > CONFIG.DEGRADE_FRAGMENT_THRESH) {
    const t = (ratio0 - CONFIG.DEGRADE_FRAGMENT_THRESH) / (1 - CONFIG.DEGRADE_FRAGMENT_THRESH)
    const amp = t * CONFIG.DEGRADE_FRAGMENT_JITTER
    // Multi-frequency noise so the jitter feels organic rather than
    // regular sine-wave wobble.
    jx = Math.sin(ctx.time * 47 + player.y * 0.3) * amp
      + Math.sin(ctx.time * 83) * amp * 0.4
    jy = Math.cos(ctx.time * 59 + player.x * 0.3) * amp * 0.7
  }
  ctx.playerGfx.x = player.x + jx
  ctx.playerGfx.y = player.y + jy
  // Post-fracture flicker. In FAULTLINE this reads as "not fully here yet."
  const iframeBlink
    = player.iframeTimer > 0 ? (Math.floor(ctx.time * 30) % 2 === 0 ? 0.4 : 1.0) : 1.0
  ctx.playerGfx.alpha = iframeBlink
  ctx.eyeGfx.x = player.facing >= 0 ? CONFIG.PLAYER_W - 4 : 2
  ctx.eyeGfx.y = 4

  // ─── aura (radial, single-family) ────────────────────────
  const ratio = player.instability.value / CONFIG.INSTABILITY_MAX
  const auraR = CONFIG.AURA_BASE_RADIUS + ratio * (CONFIG.AURA_MAX_RADIUS - CONFIG.AURA_BASE_RADIUS)
  const color = auraColorFor(ratio)
  let auraAlpha = 0.12 + ratio * 0.4
  if (ratio > CONFIG.AURA_THRESH_HOT) {
    const t = (ratio - CONFIG.AURA_THRESH_HOT) / (1 - CONFIG.AURA_THRESH_HOT)
    const hz
      = CONFIG.AURA_PULSE_MIN_HZ + t * (CONFIG.AURA_PULSE_MAX_HZ - CONFIG.AURA_PULSE_MIN_HZ)
    const pulse = 0.5 + 0.5 * Math.sin(ctx.time * hz * Math.PI * 2)
    auraAlpha = 0.3 + 0.5 * pulse
  }
  ctx.auraGfx.clear()
  const cx = player.x + CONFIG.PLAYER_W / 2
  const cy = player.y + CONFIG.PLAYER_H / 2
  // Two-stop gradient fake: outer soft ring + inner brighter core.
  ctx.auraGfx.circle(cx, cy, auraR).fill({ color, alpha: auraAlpha * 0.4 })
  ctx.auraGfx.circle(cx, cy, auraR * 0.55).fill({ color, alpha: auraAlpha })

  // ─── rupture foresight ──────────────────────────────────
  // Multi-step projection of the player's motion and the rupture shape
  // they would carve at the projected instant. Gravity-only (no
  // collision): shows where you're *going*, not where you'll land.
  // Faint by design — mastery tool, not a constant guide.
  ctx.previewGfx.clear()
  ctx.previewGfx.x = 0
  ctx.previewGfx.y = 0
  ctx.previewGfx.rotation = 0
  if (
    player.alive
    && player.instability.value >= CONFIG.GHOST_INSTABILITY_THRESHOLD
    && player.iframeTimer <= 0
  ) {
    const baseCx = player.x + CONFIG.PLAYER_W / 2
    const baseCy = player.y + CONFIG.PLAYER_H / 2
    const samples = CONFIG.PREVIEW_SAMPLES
    // Body footprint trail — faint rects at sampled future positions.
    for (let i = 1; i <= samples; i++) {
      const t = (i / samples) * CONFIG.PREVIEW_LOOKAHEAD
      const g = player.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY
      const fx0 = player.x + player.vx * t
      const fy0 = player.y + player.vy * t + 0.5 * g * t * t
      const alpha = CONFIG.PREVIEW_ALPHA * (1 - i / (samples + 1))
      ctx.previewGfx.rect(fx0, fy0, CONFIG.PLAYER_W, CONFIG.PLAYER_H)
        .stroke({ width: 1, color: PALETTE.auraHot, alpha })
    }
    // Final-sample rupture ghost — the SHAPE that would carve at the
    // projected velocity. Stroke-only so it doesn't overwhelm.
    const tFinal = CONFIG.PREVIEW_LOOKAHEAD
    const gFinal = player.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY
    const vxFinal = player.vx
    const vyFinal = Math.min(CONFIG.MAX_FALL, player.vy + gFinal * tFinal)
    const fxF = baseCx + player.vx * tFinal
    const fyF = baseCy + player.vy * tFinal + 0.5 * gFinal * tFinal * tFinal
    const shapeFinal = computeRuptureShape(vxFinal, vyFinal)
    ctx.previewGfx.x = fxF
    ctx.previewGfx.y = fyF
    ctx.previewGfx.rotation = shapeFinal.angle
    drawEllipseOutline(
      ctx.previewGfx,
      shapeFinal.rx,
      shapeFinal.ry,
      PALETTE.auraHot,
      CONFIG.PREVIEW_ALPHA,
      0.04,
    )
  }

  // ─── post-fracture ring ────────────────────────────────
  ctx.ruptureRingGfx.clear()
  if (player.lastRupture && player.iframeTimer > 0) {
    const r = player.lastRupture
    const t = player.iframeTimer / CONFIG.FRACTURE_IFRAMES
    const scale = 1 + (1 - t) * 0.6
    ctx.ruptureRingGfx.x = r.center.x
    ctx.ruptureRingGfx.y = r.center.y
    ctx.ruptureRingGfx.rotation = r.shape.angle
    const ringColor = r.reflection.active ? PALETTE.auraWarm : PALETTE.auraHot
    drawEllipseOutline(
      ctx.ruptureRingGfx,
      r.shape.rx * scale,
      r.shape.ry * scale,
      ringColor,
      t,
      0,
    )
  }

  // ─── containment arrow ──────────────────────────────────
  ctx.containArrowGfx.clear()
  if (player.instability.containing) {
    const bob = Math.sin(ctx.time * 18) * 1.5
    const bx = player.x + CONFIG.PLAYER_W / 2
    const by = player.y + CONFIG.PLAYER_H + 4 + bob
    ctx.containArrowGfx.poly([bx - 4, by, bx + 4, by, bx, by + 5])
      .fill({ color: PALETTE.auraCool, alpha: 0.8 })
    ctx.containArrowGfx.poly([bx - 3, by + 6, bx + 3, by + 6, bx, by + 10])
      .fill({ color: PALETTE.auraCool, alpha: 0.5 })
  }

  // ─── particles ──────────────────────────────────────────
  // Each shard is a tiny triangle — rotated by p.angle, scaled by p.size.
  // Fades to 0 over its lifetime.
  ctx.particlesGfx.clear()
  for (const p of fx.particles) {
    const a = Math.max(0, p.life / p.maxLife)
    const s = p.size
    const ca = Math.cos(p.angle)
    const sa = Math.sin(p.angle)
    // Asymmetric triangle in local space.
    const verts: [number, number][] = [
      [s, 0],
      [-s * 0.6, s * 0.8],
      [-s * 0.4, -s * 0.7],
    ]
    const world: number[] = []
    for (const [lx, ly] of verts) {
      world.push(p.x + lx * ca - ly * sa, p.y + lx * sa + ly * ca)
    }
    ctx.particlesGfx.poly(world).fill({ color: p.color, alpha: a })
  }

  // ─── UI: instability presence (not a meter) ─────────────
  // The fill jitters sub-pixel with the aura pulse at high ratio. At
  // peak, small "ember" flakes pop off the right edge — the thing is
  // audibly leaking. No segment dividers, no "100% label" — the shape
  // itself tells you how close you are.
  ctx.meterFg.clear()
  const fillW = CONFIG.METER_W * ratio
  if (fillW > 0.5) {
    const color2 = ratio > CONFIG.AURA_THRESH_HOT ? PALETTE.meterBright : auraColorFor(ratio)
    const jitterAmp = ratio > 0.5 ? (ratio - 0.5) * 2 : 0
    const jx = (Math.random() - 0.5) * jitterAmp
    const jy = (Math.random() - 0.5) * jitterAmp * 0.4
    ctx.meterFg
      .rect(CONFIG.METER_X + jx, CONFIG.METER_Y + jy, fillW, CONFIG.METER_H)
      .fill({ color: color2, alpha: 0.92 })
    // Ember flakes — only when the instability is really close to
    // fracture. Small pixels jumping off the leading edge.
    if (ratio > CONFIG.AURA_THRESH_HOT) {
      const leadX = CONFIG.METER_X + fillW
      const embers = 3
      for (let i = 0; i < embers; i++) {
        const dx = Math.random() * 4
        const dy = (Math.random() - 0.5) * CONFIG.METER_H
        ctx.meterFg.rect(leadX + dx, CONFIG.METER_Y + CONFIG.METER_H / 2 + dy, 1, 1)
          .fill({ color: PALETTE.meterBright, alpha: 0.5 + Math.random() * 0.4 })
      }
    }
  }

  // Containment-hint tint.
  if (player.instability.containing)
    ctx.containHint.style.fill = PALETTE.player
  else if (player.instability.containmentStunTimer > 0)
    ctx.containHint.style.fill = PALETTE.hintDim
  else ctx.containHint.style.fill = PALETTE.hintText

  // ─── flash overlay ──────────────────────────────────────
  // Softer, slightly warm — less "bright explosion," more "brief
  // washout of the world around the wound."
  ctx.flashGfx.clear()
  const fa = flashAlpha(fx)
  if (fa > 0) {
    ctx.flashGfx.rect(0, 0, CONFIG.LOGICAL_WIDTH, CONFIG.LOGICAL_HEIGHT)
      .fill({ color: PALETTE.auraWarm, alpha: fa * CONFIG.FRACTURE_FLASH_MAX_ALPHA })
  }

  // ─── dread overlay (pre-fracture tension) ──────────────
  ctx.dreadGfx.clear()
  if (ratio > CONFIG.DREAD_ONSET) {
    const t = (ratio - CONFIG.DREAD_ONSET) / (1 - CONFIG.DREAD_ONSET)
    const pulseHz = 3 + t * 8
    const pulse = 0.5 + 0.5 * Math.sin(ctx.time * pulseHz * Math.PI * 2)
    const a = t * pulse * CONFIG.DREAD_MAX_ALPHA
    // Paint only the frame edges — a 40-px-wide border. Keeps the
    // center of the screen readable; the warning lives in peripheral
    // vision, which is where "wrong" registers fastest.
    const w = CONFIG.LOGICAL_WIDTH
    const h = CONFIG.LOGICAL_HEIGHT
    const border = 40
    const color = PALETTE.auraHot
    ctx.dreadGfx.rect(0, 0, w, border).fill({ color, alpha: a })
    ctx.dreadGfx.rect(0, h - border, w, border).fill({ color, alpha: a })
    ctx.dreadGfx.rect(0, border, border, h - border * 2).fill({ color, alpha: a })
    ctx.dreadGfx.rect(w - border, border, border, h - border * 2).fill({ color, alpha: a })
  }
}
