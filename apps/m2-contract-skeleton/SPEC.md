# M2 contract skeleton behavior

This private application connects the M2 tenant path for the M1.5 closing gate H3 (CS v2). It uses only the public exports of contract members and their `./testing` doubles. Its report belongs to this application. The report is not a shared protocol or a production API.

The adopted scope is [#790 revision 4](https://github.com/nemori-ai/omne-harness-lite/issues/790), section 「目标与范围」, items 1 to 8, on top of [#684 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/684). The assembly model is the 「替身与真件」 section of the [application assembly page](../../docs/architecture/runtime/application-assembly.md#替身与真件). This application is the CS that the page names. It is not the application assembly of the first tenant path.

## Path

`runFirstTenantPath(dependencies)` in [path.ts](src/path.ts) runs thirteen hops in one process:

1. H01: create the organization and tenant.
2. H02: log in and recognize the tenant.
3. H03: create the session through the session codec, with the injected Session access check.
4. H04: accept the first request through the session codec, start the Run, and hand the request to Agent.
5. H05: Agent assembles the request through Request Context and sends the Model call.
6. H06: the Model pushes the result to the host receiver, which writes the received entry; the loop continues from it.
7. H07: the Agent reply enters the Session journal.
8. H08: a history read through the session codec returns the pure-message replies.
9. H13: the Agent records of the round are read from the Session log.
10. H09: the later rounds of the session, one Run and one reply for each input.
11. H10: the Model requests a tool, Tool runs it in the execution environment, and the result returns to the Model.
12. H11: the Agent instance is withdrawn during a Model call and assembled again.
13. H12: a reply with reasoning is consumed and the next request replays its state.

H01 to H08 and H13 run on the main session. H09 drives the later rounds on the same session. H10, H11 and H12 are probes. Each probe opens its own session with its own Agent instance, because each needs its own scripted Model answer. The probes run only when H07 of the first round connected.

Each hop calls the public entry of a contract member through a port that the caller passes in. The module builds no double. A hop that fails in the first round stops the path. Every later hop then reports `not-reached`. A hop never reports success for a call that it did not make. A probe that meets a public refusal records the refusal as evidence and stays disconnected. It never builds the refused behavior in this application.

The path uses one tenant and one principal from H02 onward. The tenant comes from the identity response that the governance codec read back. The principal is the account that identity recognized from the login proof.

## Report

`runContractSkeleton(inputs)` in [run.ts](src/run.ts) runs the connected path, the fixed governance protocol scenarios, and the public Model obligation suite. It returns one `PathReport`.

`hops` contains one observation for each hop H01 through H13. Each observation records `hopId`, `publicEntry`, `responsibility`, `ownerCards`, `reason`, `rows`, `realization`, `state`, `blockedBy` and `fragments`. A fragment has `fragmentId`, `status`, and `evidence`. Fragment status is `pass`, `fail`, or `not-applicable`.

`rows` lists the rows of the plugin tree of the [application assembly page](../../docs/architecture/runtime/application-assembly.md#插件树) that the hop crosses. `realization` records, for each row, what the caller wired there on this invocation: `real` (the member's production implementation), `double` (a `./testing` double or a stand-in of this application), `absent` (nothing on the path), or `undeclared` (the caller gave no declaration). The caller declares the table in `inputs.realization`. The report records the declaration; it does not check it against the wiring.

Every hop has one fragment `<hop>-connected` from the connected path. H01 and H02 also carry the governance protocol scenarios. H06 also carries every public Model obligation from `@omne-harness/model-contract/conformance`.

Hop state follows these rules:

- `gap`: the path did not reach the hop, the observation is missing, or a blocking residual gap names the hop. `blockedBy` lists the blocking gaps of the hop. The fragments keep the evidence of what the path met there.
- `failed`: the path reached the hop, no blocking gap names it, and at least one fragment failed or is `not-applicable`.
- `verified`: the path reached the hop, every fragment passed, and no blocking residual gap names the hop.

`fullPath` is `complete` only when all thirteen unique hops are `verified` with a connected fragment and there is no structural error. Any other result keeps it `incomplete`. `gaps` lists the hops that are not verified.

`residualGaps` lists what the connected path does not include. Each entry has `gapId`, `hops`, `owners`, `blocking`, and `reason`. A residual gap names a part of the target system that this path replaces with a call sequence of this application or does not exercise. A blocking gap names a part that #790 requires for the hop and that the public entries of the track do not supply, so the hop stays a gap. A non-blocking gap names a part that the card lets this application call directly or leave out. The sections below are the only detailed gap inventory.

In this edition the first round (H01 to H08) is verified with the doubles. H09 to H13 are gaps: each probe reached its hop and recorded the public refusal it met. `fullPath` is `incomplete` and `checksPassed` is false, because the connected fragments of the five probed hops fail. Five residual gaps are blocking and five are not. The blocking rule stays in the report: when a gap is set to blocking, the hops it names are gaps and `fullPath` is `incomplete`.

`checksPassed` describes the checks inside one invocation. Every required scenario must occur once, execute, and match its expectation. Every hop fragment must pass. Exceptions, timeouts, missing or repeated entries, `fail`, and `not-applicable` make this value false. External Vitest results, independent reviews, and QA do not change this value.

The aggregator inserts a named gap for a missing hop. It keeps repeated observations in `duplicateObservations`, adds a duplicate diagnostic, and marks the normalized hop failed. Both structural faults make `checksPassed` false and `fullPath` incomplete.

## What the report proves

A report proves that the public entries of the members connect in this order, for one tenant, with the doubles that the tests supply. It proves the shapes of the values that cross each hop and the order of the judgments. A disconnected probe proves which public entry refused and with which failure kind.

The report does not prove durability. The doubles keep state in memory. It does not prove cross-process principal origin, joint commits in one transaction domain, or real vendor behavior. The scripted Model provider answers what the test scripted. The governance and session messages travel through the codecs in process, not over HTTP.

## Public dependencies

[path.ts](src/path.ts) imports only root entries: `@omne-harness/public-contract`, `@omne-harness/identity`, `@omne-harness/session-contract`, `@omne-harness/agent`, `@omne-harness/agent-contract`, `@omne-harness/request-context-contract`, `@omne-harness/message`, `@omne-harness/json-text`, `@omne-harness/legal-identity` and `@omne-harness/model-contract`. [model.ts](src/model.ts) imports `@omne-harness/model-contract/conformance`. No file in `src/` imports a `./testing` entry.

The tests wire the doubles in [first-path-doubles.ts](tests/first-path-doubles.ts):

| Capability | Double |
| --- | --- |
| Registration, login, recognition | `inProcessIdentityOperations` with `manualIdentityClock` and `adjustableLoginTerms` |
| Session access check | `createPolicySessionAccessCheck` with an explicit policy, injected by the path |
| Session store, `contract-memory` (default) | `createMemorySessionTransactions` and `createMemorySessionEvidenceBridge`; the Agent keeps its own memory Journal |
| Session store, `session-log` | `createMemorySessionJournal` of `@omne-harness/session-adapters/testing` (#756): one log for the Session entries and the Agent Journal |
| Agent runtime | `createAgentRuntime` over `createTestAgentDependencies`, with the generic `agentEvaluator` |
| Model call and result push | the scripted Model provider and its public result pusher inside `createTestAgentDependencies`; the host receiver of `@omne-harness/agent` writes the received entry |
| Request Context assembly and Model preparation lease | `createAssemblyOperations` through `createAssemblyFixture`, with its scripted preparation resources |
| Model obligations | `createScriptedConformanceSubject` |

The application owns two bridges in [path.ts](src/path.ts). The message bridge is the Agent `MessageHandoff`. It admits the external input and commits `recordMessage` with a `message` participation for a Model reply. The round driver commits `receive(input-handover)` once the Agent accepted the invoke. The context bridge is the Agent `RequestPreparation`. It assembles through Request Context on the first preparation and fixes the request from the assembled input on the second.

## Resource lifetime and failure

The report holds no free text of a supplier or a port. A failure label holds only the step name that this application mints and the `kind` of the failure. An exception that is not a refusal of a path step becomes `first-path-threw:unknown`. Tests check this on the happy path, on the login-gate refusal, and on a supplier that throws.

The path does not call `quiesce` on the Agent runtime to end it. On the happy path the Agent execution of each round has ended when the path returns. The probes of H10 and H12 leave their Agent execution stopped where the loop refused; the runtime and the memory doubles stay reachable only from the caller, and the process releases them. When the Model does not settle, the admitted call stays open in the scripted provider until the process exits. The Model obligation suite owns its subject disposal and its bounded waits. The default wait bound is 500 ms for each suite operation. Tests use a 15 second outer limit.

The path waits for each Agent reply for at most `replyTurns` event-loop turns. The default is 2000. When the Model does not settle, H06 through H08 fail and the report says which call did not occur.

A failed governance scenario does not remove its hop or stop the Model checks. An exception in the connected path becomes a structural error and leaves every hop as a gap. Evidence holds fixed labels, failure kinds, and counts. The report holds no free text of a supplier or a port, and no credential, login proof, or message body.

## H01

The governance codec encodes and reads a `register-and-activate` request. Identity runs `registerAndActivate`. The codec encodes and reads the response with the identity tenant. The hop is connected when the tenant that the response carries equals the identity tenant. The fixed `G1-register` and `G1-create` protocol scenarios are additional fragments.

## H02

The governance codec carries an `issue-login` request and its response. Identity runs `issueLogin` and then `recognizeLogin` with the login proof that the response carries. The hop is connected when identity recognizes the tenant of H01. The other fixed governance scenarios are additional fragments.

## H03

The path hands the injected `sessionAccessCheck` to the caller's Session store builder (#680 ruling B-1, item 4). When no check is injected, the store is not built and the hop stops with `session-assembly:pending:sessionAccessCheck`, as the `agent-journal` row stays `PENDING` without it. The session codec of #685 encodes and reads a `create-session` request with the login proof and the acting tenant. The path commits `create` for the recognized tenant with the definition mapping entry that the caller passes. The codec encodes and reads the `create-session` response with the wire session. `readWork` must return the session. Every commit carries the guard materials of the Session evidence bridge. The store asks the injected check once for each command; a `denied` answer stops the hop with `session-create:denied`.

## H04

The session codec carries a `send-input` request with the message. The path commits `accept` for the ordinary request it read back. The request origin has the owner `login-entry`, as the access layer sets it after a login. The Session evidence bridge hands over the login confirmation (a guard material with the owner `login-entry`) with `startRun`. Session `decide` refuses `startRun` with `login-required` without it. The path builds the Agent of the tenant and commits `startRun`. It reads the admitted input back with `readInput` and invokes the Agent runtime with the Session execution and that input. On the `session-log` store the invoke carries the Run's receipt as the Journal grant. The Agent message hand-over admits the external input. The round driver then commits `receive(input-handover)`. On the `session-log` store the Agent loop can take the input before this commit lands; the log then holds `run.batch-taken` for the Run (AD-02) and the second hand-over is `invalid`, which the path accepts as the hand-over. The hop is connected when `startRun` fixed the request, the hand-over admitted the input, and the Session side holds the hand-over.

## H05

The Agent calls its request preparation. The context bridge reads the Session history and runs Request Context `assemble` over it. During the assembly Request Context acquires a Model preparation lease from its sources, plans the assembled input with the lease, and releases it. The first preparation returns the assembled input. The second preparation fixes the request with the assembled messages. The hop is connected when Request Context assembled at least one history message, at least one lease was acquired and planned an input, no lease is still open, the fixed request carries the assembled messages, the Agent journal binds the Model call of the step, and the caller reports at least one Model admission.

The lease and admission counts are caller-reported. `src/` does not import `./testing`, so it cannot read the counters itself. The assembler that the caller passes reports the lease counts, and the Agent that the caller passes reports the admissions; the evidence labels say `caller-reported`. In the tests of this application the assembler reads the counts from the scripted preparation resources of the Request Context `./testing` fixture, which count every real `acquire`, plan, and `release`. A test checks that the counts come from that counter, and that H05 fails when the assembler reports no lease.

## H06

The Model settles the admitted call. The public result pusher of `@omne-harness/model-contract/testing` (#683) pushes the frozen delivery to the host receiver of `@omne-harness/agent` (#787). The receiver writes the `received` entry and its material in one commit. The Agent loop waits for that entry, reads the material, and hands over the reply of the original call. The hop is connected when the journal holds the received entry, the material reads back under its original binding, and the hand-over carries the reply of the same call. The Model takes its ACK through the pusher after `saved`. The Session-side accounting of that ACK stays open; the evidence records it as the named deviation `MODEL-ACK-ARRIVAL` (GAP-RECEIVE-SURFACE).

## H07

The message bridge commits `recordMessage` with a `message` participation for the Agent reply. The hop is connected when the commit succeeded and the Agent journal shows the execution ended.

## H08

The session codec carries a `read-history` request with the wire session. The path reads the Session history with `history.begin` for the entry kinds a deployment discloses by default, `message.user` and `message.assistant`. The codec encodes and reads the `read-history` response with the page. The hop is connected when the assistant messages of the page carry the Model reply texts of the replied rounds, in round order.

## H09

After the first round the path drives the later rounds on the same session, up to `PATH_ROUNDS` (3). Each round accepts its input through the session codec, starts a Run, and invokes the Agent with a new execution. The hop is connected when every round replied. On this track the first Run has no completed terminal (GAP-RUN-COMPLETED), so `startRun` of round 2 is refused with `run-active`. The path then probes the other route, `input.submit` on the first execution, which the Agent runtime answers `unavailable`. Both refusals are the evidence (GAP-SECOND-RUN).

## H10

In the `tool` probe session the scripted Model answers the first call with a `tool_call` block for `read_file`. The hop is connected when the Tool runtime received an invocation, the Model admitted a second call, and the execution ended. On this track the Agent loop admits the reply, hands it over to Session, and stops at I4: a reply with tool calls is not handled until #502 stage 2. The caller reports zero Tool invocations. The files and command facilities of #791 are not reached (GAP-TOOL-LOOP).

## H11

In the `reassembly` probe session the scripted Model holds the call. Once the Model admitted the call, the path calls `control.quiesce`, `recovery.detach` with the current attachment, and `runtime.resume` on the public faces of the Agent provider. Then it releases the Model and waits for the reply. The hop is connected when the withdrawal and the resume succeeded and the execution ended. On this track the three operations answer `unavailable` (not implemented until #502 stage 5). The original driver continues from the received entry after the Model settles, with one Model admission. The re-attachment of a StreamRef after reassembly is not exercised (GAP-AGENT-REASSEMBLY).

## H12

In the `reasoning` probe session the scripted Model answers with a `thinking` part followed by text. The pusher delivers the result and the receiver writes the received entry. The hop is connected when the Agent handed over the reply and the execution ended. On this track the loop does not consume a result with a thinking or reasoning part, so no reply is handed over and the second request with the replayed state is not reached (GAP-REASONING-REPLAY).

## H13

When the Session store supplies the same-log Agent Journal of #756, the path loads the execution of the first round through that Journal, reads `readWork`, and reads the history. The hop is connected when the Journal returns the execution opened under the Run grant, `readWork` binds the Run to the same execution, and the history carries the hand-over or the batch-taken entry of the execution. On the default `contract-memory` store the Agent keeps its own memory Journal and the hop is a gap. The `session-log` store connects H13, but on that store H06 has no receiver (GAP-SESSION-LOG-TARGETS).

## GAP-SESSION-WIRE

Non-blocking. The session codecs of #685 carry `create-session`, `send-input` and `read-history` in process. The server entry that maps the wire session (the 64-hex digest) to the Session id, recognizes the login proof and selects the disclosed entry kinds is M2 work. This application mints the digest from the Session id and the caller operation ids of `create`, `accept` and `startRun` itself. [#685](https://github.com/nemori-ai/omne-harness-lite/issues/685) owns the session codecs.

## GAP-SESSION-COORDINATOR

Non-blocking. No Session implementation supplies the Session faces, the `AgentDrivePort` adapter, or the Session-side `MessageHandoff`. This application orders the port commits, the Agent invoke and the hand-over, and its message bridge stands in for the Session-side hand-over. The application assembly page lists these rows without an owner card. [#536](https://github.com/nemori-ai/omne-harness-lite/issues/536) owns the Session contract. [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) owns the design of how the Agent host returns its conclusion to Session.

## GAP-RUN-COMPLETED

Non-blocking. Session cannot form a `completed` Run terminal on this path. The only terminal is the bounded `finishRun`, which fails the Run. The Agent execution ends, but the Session Run stays active after H08. The interpretation of the Agent `ended` event into the Session terminal is AD-02, which the `session-log` store exposes only as a testing control the path does not drive. [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) owns it.

## GAP-AGENT-CONTEXT

Non-blocking. No Agent-side Context adapter is on the track. The context bridge of this application stands in for it. The Model preparation lease of the path is the one that Request Context acquires during assembly. The bridge fixes the request itself and does not run a second Model preparation. It takes the source, state, schema, budget, and coverage of the preparation from the Agent test frame. It keeps the representation and source adoptions of the frame, because the Request Context testing policies carry adoption digests that the Model request check refuses. [#542](https://github.com/nemori-ai/omne-harness-lite/issues/542) owns the adapter. [#676](https://github.com/nemori-ai/omne-harness-lite/issues/676) owns the Request Context doubles.

## GAP-RECEIVE-SURFACE

Non-blocking. H06 connects through the public pusher, the host receiver and the received entry. What remains is the named deviation `MODEL-ACK-ARRIVAL`: the Model takes its ACK after `saved`, and the Session-side accounting of that ACK is not closed on this path. The production Model host and the durable forwarding of the ACK are M2 work. [#795](https://github.com/nemori-ai/omne-harness-lite/issues/795) owns the Model host. [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) owns the Agent host.

## GAP-SECOND-RUN

Blocking for H09. A second Run needs the first Run's completed terminal, which GAP-RUN-COMPLETED leaves open, or a submit to the first execution, which the Agent runtime does not implement (`input.submit` is `unavailable`; #502 assigns it no stage). [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) owns the Run terminal through the same-log interpretation. [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) owns `submit`.

## GAP-TOOL-LOOP

Blocking for H10. The Agent loop refuses a reply with tool calls at I4 until #502 stage 2. The action batch, the Tool admission, the Tool invocation and the result hand-over are [#520](https://github.com/nemori-ai/omne-harness-lite/issues/520), [#524](https://github.com/nemori-ai/omne-harness-lite/issues/524), [#525](https://github.com/nemori-ai/omne-harness-lite/issues/525), [#526](https://github.com/nemori-ai/omne-harness-lite/issues/526) and [#528](https://github.com/nemori-ai/omne-harness-lite/issues/528). The `files` and `command` doubles of #791 are ready in `@omne-harness/execution-environment-contract/testing`; this path does not reach them.

## GAP-AGENT-REASSEMBLY

Blocking for H11. The public faces that withdraw and resume an instance, `control.quiesce`, `recovery.detach` and `runtime.resume`, answer `unavailable` until #502 stage 5. The host receiver outside the instance keeps receiving (H06), but no public entry continues an execution from the Journal under a new instance. The re-attachment of observation after reassembly belongs to the server entry. [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) owns the Agent faces. [#746](https://github.com/nemori-ai/omne-harness-lite/issues/746) owns the observation re-attachment.

## GAP-REASONING-REPLAY

Blocking for H12. The Agent loop does not consume a result with a `thinking` or `reasoning_state` part, so the reply is not handed over and no second request replays the state. The scripted Model producer also refuses a sealed `reasoning_state` part, so the replay state can only travel as a `thinking` part on this track. [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) owns the loop. [#683](https://github.com/nemori-ai/omne-harness-lite/issues/683) owns the scripted producer.

## GAP-SESSION-LOG-TARGETS

Blocking for H13. The same-log provider of `@omne-harness/session-adapters/testing` exposes the Agent Journal, entries, materials and received ports, but not the `ModelReceptionTargets` the host receiver needs. Without the targets no public entry builds a receiver over the Session log, so the Model push has no receiver and H06 does not connect on the `session-log` store. The default store therefore keeps the Agent's own memory Journal, and H13 is a gap there. [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) owns the provider.

## Maintenance and exit

The integration delivery line keeps this application until it exits. A new connection requires real public consumption and a failure test for the hop. No upstream private import or local business substitute closes a gap. When a supplying contract changes, this application consumes the adopted change and updates the hop and gap sections.

The application exits under the [policy that removes replaced implementations](../../docs/engineering/publication.md#当前演进与消费者). The exit happens after the application member of the first tenant path completes the same end-to-end acceptance through the plugin tree. The same change removes this member, its navigation entry in [apps/README.md](../README.md), and its dependency closure.
