# @omne-harness-lite/asset-evaluation

[中文](README_ZH.md)

Compute effective assets, composition and attribute values from explicit holdings across factory, organization, tenant, workspace and session layers. The package also turns a parsed workspace manifest into carrier holdings with a record of ignored entries.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

| Public API                   | Use                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `evaluate`                   | Validate inputs, filter/select assets, expand composition and resolve values |
| `createAssetEvaluator`       | Share caller-owned compilation across evaluation and tool consumers          |
| `readWorkspaceCarrier`       | Convert a complete manifest value into workspace holdings                    |
| `defaultBodyContracts`       | Reuse the five available body providers                                      |
| `evaluationInputFingerprint` | Fingerprint the full evaluation input                                        |
| Permission helpers           | Classify assignments and calculate bounds                                    |

Root entry `.` adopts v4. `selectEvaluationRootSource` selects the actual immutable root source; `judgeEffectiveAssembly` reads a represented result without repairing its fields. The default loop-extension body port uses the current declaration behavior with the exact LC3 Schema resource that asset-model v3 references. It accepts the seven declaration definitions used by that model; other definitions fail as invalid port configuration.

## Evaluate a complete input

This example includes the root definition and every held definition. A missing reference is reported in `unresolved`.

```ts
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { toOpaqueJson } from '@omne-harness-lite/content-blocks'
import { type AssetHolding } from '@omne-harness-lite/asset-model'
import { evaluate, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'

const tenant = unwrap(parseTenantId({ organization: 'org_acme', account: 'acc_alice' }))
const at = '2026-09-26T10:00:00Z'
const root = { category: 'agent_definition', name: 'assistant' } as const
const tool = { category: 'tool', name: 'inspect' } as const
function factory(capability: AssetHolding['capability'], asset: string): AssetHolding {
  return {
    holder: { layer: 'factory' },
    capability,
    asset,
    basis: { kind: 'official' },
    versionSelection: { kind: 'current' },
    immutable: false,
    assignments: [],
    since: at,
  }
}
const rootReferences = [
  { capability: tool, resident: true },
  { capability: { category: 'skill', name: 'missing-review' } as const },
] as const
const input: NonConnectorEvaluationInput = {
  tenant,
  standing: { standing: 'effective', role: 'member' },
  root: {
    definition: root,
    references: rootReferences,
    attributes: [],
    source: { asset: 'asset_root', version: 1 },
  },
  holdings: [factory(root, 'asset_root'), factory(tool, 'asset_inspect')],
  definitions: [
    {
      id: 'asset_root',
      capability: root,
      origin: 'official',
      versions: [
        {
          number: 1,
          publishedAt: at,
          content: {
            category: 'agent_definition',
            body: toOpaqueJson({ references: rootReferences, attributes: [] }),
          },
        },
      ],
    },
    {
      id: 'asset_inspect',
      capability: tool,
      origin: 'official',
      versions: [
        {
          number: 1,
          publishedAt: at,
          content: {
            category: 'tool',
            definition: {
              name: 'inspect',
              description: 'Inspect files',
              paradigm: 'single',
              origin: { kind: 'authored' },
              input: { type: 'object', properties: {} },
              permissions: { execute: { default: 'ask' } },
            },
          },
        },
      ],
    },
  ],
}
const result = evaluate(input)
if (!('ok' in result)) throw new Error(JSON.stringify(result))
console.log(result.ok.assets.map(asset => asset.capability.name)) // ['assistant', 'inspect']
console.log(result.ok.unresolved.map(entry => entry.capability.name)) // ['missing-review']
console.log(result.ok.values.find(value => value.item === 'execute')?.value) // { allowed: ['ask'] }
```

## Read carrier holdings with diagnostics

The manifest has all three required lists. The reader ignores an immutable flag and records an assignment to an unknown asset.

```ts
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { type WorkspaceCarrierManifest } from '@omne-harness-lite/asset-model'
import { readWorkspaceCarrier } from '@omne-harness-lite/asset-evaluation'

const tenant = unwrap(parseTenantId({ organization: 'org_acme', account: 'acc_alice' }))
const capability = { category: 'tool', name: 'inspect' } as const
const manifest: WorkspaceCarrierManifest = {
  format: 1,
  assets: [{ capability, source: 'tools/inspect.json' }],
  assignments: [
    { capability, item: 'timeout', value: 'PT10S', immutable: true },
    { capability: { category: 'skill', name: 'missing' }, item: 'variant', value: 'brief' },
  ],
  disabled: [capability],
}
const result = readWorkspaceCarrier(manifest, { tenant, directory: '/work/repo' })
if ('invalidInput' in result) throw new Error(JSON.stringify(result.invalidInput))
console.log(result.ok.holdings[0]?.assignments.map(entry => entry.item)) // ['timeout', 'disabled']
console.log(result.ok.dropped.map(entry => entry.reason)) // ['immutable_flag', 'unknown_asset']
```

## Failures and boundaries

`evaluate` returns one of `{ ok }`, `{ invalidInput }`, `{ compositionCycle }` or `{ categoryUnsupported }`. Input diagnostics precede evaluation. An `ok` result can contain `filteredOut` and `unresolved`; a consumer must not dispatch an assembly with unresolved references. Reachable Plugin bodies and non-root Agent Definition bodies currently produce `categoryUnsupported` rather than assumed empty composition.

The implemented input domain is `NonConnectorEvaluationInput`. `defaultBodyContracts` contains the five real Tool, Loop Extension, Skill, MCP and Slash Command providers. Connector asset records, drafts or version bodies are outside that domain and throw `BodyProviderUnavailableError`. Connector identifiers and references are not recursively forbidden, and `readWorkspaceCarrier` accepts the full manifest domain.

Both operations are pure calculations over explicit input. The caller supplies a consistent, authorized snapshot and verifies workspace ownership and provenance. No files, clocks, stores, models or tools are accessed. The reader does not load `source` bodies; it returns holdings without `since`, which the caller supplies from the actual read event. Permission classification, bound intersection and pick checks are also exported as `classifyPermissionAssignment`, `boundOf` and `pickWithinBound`; they calculate values without granting execution authority.

See [source exports](src/index.ts), [tests](tests/) and [asset model](../asset-model/README.md).

Behavior belongs to [SPEC](SPEC.md). Check methods and limits belong to [verification](verification/README.md).
