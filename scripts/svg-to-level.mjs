#!/usr/bin/env node
// Parse an Inkscape-edited SVG back into the project's level JSON format.
// Round-trips output from level-to-svg.mjs. Tolerates minor edits Inkscape
// makes on save (reordered attributes, added sodipodi metadata) but does
// NOT support arbitrary SVG — keep editing within the conventions below.
//
// Usage:
//   node scripts/svg-to-level.mjs <in.svg> <out.json>
//
// Conventions (must be preserved for re-import):
//   - Shapes live inside <g inkscape:label="material:<name>"> layers.
//   - Colliders are <polygon points="x,y ..."> or <rect x y width height>
//     or <path d="M x,y L x,y ... Z"> with linear segments only.
//   - `inkscape:label` on the shape carries config, semicolon-separated:
//       "id:12;kinetic=rotor,speed=0.35"
//       "oneWay"
//     Missing `id:` gets auto-assigned at import.
//   - Spawn layer: `inkscape:label="spawn"`, first <circle> defines spawn.
//   - Prowlers layer: `inkscape:label="prowlers"`, one <circle> per prowler.
//   - Dummies layer: `inkscape:label="dummies"`, one <circle> per dummy;
//     `inkscape:label="hp:3"` sets custom hp.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── tiny XML tokenizer (subset: elements + attributes, no CDATA) ────────
// Returns a tree of { tag, attrs, children: [] | string } nodes.
function parseXML(src) {
  let i = 0
  // Skip XML prolog + doctype + comments.
  function skipNoise() {
    while (i < src.length) {
      if (src.startsWith('<?', i)) {
        const end = src.indexOf('?>', i)
        if (end < 0)
          throw new Error('Unterminated <?...?>')
        i = end + 2
      }
      else if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i)
        if (end < 0)
          throw new Error('Unterminated <!--')
        i = end + 3
      }
      else if (src.startsWith('<!', i)) {
        const end = src.indexOf('>', i)
        if (end < 0)
          throw new Error('Unterminated <!')
        i = end + 1
      }
      else if (/\s/.test(src[i])) {
        i++
      }
      else {
        break
      }
    }
  }

  function readTag() {
    if (src[i] !== '<')
      throw new Error(`Expected '<' at ${i}`)
    i++
    const isClose = src[i] === '/'
    if (isClose)
      i++
    const nameStart = i
    while (i < src.length && !/[\s/>]/.test(src[i])) i++
    const tag = src.slice(nameStart, i)
    const attrs = {}
    while (i < src.length) {
      // Skip whitespace.
      while (i < src.length && /\s/.test(src[i])) i++
      if (src[i] === '/' || src[i] === '>')
        break
      // Attribute name.
      const aStart = i
      while (i < src.length && !/[\s=/>]/.test(src[i])) i++
      const aName = src.slice(aStart, i)
      while (i < src.length && /\s/.test(src[i])) i++
      let value = ''
      if (src[i] === '=') {
        i++
        while (i < src.length && /\s/.test(src[i])) i++
        const quote = src[i]
        if (quote !== '"' && quote !== '\'')
          throw new Error(`Expected quote at ${i}`)
        i++
        const vStart = i
        while (i < src.length && src[i] !== quote) i++
        value = src.slice(vStart, i)
        i++ // consume closing quote
      }
      attrs[aName] = decodeEntities(value)
    }
    let selfClose = false
    if (src[i] === '/') {
      selfClose = true
      i++
    }
    if (src[i] !== '>')
      throw new Error(`Expected '>' at ${i}`)
    i++
    return { tag, attrs, isClose, selfClose }
  }

  function decodeEntities(s) {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, '\'')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  }

  skipNoise()
  const root = { tag: '#doc', attrs: {}, children: [] }
  const stack = [root]
  while (i < src.length) {
    if (src[i] === '<') {
      if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i)
        i = end < 0 ? src.length : end + 3
        continue
      }
      const { tag, attrs, isClose, selfClose } = readTag()
      if (isClose) {
        while (stack.length > 1 && stack[stack.length - 1].tag !== tag) stack.pop()
        if (stack.length <= 1)
          throw new Error(`Unmatched </${tag}>`)
        stack.pop()
      }
      else {
        const node = { tag, attrs, children: [] }
        stack[stack.length - 1].children.push(node)
        if (!selfClose)
          stack.push(node)
      }
    }
    else {
      // Text / whitespace — ignored for our subset.
      i++
    }
  }
  return root
}

// ─── helpers ─────────────────────────────────────────────────────────────

function findChildren(node, pred) {
  const out = []
  const walk = (n) => {
    for (const c of (n.children || [])) {
      if (pred(c))
        out.push(c)
      walk(c)
    }
  }
  walk(node)
  return out
}

function layerLabel(g) {
  if (g.tag !== 'g')
    return null
  const groupmode = g.attrs['inkscape:groupmode']
  if (groupmode !== 'layer')
    return null
  return g.attrs['inkscape:label'] ?? null
}

function parseLabel(raw) {
  const out = { id: null, oneWay: false, kinetic: null, hp: null, kind: null }
  if (!raw)
    return out
  for (const rawToken of raw.split(';')) {
    const token = rawToken.trim()
    if (!token)
      continue
    if (token === 'oneWay' || token === 'oneway') {
      out.oneWay = true
    }
    else if (token.startsWith('id:')) {
      out.id = Number.parseInt(token.slice(3), 10)
    }
    else if (token.startsWith('hp:')) {
      out.hp = Number.parseInt(token.slice(3), 10)
    }
    else if (token.startsWith('kind:')) {
      out.kind = token.slice('kind:'.length)
    }
    else if (token.startsWith('kinetic=')) {
      const body = token.slice('kinetic='.length)
      const parts = body.split(',')
      const k = { type: parts[0] }
      for (let i = 1; i < parts.length; i++) {
        const [key, v] = parts[i].split('=')
        if (key && v !== undefined) {
          const num = Number(v)
          k[key] = Number.isFinite(num) ? num : v
        }
      }
      out.kinetic = k
    }
  }
  return out
}

function parsePoints(pointsAttr) {
  const verts = []
  const tokens = pointsAttr.trim().split(/[\s,]+/).filter(Boolean)
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    verts.push([Number(tokens[i]), Number(tokens[i + 1])])
  }
  return verts
}

function rectToVerts(attrs) {
  const x = Number(attrs.x ?? 0)
  const y = Number(attrs.y ?? 0)
  const w = Number(attrs.width ?? 0)
  const h = Number(attrs.height ?? 0)
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
}

// Path subset: sequences of M/L commands with optional Z. Absolute + relative
// supported. Curves (C, Q, A, S, T) are rejected — they don't map to polygons.
function pathToVerts(d) {
  const verts = []
  const tokens = d.match(/[MLHVZ]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)
  if (!tokens)
    return verts
  let cmd = null
  let x = 0; let y = 0
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[a-z]$/i.test(t)) {
      cmd = t
      i++
      if (cmd === 'Z' || cmd === 'z')
        continue
      continue
    }
    if (!cmd)
      throw new Error(`Path starts without command: ${d}`)
    const isRel = cmd === cmd.toLowerCase()
    if (cmd === 'M' || cmd === 'm') {
      const dx = Number(t); const dy = Number(tokens[i + 1])
      x = isRel ? x + dx : dx
      y = isRel ? y + dy : dy
      verts.push([x, y])
      i += 2
      cmd = isRel ? 'l' : 'L' // implicit L after M
    }
    else if (cmd === 'L' || cmd === 'l') {
      const dx = Number(t); const dy = Number(tokens[i + 1])
      x = isRel ? x + dx : dx
      y = isRel ? y + dy : dy
      verts.push([x, y])
      i += 2
    }
    else if (cmd === 'H' || cmd === 'h') {
      const dx = Number(t)
      x = isRel ? x + dx : dx
      verts.push([x, y])
      i += 1
    }
    else if (cmd === 'V' || cmd === 'v') {
      const dy = Number(t)
      y = isRel ? y + dy : dy
      verts.push([x, y])
      i += 1
    }
    else {
      throw new Error(`Unsupported path command '${cmd}' — only M/L/H/V/Z are allowed (use Object → Flatten if needed)`)
    }
  }
  // Drop a trailing duplicate (closed polygon ends where it started).
  if (verts.length > 1) {
    const a = verts[0]
    const b = verts[verts.length - 1]
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6)
      verts.pop()
  }
  return verts
}

function shapeVerts(node) {
  if (node.tag === 'polygon')
    return parsePoints(node.attrs.points ?? '')
  if (node.tag === 'rect')
    return rectToVerts(node.attrs)
  if (node.tag === 'path')
    return pathToVerts(node.attrs.d ?? '')
  return null
}

// ─── main ────────────────────────────────────────────────────────────────

function convert(src) {
  const doc = parseXML(src)
  const svg = doc.children.find(c => c.tag === 'svg')
  if (!svg)
    throw new Error('No <svg> root found')
  const worldWidth = Number(svg.attrs.width ?? svg.attrs.viewBox?.split(/\s+/)[2] ?? 0)
  const worldHeight = Number(svg.attrs.height ?? svg.attrs.viewBox?.split(/\s+/)[3] ?? 0)

  const layers = findChildren(svg, n => layerLabel(n) != null)

  const colliders = []
  let spawn = null
  const prowlers = []
  const dummies = []
  const pickups = []
  const usedIds = new Set()
  let nextAutoId = 1

  function allocId(preferred) {
    if (preferred != null && Number.isFinite(preferred) && !usedIds.has(preferred)) {
      usedIds.add(preferred)
      return preferred
    }
    while (usedIds.has(nextAutoId)) nextAutoId++
    usedIds.add(nextAutoId)
    return nextAutoId++
  }

  for (const layer of layers) {
    const label = layerLabel(layer)
    if (label.startsWith('material:')) {
      const material = label.slice('material:'.length)
      const shapes = findChildren(layer, n => n.tag === 'polygon' || n.tag === 'rect' || n.tag === 'path')
      for (const s of shapes) {
        const verts = shapeVerts(s)
        if (!verts || verts.length < 3)
          continue
        const cfg = parseLabel(s.attrs['inkscape:label'])
        const entry = {
          id: allocId(cfg.id),
          material,
          vertices: verts,
        }
        if (cfg.oneWay)
          entry.oneWay = true
        if (cfg.kinetic)
          entry.kinetic = cfg.kinetic
        colliders.push(entry)
      }
    }
    else if (label === 'spawn') {
      const circles = findChildren(layer, n => n.tag === 'circle')
      const c = circles[0]
      if (c)
        spawn = { x: Number(c.attrs.cx), y: Number(c.attrs.cy) }
    }
    else if (label === 'prowlers') {
      for (const c of findChildren(layer, n => n.tag === 'circle')) {
        prowlers.push({ x: Number(c.attrs.cx), y: Number(c.attrs.cy) })
      }
    }
    else if (label === 'dummies') {
      for (const c of findChildren(layer, n => n.tag === 'circle')) {
        const entry = { x: Number(c.attrs.cx), y: Number(c.attrs.cy) }
        const cfg = parseLabel(c.attrs['inkscape:label'])
        if (cfg.hp != null && Number.isFinite(cfg.hp))
          entry.hp = cfg.hp
        dummies.push(entry)
      }
    }
    else if (label === 'pickups') {
      for (const c of findChildren(layer, n => n.tag === 'circle')) {
        const cfg = parseLabel(c.attrs['inkscape:label'])
        if (!cfg.kind)
          continue // no kind → skip silently; placeholder shapes OK
        pickups.push({ x: Number(c.attrs.cx), y: Number(c.attrs.cy), kind: cfg.kind })
      }
    }
  }

  if (!spawn)
    throw new Error('No spawn layer / circle found')

  colliders.sort((a, b) => a.id - b.id)

  const level = { spawn, worldWidth, worldHeight, colliders }
  if (prowlers.length)
    level.prowlers = prowlers
  if (dummies.length)
    level.dummies = dummies
  if (pickups.length)
    level.pickups = pickups
  return level
}

const [inPath, outPath] = process.argv.slice(2)
if (!inPath || !outPath) {
  console.error('Usage: node scripts/svg-to-level.mjs <in.svg> <out.json>')
  process.exit(1)
}

const svg = readFileSync(resolve(inPath), 'utf8')
const level = convert(svg)
writeFileSync(resolve(outPath), `${JSON.stringify(level, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outPath} (${level.colliders.length} colliders)`)
