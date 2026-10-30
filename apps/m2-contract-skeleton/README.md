# M2 contract skeleton

[中文说明](README_ZH.md)

## Responsibility and status

`@omne-harness/m2-contract-skeleton` is the private verification application (CS) of the M1 joint acceptance (G1) and of the M1.5 closing gate H3 (CS v2). It connects the M2 tenant path in one process: create a tenant, log in, create a session through the session codec, send the first request, let Session hand it to Agent, let Agent assemble through Request Context and call Model, let the Model push the result to the host receiver, record the reply in the Session journal, and read the reply from history. It then drives the later rounds and probes the tool round trip, the reassembly of the Agent instance and the reasoning replay. It uses only the public exports of contract members and their `./testing` doubles.

The path report gives each hop H01 through H13 as `verified`, `failed`, or `gap`. `fullPath` is `complete` only when all thirteen hops are verified. In this edition the first round, H01 through H08, is verified with the doubles. H09 through H13 are gaps: each probe reached its hop and recorded the public refusal it met on this track. `fullPath` is `incomplete`. The report also lists the ten residual gaps below, five of them blocking. The application has no production command or deployment role. [SPEC.md](SPEC.md) owns the report behavior and the detailed gap inventory.

## Usage

From the repository root, use the shared test slot. Build the declared dependency closure before tests.

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test
```

`test:fast` selects fast cases. `test:slow` selects the bounded timeout case. `test` runs both tiers. A successful command with no selected cases is not evidence that this application's behavior passed.

`src/index.ts` exports `runContractSkeleton(inputs)`. The caller passes the path dependencies, the Model obligation subject and the realization table of the plugin-tree rows it wired. [first-path-doubles.ts](tests/first-path-doubles.ts) builds them from the `./testing` doubles, with two Session stores: `contract-memory` (default) and `session-log` (the same-log provider of #756). The function returns hop observations with their rows and realization, scenario results, residual gaps, structural diagnostics, `checksPassed`, and `fullPath`. It writes nothing to standard output or to durable storage.

## Contracts

The path calls [public-contract](../../packages/access/public-contract/SPEC.md) governance and session codecs, [identity](../../packages/identity/identity/SPEC.md) operations, the [Session contract](../../packages/session/session-contract/SPEC.md) transaction port with an injected access check, the [Agent](../../packages/agent/agent/SPEC.md) runtime and host receiver, [Request Context](../../packages/context/request-context-contract/SPEC.md) assembly, and the [Model contract](../../packages/model/model-contract/SPEC.md) result push. The Model obligations come from `@omne-harness/model-contract/conformance`. `src/` imports only the root and `./conformance` entries. The tests wire every `./testing` double, including the same-log Journal of [session-adapters](../../packages/session/session-adapters/SPEC.md). [Public dependencies](SPEC.md#public-dependencies) lists the doubles.

The path proves that these public entries connect in order for one tenant, and it proves the shapes that cross each hop. A disconnected probe proves which public entry refused and with which failure kind. The doubles do not prove durability, cross-process principal origin, joint commits in one transaction domain, or real vendor behavior. `checksPassed` describes only the checks inside one invocation. External tests and QA keep separate verdicts.

## Design

[path.ts](src/path.ts) runs the hops through ports that the caller passes in, and records safe evidence labels for each hop. A failed hop of the first round stops the path, and every later hop reports `not-reached`. The probes run in their own sessions and record a public refusal instead of building the refused behavior. The application owns two bridges: the Agent message hand-over that commits to Session, and the Agent request preparation that assembles through Request Context. [path-report.ts](src/path-report.ts) turns the observations into hop states, records the plugin-tree rows of each hop with their declared realization, and keeps missing and duplicate diagnostics.

Residual gaps name what the connected path does not include. Only a blocking gap keeps a hop a gap:

| Gap | Blocking | Owner | Summary |
| --- | --- | --- | --- |
| [GAP-SESSION-WIRE](SPEC.md#gap-session-wire) | no | [#685](https://github.com/nemori-ai/omne-harness-lite/issues/685) | The session codecs run in process. The server entry that maps the wire session and recognizes the login is M2 work. |
| [GAP-SESSION-COORDINATOR](SPEC.md#gap-session-coordinator) | no | [#536](https://github.com/nemori-ai/omne-harness-lite/issues/536), [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) | No Session faces, drive adapter, or Session-side hand-over. This application orders the calls. |
| [GAP-RUN-COMPLETED](SPEC.md#gap-run-completed) | no | [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) | Session cannot form a completed Run terminal on this path. |
| [GAP-AGENT-CONTEXT](SPEC.md#gap-agent-context) | no | [#542](https://github.com/nemori-ai/omne-harness-lite/issues/542), [#676](https://github.com/nemori-ai/omne-harness-lite/issues/676) | No Agent-side Context adapter. The bridge fixes the request after the Request Context lease. |
| [GAP-RECEIVE-SURFACE](SPEC.md#gap-receive-surface) | no | [#795](https://github.com/nemori-ai/omne-harness-lite/issues/795), [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) | H06 connects through the pusher and the host receiver. The Session-side accounting of the Model ACK stays the named deviation `MODEL-ACK-ARRIVAL`. |
| [GAP-SECOND-RUN](SPEC.md#gap-second-run) | yes | [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756), [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) | A second Run needs the first Run's completed terminal or an Agent `submit`; neither is on the track. |
| [GAP-TOOL-LOOP](SPEC.md#gap-tool-loop) | yes | [#520](https://github.com/nemori-ai/omne-harness-lite/issues/520), [#524](https://github.com/nemori-ai/omne-harness-lite/issues/524), [#525](https://github.com/nemori-ai/omne-harness-lite/issues/525), [#526](https://github.com/nemori-ai/omne-harness-lite/issues/526), [#528](https://github.com/nemori-ai/omne-harness-lite/issues/528) | The Agent loop refuses a reply with tool calls at I4 until #502 stage 2. |
| [GAP-AGENT-REASSEMBLY](SPEC.md#gap-agent-reassembly) | yes | [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502), [#746](https://github.com/nemori-ai/omne-harness-lite/issues/746) | `quiesce`, `detach` and `resume` answer `unavailable` until #502 stage 5. |
| [GAP-REASONING-REPLAY](SPEC.md#gap-reasoning-replay) | yes | [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502), [#683](https://github.com/nemori-ai/omne-harness-lite/issues/683) | The Agent loop does not consume a result with a thinking or reasoning part. |
| [GAP-SESSION-LOG-TARGETS](SPEC.md#gap-session-log-targets) | yes | [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) | The same-log provider exposes no reception targets, so no receiver can be built over the Session log. |

## Configuration and operation

Node.js 24 or later and the repository's frozen workspace dependencies are required. There is no environment configuration, network service, credential, database, or background process. The path waits at most 2000 event-loop turns for each Agent reply. Model conformance uses a 500 ms bound per operation. Tests set a 15 second outer limit.

## Verification

The [tests](tests) run the connected path over the doubles. They check that each hop of the first round is connected, that the session codecs carried the create, send and read-history messages, that Request Context acquired and released a Model preparation lease, that the history reply has the Model reply text, and that another tenant cannot read the session. They check that the path stays pending before H03 without an injected Session access check, and stops at H03 when the check denies. They check that the path stops at the owning hop when identity refuses the login, when the Session login gate has no login confirmation, when the Session evidence bridge is unavailable, when the Model does not settle, and when the history does not carry the reply. They check that each probe of H09 to H13 records the exact public refusal it meets, and that the `session-log` store connects H13 and stops at H06. The report tests check missing, repeated, and unexecuted hops, scenarios, and obligations, and the declared realization of every row. A report does not contain credentials, login proofs, message bodies, or raw provider errors.

These tests establish the connection with controlled inputs. They do not establish a durable identity provider, durable Session storage, a real Model supplier, an HTTP access layer, or a complete M2 deployment. Independent acceptance belongs to the repository delivery process.

## Maintenance

The integration delivery line maintains this application until it exits. When a supplying contract changes, consume the adopted change and update the hop and gap sections of [SPEC.md](SPEC.md). The [exit rules](SPEC.md#maintenance-and-exit) remove this member after the application member of the first tenant path passes the same acceptance through the plugin tree. Execution logs and review evidence stay in task `tmp/`.
