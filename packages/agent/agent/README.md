PACKAGE_TEMPLATE_DRAFT

# agent

## Responsibility and status

This package provides reusable implementation mechanisms and factories. It does not include Cordis. The design is [accepted](https://github.com/nemori-ai/omne-harness-lite/issues/384#issuecomment-6258475204). The root entry exports the public construction types and `createAgentRuntime`. The factory is not implemented: every call returns `unavailable`. The `./testing` entry gives a test assembly: a memory Journal, scriptable doubles of the ports, a manual clock and `createTestAgentDependencies`.

### Support scope

The tiers are defined in the [member documentation requirements](../../../docs/member-documentation.md). The table follows the [tool support scope](../../tool/tool/README_ZH.md#支持范围). The verification column states only what the tests check. It does not state that behavior outside the tests holds.

| Tier | Status in this package | Entry | Verification scope |
| --- | --- | --- | --- |
| Public types exported | Exported: `AgentRuntimeBinding`, `AgentConfiguration`, `AgentRuntimeOptions`, `AgentDependencies` (17 dependencies) and `AgentProvider`. The shapes are in the [API design](docs/public-api.md) | Root entry | `tests/public-entry.spec.ts` checks the export names of the root and `./testing` entries, the import graphs of source and build output, the manifest dependencies and the Cordis routes |
| Pure contract functions implemented | None in this package. The contract functions are in `agent-contract` | None | None |
| Independent execution implemented | None | None | None |
| Runtime paths implemented | None. `createAgentRuntime` has the designed signature, but the factory is not implemented. It reads no dependency, writes no Journal record and returns `unavailable`. The `diagnostic` states that the factory is not implemented yet | Root entry | `tests/assembly.spec.ts` calls the factory with the test assembly. It checks that the factory returns `unavailable` and calls no dependency |
| Test assembly (`./testing`) | `createMemoryAgentJournal`: a single-process, non-durable `AgentJournal`. It implements all 18 members by facts 1 to 15 of the [same-shape list](docs/architecture/mechanisms.md#两种实现必须同形的事实). Options set the declared participants. A test can script `unavailable` and three kinds of `commit-unknown` on chosen operations. Scriptable doubles of the other ports, `createManualAgentClock` and a hand-written `ToolRuntime` double. `createTestAgentDependencies` returns the 17 dependencies (`registration` is null) and the control handle of each double. `models` is the scripted provider of `model-contract/testing` | `./testing` | `tests/memory-journal.spec.ts` checks each fact of the same-shape list. Each test name has the fact number. `tests/fixtures.spec.ts` has one test for each scripting interface. There is only one process. Durability, crashes and cross-process use are not covered |
| Hosts and providers not delivered | The factory and all Loop nodes (#502 stage 1 and later). The durable Journal provider `agent-journal-local`. Real Context, HITL, authorization, Session adapters and material storage | None | No evidence |

The memory Journal uses these temporary choices for three open facts. The source comments, the test names and this table mark each one as 「临时做法，待 #558 裁定」 (temporary, waiting for the #558 decision). They change in the same wave as the decision.

- M04-4: `commit` and the six record methods (`submit`, `control`, `acknowledge`, `recordResult`, `recordControl`, `recordTerminalObservation`) advance the revision on each successful write. A retry of the same operation returns the original receipt and does not advance it.
- M04-5: when `recordResult.transfer` is custody or processed, the provider sets up the custody or completion evidence itself, also without a declared participant. A non-none `commit.caller` kind that is not declared returns `unsupported` and saves nothing.
- M04-7: `open` appends no event. The first event comes from a later commit.

The memory Journal does not implement writes that no type carries (final request record, backoff instant and next check instant; see M04-2). It does not project stream and producer events (M04-1). `control` and `recordControl` project each stage fact as a control event, as SPEC [six stages](../agent-contract/SPEC.md#六个阶段) states.

## Usage

The root entry gives no runtime capability yet. The [API design](docs/public-api.md) describes the future shapes. Tests use `@omne-harness/agent/testing`. `createTestAgentDependencies()` returns `dependencies` and `controls`. A test sets the answers of each double through its `Script`: `always` sets the standing answer, `once` sets the next answer, and `calls` logs each input. `controls.journal.failNext` makes a chosen write return `unavailable` or `commit-unknown`. The doubles are for tests only. Do not assemble them into production.

## Contracts

The [SPEC](SPEC.md) owns behavior. The [API page](docs/public-api.md) separates actual exports from designed interfaces.

## Design

The [architecture](docs/architecture/README.md) owns mechanisms and dependency decisions. Use the [topic index](docs/index.md) for other responsibilities.

## Configuration and operation

Pass business identities as operation inputs. Pure contract and implementation packages do not install Cordis. [Cordis integration](docs/cordis.md) describes binding ownership and lifecycle rules.

## Verification

`OMNE_TEST_TIER=fast pnpm --filter @omne-harness/agent test` builds the package and runs the tests. `pnpm --filter @omne-harness/agent typecheck` checks the types. The tests check the public entries, the import graphs and the manifest dependencies, the factory shell that returns `unavailable`, the same-shape facts and the three temporary choices of the memory Journal, and the scripting interface of each double. They do not establish runtime support. [tests/README](tests/README.md) describes how the tests are organized.

## Maintenance

Update actual consumers, the SPEC, and verification when a public contract changes. Implementation details do not redefine domain contracts. The [group](../README.md) owns the member relationships.

## Directory structure and documentation roles

The package follows the source template skeleton. [docs](docs/README.md) lists six documentation topics. Source, tests, schemas, verification, ADRs, examples, resources, and acceptance each have an index. Draft resource slots do not establish template adoption or business acceptance.
