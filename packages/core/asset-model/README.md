# @omne-harness-lite/asset-model

[中文](README_ZH.md)

Pure asset values and validation for exchanging capability identities, definitions, holdings, assignments and workspace manifests. Body-specific rules are supplied explicitly, so callers can use the asset model independently of a runtime or storage system.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

| Public API                                                             | Use                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `createAssetModelJudge(bodyContracts)`                                 | Build schema and ordered representation judgments    |
| `attributeDeclarationsOf`, `referencesOf`                              | Project body declarations and composition references |
| `capabilityCanonicalString`, `parseCapabilityCanonicalString`          | Exchange capability identifiers                      |
| `normalizeWorkspaceDirectory`, `carrierRecordId`, `contentFingerprint` | Identify workspaces and track content                |
| `parseWorkspaceManifestText`                                           | Strictly parse and judge manifest JSON               |

## Identify a workspace asset

Tenant identity is explicit. Equivalent lexical paths produce the same carrier identity.

```ts
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import {
  capabilityCanonicalString,
  parseCapabilityCanonicalString,
  normalizeWorkspaceDirectory,
  carrierRecordId,
  contentFingerprint,
} from '@omne-harness-lite/asset-model'

const tenant = unwrap(parseTenantId({ organization: 'org_acme', account: 'acc_alice' }))
const capability = { category: 'tool', name: 'repo:inspect' } as const
const workspace = { tenant, directory: normalizeWorkspaceDirectory('/work/repo/./') }
console.log(capabilityCanonicalString(capability)) // tool/repo:inspect
console.log(parseCapabilityCanonicalString('tool/repo:inspect'))
// { ok: { category: 'tool', name: 'repo:inspect' } }
console.log(carrierRecordId(workspace, capability).startsWith('wsc1.')) // true
console.log(contentFingerprint({ a: 1, b: 2 }) === contentFingerprint({ b: 2, a: 1 })) // true
```

## Validate a body and a manifest

Use the five actual body providers. Body projections add the reserved `disabled` and `usableBy` declarations. Manifest text parsing rejects duplicate JSON keys.

```ts
import {
  createAssetModelJudge,
  attributeDeclarationsOf,
  referencesOf,
  parseWorkspaceManifestText,
  type AssetContent,
  type NonConnectorBodyContracts,
} from '@omne-harness-lite/asset-model'
import { toolBodyContract } from '@omne-harness-lite/tool-definition'
import { loopExtensionBodyContract } from '@omne-harness-lite/loop-extension'
import { skillBodyContract } from '@omne-harness-lite/skill-package/v2'
import { mcpBodyContract } from '@omne-harness-lite/mcp-endpoint'
import { slashCommandBodyContract } from '@omne-harness-lite/slash-command'

const bodies: NonConnectorBodyContracts = {
  tool: toolBodyContract,
  loop_extension: loopExtensionBodyContract,
  skill: skillBodyContract,
  mcp: mcpBodyContract,
  slash_command: slashCommandBodyContract,
}
const content = {
  category: 'tool',
  definition: {
    name: 'repo:inspect',
    description: 'Inspect a repository',
    paradigm: 'single',
    origin: { kind: 'authored' },
    input: { type: 'object', properties: {} },
    permissions: { execute: { default: 'ask' } },
    composes: { skills: ['review'] },
  },
} satisfies AssetContent
const judge = createAssetModelJudge(bodies)
console.log(judge.judgeAssetValue('AssetContent', content)) // { ok: true }
const declarations = attributeDeclarationsOf(content, bodies)
if ('underivable' in declarations) throw new Error('Tool declarations required')
console.log(declarations.declarations.map(item => item.item))
// ['execute', 'disabled', 'usableBy']
console.log(referencesOf(content, bodies))
// { references: [{ category: 'skill', name: 'review' }] }
console.log(
  parseWorkspaceManifestText('{"format":1,"assets":[],"assignments":[],"disabled":[]}', bodies),
) // { ok: { format: 1, assets: [], assignments: [], disabled: [] } }
console.log(
  parseWorkspaceManifestText(
    '{"format":1,"format":1,"assets":[],"assignments":[],"disabled":[]}',
    bodies,
  ),
) // { rejected: 'malformed' }
```

## Failures and boundaries

Judgments return `{ ok: true }` or `{ rejected }`; nested body rejections retain their names. Schema-only `validate` does not replace `judgeAssetValue`. Invalid body-contract configuration or a provider that emits invalid, duplicate or reserved declarations throws `TypeError`.

The supplied five body contracts cover Tool, Loop Extension, Skill, MCP and Slash Command. The shared types still describe Connector, but this composition has no Connector provider: a body operation that needs it throws `BodyProviderUnavailableError`. Plugin declarations and Agent Definition declarations are `underivable`, not an empty declaration set. MCP derivation preserves whether its action snapshot was supplied, fetched or not fetched.

Directory normalization is lexical: it requires an absolute path and does not resolve symlinks or read the filesystem. `carrierRecordId` includes the tenant, directory and capability; it is an identifier, not a content hash. Use `contentFingerprint` when tracking body changes. The module does not persist assets, establish sharing or authorization, or enforce uniqueness and mutation rules across stored records.

Public JSON Schema entries are `@omne-harness-lite/asset-model/schema` (v3) and `/schema/v2` (retained v2). See [source exports](src/index.ts), [tests](tests/) and [asset evaluation](../asset-evaluation/README.md).
