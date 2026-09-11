---
name: cordis-authoritative-docs
description: >
  Find and use the authoritative DeepSeek Harness/Cordis documentation when
  designing or implementing the Cordis kernel of omne-harness-lite. Use this
  whenever Cordis APIs, lifecycle semantics, plugin behavior, fibers, context,
  events, services, or dynamic runtime behavior are involved.
---

# Authoritative Cordis documentation

`omne-harness-lite` uses Cordis as its kernel, but implements its Agent Loop,
Harness layer, and other subsystems itself. Before making a Cordis-specific
claim or implementation decision, consult the official DeepSeek Harness
documentation rather than relying on model memory:

<https://github.com/deepseek-ai/deepseek-harness/tree/master/docs>

## Source priority

1. The official `deepseek-ai/deepseek-harness` repository and its `docs/`
   directory are the primary source for Cordis behavior and API semantics.
2. The repository's source, tests, examples, and release history are secondary
   evidence when the documentation is incomplete.
3. Other web pages, forks, cached snippets, and remembered framework behavior
   are leads only. Do not treat them as authoritative without checking the
   official repository.

## Workflow

- Start at the official docs index and locate the page covering the exact
  concept being changed. Search the repository when the index does not expose a
  useful entry.
- Record the URL and, when possible, the commit or release inspected in design
  notes or review context. Do not silently mix documentation from different
  revisions.
- Distinguish documented Cordis semantics from an inference about how
  `omne-harness-lite` should use Cordis. State the inference explicitly.
- If the official docs and local code disagree, stop and surface the mismatch;
  do not “fix” it by importing undocumented behavior.
- Keep the boundary clear: Cordis supplies kernel mechanisms. Do not assume it
  defines the project's Agent Loop, Harness policy, tool protocol, governance,
  or other `omne-harness-lite` subsystems.
- For a design-stage specification, first restate the observed Cordis contract
  in language-neutral terms, then map it to the chosen formal notation. Do not
  let a framework-specific API example become the system-wide specification.

## Evidence standard

When reporting a Cordis fact, include the official documentation link or the
exact repository path consulted. If no authoritative documentation covers the
question, say so and mark the result as an open assumption requiring validation
against the implementation or a small executable probe.

This skill guides information retrieval; it does not authorize adding a Cordis
dependency, changing the system boundary, or treating DeepSeek Harness as the
implementation of `omne-harness-lite`.
