// CRT Horror Pixel post-processing filter for PixiJS v8.
// Single-pass fragment shader: ordered dithering, scanlines, chromatic
// aberration, vignette, film grain.

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

  // ─── 2. chromatic aberration + sample ─────────────────────────
  vec2 caOffsetR = vec2( 0.0008, 0.0);
  vec2 caOffsetB = vec2(-0.0008, 0.0);

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

  // ─── 6. shadow mask ───────────────────────────────────────────
  vec3 lottesMask = shadowMask(gl_FragCoord.xy);
  color *= lottesMask;

  // ─── 9. vignette ─────────────────────────────────────────────
  // Pushed darkening outward so the play area stays bright; only the very
  // edges carry vignette.
  vec2 vigUV = (vTextureCoord - 0.5) * vec2(1.6, 1.0);
  float vig = 1.0 - smoothstep(0.6, 1.25, length(vigUV));
  color *= vig;

  // ─── 10. film grain ──────────────────────────────────────────
  float grain = (hash(vTextureCoord + fract(uTime)) - 0.5) * 0.035;
  color += grain;

  // ─── 11. contrast pass — pivot on 0.5 for sharpness ──────────
  color = (color - 0.5) * CONTRAST + 0.5;

  // ─── 12. output ──────────────────────────────────────────────
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

}
