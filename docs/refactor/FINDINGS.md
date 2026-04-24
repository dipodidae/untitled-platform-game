# Findings — bugs / smells noticed during the refactor

The refactor is pure — zero behavior changes. Anything that looked like a
bug, smell, or load-bearing oddity got logged here for a future session
to triage.

## 1. Duplicate `BULLET_KINDS` / `BulletKindName` definitions

**Files:** `src/combat/bullet.ts` and `src/combat/weapons/index.ts`.

Both files independently define a `BULLET_KINDS` map and a
`BulletKindName` type. They drifted at some point — the two are not
guaranteed identical (and aren't a single source of truth).

Pre-existing the refactor. Not unified per the no-behavior-change rule.
Recommend: pick one as authoritative (probably `combat/weapons/index.ts`
since the weapons sub-folder is the natural home), make `bullet.ts`
import from it, delete the duplicate.

## 2. Other zone types (wind/gravity/hazard/trigger) authorable but not wired at runtime

**Context:** earlier in the session a `git reset --hard` wiped uncommitted
work that included the runtime player.ts logic for consuming wind /
gravity / hazard / trigger zones. The zone types still exist in
`world/level.ts`, the editor still places them, and `Level.zones` still
carries them — but `player.ts` only consumes `goal` and `spawnPoint`.

The existing brushes for these types are marked `live: true` in
`editor/brushes.ts` even though the runtime ignores them. This conflicts
with the "Editor ↔ engine sync" rule in CLAUDE.md.

Recommend: either re-implement the runtime consumers (re-add the per-zone
behavior in `updatePlayer`) or set those brushes to `live: false` to be
honest about the current state.

## 3. `src/combat/bullet.ts` and `src/combat/weapons/bigShot.ts` both define `bigShot` weapon profile

Same root cause as finding 1 — the per-weapon files in `weapons/` weren't
wired up as the source of truth. Recommend deleting one and importing
from the other.

## 4. `src/world/level.ts` schema doc-comment is stale

The top-of-file JSON schema example references materials `"dirt" | "stone"
| "steel" | "hazard"` — the actual `MaterialName` union is `'glass' |
'bone' | 'bone_fragile' | 'resonant' | 'soft' | 'shard'`. The schema
comment was left from an earlier iteration.

Recommend: update the doc comment to match `MaterialName`.

## 5. `vite.config.ts` `editor-save` middleware is dev-only and unauthenticated

By design, but worth flagging: anyone with network access to the dev
server can `POST /__editor/save?name=level1` to overwrite a bundled
level. Acceptable because dev server is local-only. If the dev server
ever binds publicly, restrict to localhost or add a token.

## 6. `editor/sidebar.ts` was deleted but the import comment in `editor/state.ts` (and elsewhere) still says "DOM sidebar"

Cosmetic, but the docstring no longer matches the reality (sidebar was
split into `leftPanel.ts` + `rightPanel.ts`). Recommend a doc-comment
sweep across the editor.

## How to triage

These are tickets, not the refactor's responsibility. When you decide to
fix one, prefer a small dedicated commit and an ADR if the fix changes
shape significantly.
