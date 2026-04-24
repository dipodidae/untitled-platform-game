# Context: shared-kernel

**Path:** `src/shared-kernel/`
**One-line purpose:** Universal geometric primitives (Vec2 and Polygon) used across physics, world, render, and editor — the only code that is truly context-free.

## What this context owns

- `vec2.ts` — `Vec2` interface (`{ x, y }`); `v2`, `add`, `sub`, `scale`, `dot`, `cross`, `length`, `normalize`, `perp`. All functions return new values — no mutation.
- `polygon.ts` — `Polygon` type alias (`Vec2[]`); `signedArea`, `area`, `centroid`, `bounds`; `decompose` (convex decomposition via `poly-decomp-es`); `polygonDifference` (boolean subtraction via `polygon-clipping`); `circleToPolygon` (discretized ellipse for rupture clipping).

## What it does NOT own (and where to look)

- AABB type — `src/physics/sat.ts` (`AABB` — four-field struct, not a polygon)
- Physics collision logic — `src/physics/`
- World geometry and materials — `src/world/`
- Editor polygon editing helpers (`rotatePolygon`, `polygonCenter`, etc.) — `src/editor/state.ts` (editor-only; not eligible for the kernel per ADR-0010)

## Public surface

```ts
// vec2.ts
export interface Vec2 { x: number, y: number }
export function v2(x, y): Vec2
export function add(a, b): Vec2
export function sub(a, b): Vec2
export function scale(a, s): Vec2
export function dot(a, b): number
export function cross(a, b): number
export function length(a): number
export function normalize(a): Vec2
export function perp(a): Vec2

// polygon.ts
export type Polygon = Vec2[]
export function signedArea(poly): number
export function area(poly): number
export function centroid(poly): Vec2
export function bounds(poly): { minX, minY, maxX, maxY }
export function decompose(poly): Polygon[]           // convex decomposition (CCW enforced)
export function polygonDifference(subject, clips): Polygon[]   // boolean subtraction
export function circleToPolygon(cx, cy, rx, ry, angle): Polygon
```

## External dependencies

- Pixi v8 modules used: none
- Other contexts: none
- Third-party libraries:
  - `poly-decomp-es` — `makeCCW`, `quickDecomp` (used by `decompose`)
  - `polygon-clipping` — boolean polygon ops (used by `polygonDifference`)

## Invariants / rules

- Per ADR-0010: **only universally-needed geometric primitives go here.** No game-specific types (no `MaterialName`, no entity IDs, no timestamps, no config references). If a helper is only needed by one context, it lives in that context.
- `Vec2` is a plain `{ x, y }` object — no class, no prototype. Vectors are immutable by convention; all operations return new values.
- `decompose` enforces CCW winding before decomposing via `makeCCW`. The SAT implementation (`src/physics/sat.ts`) depends on CCW polygons to correctly compute outward normals.
- `polygonDifference` returns an array of remaining polygons (the subject with the clips removed). An empty array means the subject was fully consumed. `applyRupture` in `src/world/destruction.ts` relies on this contract.
- `circleToPolygon` generates a 16-sided polygon approximation of a (rotated) ellipse. It is used exclusively by `destruction.ts` to build the rupture clip shape.
- `bounds` is used by `world/level.ts` (`computeColliderBounds`) on every collider build and refresh — it must remain fast (single pass, no allocation beyond the return object).

## Why this context exists as its own thing

Vec2 and Polygon are needed by at least four separate contexts (`physics`, `world`, `render`, `editor`) with no mutual dependencies between them. Without the shared kernel, each context would either duplicate the type definitions or import from an unrelated context, creating false coupling. Per ADR-0010, the kernel is kept intentionally narrow — only types and functions that are genuinely universal. This prevents it from becoming a grab-bag that every context pulls from for unrelated reasons.
