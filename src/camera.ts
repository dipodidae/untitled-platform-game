import type { Level } from './level'
import type { Player } from './player'
import { CONFIG } from './config'

export interface Camera {
  x: number
  y: number
}

export function createCamera(player: Player): Camera {
  // Frame the player on first render so the initial draw isn't at (0,0).
  return {
    x: player.x + player.w / 2 - CONFIG.LOGICAL_WIDTH / 2,
    y: player.y + player.h / 2 - CONFIG.LOGICAL_HEIGHT / 2,
  }
}

// Smooth follow with a center deadzone. The camera only starts chasing when
// the player leaves the deadzone; inside it, the camera holds still, which
// prevents jumps from yo-yoing the view.
export function updateCamera(camera: Camera, player: Player, level: Level): void {
  const halfW = CONFIG.LOGICAL_WIDTH / 2
  const halfH = CONFIG.LOGICAL_HEIGHT / 2
  const px = player.x + player.w / 2
  const py = player.y + player.h / 2

  // Player position in camera space
  const sx = px - camera.x
  const sy = py - camera.y
  const dzw = CONFIG.CAM_DEADZONE_W / 2
  const dzh = CONFIG.CAM_DEADZONE_H / 2

  let targetX = camera.x
  let targetY = camera.y
  if (sx < halfW - dzw)
    targetX = px - (halfW - dzw)
  else if (sx > halfW + dzw)
    targetX = px - (halfW + dzw)
  if (sy < halfH - dzh)
    targetY = py - (halfH - dzh)
  else if (sy > halfH + dzh)
    targetY = py - (halfH + dzh)

  camera.x += (targetX - camera.x) * CONFIG.CAM_LERP
  camera.y += (targetY - camera.y) * CONFIG.CAM_LERP

  // Clamp to world bounds so we never show out-of-bounds.
  const worldW = level.width * CONFIG.TILE_SIZE
  const worldH = level.height * CONFIG.TILE_SIZE
  camera.x = Math.max(0, Math.min(camera.x, Math.max(0, worldW - CONFIG.LOGICAL_WIDTH)))
  camera.y = Math.max(0, Math.min(camera.y, Math.max(0, worldH - CONFIG.LOGICAL_HEIGHT)))
}
