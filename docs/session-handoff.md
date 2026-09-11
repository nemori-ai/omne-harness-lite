# Session handoff: omne-harness-lite

> Temporary handoff note for the next working session. This is not an ADR and
> does not override requirements or decisions in the owning OMNE repositories.

## Repository

- Path: `/data/qiwei/repos/omne-harness-lite`
- Branch: `main`
- Current commits:
  - `c5ac10d` — initial repository and architecture skeleton
  - `fbb8080` — DSH, Cordis, and fully dynamic system research note
- Sibling repositories:
  - `/data/qiwei/repos/omne-next`
  - `/data/qiwei/repos/omne-selfound`

## User direction

The user leads direction and requirements. The assistant executes research,
design, implementation, and validation in this repository. This is an
experimental parallel track for a Cordis-kernel agent harness; it must not
silently become a dependency of the production control plane.

## Agreed scope

The experiment validates a dynamic runtime that can change structure while
running. The production agent execution layer may be adapted later, but the
research target is the runtime kernel:

- Context and service registry
- Typed events and dispatch modes
- Plugin ownership and Fiber lifecycle
- Reversible effects and disposer ownership
- Reactive dependency resolution
- Profile/bundle/patch composition
- Transactional reload and last-known-good recovery
- Append-only model-visible session evidence
- A bridge for versioned public evolution artifacts from `omne-selfound`

`omne-selfound` is expected to own knowledge, cognition, evaluation, and
self-evolution semantics. This repository should consume public versioned
artifacts and activation contracts; it should not import private domain models.

## Important semantic boundaries

- “Reversible” applies only to state mediated by the runtime and covered by a
  valid inverse/disposer contract.
- Network sends, committed external writes, model calls, monotonic allocators,
  and other external emissions are not automatically reversible. Use withholding,
  idempotency, or domain compensation.
- Dynamic code loading is not automatically a security boundary. Sandboxing,
  permissions, credentials, and process isolation require explicit host-level
  mechanisms.
- Formal claims are conditional on unique providers, acyclic dependencies,
  bounded execution, total provision, and correct inverse/commutativity witnesses.
- The Cordis paper is a 2026 arXiv v1 preprint. Do not describe it as an
  automatically mechanically verified industrial guarantee.

## Existing documents

- `README.md` — repository purpose and non-production status.
- `docs/architecture.md` — initial five-layer architecture and invariants.
- `docs/dsh-cordis-fully-dynamic.zh.md` — research interpretation of DSH,
  Cordis, and OMNE’s fully dynamic system; deliberately excludes framework
  selection comparisons.

## Recommended next slice

Before broad implementation, write a short experimental design/specification
with executable acceptance checks for the smallest kernel:

1. `Context` with typed service keys and ownership by Fiber.
2. `Plugin` mount returning a disposer; unmount removes all owned registrations.
3. Fiber state machine: `PENDING`, `LOADING`, `ACTIVE`, `UNLOADING`, `FAILED`.
4. Provider/consumer dependency graph with deterministic refresh ordering.
5. Effect ledger with explicit inverse and reverse-order cleanup.
6. Tests for restoration after unload and dependent drain after provider removal.

Do not start with UI, marketplace, broad package installation, or unrestricted
runtime code execution. First prove lifecycle, dependency, rollback, and event
replay invariants in memory.

## Questions for the next session

- Python or TypeScript for the first kernel prototype?
- Should the first prototype implement a restricted in-memory Context DSL before
  integrating any external Agent runtime?
- What public artifact/envelope does `omne-selfound` expose for a candidate schema,
  policy, or topology change?
- Which MVC-3/MVC-4 scenario is the first acceptance demonstration: hot-swapping a
  tool, replacing a sub-agent topology, or activating a new governance rule?
