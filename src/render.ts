import type { Application } from 'pixi.js'
import type { BulletState } from './combat/bullet'
import type { Camera } from './render/camera'
import type { Dummy } from './enemies/dummy'
import type { FxState } from './render/fx'
import type { BroadphaseGrid } from './physics'
import type { Player } from './player/player'
import type { Prowler } from './enemies/prowler'
import type { ParallaxState } from './render/parallax'
import type { ParticleSystem } from './render/particles'
import type { SpineboyBridge } from './render/spineboy'
import type { WindState } from './render/wind'
import type { Level } from './world/level'
import { Container, Graphics, Text, Texture, TilingSprite } from 'pixi.js'
import { predictBulletImpact } from './combat/bullet'
import { CONFIG } from './config'
import { flashAlpha } from './render/fx'
import { PALETTE } from './render/palette'
import { createParallax, updateParallax } from './render/parallax'
import { drawPlayerGhost, resetPlayerRenderer } from './render/playerRenderer'
import { drawSky, drawVignette } from './render/post'
import { drawProwler } from './render/prowlerRenderer'
import { createSpineboyBridge, resetSpineboyBridge, triggerShootOverlay, updateSpineboyVisual } from './render/spineboy'
import { createWindState, drawWind, tickWind } from './render/wind'
import { drawColliders, hashColliders, setWorldInstability, shouldDrawDoubleExposure } from './render/world'
import { computeRuptureShape } from './combat/rupture'

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
  readonly charBridge: SpineboyBridge
  readonly playerGfx: Graphics // kept for iframe blink / jitter overlay
  readonly eyeGfx: Graphics
  readonly ghostGfx: Graphics
  readonly playerGhostGfx: Graphics
  readonly previewGfx: Graphics
  readonly containArrowGfx: Graphics
  readonly ruptureRingGfx: Graphics
  readonly deathPlaneGfx: Graphics
  readonly bulletGfx: Graphics
  readonly crosshairGfx: Graphics
  readonly dummyGfx: Graphics
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

export function buildScene(app: Application, level: Level, particles: ParticleSystem): RenderContext {
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

  // Particle system root — contains both ParticleContainers (dot + shard).
  // Layer position: above colliders + aura, below the character so Spineboy
  // draws on top of debris.
  worldContainer.addChild(particles.root)

  // Death-plane indicator — faint static dots along the bottom of the world
  // so the player can distinguish "lower floor" from "fall-out void."
  const deathPlaneGfx = new Graphics()
  worldContainer.addChild(deathPlaneGfx)

  // Bullet tracers — drawn above terrain, below player so shots pass behind.
  const bulletGfx = new Graphics()
  worldContainer.addChild(bulletGfx)

  // Crosshair + predicted-trajectory dots. Drawn on top of terrain so aim is
  // always readable, but below the player.
  const crosshairGfx = new Graphics()
  worldContainer.addChild(crosshairGfx)

  // AI-less dummy enemies — simple squares + HP pips + hit flash.
  const dummyGfx = new Graphics()
  worldContainer.addChild(dummyGfx)

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

  // Spineboy replaces the old procedural pixel mass + custom skeletal rig.
  const charBridge = createSpineboyBridge()
  worldContainer.addChild(charBridge.container)

  const playerGfx = new Graphics() // kept for legacy compat / overlay effects
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
    wind: createWindState() as WindState,
    worldGfx,
    auraGfx,
    charBridge,
    playerGfx,
    eyeGfx,
    ghostGfx,
    playerGhostGfx,
    previewGfx,
    containArrowGfx,
    ruptureRingGfx,
    deathPlaneGfx,
    bulletGfx,
    crosshairGfx,
    dummyGfx,
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
  bullets?: BulletState,
  dummies?: readonly Dummy[],
  broadphase?: BroadphaseGrid,
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

  // Camera position with trauma shake baked in
  const camX = camera.x + camera.shakeX
  const camY = camera.y + camera.shakeY

  // Zoom: camera speed-zoom + hitstop recognition zoom (additive)
  let zoom = camera.zoom
  if (fx.hitstopTicks > 0) {
    const frac = fx.hitstopTicks / CONFIG.FRACTURE_HITSTOP_FRAMES
    zoom += CONFIG.FRACTURE_ZOOM_PEAK * Math.sin(frac * Math.PI)
  }
  ctx.worldContainer.scale.set(zoom)
  // Zoom from screen center, not top-left
  const cx0 = CONFIG.LOGICAL_WIDTH / 2
  const cy0 = CONFIG.LOGICAL_HEIGHT / 2
  ctx.worldContainer.x = -camX * zoom + cx0 * (1 - zoom)
  ctx.worldContainer.y = -camY * zoom + cy0 * (1 - zoom)
  updateParallax(ctx.parallax, camX, camY)

  // ─── Skeletal character sync ─────────────────────────────────
  const ratio0 = player.instability.value / CONFIG.INSTABILITY_MAX

  // Instability-driven positional jitter on the character container
  let jx = 0
  let jy = 0
  if (ratio0 > CONFIG.DEGRADE_FRAGMENT_THRESH) {
    const t = (ratio0 - CONFIG.DEGRADE_FRAGMENT_THRESH) / (1 - CONFIG.DEGRADE_FRAGMENT_THRESH)
    const amp = t * CONFIG.DEGRADE_FRAGMENT_JITTER
    jx = Math.sin(ctx.time * 47 + player.y * 0.3) * amp
      + Math.sin(ctx.time * 83) * amp * 0.4
    jy = Math.cos(ctx.time * 59 + player.x * 0.3) * amp * 0.7
  }

  // Spineboy visual sync (FSM + spine.update) runs at render cadence so bone
  // interpolation is smooth at any refresh rate. Consume any pending fire
  // edge so the upper-body 'shoot' overlay plays on track 1.
  updateSpineboyVisual(ctx.charBridge, player, dt)
  if (bullets && bullets.fireEdge) {
    triggerShootOverlay(ctx.charBridge)
    bullets.fireEdge = false
  }
  // Instability jitter on top of the synced position.
  ctx.charBridge.container.x += jx
  ctx.charBridge.container.y += jy

  // Clear legacy playerGfx (no longer drawn, but kept in scene for ordering)
  ctx.playerGfx.clear()

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
    resetSpineboyBridge(ctx.charBridge)
  }
  if (ctx.respawnFrame >= 0) {
    ctx.respawnFrame++
    if (ctx.respawnFrame > 65)
      ctx.respawnFrame = -1
  }
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

  // ─── dummies (AI-less test enemies) ─────────────────────
  // Flat square with a 1px outline, red hit-flash, and a tiny top-edge HP bar.
  ctx.dummyGfx.clear()
  if (dummies) {
    for (const d of dummies) {
      if (!d.alive)
        continue
      const flash = d.hitFlashTimer > 0
      const fill = flash ? 0xFF4A4A : 0x3A3F4A
      ctx.dummyGfx.rect(d.x, d.y, d.w, d.h)
        .fill({ color: fill })
        .stroke({ width: 1, color: 0x202632, alpha: 0.9 })
      // HP pip bar.
      const pipW = d.w - 2
      const pipRatio = d.hp / d.maxHp
      ctx.dummyGfx.rect(d.x + 1, d.y - 3, pipW, 1).fill({ color: 0x1A1A20, alpha: 0.8 })
      if (pipRatio > 0) {
        ctx.dummyGfx.rect(d.x + 1, d.y - 3, pipW * pipRatio, 1)
          .fill({ color: flash ? 0xFFC060 : 0xE04040 })
      }
    }
  }

  // ─── bullets ────────────────────────────────────────────
  // Tracer = 9px trail behind head along -velocity with three layers: wide
  // oxblood halo, warm-white core stripe, and a bright head dot so the
  // projectile reads as a physical object rather than a mere line.
  ctx.bulletGfx.clear()
  if (bullets) {
    for (const b of bullets.bullets) {
      if (!b.alive)
        continue
      const len = 9
      const inv = 1 / Math.max(1, Math.hypot(b.vx, b.vy))
      const tx = b.x - b.vx * inv * len
      const ty = b.y - b.vy * inv * len
      ctx.bulletGfx.moveTo(tx, ty).lineTo(b.x, b.y).stroke({ width: 5, color: 0x8A2A1C, alpha: 0.45 })
      ctx.bulletGfx.moveTo(tx, ty).lineTo(b.x, b.y).stroke({ width: 2, color: 0xFFD48C, alpha: 1 })
      ctx.bulletGfx.circle(b.x, b.y, 2.2).fill({ color: 0xFFF6D8, alpha: 1 })
    }
  }

  // ─── crosshair + trajectory preview ─────────────────────
  // Forward-simulate from current muzzle with current aim; draw fading dots
  // along the arc + a target marker at the predicted impact. Color-codes by
  // hit type: red for enemy, warm-white for terrain, dim for miss.
  ctx.crosshairGfx.clear()
  if (broadphase && dummies && ctx.charBridge.muzzleReady && player.alive) {
    const b = ctx.charBridge
    const pred = predictBulletImpact(
      b.muzzleX,
      b.muzzleY,
      b.muzzleDirX,
      b.muzzleDirY,
      'slug',
      level,
      dummies,
      broadphase,
    )
    // Trajectory dots — skip the first point (that's the muzzle), fade alpha.
    for (let i = 1; i < pred.points.length; i += 2) {
      const p = pred.points[i]!
      const t = i / Math.max(1, pred.points.length - 1)
      const alpha = 0.35 * (1 - t * 0.6)
      ctx.crosshairGfx.circle(p.x, p.y, 1).fill({ color: 0xFFD48C, alpha })
    }
    // Impact marker — small cross. Red if it would hit enemy, warm-white if
    // terrain, dim-gray if trajectory expires without hitting anything.
    const hitColor
      = pred.hit === 'enemy'
        ? 0xFF4040
        : pred.hit === 'terrain'
          ? 0xFFE6A8
          : 0x888888
    const hitAlpha = pred.hit === 'none' ? 0.35 : 0.9
    const r = pred.hit === 'enemy' ? 5 : 4
    ctx.crosshairGfx.moveTo(pred.impactX - r, pred.impactY)
      .lineTo(pred.impactX + r, pred.impactY)
      .stroke({ width: 1, color: hitColor, alpha: hitAlpha })
    ctx.crosshairGfx.moveTo(pred.impactX, pred.impactY - r)
      .lineTo(pred.impactX, pred.impactY + r)
      .stroke({ width: 1, color: hitColor, alpha: hitAlpha })
    if (pred.hit !== 'none') {
      ctx.crosshairGfx.circle(pred.impactX, pred.impactY, r + 1)
        .stroke({ width: 1, color: hitColor, alpha: 0.4 })
    }
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
