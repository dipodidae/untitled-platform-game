// CRT Horror Pixel post-processing filter for PixiJS v8.
// Single-pass fragment shader: ordered dithering, scanlines, chromatic
// aberration, pixel corruption, vignette with dread pulse, film grain.

import { Filter, GlProgram } from 'pixi.js'

const VERTEX = /* glsl */ `
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

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uInstability;
uniform float uDread;
uniform vec4 uInputSize;

// ─── constants (tuned for 640×360 horror pixel art) ─────────────
// Previous values (MASK_DARK=0.72, HARD_SCAN=-10) produced muddy output:
// shadow-mask ate ~28% of luminance and scanline troughs fell to ~18%.
// Softened so the base image reads crisp; CRT look is still present.
const vec2 SOURCE_SIZE = vec2(640.0, 360.0);
const float MASK_DARK   = 0.88;
const float MASK_LIGHT  = 1.10;
const float HARD_SCAN   = -6.0;
const float SCAN_SHAPE  = 2.0;
const float CONTRAST    = 1.18;  // final-stage contrast boost around 0.5

// ─── helpers ─────────────────────────────────────────────────────
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// 4x4 Bayer dither matrix (0..15 / 16) — no array constructor for GLSL ES compat
float bayer4(vec2 pos) {
  int px = int(mod(pos.x, 4.0));
  int py = int(mod(pos.y, 4.0));
  int idx = px + py * 4;
  // Unrolled lookup to avoid array initializer + dynamic indexing
  if (idx ==  0) return  0.0 / 16.0;
  if (idx ==  1) return  8.0 / 16.0;
  if (idx ==  2) return  2.0 / 16.0;
  if (idx ==  3) return 10.0 / 16.0;
  if (idx ==  4) return 12.0 / 16.0;
  if (idx ==  5) return  4.0 / 16.0;
  if (idx ==  6) return 14.0 / 16.0;
  if (idx ==  7) return  6.0 / 16.0;
  if (idx ==  8) return  3.0 / 16.0;
  if (idx ==  9) return 11.0 / 16.0;
  if (idx == 10) return  1.0 / 16.0;
  if (idx == 11) return  9.0 / 16.0;
  if (idx == 12) return 15.0 / 16.0;
  if (idx == 13) return  7.0 / 16.0;
  if (idx == 14) return 13.0 / 16.0;
  return 5.0 / 16.0;
}

// Lottes shadow mask type 3 — Stretched VGA (crt-lottes lines 231–239)
vec3 shadowMask(vec2 pos) {
  vec3 m = vec3(MASK_DARK);
  pos.x += pos.y * 3.0;
  pos.x  = fract(pos.x * 0.166666666);
  if      (pos.x < 0.333) m.r = MASK_LIGHT;
  else if (pos.x < 0.666) m.g = MASK_LIGHT;
  else                     m.b = MASK_LIGHT;
  return m;
}

void main(void) {
  // ─── 1. UV (no barrel distortion) ────────────────────────────
  vec2 uv = vTextureCoord;

  // ─── 2. horizontal band displacement ("tape tear") ────────────
  float bandCA = 1.0;

  if (uInstability > 0.4) {
    float bandSize = 8.0;
    float band = floor(uv.y * SOURCE_SIZE.y / bandSize);
    float bandHash = hash(vec2(band, floor(uTime * 6.0)));
    float displaceThreshold = 1.0 - (uInstability - 0.4) * 0.18;

    if (bandHash > displaceThreshold) {
      float displaceAmount = (bandHash - displaceThreshold) * 12.0;
      uv.x += displaceAmount / SOURCE_SIZE.x;
      bandCA = 2.0;
    }
  }

  // ─── 3. chromatic aberration + sample ─────────────────────────
  float caScale = (1.0 + uInstability * 3.0) * bandCA;
  vec2 caOffsetR = vec2( 0.0008, 0.0) * caScale;
  vec2 caOffsetB = vec2(-0.0008, 0.0) * caScale;

  if (uInstability > 0.7) {
    float vPulse = sin(uTime * 17.0) * 0.001 * uInstability;
    caOffsetR.y += vPulse;
    caOffsetB.y -= vPulse;
  }

  float r = texture(uTexture, uv + caOffsetR).r;
  float g = texture(uTexture, uv).g;
  float b = texture(uTexture, uv + caOffsetB).b;
  float a = texture(uTexture, uv).a;
  vec3 color = vec3(r, g, b);

  // ─── 4. Lottes Gaussian scanline weight ───────────────────────
  float scanDist = fract(uv.y * SOURCE_SIZE.y) - 0.5;
  float scanWeight = exp2(HARD_SCAN * pow(abs(scanDist), SCAN_SHAPE));
  color *= scanWeight;

  // ─── 5. ordered dithering on dark areas (logical coords) ─────
  vec2 logicalCoord = floor(uv * SOURCE_SIZE);
  float lum = luminance(color);
  if (lum < 0.15) {
    float threshold = bayer4(logicalCoord);
    threshold += 0.02 * sin(uTime * 3.0);
    float dither = step(threshold, lum / 0.15);
    color *= mix(0.5, 1.0, dither);
  }

  // ─── 6. per-pixel hash corruption ────────────────────────────
  // Decaying-phosphor stains rather than flat ERROR-red blocks. Two oxblood
  // tones varied per-block, blended OVER the underlying pixel so the world
  // still reads through them. Intensity ramps with how far the hash exceeds
  // the threshold, so rare strong stains sit beside faint ones.
  if (uInstability > 0.5) {
    vec2 blockCoord = floor(uv * vec2(160.0, 90.0));
    float corruptHash = fract(sin(dot(blockCoord, vec2(127.1, 311.7))) * 43758.5);
    float corruptThreshold = 1.0 - (uInstability - 0.5) * 0.012;
    if (corruptHash > corruptThreshold) {
      float intensity = (corruptHash - corruptThreshold) / max(1.0 - corruptThreshold, 0.0001);
      vec3 oxblood = vec3(0.42, 0.05, 0.03);
      vec3 wine    = vec3(0.60, 0.12, 0.06);
      vec3 stain   = mix(oxblood, wine, fract(corruptHash * 7.3));
      float strength = 0.45 + 0.35 * intensity;
      color = mix(color, stain, strength);
    }
  }

  // ─── 7. macro-block corruption ────────────────────────────────
  if (uInstability > 0.65) {
    vec2 blockCoord7 = floor(uv * SOURCE_SIZE / 8.0);
    float blockHash = hash(blockCoord7 + floor(uTime * 2.0));
    float blockThreshold = 1.0 - (uInstability - 0.65) * 0.12;
    if (blockHash > blockThreshold) {
      vec2 blockShift = vec2(
        fract(blockHash * 7.3) * 0.08 - 0.04,
        fract(blockHash * 3.7) * 0.04 - 0.02
      );
      color = texture(uTexture, uv + blockShift).rgb;
    }
  }

  // ─── 8. shadow mask (instability dissolves it) ────────────────
  float maskStrength = 1.0 - uInstability * 0.85;
  vec3 lottesMask = shadowMask(gl_FragCoord.xy);
  vec3 finalMask = mix(vec3(1.0), lottesMask, maskStrength);
  color *= finalMask;

  // ─── 9. vignette ─────────────────────────────────────────────
  // Pushed darkening outward so the play area stays bright; only the very
  // edges carry vignette.
  vec2 vigUV = (vTextureCoord - 0.5) * vec2(1.6, 1.0);
  float vig = 1.0 - smoothstep(0.6, 1.25, length(vigUV));
  color *= vig;

  // ─── 10. dread red pulse ─────────────────────────────────────
  if (uDread > 0.0) {
    float outerRing = 1.0 - vig;
    float pulse = abs(sin(uTime * (3.0 + uDread * 8.0)));
    vec3 dreadColor = vec3(0.4, 0.0, 0.0) * uDread * pulse * outerRing;
    color += dreadColor;
  }

  // ─── 11. film grain ──────────────────────────────────────────
  float grain = (hash(vTextureCoord + fract(uTime)) - 0.5) * 0.035;
  color += grain;

  // ─── 12. contrast pass — pivot on 0.5 for sharpness ──────────
  color = (color - 0.5) * CONTRAST + 0.5;

  // ─── 13. output ──────────────────────────────────────────────
  finalColor = vec4(color, a);
}
`

export class CRTFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
    })

    super({
      glProgram,
      resources: {
        crtUniforms: {
          uTime: { value: 0, type: 'f32' },
          uInstability: { value: 0, type: 'f32' },
          uDread: { value: 0, type: 'f32' },
        },
      },
    })
  }

  get time(): number {
    return this.resources.crtUniforms.uniforms.uTime
  }

  set time(v: number) {
    this.resources.crtUniforms.uniforms.uTime = v
  }

  get instability(): number {
    return this.resources.crtUniforms.uniforms.uInstability
  }

  set instability(v: number) {
    this.resources.crtUniforms.uniforms.uInstability = v
  }

  get dread(): number {
    return this.resources.crtUniforms.uniforms.uDread
  }

  set dread(v: number) {
    this.resources.crtUniforms.uniforms.uDread = v
  }
}
