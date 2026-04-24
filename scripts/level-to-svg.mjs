#!/usr/bin/env node
// Convert a level JSON file into an Inkscape-friendly SVG so the level
// can be edited visually. The SVG is round-trippable via svg-to-level.mjs.
//
// Usage:
//   node scripts/level-to-svg.mjs <in.json> <out.svg>
// Example:
//   node scripts/level-to-svg.mjs src/levels/level1.json levels-svg/level1.svg
//
// Conventions baked into the output:
//   - viewBox matches worldWidth/worldHeight (SVG Y-down = game Y-down)
//   - One <g inkscape:groupmode="layer"> per material named "material:<name>"
//   - Each collider is a <polygon points="x,y x,y …">
//   - Kinetic + oneWay config on `inkscape:label`, e.g.:
//       "id:12;kinetic=rotor,speed=0.35"
//       "id:42;oneWay"
//   - Spawn/prowlers/dummies are layers of <circle> elements
//   - Dummies encode hp as `hp:3` in their `inkscape:label`

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const MATERIAL_FILL = {
  bone: '#c8b080',
  bone_fragile: '#a08050',
  glass: '#7ac5d8',
  resonant: '#c070c0',
  soft: '#8a6ec0',
}

const MATERIAL_STROKE = {
  bone: '#5a4228',
  bone_fragile: '#4a3218',
  glass: '#2a4a58',
  resonant: '#603060',
  soft: '#3a2a60',
}

const MATERIAL_ORDER = ['bone', 'bone_fragile', 'soft', 'glass', 'resonant']

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function colliderLabel(c) {
  const parts = [`id:${c.id}`]
  if (c.oneWay)
    parts.push('oneWay')
  if (c.kinetic) {
    const k = c.kinetic
    const extras = Object.entries(k)
      .filter(([key]) => key !== 'type')
      .map(([key, v]) => `${key}=${v}`)
    parts.push([`kinetic=${k.type}`, ...extras].join(','))
  }
  return parts.join(';')
}

function polygonEl(c) {
  const points = c.vertices.map(([x, y]) => `${x},${y}`).join(' ')
  const fill = MATERIAL_FILL[c.material] ?? '#888'
  const stroke = MATERIAL_STROKE[c.material] ?? '#222'
  const label = escapeAttr(colliderLabel(c))
  return `    <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1" inkscape:label="${label}"/>`
}

function layerOpen(label) {
  return `  <g inkscape:groupmode="layer" inkscape:label="${escapeAttr(label)}">`
}

function layerClose() {
  return `  </g>`
}

function build(level) {
  const w = level.worldWidth
  const h = level.worldHeight

  const byMaterial = new Map()
  for (const c of level.colliders) {
    if (!byMaterial.has(c.material))
      byMaterial.set(c.material, [])
    byMaterial.get(c.material).push(c)
  }

  const lines = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg"`)
  lines.push(`     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`)
  lines.push(`     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd"`)
  lines.push(`     width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`)
  lines.push(`  <sodipodi:namedview id="nv" pagecolor="#202028" bordercolor="#000" inkscape:pageopacity="1" inkscape:document-units="px"/>`)
  lines.push(`  <rect x="0" y="0" width="${w}" height="${h}" fill="#161820" stroke="none" inkscape:label="background" sodipodi:insensitive="true"/>`)

  // Material layers, in a stable order so Inkscape's layer panel reads
  // intuitively — ground first, decorative last.
  const orderedMats = [
    ...MATERIAL_ORDER.filter(m => byMaterial.has(m)),
    ...[...byMaterial.keys()].filter(m => !MATERIAL_ORDER.includes(m)),
  ]
  for (const mat of orderedMats) {
    lines.push(layerOpen(`material:${mat}`))
    for (const c of byMaterial.get(mat)) {
      lines.push(polygonEl(c))
    }
    lines.push(layerClose())
  }

  // Spawn point (single circle).
  lines.push(layerOpen('spawn'))
  lines.push(`    <circle cx="${level.spawn.x}" cy="${level.spawn.y}" r="6" fill="#40ff60" stroke="#205030" stroke-width="1" inkscape:label="spawn"/>`)
  lines.push(layerClose())

  // Prowlers.
  lines.push(layerOpen('prowlers'))
  for (const p of (level.prowlers ?? [])) {
    lines.push(`    <circle cx="${p.x}" cy="${p.y}" r="8" fill="#c040ff" stroke="#602080" stroke-width="1"/>`)
  }
  lines.push(layerClose())

  // Dummies.
  lines.push(layerOpen('dummies'))
  for (const d of (level.dummies ?? [])) {
    const label = d.hp != null ? `hp:${d.hp}` : ''
    lines.push(`    <circle cx="${d.x}" cy="${d.y}" r="6" fill="#ffa040" stroke="#a04020" stroke-width="1" inkscape:label="${escapeAttr(label)}"/>`)
  }
  lines.push(layerClose())

  // Pickups — `inkscape:label="kind:bigShot"`.
  lines.push(layerOpen('pickups'))
  for (const p of (level.pickups ?? [])) {
    lines.push(`    <circle cx="${p.x}" cy="${p.y}" r="7" fill="#ff6040" stroke="#a02020" stroke-width="1" inkscape:label="${escapeAttr(`kind:${p.kind}`)}"/>`)
  }
  lines.push(layerClose())

  lines.push('</svg>')
  lines.push('')
  return lines.join('\n')
}

const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) {
  console.error('Usage: node scripts/level-to-svg.mjs <in.json> <out.svg>')
  process.exit(1)
}

const level = JSON.parse(readFileSync(resolve(inPath), 'utf8'))
const svg = build(level)
mkdirSync(dirname(resolve(outPath)), { recursive: true })
writeFileSync(resolve(outPath), svg, 'utf8')
console.log(`Wrote ${outPath} (${level.colliders.length} colliders)`)
