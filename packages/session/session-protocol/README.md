# @omne-harness/session-protocol

[中文](README_ZH.md)

The protocol contract of the public protocol `session/v1`: the seven operations and the one observation that Session opens to clients. The server access plugin and the client core use the same value. The server gets the handler types. The client gets one method for each operation. The design source is [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#7-协议怎样划分).

## Responsibility and status

This package owns the operation list of `session/v1`. For each operation it owns the identity requirement, the effect, the body limit, and the rules of the body and of each outcome body. For the observation `observe-session` it owns the opening body, the frames, and the end reasons. The business meaning of the operations belongs to the Session domain. The message envelope, the fixed outcomes, and the conversion of rule leaves belong to the public contract.

Implemented: the contract value `sessionProtocol` and its types. No real consumer exists yet. The access plugin `session-access`, the use by the client core, and the frame source of the session observation come in later runs. Status: candidate.

## Usage

```ts
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'

const { body } = sessionProtocol.operations['send-input']
const read = body.read(tree, limits) // { ok: true, value } or { ok: false }
```

An access plugin gives `sessionProtocol` to `AccessContribution<SessionProtocol>`. It writes one handler for each operation and one frame source for `observe-session`. A client gives it to `createClient`. The package has only the root entry. It has no setup or release duty and does not import Cordis.

## Contracts

[SPEC.md](SPEC.md) gives the three columns of the seven operations, the five differences from the old family `session-public/1`, the outcome bodies, and the frames of the observation. The exact types come from [src/session-protocol.ts](src/session-protocol.ts). [docs/public-api.md](docs/public-api.md) indexes them.

## Design

One file declares all rules and then assembles them with `defineProtocol`. The rules are `as const` literals. The types come from `RuleValue` of the public contract, so no type is written by hand. The rule texts are copies of `session-rules.ts` in the public contract. See [SPEC.md](SPEC.md#rule-texts).

## Configuration and operation

There is no configuration. A body limit is only a name (`small`, `input`). The number is deployment configuration.

## Verification

`pnpm exec vitest run --mode fast` runs the operation table, the type assertions, the read and write equivalence with the old family, and the observation frames. `--mode slow` also runs the browser fixture. [SPEC.md](SPEC.md#组合与验证) maps each test to its clause.

## Maintenance

When the shape of a Session operation changes, change the rule, the samples in `tests/wire.spec.ts`, and the assertions in `tests/shapes.spec-d.ts`. When the old family's rules leave the public contract, change those two tests to compare with samples of this package only. Add an operation in the same major version. A change to the shape of an existing operation needs a new major version.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Conventions beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
src/                      The contract value and its types
tests/                    Continuous tests; fixtures/browser is the browser fixture
schema/, verification/, adr/, examples/, resources/, acceptance/   Template directories, empty for now
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
