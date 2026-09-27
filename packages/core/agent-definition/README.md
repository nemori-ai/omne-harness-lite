# @omne-harness-lite/agent-definition

[中文](README_ZH.md)

Pure value judgment and lossless extraction for `data.agent-definition/v1`. Both functions
accept a lossless JSON body and return `malformed` for an invalid projection. Parse text with
`readJsonStrict` from `@omne-harness-lite/content-blocks` before invoking them.

```ts
import { extractAgentDefinitionInputs } from '@omne-harness-lite/agent-definition'

const result = extractAgentDefinitionInputs({ references: [], attributes: [] })
// { ok: { references: [], attributes: [] } }
```

`judgeAgentDefinitionBody` returns `{ ok: true }` or `{ rejected: 'malformed' }`.
`extractAgentDefinitionInputs` returns copied, frozen arrays in their original order. It does
not supply missing attributes or defaults. Keep the complete original body when persisting
it; the extraction result contains only the two slots.

The `./schema` export publishes the exact normative resource. Its root is unconstrained;
select `#/$defs/AgentDefinitionBody` or `#/$defs/AssetReference` explicitly. The two functions
also check capability and item uniqueness, which schema shape alone cannot establish.

The [adopted provider design](../../../.meta_harness/design/realization/packages/core/agent-definition/README.md)
tracks the contract and verification scope. These functions do not read assets or authorize use.

## Development

This is an experimental, unpublished ESM workspace member.

```sh
pnpm --filter @omne-harness-lite/agent-definition... run build
pnpm --filter @omne-harness-lite/agent-definition run typecheck
pnpm --filter @omne-harness-lite/agent-definition run test
```
