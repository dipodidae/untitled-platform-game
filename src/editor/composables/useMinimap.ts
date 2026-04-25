// Minimap composable — tiny top-down overview of the level, drawn onto a
// 2D canvas for simplicity. The viewport rectangle shows what's currently
// framed in the main editor. Clicking on the minimap teleports the camera
// there. This matters for BIG levels where scrolling with a mouse alone is slow.

import type { useEditorStore } from '../stores/editor'
import { storeToRefs } from 'pinia'
import { watchEffect } from 'vue'

const MATERIAL_COLORS: Record<string, string> = {
  bone: '#C8B080',
  bone_fragile: '#A08050',
  glass: '#7AC5D8',
  resonant: '#C070C0',
  soft: '#8A6EC0',
}

export function useMinimap(
  host: HTMLElement,
  store: ReturnType<typeof useEditorStore>,
  getViewport: () => { w: number, h: number },
): void {
  const { level, camera } = storeToRefs(store)

  const canvas = document.createElement('canvas')
  canvas.width = host.clientWidth * (window.devicePixelRatio ?? 1)
  canvas.height = host.clientHeight * (window.devicePixelRatio ?? 1)
  canvas.style.width = `${host.clientWidth}px`
  canvas.style.height = `${host.clientHeight}px`
  host.appendChild(canvas)
  const ctx2d = canvas.getContext('2d')!

  const render = () => {
    const dpr = window.devicePixelRatio ?? 1
    const w = host.clientWidth
    const h = host.clientHeight
    if (canvas.width !== w * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx2d.fillStyle = '#0a0b0f'
    ctx2d.fillRect(0, 0, w, h)

    const lv = level.value
    const cam = camera.value
    const sx = w / lv.worldWidth
    const sy = h / lv.worldHeight
    const s = Math.min(sx, sy)
    const offX = (w - lv.worldWidth * s) / 2
    const offY = (h - lv.worldHeight * s) / 2
    const wx = (x: number) => offX + x * s
    const wy = (y: number) => offY + y * s

    ctx2d.fillStyle = '#161820'
    ctx2d.fillRect(wx(0), wy(0), lv.worldWidth * s, lv.worldHeight * s)

    for (const c of lv.colliders) {
      ctx2d.beginPath()
      const verts = c.vertices
      if (!verts.length)
        continue
      ctx2d.moveTo(wx(verts[0]![0]), wy(verts[0]![1]))
      for (let i = 1; i < verts.length; i++) ctx2d.lineTo(wx(verts[i]![0]), wy(verts[i]![1]))
      ctx2d.closePath()
      ctx2d.fillStyle = MATERIAL_COLORS[c.material] ?? '#888'
      ctx2d.globalAlpha = c.oneWay ? 0.5 : 0.9
      ctx2d.fill()
      ctx2d.globalAlpha = 1
    }

    // Spawn + markers.
    drawDot(ctx2d, wx(lv.spawn.x), wy(lv.spawn.y), '#40ff60')
    for (const p of lv.pickups) drawDot(ctx2d, wx(p.x), wy(p.y), '#ff6040')
    for (const p of lv.prowlers) drawDot(ctx2d, wx(p.x), wy(p.y), '#c040ff')
    for (const d of lv.dummies) drawDot(ctx2d, wx(d.x), wy(d.y), '#ffa040')

    // Viewport rect.
    const vp = getViewport()
    const halfW = vp.w / 2 / cam.zoom
    const halfH = vp.h / 2 / cam.zoom
    ctx2d.strokeStyle = '#80e0ff'
    ctx2d.lineWidth = 1
    ctx2d.strokeRect(
      wx(cam.x - halfW),
      wy(cam.y - halfH),
      halfW * 2 * s,
      halfH * 2 * s,
    )
  }

  // Replace state.listeners.add(render) with Vue watchEffect.
  watchEffect(() => render())

  // Click / drag to teleport camera.
  let dragging = false
  const onMove = (e: MouseEvent) => {
    if (!dragging && e.type === 'mousemove')
      return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const lv = level.value
    const w = rect.width
    const h = rect.height
    const sx = w / lv.worldWidth
    const sy = h / lv.worldHeight
    const s = Math.min(sx, sy)
    const offX = (w - lv.worldWidth * s) / 2
    const offY = (h - lv.worldHeight * s) / 2
    camera.value.x = (x - offX) / s
    camera.value.y = (y - offY) / s
    // Vue reactivity picks up the camera mutation automatically.
  }
  canvas.addEventListener('mousedown', (e) => { dragging = true; onMove(e) })
  canvas.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', () => { dragging = false })
}

function drawDot(c: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  c.fillStyle = color
  c.beginPath()
  c.arc(x, y, 2, 0, Math.PI * 2)
  c.fill()
}
