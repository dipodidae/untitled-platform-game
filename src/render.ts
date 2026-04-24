import type { Application } from 'pixi.js'
import type { Camera } from './camera'
import type { FxState } from './fx'
import type { Player } from './player'
import type { Prowler } from './prowler'
import type { ParallaxState } from './render/parallax'
import type { PlayerRenderState } from './render/playerRenderer'
import type { Level } from './world/level'
import { Container, Graphics, Text, Texture, TilingSprite } from 'pixi.js'
import { CONFIG } from './config'
import { flashAlpha, shakeOffset } from './fx'
import { PALETTE } from './render/palette'
import { createParallax, updateParallax } from './render/parallax'
import { drawPlayer, drawPlayerGhost, resetPlayerRenderer } from './render/playerRenderer'
import { drawSky, drawVignette } from './render/post'
import { drawProwler } from './render/prowlerRenderer'
import { createWindState, drawWind, tickWind, type WindState as WindS } from './render/wind'
import { drawColliders, hashColliders, setWorldInstability, shouldDrawDoubleExposure } from './render/world'
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
  readonly ghostGfx: Graphics
  readonly playerGhostGfx: Graphics
  readonly previewGfx: Graphics
  readonly containArrowGfx: Graphics
  readonly ruptureRingGfx: Graphics
  readonly particlesGfx: Graphics
  readonly deathPlaneGfx: Graphics
  readonly prowlerGfxList: Graphics[]
  readonly flashGfx: Graphics
  readonly dreadGfx: Graphics
  readonly vignetteGfx: Graphics
  readonly meterBg: Graphics
  readonly meterFg: Graphics
  readonly hint: Text
  readonly containHint: Text
  worldCacheKey: number
  time: number
  // Player renderer bookkeeping
  wasGrounded: boolean
  ruptureFrame: number // -1 = none, 0+ = frames since rupture
  respawnFrame: number // -1 = none, 0+ = frames since respawn
  // Hint fadeout: once the player demonstrates each action the hints
  // become redundant. Fade them out over ~2 seconds.
  hintSeen: { moved: boolean, jumped: boolean, contained: boolean }
  hintAlpha: number
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

  // Parallax dither: 2x2 checkerboard for unresolved-signal look
  const ditherCanvas = document.createElement('canvas')
  ditherCanvas.width = 2
  ditherCanvas.height = 2
  const ditherCtx2d = ditherCanvas.getContext('2d')!
  ditherCtx2d.fillStyle = 'black'
  ditherCtx2d.fillRect(0, 0, 1, 1)
  ditherCtx2d.fillRect(1, 1, 1, 1)
  const ditherTex = Texture.from({ resource: ditherCanvas, antialias: false })
  ditherTex.source.scaleMode = 'nearest'
  const ditherMask = new TilingSprite({ texture: ditherTex, width: CONFIG.LOGICAL_WIDTH * 2, height: CONFIG.LOGICAL_HEIGHT })
  ditherMask.alpha = 0.5
  parallax.container.addChild(ditherMask)

  const windGfx = new Graphics()
  worldContainer.addChild(windGfx) // behind colliders — occluded by ground

  const worldGfx = new Graphics()
  drawColliders(worldGfx, level)
  worldContainer.addChild(worldGfx)

  const auraGfx = new Graphics()
  worldContainer.addChild(auraGfx)

  const particlesGfx = new Graphics()
  worldContainer.addChild(particlesGfx)

  // Death-plane indicator — faint static dots along the bottom of the world
  // so the player can distinguish "lower floor" from "fall-out void."
  const deathPlaneGfx = new Graphics()
  worldContainer.addChild(deathPlaneGfx)

  // Prowler graphics — one Graphics per prowler spawn in the level.
  const prowlerGfxList: Graphics[] = []
  for (const _s of level.prowlerSpawns) {
    const g = new Graphics()
    worldContainer.addChild(g)
    prowlerGfxList.push(g)
  }

  const previewGfx = new Graphics()
  worldContainer.addChild(previewGfx)

  const ruptureRingGfx = new Graphics()
  worldContainer.addChild(ruptureRingGfx)

  const playerGhostGfx = new Graphics()
  worldContainer.addChild(playerGhostGfx) // below player
  const playerGfx = new Graphics()
  worldContainer.addChild(playerGfx)
  const eyeGfx = new Graphics() // unused but kept for interface compat

  const ghostGfx = new Graphics()
  worldContainer.addChild(ghostGfx)

  const containArrowGfx = new Graphics()
  worldContainer.addChild(containArrowGfx)

  // Instability presence. Not a meter chassis — no segments, no clean
  // chrome. Just a thin baseline that the fill grows out of. The value
  // lives in the fill's behavior (jitter, ember flakes) more than its
  // length.
  const meterBg = new Graphics()
  meterBg.rect(CONFIG.METER_X, CONFIG.METER_Y, CONFIG.METER_W, CONFIG.METER_H)
    .fill({ color: PALETTE.meterChassis, alpha: 0.7 })
  uiContainer.addChild(meterBg)

  const meterFg = new Graphics()
  uiContainer.addChild(meterFg)

  const hint = new Text({
    text: '← → / A D  move    SPACE  jump    V  contain    R  begin again',
    style: { fontFamily: 'monospace', fontSize: 10, fill: PALETTE.hintText },
  })
  hint.x = 6
  hint.y = CONFIG.METER_Y + CONFIG.METER_H + 4
  uiContainer.addChild(hint)

  const containHint = new Text({
    text: 'CONTAIN',
    style: { fontFamily: 'monospace', fontSize: 9, fill: PALETTE.hintText },
  })
  containHint.x = CONFIG.METER_X + CONFIG.METER_W + 6
  containHint.y = CONFIG.METER_Y
  uiContainer.addChild(containHint)

  const flashGfx = new Graphics()
  uiContainer.addChild(flashGfx)

  // Dread overlay — pulses red at the edges once instability crosses
  // DREAD_ONSET. Drawn BEFORE the vignette so the vignette's black
  // corners still darken over it.
  const dreadGfx = new Graphics()
  uiContainer.addChild(dreadGfx)

  hint.alpha = 0.55
  containHint.alpha = 0.55

  const vignetteGfx = new Graphics()
  drawVignette(vignetteGfx, CONFIG.LOGICAL_WIDTH, CONFIG.LOGICAL_HEIGHT)
  uiContainer.addChild(vignetteGfx)
  // CRT shader handles vignette now; keep node but hide it
  vignetteGfx.visible = false

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
    ghostGfx,
    playerGhostGfx,
    previewGfx,
    containArrowGfx,
    ruptureRingGfx,
    particlesGfx,
    deathPlaneGfx,
    prowlerGfxList,
    flashGfx,
    dreadGfx,
    vignetteGfx,
    meterBg,
    meterFg,
    hint,
    containHint,
    worldCacheKey: hashColliders(level),
    time: 0,
    wasGrounded: false,
    ruptureFrame: -1,
    respawnFrame: -1,
    hintSeen: { moved: false, jumped: false, contained: false },
    hintAlpha: 0.55,
  }
}

// Remove scene containers from stage so a fresh buildScene can rebuild them.
export function teardownScene(ctx: RenderContext): void {
  ctx.bgContainer.destroy({ children: true })
  ctx.worldContainer.destroy({ children: true })
  ctx.uiContainer.destroy({ children: true })
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

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xFF
  const ag = (a >> 8) & 0xFF
  const ab = a & 0xFF
  const br = (b >> 16) & 0xFF
  const bg = (b >> 8) & 0xFF
  const bb = b & 0xFF
  const rr = Math.round(ar + (br - ar) * t)
  const rg = Math.round(ag + (bg - ag) * t)
  const rb = Math.round(ab + (bb - ab) * t)
  return (rr << 16) | (rg << 8) | rb
}

function meterColorForRatio(r: number): number {
  if (r <= 0.5)
    return lerpColor(0x4A6040, 0xC8A020, r * 2)
  return lerpColor(0xC8A020, 0xC82020, (r - 0.5) * 2)
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

// Dashed ellipse outline (3px on / 3px off)
function drawDashedEllipse(
  g: Graphics,
  rx: number,
  ry: number,
  color: number,
  alpha: number,
): void {
  const segments = 48
  for (let i = 0; i < segments; i++) {
    // Alternate: 2 segments on, 2 off (~3px chunks)
    if (Math.floor(i / 2) % 2 !== 0)
      continue
    const a0 = (i / segments) * Math.PI * 2
    const a1 = ((i + 1) / segments) * Math.PI * 2
    g.moveTo(Math.cos(a0) * rx, Math.sin(a0) * ry)
      .lineTo(Math.cos(a1) * rx, Math.sin(a1) * ry)
    g.stroke({ width: 1, color, alpha })
  }
}

export function render(
  ctx: RenderContext,
  player: Player,
  camera: Camera,
  fx: FxState,
  level: Level,
  dt: number,
  prowlers?: readonly Prowler[],
): void {
  ctx.time += dt

  // Pipe instability into world rendering system
  const instability = player.instability.value / CONFIG.INSTABILITY_MAX
  setWorldInstability(instability, dt)

  // Always redraw — glass flicker / bone jitter are per-frame effects
  drawColliders(ctx.worldGfx, level)
  ctx.worldCacheKey = hashColliders(level)

  // Death-plane static — faint dots along the world bottom edge so the
  // player can see where the void begins. Redraws each frame for the
  // flickering-static feel.
  ctx.deathPlaneGfx.clear()
  const dpY = level.worldHeight
  const dpStep = 4
  for (let x = Math.floor(camera.x / dpStep) * dpStep; x < camera.x + CONFIG.LOGICAL_WIDTH + dpStep; x += dpStep) {
    if (Math.random() < 0.35) {
      const px = x + (Math.random() - 0.5) * 2
      ctx.deathPlaneGfx.rect(px, dpY + Math.random() * 6, 1, 1)
        .fill({ color: 0x602020, alpha: 0.2 + Math.random() * 0.15 })
    }
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
  // Position the player Graphics at the center of the AABB (playerRenderer draws around 0,0)
  ctx.playerGfx.x = player.x + CONFIG.PLAYER_W / 2 + jx
  ctx.playerGfx.y = player.y + CONFIG.PLAYER_H / 2 + jy
  // Post-fracture flicker. In FAULTLINE this reads as "not fully here yet."
  const iframeBlink
    = player.iframeTimer > 0 ? (Math.floor(ctx.time * 30) % 2 === 0 ? 0.4 : 1.0) : 1.0
  ctx.playerGfx.alpha = iframeBlink

  // Track rupture / respawn frame counters
  if (!player.alive && ctx.ruptureFrame === -1) {
    ctx.ruptureFrame = 0
  }
  else if (ctx.ruptureFrame >= 0) {
    ctx.ruptureFrame++
  }
  if (player.alive && ctx.ruptureFrame >= 0) {
    // Player respawned
    ctx.ruptureFrame = -1
    ctx.respawnFrame = 0
    resetPlayerRenderer()
  }
  if (ctx.respawnFrame >= 0) {
    ctx.respawnFrame++
    if (ctx.respawnFrame > 65)
      ctx.respawnFrame = -1
  }

  const prs: PlayerRenderState = {
    vx: player.vx,
    vy: player.vy,
    grounded: player.grounded,
    wasGrounded: ctx.wasGrounded,
    facing: player.facing,
    containing: player.instability.containing,
    alive: player.alive,
    iframeTimer: player.iframeTimer,
    ruptureFrame: ctx.ruptureFrame,
    respawnFrame: ctx.respawnFrame,
    instability: ratio0,
    djGlowTimer: player.djGlowTimer,
    djFiredThisTick: player.djFiredThisTick,
    groundMaterial: player.groundMaterial,
  }
  drawPlayer(ctx.playerGfx, prs, ratio0, ctx.time)
  ctx.wasGrounded = player.grounded

  // ─── prowlers ─────────────────────────────────────────────
  if (prowlers) {
    for (let i = 0; i < prowlers.length; i++) {
      const pg = ctx.prowlerGfxList[i]
      const pr = prowlers[i]
      if (!pg || !pr)
        continue
      pg.x = pr.x + pr.w / 2
      pg.y = pr.y + pr.h / 2
      pg.visible = pr.alive
      if (pr.alive)
        drawProwler(pg, pr, ctx.time)
      else pg.clear()
    }
  }

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
    // Hollow polygon outlines in cold blue — mastery tool.
    const prevAlpha = 0.15 + instability * 0.25
    for (let i = 1; i <= samples; i++) {
      const t = (i / samples) * CONFIG.PREVIEW_LOOKAHEAD
      const g = player.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY
      const fx0 = player.x + player.vx * t
      const fy0 = player.y + player.vy * t + 0.5 * g * t * t
      ctx.previewGfx.rect(fx0, fy0, CONFIG.PLAYER_W, CONFIG.PLAYER_H)
        .stroke({ width: 1, color: PALETTE.auraCool, alpha: prevAlpha })
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
    // Dashed rupture ellipse in red at 40% opacity
    drawDashedEllipse(ctx.previewGfx, shapeFinal.rx, shapeFinal.ry, 0xCC2020, 0.4)
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

  // ─── UI: instability bar (1px tall pixel line) ────────────
  ctx.meterFg.clear()
  const fillW = CONFIG.METER_W * ratio
  if (fillW > 0.5) {
    const meterCol = meterColorForRatio(ratio)
    ctx.meterFg
      .rect(CONFIG.METER_X, CONFIG.METER_Y, fillW, CONFIG.METER_H)
      .fill({ color: meterCol })
  }

  // Hint fadeout — track demonstrated actions, then fade to zero.
  if (Math.abs(player.vx) > 10)
    ctx.hintSeen.moved = true
  if (!player.grounded && player.vy < -1)
    ctx.hintSeen.jumped = true
  if (player.instability.containing)
    ctx.hintSeen.contained = true

  const allSeen = ctx.hintSeen.moved && ctx.hintSeen.jumped && ctx.hintSeen.contained
  const hintTarget = allSeen ? 0 : 0.55
  ctx.hintAlpha += (hintTarget - ctx.hintAlpha) * Math.min(1, dt * 0.8)
  if (ctx.hintAlpha < 0.005)
    ctx.hintAlpha = 0
  ctx.hint.alpha = ctx.hintAlpha
  ctx.containHint.alpha = ctx.hintAlpha

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

  // Dread overlay removed — CRT shader handles dread pulse via uDread uniform.
  ctx.dreadGfx.clear()

  // ─── player foresight ghost (renders BELOW main player) ────
  ctx.playerGhostGfx.clear()
  if (
    player.alive
    && player.instability.value >= CONFIG.GHOST_INSTABILITY_THRESHOLD
    && player.iframeTimer <= 0
  ) {
    // Place ghost at the final foresight sample position
    const tGhost = CONFIG.PREVIEW_LOOKAHEAD
    const gGhost = player.vy < 0 ? CONFIG.JUMP_GRAVITY : CONFIG.FALL_GRAVITY
    ctx.playerGhostGfx.x = player.x + CONFIG.PLAYER_W / 2 + player.vx * tGhost
    ctx.playerGhostGfx.y = player.y + CONFIG.PLAYER_H / 2 + player.vy * tGhost + 0.5 * gGhost * tGhost * tGhost
    const rupturePreviewActive = ratio0 >= 0.95
    drawPlayerGhost(ctx.playerGhostGfx, ratio0, rupturePreviewActive)
  }

  // ─── double-exposure ghost (instability > 0.8) ────────
  ctx.ghostGfx.clear()
  if (shouldDrawDoubleExposure()) {
    ctx.ghostGfx.rect(player.x + 2, player.y, CONFIG.PLAYER_W, CONFIG.PLAYER_H)
      .fill({ color: PALETTE.player, alpha: 0.3 })
  }
}
