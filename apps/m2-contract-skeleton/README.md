# M2 contract skeleton

[中文说明](README_ZH.md)

## Responsibility and status

`@omne-harness/m2-contract-skeleton` is the private verification application (CS) of the M1 joint acceptance (G1). It connects the M2 first tenant path in one process: create a tenant, log in, create a session, send the first request, let Session hand it to Agent, let Agent assemble through Request Context and call Model, record the reply in the Session journal, and read the reply from history. It uses only the public exports of contract members and their `./testing` doubles.

The path report gives each hop H01 through H08 as `verified`, `failed`, or `gap`. `fullPath` is `complete` only when all eight hops are verified. In this edition all eight hops are verified with the doubles. The report also lists the residual gaps below. The application has no production command or deployment role. [SPEC.md](SPEC.md) owns the report behavior and the detailed gap inventory.

## Usage

From the repository root, use the shared test slot. Build the declared dependency closure before tests.

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test
```

`test:fast` selects fast cases. `test:slow` selects the bounded timeout case. `test` runs both tiers. A successful command with no selected cases is not evidence that this application's behavior passed.

`src/index.ts` exports `runContractSkeleton(inputs)`. The caller passes the path dependencies and the Model obligation subject. [first-path-doubles.ts](tests/first-path-doubles.ts) builds them from the `./testing` doubles. The function returns hop observations, scenario results, residual gaps, structural diagnostics, `checksPassed`, and `fullPath`. It writes nothing to standard output or to durable storage.

## Contracts

The path calls [public-contract](../../packages/access/public-contract/SPEC.md) governance codecs, [identity](../../packages/identity/identity/SPEC.md) operations, the [Session contract](../../packages/session/session-contract/SPEC.md) transaction port, the [Agent](../../packages/agent/agent/SPEC.md) runtime, and [Request Context](../../packages/context/request-context-contract/SPEC.md) assembly. The Model obligations come from `@omne-harness/model-contract/conformance`. `src/` imports only the root and `./conformance` entries. The tests wire every `./testing` double. [Public dependencies](SPEC.md#public-dependencies) lists the doubles.

The path proves that these public entries connect in order for one tenant, and it proves the shapes that cross each hop. The doubles do not prove durability, cross-process principal origin, joint commits in one transaction domain, or real vendor behavior. `checksPassed` describes only the checks inside one invocation. External tests and QA keep separate verdicts.

## Design

[path.ts](src/path.ts) runs the hops through ports that the caller passes in, and records safe evidence labels for each hop. A failed hop stops the path, and every later hop reports `not-reached`. The application owns two bridges: the Agent message hand-over that commits to Session, and the Agent request preparation that assembles through Request Context. [path-report.ts](src/path-report.ts) turns the observations into hop states and keeps missing and duplicate diagnostics.

Residual gaps name what the connected path does not include. They do not stop a hop from being verified:

| Gap | Owner | Summary |
| --- | --- | --- |
| [GAP-SESSION-WIRE](SPEC.md#gap-session-wire) | [#685](https://github.com/nemori-ai/omne-harness-lite/issues/685) | No session wire codec. The path calls the Session port directly. |
| [GAP-SESSION-COORDINATOR](SPEC.md#gap-session-coordinator) | [#536](https://github.com/nemori-ai/omne-harness-lite/issues/536), [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) | No Session faces, drive adapter, or Session-side hand-over. This application orders the calls. |
| [GAP-RUN-COMPLETED](SPEC.md#gap-run-completed) | [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) | Session cannot form a completed Run terminal on this path. |
| [GAP-AGENT-CONTEXT](SPEC.md#gap-agent-context) | [#542](https://github.com/nemori-ai/omne-harness-lite/issues/542), [#676](https://github.com/nemori-ai/omne-harness-lite/issues/676) | No Agent-side Context adapter. No Model preparation lease call. |
| [GAP-RECEIVE-SURFACE](SPEC.md#gap-receive-surface) | [#672](https://github.com/nemori-ai/omne-harness-lite/issues/672), [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) | The Agent runtime does not use the receive surface. No account hand-over occurs. |

## Configuration and operation

Node.js 24 or later and the repository's frozen workspace dependencies are required. There is no environment configuration, network service, credential, database, or background process. The path waits at most 2000 event-loop turns for the Agent reply. Model conformance uses a 500 ms bound per operation. Tests set a 15 second outer limit.

## Verification

The [tests](tests) run the connected path over the doubles. They check that each hop is connected, that the history reply has the Model reply text, and that another tenant cannot read the session. They also check that the path stops at the owning hop when identity refuses the login, when the Session evidence bridge is unavailable, when the Model does not settle, and when the history does not carry the reply. The report tests check missing, repeated, and unexecuted hops, scenarios, and obligations. A report does not contain credentials, login proofs, message bodies, or raw provider errors.

These tests establish the connection with controlled inputs. They do not establish a durable identity provider, durable Session storage, a real Model supplier, an HTTP access layer, or a complete M2 deployment. Independent acceptance belongs to the repository delivery process.

## Maintenance

The integration delivery line maintains this application until it exits. When a supplying contract changes, consume the adopted change and update the hop and gap sections of [SPEC.md](SPEC.md). The [exit rules](SPEC.md#maintenance-and-exit) remove this member after the application member of the first tenant path passes the same acceptance through the plugin tree. Execution logs and review evidence stay in task `tmp/`.
