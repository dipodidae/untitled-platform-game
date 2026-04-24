# Editing levels in Inkscape

Levels in `src/levels/*.json` can be round-tripped through an Inkscape-friendly SVG so you can draw geometry visually instead of hand-writing vertex arrays.

## Workflow

```sh
# 1. JSON → SVG (once, to start editing a level)
npm run level:to-svg src/levels/level1.json levels-svg/level1.svg

# 2. Open levels-svg/level1.svg in Inkscape, edit, save in place.
#    Any Inkscape save format works, but "Inkscape SVG" preserves labels best.

# 3. SVG → JSON (after editing)
npm run level:from-svg levels-svg/level1.svg src/levels/level1.json
```

After step 3, run the game with `npm run dev` and the new layout is live.

## SVG structure

The exporter writes a structured SVG so the importer can read it back deterministically. Keep this structure intact while editing.

- **Root** — `viewBox="0 0 worldWidth worldHeight"`, matching `width` and `height`. Change these on the root to resize the world. SVG Y-down matches the game's Y-down, so no flipping.
- **Layers** (`<g inkscape:groupmode="layer" inkscape:label="...">`) group shapes by role:
  - `material:bone`, `material:bone_fragile`, `material:glass`, `material:resonant`, `material:soft` — one per material you use.
  - `spawn` — the player start point.
  - `prowlers` — prowler spawn points.
  - `dummies` — dummy spawn points.
  - `pickups` — item pickups. Each `<circle>` needs `inkscape:label="kind:<itemId>"` (e.g. `kind:bigShot`). The item id must exist in `src/items/index.ts`.
- **Shapes** inside material layers become colliders. Supported:
  - `<polygon points="x,y x,y ...">` — easiest. Draw with Inkscape's polygon tool (`*` key) or pen tool (`p` key) for straight segments, then close the path.
  - `<rect x y width height>` — plain rectangles, also fine.
  - `<path d="M x,y L x,y ... Z">` — only linear commands (`M`, `L`, `H`, `V`, `Z`). If Inkscape gives you curves, use **Extensions → Modify Path → Flatten Beziers** to convert them.
- **Circles** inside `spawn` / `prowlers` / `dummies` layers mark spawn locations. Position = `(cx, cy)`. The radius is only for visibility.

## Per-shape config via `inkscape:label`

Open **Object → Object Properties** on any shape in Inkscape to set its label. Tokens are `;`-separated:

| Token | Where it goes | Meaning |
|---|---|---|
| `id:N` | collider polygon | Stable id. Auto-assigned if omitted. |
| `oneWay` | collider polygon | Collide only from above (platforms). |
| `kinetic=rotor,speed=0.4,torqueDecay=3` | collider polygon | Rotating platform. |
| `kinetic=breather,frequency=0.6,amplitude=2` | collider polygon | Vertex-oscillating shape. |
| `kinetic=spring,stiffness=180,damping=8` | collider polygon | Springy vertical platform. |
| `hp:3` | dummy circle | Dummy starts with 3 HP (default 1). |
| `kind:bigShot` | pickup circle | Which item this pickup grants. Must match an id in `src/items/index.ts`. |

Examples:
- Rotating bone block: `id:54;kinetic=rotor,speed=0.35`
- One-way soft platform: `id:42;oneWay`
- Tough dummy: `hp:5`

Unknown tokens are ignored. See `src/kinetic.ts` for the full set of `kinetic` parameters.

## Tips

- **Snapping**: enable **File → Document Properties → Grids** with 10-unit steps for clean integer coordinates. Vertices don't have to be integers but readable diffs help.
- **Colors**: material layer fills are cosmetic — the material comes from the layer's label, not the shape's fill. Recolor freely.
- **New layers**: want a fresh material layer? Layers → Add Layer, name it `material:bone` (or whatever material). Moving shapes between layers changes their material.
- **Measuring**: the background `<rect>` marks the world bounds and is locked (`sodipodi:insensitive="true"`); don't edit it directly — change `width/height/viewBox` on the root SVG instead.

## What round-trips

Running `to-svg` then `from-svg` reproduces the original JSON byte-for-byte on `level1.json` and `level2.json`. If you add features to the JSON schema (new kinetic types, new dummy fields), update both scripts so they survive the round trip.

## What doesn't

- **Text, filters, groups (non-layer), symbols, images** — ignored on import.
- **Transforms** (`transform="translate(...)"`) on shapes — not applied. Keep geometry at absolute coordinates. If Inkscape adds a transform, select the shape and do **Object → Flatten Transform** (or just drag the shape to commit the transform into its points).
- **Bezier curves** — only linear path commands are supported. Flatten curves before export.
