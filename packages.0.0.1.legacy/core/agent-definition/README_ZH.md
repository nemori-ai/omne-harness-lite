# @omne-harness-lite/agent-definition

[English](README.md)

为 `data.agent-definition/v1` 提供纯值判定及无损提取。本包是实验性、未发布的 ESM workspace 成员。函数接受无损 JSON 正文，非法投影返回 `malformed`；文本先用 content-blocks 的 `readJsonStrict` 解析。

| 公开接口 | 用途 |
| --- | --- |
| `judgeAgentDefinitionBody` | 判定正文、引用与属性声明的形状及唯一性 |
| `extractAgentDefinitionInputs` | 提取原序、已复制冻结的 `references` 与 `attributes` |
| `./schema` | 精确规范 Schema 资源；显式选择定义项 |
| `AgentDefinitionBody`、`AgentDefinitionInputs` | 正文与提取结果的公共类型 |

## 判定并提取

```ts
import { judgeAgentDefinitionBody, extractAgentDefinitionInputs } from '@omne-harness-lite/agent-definition'

const body = { references: [], attributes: [], description: 'Example agent' }
console.log(judgeAgentDefinitionBody(body)) // { ok: true }
console.log(extractAgentDefinitionInputs(body)) // { ok: { references: [], attributes: [] } }
```

保留完整原始正文用于持久化；提取结果只有两个槽位，不补属性或默认值。Schema 根未约束，校验时选 `#/$defs/AgentDefinitionBody` 或 `#/$defs/AssetReference`；固定引用图读取逐字一致的 `@omne-harness-lite/model-profile/schema/v3` 资源，以兑现 AD1 的 MP3 `RouteName`，不能用当前 MP5 Schema 代替。函数还检查 Schema 形状不足以表达的能力和 item 唯一性。它们不读取资产或授权使用。

采用范围与验证义务见[行为规格](SPEC.md)。

## 开发与验证

```sh
pnpm --filter @omne-harness-lite/agent-definition... run build
pnpm --filter @omne-harness-lite/agent-definition run typecheck
pnpm --filter @omne-harness-lite/agent-definition run test
```
