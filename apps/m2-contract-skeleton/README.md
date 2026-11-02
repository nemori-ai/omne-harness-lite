# @omne-harness/m2-contract-skeleton

[中文说明](README_ZH.md)

A private verification app. It connects the public contract members of the Harness in one process, along the path a first tenant takes, and reports each hop as `verified`, `failed`, or `gap`. Use it to find where the published entries of the contract members stop connecting before you build a real deployment. It is not a production service and has no deployment role.

## Responsibility and status

The app plays one tenant path through the published entries: create a tenant, log in, create a session through the session codec, send the first request, let Session hand it to Agent, let Agent assemble through Request Context and call Model, let the Model push the result to the host receiver, record the reply in the Session journal, and read the reply from history. It then drives the later rounds and probes the tool round trip, the reassembly of the Agent instance, and the reasoning replay.

The app imports only the public exports of contract members and their `./testing` doubles. It writes nothing to standard output or to durable storage.

The path report gives each hop H01 through H13 one of three states. `fullPath` is `complete` only when all thirteen hops are verified. Today H01 through H08 are verified with the doubles. H09 through H13 are in the `gap` state: each probe reached a public entry that refused, and the report records which entry and which failure kind. H13, the read of the reply through the same-log Session provider, is a named gap, and a separate test pins the upstream fact behind it. `fullPath` is `incomplete`.

Ten residual gaps are listed below. Five of them block the acceptance. The blocking gaps stay open until the first tenant path of the real deployment covers them, and this app remains the evidence until then. [SPEC.md](SPEC.md) owns the report behavior and the detailed inventory of residual gaps.

## Usage

From the repository root, use the shared test slot. Build the declared dependency closure before the tests.

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test
```

`test:fast` selects the fast cases. `test:slow` selects the bounded timeout case. `test` runs both tiers. A command that exits successfully with no selected cases is not evidence that the behavior passed.

`src/index.ts` exports `runContractSkeleton(inputs)`. The caller passes the path dependencies, the Model obligation subject, and the realization table of the plugin-tree rows it wired. [first-path-doubles.ts](tests/first-path-doubles.ts) builds them from the `./testing` doubles, with two Session stores: `contract-memory` (the default) and `session-log` (a same-log provider). The function returns hop observations with their rows and realization, scenario results, residual gaps, structural diagnostics, `checksPassed`, and `fullPath`.

## Contracts

The path calls [public-contract](../../packages/access/public-contract/SPEC.md) governance and session codecs, [identity](../../packages/identity/identity/SPEC.md) operations, the [Session contract](../../packages/session/session-contract/SPEC.md) transaction port with an injected access check, the [Agent](../../packages/agent/agent/SPEC.md) runtime and host receiver, [Request Context](../../packages/context/request-context-contract/SPEC.md) assembly, and the [Model contract](../../packages/model/model-contract/SPEC.md) result push. The Model obligations come from `@omne-harness/model-contract/conformance`. `src/` imports only the root and `./conformance` entries. The tests wire every `./testing` double, including the same-log Journal of [session-adapters](../../packages/session/session-adapters/SPEC.md). [Public dependencies](SPEC.md#public-dependencies) lists the doubles.

The stable outputs are the hop observations, their states, the residual gap inventory, and the `fullPath` value. The path proves that the public entries connect in order for one tenant, and it proves the shapes that cross each hop.

A probe that does not connect proves where it stopped: the public entry that refused, with its failure kind, or the loop position that the Agent journal shows. The doubles do not prove durability, cross-process principal origin, joint commits in one transaction domain, or real vendor behavior. `checksPassed` describes only the checks inside one invocation. External tests and QA keep separate verdicts.

## Design

[path.ts](src/path.ts) runs the hops through ports that the caller passes in, and records safe evidence labels for each hop. A hop of H01 to H04 that does not connect stops the path, and every later hop reports `not-reached`. H05 to H07 are read together after H04. Then H13, H09, and H08 run on the main session. The probes H10, H11, and H12 run only when H07 connected. Each probe runs in its own session and records the first public refusal instead of building the refused behavior. The app owns two bridges: the Agent message hand-over that commits to Session, and the Agent request preparation that assembles through Request Context. [path-report.ts](src/path-report.ts) turns the observations into hop states, records the plugin-tree rows of each hop with their declared realization, and keeps missing and duplicate diagnostics.

A residual gap names what the connected path does not include. Only a blocking residual gap keeps a hop in the `gap` state. The owners are tracked in the delivery process, not in this file.

| Gap | Blocking | Hops | Summary |
| --- | --- | --- | --- |
| GAP-SESSION-WIRE | no | H03, H04, H08 | The session codecs run in process. The server entry that maps the wire session and recognizes the login is still missing. |
| GAP-SESSION-COORDINATOR | no | H04, H07, H09 | No Session faces, drive adapter, or Session-side hand-over. This app orders the calls. |
| GAP-RUN-COMPLETED | no | H07 | Session cannot form a completed Run terminal on this path. |
| GAP-AGENT-CONTEXT | no | H05 | No Agent-side Context adapter. The bridge fixes the request after the Request Context lease. |
| GAP-RECEIVE-SURFACE | no | H06 | H06 connects through the pusher and the host receiver. The Session-side accounting of the Model ACK stays the named deviation `MODEL-ACK-ARRIVAL`. |
| GAP-SECOND-RUN | yes | H09 | Session refuses the second Run with `run-active`, and the Agent answers `input.submit` with `unavailable`. |
| GAP-TOOL-LOOP | yes | H10 | The Agent loop stops at I4 with the tool-call reply. No Tool invocation follows. |
| GAP-AGENT-REASSEMBLY | yes | H11 | `quiesce`, `detach`, and `resume` answer `unavailable`. No public entry supplies the server-entry observation path, so the continuity of the observation after reassembly is not observed. |
| GAP-REASONING-REPLAY | yes | H12 | The Agent loop holds the received result with reasoning parts at M6 and hands over no reply. |
| GAP-SESSION-LOG-TARGETS | yes | H13 | The same-log provider exposes no Model reception targets, so no receiver can be built over the Session log. |

## Configuration and operation

Node.js 24 or later and the repository's frozen workspace dependencies are required. There is no environment configuration, network service, credential, database, or background process. The path waits at most 2000 event-loop turns for each Agent reply. Model conformance uses a 500 ms bound per operation. Tests set a 15 second outer limit.

## Verification

The [tests](tests) run the connected path over the doubles. They check that each hop of the first round is connected, that the session codecs carried the create, send, and read-history messages, that Request Context acquired and released a Model preparation lease, that the history reply has the Model reply text, and that another tenant cannot read the session.

They check that H03 stays pending, with no Session store built, when the Session access check is `undefined`, and that H03 stops when the check denies. They check that the path stops at the owning hop when identity refuses the login, when the Session login gate has no login confirmation, when the Session evidence bridge is unavailable, when Session refuses the hand-over, when the Model does not settle, and when the history does not carry the reply.

They check where H09 to H13 stop and which public entry refused, and that the evidence names a refusal only when the path observed it. They pin the upstream facts behind the blocking residual gaps: the unimplemented Agent faces, the missing reception targets of the same-log provider, and the refusal of a sealed `reasoning_state` part by the scripted Model producer. They check that the `session-log` store connects H13 and stops at H06, and that the Tool double runs a file read, a file write, and one command.

The [message bridge tests](tests/message-bridge.spec.ts) call the `MessageHandoff` port of the path directly. They check that each hop is decided once, that a concurrent prepare of the same hop waits for the first one, that only a validation refusal fixes a rejection, that an unavailable or unknown Session write fixes nothing, and that `exclude` refuses a request that is not the request of the fixed outcome. The report tests check missing, repeated, and unexecuted hops, scenarios, and obligations, and the declared realization of every row. A report does not contain credentials, login proofs, message bodies, or raw provider errors.

These tests establish the connection with controlled inputs. They do not establish a durable identity provider, durable Session storage, a real Model supplier, an HTTP access layer, or a complete deployment. Independent acceptance belongs to the repository delivery process.

## Maintenance

The integration delivery line maintains this app until it exits. When a supplying contract changes, consume the adopted change and update the hop and gap sections of [SPEC.md](SPEC.md). The [exit rules](SPEC.md#maintenance-and-exit) remove this app after the first tenant path passes the same acceptance, H01 to H13, through the plugin tree. Execution logs and review evidence stay in task `tmp/`.
