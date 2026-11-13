# @omne-harness/assets-protocol

[中文](README_ZH.md)

The protocol contract of the public protocol `assets/v1`: the four setting operations that Assets and Rules opens to clients (list, describe, set, clear). The server access plugin and the client core use the same value. The design source is [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#9-设置) §7 and §9.

## Responsibility and status

This package owns the operation list of `assets/v1`. For each operation it owns the identity requirement, the effect, the body limit, and the rules of the body and of each outcome body. The business meaning of the operations belongs to the tenant settings face of `@omne-harness/settings`. The message envelope, the fixed outcomes, and the conversion of rule leaves belong to the public contract.

Implemented: the contract value `assetsProtocol` and the types `SettingView` and `SettingInput`. Consumers: the access plugin `@omne-harness/assets-access` and the settings interface module. Status: candidate.

## Usage

```ts
import { assetsProtocol, type AssetsProtocol } from '@omne-harness/assets-protocol'

const { body } = assetsProtocol.operations['set-setting']
const read = body.read(tree, limits) // { ok: true, value } or { ok: false }
```

An access plugin gives `assetsProtocol` to `AccessContribution<AssetsProtocol>` and writes one handler for each operation. A client gives it to `createClient`. The package has only the root entry. It has no setup or release duty and does not import Cordis.

## Contracts

[SPEC.md](SPEC.md) gives the three columns of the four operations, the bodies, the outcome sets, and the item view. The exact types come from [src/assets-protocol.ts](src/assets-protocol.ts). [docs/public-api.md](docs/public-api.md) indexes them.

## Design

One file declares all rules and then assembles them with `defineProtocol`. The rules are `as const` literals. The types come from `RuleValue` of the public contract, so no type is written by hand. The shapes follow the tenant settings face field by field.

## Configuration and operation

There is no configuration. A body limit is only a name (`small`). The number is deployment configuration.

## Verification

`pnpm exec vitest run --mode fast` runs the operation table, the body and answer round trips, and the public entry. The tests import the package through `dist`: run `pnpm run build` after a change to `src`. [SPEC.md](SPEC.md#组合与验证) maps each test to its clause.

## Maintenance

When a field of the tenant settings face changes, change the rule, the access plugin's mapping, and `tests/operations.spec.ts`. Add an operation in the same major version. A change to the shape of an existing operation needs a new major version.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Conventions beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
src/                      The contract value and its types
tests/                    Continuous tests
schema/, verification/, adr/, examples/, resources/, acceptance/   Template directories, empty for now
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
