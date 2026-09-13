---
name: engineering-taste
description: >
  Provide high-level engineering judgment for omne-harness-lite: simplicity,
  proportional design, evidence-driven complexity, and recognition of code or
  architecture that violates those qualities. Use when evaluating a design,
  abstraction, reuse choice, dynamic runtime change, or implementation tradeoff.
  This is judgment guidance, not a task workflow or a reason to expand an
  ordinary local edit into an architecture review.
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
- Before choosing an adapter or changing a dependency, identify maintenance
  ownership and the target contract. For project-maintained forks, evaluate
  direct changes at the responsible boundary; do not preserve upstream limits
  merely because they already exist. Apply the project's
  [reuse judgment](../../../docs/architecture-guide/assurance/judgment.md#复杂度与复用).
- Keep policy, mechanism, and evidence distinguishable. A wrapper that only
  forwards calls, a service that only renames data, or a test that only mirrors
  implementation has not earned its layer unless it protects an actual boundary.
  Small size or mostly forwarding code does not erase authorization, ownership,
  lifecycle, or error-mapping responsibilities.
- Prefer explicit state transitions and ownership over ambient state, hidden
  ordering, magical discovery, and cleanup by convention.

## Smells of violated taste

Recognize these as questions to investigate, not automatic style violations:

- interfaces with one accidental implementation and no boundary contract;
- factories, registries, or plugin points without a required variation or boundary;
- generic configuration objects whose fields have no single invariant owner;
- multiple layers that each translate, forward, or catch errors without changing
  semantics;
- caches, queues, batching, pooling, parallelism, or custom protocols justified
  by neither a concrete semantic need nor measured benefit, or hiding their
  consistency and failure costs;
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

Consider the counterfactual: if the layer or mechanism disappeared, which required
behavior would become impossible or leak into its consumers? If none, removing it
may simplify the design. If it carries a real boundary, simplify its implementation
while preserving that responsibility. Count semantic obligations, not implementations
or forwarding calls. Shared data meaning is not a reason to merge unrelated lifecycles;
separate consumers are not a reason to duplicate the same authoritative definition.

Match evidence to the claim. Optimization needs reproducible bottleneck measurements;
ordering, admission, isolation, and lifecycle mechanisms need a traceable contract
and evidence that they protect it. A bounded queue can enforce required admission
semantics before any performance problem exists. Both kinds of mechanism still have
consistency, failure, and maintenance costs.

The opposite failure also matters: a short function that hides ownership, leaks
resources, conflates independent outcomes, or bypasses a contract is not simple;
it is compressed complexity. Simplicity means fewer hidden assumptions, not fewer
tokens.

## Dynamic-runtime lens

For a dynamic `omne-harness-lite` change, inspect the relevant distinctions between:

- declared structure and currently active structure;
- requested stop and quiescent stop;
- local reversible state and external irreversible emission;
- provider removal and the chosen treatment of current consumers;
- candidate configuration and committed generation;
- recorded model-visible evidence and incidental logs.

If an implementation collapses one of these pairs for convenience, treat that as
a design risk requiring a precise contract and evidence.

These are semantic questions, not required classes, state machines, or policies.
Rejecting removal while a provider is in use can satisfy a contract without drain
or migration. A stored definition need not be a plugin instance. The single-machine
delivery still needs independently extensible boundaries; it does not need a remote
stack before remote operation is required. Use the relevant guide below for detail.

## Find the meaning before judging the shape

The [architecture judgment guide](../../../docs/architecture-guide/assurance/judgment.md)
owns the project's architectural criteria. For a disputed boundary, read the relevant
[capability](../../../docs/architecture-guide/modeling/capabilities.md) or
[deployment](../../../docs/architecture-guide/runtime/distribution.md) topic and the
applicable contract; use [architecture-design](../architecture-design/SKILL.md) when
its authority or accepted version is unclear. Do not recursively reload skills or
the whole guide when the task already supplies the necessary facts.

A useful judgment connects an observed mechanism to its semantic consequence,
evidence, and the smallest justified change. Distinguish an observed violation from
a risk or missing information. Taste does not reopen an effective decision without
new observations, approve a proposal, or authorize a rewrite. When the required
behavior and its costs are explained, stop searching for more abstractions to remove.

## Defensive guidance also has a cost

A reminder can protect a real guarantee while its wording, repetition, or mandatory
reading no longer earns its cost for a particular development model. Judge those
separately: keep the guarantee, measure the aid. A new model name or an error-free
run with all reminders present cannot show that a reminder is redundant.

When evaluating that tradeoff, use [defensive evolution](../../../docs/maintenance/defensive-evolution.md)
and the [developer-model evaluation protocol](../../../docs/evaluation/README.md).
Their bounded evidence can support retention, simplification, or removal; this skill
does not make any such choice by itself.

## Boundaries

Cordis-specific facts come from [cordis-authoritative-docs](../cordis-authoritative-docs/SKILL.md)
and its official sources. This skill does not choose a programming
language, prescribe a task workflow, or replace the system's formal specifications.
