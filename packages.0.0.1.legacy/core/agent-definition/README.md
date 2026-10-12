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
select `#/$defs/AgentDefinitionBody` or `#/$defs/AssetReference` explicitly. Its fixed reference
graph loads the byte-exact `@omne-harness-lite/model-profile/schema/v3` resource for AD1's
MP3 `RouteName`; the current MP5 Schema does not substitute for that resource. The two functions
also check capability and item uniqueness, which schema shape alone cannot establish.

The [behavior specification](SPEC.md) states the adopted scope and verification duties. These functions do not read assets or authorize use.

## Development

This is an experimental, unpublished ESM workspace member.

```sh
pnpm --filter @omne-harness-lite/agent-definition... run build
pnpm --filter @omne-harness-lite/agent-definition run typecheck
pnpm --filter @omne-harness-lite/agent-definition run test
```
