import type { Application } from 'pixi.js'
import type { Camera } from './camera'
import type { FxState } from './fx'
import type { Player } from './player'
import type { RenderContext } from './render'
import type { Level } from './world/level'
import { createCamera, updateCamera } from './camera'
import { CONFIG } from './config'
import { consumeHitstopTick, createFxState, tickFxRender, tickParticlesPhysics } from './fx'
import { endFrame, respawnPressed } from './input'
import { BroadphaseGrid } from './physics'
import { createPlayer, respawn, updatePlayer } from './player'
import { buildScene, render } from './render'
import { CRTFilter } from './render/CRTFilter'
import { fromJson, type LevelJson, tickEphemeral } from './world/level'
import showcaseJson from './levels/showcase.json'

export interface GameState {
  readonly app: Application
  readonly level: Level
  readonly player: Player
  readonly camera: Camera
  readonly renderCtx: RenderContext
  readonly fx: FxState
  readonly broadphase: BroadphaseGrid
  readonly crtFilter: CRTFilter
  accumulator: number
  // Continuous game time (seconds). Drives shard TTLs and any other
  // wall-clock-like timers that need a consistent reading across ticks.
  now: number
}

export function createGame(app: Application): GameState {
  const level = fromJson(showcaseJson as LevelJson)
  const player = createPlayer(level)
  const camera = createCamera(player)
  const fx = createFxState()
  const broadphase = new BroadphaseGrid()
  const renderCtx = buildScene(app, level)
  const crtFilter = new CRTFilter()
  app.stage.filters = [crtFilter]
  return { app, level, player, camera, renderCtx, fx, broadphase, crtFilter, accumulator: 0, now: 0 }
}

// One fixed physics step. Hitstop short-circuits the step so the fracture
// visually "lands" — shake and flash keep animating on render cadence
// regardless. Input edges are latched at the end of the step.
function fixedUpdate(state: GameState): void {
  if (consumeHitstopTick(state.fx)) {
    // Frozen physics — nothing moves, no input latching either so buffered
    // presses during hitstop arrive on the first live tick after.
    return
  }

  if (!state.player.alive) {
    // Automatic respawn on the tick after death — the death tick's visuals
    // (shake if hazard-killed mid-rupture, etc.) already rendered.
    respawn(state.player, state.level)
  }
  else if (respawnPressed()) {
    // Manual reset — useful while iterating on the map.
    respawn(state.player, state.level)
  }

  state.now += CONFIG.FIXED_DT
  tickEphemeral(state.level, state.now)
  updatePlayer(state.player, state.level, state.fx, state.broadphase, state.now, CONFIG.FIXED_DT)
  tickParticlesPhysics(state.fx, CONFIG.FIXED_DT)
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

    // Camera smoothing runs once per rendered frame (not per physics tick)
    // so its lerp rate stays tied to display refresh, same as the original.
    updateCamera(state.camera, state.player, state.level)
    render(state.renderCtx, state.player, state.camera, state.fx, state.level, frameDt)

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
