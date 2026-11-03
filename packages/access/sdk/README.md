# @omne-harness/sdk

[中文](README_ZH.md)

The client entry for the governance and session protocols of the Harness. It holds a transport adapter supplied by the caller, encodes a request into public contract bytes, sends it, and returns only the response that belongs to that call. Use it to reach a Harness Server from a client app or a command line tool without writing your own codecs.

## Responsibility and status

This package owns the governance client, the session client, and a `fetch` based HTTP transport adapter. It does not interpret an `outcome`, invent a refusal reason, or keep a login table.

Implemented:

- `createGovernanceClient` and `createSessionClient`. `submit` encodes the request, sends it, reads the response, and returns only the one with the same `messageId`.
- `createHttpTransport`, a `fetch` based adapter bound to one location and one `http:` origin on `127.0.0.1` or `localhost`.
- `parseTenantText`, `tenantText`, and `userTextMessage`.
- Automatic resend, once, only when the transport proves that no request byte was sent.

Not implemented:

- The two observation operations and an observation client. The session codec functions of the public contract do not read or write observation messages, so the SDK sends no observation operation until the public contract provides functions for them.

Message fields and `outcome` meanings stay in the [public contract](../public-contract/SPEC.md). Paths, methods, status codes, and the rules shared by both ends stay in its [HTTP binding page](../public-contract/docs/http-binding.md). [SPEC.md](SPEC.md) owns the behavior of this package, and [internal design](docs/internals.md) covers the implementation.

## Usage

The SDK hands a request to a transport adapter. The adapter can be the caller's own or `createHttpTransport`. Before registration and login issuance, the caller must have chosen the trust material of the peer. When the trust check fails, the SDK sends neither a credential nor a login proof.

```ts
import {
  createHttpTransport,
  createSessionClient,
  parseTenantText,
  userTextMessage,
} from '@omne-harness/sdk'

const transport = createHttpTransport({ origin: 'http://127.0.0.1:8787', location: 'session' })
const client = createSessionClient({ transport })
const tenant = parseTenantText(tenantText) // from the issue-login response
if (tenant === undefined) throw new Error('not a tenant text')

const result = await client.submit({
  protocolVersion: 'session-public/1',
  messageId: crypto.randomUUID(),
  operation: 'send-input',
  proof: { kind: 'present', value: loginProof },
  body: {
    tenant,
    session,
    acceptId,
    inputId,
    message: userTextMessage('hello', inputId),
  },
})
// result.kind === 'response': result.message.outcome is a public contract outcome, and body is the response body.
// result.kind === 'uncertain': there is no trustworthy reply. The request bytes may already have left.
```

The exports are:

| Export | Purpose |
| --- | --- |
| `createSessionClient`, `createGovernanceClient` | A client built from one transport adapter. `submit` encodes, sends, reads the response, and returns only the one with the same `messageId`. |
| `createHttpTransport` | A `fetch` based adapter bound to one location and one `http:` origin on `127.0.0.1` or `localhost`. |
| `RequestInvalidError` | The local request model breaks the public contract. No byte was sent. |
| `parseTenantText`, `tenantText` | Convert between tenant text and tenant identity. The public contract exports no identity codec, so these two functions borrow its request codec. |
| `userTextMessage` | Build the user message for `send-input`. The message identity derives from `inputId`, so a retry with the same `inputId` and text sends the same content. |

The caller generates `createCallId`, `acceptId`, `inputId`, and `controlId` before the first send, and keeps them unchanged when it retries the same intent. The SDK never swaps them. A `messageId` correlates one send only, so the caller may generate a new one on each call.

## Contracts

The caller gets one of two results, expressed by `CallerResult`:

- `response` carries a response checked against the public contract. The caller reads its `outcome` with the meaning the public contract gives it.
- `uncertain` means the caller has no trustworthy reply. The request bytes may or may not have left. It is neither a business success nor a proof that nothing happened.

The stable promises are:

- A call receives only a response with the same `messageId`. A `protocol-rejected` without a `messageId` is not attributed to any call.
- The transport adapter accepts an `http:` origin on `127.0.0.1` or `localhost` only, and it does not follow redirects.
- When the adapter reports that the request bytes were not sent, the SDK resends once. When the bytes were sent, or the adapter cannot prove they were not, the SDK does not resend.
- The SDK caches no admission allow, login proof, or credential, and it offers no `prefer-copy`.
- The login proof travels in the message body. It never enters an HTTP header, a log, or error text.
- These calls do not refresh the idle timer of a login.

Implementation details are free to change: the module layout, the set of system error codes behind the resend decision, and the `fetch` options the adapter uses.

## Design

The SDK holds a transport adapter and the login proof the caller gives it. The adapter sees bytes, not messages. The client encodes the request through the public contract, then gives the response bytes to the public contract read function with this call's `messageId`. Only a `response` result is returned to the caller. An `unmatched` or `unreadable` result becomes `uncertain`.

The resend rule lives in one `deliver` function that both clients share. Failure classification leans one way: only a failure before the first request byte leaves reports `not-sent`, and every other failure reports `uncertain`. The cautious side is `uncertain`, because it blocks the resend.

`parseTenantText` and `tenantText` put the text into a probe request and hand it to the public contract codec functions, so the tenant read and write rules exist once, in the public contract.

This package does not depend on the server entry.

## Configuration and operation

The caller supplies the transport adapter and the login proof. The SDK reads no environment variable and has no clock, database, or network configuration of its own. `createHttpTransport` takes two options: `origin` and `location`.

When a call gets `unknown`, or no trustworthy reply, the SDK hands the result back. The caller decides whether to start another call, and a new call follows the repetition rule of its own operation.

Known limits:

- Loopback `http:` addresses only. TLS and remote addresses are out of scope at this stage.
- No observation client.
- `UND_ERR_CONNECT_TIMEOUT` is in the error table but no test covers a connect timeout.

The install closure holds the public contract only. It holds no server entry and no server storage types.

## Verification

The tests import the built `dist` through the package name, so run `pnpm run build` in this directory first, then `pnpm run test`. `pnpm run typecheck` checks the types.

- `tests/http-transport.spec.ts` checks address limits, paths, status codes and response bodies, redirects, a refused connection, a mid-response disconnect, and cancellation against a real HTTP server on `127.0.0.1`.
- `tests/session-client.spec.ts` covers the round trip of the seven session operations and one governance operation, the declared-unprovided answer (`stage-not-provided`) of governance operations, the optional `loginId` of an `issue-login` success, `messageId` correlation including crossed replies, one zero-byte resend, no resend after bytes were sent, and error text without the login proof.
- `tests/public-entry.spec.ts` checks the runtime export list.

Not covered:

- No round trip against the real server entry. The server entry is another member; run that round trip after it lands.
- No TLS, no non-loopback address, and no observation client.
- No connect-timeout test.
- No platform other than Windows has run the tests.

## Maintenance

To change a resend or cache rule, change [SPEC.md](SPEC.md) only, and confirm that no second outcome table was copied out of it. To change the failure classification of the transport adapter, change the matching real-server case in `tests/http-transport.spec.ts` at the same time. When the session codec exports of the public contract change, recheck the install closure.

This package does not depend on the server entry. The server entry and the SDK own the migration of their own consumers.

Keep [README_ZH.md](README_ZH.md) in step with this file. Both files state the same promises.
