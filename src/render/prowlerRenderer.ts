// Prowler rendering — sprite texture with instability jitter and stun flash.

import type { Graphics } from 'pixi.js'
import type { Prowler } from '../enemies/prowler'
import type { EnemySpritePool } from './enemySpritePool'
import { hideExcessSprites, positionEnemySprite } from './enemySpritePool'

export function drawProwlers(
  g: Graphics,
  prowlers: readonly Prowler[],
  time: number,
  pool: EnemySpritePool,
): void {
  g.clear()

  for (let i = 0; i < prowlers.length; i++) {
    const pr = prowlers[i]!
    if (!pr.alive) {
      positionEnemySprite(pool, i, 'prowler', pr.x, pr.y, pr.w, pr.h, false, false, 1, false, time, i)
      continue
    }

    const stunFlash = pr.stunTimer > 0 && Math.floor(time * 20) % 2 === 0
    const inst = pr.instability

    // Instability jitter offsets
    let jx = 0
    let jy = 0
    if (inst > 0.3) {
      const amp = inst * 2
      jx = (Math.random() - 0.5) * amp
      jy = (Math.random() - 0.5) * amp
    }

    positionEnemySprite(
      pool,
      i,
      'prowler',
      pr.x + jx,
      pr.y + jy,
      pr.w,
      pr.h,
      true,
      stunFlash,
      0.7 + inst * 0.3,
      pr.facing === -1,
      time,
      i,
    )
  }

  hideExcessSprites(pool, prowlers.length)
}
