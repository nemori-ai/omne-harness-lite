PACKAGE_TEMPLATE_DRAFT

# agent

## Responsibility and status

This package provides reusable implementation mechanisms and factories. It does not include Cordis. The design is [accepted](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204). The root entry exports the public construction types and `createAgentRuntime`. The factory checks the configuration, the binding, the registration handle, the required dependencies and the joint commits. On success it returns an idle provider. Each public operation of the four faces checks the tenant first and then calls `access.check` once. `invoke` runs the skeleton of the normal Loop path (#502 1.2), and `observe` shows each new state of the instance. The other operation bodies are not implemented: after `allowed` they return a named `unavailable`. The root entry also exports the generic evaluator `agentEvaluator`. An assembly adopts it for the bound definition through `AgentAdoptions`. The `./testing` entry gives a test assembly: a memory Journal, scriptable doubles of the ports, a manual clock and `createTestAgentDependencies`.

### Support scope

The tiers are defined in the [member documentation requirements](../../../docs/member-documentation.md). The table follows the [tool support scope](../../tool/tool/README_ZH.md#支持范围). The verification column states only what the tests check. It does not state that behavior outside the tests holds.

| Tier | Status in this package | Entry | Verification scope |
| --- | --- | --- | --- |
| Public types exported | Exported: `AgentRuntimeBinding`, `AgentConfiguration`, `AgentRuntimeOptions`, `AgentDependencies` (17 dependencies) and `AgentProvider`. Exported values: `agentEvaluator`, an implementation of the contract's `AgentEvaluator`, and `agentCheckpointSchema`, the schema adoption of the checkpoint that it writes. The shapes are in the [API design](docs/public-api.md) | Root entry | `tests/public-entry.spec.ts` checks the export names of the root and `./testing` entries, the import graphs of source and build output, the manifest dependencies and the Cordis routes |
| Pure contract functions implemented | None in this package. The contract functions are in `agent-contract` | None | None |
| Independent execution implemented | None | None | None |
| Runtime paths implemented | The creation checks of `createAgentRuntime`. A configuration item out of range or a malformed binding field returns `invalid`, and `field` gives the item path. A registration handle for another instance returns `denied`. An absent required dependency (10 of them) returns `unavailable`, and `diagnostic` names it. A `jointCommits` kind that the Journal does not declare returns `unsupported`. A failure builds no runtime and calls no dependency method. A success gives an idle provider. The access guard: each public operation of the four faces first checks the tenant of the Access. A missing tenant, or a tenant that legal-identity did not mint, is `invalid`. Another tenant is `denied`. None of them calls `access.check`. `observe` is the exception: the contract gives it no `invalid` end reason, so a missing or malformed tenant ends it with `denied` (see the 待拥有者 item below). Then the operation calls `access.check` once. It does not cache `allowed`, and `denied` or `unavailable` stops the operation. After `allowed`, `observe` shows the current state, then each new state, and ends with `closed` when the signal aborts. The operations other than `invoke` and `observe` return `unavailable` with the `diagnostic` "<operation> is not implemented until #502 stage N". This answer is temporary for the stage. It is not a contract result | Root entry | `tests/factory.spec.ts` checks each of the four creation failures and the idle success. `tests/provider-access.spec.ts` checks, for each public operation, the tenant check, the three results of `access.check` and the single call. `tests/assembly.spec.ts` builds an idle provider from the test assembly and checks that the creation calls no dependency. The checks listed below as not implemented have no test |
| Normal Loop path and admission | `invoke` takes one input through the normal path without tools or extensions. It returns the handle when `open` accepts the execution. The Loop then runs to ended by itself. The same operation with the same input gets the original handle. A remembered operation with another input gets `conflict` while its execution holds the slot. A new operation meets `busy` when the slot is held. An outcome off the normal path stops the run, and the stopped run holds the slot. See [Normal Loop path](#normal-loop-path) for the steps, the diagrams, the admission, the stops and the slot rules | Root entry | `tests/loop-transitions.spec.ts` checks the normal path against the node table (C1). It also checks the temporary E1 `found-existing` row. `tests/loop-evaluator.spec.ts` checks the decisions at E4 and I8, the encoder and `unsupported` off the normal path. It runs 500 seeded `LoopFacts`. For each, it checks that the same facts give the same `Next`, that the input does not change and that each step has a row (C1). `tests/loop-invoke.spec.ts` runs one input to ended against the scripted Model and the memory Journal (C2). It also checks the guarded event reads, a reply of several pages and the minted identities. `tests/loop-admission.spec.ts` checks the admission: the same operation again (C1), the lost receipt of `accept` (C2), `busy` and the R0 item. Each test name starts with its row of the node acceptance table. `tests/loop-slot.spec.ts` checks the slot release, `observe` and the projection to the registration handle. `tests/loop-port-failures.spec.ts` checks that a port failure at each node of the path stops the run with the Journal `position` at that node. Failure branches, waits and recovery have no test |
| Test assembly (`./testing`) | `createMemoryAgentJournal`: a single-process, non-durable `AgentJournal`. It implements all 18 members by facts 1 to 15 of the [same-shape list](docs/architecture/mechanisms.md#两种实现必须同形的事实). Options set the declared participants. A test can script `unavailable` and three kinds of `commit-unknown` on chosen operations. Scriptable doubles of the other ports, `createManualAgentClock` and a hand-written `ToolRuntime` double. `createTestAgentDependencies` returns the 17 dependencies (`registration` is null) and the control handle of each double. `models` is the scripted provider of `model-contract/testing` | `./testing` | `tests/memory-journal.spec.ts` checks each fact of the same-shape list. Each test name has the fact number. `tests/fixtures.spec.ts` has one test for each scripting interface. There is only one process. Durability, crashes and cross-process use are not covered |
| Hosts and providers not delivered | The operation bodies of the four faces other than `invoke` and `observe`. The handle's `submit` (no stage assigned in #502 yet), `control` and `acknowledge`. The exact commit points, waits and failure branches of the Loop nodes from E1 on (#502 1.4 to 1.9). The nodes off the normal path: the A, T, C and X subgraphs, F0, H0, Q5, M2 and W0, and R0 other than the retry of an unresolved `open`. The evaluator's `decode` (stage 5). The durable Journal provider `agent-journal-local`. Real Context, HITL, authorization, Session adapters and material storage | None | No evidence |

### Normal Loop path

The runtime admits one input and runs the normal Loop path. It has no tools or extensions. Full failure branches and background waits are not delivered.

`invoke` does these steps:

1. It passes the access guard.
2. A held slot gives `busy` to a new `invoke` (see Admission below). Otherwise `invoke` reserves the slot.
3. It resolves the evaluator of the bound definition through `adoptions.resolve`. An adopted extension returns `unavailable` (extensions are #502 stage 3).
4. It runs U0, Q1, Q2, Q4, U0 and E0. `handoff.accept` admits the input, and `open` accepts the execution.
5. It returns the handle. It does not wait for the Loop.

The Loop then runs by itself:

- It goes from E1 to E9. After E9 the runtime is idle again.
- Only the transition table in `src/loop/nodes.ts` decides where a node goes. Normal path rows follow the node table or its pseudocode. The E1 `found-existing` row is a phase 1 exception. See [Temporary choices](#temporary-choices).
- At E4 and I8 the pure evaluator's `Next` decides.
- I2 encodes the `ModelInvocationRef` of the main call with the contract's `encodeModelInvocationRef`. The I2 commit saves it in the PendingCall before the first admit at M6. M6, M1 and M3 read the call back from it with `resolveModelInvocationRef`.
- The coordinator admits the Model call and observes it until it settles. Then it reads the result in full. It records the result on the processed path with `recordResult` and acknowledges it.
- Q1 does not commit (NA-Q1-1). The candidate type binds its source to its call position: external input to U0, Model reply to I3. Q4 returns each admission to that position once. Rejected candidates at Q5 are not delivered and stop with a named `unavailable`.
- The handle's `output.read` and `output.events` read the Journal events under the guard. The events are input-taken, producer and ended only. Their sequence numbers start at 1.

The normal path in the diagram below has thick borders on the nodes that write one commit. The Q1, Q2 and Q4 loop runs two times: once for the input before `open`, and once for the reply. The diamonds are the decision points E4 and I8.

```mermaid
flowchart TD
    U0a[U0] --> Q1a[Q1] --> Q2a[Q2] --> Q4a[Q4] --> U0b[U0] --> E0[E0 open]
    E0 -->|invoke returns the handle| E1 --> E2 --> E4a{{E4}}
    E4a -->|position E3| E3[E3]:::commit --> E4b{{E4 evaluator}}
    E4b -->|take-inputs| I0[I0]:::commit --> I1[I1]:::commit --> P0[P0]:::commit --> P1[P1]:::commit
    P1 --> I2[I2]:::commit --> M0[M0]:::commit --> M6[M6]:::commit --> M1[M1]:::commit
    M1 --> M3[M3]:::commit --> M4[M4]:::commit --> M5[M5]:::commit --> I3a[I3]
    I3a --> Q1b[Q1] --> Q2b[Q2]:::commit --> Q4b[Q4]:::commit --> I3b[I3]:::commit
    I3b --> I4[I4]:::commit --> I8{{I8 evaluator}}:::commit
    I8 -->|take-inputs| I0
    I8 -->|try-finish| F1[F1]:::commit --> F2[F2]:::commit --> F3[F3 tryFinish]
    F3 --> F4[F4] --> O0[O0] --> E9[E9 idle]
    classDef commit stroke-width:3px
```

#### Admission

The table keeps the tenant and execution identity fixed. A same-operation match requires both operation and execution identities. A remembered match takes precedence over an R0 item of another operation. Otherwise the R0 item column takes precedence over the column for this execution holding the slot.

| Input | This execution holds the slot | Another execution holds the slot | Slot free | R0 item exists |
| --- | --- | --- | --- | --- |
| Same operation, same input | Remembered: handle, slot unchanged. Admission still in progress: busy, reservation unchanged. | Remembered: handle. Otherwise Journal lookup. Current slot unchanged. | Remembered: handle, still free. Otherwise Journal result after reservation. Success: running, or free if E1 finds an advanced execution. Failure: release reservation. Unknown open: keep reserved. | Matching operation and execution: R0 query. Return and reservation follow [R0 retries](#r0-retries). A remembered handle leaves the reservation unchanged. |
| Same operation, another input | Remembered: conflict, no query, slot unchanged. Admission still in progress: busy, reservation unchanged. | Journal lookup returns conflict for different input in the original record. Current slot unchanged. | Journal admission returns conflict for different input in the original record. It releases the temporary reservation. | Matching operation and execution: R0 query. The Journal checks the input after a committed or excluded query. Reservation follows [R0 retries](#r0-retries). |
| New operation | Busy, slot unchanged. | Journal lookup. No original record: busy, current slot unchanged. | Journal admission. Success: handle, slot becomes running. Failure: release reservation. Unknown open: keep reserved. | This execution: busy. Another execution: Journal lookup. Original reservation unchanged. |

Journal lookup calls `query` first. A committed result repeats idempotent `handoff.accept` and `open` to return the original handle or a port result. An excluded or denied query gives `busy`. Other failures pass through unchanged. An unknown query gives `commit-unknown` with this invoke's operation. Lookup neither reserves the slot nor drives the original execution.

The access guard checks the tenant and principal before lookup. SPEC line 61 hides a missing object as `denied`. Here that means no original record, so new work meets a held slot and receives `busy` under SPEC 646.

Journal admission reserves the slot and runs U0 through E0. Success returns the handle and sets the slot to running. A failure before `open` releases a new reservation. An unknown `open` keeps it reserved. An idempotent open can find an execution that already advanced. See the E1 reading in [Temporary choices](#temporary-choices).

#### R0 retries

An unknown E0 `open` leaves an R0 item with its operation and execution identities. Only a retry matching both identities enters this R0 path. A different execution goes through Journal lookup and leaves the original reservation unchanged.

- `committed`: repeat the same `open` to obtain the original receipt and Authority. Continue at E1. A retry failure before `open` preserves the R0 item and reservation.
- `excluded`: admit again under the same identity. A retry failure before `open` releases the reservation.
- `unknown`: return `commit-unknown` with the invoke operation and preserve the reservation. A failed query returns that failure and also preserves the reservation.

No background timer checks the R0 item. Background waits are not delivered.

At Q2, an unknown `handoff.accept` receipt returns `commit-unknown` with the invoke operation. A new admission releases the slot because no execution exists yet. Calling again with the same operation is the query. U0 and Q2 repeat `accept` with the same operation and candidate to obtain the original result (#558 S-13).

This is the phase 1 reading of the node table's Q2 `commit-unknown` edge to R0, where an unknown result waits. The caller performs the retry because background waits are not delivered. The external input has no separate acceptance receipt under #558 S-13.

Stops:

- An outcome off the normal path stops the run at its node. No stop becomes a success.
- After a stop the slot stays occupied, and `observe` shows occupied. The Journal keeps the `position` of the last commit. A new `invoke` gets `busy`.
- The coordinator returns the failure and its `owner` internally (#558 S-14). A port failure keeps its owner. `@omne-harness/agent` marks an outcome outside current support. `@omne-harness/agent#defect` marks a coordinator defect. There is no public stop reason. Waits are not delivered.

Slot rules:

- The slot has three states: free, reserved and running. A reservation may contain an R0 item. A stopped execution keeps the slot occupied. Its slot state remains `running`.
- `observe` shows only an execution that exists. Free and reserved show idle. Running shows occupied.
- Admission failures and uncertain receipts follow [R0 retries](#r0-retries).
- The registration handle only receives a projection. A `report` that throws is dropped. `invoke` returns as usual, and the slot and `observe` do not change. Waiting for the owner (待拥有者): `report` returns void, and the contract gives its failure no channel.

The diagram below shows the states of the slot. Each state shows in brackets what `observe` shows.

```mermaid
stateDiagram-v2
    state "free (observe: idle)" as free
    state "reserved, with or without an R0 item (observe: idle)" as reserved
    state "running, including a stopped execution holding the slot (observe: occupied)" as running
    [*] --> free
    free --> reserved: invoke
    reserved --> free: new admission fails, or open is excluded
    reserved --> reserved: open unknown, or retry fails before open after query committed
    reserved --> running: first open accepted, or retry accepted after query committed
    running --> free: E9, or E1 finds an execution that moved on
```

The factory does not implement these creation checks, because no input of the factory can decide them. They stay with the owner or a later card.

- Waiting for the owner (待拥有者): whether the binding tenant matches the security scope (`denied`). The `scope` is an `Evidence` and carries no tenant. No dependency port can decide the match at creation.
- Waiting for the owner (待拥有者): whether the exact adoptions `binding.definition` and `loopGuardPolicy` resolve (`unavailable`). Through the definition, this also decides whether tools, admission and extensions are required. `AgentAdoptions.resolve` requires an `Access`, and the factory takes no Access. The loop judgment, a trusted system extension, resolves `loopGuardPolicy`. #502 step 3.7 only connects an empty implementation at that position. Step 7.1 (stage 7) implements the real guard.
- Waiting for #558 M04-3: how an external coordinator declares its participation. The factory compares only the `CallerCommit` kinds that `capabilities.participants` can name. An independent assembly (`jointCommits` empty) is created as before.
- Waiting for the owner (待拥有者): the contract gives `observe` no `invalid` end reason for an Access with a missing or malformed tenant. The current code does not call `access.check` and ends with `denied`, so the failure stays closed.

#### Temporary choices

These choices describe phase 1 readings and mechanisms not delivered. The node table owns the target behavior. [tests/README](tests/README.md) states the test coverage.

- 临时简化，1.3–1.9 按节点表收紧 (temporary simplification): the skeleton commits once at the end of each node that writes a checkpoint. Each commit moves `position` to the next node. The exact commit points of the node table are not followed. U0 to Q4 run before the execution exists and do not commit. E1, E2 and E4 only read. A commit there would overwrite the `position` that E4 reads. F3 uses `tryFinish`. After ended the Journal refuses commits, so F4, O0 and E9 use their own record methods only.
- Waiting for #558 M04-1: the commit that follows `recordResult` at M3 carries the producer event.
- Waiting for #558 M04-8 (this reading): the I0 commit carries the input-taken event.
- Waiting for #558 M04-7: `open` writes no event.
- Waiting for #558 M04-5: in an independent assembly `recordResult.transfer` is processed without a declared participant.
- The Q2 receipt uses the phase 1 reading in [R0 retries](#r0-retries). Under #558 S-13, calling `accept` again with the same operation and candidate is the query.
- E1 returns `found-existing` when the Journal revision advanced beyond the original open receipt. The transition table ends coordination successfully to avoid a second Loop for an accepted operation. The node table's E1 row has no such edge. This is a phase 1 reading.
- An execution opened without any later revision can still run under its original Authority in a new runtime. Two live runtimes can therefore drive it. Fencing with `attach` is not delivered.
- In free, reserved and running slots, phase 1 does not recognize the same operation naming another execution as the same admission. A free slot can admit a second execution. A held slot follows normal routing and usually returns busy. Detecting this reuse requires an index across executions. The Journal provider owns that index. Phase 1 does not provide it.
- I1 sends what `prepare` returns, assembled or ready, to P0 (pseudocode `prepareRequest`). The I1 row of the node table names ready only for `resume`.
- `JournalCommit` has no field for the final request record (M04-2), so M0 does not write it. E1 does not check the Access again (1.4). The loop judgment, a trusted system extension, does not run at M4 (stages 3 and 7).

The memory Journal uses these temporary choices for three open facts. The source comments, the test names and this table mark each one as 「临时做法，待 #558 裁定」 (temporary, waiting for the #558 decision). They change in the same wave as the decision.

- M04-4: `commit` and the six record methods (`submit`, `control`, `acknowledge`, `recordResult`, `recordControl`, `recordTerminalObservation`) advance the revision on each successful write. A retry of the same operation returns the original receipt and does not advance it.
- M04-5: when `recordResult.transfer` is custody or processed, the provider sets up the custody or completion evidence itself, also without a declared participant. A non-none `commit.caller` kind that is not declared returns `unsupported` and saves nothing.
- M04-7: `open` appends no event. The first event comes from a later commit.

These choices are also marked 「临时做法，待 #558 裁定」:

- The M04-1 reading: `control` and `recordControl` project each stage fact as a control event, as SPEC [six stages](../agent-contract/SPEC.md#六个阶段) states. When the same stage is recorded again with the same evidence under a new operation, the Journal returns the original receipt. It does not advance the revision or project the event again. After ended, `recordControl` records the stage fact but projects no event, because the ended event is the last event of an execution.
- The blocked reasons of `tryFinish`: the Journal checks, in this order, operations (a write of the execution is still undecided), controls (an applicable stage is recorded unresolved), inputs (an ordinary end leaves accepted inputs that no taken batch covers; a cancel is not blocked by them), and custody (a result has neither custody nor completion evidence). Where SPEC does not state the condition, the Journal takes the stricter reading. It does not check passages: whether the before-terminal passages are complete and bound to the candidate is a fact of the coordinator, and the Journal cannot judge it from its own records.

The memory Journal does not implement writes that no type carries (final request record, backoff instant and next check instant; see M04-2). It does not project stream and producer events (M04-1). No method appends an event after the ended event. Each call that returns `commit-unknown` leaves a record that `query` can decide: committed when the write took effect, excluded when it did not, and undecided while nobody knows (listed in `unresolved`, fenced out by `attach` or decided by `settle`). Operation records and pending writes are kept per tenant. A write from another tenant returns denied before any scripted fault and never becomes pending. `unresolved`, the fence of `attach`, the operations check of `tryFinish` and `settle` look only at records of the execution's own tenant. `query` does not tell another tenant whether an execution exists.

## Usage

The root entry gives `createAgentRuntime` and `agentEvaluator`. An assembly adopts `agentEvaluator` for the bound definition in `AgentAdoptions`. The factory checks the assembly and returns an idle provider. `invoke` takes one input and returns the handle, and the caller reads the events through it. Only the normal path without tools and extensions runs now. The [API design](docs/public-api.md) describes the shapes. Tests use `@omne-harness/agent/testing`. `createTestAgentDependencies()` returns `dependencies` and `controls`. A test sets the answers of each double through its `Script`: `always` sets the standing answer, `once` sets the next answer, and `calls` logs each input. `controls.journal.failNext` makes a chosen write return `unavailable` or `commit-unknown`. The doubles are for tests only. Do not assemble them into production.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api.md) separates actual exports from designed interfaces.

## Design

The [architecture](docs/architecture/README.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Pure contract and implementation packages do not install Cordis. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

Run `pnpm turbo run test --filter=@omne-harness/agent` from the repository root, and `pnpm typecheck` in this directory. turbo builds this package and its dependencies first. `pnpm turbo run test:fast --filter=@omne-harness/agent` runs only the fast tier. `pnpm test` in this directory runs Vitest only and does not build, and the import-graph tests read the built output of this package and its dependencies. The tests check these items:

- the public entries, the import graphs and the manifest dependencies
- the four creation failures and the idle success of the factory
- the access guard of the four faces
- the same-shape facts and the three temporary choices of the memory Journal
- the scripting interface of each double
- the transition table, the evaluator and one input to ended on the normal Loop path
- admission: repeated operations (C1), conflicting inputs, busy, commit-unknown and the R0 retry routes
- canonical input equality and successful completion of E1 found-existing coordination

The tests do not establish runtime support off the normal path. [tests/README](tests/README.md) describes how the tests are organized.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns the member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. [docs](docs/README.md) lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
