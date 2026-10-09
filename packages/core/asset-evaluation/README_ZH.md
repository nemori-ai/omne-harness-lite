# @omne-harness-lite/asset-evaluation

[English](README.md)

根据出厂、组织、租户、工作区、会话各层的显式持有，计算生效资产、组合与属性值。本包也能把已经解析的工作区清单转换为承载持有，并记录被忽略的条目。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

| 公开 API                     | 用途                                         |
| ---------------------------- | -------------------------------------------- |
| `evaluate`                   | 校验输入、过滤与选择资产、展开组合、求属性值 |
| `readWorkspaceCarrier`       | 把完整清单值转换为工作区持有                 |
| `defaultBodyContracts`       | 复用五个已经接入的正文提供者                 |
| `evaluationInputFingerprint` | 为完整求值输入生成指纹                       |
| 权限辅助函数                 | 分类配值并计算约束                           |

根入口 `.` 采用 v4。`selectEvaluationRootSource` 选择实际不可变根来源，`judgeEffectiveAssembly` 读取结果表示而不补字段。默认 Loop Extension 正文端口复用当前声明行为，向资产模型 v3 提供它精确引用的 LC3 Schema 资源；只接受资产模型用到的七个声明定义，其他定义作为无效端口配置报错。

## 求值一份完整输入

示例提供根定义与每份持有所指的定义。缺失的引用会列入 `unresolved`。

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

## 读入承载持有及诊断

清单包含三个必需列表。读入器忽略锁标记，并记录针对未知资产的配值。

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

## 失败与边界

`evaluate` 返回 `{ ok }`、`{ invalidInput }`、`{ compositionCycle }`、`{ categoryUnsupported }` 四种结果之一。先检查输入，再求值。`ok` 中仍可能有 `filteredOut` 与 `unresolved`；消费者不能派发仍有未解析引用的装配。可达的 Plugin 正文与非根 Agent Definition 正文当前会产生 `categoryUnsupported`，不会假定它们没有组合成员。

已实现的输入域是 `NonConnectorEvaluationInput`。`defaultBodyContracts` 包含五个真实的 Tool、Loop Extension、Skill、MCP、Slash Command 提供者。Connector 的资产记录、草稿或版本正文超出该域，会抛出 `BodyProviderUnavailableError`。一般的 Connector 标识与引用不会被递归禁止，`readWorkspaceCarrier` 仍接收完整的清单域。

两个操作都是对显式输入的纯计算。调用方提供一致且经过授权的快照，并核实工作区所有权与来源。这里不访问文件、时钟、存储、模型或工具。读入器不加载 `source` 正文；返回的持有没有 `since`，由调用方按实际读入事件补上。另导出 `classifyPermissionAssignment`、`boundOf`、`pickWithinBound`，用于权限分类、约束交集与选值检查；它们只计算值，不授予执行权。

参见[源码导出](src/index.ts)、[测试](tests/)与[资产模型](../asset-model/README_ZH.md)。

[行为承诺](SPEC.md)拥有类型之外的规则；[验证入口](verification/README.md)说明方法与限制。
