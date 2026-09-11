---
name: engineering-taste
description: >
  Provide high-level engineering judgment for omne-harness-lite: simplicity,
  proportional design, evidence-driven complexity, and recognition of code or
  architecture that violates those qualities. Use when evaluating a design,
  abstraction, dynamic runtime change, or implementation tradeoff. This skill
  gives principles and diagnostic lenses, not a step-by-step workflow.
---

# Engineering taste for `omne-harness-lite`

Use this skill to judge whether a design expresses a real contract and protects
an actual invariant, or merely anticipates possibilities. The target is not the
fewest lines; it is the smallest coherent model that makes required behavior,
ownership, failure, and change visible.

## Core judgment

- Prefer a concrete implementation until a second real variation or a boundary
  contract makes an abstraction pay for itself.
- Treat every abstraction as a claim: it says that several things share a stable
  concept. If that claim cannot be named and defended, the abstraction is likely
  premature.
- Let complexity enter only to protect an invariant, isolate an existing source
  of change, satisfy a public contract, or address measured failure or cost.
- Prefer mature existing implementations and third-party libraries when they
  satisfy the specification, boundary, auditability, and maintenance needs. Build
  from scratch only when reuse cannot meet those requirements or would create a
  more costly boundary.
- Keep policy, mechanism, and evidence distinguishable. A wrapper that only
  forwards calls, a service that only renames data, or a test that only mirrors
  implementation has not earned its layer.
- Prefer explicit state transitions and ownership over ambient state, hidden
  ordering, magical discovery, and cleanup by convention.

## Smells of violated taste

Recognize these as questions to investigate, not automatic style violations:

- interfaces with one accidental implementation and no boundary contract;
- factories, registries, or plugin points added before a real extension exists;
- generic configuration objects whose fields have no single invariant owner;
- multiple layers that each translate, forward, or catch errors without changing
  semantics;
- caches, queues, batching, pooling, parallelism, or custom protocols without a
  measured problem and a stated consistency cost;
- lifecycle code that starts work without recording ownership or returns from
  disposal while work can still observe the system;
- error paths that turn cancellation, timeout, partial completion, or external
  failure into one boolean or one ordinary success value;
- tests that assert mocks, call counts, or implementation shape while missing
  the real state transition and boundary behavior;
- comments and documents that promise reversibility, safety, or proof beyond the
  actual inverse, isolation, model bound, or evidence;
- abstractions whose vocabulary comes from a framework while the project has not
  decided whether that vocabulary is part of its own contract.

## Proportionality test

Ask what concrete problem each extra concept solves, what invariant it owns, what
evidence justifies it, and what it costs readers and future changes. A design is
out of proportion when its machinery is broader than the behavior it can explain,
or when its failure modes are harder to reason about than the original problem.

The opposite failure also matters: a short function that hides ownership, leaks
resources, conflates independent outcomes, or bypasses a contract is not simple;
it is compressed complexity. Simplicity means fewer hidden assumptions, not fewer
tokens.

## Dynamic-runtime lens

For a dynamic `omne-harness-lite` change, preserve the distinctions between:

- declared structure and currently active structure;
- requested stop and quiescent stop;
- local reversible state and external irreversible emission;
- provider removal and dependent drain;
- candidate configuration and committed generation;
- recorded model-visible evidence and incidental logs.

If an implementation collapses one of these pairs for convenience, treat that as
a design risk requiring a precise contract and evidence.

## Boundaries

Cordis-specific facts come from the `cordis-authoritative-docs` skill and the
official DeepSeek Harness documentation. This skill does not choose a programming
language, prescribe a task workflow, or replace the system's formal specifications.
