# omne-harness-lite architecture

## Purpose

Define the architecture of `omne-harness-lite`: a lighter-weight,
higher-performance OMNE harness system using DeepSeek's Cordis as its runtime
kernel while retaining the core design principles and best practices of the
original `omne-next/omne_harness`. It aims to provide all capabilities needed by
a personal intelligent assistant that can remain on standby for very long
periods, run stably, and evolve continuously. The surrounding Agent Loop and
subsystems are implemented in this repository.

## Kernel reuse baseline

The first architecture baseline reuses two kernel-level capabilities from
DeepSeek Harness:

- **Cordis** provides the dynamic runtime mechanisms: Context, service
  registration, typed events, dependency injection, plugin/Fiber lifecycle,
  and effect/disposer behavior.
- **`agent`** provides the Agent contract: Agent handles, `AgentRegistry`,
  lifecycle events, initiator scope, and ownership/control semantics.

`omne-harness-lite` does not treat DeepSeek Harness as its implementation. It
will implement its own Agent Loop, Harness layer, tool protocol, capability and
governance policies, evidence model, and evolution interfaces. DSH's concrete
`agent-loop` is therefore a reference for behavior and a possible source of
contracts, not an adopted product layer.

Before implementation is pinned, verify the exact Cordis and `agent` versions,
distribution/import strategy, upgrade policy, and applicable license terms.

## Deployment baseline and evolution target

The first complete `omne-harness-lite` release is a **single-machine system**.
This is a delivery boundary, not a permission to make every component
process-local by accident. During design, each important mechanism and
subsystem must have a clear ownership, contract, state, and failure boundary so
that it can later be extended to distributed deployment, heterogeneous
physical nodes, or service separation without changing its domain meaning.

The design target is therefore:

```text
single machine
    → multiple processes
    → heterogeneous nodes
    → independently deployed services
```

The first stage does not require a network hop, consensus system, or remote
transport for every call. It does require avoiding assumptions that would make
those evolutions impossible: hidden process-global state, object identity as a
public identity, direct cross-boundary mutation, ambiguous ownership, and
non-idempotent commands without a durable identity.

## Industrial design theories to apply

These are design lenses, not a commitment to implement all of the machinery in
the first release:

- **DDD and bounded contexts** keep Agent, Session, Runtime, Capability,
  Resource, Governance, and Topology meanings owned by explicit boundaries.
  They prevent a future service split from becoming a code-directory split
  with shared mutable domain objects.
- **Hexagonal architecture / ports and adapters** separates Cordis and domain
  contracts from transports, storage, model providers, process hosts, and
  physical nodes. A local adapter and a remote adapter should satisfy the same
  port where the semantics genuinely match.
- **Actor and message-driven principles** treat an Agent or other serialized
  owner as the authority over its mutable state. Commands cross that boundary;
  callers do not mutate a remote object's memory. This maps naturally from a
  local mailbox to a remote durable mailbox.
- **CQRS and event sourcing** distinguish durable facts from commands and
  projections. Session evidence, lifecycle transitions, and dispatch outcomes
  can then be replayed or projected elsewhere without making a read model the
  source of truth.
- **Outbox/inbox and idempotent-consumer patterns** make state changes and
  emitted messages recoverable across process boundaries. Every cross-boundary
  command or event needs a stable identity, deduplication rule, ordering scope,
  and retry outcome.
- **Leases, fencing tokens, and structured concurrency** make ownership of a
  run, worker, or resource explicit and prevent two physical nodes from acting
  as the same owner after failover.
- **Consistency-model thinking** makes each contract state whether it requires
  linearizable, session, causal, or eventual consistency. Do not introduce a
  global strong-consistency assumption where a session-local or owner-local
  invariant is sufficient.
- **Saga and compensating-action patterns** handle workflows spanning Agent,
  Session, Capability, and external systems. They preserve the distinction
  between reversible local effects and irreversible external emissions.
- **Bulkheads, cell-based architecture, and failure domains** contain a bad
  plugin, Agent, provider, process, or physical node. A single-machine process
  boundary can serve as the first failure-domain seam without prematurely
  creating microservices.
- **Contract and schema evolution** keeps public events, commands, manifests,
  and session records versioned and language-neutral. Additive evolution,
  explicit compatibility windows, and refusal of unknown unsafe versions are
  preferable to silently coercing data.

For the single-machine release, the minimum durable commitments are explicit
identity, ownership, lifecycle, command/event contracts, idempotency, and
failure semantics. Network transports, service discovery, consensus, and
cross-node scheduling remain later adapters or subsystems until a real
distributed use case requires them.

## Tenant isolation and model-request boundary

Tenant isolation is a first-day architectural invariant, including in the first
single-machine release. A tenant is an explicit part of the identity of every
tenant-owned aggregate root and of every command or query that crosses an
aggregate boundary. The runtime must not infer tenant identity from ambient
process state, a mutable singleton, or an untrusted model/tool payload. A
missing, mismatched, or cross-tenant identity is refused at the boundary.

The tenant model follows the two-level structure already defined by
`omne-next/omne_harness`; its exact names and ownership rules must be copied from
that authoritative domain material rather than re-invented here. The structure
must remain visible in language-neutral contracts so that a future process or
service boundary cannot erase tenant ownership.

All LLM requests in `omne-harness-lite` use OpenRouter as the request boundary.
Model profiles may describe the selected model and its OpenRouter routing
constraints, but Agent Loop and other callers do not call provider-specific
endpoints directly. A provider-specific implementation detail belongs behind
the OpenRouter adapter and cannot redefine the model, session, or tenant
domain semantics.

## DSH's Harness decomposition (reference)

DeepSeek Harness treats the running Harness as an ordered Cordis plugin tree.
The product-level parts are plugins that contribute services, typed events, and
reversible effects; the official architecture explicitly includes the model
adapter, tool registry, session log, and Agent Loop in this rule. Profiles and
bundles compose and distribute those plugin rows; they are not substitutes for
the runtime services themselves.

The reference decomposition is:

- **Cordis runtime** — the plugin framework, Context, dependency activation,
  event dispatch, and effect unwinding. This is the runtime substrate rather
  than a product feature plugin.
- **Session** — append-only session events and persistence-facing state.
- **System prompt** — prompt sections and tool-schema assembly.
- **Tools** — scoped tool registry and guarded execution pipeline.
- **Agent** — Agent contract, live registry, initiator scope, and Agent events.
- **Agent Loop** — the default concrete driver over turns, model requests,
  streams, tools, and session history.
- **LLM adapter** — model/message/stream seam and provider implementation.
- **Application and capability plugins** — filesystem, subprocess, sandbox,
  approval, credentials, telemetry, web/API surfaces, and other optional
  capabilities.

Profiles (`web`, `headless`, `sdk`, and others) select ordered bundles and
patches. Bundles are distribution units for Cordis configuration rows and the
code they mount. The CLI, Python SDK carrier, packaging, and desktop host are
launch or distribution surfaces; they should not be confused with the complete
set of Cordis plugins.

This decomposition is a reference for `omne-harness-lite`, not a requirement to
copy DSH's product composition. Our architecture retains Cordis and the `agent`
contract as reusable kernel capabilities while implementing its own Agent Loop,
Harness policies, and application plugins.

DSH does provide implementation packages for this composition model. The
`@deepseek-ai/dsh-app-boot` package exposes profile discovery, initialization,
bundle resolution, entry composition, patch loading, and live patch watching;
its implementation delegates patch application to Cordis loader/include
facilities such as `applyEntryPatches`. A DSH Bundle is an npm package whose
`package.json` declares `dsh.bundle.patch`, while a Profile is a Harness-home
directory whose manifest declares the ordered `dsh.profile.bundles` list and
owns its `cordis.patch.yml`.

These APIs are reusable TypeScript implementation material, but Profile and
Bundle semantics are DSH application-layer conventions rather than intrinsic
Cordis primitives. Reusing them in `omne-harness-lite` requires an explicit
decision to adopt their on-disk layout, layer precedence, module-resolution
anchors, reload policy, and launcher assumptions. The lower-level patch
application semantics can be reused independently.

## Runtime layers

The [first Agent-core modeling proposal](../spec/proposals/agent-core/v1/README.md)
compares DSH, Pi, LangChain and the original OMNE domain for system prompts,
tools, and Session/Turn/Run/Step. Its model revisions are **proposed**, not yet
accepted architectural decisions. In particular, community meanings of Turn
differ; the proposal preserves OMNE input identity while separating logical
execution, model/tool cycles, and physical attempts.

1. **Dynamic kernel** — Context, service registry, typed events, dependency
   resolution, Fiber lifecycle, reversible effect/disposer ownership, and scoped
   isolation.
2. **Composition** — profiles, bundles, patches, transactional reconciliation,
   versioned runtime generations, and hot replacement.
3. **Agent Loop and Harness** — agent turns, tool protocol, scheduling, policy,
   and orchestration built on the kernel rather than imported from Cordis.
4. **Evolution bridge** — consumes versioned public artifacts when an external
   producer is integrated, validates them, and stages activation.
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
