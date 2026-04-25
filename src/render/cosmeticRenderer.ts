// Cosmetic renderer — draws non-colliding decoration behind and (optionally)
// in front of the gameplay plane. All cosmetics are purely visual; they never
// interact with physics, enemies, or player.
//
// Scene graph insertion:
//   bgContainer:  parallax sprites (replace procedural silhouettes when present)
//   worldContainer: prop sprites (behind wind, behind colliders)

import type { Level } from '../world/level'
import type { CosmeticData, PropDef } from './cosmeticAssets'
import { Container, Filter, GlProgram, Sprite, TilingSprite } from 'pixi.js'
import { CONFIG } from '../config'

export interface CosmeticState {
  parallaxContainer: Container
  parallaxSprites: { sprite: TilingSprite | Sprite, depth: number, yDepth: number, baseY: number }[]
  propContainer: Container
  waveFilter: WaveFilter | null
}

// Seeded RNG matching parallax.ts style
function makeRng(seed: number): () => number {
  let s = seed | 0x1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1_000_003) / 1_000_003
  }
}

// ─── Subtle wave distortion filter ──────────────────────────────────
// UV-space sine wobble applied to the prop container. Very gentle —
// reads as heat-haze / ambient shimmer, not underwater.

const WAVE_VERT = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`

const WAVE_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec4 uInputSize;
void main(void) {
  vec2 uv = vTextureCoord;
  // Horizontal wave — subtle sine distortion
  float wave = sin(uv.y * 18.0 + uTime * 1.4) * 0.0015
             + sin(uv.y * 7.0  - uTime * 0.9) * 0.001;
  uv.x += wave;
  // Vertical shimmer — even subtler
  uv.y += sin(uv.x * 12.0 + uTime * 1.1) * 0.001;
  finalColor = texture(uTexture, uv);
}
`

class WaveFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({
      vertex: WAVE_VERT,
      fragment: WAVE_FRAG,
    })
    super({ glProgram, resources: { waveUniforms: { uTime: { value: 0, type: 'f32' } } } })
  }

  get time(): number {
    return (this.resources as any).waveUniforms.uniforms.uTime as number
  }

  set time(v: number) {
    ;(this.resources as any).waveUniforms.uniforms.uTime = v
  }
}

export function createCosmeticState(): CosmeticState {
  return {
    parallaxContainer: new Container(),
    parallaxSprites: [],
    propContainer: new Container(),
    waveFilter: null,
  }
}

export function populateCosmetics(
  state: CosmeticState,
  data: CosmeticData,
  level: Level,
): void {
  // Clear previous
  state.parallaxContainer.removeChildren()
  state.parallaxSprites.length = 0
  state.propContainer.removeChildren()
  state.waveFilter = null
  state.propContainer.filters = []

  const screenW = CONFIG.LOGICAL_WIDTH
  const screenH = CONFIG.LOGICAL_HEIGHT

  // ─── Parallax layers ───────────────────────────────────────────
  for (const layer of data.parallax) {
    // Use TilingSprite so the layer repeats horizontally as the camera pans
    const tw = layer.texture.width
    const th = layer.texture.height
    if (tw === 0 || th === 0)
      continue

    // Scale the texture to fit screen height from baseY to bottom
    const visibleH = screenH * (1 - layer.baseY)
    const scale = visibleH / th
    const tiledW = screenW * 3 // wide enough to never see the edge

    const ts = new TilingSprite({
      texture: layer.texture,
      width: tiledW / scale,
      height: th,
    })
    ts.scale.set(scale)
    ts.y = screenH * layer.baseY

    state.parallaxContainer.addChild(ts)
    state.parallaxSprites.push({
      sprite: ts,
      depth: layer.depth,
      yDepth: layer.yDepth,
      baseY: screenH * layer.baseY,
    })
  }

  // ─── Background props ──────────────────────────────────────────
  if (data.props.length > 0 && data.propDensity > 0) {
    const rng = makeRng(data.propScatterSeed)

    // Find the topmost surface Y from colliders so props sit on the
    // actual floor, not at worldHeight (which is below the ground).
    let floorY = level.worldHeight
    for (const c of level.colliders) {
      for (const v of c.vertices) {
        if (v.y < floorY)
          floorY = v.y
      }
    }

    // Scatter props along the world width.
    // density = probability per 30px slot → high density fills the floor.
    const worldW = level.worldWidth
    const step = 30
    const count = Math.floor(worldW / step)

    for (let i = 0; i < count; i++) {
      if (rng() > data.propDensity)
        continue

      const propDef: PropDef = data.props[Math.floor(rng() * data.props.length)]!
      const s = new Sprite(propDef.texture)
      s.anchor.set(propDef.anchor[0], propDef.anchor[1])

      // Position: random x within this slot, y just above the floor
      s.x = i * step + rng() * step
      s.y = floorY - 1 + rng() * 3

      // Scale variation — keep props small as background decals
      const baseScale = 0.2 + rng() * 0.25
      s.scale.set(baseScale)

      // Varied alpha for depth layering
      s.alpha = 0.3 + rng() * 0.4

      state.propContainer.addChild(s)
    }

    // Apply wave distortion filter to the whole prop layer
    const wave = new WaveFilter()
    state.waveFilter = wave
    state.propContainer.filters = [wave]
  }
}

export function updateCosmetics(
  state: CosmeticState,
  cameraX: number,
  cameraY: number,
  time: number,
): void {
  // Parallax
  for (const layer of state.parallaxSprites) {
    if (layer.sprite instanceof TilingSprite) {
      layer.sprite.tilePosition.x = -cameraX * layer.depth
    }
    else {
      layer.sprite.x = -cameraX * layer.depth
    }
    layer.sprite.y = layer.baseY - cameraY * layer.yDepth
  }

  // Drive wave distortion filter
  if (state.waveFilter)
    state.waveFilter.time = time
}

export function teardownCosmetics(state: CosmeticState): void {
  state.parallaxContainer.removeChildren()
  state.parallaxSprites.length = 0
  state.propContainer.removeChildren()
  state.propContainer.filters = []
  state.waveFilter = null
}
