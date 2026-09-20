# omne-harness-lite architecture

For design principles and terminology, use the [architecture design guide](architecture-guide/README.md).
This document records the current architecture and explicitly marked design discussions.

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

## Cordis-native modeling as the primary view (under discussion)

The user emphasizes that this is a **fully dynamic system**: the model must
account for changes to system structure, not only changing values within a
fixed structure. The current recommendation is to make Cordis-native capability
composition the primary system-modeling view. This remains a proposal, not an
accepted replacement of existing model contracts or directory conventions.
Long-lived capabilities must be added, replaced, scoped, and removed while
their consumers and ongoing work remain well-defined. Choosing Cordis as a
dependency alone would not justify imposing its runtime objects on every data
model; structural evolution is the substantive reason for this modeling view.

Capability definitions, active instances, dependency relationships, scopes, and
operational state are all relevant facets of the evolving system. Definitions
and policies may acquire new versions at runtime, subject to explicit authority,
validation, activation, and retirement rules. These are facets to specify, not
a newly proposed set of aggregates. The model must explain the transition from
one composition to another and its effects on ongoing work, as well as the
behavior of either composition when held fixed.

For each capability, describe its service contract, providers and consumers,
required dependencies, visibility scope, lifecycle, and owned effects. Cordis
plugins realize these capabilities; Context resolves them and mediates their
composition. Plugin boundaries follow independent replacement and lifecycle
requirements, so a service can manage many durable records without one plugin
instance per record. A Fiber's cleanup boundary does not itself establish a
database transaction or business consistency boundary.

This changes the starting point from classifying every concept as an enum,
value object, entity, or aggregate to explaining what capability exists, what it
needs, and what activation or removal means. Precise language, identity,
ownership, and invariants remain necessary without committing to a DDD object
taxonomy. DDD is not intrinsically incompatible with dynamic systems, but its
tactical classifications need not organize this project's specification.

Persistence is a storage capability with a contract and replaceable providers
inside the same composition model. A need to survive restart does not imply an
aggregate, repository pattern, or separate DDD architecture. Independently
created and published prompt definitions can be managed by a service that uses
storage, with their publication rules specified as service behavior. Records
need not each become plugins, and the storage provider need not understand
prompt-publication semantics. Successful storage of bytes alone does not
establish that a publication or activation is valid.

This distinction still leaves concrete storage and consumer contracts to
define: what survives unloading, when a write is durable, what consistency a
consumer requires, how interrupted work is recovered, and which definition
versions interpret retained data. These requirements can be expressed in
Cordis-native service and lifecycle contracts; they are not reasons to require
DDD. The scope of permitted structural change and the rules authorizing such
change must themselves be explicit, so dynamic evolution remains specifiable.

The resulting views of current concepts would be:

| Concept | Candidate Cordis-oriented expression |
|---|---|
| LLMProfile | A tenant-owned data contract managed by a model-catalog capability; active routing and OpenRouter requests are separate runtime responsibilities |
| SystemPromptProfile | A published content definition managed by a capability; rendering consumes an exact revision and scoped state providers |
| State key | A declared contract key with owned runtime registrations and explicit consumer dependencies; availability is dynamic |
| Tenant / Membership | Durable identity and authorization rules; a runtime scope carries authorized access but does not replace these facts |
| Session / execution | Durable history and execution semantics consumed by mounted services and loop plugins; unloading a runtime instance does not delete the history |

Cordis-native modeling remains language-neutral: define service operations,
data, events, resolution rules, and state transitions independently of
TypeScript declaration merging, object identity, callbacks, and the Context
proxy. JSON Schema expresses exchanged data, Alloy can inspect bounded
structural relationships, and TLA+ can specify lifecycle and concurrent
behavior. A working Cordis implementation is evidence for this mapping, not
proof that every application plugin satisfies its assumptions.

Several boundaries still require explicit contracts. Context service isolation
is not tenant authorization or a hostile-code sandbox. Effect cleanup is not a
rollback of durable facts or external emissions. Cordis event dispatch modes do
not establish durable delivery or a database commit. Future remote providers
need explicit transport, identity, timeout, cancellation, and failure semantics;
in-process callback composition cannot simply be moved across a network while
assuming unchanged behavior. These requirements belong in the capability
contracts and can be implemented by plugins without importing a complete DDD
layering scheme or creating a second generic plugin runtime.

The likely benefit is a more direct account of dynamic behavior with fewer
translation layers. This is a design judgment, not a measured performance
improvement. The main design risk shifts to hidden dependency graphs, overly
broad service access, and lifecycle mistakes; those must remain visible in the
specification. Existing identities, shared schemas, and invariants remain useful
inputs even if their DDD classifications are later revised.

Sources: DSH's [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/architecture.md)
describes the product as a plugin tree and distinguishes capability definitions,
providers, and consumers; the [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-primer.md)
and [Context API](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-api/context.md)
describe the runtime mechanisms. Eric Evans' [DDD Reference](https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf)
grounds the distinction between consistency boundaries and component lifetimes.
The choice of primary modeling view above is this project's proposal, not an
upstream prescription.

## Invariant definitions and Cordis-native checks (design discussion)

The user requires an explicit invariant-definition mechanism alongside dynamic
composition. The proposed modeling view is therefore **Cordis-native capability
composition constrained by explicit invariants**. Invariants describe legal
states and relationships through structural evolution; they do not require DDD
aggregate classifications. This phrase summarizes the design direction rather
than naming an official DSH methodology.

DSH provides a concrete reference at commit
`c291e7961a515f6d7af9304e7fd1d257929aef26`. Its
[invariant registry](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/runtime-diagnostics/invariants/src/index.ts)
is an application service on Cordis, not a primitive built into the kernel.
Package-owned companion plugins register installers under their package names.
The registry handles selection, ownership reservation, child Fiber lifetimes,
and package-attributed failures; companions own the actual assertions. Failed
installation cleans up the child and reservation. Unloading the registry or
companion removes the owned registrations and observations.

For example, the [system-prompt companion](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/system-prompt/src/invariant.ts)
checks the assembly waterfall result for unique, nonempty section/context names
and valid text/variable values. The [agent-loop companion](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/invariant.ts)
checks loop-built model requests against messages and request headers derived
from the session log. These check relationships across independently produced
observations; merely checking that a service method exists is not their role.

For this project, distinguish the normative rule, enforcement at the owning
operation, and observation by a runtime checker. An invariant definition should
identify its owner, applicable contract version and scope, predicate, and the
states or observation boundaries where it must hold. Its enforcement and
verification mappings should state the required evidence and failure response.
The exact representation remains to be designed; this discussion creates no
new domain schema or invariant language. Temporal obligations should be stated
as such rather than all being called state invariants.

Checkers can participate in plugin lifecycles, but disabling a diagnostic does
not repeal a rule. Mandatory constraints such as tenant access remain enforced
at their owning operations. If a composition requires a checker, losing it must
affect readiness according to the explicit composition contract. Changing a
rule requires an authorized contract change, distinct from reloading its checker.
Checker replacement must also define how observation state is rebuilt or what
coverage is absent; a gap cannot silently count as successful validation.

DSH's [package README](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/runtime-diagnostics/invariants/README.md)
documents configurable diagnostics, no checks when only the registry is loaded,
and the inability of live-only companions to recover pre-reload observations.
This is executable runtime verification, not a general language-neutral
invariant specification or a proof of all possible executions.

Source discrepancy: at the inspected commit,
[`docs/subsystems/invariants.md`](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/subsystems/invariants.md)
still requires a companion for every package and permits explained-empty
installers. The package README,
[package conventions](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/AGENTS.md),
[implemented omission decision](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/.agents/notes/implemented/simplification/2026-08-28-omit-unneeded-invariant-companions.md),
and `scripts/package-invariants.ts` instead require omitting unnecessary
companions and reject empty installers. This analysis uses the latter verified
rule and does not treat the stale exhaustive-publication wording as current.

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

## Dynamic state keys and prompt bindings (design discussion)

Prompt authors select state keys from a system-controlled set; writing a key
does not declare it or grant access. This does not imply a global fixed enum.
The candidate Cordis-oriented design distinguishes a versioned key definition,
an active provider owned by a plugin in a scope, and values materialized for one
render. Authorized providers can register or withdraw capabilities dynamically;
published definitions retain their meaning after a provider unloads.

A Profile binding is usable only when its referenced keys have matching
definitions, active providers, and authorization in the tenant/Agent scope.
JSON Schema validates the stored reference shape; a generated enum can describe
one catalog snapshot but cannot guarantee live availability. Profile publication
and runtime readiness are separate facts. The exact provider contract and
binding representation remain proposals, not newly accepted domain models.

For planned removal, the candidate default is to reject a change that strands a
required active binding, unless the same composition change explicitly replaces
the provider, changes the Profile binding, or deactivates affected consumers.
An unexpected provider failure makes dependent bindings unavailable. New
affected renders must stop; in-flight reads must finish or be cancelled and
quiescent before their provider is released. A render cannot silently mix
provider bindings across a replacement, omit missing variables, or fall back to
an unrelated provider. This is not a claim of globally simultaneous state reads.
Already materialized text follows its declared validity boundary; history and
external emissions are not erased by disposal.

DSH evidence was inspected at commit
`c291e7961a515f6d7af9304e7fd1d257929aef26`:

- The [system-prompt service](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/system-prompt/src/index.ts)
  registers named variables and contexts through scoped effects with disposers;
  unknown or valueless referenced variables fail rendering.
- The [context package group](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/README.md)
  contains request-context contributors, not a canonical list of prompt state
  keys. For example, [time-context](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/time-context/src/index.ts)
  registers a session projection and pre-step listener to contribute durable
  user-role messages; these are distinct from prompt-variable registrations.
- Cordis [service dependencies](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/03-services.md)
  and [effect lifetimes](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/cordis-tutorial/02-lifecycle-and-effects.md)
  provide the underlying mechanisms. Injecting a registry service alone does
  not express a dependency on each business key it contains; resolving Profile
  references into managed dependencies and coordinating removal are this
  project's responsibilities, not guarantees inferred from a string field.

See the [SystemPromptProfile proposal notes](../spec/proposals/agent-core/v1/system-prompt-profile.schema-notes.md)
for the candidate membership rule and unresolved modeling details.

## Initial invariants

- Every plugin-owned registration has an explicit disposer.
- Unmount removes all plugin-owned services, events, tools, and effects.
- Provider changes drain or reload dependent Fibers before committing a new view.
- A failed composition leaves the last known-good generation active.
- Model-visible requests can be reconstructed from the event log.
- External emissions require withholding or a domain compensation contract; they
  are never claimed to be exactly reversible.
