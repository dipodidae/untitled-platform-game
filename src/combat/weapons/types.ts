// Shared weapon/projectile types. Each weapon profile (slug, bigShot, …)
// lives in its own file in src/weapons/ and exports a `BulletKind` value.
// The registry in src/weapons/index.ts collects them and declares
// `BulletKindName` as the union of registry keys.

export interface BulletKind {
  speed: number // px/s — initial velocity magnitude along aim direction
  gravity: number // px/s² — downward acceleration on vy
  lifeSec: number
  size: number // AABB half-extent for hit tests
  ruptureRadius: number
  damage: number
  coreColor: number // tracer core
  haloColor: number // tracer halo
  fireCooldownSec: number
}
