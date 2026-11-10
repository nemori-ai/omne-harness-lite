# @omne-harness/server-entry

[中文](README_ZH.md)

The HTTP entry for the governance and session locations of the Harness. It takes bytes that already have transport protection, reads them as public contract messages, recognizes the login, hands the request to the public entries of identity and Session, and answers with a public contract response. An application assembly uses it to expose a Harness Server on a loopback address.

Message and `outcome` meanings stay in the [public contract](../public-contract/SPEC.md). Paths, methods, status codes, request body limits, and SSE framing stay in its [HTTP binding page](../public-contract/docs/http-binding.md). [SPEC.md](SPEC.md) owns the behavior of this package, and [internal design](docs/internals.md) covers the implementation.

## Responsibility and status

This package owns the entry duties of both locations: the HTTP listener, request reading and counting, dispatch by path, login recognition, the acting tenant check, Session calls, status code mapping, SSE observation writes, and the ordered stop. It owns no business behavior and holds no login table. Business meaning and authoritative facts stay with their capabilities.

Implemented:

- `createServerEntry({ config, dependencies })`, which returns `start()` and `stop()`.
- The `register-and-activate` and `issue-login` operations of the governance location. A succeeded `issue-login` carries the `loginId` of the new login.
- The eighteen governed operations of the governance location: organizations, member invitations, memberships, the current tenant, and the logins of an account. They go to identity's governance port.
- The four setting operations of the governance location: list the settings of the acting tenant, and set, describe or clear one secret setting item. They go to the `settings` port. Without the port they answer `stage-not-provided`. No response or diagnostic carries the secret.
- The report of a successful business access, and the end of an observation when its login is no longer valid.
- The eight session operations and the two observation operations of the session location. An observation stream carries the confirmation, heartbeats, and the `ended` frame only.
- The session diagnostics projection behind `read-session-diagnostics`: the Run timeline from Session, the finish cause from Agent, the dispatch diagnostics from Model and the call state and account from Tool, with a gap for every read a source did not serve (SPEC「会话诊断投影」).
- The deterministic derivation of the session operation identity `SessionOperationId`.

Not implemented at this stage:

- The fourteen governance operations this deployment declares not provided answer `stage-not-provided`: `public-health`, `replace-credential`, `query-organization`, the eight affiliation operations, `judge-admission`, and the two authorization expression operations.
- The `state`, `refreshing`, `snapshot`, `delta`, and `gap` observation frames. Reattachment and refresh wait for the joint work.
- TLS, remote access, and the sticky routing of a multi-instance deployment.

## Usage

The public entry is one constructor:

```ts
import { createServerEntry } from '@omne-harness/server-entry'

const entry = createServerEntry({
  config: {
    listenAddress: '127.0.0.1',
    listenPort: 0,
    maxBodyBytes: { small: 16384, input: 1048576 },
    heartbeatIntervalMs: 15000,
    jsonBudgets: {
      maxDepth: 32,
      maxItems: 65536,
      maxMembers: 1024,
      maxStringLength: 1048576,
      maxNumberLength: 64,
    },
    maxPageBytes: 1048576,
    historyKinds: ['message.user', 'message.assistant'],
    observation: { perLogin: 4, perInstance: 1000, cancelRetentionMs: 60000 },
  },
  dependencies: { identity, governance, issuer, session, resolveDefinition, diagnostics },
})
const { address, port } = await entry.start()
await entry.stop()
```

The numbers above are an example. Every value comes from the assembly configuration, and the package writes no initial value of its own.

`start()` listens on `127.0.0.1` only and speaks plain HTTP/1.1. When `listenAddress` is any other address, `start()` refuses with `ServerEntryConfigError` and does not rewrite the address. A `listenPort` of 0 asks the host for a free port, and the returned value carries the actual port. `stop()` stops accepting new connections, sends `ended(unavailable)` to each active observation, waits for in-flight requests to finish their answers, and then closes every connection.

The two locations have fixed paths: `/governance-public/1` and `/session-public/1`.

### Dependencies

| Dependency | Type | How this package uses it |
| --- | --- | --- |
| `identity` | identity's `IdentityOperations` | Registration and login issuance in the governance location. Login recognition in both locations and at each observation round |
| `governance` | identity's `IdentityGovernance` | The eighteen governed operations, and the report of a successful business access. It must work over the same records as `identity`, so a revocation or a switch is what login recognition reads. An assembly that reads the provider per call answers `basis-unavailable` from the port while the provider is absent |
| `issuer` | identity's `PrincipalIssuer` | Issues the system principal of this package (`component` is `server-entry`), and the acting principal of each session request |
| `session` | `SessionIngressFaces`, the Session faces this package declares | The eight session operations and the read eligibility check when an observation opens. A real `SessionService` satisfies it structurally |
| `settings` | `SettingsGovernance`, the port this package declares, optional | The four setting operations. The entry gives it the acting principal of the login and the acting tenant. Without it the four operations answer `stage-not-provided`. A rejected `set` or `clear` answers `unknown`; a rejected `list` or `describe` answers `basis-unavailable` |
| `agentJournal` | `AgentFinishReader`, the `readFinish` of Agent's Journal reading, optional | The finish cause of a failed or cancelled Run in `read-session-diagnostics`. Without the port, or without `readFinish` on it, the cause is `unknown` with reason `unsupported` |
| `modelCalls` | `ModelCallInspector`, the `inspect` and `dispatches` of Model's calls, optional | Resolves the Model references of `call.bound` in `read-session-diagnostics`, and reads the dispatch records that carry the account of each dispatch. Without it every Model call is `unknown` with reason `unsupported` |
| `modelDiagnostics` | `ModelAttemptReader`, Model's `ModelDiagnostics`, optional | The dispatch diagnostics of a resolved Model call. Without it `dispatches` stay empty with a gap |
| `toolQueries` | `ToolCallReader`, the `lookup`, `account` and `readDiagnostics` of Tool's invocation queries, optional | The state, the account and the first diagnostics page of the Tool references of `call.bound`. Without it every Tool call is `unknown` with reason `unsupported` |
| `resolveDefinition` | `DefinitionResolver` | `create-session` resolves a definition name into the fields the creation adopts. A returned `undefined` answers `invalid` |
| `diagnostics` | `DiagnosticSink`, optional | Structured diagnostic events. An event holds no body, login proof, credential, principal, or dependency error text |

## Contracts

[SPEC.md](SPEC.md) owns the entry behavior: the location and operation scope, the decision order, the operation identity derivation, the status code mapping, the observation open and cancel, and the result of each call. The public types are the exports of `src/index.ts`.

The stable promises are:

- The entry listens on `127.0.0.1` only and speaks plain HTTP/1.1. A wrong address fails the start and the entry does not rewrite it.
- A status code comes from the `outcome` only. The same `outcome` always gets the same status code and the same response body shape.
- A `denied` in either location does not reveal its reason. Every `denied` reason gives a byte-identical response except for `messageId`. A `not-visible` is the same for an object that does not exist and one that belongs to another account.
- No login proof, credential, or issuer enters any output. No diagnostic holds a login identifier or a `loginId`. The entry does not rewrite the `denied` and `basis-unavailable` results of identity and Session.
- A declared not-provided operation answers `stage-not-provided` before any login recognition.
- Only a `succeeded` session operation and an established observation report a business access. A failed report does not change the answer.
- A `stop-call` on a `tool` target answers `unsupported`, whatever the session state and whether the `controlId` was used, and it writes no record.
- An observation record lives in the memory of this instance only.

Implementation details are free to change: the module layout, the diagnostic code set, and how the SSE writer queues frames.

## Design

The entry reads bytes into public messages, then hands the requests that pass the protocol checks to the public entries of identity, its governance port, and the faces of Session. It holds no login table and puts no storage object into a response.

Each location handler returns one of three answers to the HTTP layer: `json`, `no-answer`, or an observation stream. The status code of `json` comes from the `outcome` only. `no-answer` means this package has no trustworthy reply; the HTTP layer writes an empty-body 500 and closes the connection, and only a failure of this package uses it. The `outcome` to status code table is exhaustive, so a new `outcome` the public contract can encode fails the type check when the table has no row for it.

A session operation identity derives deterministically from the login text, the tenant text, and the request identifiers. The same business intent gets the same identity across a crash.

The public contract does not depend on this package, and neither does the SDK. The package declares the ports it needs from its neighbors and knows nothing about their implementations.

## Configuration and operation

| Field | Meaning |
| --- | --- |
| `listenAddress`, `listenPort` | The address must be `127.0.0.1`. A port of 0 asks the host to assign one |
| `maxBodyBytes.small`, `maxBodyBytes.input` | The body limits of the governance and session paths. Each limit is also the `maxBytes` of that path's json-text read |
| `heartbeatIntervalMs` | The SSE heartbeat interval. At this stage it is also the length of one observation round, after which the entry checks the login of the observation again |
| `jsonBudgets` | The other five json-text read budgets |
| `maxPageBytes` | The upper bound of `pageBytes` in `read-history` and `read-session-diagnostics` |
| `historyKinds` | The entry kinds `read-history` discloses |
| `diagnosticsKinds`, `maxRuns`, `maxCallsPerRun` | The session diagnostics projection: the entry kinds it reads from Session, the most Runs of one page, and the most calls of one Run that enter the fan-out. The three are given together or left out together; without them `read-session-diagnostics` answers `basis-unavailable` |
| `observation.perLogin`, `observation.perInstance`, `observation.cancelRetentionMs` | The observation concurrency bounds per login and per instance, and the retention of an ended record |

Node 24 or later is required. The package reads no environment variable and no real secret. The caller completes transport protection: the entry accepts bytes that already have it, and a transport protection failure is `unknown` to the caller.

Known limits:

- Plain text on the loopback address only. TLS and remote access are out of scope at this stage.
- An observation sends no `state`, `refreshing`, `snapshot`, `delta`, or `gap` frame. Reattachment and refresh wait for the joint work.
- The report of a successful business access is not defined, and a session operation does not refresh the idle timer of a login.
- `startRun` does not check again whether the login is still valid.
- An observation record lives in the memory of this instance, and the sticky routing of a multi-instance deployment belongs to the deployment.
- A `stop-call` on a `tool` target reaches `stopCall` of Session first, and the entry then fixes the outward answer as `unsupported`. The "no record" promise is Session's contract; the entry only guards the outward answer, and it cannot stop a Session that writes outside its contract.
- The input source that `send-input` gives to Session carries login state text. If a real Session writes the source into the `payload` of a history entry, `read-history` passes it through. Whether the source enters the payload, and whether the login state text is secret, belong to Session and identity, and this package does not decide for them.
- The cursor of `read-session-diagnostics` is sealed with a key that lives as long as the entry instance. A cursor of another instance, or of an instance that restarted, answers `invalid`, and the caller starts the read again.
- `read-session-diagnostics` reports no time of a Run start and no usage of a Model call: Session's payloads carry no time, and Model's diagnostics carry no account. Both stay `unknown` until their owners add the field (RFC-0013 DA7 and「实质备选」).

## Verification

Run in this directory:

```sh
pnpm run build
pnpm run typecheck
NO_COLOR=1 pnpm exec vitest run
```

The cases call this package over real loopback HTTP. They use the `./testing` reference doubles of identity, an in-process principal authority, and Session face doubles from the test directory. The case list is in [internal design](docs/internals.md#验证与维护). A passing double run does not prove a real Session, durable identity, or cross-process principal origin.

## Maintenance

Change [SPEC.md](SPEC.md) first, then the code and the cases. When the public contract adds or changes a term, check the status code table in `src/status.ts` and the result mapping in `src/session.ts` first, and the type check will name the missing row. When a Session face or a public identity type changes, check the subset used by `src/faces.ts` and `src/identity-steps.ts`.

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
