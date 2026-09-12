---
name: cordis-authoritative-docs
description: >
  Verify Cordis and reusable DSH agent semantics against official DeepSeek Harness
  sources at an identified revision. Use for API, lifecycle, dependency, plugin,
  context, event, registry, or handle claims about those primitives. Language-neutral
  project design alone does not require upstream API research.
---

# Authoritative Cordis documentation

`omne-harness-lite` reuses Cordis and DSH `agent` primitives within the
[current kernel boundary](../../../docs/architecture/README.md#内核与自建边界).
Its Agent Loop, Harness policies, and other subsystems remain project-owned.
Before making a claim about those upstream primitives, consult official DeepSeek
Harness documentation rather than relying on model memory:

<https://github.com/deepseek-ai/deepseek-harness/tree/master/docs>

## Source priority

The [local implementation mapping](../../../docs/architecture-guide/reference/cordis-mapping.md)
and [research index](../../../docs/research/dsh-cordis-dynamic/README.md) locate prior
evidence. Their inspected revision is research history, not automatically the
dependency version adopted by this project. Project choices come from the current
architecture, decisions, and contracts; upstream evidence cannot authorize them.

1. The official `deepseek-ai/deepseek-harness` repository and its `docs/`
   directory are the primary source for Cordis behavior and API semantics.
2. The repository's source, tests, examples, and release history are secondary
   evidence when the documentation is incomplete.
3. Other web pages, forks, cached snippets, and remembered framework behavior
   are leads only. Do not treat them as authoritative without checking the
   official repository.

## Workflow

- Identify the version required by the task or adopted dependency. If none is
  fixed, select and record an inspected revision for research without claiming
  it has been adopted. Reuse existing evidence when it covers that revision and
  question; recheck upstream when behavior, version, or coverage is uncertain.
- Locate the exact official page through the local mapping or docs index. For
  the reusable agent package, inspect its own documentation and relevant source
  or tests. Unrelated Agent Loop or application policies are not substitutes.
- Record the source URL/path and commit or release. A moving branch page is a
  discovery entry, not a reproducible version reference. Resolve it to a revision
  for conclusions that depend on exact behavior; if unavailable, state the limit.
- Distinguish documented Cordis semantics from an inference about how
  `omne-harness-lite` should use Cordis. State the inference explicitly.
- If documentation and code disagree, first compare their revisions and whether
  the code is the inspected upstream implementation or a project adapter. Report
  a same-version discrepancy and pause claims or changes that depend on resolving
  it; independent work may continue. Do not silently select the convenient behavior.
- Keep the boundary clear: Cordis supplies kernel mechanisms. Do not assume it
  defines the project's Agent Loop, Harness policy, tool protocol, governance,
  or other `omne-harness-lite` subsystems.
- For a design-stage specification, first restate the observed Cordis contract
  in language-neutral terms, then map it to the chosen formal notation. Do not
  let a framework-specific API example become the system-wide specification.

## Evidence standard

When reporting a Cordis fact, include the official documentation link or the
exact repository path and revision consulted; apply the same standard to DSH agent
facts. Distinguish a documented guarantee, a source/test-supported observation at
that revision, an inference, and an unresolved assumption. Source inspection does
not claim a test was run; absent documentation does not turn an observed source
behavior into a documented guarantee. Unresolved claims need relevant source,
tests, or a bounded probe, not an invented API or a guess from another framework.

Stop reading when the needed semantics, revision, and limits are established.
Retrieval does not require downloading all upstream docs or installing dependencies.

This skill guides information retrieval; it does not authorize adding a Cordis
dependency, changing the system boundary, or treating DeepSeek Harness as the
implementation of `omne-harness-lite`.
