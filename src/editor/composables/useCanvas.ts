// Editor canvas composable — Pixi-based scene. Renders the world at the editor
// camera's zoom/pan so we can edit BIG levels without cramped viewports.
// World-space coordinates match the runtime level JSON (Y-down).
//
// Input handling:
//   - Left-drag on empty canvas with space held → pan. Middle-drag also pans.
//   - Wheel → zoom around the mouse cursor.
//   - Left-click a collider → select.
//   - Left-drag selected collider → move.
//   - Select-tool + Delete/Backspace → remove selection.
//   - Polygon tool: click to add points, Enter/double-click to finish.
//   - Rect tool: drag to draw.
//   - Spawn/prowler/dummy/pickup/zone tools: click or drag to place.

import type { ItemKind } from '../../shared-kernel/types'
import type { KineticJson } from '../../world/kinetic'
import type { EditorCollider, Tool, useEditorStore } from '../stores/editor'
import { storeToRefs } from 'pinia'
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { watchEffect } from 'vue'
import { polygonBounds, polygonCenter, rotatePolygon, scalePolygon, snap } from '../geometry'

const PICKUP_COLORS: Record<string, number> = {
  coin: 0xFFD700,
  platinumCoin: 0xC0C0E0,
  crown: 0xFFE880,
  healthPack: 0x30FF50,
  armorShard: 0x4080FF,
  bigShot: 0xFFA030,
}

const ZONE_COLORS: Record<string, number> = {
  gravity: 0x5080FF,
  wind: 0x60E0C0,
  hazard: 0xE04040,
  trigger: 0xE0C040,
  goal: 0xFFD040,
  spawnPoint: 0x40C0FF,
}

// Scale handle layout — 8 screen-space boxes at the bbox corners + edge
// midpoints of the selected collider. Handle kind encodes which edges to
// drag. Corners scale both axes; edges scale a single axis.
type HandleKind = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLE_KINDS: HandleKind[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const HANDLE_SIZE_PX = 8

const MATERIAL_COLORS: Record<string, { fill: number, stroke: number }> = {
  bone: { fill: 0xC8B080, stroke: 0x5A4228 },
  bone_fragile: { fill: 0xA08050, stroke: 0x4A3218 },
  glass: { fill: 0x7AC5D8, stroke: 0x2A4A58 },
  resonant: { fill: 0xC070C0, stroke: 0x603060 },
  soft: { fill: 0x8A6EC0, stroke: 0x3A2A60 },
  shard: { fill: 0x883838, stroke: 0x3A1010 },
}

// How far (in screen pixels) a vertex handle extends. Independent of zoom.
const VERTEX_HANDLE_PX = 5

// ─── motion preview (hold G) ───────────────────────────────────────────────

interface MotionPreviewEntry {
  collIdx: number
  originalVerts: [number, number][]
  t: number // seconds elapsed in preview
}

// NOTE: these are module-level (singleton) vars. That is intentional and fine
// as long as only one editor canvas instance is mounted at a time. If useCanvas
// is ever invoked twice concurrently they would conflict.
let motionPreviewActive = false
let motionPreviewLastTime = 0
let motionPreviewScratch: MotionPreviewEntry[] = []

function computePreviewVerts(
  base: [number, number][],
  k: KineticJson,
  t: number,
): [number, number][] {
  switch (k.type) {
    case 'rotor': {
      const { cx, cy } = polygonCenter(base)
      const speed = k.speed ?? 0.4
      const angle = speed * t
      return rotatePolygon(base, cx, cy, angle)
    }
    case 'breather': {
      const amp = k.amplitude ?? 2
      const freq = k.frequency ?? 0.6
      const dy = Math.sin(t * Math.PI * 2 * freq) * amp
      return base.map(([x, y]) => [x, y + dy] as [number, number])
    }
    case 'spring': {
      const stiffness = k.stiffness ?? 180
      const damping = k.damping ?? 8
      const omega = Math.sqrt(stiffness)
      const decay = Math.exp(-damping * t * 0.05)
      const dy = Math.sin(omega * t) * 8 * decay
      return base.map(([x, y]) => [x, y + dy] as [number, number])
    }
    case 'linear': {
      const path = k.path
      const speed = k.speed ?? 40
      const mode = k.mode ?? 'pingpong'
      if (!path || path.length < 2)
        return base
      const segs: { len: number, dx: number, dy: number }[] = []
      let totalLen = 0
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i]!
        const b = path[i + 1]!
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const len = Math.hypot(dx, dy)
        segs.push({ len, dx, dy })
        totalLen += len
      }
      if (totalLen < 0.001)
        return base
      let dist = (speed * t) % (mode === 'pingpong' ? totalLen * 2 : totalLen)
      if (mode === 'pingpong' && dist > totalLen)
        dist = totalLen * 2 - dist
      let accum = 0
      let offX = path[0]![0]
      let offY = path[0]![1]
      for (const seg of segs) {
        if (accum + seg.len >= dist) {
          const f = (dist - accum) / seg.len
          offX += seg.dx * f
          offY += seg.dy * f
          break
        }
        accum += seg.len
        offX += seg.dx
        offY += seg.dy
      }
      const firstDx = path[0]![0]
      const firstDy = path[0]![1]
      return base.map(([x, y]) => [x + offX - firstDx, y + offY - firstDy] as [number, number])
    }
  }
}

// ─── store accessor bundle ─────────────────────────────────────────────────
// We use storeToRefs so that in plain .ts (non-SFC) context we can read and
// write reactive refs with explicit .value. The store actions (pushUndo,
// allocId, undo, redo) are accessed directly on the store object.

type Store = ReturnType<typeof useEditorStore>
type StoreRefs = ReturnType<typeof storeToRefs<Store>>

interface CanvasStore {
  store: Store
  refs: StoreRefs
}

export interface CanvasCtx {
  app: Application
  cs: CanvasStore
  worldContainer: Container
  gridGfx: Graphics
  bgGfx: Graphics
  colliderGfx: Graphics
  selectionGfx: Graphics
  markersGfx: Graphics
  ghostGfx: Graphics // in-progress polygon + cursor
  previewGfx: Graphics // ghost placement previews (entity/zone hover)
  vertexGfx: Graphics
  pickupSpriteContainer: Container
  pickupSpritePool: Sprite[]
  itemTextures: Map<string, Texture>
  cursorText: Text
  mouseWorld: { x: number, y: number }
  cursorInCanvas: boolean
  spaceHeld: boolean
  dragging: { kind: 'pan' | 'collider' | 'rect' | 'vertex' | 'scale' | 'zone-rect' | 'zone-move' | 'rotate-gizmo', startX: number, startY: number, state0: unknown } | null
  frameWorldViewport: () => void
  /** Remove the global window keydown/keyup listeners wired by wireInput. */
  dispose: () => void
}

export async function useCanvas(
  host: HTMLElement,
  store: Store,
): Promise<CanvasCtx> {
  const refs = storeToRefs(store)
  const cs: CanvasStore = { store, refs }

  const app = new Application()
  await app.init({
    background: '#0a0b0f',
    resizeTo: host,
    antialias: true,
    resolution: window.devicePixelRatio ?? 1,
    autoDensity: true,
  })
  host.appendChild(app.canvas)

  const worldContainer = new Container()
  app.stage.addChild(worldContainer)

  const bgGfx = new Graphics()
  const gridGfx = new Graphics()
  const colliderGfx = new Graphics()
  const markersGfx = new Graphics()
  const selectionGfx = new Graphics()
  const ghostGfx = new Graphics()
  const previewGfx = new Graphics()
  const vertexGfx = new Graphics()
  const pickupSpriteContainer = new Container()
  const pickupSpritePool: Sprite[] = []
  worldContainer.addChild(bgGfx, gridGfx, colliderGfx, markersGfx, pickupSpriteContainer, selectionGfx, ghostGfx, previewGfx, vertexGfx)

  // Pre-load item sprites for canvas rendering.
  const ITEM_KINDS: ItemKind[] = ['coin', 'platinumCoin', 'crown', 'healthPack', 'armorShard', 'bigShot']
  const itemTextures = new Map<string, Texture>()
  for (const kind of ITEM_KINDS) {
    try {
      const tex = await Assets.load<Texture>(`/assets/items/${kind}.png`)
      itemTextures.set(kind, tex)
    }
    catch { /* sprite missing — will fall back to circle */ }
  }

  const cursorText = new Text({
    text: '',
    style: { fontFamily: 'monospace', fontSize: 11, fill: 0x80E0FF },
  })
  app.stage.addChild(cursorText)

  const ctx: CanvasCtx = {
    app,
    cs,
    worldContainer,
    gridGfx,
    bgGfx,
    colliderGfx,
    selectionGfx,
    markersGfx,
    ghostGfx,
    previewGfx,
    vertexGfx,
    pickupSpriteContainer,
    pickupSpritePool,
    itemTextures,
    cursorText,
    mouseWorld: { x: 0, y: 0 },
    cursorInCanvas: false,
    spaceHeld: false,
    dragging: null,
    frameWorldViewport: () => frameWorld(ctx),
    dispose: () => {}, // filled in by wireInput below
  }

  // Replace state.listeners.add(() => redraw(ctx)) with Vue watchEffect.
  // watchEffect auto-tracks any .value reads inside redraw.
  watchEffect(() => redraw(ctx))

  ctx.dispose = wireInput(ctx)
  app.ticker.add(() => {
    applyCamera(ctx)
    tickMotionPreview(cs)
  })
  return ctx
}

function tickMotionPreview(cs: CanvasStore): void {
  if (!motionPreviewActive)
    return
  const now = performance.now()
  const dt = Math.min(0.05, (now - motionPreviewLastTime) / 1000)
  motionPreviewLastTime = now
  for (const entry of motionPreviewScratch) {
    entry.t += dt
    const c = cs.refs.level.value.colliders[entry.collIdx]
    if (!c || !c.kinetic)
      continue
    c.vertices = computePreviewVerts(entry.originalVerts, c.kinetic, entry.t)
  }
  // Vue reactivity picks up the mutation automatically — no markDirty needed.
}

function applyCamera(ctx: CanvasCtx): void {
  const camera = ctx.cs.refs.camera.value
  ctx.worldContainer.scale.set(camera.zoom)
  ctx.worldContainer.x = -camera.x * camera.zoom + ctx.app.screen.width / 2
  ctx.worldContainer.y = -camera.y * camera.zoom + ctx.app.screen.height / 2
}

function screenToWorld(ctx: CanvasCtx, sx: number, sy: number): { x: number, y: number } {
  const camera = ctx.cs.refs.camera.value
  return {
    x: (sx - ctx.app.screen.width / 2) / camera.zoom + camera.x,
    y: (sy - ctx.app.screen.height / 2) / camera.zoom + camera.y,
  }
}

// ─── drawing ──────────────────────────────────────────────────────────────

function redraw(ctx: CanvasCtx): void {
  const { bgGfx, gridGfx, colliderGfx, selectionGfx, markersGfx, ghostGfx, previewGfx, vertexGfx, pickupSpriteContainer, pickupSpritePool, itemTextures } = ctx
  const { refs } = ctx.cs
  const level = refs.level.value
  const camera = refs.camera.value
  const layers = refs.layers.value
  const snapStep = refs.snapStep.value

  // Background = world bounds.
  bgGfx.clear()
  bgGfx.rect(0, 0, level.worldWidth, level.worldHeight).fill({ color: 0x161820 })
  bgGfx.rect(0, 0, level.worldWidth, level.worldHeight).stroke({ width: 2 / camera.zoom, color: 0x404858 })

  // Grid.
  gridGfx.clear()
  if (layers.grid) {
    const step = snapStep > 0 ? snapStep : 40
    const majorStep = step * 5
    const strokeMinor = { width: 1 / camera.zoom, color: 0x252A33, alpha: 0.6 }
    const strokeMajor = { width: 1 / camera.zoom, color: 0x3C4250, alpha: 0.9 }
    for (let x = 0; x <= level.worldWidth; x += step) {
      gridGfx.moveTo(x, 0).lineTo(x, level.worldHeight).stroke(x % majorStep === 0 ? strokeMajor : strokeMinor)
    }
    for (let y = 0; y <= level.worldHeight; y += step) {
      gridGfx.moveTo(0, y).lineTo(level.worldWidth, y).stroke(y % majorStep === 0 ? strokeMajor : strokeMinor)
    }
  }

  // Colliders.
  colliderGfx.clear()
  if (layers.colliders) {
    for (const c of level.colliders) {
      const col = MATERIAL_COLORS[c.material] ?? MATERIAL_COLORS.bone!
      const verts = c.vertices
      if (verts.length < 2)
        continue
      colliderGfx.moveTo(verts[0]![0], verts[0]![1])
      for (let i = 1; i < verts.length; i++) colliderGfx.lineTo(verts[i]![0], verts[i]![1])
      colliderGfx.closePath()
      colliderGfx.fill({ color: col.fill, alpha: c.oneWay ? 0.45 : 0.85 })
      colliderGfx.stroke({ width: 1.25 / camera.zoom, color: col.stroke })
      if (c.kinetic) {
        const cx = avg(verts.map(v => v[0]))
        const cy = avg(verts.map(v => v[1]))
        colliderGfx.circle(cx, cy, 4 / camera.zoom).fill({ color: 0xFFFF80, alpha: 0.9 })
      }
    }
  }

  // Markers — spawn, prowlers, dummies, pickups.
  markersGfx.clear()
  markerCircle(markersGfx, level.spawn.x, level.spawn.y, 6, 0x40FF60, camera.zoom)
  for (const p of level.prowlers) markerCircle(markersGfx, p.x, p.y, 8, 0xC040FF, camera.zoom)
  for (const d of level.dummies) markerCircle(markersGfx, d.x, d.y, 6, 0xFFA040, camera.zoom)
  // Pickups — render sprites from the pool; fall back to colored dot when no sprite.
  let pidx = 0
  for (const p of level.pickups) {
    const col = PICKUP_COLORS[p.kind] ?? 0xFF6040
    // Tinted glow ring behind the sprite.
    markersGfx.circle(p.x, p.y, 9 / camera.zoom).fill({ color: col, alpha: 0.25 })
    markersGfx.circle(p.x, p.y, 9 / camera.zoom).stroke({ width: 1 / camera.zoom, color: col, alpha: 0.6 })
    const tex = itemTextures.get(p.kind)
    if (tex) {
      while (pickupSpritePool.length <= pidx) {
        const s = new Sprite({ texture: Texture.EMPTY })
        s.anchor.set(0.5)
        pickupSpriteContainer.addChild(s)
        pickupSpritePool.push(s)
      }
      const s = pickupSpritePool[pidx]!
      s.texture = tex
      s.x = p.x
      s.y = p.y
      s.scale.set(20 / (tex.width * camera.zoom))
      s.visible = true
      pidx++
    }
    else {
      markerCircle(markersGfx, p.x, p.y, 7, col, camera.zoom)
    }
  }
  for (let i = pidx; i < pickupSpritePool.length; i++)
    pickupSpritePool[i]!.visible = false

  // Specials + classics — each kind drawn as a colored marker. Kept
  // small + color-coded so a dense level stays legible. Click-to-select
  // UI isn't wired up for these yet; this is editor-visibility only so
  // save/load round-trips make sense while authoring existing data.
  for (const p of level.mirrors) markerCircle(markersGfx, p.x, p.y, 5, 0xA0B0C0, camera.zoom)
  for (const p of level.hushes) markerCircle(markersGfx, p.x, p.y, 6, 0x3A3050, camera.zoom)
  for (const p of level.candlewicks) markerCircle(markersGfx, p.x, p.y, 5, 0xFFC060, camera.zoom)
  for (const p of level.knights) markerCircle(markersGfx, p.x, p.y, 7, 0xCC2020, camera.zoom)
  for (const p of level.blooms) markerCircle(markersGfx, p.x, p.y, 7, 0xC040A0, camera.zoom)
  for (const p of level.echoes) markerCircle(markersGfx, p.x, p.y, 5, 0x8090FF, camera.zoom)
  for (const p of level.crows) markerCircle(markersGfx, p.x, p.y, 4, 0x101418, camera.zoom)
  for (const p of level.carts) markerCircle(markersGfx, p.x, p.y, 5, 0x706050, camera.zoom)
  for (const p of level.shrines) markerCircle(markersGfx, p.x, p.y, 6, 0xE0D8C8, camera.zoom)
  for (const p of level.pilgrims) markerCircle(markersGfx, p.x, p.y, 5, 0x4060C0, camera.zoom)
  for (const p of level.medusas) markerCircle(markersGfx, p.x, p.y, 5, 0x3A2A1A, camera.zoom)
  for (const p of level.beetles) markerCircle(markersGfx, p.x, p.y, 5, 0x1A2838, camera.zoom)
  for (const p of level.boos) markerCircle(markersGfx, p.x, p.y, 5, 0xE0D8C8, camera.zoom)
  for (const p of level.wallmasters) markerCircle(markersGfx, p.x, p.y, 6, 0x2A1818, camera.zoom)
  for (const p of level.stalkers) markerCircle(markersGfx, p.x, p.y, 7, 0x8A2A1C, camera.zoom)
  for (const p of level.wizards) markerCircle(markersGfx, p.x, p.y, 6, 0x4A2A60, camera.zoom)
  for (const p of level.garpedes) {
    // Draw both endpoints + a hint line along the run path.
    markerCircle(markersGfx, p.x0, p.y, 5, 0xCC2020, camera.zoom)
    markerCircle(markersGfx, p.x1, p.y, 5, 0xCC2020, camera.zoom)
    markersGfx.moveTo(p.x0, p.y).lineTo(p.x1, p.y).stroke({ width: 1 / camera.zoom, color: 0xCC2020, alpha: 0.4 })
  }
  for (const p of level.ironKnuckles) markerCircle(markersGfx, p.x, p.y, 7, 0x304050, camera.zoom)
  for (const p of level.cagneys) markerCircle(markersGfx, p.x, p.y, 9, 0x2A4A30, camera.zoom)
  for (const p of level.dryBones) markerCircle(markersGfx, p.x, p.y, 5, 0xC8B89A, camera.zoom)
  for (const p of level.planteras) markerCircle(markersGfx, p.x, p.y, 8, 0x6A1A20, camera.zoom)
  for (const p of level.hammerBros) markerCircle(markersGfx, p.x, p.y, 6, 0x304030, camera.zoom)
  for (const p of level.mantisLords) markerCircle(markersGfx, p.x, p.y, 8, 0x404060, camera.zoom)
  // Zones — translucent rectangles tinted by type.
  if (layers.zones) {
    for (const z of level.zones) {
      const col = ZONE_COLORS[z.type]!
      markersGfx.rect(z.x, z.y, z.w, z.h).fill({ color: col, alpha: 0.18 })
      markersGfx.rect(z.x, z.y, z.w, z.h).stroke({ width: 1.25 / camera.zoom, color: col, alpha: 0.8 })
    }
  }

  // Selection outline + vertex handles + bbox scale handles.
  selectionGfx.clear()
  vertexGfx.clear()
  const sel = refs.selection.value
  if (sel) {
    if (sel.kind === 'collider') {
      const c = level.colliders[sel.index]
      if (c) {
        const verts = c.vertices
        selectionGfx.moveTo(verts[0]![0], verts[0]![1])
        for (let i = 1; i < verts.length; i++) selectionGfx.lineTo(verts[i]![0], verts[i]![1])
        selectionGfx.closePath()
        selectionGfx.stroke({ width: 2 / camera.zoom, color: 0xFFFF80, alpha: 1 })
        // Bbox + 8 scale handles (Illustrator-style).
        const b = polygonBounds(verts)
        selectionGfx.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
          .stroke({ width: 1 / camera.zoom, color: 0xFFFF80, alpha: 0.4 })
        for (const h of HANDLE_KINDS) {
          const hp = handlePoint(h, b)
          const s = HANDLE_SIZE_PX / camera.zoom
          vertexGfx.rect(hp.x - s / 2, hp.y - s / 2, s, s)
            .fill({ color: 0xFFFF80 })
            .stroke({ width: 1 / camera.zoom, color: 0x161820 })
        }
        // Vertex handles (drawn over the bbox for draggability).
        for (const v of verts) {
          const r = VERTEX_HANDLE_PX / camera.zoom
          vertexGfx.rect(v[0] - r, v[1] - r, r * 2, r * 2)
            .fill({ color: 0x161820 })
            .stroke({ width: 1.5 / camera.zoom, color: 0xFFFF80 })
        }
        // Rotation handle — circle above top-center of the bbox.
        const rotHandleOffset = 14 / camera.zoom
        const rotHandleRadius = 5 / camera.zoom
        const rotMidX = (b.minX + b.maxX) / 2
        const rotMidY = b.minY
        const rotHandleY = rotMidY - rotHandleOffset
        vertexGfx.moveTo(rotMidX, rotMidY).lineTo(rotMidX, rotHandleY).stroke({ width: 1 / camera.zoom, color: 0xFFFF80, alpha: 0.6 })
        vertexGfx.circle(rotMidX, rotHandleY, rotHandleRadius)
          .fill({ color: 0xFFFF80 })
          .stroke({ width: 1 / camera.zoom, color: 0x161820 })
      }
    }
    else if (sel.kind === 'zone') {
      const z = level.zones[sel.index]
      if (z) {
        selectionGfx.rect(z.x, z.y, z.w, z.h)
          .stroke({ width: 2 / camera.zoom, color: 0xFFFF80 })
        const b = { minX: z.x, minY: z.y, maxX: z.x + z.w, maxY: z.y + z.h }
        for (const h of HANDLE_KINDS) {
          const hp = handlePoint(h, b)
          const s = HANDLE_SIZE_PX / camera.zoom
          vertexGfx.rect(hp.x - s / 2, hp.y - s / 2, s, s)
            .fill({ color: 0xFFFF80 })
            .stroke({ width: 1 / camera.zoom, color: 0x161820 })
        }
      }
    }
    else {
      const pt = selectionMarker(level, sel)
      if (pt) {
        selectionGfx.circle(pt.x, pt.y, 10 / camera.zoom)
          .stroke({ width: 2 / camera.zoom, color: 0xFFFF80 })
      }
    }
  }

  // In-progress rect / zone-rect drag preview.
  ghostGfx.clear()
  if (ctx.dragging?.kind === 'rect' || ctx.dragging?.kind === 'zone-rect') {
    const [wx0, wy0] = (ctx.dragging.state0 as { worldStart: [number, number] }).worldStart
    const wx1 = snap(snapStep, ctx.mouseWorld.x)
    const wy1 = snap(snapStep, ctx.mouseWorld.y)
    const rx = Math.min(wx0, wx1)
    const ry = Math.min(wy0, wy1)
    const rw = Math.abs(wx1 - wx0)
    const rh = Math.abs(wy1 - wy0)
    const pendingZone = refs.pendingZone.value
    const col = ctx.dragging.kind === 'zone-rect'
      ? (ZONE_COLORS[pendingZone?.type ?? 'gravity']!)
      : 0x80FF80
    ghostGfx.rect(rx, ry, rw, rh)
      .fill({ color: col, alpha: 0.15 })
      .stroke({ width: 1.25 / camera.zoom, color: col, alpha: 0.9 })
  }

  // In-progress polygon ghost.
  const polyBuffer = refs.polyBuffer.value
  if (polyBuffer && polyBuffer.length) {
    const buf = polyBuffer
    // Committed edges — full opacity.
    if (buf.length >= 2) {
      ghostGfx.moveTo(buf[0]![0], buf[0]![1])
      for (let i = 1; i < buf.length; i++) ghostGfx.lineTo(buf[i]![0], buf[i]![1])
      ghostGfx.stroke({ width: 1.25 / camera.zoom, color: 0x80FF80, alpha: 0.9 })
    }
    // Preview line from last committed point to snapped cursor — lighter.
    if (ctx.cursorInCanvas) {
      const last = buf[buf.length - 1]!
      const sx = snap(snapStep, ctx.mouseWorld.x)
      const sy = snap(snapStep, ctx.mouseWorld.y)
      ghostGfx.moveTo(last[0], last[1]).lineTo(sx, sy).stroke({ width: 1.25 / camera.zoom, color: 0x666666, alpha: 0.7 })
    }
    // Vertex dots for all committed points.
    for (const p of buf) {
      ghostGfx.circle(p[0], p[1], 3 / camera.zoom).fill({ color: 0x80FF80 })
    }
  }

  // Ghost placement previews — entity tools and zone idle hover.
  previewGfx.clear()
  previewGfx.alpha = 0.4
  const tool = refs.tool.value
  if (ctx.cursorInCanvas && !ctx.dragging) {
    const px = snap(snapStep, ctx.mouseWorld.x)
    const py = snap(snapStep, ctx.mouseWorld.y)
    if (tool === 'spawn') {
      markerCircle(previewGfx, px, py, 6, 0x40FF60, camera.zoom)
    }
    else if (tool === 'prowler') {
      markerCircle(previewGfx, px, py, 8, 0xC040FF, camera.zoom)
    }
    else if (tool === 'dummy') {
      markerCircle(previewGfx, px, py, 6, 0xFFA040, camera.zoom)
    }
    else if (tool === 'pickup') {
      markerCircle(previewGfx, px, py, 7, PICKUP_COLORS[refs.pendingPickupKind.value] ?? 0xFF6040, camera.zoom)
    }
    else if (tool === 'zone') {
      const defaultW = 80
      const defaultH = 80
      const pendingZone = refs.pendingZone.value
      const col = ZONE_COLORS[pendingZone?.type ?? 'gravity']!
      previewGfx.rect(px - defaultW / 2, py - defaultH / 2, defaultW, defaultH)
        .fill({ color: col, alpha: 0.4 })
        .stroke({ width: 1.25 / camera.zoom, color: col, alpha: 1.0 })
    }
  }
}

function markerCircle(g: Graphics, x: number, y: number, r: number, color: number, zoom: number): void {
  g.circle(x, y, r).fill({ color, alpha: 0.8 }).stroke({ width: 1.5 / zoom, color: 0x161820 })
}

function handlePoint(
  h: HandleKind,
  b: { minX: number, minY: number, maxX: number, maxY: number },
): { x: number, y: number } {
  const midX = (b.minX + b.maxX) / 2
  const midY = (b.minY + b.maxY) / 2
  switch (h) {
    case 'nw': return { x: b.minX, y: b.minY }
    case 'n': return { x: midX, y: b.minY }
    case 'ne': return { x: b.maxX, y: b.minY }
    case 'e': return { x: b.maxX, y: midY }
    case 'se': return { x: b.maxX, y: b.maxY }
    case 's': return { x: midX, y: b.maxY }
    case 'sw': return { x: b.minX, y: b.maxY }
    case 'w': return { x: b.minX, y: midY }
  }
}

// Which edges move when dragging handle H. +1 = max edge moves, -1 = min
// edge moves, 0 = edge stays put.
function handleAxes(h: HandleKind): { sx: -1 | 0 | 1, sy: -1 | 0 | 1 } {
  const sx = h === 'nw' || h === 'w' || h === 'sw' ? -1 : h === 'ne' || h === 'e' || h === 'se' ? 1 : 0
  const sy = h === 'nw' || h === 'n' || h === 'ne' ? -1 : h === 'sw' || h === 's' || h === 'se' ? 1 : 0
  return { sx, sy }
}

function selectionMarker(
  level: StoreRefs['level']['value'],
  sel: { kind: string, index: number },
): { x: number, y: number } | null {
  if (sel.kind === 'spawn')
    return { x: level.spawn.x, y: level.spawn.y }
  if (sel.kind === 'prowler')
    return level.prowlers[sel.index] ?? null
  if (sel.kind === 'dummy')
    return level.dummies[sel.index] ?? null
  if (sel.kind === 'pickup')
    return level.pickups[sel.index] ?? null
  return null
}

function avg(arr: number[]): number {
  if (!arr.length)
    return 0
  let s = 0
  for (const n of arr) s += n
  return s / arr.length
}

// ─── input ─────────────────────────────────────────────────────────────────

// Mouse modifier latch — used by onLeftDown to read shift/alt without
// plumbing PointerEvent into every helper.
let lastMouseEvent: { shiftKey: boolean, altKey: boolean, ctrlKey: boolean } | null = null

function hitHandle(
  b: { minX: number, minY: number, maxX: number, maxY: number },
  x: number,
  y: number,
  zoom: number,
): HandleKind | null {
  const half = (HANDLE_SIZE_PX / 2 + 2) / zoom
  for (const h of HANDLE_KINDS) {
    const hp = handlePoint(h, b)
    if (Math.abs(x - hp.x) <= half && Math.abs(y - hp.y) <= half)
      return h
  }
  return null
}

function findEdgeHit(
  verts: [number, number][],
  x: number,
  y: number,
  tolerance: number,
): { afterIdx: number } | null {
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!
    const b = verts[(i + 1) % verts.length]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-4)
      continue
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2))
    const px = a[0] + t * dx
    const py = a[1] + t * dy
    if (Math.hypot(x - px, y - py) <= tolerance)
      return { afterIdx: i }
  }
  return null
}

function wireInput(ctx: CanvasCtx): () => void {
  const canvas = ctx.app.canvas
  canvas.tabIndex = 0
  const { refs, store } = ctx.cs

  canvas.addEventListener('pointerleave', () => {
    ctx.cursorInCanvas = false
    // ctx.cursorInCanvas is not reactive (it's on ctx, not store), so force redraw.
    redraw(ctx)
  })

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const w = screenToWorld(ctx, sx, sy)
    ctx.mouseWorld = w
    ctx.cursorInCanvas = true
    updateCursorText(ctx, sx, sy)

    const camera = refs.camera.value
    const snapStep = refs.snapStep.value

    if (ctx.dragging) {
      const d = ctx.dragging
      const dxScreen = sx - d.startX
      const dyScreen = sy - d.startY
      const dxWorld = dxScreen / camera.zoom
      const dyWorld = dyScreen / camera.zoom
      if (d.kind === 'pan') {
        const s0 = d.state0 as { cx: number, cy: number }
        camera.x = s0.cx - dxWorld
        camera.y = s0.cy - dyWorld
      }
      else if (d.kind === 'collider' && refs.selection.value?.kind === 'collider') {
        const c = refs.level.value.colliders[refs.selection.value.index]
        const s0 = d.state0 as { verts: [number, number][] }
        if (c) {
          const dx = snap(snapStep, s0.verts[0]![0] + dxWorld) - s0.verts[0]![0]
          const dy = snap(snapStep, s0.verts[0]![1] + dyWorld) - s0.verts[0]![1]
          c.vertices = s0.verts.map(([vx, vy]) => [vx + dx, vy + dy])
        }
      }
      else if (d.kind === 'vertex' && refs.selection.value?.kind === 'collider') {
        const s0 = d.state0 as { collIdx: number, vertIdx: number, start: [number, number] }
        const c = refs.level.value.colliders[s0.collIdx]
        if (c) {
          const nx = snap(snapStep, s0.start[0] + dxWorld)
          const ny = snap(snapStep, s0.start[1] + dyWorld)
          c.vertices[s0.vertIdx] = [nx, ny]
        }
      }
      else if (d.kind === 'scale') {
        const s0 = d.state0 as {
          selKind: 'collider' | 'zone'
          index: number
          handle: HandleKind
          startBounds: { minX: number, minY: number, maxX: number, maxY: number }
          startVerts: [number, number][]
        }
        const axes = handleAxes(s0.handle)
        const b = s0.startBounds
        let newMinX = b.minX
        let newMaxX = b.maxX
        let newMinY = b.minY
        let newMaxY = b.maxY
        if (axes.sx === 1)
          newMaxX = Math.max(b.minX + 1, snap(snapStep, b.maxX + dxWorld))
        else if (axes.sx === -1)
          newMinX = Math.min(b.maxX - 1, snap(snapStep, b.minX + dxWorld))
        if (axes.sy === 1)
          newMaxY = Math.max(b.minY + 1, snap(snapStep, b.maxY + dyWorld))
        else if (axes.sy === -1)
          newMinY = Math.min(b.maxY - 1, snap(snapStep, b.minY + dyWorld))

        if (s0.selKind === 'collider') {
          const c = refs.level.value.colliders[s0.index]
          if (c) {
            const anchorX = axes.sx === 1 ? b.minX : axes.sx === -1 ? b.maxX : (b.minX + b.maxX) / 2
            const anchorY = axes.sy === 1 ? b.minY : axes.sy === -1 ? b.maxY : (b.minY + b.maxY) / 2
            const oldW = b.maxX - b.minX
            const oldH = b.maxY - b.minY
            const newW = newMaxX - newMinX
            const newH = newMaxY - newMinY
            const scaleX = axes.sx === 0 ? 1 : newW / (oldW || 1)
            const scaleY = axes.sy === 0 ? 1 : newH / (oldH || 1)
            c.vertices = scalePolygon(s0.startVerts, anchorX, anchorY, scaleX, scaleY)
          }
        }
        else {
          const z = refs.level.value.zones[s0.index]
          if (z) {
            z.x = newMinX
            z.y = newMinY
            z.w = newMaxX - newMinX
            z.h = newMaxY - newMinY
          }
        }
      }
      else if (d.kind === 'rotate-gizmo') {
        const s0 = d.state0 as { collIdx: number, cx: number, cy: number, originalVerts: [number, number][], startAngle: number }
        const c = refs.level.value.colliders[s0.collIdx]
        if (c) {
          const currentAngle = Math.atan2(w.y - s0.cy, w.x - s0.cx)
          const delta = currentAngle - s0.startAngle
          c.vertices = rotatePolygon(s0.originalVerts, s0.cx, s0.cy, delta)
        }
      }
      else if (d.kind === 'zone-move') {
        const s0 = d.state0 as { zoneIdx: number, startX: number, startY: number }
        const z = refs.level.value.zones[s0.zoneIdx]
        if (z) {
          z.x = snap(snapStep, s0.startX + dxWorld)
          z.y = snap(snapStep, s0.startY + dyWorld)
        }
      }
      // rect / zone-rect: preview handled by redraw reading ctx.dragging + mouseWorld.
      // Since dragging/mouseWorld are on ctx (not reactive), force redraw.
      redraw(ctx)
    }
    else if (
      (refs.tool.value === 'polygon' && refs.polyBuffer.value)
      || refs.tool.value === 'spawn'
      || refs.tool.value === 'prowler'
      || refs.tool.value === 'dummy'
      || refs.tool.value === 'pickup'
      || refs.tool.value === 'zone'
    ) {
      // cursor preview for placement tools — mouseWorld not reactive, force redraw
      redraw(ctx)
    }
  })

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus()
    lastMouseEvent = { shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey }
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const w = screenToWorld(ctx, sx, sy)

    // Pan: middle click OR space+left.
    if (e.button === 1 || (e.button === 0 && ctx.spaceHeld)) {
      ctx.dragging = { kind: 'pan', startX: sx, startY: sy, state0: { cx: refs.camera.value.x, cy: refs.camera.value.y } }
      return
    }

    if (e.button === 0) {
      onLeftDown(ctx, sx, sy, w)
    }
    else if (e.button === 2) {
      // Right-click cancels polygon mid-draw.
      if (refs.polyBuffer.value) {
        refs.polyBuffer.value = null
      }
    }
  })

  canvas.addEventListener('pointerup', () => {
    if (ctx.dragging?.kind === 'rect')
      finishRect(ctx)
    else if (ctx.dragging?.kind === 'zone-rect')
      finishZoneRect(ctx)
    ctx.dragging = null
    redraw(ctx)
  })

  canvas.addEventListener('contextmenu', e => e.preventDefault())

  canvas.addEventListener('dblclick', () => {
    if (refs.tool.value === 'polygon' && refs.polyBuffer.value && refs.polyBuffer.value.length >= 3)
      finishPolygon(ctx)
  })

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const before = screenToWorld(ctx, sx, sy)
    const scale = e.deltaY < 0 ? 1.15 : 1 / 1.15
    refs.camera.value.zoom = Math.max(0.05, Math.min(8, refs.camera.value.zoom * scale))
    const after = screenToWorld(ctx, sx, sy)
    refs.camera.value.x += before.x - after.x
    refs.camera.value.y += before.y - after.y
  }, { passive: false })

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingInInput(e.target))
      return
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      store.undo()
      e.preventDefault()
      return
    }
    if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y' || e.key === 'Y')) {
      store.redo()
      e.preventDefault()
      return
    }
    if (e.code === 'Space') {
      ctx.spaceHeld = true
      canvas.style.cursor = 'grab'
    }
    else if (e.key === 'Enter' && refs.tool.value === 'polygon' && refs.polyBuffer.value && refs.polyBuffer.value.length >= 3) {
      finishPolygon(ctx)
    }
    else if (e.key === 'Escape') {
      refs.polyBuffer.value = null
      refs.selection.value = null
    }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && refs.selection.value) {
      deleteSelection(ctx)
      e.preventDefault()
    }
    else if (e.key === 'f' || e.key === 'F') {
      frameWorld(ctx)
    }
    else if ((e.key === 'g' || e.key === 'G') && !motionPreviewActive) {
      motionPreviewActive = true
      motionPreviewLastTime = performance.now()
      motionPreviewScratch = []
      for (let i = 0; i < refs.level.value.colliders.length; i++) {
        const c = refs.level.value.colliders[i] as EditorCollider | undefined
        if (c?.kinetic) {
          motionPreviewScratch.push({
            collIdx: i,
            originalVerts: c.vertices.map(v => [v[0], v[1]] as [number, number]),
            t: 0,
          })
        }
      }
      redraw(ctx)
    }
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      ctx.spaceHeld = false
      canvas.style.cursor = ''
    }
    if ((e.key === 'g' || e.key === 'G') && motionPreviewActive) {
      motionPreviewActive = false
      for (const entry of motionPreviewScratch) {
        const c = refs.level.value.colliders[entry.collIdx]
        if (c)
          c.vertices = entry.originalVerts
      }
      motionPreviewScratch = []
    }
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }
}

function isTypingInInput(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement))
    return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onLeftDown(ctx: CanvasCtx, sx: number, sy: number, w: { x: number, y: number }): void {
  const { refs, store } = ctx.cs
  const camera = refs.camera.value
  const snapStep = refs.snapStep.value

  if (refs.tool.value === 'select') {
    // Rotation handle on the selected collider — checked before scale handles.
    if (refs.selection.value?.kind === 'collider') {
      const c = refs.level.value.colliders[refs.selection.value.index]
      if (c) {
        const b = polygonBounds(c.vertices)
        const rotHandleOffset = 14 / camera.zoom
        const rotHandleRadius = 8 / camera.zoom // slightly larger hit area
        const rotMidX = (b.minX + b.maxX) / 2
        const rotHandleY = b.minY - rotHandleOffset
        if (Math.hypot(w.x - rotMidX, w.y - rotHandleY) <= rotHandleRadius) {
          store.pushUndo('rotate selection')
          const { cx, cy } = polygonCenter(c.vertices)
          ctx.dragging = {
            kind: 'rotate-gizmo',
            startX: sx,
            startY: sy,
            state0: {
              collIdx: refs.selection.value.index,
              cx,
              cy,
              originalVerts: c.vertices.map(v => [...v] as [number, number]),
              startAngle: Math.atan2(w.y - cy, w.x - cx),
            },
          }
          return
        }
      }
    }

    // Scale handle on the selected collider or zone takes priority — its
    // box is bigger than a vertex handle so the vertex shouldn't eat it.
    if (refs.selection.value?.kind === 'collider') {
      const c = refs.level.value.colliders[refs.selection.value.index]
      if (c) {
        const b = polygonBounds(c.vertices)
        const handle = hitHandle(b, w.x, w.y, camera.zoom)
        if (handle) {
          store.pushUndo('scale selection')
          ctx.dragging = {
            kind: 'scale',
            startX: sx,
            startY: sy,
            state0: { selKind: 'collider', index: refs.selection.value.index, handle, startBounds: b, startVerts: c.vertices.map(v => [v[0], v[1]] as [number, number]) },
          }
          return
        }
      }
    }
    else if (refs.selection.value?.kind === 'zone') {
      const z = refs.level.value.zones[refs.selection.value.index]
      if (z) {
        const b = { minX: z.x, minY: z.y, maxX: z.x + z.w, maxY: z.y + z.h }
        const handle = hitHandle(b, w.x, w.y, camera.zoom)
        if (handle) {
          store.pushUndo('scale selection')
          ctx.dragging = {
            kind: 'scale',
            startX: sx,
            startY: sy,
            state0: { selKind: 'zone', index: refs.selection.value.index, handle, startBounds: b, startVerts: [] },
          }
          return
        }
      }
    }

    // Vertex hit first (so you can grab a handle even if over fill).
    // Shift+click a vertex → delete. Alt+click an edge → insert vertex.
    if (refs.selection.value?.kind === 'collider') {
      const c = refs.level.value.colliders[refs.selection.value.index]
      if (c) {
        const hitRadius = (VERTEX_HANDLE_PX + 2) / camera.zoom
        for (let i = 0; i < c.vertices.length; i++) {
          const v = c.vertices[i]!
          if (Math.abs(v[0] - w.x) <= hitRadius && Math.abs(v[1] - w.y) <= hitRadius) {
            // Shift+click → delete vertex (keep at least 3).
            const mod = lastMouseEvent
            if (mod?.shiftKey && c.vertices.length > 3) {
              store.pushUndo('edit polygon')
              c.vertices.splice(i, 1)
              return
            }
            store.pushUndo('edit polygon')
            ctx.dragging = {
              kind: 'vertex',
              startX: sx,
              startY: sy,
              state0: { collIdx: refs.selection.value.index, vertIdx: i, start: [v[0], v[1]] as [number, number] },
            }
            return
          }
        }
        // Alt+click on an edge → insert vertex.
        if (lastMouseEvent?.altKey) {
          const edgeHit = findEdgeHit(c.vertices, w.x, w.y, 6 / camera.zoom)
          if (edgeHit != null) {
            store.pushUndo('edit polygon')
            c.vertices.splice(edgeHit.afterIdx + 1, 0, [snap(snapStep, w.x), snap(snapStep, w.y)])
            return
          }
        }
      }
    }
    // Marker hit (spawn/prowler/dummy/pickup). Highest-priority click target.
    const marker = hitMarker(refs, w, 12 / camera.zoom)
    if (marker) {
      refs.selection.value = marker
      return
    }
    const hit = hitCollider(refs, w)
    if (hit !== -1) {
      refs.selection.value = { kind: 'collider', index: hit }
      store.pushUndo('move selection')
      ctx.dragging = {
        kind: 'collider',
        startX: sx,
        startY: sy,
        state0: { verts: refs.level.value.colliders[hit]!.vertices.map(v => [v[0], v[1]] as [number, number]) },
      }
      return
    }
    const zoneHit = hitZone(refs, w)
    if (zoneHit !== -1) {
      refs.selection.value = { kind: 'zone', index: zoneHit }
      store.pushUndo('move selection')
      const z = refs.level.value.zones[zoneHit]!
      ctx.dragging = {
        kind: 'zone-move',
        startX: sx,
        startY: sy,
        state0: { zoneIdx: zoneHit, startX: z.x, startY: z.y },
      }
      return
    }
    refs.selection.value = null
    return
  }

  if (refs.tool.value === 'zone') {
    store.pushUndo('create zone')
    ctx.dragging = { kind: 'zone-rect', startX: sx, startY: sy, state0: { worldStart: [snap(snapStep, w.x), snap(snapStep, w.y)] } }
    return
  }

  if (refs.tool.value === 'polygon') {
    const p: [number, number] = [snap(snapStep, w.x), snap(snapStep, w.y)]
    if (!refs.polyBuffer.value)
      refs.polyBuffer.value = []
    refs.polyBuffer.value.push(p)
    return
  }

  if (refs.tool.value === 'rect') {
    ctx.dragging = { kind: 'rect', startX: sx, startY: sy, state0: { worldStart: [snap(snapStep, w.x), snap(snapStep, w.y)] } }
    return
  }

  // Placement tools.
  if (refs.tool.value === 'spawn') {
    refs.level.value.spawn = { x: snap(snapStep, w.x), y: snap(snapStep, w.y) }
    refs.selection.value = { kind: 'spawn', index: 0 }
  }
  else if (refs.tool.value === 'prowler') {
    refs.level.value.prowlers.push({ x: snap(snapStep, w.x), y: snap(snapStep, w.y) })
    refs.selection.value = { kind: 'prowler', index: refs.level.value.prowlers.length - 1 }
  }
  else if (refs.tool.value === 'dummy') {
    refs.level.value.dummies.push({ x: snap(snapStep, w.x), y: snap(snapStep, w.y) })
    refs.selection.value = { kind: 'dummy', index: refs.level.value.dummies.length - 1 }
  }
  else if (refs.tool.value === 'pickup') {
    refs.level.value.pickups.push({ x: snap(snapStep, w.x), y: snap(snapStep, w.y), kind: refs.pendingPickupKind.value })
    refs.selection.value = { kind: 'pickup', index: refs.level.value.pickups.length - 1 }
  }
}

function hitCollider(refs: StoreRefs, w: { x: number, y: number }): number {
  // Topmost (last drawn) wins — reverse iterate.
  const colliders = refs.level.value.colliders
  for (let i = colliders.length - 1; i >= 0; i--) {
    const c = colliders[i]!
    if (pointInPolygon(w.x, w.y, c.vertices))
      return i
  }
  return -1
}

function hitZone(refs: StoreRefs, w: { x: number, y: number }): number {
  const zones = refs.level.value.zones
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]!
    if (w.x >= z.x && w.x <= z.x + z.w && w.y >= z.y && w.y <= z.y + z.h)
      return i
  }
  return -1
}

function hitMarker(
  refs: StoreRefs,
  w: { x: number, y: number },
  r: number,
): { kind: 'spawn' | 'prowler' | 'dummy' | 'pickup', index: number } | null {
  const within = (x: number, y: number) => Math.hypot(x - w.x, y - w.y) <= r
  const level = refs.level.value
  if (within(level.spawn.x, level.spawn.y))
    return { kind: 'spawn', index: 0 }
  for (let i = level.pickups.length - 1; i >= 0; i--) {
    const p = level.pickups[i]!
    if (within(p.x, p.y))
      return { kind: 'pickup', index: i }
  }
  for (let i = level.dummies.length - 1; i >= 0; i--) {
    const d = level.dummies[i]!
    if (within(d.x, d.y))
      return { kind: 'dummy', index: i }
  }
  for (let i = level.prowlers.length - 1; i >= 0; i--) {
    const p = level.prowlers[i]!
    if (within(p.x, p.y))
      return { kind: 'prowler', index: i }
  }
  return null
}

function pointInPolygon(x: number, y: number, verts: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const [xi, yi] = verts[i]!
    const [xj, yj] = verts[j]!
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi)
    if (intersect)
      inside = !inside
  }
  return inside
}

function finishPolygon(ctx: CanvasCtx): void {
  const { refs, store } = ctx.cs
  if (!refs.polyBuffer.value || refs.polyBuffer.value.length < 3) {
    refs.polyBuffer.value = null
    return
  }
  store.pushUndo('create collider')
  const preset = refs.pendingPreset.value
  const collider = {
    id: store.allocId(),
    material: refs.createMaterial.value,
    vertices: refs.polyBuffer.value.map(p => [p[0], p[1]] as [number, number]),
    ...(preset?.oneWay ? { oneWay: true } : {}),
    ...(preset?.kinetic ? { kinetic: preset.kinetic } : {}),
    ...(preset?.surfaceMotion ? { surfaceMotion: preset.surfaceMotion } : {}),
    ...(preset?.launchPad ? { launchPad: preset.launchPad } : {}),
  }
  refs.level.value.colliders.push(collider)
  refs.selection.value = { kind: 'collider', index: refs.level.value.colliders.length - 1 }
  refs.polyBuffer.value = null
  refs.pendingPreset.value = null
  refs.tool.value = 'select'
}

function finishRect(ctx: CanvasCtx): void {
  const { refs, store } = ctx.cs
  if (!ctx.dragging || ctx.dragging.kind !== 'rect')
    return
  const d = ctx.dragging
  const [wx0, wy0] = (d.state0 as { worldStart: [number, number] }).worldStart
  const snapStep = refs.snapStep.value
  const wx1 = snap(snapStep, ctx.mouseWorld.x)
  const wy1 = snap(snapStep, ctx.mouseWorld.y)
  const x0 = Math.min(wx0, wx1)
  const y0 = Math.min(wy0, wy1)
  const x1 = Math.max(wx0, wx1)
  const y1 = Math.max(wy0, wy1)
  if (x1 - x0 < 1 || y1 - y0 < 1)
    return
  store.pushUndo('create collider')
  const verts: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const preset = refs.pendingPreset.value
  const collider = {
    id: store.allocId(),
    material: refs.createMaterial.value,
    vertices: verts,
    ...(preset?.oneWay ? { oneWay: true } : {}),
    ...(preset?.kinetic ? { kinetic: preset.kinetic } : {}),
    ...(preset?.surfaceMotion ? { surfaceMotion: preset.surfaceMotion } : {}),
    ...(preset?.launchPad ? { launchPad: preset.launchPad } : {}),
  }
  refs.level.value.colliders.push(collider)
  refs.selection.value = { kind: 'collider', index: refs.level.value.colliders.length - 1 }
  refs.pendingPreset.value = null
  refs.tool.value = 'select'
}

function finishZoneRect(ctx: CanvasCtx): void {
  const { refs, store } = ctx.cs
  if (!ctx.dragging || ctx.dragging.kind !== 'zone-rect')
    return
  const [wx0, wy0] = (ctx.dragging.state0 as { worldStart: [number, number] }).worldStart
  const snapStep = refs.snapStep.value
  const wx1 = snap(snapStep, ctx.mouseWorld.x)
  const wy1 = snap(snapStep, ctx.mouseWorld.y)
  const x = Math.min(wx0, wx1)
  const y = Math.min(wy0, wy1)
  const w = Math.abs(wx1 - wx0)
  const h = Math.abs(wy1 - wy0)
  if (w < 4 || h < 4)
    return
  store.pushUndo('create zone')
  const preset = refs.pendingZone.value ?? { type: 'gravity' as const, gravityScale: 0.5 }
  refs.level.value.zones.push({
    id: store.allocId(),
    type: preset.type,
    x,
    y,
    w,
    h,
    ...(preset.gravityScale != null ? { gravityScale: preset.gravityScale } : {}),
    ...(preset.airControlScale != null ? { airControlScale: preset.airControlScale } : {}),
    ...(preset.windVx != null ? { windVx: preset.windVx } : {}),
    ...(preset.windVy != null ? { windVy: preset.windVy } : {}),
    ...(preset.windTurbulence != null ? { windTurbulence: preset.windTurbulence } : {}),
    ...(preset.hazardDamage != null ? { hazardDamage: preset.hazardDamage } : {}),
    ...(preset.triggerId != null ? { triggerId: preset.triggerId } : {}),
  })
  refs.selection.value = { kind: 'zone', index: refs.level.value.zones.length - 1 }
  refs.pendingZone.value = null
  refs.tool.value = 'select'
}

function deleteSelection(ctx: CanvasCtx): void {
  const { refs, store } = ctx.cs
  const sel = refs.selection.value
  if (!sel)
    return
  store.pushUndo('delete selection')
  if (sel.kind === 'collider') {
    refs.level.value.colliders.splice(sel.index, 1)
  }
  else if (sel.kind === 'prowler') {
    refs.level.value.prowlers.splice(sel.index, 1)
  }
  else if (sel.kind === 'dummy') {
    refs.level.value.dummies.splice(sel.index, 1)
  }
  else if (sel.kind === 'pickup') {
    refs.level.value.pickups.splice(sel.index, 1)
  }
  else if (sel.kind === 'zone') {
    refs.level.value.zones.splice(sel.index, 1)
  }
  // Spawn can't be deleted — there's always exactly one.
  refs.selection.value = null
}

function frameWorld(ctx: CanvasCtx): void {
  const { refs } = ctx.cs
  const margin = 40
  const vw = ctx.app.screen.width
  const vh = ctx.app.screen.height
  const zoomX = (vw - margin * 2) / refs.level.value.worldWidth
  const zoomY = (vh - margin * 2) / refs.level.value.worldHeight
  refs.camera.value.zoom = Math.max(0.05, Math.min(8, Math.min(zoomX, zoomY)))
  refs.camera.value.x = refs.level.value.worldWidth / 2
  refs.camera.value.y = refs.level.value.worldHeight / 2
}

function updateCursorText(ctx: CanvasCtx, sx: number, sy: number): void {
  ctx.cursorText.text = `x=${Math.round(ctx.mouseWorld.x)}  y=${Math.round(ctx.mouseWorld.y)}  zoom=${ctx.cs.refs.camera.value.zoom.toFixed(2)}`
  ctx.cursorText.x = sx + 14
  ctx.cursorText.y = sy + 10
}

export function setTool(ctx: CanvasCtx, tool: Tool): void {
  ctx.cs.refs.tool.value = tool
  ctx.cs.refs.polyBuffer.value = null
}
