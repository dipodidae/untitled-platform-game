# Progress — DDD-lite refactor execution log

Append-only. One line per migration step.

- 2026-04-24 Discovery + plan + foundational ADRs (0001–0004) committed.
- 2026-04-24 Migration 1/8 — `shared-kernel/` extracted (vec2 + polygon). Commit `8324a30`.
- 2026-04-24 Migration 2/8 — `physics/` absorbed `sat`; `math/` retired. Commit `2321e6b`.
- 2026-04-24 Migration 3/8 — `kinetic/` nested under `world/`. Commit `d49eeca`.
- 2026-04-24 Migration 4/8 — `combat/` consolidated bullets, ruptures, weapons. Commit `ac3f799`.
- 2026-04-24 Migration 5/8 — `player/` co-located player + instability. Commit `ca97afd`.
- 2026-04-24 Migration 6/8 — `render/` absorbed camera + fx. Commit `d358a6f`.
- 2026-04-24 Migration 7/8 — `input/` got its own folder. Commit `ea9a1d4`.
- 2026-04-24 Migration 8/8 — `session/` consolidated game loop, lifecycle, events. Commit `45ecab7`.
- 2026-04-24 Cleanup — `physics.ts` and `render.ts` barrels nested into their context folders.
- 2026-04-24 ADRs 0005–0012 written.
- 2026-04-24 FINDINGS.md captures pre-existing oddities (BULLET_KINDS duplication, runtime gap on wind/gravity/hazard/trigger zones, etc.).
- 2026-04-24 12 `CONTEXT.md` files written (one per bounded context).
- 2026-04-24 Global docs: TOPOLOGY.md, GLOSSARY.md, AGENTS.md.
- 2026-04-24 CLAUDE.md updated with adherence section.
- 2026-04-24 Final push to `main`.
- 2026-04-24 CONTEXT.md subagent surfaced 6 additional findings (FIND 7–12); appended to FINDINGS.md. Most consequential: BULLET_KINDS values disagree across the duplicate; levelManager isn't wired to the running game; pickup system is authored but dead at runtime.
