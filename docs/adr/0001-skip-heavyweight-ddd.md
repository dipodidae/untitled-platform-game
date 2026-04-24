# ADR 0001 — Skip heavyweight DDD machinery for this codebase

**Status:** Accepted
**Date:** 2026-04-24

## Context

A refactor request asked us to apply Clean Architecture + DDD + Hexagonal
patterns from the `clean-ddd-hexagonal` skill. The user specified that the
**skill wins on architecture specifics** when the prompt and skill conflict.

The skill's own "When to Use / Skip When" table:

| Use When | Skip When |
|---|---|
| Complex business domain | Simple CRUD, few business rules |
| Long-lived system (years) | Prototype, MVP, throwaway code |
| Team of 5+ developers | Solo developer or small team (1–2) |
| Multiple entry points | Single entry point |
| Need to swap infrastructure | Fixed infrastructure |
| High test coverage required | Quick scripts, internal tools |

This codebase: solo developer, 62 source files, prototype-stage game,
fixed infrastructure (Pixi v8 / Vite / browser), no test runner. **Five of
six "skip" criteria match.** The skill explicitly disqualifies it.

## Decision

Apply the **spirit** of DDD without the heavy machinery:

- ✅ Bounded contexts as folders
- ✅ File-per-concept where there are multiple distinct concepts
- ✅ Documentation: TOPOLOGY, GLOSSARY, AGENTS, CONTEXT.md per context, ADRs
- ✅ Ubiquitous language captured in glossary
- ❌ No aggregate roots with invariants (state is mutable records)
- ❌ No ports/adapters layer (Pixi and localStorage are touched directly)
- ❌ No repositories (no database, levels load from JSON imports + localStorage)
- ❌ No CQRS / event sourcing
- ❌ No `domain/` / `application/` / `infrastructure/` triple-stack

## Consequences

**Wins:**
- Codebase stays tractable to one developer.
- Pixi calls remain readable in their natural place (you don't have to chase
  through three layers to find a `Graphics.lineTo` call).
- Refactor risk is bounded — file moves + import updates, not architectural
  inversion.

**Costs:**
- Some `clean-ddd-hexagonal` advice is intentionally not followed; future
  contributors who expect a port/adapter layer will be surprised. The
  glossary and CONTEXT.md files mitigate this.
- If the project grows to multiple developers / multiple entry points / a
  real backend, this decision must be revisited.

## Alternatives considered

1. **Full DDD/Hexagonal as the prompt described.** Rejected: skill itself
   says skip; would inflate 62 files into 200+ for no maintainability gain
   at this scale.
2. **No restructure at all (docs only).** Rejected: the prompt is explicit
   about file-per-concept and per-context folders. Loose root files do
   violate that.
3. **Light folder grouping but no docs.** Rejected: the prompt's whole
   point is the docs.

## Re-evaluate when

- The team grows to 3+ active contributors.
- A second runtime entry point appears (e.g. a server-side level validator,
  a multiplayer relay).
- The level/persistence layer needs to swap (e.g. from `localStorage` to a
  cloud save service) — that's the moment to introduce a real port.
