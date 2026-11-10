# @omne-harness/public-contract

[中文](README_ZH.md)

Pure codecs for the `governance-public/1` and `session-public/1` protocols. They turn a request or response object into bytes and back, and they validate the whole document on the way in. A client and a server adapter that both use this package share one set of rules for messages, outcomes, and refusals, instead of each writing its own. The SDK and the server entry are its first consumers.

## Responsibility and status

This package implements 38 governance request operations, four of them for the setting items of the acting tenant, and eight session operations, including `cancel-run` and `stop-call` for session interruption and the read-only session diagnostics projection `read-session-diagnostics`. It recognizes four governance operations that this stage does not provide. [SPEC.md](SPEC.md) owns their behavior. [The public exports](src/index.ts) expose eight protocol functions, four for each protocol, and their input and result types. They also expose eight [identity text functions](SPEC.md#身份值的文本) that read and write tenant, organization, account, and login identities as text. [Governance messages](src/messages.ts) and [session messages](src/session-messages.ts) associate each operation with its permitted outcomes and bodies. [The public API navigation](docs/public-api.md) indexes every export.

The package does not authenticate a caller, authorize an action, perform a business operation, or select a transport protection protocol. The [HTTP binding page](docs/http-binding.md) fixes the HTTP and SSE carriage of both positions. Identity and authorization keep responsibility for authentication, authorization, and business operations. Session keeps the session business rules. SDK and server-entry remain separate consumers with their own delivery obligations.

## Usage

```ts
import { encodeGovernanceRequest, readGovernanceRequest } from '@omne-harness/public-contract'

const limits = {
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 4_096,
  maxMembers: 256,
  maxStringLength: 8_192,
  maxNumberLength: 128,
}
const encoded = encodeGovernanceRequest({
  request: {
    protocolVersion: 'governance-public/1',
    messageId: 'caller-generated',
    operation: 'public-health',
    body: {},
  },
  limits,
})
if (encoded.kind === 'encoded') {
  const received = readGovernanceRequest({ bytes: encoded.bytes, limits })
  // received.kind is request, protocol-rejected, or stage-not-provided.
}
```

The limits above are caller choices. The package supplies no defaults. Use `readGovernanceResponse` with the original operation and expected message ID. It validates the whole response before it matches the ID. Use `encodeGovernanceResponse` with that operation for business results. Its common-refusal overload accepts `protocol-rejected` or `stage-not-provided` without an operation. Every governance operation also permits `stage-not-provided` with an empty body, because a deployment can declare an operation it does not provide. The request reader does not know that declaration.

Required login proof becomes a local `ProofInput`. A missing proof and an empty proof remain distinct protocol states for the business owner to check. Identity fields use values minted by legal-identity. Time fields use utc-instant values. Tenant text preserves both the organization and the account. Parameter objects use json-text trees, including their original number lexemes.

## Contracts

[SPEC.md](SPEC.md#公开编解码入口与实现细化) defines validation order, closed fields, budgets, correlation, and diagnostics. [The session codec clauses](SPEC.md#会话编解码函数) apply the same rules to the session group and state which step-1 checks stay with the server adapter. The eight functions are synchronous and have no external effects. Invalid programming arguments throw a fixed `TypeError`. An invalid request or response model returns `invalid`. Diagnostics contain only a finite code, with no credential, proof, input path, or raw byte.

The stable promises are the exported functions, their input and result types, and the operation, outcome, and body shapes of both protocols. A change to any of them is a protocol change.

A decoded request proves protocol validity only. For a session request, this covers only the step-1 checks that this package owns: the `message` check stops at a JSON object whose `role` is `user`, and the server adapter completes the full message decoding. A decoded response proves its operation-specific shape and correlation only. Neither result proves a business authorization or a durable commit.

Implementation details are free to change: the internal module layout, the exact diagnostic codes beyond their documented set, and the parsing strategy.

## Design

[Internal design](docs/internals.md) describes the closed operation table, the wire conversion, and the duplicate-key correlation scan. Strict json-text parsing is the only source of business data. A duplicate failure can trigger a second, iterative scan that recovers only a unique root message ID. This scan validates the entire document and applies the same six budgets.

The runtime dependencies are json-text, legal-identity, utc-instant, and jsonc-parser. The package has no Cordis entry and no lifecycle resources. Published files contain `dist`; the `source` export condition is for workspace development. An independent consumer uses the `import` and `types` conditions.

## Configuration and operation

Node.js 24 or later is required. Every call supplies six positive safe-integer budgets. The package reads no environment variables, clock, database, or network. Object models must use own enumerable data properties. Getters and `toJSON` are not executed. A byte budget bounds accepted document bytes, not total process memory.

## Verification

From the repository root, run these commands in order:

```sh
pnpm --filter '@omne-harness/public-contract...' build
pnpm --filter @omne-harness/public-contract typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/public-contract test
```

The tests exercise the public exports. `protocol.spec.ts` covers common boundaries and the two-end demonstration. `correlation.spec.ts` covers strict suffix grammar, all six budgets, and deep inputs. `operations.spec.ts` and `responses.spec.ts` cover every operation, closed bodies, terminal states, lists, secret exclusions, the declared-unprovided answer, and the optional `loginId` of `issue-login`. `public-consumption.spec-d.ts` checks operation-associated types. `identity-text.spec.ts` covers the round trip and the invalid texts of each identity text function, the strict tenant text rule, and agreement with the message codecs. `model-credential.spec.ts` covers the three model credential operations: the envelope, the closed bodies, the result sets, and that no response carries the secret.

`session-protocol.spec.ts` covers, with accepted and rejected vectors, each step-1 rule that `readSessionRequest` owns. For `message`, this is the object and `role` check, not the full message decoding. It also covers the cross-version rejection in both positions. `session-responses.spec.ts` covers every outcome of every session operation, closed bodies, history pages, `unmatched`, `unreadable`, and the common refusal overload. `session-consumption.spec-d.ts` checks the session operation, body, and outcome types. `session-control-protocol.spec.ts`, `session-control-responses.spec.ts`, and `session-control-consumption.spec-d.ts` cover the `cancel-run` and `stop-call` requests, outcome sets, success bodies, and types, with one violated rule per case. The package does not map Session results to wire outcomes, and it does not derive operation identities. The server adapter owns both.

`fixtures/client.ts` and `fixtures/server.ts` consume the package name independently. Each fixture has one governance exchange and one session exchange. `install-closure.spec.ts` packs this package and its three workspace dependencies, installs them in a fresh directory, compiles both fixtures, and runs both exchanges with Node against `dist`. That test needs pnpm and access to its configured package registry or cache for jsonc-parser. It removes its temporary installation and records the closure in the task's temporary evidence directory. `fixtures/profile.mjs` observes bounded codec workloads through `dist`.

These are pure protocol and package-consumption checks. Real transport, login, authorization, storage, Session calls, and end-to-end governance and session journeys require their owners' validation.

## Maintenance

Keep messages, operation rules, codecs, and the SPEC synchronized. A protocol change needs both consumer fixtures, the type counterexamples, and the full operation matrices. Recheck the installation closure after a dependency change. SDK and server-entry own the migration of their runtime consumers.

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
