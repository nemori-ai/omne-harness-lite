# @omne-harness/assets-access

[中文](README_ZH.md)

The access plugin of `assets/v1`: the handlers of the four setting operations. Each handler turns the login and the target tenant of the body into a principal, takes the tenant settings face of the moment, hands the body over, and maps the face's result to the outcome of the same name. The design source is [RFC-0015](../../../docs/rfcs/RFC-0015-access-dynamic-registration.md#9-设置) §5, §7 and §9.

## Responsibility and status

This package owns the handlers and the mapping from the results of the settings face to the outcomes of `assets/v1`. The business rules (who may read or write, revisions, locks, the bound of a permission) belong to the settings face. The principal belongs to identity. The protocol shapes belong to `@omne-harness/assets-protocol`.

Implemented: the contribution `createAssetsContribution`, the ports it asks for, and the Cordis plugin `createAssetsAccessPlugin`. Consumer: the `assets-access` row of `apps/harness-server`. Secret items are not part of this run: the face answers them as unreadable and not writable, and the plugin passes that on. Status: candidate.

## Usage

```ts
import { createAssetsAccessPlugin } from '@omne-harness/assets-access/cordis'

const plugin = createAssetsAccessPlugin({
  principals: ctx => targetTenantPrincipals(ctx),
  settings: ctx => ctx.get('tenantSettings'),
})
```

The assembly loads the plugin under a scope that injects `accessRegistry`. Loading it opens `assets/v1`; unloading it takes the protocol down. The root entry gives the contribution without Cordis, for tests and other hosts.

## Contracts

[SPEC.md](SPEC.md) gives the order of the steps, the mapping table of every result of the face, and the totalized table of the steps. The ports are in [src/ports.ts](src/ports.ts). [docs/public-api.md](docs/public-api.md) indexes them.

## Design

The plugin declares its two ports in its own words and imports no domain implementation. The settings port has the shape of the tenant settings face, so the assembly hands the face over as it is. Each port is taken at the call; a port that is absent answers `basis-unavailable` and the protocol stays mounted.

## Configuration and operation

There is no configuration. The assembly gives two functions: one that builds the principal port over the plugin's context, and one that takes the settings face from the tree at each call.

## Verification

`pnpm exec vitest run --mode fast` runs the handlers against a double of the face and a stand-in of the principal port, and writes every success through the contract's codec. The tests import `@omne-harness/assets-protocol` through `dist`. The end-to-end case (a real login sets an item and reads it back) is the row test of `apps/harness-server`. [SPEC.md](SPEC.md#组合与验证) maps each test to its clause.

## Maintenance

When the face adds a result or a field, change the port, the mapping, the SPEC table, and `tests/operations.spec.ts` together with the protocol contract.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
src/                      Ports, contribution, and the Cordis binding
tests/                    Continuous tests; fixtures/world.ts is the double of the face
schema/, verification/, adr/, examples/, resources/, acceptance/   Template directories, empty for now
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
