# M2 contract skeleton behavior

This private application connects the M2 first tenant path for the M1 joint acceptance (G1). It uses only the public exports of contract members and their `./testing` doubles. Its report belongs to this application. The report is not a shared protocol or a production API.

The adopted scope is [#684 revision 2](https://github.com/nemori-ai/omne-harness-lite/issues/684), section 「开工前裁定（revision 2）」. The assembly model is the 「替身与真件」 section of the [application assembly page](../../docs/architecture/runtime/application-assembly.md#替身与真件). This application is the CS that the page names. It is not the application assembly of the first tenant path.

## Path

`runFirstTenantPath(dependencies)` in [path.ts](src/path.ts) runs the eight hops in order, in one process:

1. H01: create the organization and tenant.
2. H02: log in and recognize the tenant.
3. H03: create the session.
4. H04: accept the first request, start the Run, and hand the request to Agent.
5. H05: Agent assembles the request through Request Context and sends the Model call.
6. H06: the Model result reaches the Agent and its journal.
7. H07: the Agent reply enters the Session journal.
8. H08: a history read returns the pure-message reply.

Each hop calls the public entry of a contract member through a port that the caller passes in. The module builds no double. A hop that fails stops the path. Every later hop then reports `not-reached`. A hop never reports success for a call that it did not make.

The path uses one tenant and one principal from H02 onward. The tenant comes from the identity response that the governance codec read back. The principal is the account that identity recognized from the login proof.

## Report

`runContractSkeleton(inputs)` in [run.ts](src/run.ts) runs the connected path, the fixed governance protocol scenarios, and the public Model obligation suite. It returns one `PathReport`.

`hops` contains one observation for each hop H01 through H08. Each observation records `hopId`, `publicEntry`, `responsibility`, `ownerCards`, `reason`, `state`, and `fragments`. A fragment has `fragmentId`, `status`, and `evidence`. Fragment status is `pass`, `fail`, or `not-applicable`.

Every hop has one fragment `<hop>-connected` from the connected path. H01 and H02 also carry the governance protocol scenarios. H06 also carries every public Model obligation from `@omne-harness/model-contract/conformance`.

Hop state follows these rules:

- `verified`: the path reached the hop, every fragment passed, and no blocking residual gap names the hop.
- `failed`: the path reached the hop and at least one fragment failed or is `not-applicable`.
- `gap`: the path did not reach the hop, the observation is missing, or a blocking residual gap names the hop. `blockedBy` lists the blocking gaps of the hop.

`fullPath` is `complete` only when all eight unique hops are `verified` with a connected fragment and there is no structural error. Any other result keeps it `incomplete`. `gaps` lists the hops that are not verified.

`residualGaps` lists what the connected path does not include. Each entry has `gapId`, `hops`, `owners`, `blocking`, and `reason`. A residual gap names a part of the target system that this path replaces with a call sequence of this application or does not exercise. A blocking gap names a part that #684 requires for the hop, so the hop stays a gap. A non-blocking gap names a part that #684 lets this application call directly or leave out for G1. The sections below are the only detailed gap inventory.

In this edition H01 through H05, H07, and H08 are verified. H06 is a gap, because GAP-RECEIVE-SURFACE blocks it. `fullPath` is therefore `incomplete`, and `checksPassed` is true.

`checksPassed` describes the checks inside one invocation. Every required scenario must occur once, execute, and match its expectation. Every hop fragment must pass. Exceptions, timeouts, missing or repeated entries, `fail`, and `not-applicable` make this value false. External Vitest results, independent reviews, and QA do not change this value.

The aggregator inserts a named gap for a missing hop. It keeps repeated observations in `duplicateObservations`, adds a duplicate diagnostic, and marks the normalized hop failed. Both structural faults make `checksPassed` false and `fullPath` incomplete.

## What the report proves

A complete report proves that the public entries of the members connect in this order, for one tenant, with the doubles that the tests supply. It proves the shapes of the values that cross each hop and the order of the judgments.

The report does not prove durability. The doubles keep state in memory. It does not prove cross-process principal origin, joint commits in one transaction domain, or real vendor behavior. The scripted Model provider answers what the test scripted. The governance messages travel through the codecs in process, not over HTTP.

## Public dependencies

[path.ts](src/path.ts) imports only root entries: `@omne-harness/public-contract`, `@omne-harness/identity`, `@omne-harness/session-contract`, `@omne-harness/agent`, `@omne-harness/agent-contract`, `@omne-harness/request-context-contract`, `@omne-harness/message`, `@omne-harness/json-text`, and `@omne-harness/legal-identity`. [model.ts](src/model.ts) imports `@omne-harness/model-contract/conformance`. No file in `src/` imports a `./testing` entry.

The tests wire the doubles in [first-path-doubles.ts](tests/first-path-doubles.ts):

| Capability | Double |
| --- | --- |
| Registration, login, recognition | `inProcessIdentityOperations` with `manualIdentityClock` and `adjustableLoginTerms` |
| Session commits, login gate, and history | `createMemorySessionTransactions` and `createMemorySessionEvidenceBridge` |
| Agent runtime | `createAgentRuntime` over `createTestAgentDependencies`, with the generic `agentEvaluator` |
| Model call | the scripted Model provider inside `createTestAgentDependencies` |
| Request Context assembly and Model preparation lease | `createAssemblyOperations` through `createAssemblyFixture`, with its scripted preparation resources |
| Model obligations | `createScriptedConformanceSubject` |

The application owns two bridges in [path.ts](src/path.ts). The message bridge is the Agent `MessageHandoff`. It commits `receive(input-handover)` for the external input and `recordMessage` with a `message` participation for a Model reply. The context bridge is the Agent `RequestPreparation`. It assembles through Request Context on the first preparation and fixes the request from the assembled input on the second.

## Resource lifetime and failure

Failure evidence of an exception or of an Agent invoke refusal holds at most 120 or 80 characters of the failure text. The happy-path tests check that the report holds no credential or message body. The failure text of a supplier can still enter these truncated labels.

The path does not call `quiesce` on the Agent runtime. On the happy path the Agent execution has ended when the path returns. The runtime and the memory doubles stay reachable only from the caller, and the process releases them. When the Model does not settle, the admitted call stays open in the scripted provider until the process exits. The Model obligation suite owns its subject disposal and its bounded waits. The default wait bound is 500 ms for each suite operation. Tests use a 15 second outer limit.

The path waits for the Agent reply for at most `replyTurns` event-loop turns. The default is 2000. When the Model does not settle, H05 through H08 fail and the report says which call did not occur.

A failed governance scenario does not remove its hop or stop the Model checks. An exception in the connected path becomes a structural error and leaves every hop as a gap. Evidence holds fixed labels and counts. Credentials, login proofs, message bodies, and raw provider errors do not enter the report.

## H01

The governance codec encodes and reads a `register-and-activate` request. Identity runs `registerAndActivate`. The codec encodes and reads the response with the identity tenant. The hop is connected when the tenant that the response carries equals the identity tenant. The fixed `G1-register` and `G1-create` protocol scenarios are additional fragments.

## H02

The governance codec carries an `issue-login` request and its response. Identity runs `issueLogin` and then `recognizeLogin` with the login proof that the response carries. The hop is connected when identity recognizes the tenant of H01. The other fixed governance scenarios are additional fragments.

## H03

The path commits `create` for the recognized tenant with the definition mapping entry that the caller passes. `readWork` must return the session. Every commit carries the guard materials of the Session evidence bridge.

## H04

The path commits `accept` for an ordinary first request. The request origin has the owner `login-entry`, as the access layer sets it after a login. The Session evidence bridge hands over the login confirmation (a guard material with the owner `login-entry`) with `startRun`. Session `decide` refuses `startRun` with `login-required` without it. On this path `startRun` is reached only after H02 recognized the login. The tests also run the path with a bridge that omits the confirmation, and H04 then fails with `login-required`. The path builds the Agent of the tenant and commits `startRun`. It invokes the Agent runtime with the Session execution and the first input. The Agent message hand-over of the external input commits `receive(input-handover)`. The hop is connected when `startRun` fixed the first request and the hand-over committed.

## H05

The Agent calls its request preparation. The context bridge reads the Session history and runs Request Context `assemble` over it. During the assembly Request Context acquires a Model preparation lease from its sources, plans the assembled input with the lease, and releases it. The first preparation returns the assembled input. The second preparation fixes the request with the assembled messages. The hop is connected when Request Context assembled at least one history message, at least one lease was acquired and planned an input, no lease is still open, the fixed request carries the assembled messages, and the Agent journal binds an admitted Model call.

## H06

The Model settles the admitted call. The Agent processes the result and records it in its journal. The hop is connected when the journal holds a processed Model result and the Agent message hand-over carries the reply of the same Model call. The public Model obligations are additional fragments. #684 names the receive surface of [#672](https://github.com/nemori-ai/omne-harness-lite/issues/672) as the receiver of this hop. The Agent runtime does not use that surface, so the hop stays a gap with GAP-RECEIVE-SURFACE as its blocking gap.

## H07

The message bridge commits `recordMessage` with a `message` participation for the Agent reply. The hop is connected when the commit succeeded and the Agent journal shows the execution ended.

## H08

The path reads the Session history with `history.begin`. The hop is connected when the history holds exactly one `message.assistant` entry and its judged message has the text of the Model reply.

## GAP-SESSION-WIRE

Non-blocking. The session public operations have no wire codec on the track. The path calls the Session transaction port directly. It mints the caller operation ids of `create`, `accept`, `startRun`, and the hand-over itself. [#685](https://github.com/nemori-ai/omne-harness-lite/issues/685) owns the session codecs.

## GAP-SESSION-COORDINATOR

Non-blocking. No Session implementation supplies the Session faces, the `AgentDrivePort` adapter, or the Session-side `MessageHandoff`. This application orders the port commits and the Agent invoke, and its message bridge stands in for the Session-side hand-over. The application assembly page lists these rows without an owner card. [#536](https://github.com/nemori-ai/omne-harness-lite/issues/536) owns the Session contract. [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) owns the design of how the Agent host returns its conclusion to Session.

## GAP-RUN-COMPLETED

Non-blocking. Session cannot form a `completed` Run terminal on this path. The only terminal is the bounded `finishRun`, which fails the Run. The Agent execution ends, but the Session Run stays active after H08. G1 does not need the terminal, because the reply comes from history. [#756](https://github.com/nemori-ai/omne-harness-lite/issues/756) owns the replacement of the Agent event protocol.

## GAP-AGENT-CONTEXT

Non-blocking. No Agent-side Context adapter is on the track. The context bridge of this application stands in for it. The Model preparation lease of the path is the one that Request Context acquires during assembly. The bridge fixes the request itself and does not run a second Model preparation. It takes the source, state, schema, budget, and coverage of the preparation from the Agent test frame. It keeps the representation and source adoptions of the frame, because the Request Context testing policies carry adoption digests that the Model request check refuses. [#542](https://github.com/nemori-ai/omne-harness-lite/issues/542) owns the adapter. [#676](https://github.com/nemori-ai/omne-harness-lite/issues/676) owns the Request Context doubles.

## GAP-RECEIVE-SURFACE

Blocking for H06. `@omne-harness/agent` does not use the receive surface of `@omne-harness/agent-contract` (`AgentJournalEntries`, `AgentAccountOutlet`). The Model result reaches the Agent through the Model runtime calls of the Agent loop. No Model account hand-over occurs on the path. [#672](https://github.com/nemori-ai/omne-harness-lite/issues/672) owns the receive surface. [#502](https://github.com/nemori-ai/omne-harness-lite/issues/502) owns the Agent runtime.

## Maintenance and exit

The integration delivery line keeps this application until it exits. A new connection requires real public consumption and a failure test for the hop. No upstream private import or local business substitute closes a gap. When a supplying contract changes, this application consumes the adopted change and updates the hop and gap sections.

The application exits under the [policy that removes replaced implementations](../../docs/engineering/publication.md#当前演进与消费者). The exit happens after the application member of the first tenant path completes the same end-to-end acceptance through the plugin tree. The same change removes this member, its navigation entry in [apps/README.md](../README.md), and its dependency closure.
