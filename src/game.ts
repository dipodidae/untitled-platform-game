import type { Application } from 'pixi.js'
import type { Camera } from './camera'
import type { FxState } from './fx'
import type { Level } from './level'
import type { Player } from './player'
import type { RenderContext } from './render'
import { createCamera, updateCamera } from './camera'
import { CONFIG } from './config'
import { consumeHitstopTick, createFxState, tickFxRender, tickParticlesPhysics } from './fx'
import { endFrame, respawnPressed } from './input'
import { createLevel } from './level'
import { createPlayer, respawn, updatePlayer } from './player'
import { buildScene, render } from './render'

export interface GameState {
  readonly app: Application
  readonly level: Level
  readonly player: Player
  readonly camera: Camera
  readonly renderCtx: RenderContext
  readonly fx: FxState
  accumulator: number
}

export function createGame(app: Application): GameState {
  const level = createLevel()
  const player = createPlayer(level)
  const camera = createCamera(player)
  const fx = createFxState()
  const renderCtx = buildScene(app, level)
  return { app, level, player, camera, renderCtx, fx, accumulator: 0 }
}

// One fixed physics step. Hitstop short-circuits the step so the detonation
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
    // (shake if hazard-killed mid-blast, etc.) already rendered.
    respawn(state.player, state.level)
  }
  else if (respawnPressed()) {
    // Manual reset — useful while iterating on the map.
    respawn(state.player, state.level)
  }

  updatePlayer(state.player, state.level, state.fx, CONFIG.FIXED_DT)
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
  })
}
