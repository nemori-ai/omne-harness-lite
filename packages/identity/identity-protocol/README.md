# @omne-harness/identity-protocol

[中文](README_ZH.md)

The protocol contract of the public protocol `identity/v1`: the 33 identity operations that a client can call, with the body of each operation, its possible outcomes and the body of each outcome. It is pure data. The access plugin on the server and the client core use the same value. The design source is section 7 of [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md).

## Responsibility and status

This package owns the `identity/v1` contract: the operation list, and for each operation the identity requirement, the effect, the body size limit, the body and the outcomes. The business meaning of the operations belongs to the [identity specification](../identity/SPEC.md).

Implemented: the contract with 33 operations and no observation. The rule text is a copy from the shared contract member. The old family `governance-public/1` in the shared contract is still in use; the access plugin run removes it. There is no consumer yet: the access plugin `identity-access` and the client do not exist.

## Usage

```ts
import { identityProtocol } from '@omne-harness/identity-protocol'

const { body } = identityProtocol.operations['issue-login']
const read = body.read(jsonValue, limits) // { ok: true, value: { loginIdentifier, credential } } or { ok: false }
```

An access plugin gives `identityProtocol` to `defineAccessPlugin` and writes one handler for each operation. A client gives it to `createClient` and gets one method for each operation. This package does not depend on Cordis. It needs no initialization and no disposal.

## Contracts

- The operation list, the three columns, the outcomes and the three differences from the old family: see [SPEC.md](SPEC.md).
- The index of the public definitions: [docs/public-api.md](docs/public-api.md).

## Design

`src/rules.ts` holds the rule text of each operation (body, success body, `no-change` body, `need-decision` body). `src/identity-protocol.ts` writes them into the contract with `defineProtocol`.

## Configuration and operation

This package has no configuration. The body size limit is named `small`; its number is deployment configuration.

## Verification

In the member directory, run `pnpm exec vitest run --mode fast` (full table, shapes, read equivalence, outcome sets) and `--mode slow` (browser fixture). [SPEC.md](SPEC.md#组合与验证) lists the obligations that each test covers.

## Maintenance

Read the [shared contract specification](../../access/public-contract/SPEC.md#共同契约) before you change the contract. The member is a contract member in [`docs/engineering/delivery-lines.json`](../../../docs/engineering/delivery-lines.json). When the public surface changes, rewrite the snapshot under `api/` with `pnpm run contract:api --write`.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
src/                      The contract and the rule text
tests/                    Continuous tests; fixtures/browser holds the browser fixture
```

The other template directories (`schema/`, `verification/`, `adr/`, `examples/`, `resources/`, `acceptance/`) have no content now.
