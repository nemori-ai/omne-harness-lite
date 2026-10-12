# @omne-harness-lite/asset-model

[English](README.md)

资产值与校验的纯模块，用于交换能力标识、资产定义、持有、配值与工作区清单。正文专属规则由调用方显式提供，因此资产模型可以脱离运行时与存储独立使用。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

| 公开 API                                                               | 用途                               |
| ---------------------------------------------------------------------- | ---------------------------------- |
| `createAssetModelJudge(bodyContracts)`                                 | 构造 Schema 与按次序执行的表示判定 |
| `attributeDeclarationsOf`、`referencesOf`                              | 推出正文的属性声明与组合引用       |
| `capabilityCanonicalString`、`parseCapabilityCanonicalString`          | 交换能力标识                       |
| `normalizeWorkspaceDirectory`、`carrierRecordId`、`contentFingerprint` | 标识工作区并跟踪内容               |
| `parseWorkspaceManifestText`                                           | 严格解析并判定清单 JSON            |

## 标识工作区资产

租户身份显式传入，字面等价的目录路径产生相同的工作区资产标识。

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

## 校验正文与清单

使用五个真实的正文提供者。正文推导会加上保留项 `disabled` 与 `usableBy`；清单文本解析会拒绝重复 JSON 键。

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
const declarations = attributeDeclarationsOf(content, judge)
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

## 失败与边界

判定返回 `{ ok: true }` 或 `{ rejected }`，嵌套正文的拒绝保留原名。只检查 Schema 的 `validate` 不能替代 `judgeAssetValue`。正文端口配置不合法，或提供者推出了非法、重复、保留项声明时，抛出 `TypeError`。

提供的五个正文端口覆盖 Tool、Loop Extension、Skill、MCP 与 Slash Command。共享类型仍描述 Connector，但这组组合没有 Connector 提供者：需要该正文规则的操作会抛出 `BodyProviderUnavailableError`。Plugin 与 Agent Definition 的声明是 `underivable`，不能当成空声明集合。MCP 推导保留动作副本是否传入、已经取得或尚未取得的信息。

目录规范化只做字面处理：要求绝对路径，不解析符号链接，不读取文件系统。`carrierRecordId` 包含租户、目录与能力标识；它是标识，不是内容摘要。跟踪正文变化请使用 `contentFingerprint`。本模块不持久化资产，不确立分享或授权，也不保证存储记录之间的唯一性与变更规则。

公开 JSON Schema 入口是 `@omne-harness-lite/asset-model/schema`（v3）和 `/schema/v2`（保留的 v2）。参见[源码导出](src/index.ts)、[测试](tests/)与[资产求值](../asset-evaluation/README_ZH.md)。

## 加载 Connector Schema 资源

公开子路径 `schema/connector/v2` 提供资产 Schema 所引用的精确 Connector v2 资源。构造固定 Schema 图的消费者可直接加载它，无需访问包内路径；这个入口只提供资源，不提供 Connector 运行时。

```ts
import connectorSchema from '@omne-harness-lite/asset-model/schema/connector/v2' with { type: 'json' }

console.log(connectorSchema.$id)
```

行为与验证职责见[薄 SPEC](SPEC.md)和[验证入口](verification/README.md)。
