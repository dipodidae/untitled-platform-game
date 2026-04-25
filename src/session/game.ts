import type { Application } from 'pixi.js'
import type { BulletState } from '../combat/bullet'
import type { ClassicsState } from '../enemies/classics'
import type { Dummy } from '../enemies/dummy'
import type { Prowler } from '../enemies/prowler'
import type { SpecialsState } from '../enemies/specials'
import type { Pickup } from '../items'
import type { Player } from '../player/player'
import type { RenderContext } from '../render'
import type { Camera } from '../render/camera'
import type { DamageNumbers } from '../render/damageNumbers'
import type { FxState } from '../render/fx'
import type { ParticleSystem } from '../render/particles'
import type { Level } from '../world/level'
import { Container } from 'pixi.js'
import { createBulletState, resetBulletState, spawnBullet, updateBullets } from '../combat/bullet'
import { CONFIG } from '../config'
import { createClassicsFromSpawns, shootingDisabled, updateClassics } from '../enemies/classics'
import { createDummy, updateDummy } from '../enemies/dummy'
import { checkProwlerPlayerContact, createProwler, prowlerReactToRupture, updateProwler } from '../enemies/prowler'
import { createSpecialsFromSpawns, updateSpecials } from '../enemies/specials'
import { endFrame, respawnPressed, shootPressed, stanceCyclePressed } from '../input/input'
import { createPickupsFromSpawns, getItemDef, pickupOverlapsPlayer, tickPickups } from '../items'
import { BroadphaseGrid } from '../physics'
import { createPlayer, respawn, updatePlayer } from '../player/player'
import { buildScene, render, teardownScene } from '../render'
import { addTrauma, createCamera, updateCamera } from '../render/camera'
import { loadCosmeticAssets } from '../render/cosmeticAssets'
import { populateCosmetics } from '../render/cosmeticRenderer'
import { CRTFilter } from '../render/CRTFilter'
import { createDamageNumbers, resetDamageNumbers, spawnDamageNumber, tickDamageNumbers } from '../render/damageNumbers'
import { consumeHitstopTick, createFxState, tickFxRender } from '../render/fx'
import { createParticleSystem, emitDisintegration, emitLandingDust, emitPickupClaim, emitWallSlideSparks, resetParticleSystem, scatterMotes, tickParticles } from '../render/particles'
import { resetPlayerRenderer } from '../render/playerRenderer'
import { cycleStance } from '../render/spineboy'
import { kineticReactToRupture, updateKinetics } from '../world/kinetic'
import { fromJson, tickEphemeral } from '../world/level'
import { emit, on } from './eventBus'

import { gameState as gameSession } from './gameState'
import { levelIdAt, listLevels, loadLevel, markLevelLoaded } from './levelManager'

export interface GameState {
  readonly app: Application
  level: Level
  player: Player
  camera: Camera
  renderCtx: RenderContext
  readonly fx: FxState
  readonly broadphase: BroadphaseGrid
  readonly crtFilter: CRTFilter
  // Top-of-stage container that hosts every UI overlay (menu, drop-in,
  // results, damage vignette). Sits above bgContainer/worldContainer/
  // uiContainer, INSIDE app.stage, so the CRT filter on the stage applies
  // to overlays uniformly with the game world. Survives level loads —
  // teardownScene only destroys the three scene containers, not this one.
  readonly screenOverlay: Container
  accumulator: number
  // Continuous game time (seconds). Drives shard TTLs and any other
  // wall-clock-like timers that need a consistent reading across ticks.
  now: number
  levelIndex: number
  prowlers: Prowler[]
  readonly bullets: BulletState
  dummies: Dummy[]
  readonly particles: ParticleSystem
  pickups: Pickup[]
  readonly damageNumbers: DamageNumbers
  specials: SpecialsState
  classics: ClassicsState
}

export function createGame(app: Application): GameState {
  const id = levelIdAt(0)
  if (!id)
    throw new Error('Level catalog is empty')
  const levelJson = loadLevel(id)!
  const level = fromJson(levelJson)
  const player = createPlayer(level)
  const camera = createCamera(player)
  const fx = createFxState()
  const broadphase = new BroadphaseGrid()
  const prowlers = level.prowlerSpawns.map(s => createProwler(s.x, s.y))
  const bullets = createBulletState()
  const dummies: Dummy[] = level.dummySpawns.map(s => createDummy(s.x, s.y, s.hp))
  const particles = createParticleSystem(app.renderer)
  const renderCtx = buildScene(app, level, particles)
  const crtFilter = new CRTFilter()
  app.stage.filters = [crtFilter]
  // Screen-overlay layer for menus / cinematics / results. Added LAST so
  // it stays on top of the scene; re-elevated after every loadLevelAtIndex.
  const screenOverlay = new Container()
  app.stage.addChild(screenOverlay)
  // Prime the background with ambient motes (replaces the old wind-mote system
  // for now — far cheaper and reads the same at this scale).
  const pickups = createPickupsFromSpawns(level.pickupSpawns)
  const specials = createSpecialsFromSpawns(level.specialSpawns)
  const classics = createClassicsFromSpawns(level.classicSpawns)
  const damageNumbers = createDamageNumbers()
  renderCtx.worldContainer.addChild(damageNumbers.root)
  // Hit feedback: pop a damage number at the hit site. Subscribed once
  // per game; never detached because the game bundle lives for the full
  // session.
  on('hitLanded', (e) => {
    spawnDamageNumber(damageNumbers, e.x, e.y, e.damage, e.target)
  })
  scatterMotes(particles, level.worldWidth, level.worldHeight, 200)
  markLevelLoaded(id)
  const state: GameState = { app, level, player, camera, renderCtx, fx, broadphase, crtFilter, screenOverlay, accumulator: 0, now: 0, levelIndex: 0, prowlers, bullets, dummies, particles, pickups, damageNumbers, specials, classics }

  // Enemy loot drops — 50% chance health pack, 50% chance armor shard.
  on('enemyKilled', (e) => {
    const kind = Math.random() < 0.5 ? 'healthPack' as const : 'armorShard' as const
    const def = getItemDef(kind)
    state.pickups.push({
      x: e.x - def.w / 2,
      y: e.y - def.h / 2,
      w: def.w,
      h: def.h,
      kind,
      alive: true,
      bobPhase: Math.random() * Math.PI * 2,
    })
  })

  // Pickup visual feedback — screen flash + bar glow.
  on('pickupClaimed', (e) => {
    const ctx = state.renderCtx
    if (e.kind === 'health') {
      ctx.hpGlowTimer = 0.4
      ctx.pickupFlashTimer = 0.2
      ctx.pickupFlashColor = 0x30FF50
    }
    else if (e.kind === 'armor') {
      ctx.armorGlowTimer = 0.4
      ctx.pickupFlashTimer = 0.2
      ctx.pickupFlashColor = 0x4080FF
    }
    else if (e.kind === 'coin') {
      ctx.pickupFlashTimer = 0.15
      ctx.pickupFlashColor = 0xFFD700
    }
    else {
      ctx.pickupFlashTimer = 0.25
      ctx.pickupFlashColor = 0xFFA030
    }
  })

  // Load cosmetic assets async — they populate the already-built scene
  // containers when ready. No gameplay dependency.
  void loadCosmeticAssets(levelJson.cosmetics).then((data) => {
    if (data)
      populateCosmetics(state.renderCtx.cosmetic, data, state.level)
  })

  return state
}

// Internal: rebuild the scene for the level at `index`. Shared by
// advanceLevel (increment then load) and reloadLevel (load current).
function loadLevelAtIndex(state: GameState, index: number): void {
  const id = levelIdAt(index)
  if (!id)
    throw new Error(`No level at index ${index}`)
  state.levelIndex = index
  const levelJson = loadLevel(id)!
  state.level = fromJson(levelJson)
  state.player = createPlayer(state.level)
  state.camera = createCamera(state.player)
  state.now = 0
  state.accumulator = 0

  state.prowlers = state.level.prowlerSpawns.map(s => createProwler(s.x, s.y))
  resetBulletState(state.bullets)
  state.dummies = state.level.dummySpawns.map(s => createDummy(s.x, s.y, s.hp))
  state.pickups = createPickupsFromSpawns(state.level.pickupSpawns)
  state.specials = createSpecialsFromSpawns(state.level.specialSpawns)
  state.classics = createClassicsFromSpawns(state.level.classicSpawns)

  // Clean up visual state from the previous level.
  state.fx.hitstopTicks = 0
  state.fx.shakeTimer = 0
  state.fx.flashTimer = 0
  resetParticleSystem(state.particles)
  resetPlayerRenderer()

  teardownScene(state.renderCtx)
  state.renderCtx = buildScene(state.app, state.level, state.particles)
  state.renderCtx.worldContainer.addChild(state.damageNumbers.root)
  // buildScene appended bg/world/ui at the top of stage; keep the overlay
  // layer above them by re-adding (Pixi treats addChild on an existing
  // child as a move-to-top).
  state.app.stage.addChild(state.screenOverlay)
  resetDamageNumbers(state.damageNumbers)
  scatterMotes(state.particles, state.level.worldWidth, state.level.worldHeight, 200)

  markLevelLoaded(id)

  // Load cosmetic assets async — they populate the already-built scene
  // containers when ready. No gameplay dependency.
  void loadCosmeticAssets(levelJson.cosmetics).then((data) => {
    if (data)
      populateCosmetics(state.renderCtx.cosmetic, data, state.level)
  })
}

// Transition to the next level. Wraps back to level 1 after the last.
export function advanceLevel(state: GameState): void {
  loadLevelAtIndex(state, (state.levelIndex + 1) % listLevels().length)
}

// Re-enter the current level from scratch (Results-screen "retry").
export function reloadLevel(state: GameState): void {
  loadLevelAtIndex(state, state.levelIndex)
}

// Check if the player has reached the right boundary of the level.
function checkLevelTransition(state: GameState): boolean {
  const p = state.player
  // Touching the right wall triggers advance.
  return p.alive && p.x + p.w >= state.level.worldWidth - 2
}

// One fixed physics step. Hitstop short-circuits the step so the fracture
// visually "lands" — shake and flash keep animating on render cadence
// regardless. Input edges are latched at the end of the step.
function fixedUpdate(state: GameState): void {
  // Phase gate — physics only runs during `gameplay` and `dead` (so the
  // death-freeze timer can still elapse). Menu, drop-in cinematic, and the
  // results screen all pause the world.
  const phase = gameSession.phase
  if (phase === 'menu' || phase === 'dropIn' || phase === 'results') {
    return
  }

  if (consumeHitstopTick(state.fx)) {
    // Frozen physics — nothing moves, no input latching either so buffered
    // presses during hitstop arrive on the first live tick after.
    return
  }

  // R key at any time = instant retry (bypasses the death-feedback freeze).
  const retryPressed = respawnPressed()
  if (retryPressed)
    emit('retryPressed', null)

  if (!state.player.alive) {
    // Death-feedback window: wait until DEATH_FREEZE_MS after die() before
    // the automatic respawn so shake/flash/particles land. R bypasses.
    const freezeOver = performance.now() >= gameSession.deathFreezeEndsAt
    if (retryPressed || freezeOver) {
      respawn(state.player, state.level)
      gameSession.phase = 'gameplay'
      gameSession.deathFreezeEndsAt = 0
    }
    else {
      // Still frozen — skip physics + input this tick.
      return
    }
  }
  else if (retryPressed) {
    // Manual reset mid-attempt — snaps to the last checkpoint.
    respawn(state.player, state.level)
    gameSession.phase = 'gameplay'
  }

  // Track pre-tick state for landing detection
  const prevVy = state.player.vy
  const wasAirborne = !state.player.grounded

  state.now += CONFIG.FIXED_DT
  tickEphemeral(state.level, state.now)
  updateKinetics(state.level, state.player, CONFIG.FIXED_DT)
  updatePlayer(state.player, state.level, state.fx, state.broadphase, state.particles, state.now, CONFIG.FIXED_DT)

  // Pickup bob + gravitation + collection.
  tickPickups(state.pickups, CONFIG.FIXED_DT, state.player.x, state.player.y, state.player.w, state.player.h)
  for (const pk of state.pickups) {
    if (!pk.alive)
      continue
    if (pickupOverlapsPlayer(pk, state.player)) {
      const def = getItemDef(pk.kind)
      pk.alive = false
      if (def.grantsWeapon)
        state.player.currentWeapon = def.grantsWeapon
      if (def.heals)
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + def.heals)
      if (def.grantsArmor)
        state.player.armor = Math.min(100, state.player.armor + def.grantsArmor)
      if (def.grantsCoin)
        state.player.coins += def.grantsCoin
      const claimKind = def.grantsCoin ? 'coin' : def.heals ? 'health' : def.grantsArmor ? 'armor' : 'weapon'
      const tint = claimKind === 'health' ? 0x30FF50 : claimKind === 'armor' ? 0x4080FF : claimKind === 'coin' ? 0xFFD700 : 0xFFA030
      emitPickupClaim(state.particles, pk.x + pk.w / 2, pk.y + pk.h / 2, tint)
      emit('pickupClaimed', { x: pk.x + pk.w / 2, y: pk.y + pk.h / 2, kind: claimKind })
    }
  }

  // Fire + advance bullets. spawnBullet reads muzzle position + aim direction
  // from the Spineboy bridge's last-render snapshot, so bullets launch from
  // the visible gun tip along the visible aim. If the bridge hasn't snapshotted
  // yet (first-frame), fall back to AABB center + facing vector.
  if (shootPressed() && state.player.alive && !shootingDisabled(state.classics)) {
    const b = state.renderCtx.charBridge
    const muzzleX = b.muzzleReady ? b.muzzleX : state.player.x + state.player.w / 2
    const muzzleY = b.muzzleReady ? b.muzzleY : state.player.y + state.player.h / 2
    const dirX = b.muzzleReady ? b.muzzleDirX : state.player.facing
    const dirY = b.muzzleReady ? b.muzzleDirY : 0
    spawnBullet(state.bullets, state.particles, muzzleX, muzzleY, dirX, dirY, state.player.currentWeapon)
  }
  updateBullets(state.bullets, state.level, state.dummies, state.broadphase, state.particles, state.camera, state.now, CONFIG.FIXED_DT, state.specials, state.classics)

  // Stance cycle (KeyC). Hot-swap the upper-body track-1 animation + aim
  // mitigation/bias. Forward → high → low → hip → forward.
  if (stanceCyclePressed()) {
    const stance = cycleStance(state.renderCtx.charBridge)
    console.warn(`[stance] ${stance}`)
  }

  // Tick dummies (just drains their hit-flash timer — no AI).
  for (const d of state.dummies)
    updateDummy(d, CONFIG.FIXED_DT)

  // Tick all special-enemy kinds — runs after the player update so contact
  // damage reads current player position.
  updateSpecials(state.specials, state.player, state.level, state.broadphase, CONFIG.FIXED_DT, state.now)
  updateClassics(state.classics, state.player, state.level, state.broadphase, CONFIG.FIXED_DT, state.now)

  tickParticles(state.particles, CONFIG.FIXED_DT)

  // Landing impact → camera trauma + dust puff at the feet (scaled by impact vy).
  if (wasAirborne && state.player.grounded && prevVy > CONFIG.INSTABILITY_LAND_MIN_VY) {
    const impactNorm = Math.min(prevVy / CONFIG.MAX_FALL, 1)
    addTrauma(state.camera, impactNorm * 0.3)
    emitLandingDust(
      state.particles,
      state.player.x + state.player.w / 2,
      state.player.y + state.player.h,
      impactNorm,
    )
  }

  // Wall-slide sparks — 2–3 per tick along the contact side while sliding.
  if (state.player.wallSliding && state.player.wallSide !== 0) {
    const px = state.player.wallSide === -1 ? state.player.x : state.player.x + state.player.w
    emitWallSlideSparks(state.particles, px, state.player.y + state.player.h / 2, state.player.wallSide)
  }

  // Disintegration shed — at high instability the player visibly sheds
  // embers/smoke trailing off their motion. Caps naturally via emit's
  // MAX_ACTIVE. Stops during iframes so the fracture event reads cleanly
  // without being drowned in its own shed particles.
  const instabRatio = state.player.instability.value / CONFIG.INSTABILITY_MAX
  if (instabRatio > 0.55 && state.player.iframeTimer <= 0 && state.player.alive) {
    const intensity = (instabRatio - 0.55) / 0.45
    emitDisintegration(
      state.particles,
      state.player.x + state.player.w / 2,
      state.player.y + state.player.h / 2,
      state.player.vx,
      state.player.vy,
      intensity,
    )
  }

  // Update prowlers + check player contact
  for (const pr of state.prowlers) {
    updateProwler(pr, state.player, state.level, state.broadphase, CONFIG.FIXED_DT)
    checkProwlerPlayerContact(pr, state.player)
  }

  // Rupture reaction — if a rupture happened this tick, notify prowlers + kinetic elements
  if (state.player.lastRupture && state.player.iframeTimer > CONFIG.FRACTURE_IFRAMES - CONFIG.FIXED_DT * 2) {
    const r = state.player.lastRupture
    for (const pr of state.prowlers) {
      prowlerReactToRupture(pr, r.center.x, r.center.y)
    }
    kineticReactToRupture(state.level, r.center.x, r.center.y)
    // Cinematic camera trauma — fracture is the biggest event
    addTrauma(state.camera, 0.6)
  }

  if (checkLevelTransition(state))
    advanceLevel(state)

  endFrame()
}

// Main loop — fixed-step accumulator.
//
// Pixi's ticker gives us variable frame dt; we drain it into fixed 1/60 s
// physics ticks. If a frame delivers less than a full step, no update
// runs; if multiple steps fit, all run. `MAX_FRAME_DT` clamps huge frames
// (e.g. tab-backgrounded) so we don't enter the classic spiral of death.
export function startLoop(state: GameState): void {
  state.app.ticker.add((ticker) => {
    const frameDt = Math.min(ticker.deltaMS / 1000, CONFIG.MAX_FRAME_DT)
    state.accumulator += frameDt
    while (state.accumulator >= CONFIG.FIXED_DT) {
      fixedUpdate(state)
      state.accumulator -= CONFIG.FIXED_DT
    }
    tickFxRender(state.fx, frameDt)
    tickDamageNumbers(state.damageNumbers, frameDt)

    // Camera smoothing runs once per rendered frame (not per physics tick)
    // so its lerp rate stays tied to display refresh, same as the original.
    updateCamera(state.camera, state.player, state.level)
    render(state.renderCtx, state.player, state.camera, state.fx, state.level, frameDt, state.prowlers, state.bullets, state.dummies, state.broadphase, state.pickups, state.specials, state.classics)

    // Update CRT shader uniforms
    const ratio = state.player.instability.value / CONFIG.INSTABILITY_MAX
    state.crtFilter.time = state.now
    state.crtFilter.instability = ratio
    // Dread: 0 below onset, ramps to 1 at max instability
    state.crtFilter.dread = ratio > CONFIG.DREAD_ONSET
      ? (ratio - CONFIG.DREAD_ONSET) / (1 - CONFIG.DREAD_ONSET)
      : 0
  })
}
