# @omne-harness-lite/cordis-plugin-tree

[中文](README_ZH.md)

A two-layer plugin tree with stable row identifiers, serializable configuration and redacted source descriptions. Its Cordis entry prepares and loads the composed tree.

Public shapes live in [src/index.ts](src/index.ts). Behavior and integration commitments belong to [SPEC.md](SPEC.md).

## Workspace use

This is an experimental, private ESM workspace package, not an npm release. Follow the [development setup](../../../docs/development.md). Declare `"@omne-harness-lite/cordis-plugin-tree": "workspace:*"` in the consuming member. Declare every other imported workspace package as a direct dependency too. Use public exports rather than sibling `src/` paths.

## Public API

| Export                                                                                          | Purpose                                                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `PluginRow`, `OperatorEdit`, `composePluginTree`                                                | Compose distribution rows with replace, disable and insert edits |
| `describePluginTree`, `PluginTreeDescription`                                                   | Describe every row with configuration redacted                   |
| `AssemblyDeclaration`, `AssemblyClaim`, `PreparedPluginTree`, `PluginTreeHandle`                | Preparation, dependency and lifetime shapes                      |
| `PluginTreeError`, `PluginTreePreparationError`, `PluginTreeUsageError`, `PluginTreeStartError` | Classified errors with safe codes                                |
| `./cordis`: `preparePluginTree`, `loadPluginTree`, `inspectPluginTree`                          | Resolve exports, load fibers and inspect the actual assembly     |

## Example

```ts
import assert from 'node:assert/strict'
import { composePluginTree, describePluginTree } from '@omne-harness-lite/cordis-plugin-tree'

const rows = composePluginTree(
  [
    {
      id: 'clock',
      plugin: { package: '@omne-harness-lite/clock-lease', export: 'managedClockPlugin' },
      config: {},
    },
  ],
  [{ op: 'replace', id: 'clock', config: {} }],
)
const [description] = describePluginTree(rows)
assert.equal(description?.source, 'operator')
assert.equal(description?.config, '[redacted]')
```

Composition does not resolve the example plugin or start resources. The resolver selects named exports from public `/cordis` entries during preparation.

## Boundaries and lifecycle

Replacement replaces the whole configuration. Disable retains the row identifier and position. Insert requires an enabled target. Missing targets, duplicate identifiers and invalid configurations fail.

Configuration accepts finite JSON data, not runtime objects, callbacks, accessors or cycles. Source descriptions never expose configuration values, keys, lengths or hashes.

Preparation validates enabled exports, schemas, assembly declarations and dependency order before application. It does not sandbox deployment code. Load one genuine prepared tree into one pristine lifetime.

Readiness requires owned work and actual fiber/service readiness. A readiness failure does not imply completed close. Keep external services alive until the close report permits release. See [SPEC.md](SPEC.md).

## Development

```sh
pnpm --filter @omne-harness-lite/cordis-plugin-tree run build
pnpm --filter @omne-harness-lite/cordis-plugin-tree run typecheck
pnpm --filter @omne-harness-lite/cordis-plugin-tree run test
```

Build workspace dependencies first. These commands cover this package. Actual provider/consumer behavior also requires integration verification.

## Related packages

- [Assembly completion owner](../assembly-lifecycle/README.md)
- [Real tenancy host](../../../apps/tenancy-host/README.md)

## Current support and architecture gap

The current loader prepares a fixed in-process tree from named /cordis exports of installed npm packages. It has no runtime configuration update or Session plugin takeover entry. Updates currently require restart and recalculation. This is a support gap, not a system requirement to restart.

A fixed row or port leaving ACTIVE, loss or replacement of a statically declared required or optional provider, or a change in optional dependency ownership currently stops the generation. Removing a dynamic contribution without removing a static service does not trigger that stop. If unrelated work shares the generation, this policy exceeds the [actual dependency scope](../../../docs/architecture/deployment/cordis-and-lifecycle.md#依赖换代与就绪). Loader, shutdown mechanism, and assembly owners must address local replacement and continuity. Existing mechanism tests do not prove target conformance.
