PACKAGE_TEMPLATE_DRAFT

# agent

## Responsibility and status

This package provides reusable implementation mechanisms and factories. It does not include Cordis. The design is [accepted](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204). The root entry exports the public construction types and `createAgentRuntime`. The factory checks the configuration, the binding, the registration handle, the required dependencies and the joint commits. On success it returns an idle provider. Each public operation of the four faces checks the tenant first and then calls `access.check` once. The operation bodies other than `observe` are not implemented: after `allowed` they return a named `unavailable`. The `./testing` entry gives a test assembly: a memory Journal, scriptable doubles of the ports, a manual clock and `createTestAgentDependencies`.

### Support scope

The tiers are defined in the [member documentation requirements](../../../docs/member-documentation.md). The table follows the [tool support scope](../../tool/tool/README_ZH.md#支持范围). The verification column states only what the tests check. It does not state that behavior outside the tests holds.

| Tier | Status in this package | Entry | Verification scope |
| --- | --- | --- | --- |
| Public types exported | Exported: `AgentRuntimeBinding`, `AgentConfiguration`, `AgentRuntimeOptions`, `AgentDependencies` (17 dependencies) and `AgentProvider`. The shapes are in the [API design](docs/public-api.md) | Root entry | `tests/public-entry.spec.ts` checks the export names of the root and `./testing` entries, the import graphs of source and build output, the manifest dependencies and the Cordis routes |
| Pure contract functions implemented | None in this package. The contract functions are in `agent-contract` | None | None |
| Independent execution implemented | None | None | None |
| Runtime paths implemented | The creation checks of `createAgentRuntime`. A configuration item out of range or a malformed binding field returns `invalid`, and `field` gives the item path. A registration handle for another instance returns `denied`. An absent required dependency (10 of them) returns `unavailable`, and `diagnostic` names it. A `jointCommits` kind that the Journal does not declare returns `unsupported`. A failure builds no runtime and calls no dependency method. A success gives an idle provider. The access guard: each public operation of the four faces first checks the tenant of the Access. A missing tenant is `invalid` and another tenant is `denied`. Neither calls `access.check`. Then the operation calls `access.check` once. It does not cache `allowed`, and `denied` or `unavailable` stops the operation. After `allowed`, `observe` shows the idle state and ends with `closed` when the signal aborts. The other operations return `unavailable` with the `diagnostic` "<operation> is not implemented until #502 stage N". This answer is temporary for the stage. It is not a contract result | Root entry | `tests/factory.spec.ts` checks each of the four creation failures and the idle success. `tests/provider-access.spec.ts` checks, for each public operation, the tenant check, the three results of `access.check` and the single call. `tests/assembly.spec.ts` builds an idle provider from the test assembly and checks that the creation calls no dependency. The checks listed below as not implemented have no test |
| Test assembly (`./testing`) | `createMemoryAgentJournal`: a single-process, non-durable `AgentJournal`. It implements all 18 members by facts 1 to 15 of the [same-shape list](docs/architecture/mechanisms.md#两种实现必须同形的事实). Options set the declared participants. A test can script `unavailable` and three kinds of `commit-unknown` on chosen operations. Scriptable doubles of the other ports, `createManualAgentClock` and a hand-written `ToolRuntime` double. `createTestAgentDependencies` returns the 17 dependencies (`registration` is null) and the control handle of each double. `models` is the scripted provider of `model-contract/testing` | `./testing` | `tests/memory-journal.spec.ts` checks each fact of the same-shape list. Each test name has the fact number. `tests/fixtures.spec.ts` has one test for each scripting interface. There is only one process. Durability, crashes and cross-process use are not covered |
| Hosts and providers not delivered | The operation bodies of the four faces other than `observe`, and all Loop nodes (#502 stage 1 and later). The durable Journal provider `agent-journal-local`. Real Context, HITL, authorization, Session adapters and material storage | None | No evidence |

The factory does not implement these creation checks, because no input of the factory can decide them. They stay with the owner or a later card.

- Waiting for the owner (待拥有者): whether the binding tenant matches the security scope (`denied`). The `scope` is an `Evidence` and carries no tenant. No dependency port can decide the match at creation.
- Waiting for the owner (待拥有者): whether the exact adoptions `binding.definition` and `loopGuardPolicy` resolve (`unavailable`). Through the definition, this also decides whether tools, admission and extensions are required. `AgentAdoptions.resolve` requires an `Access`, and the factory takes no Access. The loop judgment resolves `loopGuardPolicy`, and #502 stage 3 implements the loop judgment.
- Waiting for #558 M04-3: how an external coordinator declares its participation. The factory compares only the `CallerCommit` kinds that `capabilities.participants` can name. An independent assembly (`jointCommits` empty) is created as before.
- Waiting for the owner (待拥有者): the contract gives `observe` no `invalid` end reason for an Access without tenant. The current code does not call `access.check` and ends with `denied`, so the failure stays closed.

The memory Journal uses these temporary choices for three open facts. The source comments, the test names and this table mark each one as 「临时做法，待 #558 裁定」 (temporary, waiting for the #558 decision). They change in the same wave as the decision.

- M04-4: `commit` and the six record methods (`submit`, `control`, `acknowledge`, `recordResult`, `recordControl`, `recordTerminalObservation`) advance the revision on each successful write. A retry of the same operation returns the original receipt and does not advance it.
- M04-5: when `recordResult.transfer` is custody or processed, the provider sets up the custody or completion evidence itself, also without a declared participant. A non-none `commit.caller` kind that is not declared returns `unsupported` and saves nothing.
- M04-7: `open` appends no event. The first event comes from a later commit.

These choices are also marked 「临时做法，待 #558 裁定」:

- The M04-1 reading: `control` and `recordControl` project each stage fact as a control event, as SPEC [six stages](../agent-contract/SPEC.md#六个阶段) states. When the same stage is recorded again with the same evidence under a new operation, the Journal returns the original receipt. It does not advance the revision or project the event again. After ended, `recordControl` records the stage fact but projects no event, because the ended event is the last event of an execution.
- The blocked reasons of `tryFinish`: the Journal checks, in this order, operations (a write of the execution is still undecided), controls (an applicable stage is recorded unresolved), inputs (an ordinary end leaves accepted inputs that no taken batch covers; a cancel is not blocked by them), and custody (a result has neither custody nor completion evidence). Where SPEC does not state the condition, the Journal takes the stricter reading. It does not check passages: whether the before-terminal passages are complete and bound to the candidate is a fact of the coordinator, and the Journal cannot judge it from its own records.

The memory Journal does not implement writes that no type carries (final request record, backoff instant and next check instant; see M04-2). It does not project stream and producer events (M04-1). No method appends an event after the ended event. Each call that returns `commit-unknown` leaves a record that `query` can decide: committed when the write took effect, excluded when it did not, and undecided while nobody knows (listed in `unresolved`, fenced out by `attach` or decided by `settle`). Operation records and pending writes are kept per tenant. A write from another tenant returns denied before any scripted fault and never becomes pending. `unresolved`, the fence of `attach`, the operations check of `tryFinish` and `settle` look only at records of the execution's own tenant. `query` does not tell another tenant whether an execution exists.

## Usage

The root entry gives `createAgentRuntime`. It checks the assembly and returns an idle provider, but it cannot take an execution yet. The [API design](docs/public-api.md) describes the future shapes. Tests use `@omne-harness/agent/testing`. `createTestAgentDependencies()` returns `dependencies` and `controls`. A test sets the answers of each double through its `Script`: `always` sets the standing answer, `once` sets the next answer, and `calls` logs each input. `controls.journal.failNext` makes a chosen write return `unavailable` or `commit-unknown`. The doubles are for tests only. Do not assemble them into production.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api.md) separates actual exports from designed interfaces.

## Design

The [architecture](docs/architecture/README.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Pure contract and implementation packages do not install Cordis. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/agent test` builds the package and runs the tests. `pnpm --filter @omne-harness/agent typecheck` checks the types. The tests check the public entries, the import graphs and the manifest dependencies, the four creation failures and the idle success of the factory, the access guard of the four faces, the same-shape facts and the three temporary choices of the memory Journal, and the scripting interface of each double. They do not establish runtime support. [tests/README](tests/README.md) describes how the tests are organized.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns the member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. [docs](docs/README.md) lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
