// Editor canvas — Pixi-based scene. Renders the world at the editor
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
//   - Spawn/prowler/dummy/pickup tools: click to place.

import type { EditorState, Tool } from './state'
import type { ZoneType } from '../world/level'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { allocId, markDirty, polygonBounds, pushUndo, redo, scalePolygon, snap, undo } from './state'

const ZONE_COLORS: Record<ZoneType, number> = {
  gravity: 0x5080FF,
  wind: 0x60E0C0,
  hazard: 0xE04040,
  trigger: 0xE0C040,
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

interface CanvasCtx {
  app: Application
  state: EditorState
  worldContainer: Container
  gridGfx: Graphics
  bgGfx: Graphics
  colliderGfx: Graphics
  selectionGfx: Graphics
  markersGfx: Graphics
  ghostGfx: Graphics // in-progress polygon + cursor
  vertexGfx: Graphics
  cursorText: Text
  mouseWorld: { x: number, y: number }
  spaceHeld: boolean
  dragging: { kind: 'pan' | 'collider' | 'rect' | 'vertex' | 'scale' | 'zone-rect' | 'zone-move', startX: number, startY: number, state0: unknown } | null
}

export async function createCanvas(
  host: HTMLElement,
  state: EditorState,
): Promise<CanvasCtx> {
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
  const vertexGfx = new Graphics()
  worldContainer.addChild(bgGfx, gridGfx, colliderGfx, markersGfx, selectionGfx, ghostGfx, vertexGfx)

  const cursorText = new Text({
    text: '',
    style: { fontFamily: 'monospace', fontSize: 11, fill: 0x80E0FF },
  })
  app.stage.addChild(cursorText)

  const ctx: CanvasCtx = {
    app,
    state,
    worldContainer,
    gridGfx,
    bgGfx,
    colliderGfx,
    selectionGfx,
    markersGfx,
    ghostGfx,
    vertexGfx,
    cursorText,
    mouseWorld: { x: 0, y: 0 },
    spaceHeld: false,
    dragging: null,
  }

  state.listeners.add(() => redraw(ctx))

  wireInput(ctx)
  app.ticker.add(() => applyCamera(ctx))
  redraw(ctx)
  return ctx
}

function applyCamera(ctx: CanvasCtx): void {
  const { camera } = ctx.state
  ctx.worldContainer.scale.set(camera.zoom)
  ctx.worldContainer.x = -camera.x * camera.zoom + ctx.app.screen.width / 2
  ctx.worldContainer.y = -camera.y * camera.zoom + ctx.app.screen.height / 2
}

function screenToWorld(ctx: CanvasCtx, sx: number, sy: number): { x: number, y: number } {
  const { camera } = ctx.state
  return {
    x: (sx - ctx.app.screen.width / 2) / camera.zoom + camera.x,
    y: (sy - ctx.app.screen.height / 2) / camera.zoom + camera.y,
  }
}

// ─── drawing ──────────────────────────────────────────────────────────────

function redraw(ctx: CanvasCtx): void {
  const { state, bgGfx, gridGfx, colliderGfx, selectionGfx, markersGfx, ghostGfx, vertexGfx } = ctx
  const level = state.level

  // Background = world bounds.
  bgGfx.clear()
  bgGfx.rect(0, 0, level.worldWidth, level.worldHeight).fill({ color: 0x161820 })
  bgGfx.rect(0, 0, level.worldWidth, level.worldHeight).stroke({ width: 2 / state.camera.zoom, color: 0x404858 })

  // Grid.
  gridGfx.clear()
  if (state.layers.grid) {
    const step = state.snap > 0 ? state.snap : 40
    const majorStep = step * 5
    const strokeMinor = { width: 1 / state.camera.zoom, color: 0x252A33, alpha: 0.6 }
    const strokeMajor = { width: 1 / state.camera.zoom, color: 0x3C4250, alpha: 0.9 }
    for (let x = 0; x <= level.worldWidth; x += step) {
      gridGfx.moveTo(x, 0).lineTo(x, level.worldHeight).stroke(x % majorStep === 0 ? strokeMajor : strokeMinor)
    }
    for (let y = 0; y <= level.worldHeight; y += step) {
      gridGfx.moveTo(0, y).lineTo(level.worldWidth, y).stroke(y % majorStep === 0 ? strokeMajor : strokeMinor)
    }
  }

  // Colliders.
  colliderGfx.clear()
  if (state.layers.colliders) {
    for (const c of level.colliders) {
      const col = MATERIAL_COLORS[c.material] ?? MATERIAL_COLORS.bone!
      const verts = c.vertices
      if (verts.length < 2)
        continue
      colliderGfx.moveTo(verts[0]![0], verts[0]![1])
      for (let i = 1; i < verts.length; i++) colliderGfx.lineTo(verts[i]![0], verts[i]![1])
      colliderGfx.closePath()
      colliderGfx.fill({ color: col.fill, alpha: c.oneWay ? 0.45 : 0.85 })
      colliderGfx.stroke({ width: 1.25 / state.camera.zoom, color: col.stroke })
      if (c.kinetic) {
        const cx = avg(verts.map(v => v[0]))
        const cy = avg(verts.map(v => v[1]))
        colliderGfx.circle(cx, cy, 4 / state.camera.zoom).fill({ color: 0xFFFF80, alpha: 0.9 })
      }
    }
  }

  // Markers — spawn, prowlers, dummies, pickups.
  markersGfx.clear()
  markerCircle(markersGfx, level.spawn.x, level.spawn.y, 6, 0x40FF60, state.camera.zoom)
  for (const p of level.prowlers) markerCircle(markersGfx, p.x, p.y, 8, 0xC040FF, state.camera.zoom)
  for (const d of level.dummies) markerCircle(markersGfx, d.x, d.y, 6, 0xFFA040, state.camera.zoom)
  for (const p of level.pickups) markerCircle(markersGfx, p.x, p.y, 7, 0xFF6040, state.camera.zoom)
  // Zones — translucent rectangles tinted by type.
  if (state.layers.zones) {
    for (const z of level.zones) {
      const col = ZONE_COLORS[z.type]
      markersGfx.rect(z.x, z.y, z.w, z.h).fill({ color: col, alpha: 0.18 })
      markersGfx.rect(z.x, z.y, z.w, z.h).stroke({ width: 1.25 / state.camera.zoom, color: col, alpha: 0.8 })
    }
  }

  // Selection outline + vertex handles + bbox scale handles.
  selectionGfx.clear()
  vertexGfx.clear()
  const sel = state.selection
  if (sel) {
    if (sel.kind === 'collider') {
      const c = level.colliders[sel.index]
      if (c) {
        const verts = c.vertices
        selectionGfx.moveTo(verts[0]![0], verts[0]![1])
        for (let i = 1; i < verts.length; i++) selectionGfx.lineTo(verts[i]![0], verts[i]![1])
        selectionGfx.closePath()
        selectionGfx.stroke({ width: 2 / state.camera.zoom, color: 0xFFFF80, alpha: 1 })
        // Bbox + 8 scale handles (Illustrator-style).
        const b = polygonBounds(verts)
        selectionGfx.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
          .stroke({ width: 1 / state.camera.zoom, color: 0xFFFF80, alpha: 0.4 })
        for (const h of HANDLE_KINDS) {
          const hp = handlePoint(h, b)
          const s = HANDLE_SIZE_PX / state.camera.zoom
          vertexGfx.rect(hp.x - s / 2, hp.y - s / 2, s, s)
            .fill({ color: 0xFFFF80 })
            .stroke({ width: 1 / state.camera.zoom, color: 0x161820 })
        }
        // Vertex handles (drawn over the bbox for draggability).
        for (const v of verts) {
          const r = VERTEX_HANDLE_PX / state.camera.zoom
          vertexGfx.rect(v[0] - r, v[1] - r, r * 2, r * 2)
            .fill({ color: 0x161820 })
            .stroke({ width: 1.5 / state.camera.zoom, color: 0xFFFF80 })
        }
      }
    }
    else if (sel.kind === 'zone') {
      const z = level.zones[sel.index]
      if (z) {
        selectionGfx.rect(z.x, z.y, z.w, z.h)
          .stroke({ width: 2 / state.camera.zoom, color: 0xFFFF80 })
        const b = { minX: z.x, minY: z.y, maxX: z.x + z.w, maxY: z.y + z.h }
        for (const h of HANDLE_KINDS) {
          const hp = handlePoint(h, b)
          const s = HANDLE_SIZE_PX / state.camera.zoom
          vertexGfx.rect(hp.x - s / 2, hp.y - s / 2, s, s)
            .fill({ color: 0xFFFF80 })
            .stroke({ width: 1 / state.camera.zoom, color: 0x161820 })
        }
      }
    }
    else {
      const pt = selectionMarker(level, sel)
      if (pt) {
        selectionGfx.circle(pt.x, pt.y, 10 / state.camera.zoom)
          .stroke({ width: 2 / state.camera.zoom, color: 0xFFFF80 })
      }
    }
  }

  // In-progress rect / zone-rect drag preview.
  ghostGfx.clear()
  if (ctx.dragging?.kind === 'rect' || ctx.dragging?.kind === 'zone-rect') {
    const [wx0, wy0] = (ctx.dragging.state0 as { worldStart: [number, number] }).worldStart
    const wx1 = snap(state, ctx.mouseWorld.x)
    const wy1 = snap(state, ctx.mouseWorld.y)
    const rx = Math.min(wx0, wx1)
    const ry = Math.min(wy0, wy1)
    const rw = Math.abs(wx1 - wx0)
    const rh = Math.abs(wy1 - wy0)
    const col = ctx.dragging.kind === 'zone-rect'
      ? (ZONE_COLORS[state.pendingZone?.type ?? 'gravity'])
      : 0x80FF80
    ghostGfx.rect(rx, ry, rw, rh)
      .fill({ color: col, alpha: 0.15 })
      .stroke({ width: 1.25 / state.camera.zoom, color: col, alpha: 0.9 })
  }

  // In-progress polygon ghost.
  if (state.polyBuffer && state.polyBuffer.length) {
    const buf = state.polyBuffer
    ghostGfx.moveTo(buf[0]![0], buf[0]![1])
    for (let i = 1; i < buf.length; i++) ghostGfx.lineTo(buf[i]![0], buf[i]![1])
    ghostGfx.lineTo(ctx.mouseWorld.x, ctx.mouseWorld.y)
    ghostGfx.stroke({ width: 1.25 / state.camera.zoom, color: 0x80FF80, alpha: 0.9 })
    for (const p of buf) {
      ghostGfx.circle(p[0], p[1], 3 / state.camera.zoom).fill({ color: 0x80FF80 })
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
  level: EditorState['level'],
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
  let s = 0; for (const n of arr) s += n
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

function wireInput(ctx: CanvasCtx): void {
  const canvas = ctx.app.canvas
  canvas.tabIndex = 0
  // Local alias so handlers don't repeatedly walk the ctx.
  const state = ctx.state

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const w = screenToWorld(ctx, sx, sy)
    ctx.mouseWorld = w
    updateCursorText(ctx, sx, sy)

    if (ctx.dragging) {
      const d = ctx.dragging
      const dxScreen = sx - d.startX
      const dyScreen = sy - d.startY
      const dxWorld = dxScreen / state.camera.zoom
      const dyWorld = dyScreen / state.camera.zoom
      if (d.kind === 'pan') {
        const s0 = d.state0 as { cx: number, cy: number }
        state.camera.x = s0.cx - dxWorld
        state.camera.y = s0.cy - dyWorld
        markDirty(state)
      }
      else if (d.kind === 'collider' && state.selection?.kind === 'collider') {
        const c = state.level.colliders[state.selection.index]
        const s0 = d.state0 as { verts: [number, number][] }
        if (c) {
          const dx = snap(state, s0.verts[0]![0] + dxWorld) - s0.verts[0]![0]
          const dy = snap(state, s0.verts[0]![1] + dyWorld) - s0.verts[0]![1]
          c.vertices = s0.verts.map(([vx, vy]) => [vx + dx, vy + dy])
          markDirty(state)
        }
      }
      else if (d.kind === 'vertex' && state.selection?.kind === 'collider') {
        const s0 = d.state0 as { collIdx: number, vertIdx: number, start: [number, number] }
        const c = state.level.colliders[s0.collIdx]
        if (c) {
          const nx = snap(state, s0.start[0] + dxWorld)
          const ny = snap(state, s0.start[1] + dyWorld)
          c.vertices[s0.vertIdx] = [nx, ny]
          markDirty(state)
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
        // New bbox edges as the handle moves, snapped. The anchor is the
        // opposite edge(s); they stay put.
        let newMinX = b.minX
        let newMaxX = b.maxX
        let newMinY = b.minY
        let newMaxY = b.maxY
        if (axes.sx === 1) newMaxX = Math.max(b.minX + 1, snap(state, b.maxX + dxWorld))
        else if (axes.sx === -1) newMinX = Math.min(b.maxX - 1, snap(state, b.minX + dxWorld))
        if (axes.sy === 1) newMaxY = Math.max(b.minY + 1, snap(state, b.maxY + dyWorld))
        else if (axes.sy === -1) newMinY = Math.min(b.maxY - 1, snap(state, b.minY + dyWorld))

        if (s0.selKind === 'collider') {
          const c = state.level.colliders[s0.index]
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
            markDirty(state)
          }
        }
        else {
          const z = state.level.zones[s0.index]
          if (z) {
            z.x = newMinX
            z.y = newMinY
            z.w = newMaxX - newMinX
            z.h = newMaxY - newMinY
            markDirty(state)
          }
        }
      }
      else if (d.kind === 'zone-move') {
        const s0 = d.state0 as { zoneIdx: number, startX: number, startY: number }
        const z = state.level.zones[s0.zoneIdx]
        if (z) {
          z.x = snap(state, s0.startX + dxWorld)
          z.y = snap(state, s0.startY + dyWorld)
          markDirty(state)
        }
      }
      else if (d.kind === 'rect' || d.kind === 'zone-rect') {
        markDirty(state) // preview in ghostGfx handled below
      }
    }
    else if (state.tool === 'polygon' && state.polyBuffer) {
      markDirty(state)
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
      ctx.dragging = { kind: 'pan', startX: sx, startY: sy, state0: { cx: state.camera.x, cy: state.camera.y } }
      return
    }

    if (e.button === 0) {
      onLeftDown(ctx, sx, sy, w)
    }
    else if (e.button === 2) {
      // Right-click cancels polygon mid-draw.
      if (state.polyBuffer) {
        state.polyBuffer = null
        markDirty(state)
      }
    }
  })

  canvas.addEventListener('pointerup', () => {
    if (ctx.dragging?.kind === 'rect')
      finishRect(ctx)
    else if (ctx.dragging?.kind === 'zone-rect')
      finishZoneRect(ctx)
    ctx.dragging = null
  })

  canvas.addEventListener('contextmenu', e => e.preventDefault())

  canvas.addEventListener('dblclick', () => {
    if (state.tool === 'polygon' && state.polyBuffer && state.polyBuffer.length >= 3)
      finishPolygon(ctx)
  })

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const before = screenToWorld(ctx, sx, sy)
    const scale = e.deltaY < 0 ? 1.15 : 1 / 1.15
    state.camera.zoom = Math.max(0.05, Math.min(8, state.camera.zoom * scale))
    const after = screenToWorld(ctx, sx, sy)
    state.camera.x += before.x - after.x
    state.camera.y += before.y - after.y
    markDirty(state)
  }, { passive: false })

  window.addEventListener('keydown', (e) => {
    if (isTypingInInput(e.target))
      return
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      undo(state); e.preventDefault(); return
    }
    if (mod && ((e.key === 'z' && e.shiftKey) || e.key === 'y' || e.key === 'Y')) {
      redo(state); e.preventDefault(); return
    }
    if (e.code === 'Space') { ctx.spaceHeld = true; canvas.style.cursor = 'grab' }
    else if (e.key === 'Enter' && state.tool === 'polygon' && state.polyBuffer && state.polyBuffer.length >= 3) {
      finishPolygon(ctx)
    }
    else if (e.key === 'Escape') {
      state.polyBuffer = null
      state.selection = null
      markDirty(state)
    }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selection) {
      deleteSelection(ctx)
      e.preventDefault()
    }
    else if (e.key === 'f' || e.key === 'F') {
      frameWorld(ctx)
    }
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { ctx.spaceHeld = false; canvas.style.cursor = '' }
  })
}

function isTypingInInput(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement))
    return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function onLeftDown(ctx: CanvasCtx, sx: number, sy: number, w: { x: number, y: number }): void {
  const state = ctx.state

  if (state.tool === 'select') {
    // Scale handle on the selected collider or zone takes priority — its
    // box is bigger than a vertex handle so the vertex shouldn't eat it.
    if (state.selection?.kind === 'collider') {
      const c = state.level.colliders[state.selection.index]
      if (c) {
        const b = polygonBounds(c.vertices)
        const handle = hitHandle(b, w.x, w.y, state.camera.zoom)
        if (handle) {
          pushUndo(state)
          ctx.dragging = {
            kind: 'scale',
            startX: sx,
            startY: sy,
            state0: { selKind: 'collider', index: state.selection.index, handle, startBounds: b, startVerts: c.vertices.map(v => [v[0], v[1]] as [number, number]) },
          }
          return
        }
      }
    }
    else if (state.selection?.kind === 'zone') {
      const z = state.level.zones[state.selection.index]
      if (z) {
        const b = { minX: z.x, minY: z.y, maxX: z.x + z.w, maxY: z.y + z.h }
        const handle = hitHandle(b, w.x, w.y, state.camera.zoom)
        if (handle) {
          pushUndo(state)
          ctx.dragging = {
            kind: 'scale',
            startX: sx,
            startY: sy,
            state0: { selKind: 'zone', index: state.selection.index, handle, startBounds: b, startVerts: [] },
          }
          return
        }
      }
    }

    // Vertex hit first (so you can grab a handle even if over fill).
    // Shift+click a vertex → delete. Alt+click an edge → insert vertex.
    if (state.selection?.kind === 'collider') {
      const c = state.level.colliders[state.selection.index]
      if (c) {
        const hitRadius = (VERTEX_HANDLE_PX + 2) / state.camera.zoom
        for (let i = 0; i < c.vertices.length; i++) {
          const v = c.vertices[i]!
          if (Math.abs(v[0] - w.x) <= hitRadius && Math.abs(v[1] - w.y) <= hitRadius) {
            // Shift+click → delete vertex (keep at least 3).
            const mod = lastMouseEvent
            if (mod?.shiftKey && c.vertices.length > 3) {
              pushUndo(state)
              c.vertices.splice(i, 1)
              markDirty(state)
              return
            }
            pushUndo(state)
            ctx.dragging = {
              kind: 'vertex',
              startX: sx,
              startY: sy,
              state0: { collIdx: state.selection.index, vertIdx: i, start: [v[0], v[1]] as [number, number] },
            }
            return
          }
        }
        // Alt+click on an edge → insert vertex.
        if (lastMouseEvent?.altKey) {
          const edgeHit = findEdgeHit(c.vertices, w.x, w.y, 6 / state.camera.zoom)
          if (edgeHit != null) {
            pushUndo(state)
            c.vertices.splice(edgeHit.afterIdx + 1, 0, [snap(state, w.x), snap(state, w.y)])
            markDirty(state)
            return
          }
        }
      }
    }
    // Marker hit (spawn/prowler/dummy/pickup). Highest-priority click target.
    const marker = hitMarker(state, w, 12 / state.camera.zoom)
    if (marker) {
      state.selection = marker
      markDirty(state)
      return
    }
    const hit = hitCollider(state, w)
    if (hit !== -1) {
      state.selection = { kind: 'collider', index: hit }
      markDirty(state)
      pushUndo(state)
      ctx.dragging = {
        kind: 'collider',
        startX: sx,
        startY: sy,
        state0: { verts: state.level.colliders[hit]!.vertices.map(v => [v[0], v[1]] as [number, number]) },
      }
      return
    }
    const zoneHit = hitZone(state, w)
    if (zoneHit !== -1) {
      state.selection = { kind: 'zone', index: zoneHit }
      markDirty(state)
      pushUndo(state)
      const z = state.level.zones[zoneHit]!
      ctx.dragging = {
        kind: 'zone-move',
        startX: sx,
        startY: sy,
        state0: { zoneIdx: zoneHit, startX: z.x, startY: z.y },
      }
      return
    }
    state.selection = null
    markDirty(state)
    return
  }

  if (state.tool === 'zone') {
    pushUndo(state)
    ctx.dragging = { kind: 'zone-rect', startX: sx, startY: sy, state0: { worldStart: [snap(state, w.x), snap(state, w.y)] } }
    return
  }

  if (state.tool === 'polygon') {
    const p: [number, number] = [snap(state, w.x), snap(state, w.y)]
    if (!state.polyBuffer)
      state.polyBuffer = []
    state.polyBuffer.push(p)
    markDirty(state)
    return
  }

  if (state.tool === 'rect') {
    ctx.dragging = { kind: 'rect', startX: sx, startY: sy, state0: { worldStart: [snap(state, w.x), snap(state, w.y)] } }
    return
  }

  // Placement tools.
  if (state.tool === 'spawn') {
    state.level.spawn = { x: snap(state, w.x), y: snap(state, w.y) }
    state.selection = { kind: 'spawn', index: 0 }
    markDirty(state)
  }
  else if (state.tool === 'prowler') {
    state.level.prowlers.push({ x: snap(state, w.x), y: snap(state, w.y) })
    state.selection = { kind: 'prowler', index: state.level.prowlers.length - 1 }
    markDirty(state)
  }
  else if (state.tool === 'dummy') {
    state.level.dummies.push({ x: snap(state, w.x), y: snap(state, w.y) })
    state.selection = { kind: 'dummy', index: state.level.dummies.length - 1 }
    markDirty(state)
  }
  else if (state.tool === 'pickup') {
    state.level.pickups.push({ x: snap(state, w.x), y: snap(state, w.y), kind: 'bigShot' })
    state.selection = { kind: 'pickup', index: state.level.pickups.length - 1 }
    markDirty(state)
  }
}

function hitCollider(state: EditorState, w: { x: number, y: number }): number {
  // Topmost (last drawn) wins — reverse iterate.
  for (let i = state.level.colliders.length - 1; i >= 0; i--) {
    const c = state.level.colliders[i]!
    if (pointInPolygon(w.x, w.y, c.vertices))
      return i
  }
  return -1
}

function hitZone(state: EditorState, w: { x: number, y: number }): number {
  for (let i = state.level.zones.length - 1; i >= 0; i--) {
    const z = state.level.zones[i]!
    if (w.x >= z.x && w.x <= z.x + z.w && w.y >= z.y && w.y <= z.y + z.h)
      return i
  }
  return -1
}

function hitMarker(
  state: EditorState,
  w: { x: number, y: number },
  r: number,
): { kind: 'spawn' | 'prowler' | 'dummy' | 'pickup', index: number } | null {
  const within = (x: number, y: number) => Math.hypot(x - w.x, y - w.y) <= r
  if (within(state.level.spawn.x, state.level.spawn.y))
    return { kind: 'spawn', index: 0 }
  for (let i = state.level.pickups.length - 1; i >= 0; i--) {
    const p = state.level.pickups[i]!
    if (within(p.x, p.y))
      return { kind: 'pickup', index: i }
  }
  for (let i = state.level.dummies.length - 1; i >= 0; i--) {
    const d = state.level.dummies[i]!
    if (within(d.x, d.y))
      return { kind: 'dummy', index: i }
  }
  for (let i = state.level.prowlers.length - 1; i >= 0; i--) {
    const p = state.level.prowlers[i]!
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
  const state = ctx.state
  if (!state.polyBuffer || state.polyBuffer.length < 3) {
    state.polyBuffer = null
    markDirty(state)
    return
  }
  pushUndo(state)
  const preset = state.pendingPreset
  const collider = {
    id: allocId(state),
    material: state.createMaterial,
    vertices: state.polyBuffer.map(p => [p[0], p[1]] as [number, number]),
    ...(preset?.oneWay ? { oneWay: true } : {}),
    ...(preset?.kinetic ? { kinetic: preset.kinetic } : {}),
    ...(preset?.surfaceMotion ? { surfaceMotion: preset.surfaceMotion } : {}),
    ...(preset?.launchPad ? { launchPad: preset.launchPad } : {}),
  }
  state.level.colliders.push(collider)
  state.selection = { kind: 'collider', index: state.level.colliders.length - 1 }
  state.polyBuffer = null
  state.pendingPreset = null
  state.tool = 'select'
  markDirty(state)
}

function finishRect(ctx: CanvasCtx): void {
  const state = ctx.state
  if (!ctx.dragging || ctx.dragging.kind !== 'rect')
    return
  const d = ctx.dragging
  const [wx0, wy0] = (d.state0 as { worldStart: [number, number] }).worldStart
  const wx1 = snap(state, ctx.mouseWorld.x)
  const wy1 = snap(state, ctx.mouseWorld.y)
  const x0 = Math.min(wx0, wx1)
  const y0 = Math.min(wy0, wy1)
  const x1 = Math.max(wx0, wx1)
  const y1 = Math.max(wy0, wy1)
  if (x1 - x0 < 1 || y1 - y0 < 1)
    return
  pushUndo(state)
  const verts: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  const preset = state.pendingPreset
  const collider = {
    id: allocId(state),
    material: state.createMaterial,
    vertices: verts,
    ...(preset?.oneWay ? { oneWay: true } : {}),
    ...(preset?.kinetic ? { kinetic: preset.kinetic } : {}),
    ...(preset?.surfaceMotion ? { surfaceMotion: preset.surfaceMotion } : {}),
    ...(preset?.launchPad ? { launchPad: preset.launchPad } : {}),
  }
  state.level.colliders.push(collider)
  state.selection = { kind: 'collider', index: state.level.colliders.length - 1 }
  state.pendingPreset = null
  state.tool = 'select'
  markDirty(state)
}

function finishZoneRect(ctx: CanvasCtx): void {
  const state = ctx.state
  if (!ctx.dragging || ctx.dragging.kind !== 'zone-rect')
    return
  const [wx0, wy0] = (ctx.dragging.state0 as { worldStart: [number, number] }).worldStart
  const wx1 = snap(state, ctx.mouseWorld.x)
  const wy1 = snap(state, ctx.mouseWorld.y)
  const x = Math.min(wx0, wx1)
  const y = Math.min(wy0, wy1)
  const w = Math.abs(wx1 - wx0)
  const h = Math.abs(wy1 - wy0)
  if (w < 4 || h < 4)
    return
  pushUndo(state)
  const preset = state.pendingZone ?? { type: 'gravity' as const, gravityScale: 0.5 }
  state.level.zones.push({
    id: allocId(state),
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
  state.selection = { kind: 'zone', index: state.level.zones.length - 1 }
  state.pendingZone = null
  state.tool = 'select'
  markDirty(state)
}

function deleteSelection(ctx: CanvasCtx): void {
  const state = ctx.state
  const sel = state.selection
  if (!sel)
    return
  pushUndo(state)
  if (sel.kind === 'collider') {
    state.level.colliders.splice(sel.index, 1)
  }
  else if (sel.kind === 'prowler') {
    state.level.prowlers.splice(sel.index, 1)
  }
  else if (sel.kind === 'dummy') {
    state.level.dummies.splice(sel.index, 1)
  }
  else if (sel.kind === 'pickup') {
    state.level.pickups.splice(sel.index, 1)
  }
  else if (sel.kind === 'zone') {
    state.level.zones.splice(sel.index, 1)
  }
  // Spawn can't be deleted — there's always exactly one.
  state.selection = null
  markDirty(state)
}

function frameWorld(ctx: CanvasCtx): void {
  const state = ctx.state
  const margin = 40
  const vw = ctx.app.screen.width
  const vh = ctx.app.screen.height
  const zoomX = (vw - margin * 2) / state.level.worldWidth
  const zoomY = (vh - margin * 2) / state.level.worldHeight
  state.camera.zoom = Math.max(0.05, Math.min(8, Math.min(zoomX, zoomY)))
  state.camera.x = state.level.worldWidth / 2
  state.camera.y = state.level.worldHeight / 2
  markDirty(state)
}

function updateCursorText(ctx: CanvasCtx, sx: number, sy: number): void {
  ctx.cursorText.text = `x=${Math.round(ctx.mouseWorld.x)}  y=${Math.round(ctx.mouseWorld.y)}  zoom=${ctx.state.camera.zoom.toFixed(2)}`
  ctx.cursorText.x = sx + 14
  ctx.cursorText.y = sy + 10
}

export function setTool(ctx: CanvasCtx, tool: Tool): void {
  ctx.state.tool = tool
  ctx.state.polyBuffer = null
  markDirty(ctx.state)
}

export { frameWorld as frameWorldViewport }
