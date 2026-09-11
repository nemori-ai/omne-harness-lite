# omne-harness-lite architecture

## Purpose

Validate whether a Cordis-like runtime can provide the structural dynamics needed
for OMNE's fully dynamic system while remaining interoperable with `omne-selfound`
and the production `omne_harness` boundary.

## Runtime layers

1. **Dynamic kernel** — Context, service registry, typed events, dependency
   resolution, Fiber lifecycle, reversible effect/disposer ownership, and scoped
   isolation.
2. **Composition** — profiles, bundles, patches, transactional reconciliation,
   versioned runtime generations, and hot replacement.
3. **Agent adapter** — LangChain/LangGraph model and tool adapters. These are
   replaceable consumers of the kernel, not the kernel itself.
4. **Evolution bridge** — consumes versioned public artifacts from `omne-selfound`
   (knowledge/schema/governance candidates), validates them, and stages activation.
5. **Evidence** — append-only model-visible session events, projections, replay,
   fork, and lifecycle/effect audit records.

## Initial invariants

- Every plugin-owned registration has an explicit disposer.
- Unmount removes all plugin-owned services, events, tools, and effects.
- Provider changes drain or reload dependent Fibers before committing a new view.
- A failed composition leaves the last known-good generation active.
- Model-visible requests can be reconstructed from the event log.
- External emissions require withholding or a domain compensation contract; they
  are never claimed to be exactly reversible.
