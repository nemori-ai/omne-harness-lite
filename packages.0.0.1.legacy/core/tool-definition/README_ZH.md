# @omne-harness-lite/tool-definition

[English](README.md)

定义单函数或多命令工具，生成模型侧条目，判定参数并规范化工具返回内容。这些函数可以脱离 OMNE 运行时使用。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

| 公开 API                                                          | 用途                         |
| ----------------------------------------------------------------- | ---------------------------- |
| `judgeToolDefinition`、`createParameterJudge`                     | 接收定义并校验所选命令的参数 |
| `modelEntry`、`modelInput`、`modelName`、`definitionNameOf`       | 每个工具生成一个模型侧条目   |
| `judgeToolReturn`、`toolResultOf`                                 | 判定并规范化返回内容         |
| `toolDependencies`、`toolAttributeDeclarations`、`toolReferences` | 推出依赖、设置与组合         |
| `toolBodyContract`                                                | 为资产模型提供 Tool 正文规则 |

## 生成并校验单函数工具

调用方拥有的参数判定器可以复用于定义接收与调用。作者未写根层 `additionalProperties` 时，未知参数仍会被拒绝。

```ts
import {
  createParameterJudge,
  judgeToolDefinition,
  modelEntry,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'

const tool: ToolDefinition = {
  name: 'repo:read',
  description: 'Read one repository file',
  paradigm: 'single',
  origin: { kind: 'authored' },
  input: {
    type: 'object',
    properties: { path: { type: 'string', description: 'Repository-relative path' } },
    required: ['path'],
  },
  permissions: { execute: { default: 'ask' } },
}
const judge = createParameterJudge()
console.log(judgeToolDefinition(tool, judge)) // { ok: true }
console.log(modelEntry(tool).name) // repo__read
console.log(judge.judgeCallArguments(tool, { path: 'README.md' }))
// { ok: { args: { path: 'README.md' } } }
console.log('invalid' in judge.judgeCallArguments(tool, { path: 'README.md', extra: true })) // true
```

## 选择多命令 Schema

模型只看到一个条目；参数判定使用所选命令的 Schema。

```ts
import {
  createParameterJudge,
  modelInput,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'

const tool: ToolDefinition = {
  name: 'repo',
  description: 'Repository operations',
  paradigm: 'multi',
  origin: { kind: 'authored' },
  permissions: { execute: { default: 'ask' } },
  commands: {
    status: { description: 'Show status', input: { type: 'object', properties: {} } },
    read: {
      description: 'Read a file',
      input: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path' } },
        required: ['path'],
      },
    },
  },
}
const judge = createParameterJudge()
console.log(modelInput(tool).required) // ['command']
console.log(judge.judgeCallArguments(tool, { command: 'status' }))
// { ok: { command: 'status', args: {} } }
console.log('invalid' in judge.judgeCallArguments(tool, { command: 'read', args: {} })) // true
```

## 规范化文本并拒绝结果中的调用

调用方为字符串返回提供身份。未解析的工具调用仍是调用，不能成为结果内容。

```ts
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { toolResultOf, judgeToolReturn } from '@omne-harness-lite/tool-definition'

const blockId = unwrap(parseOpaqueIdentifier('result_text', 'BlockId'))
const result = toolResultOf('{"status":"ok"}', blockId)
console.log(result.content[0]?.kind) // text
console.log(
  judgeToolReturn({
    content: [
      {
        id: 'call_block',
        kind: 'tool_call',
        complete: true,
        callId: 'call_1',
        tool: 'repo__read',
        rawArguments: '{broken',
        unparseable: true,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  }),
) // { rejected: 'result_call_in_content' }
```

## 失败与边界

`judgeToolDefinition` 与 `judgeToolReturn` 返回 `{ ok: true }` 或 `{ rejected }`。`malformed` 带 `M` 诊断，`schema_unsupported` 可带实现上限诊断。调用参数返回 `{ ok: { command?, args } }`、`{ invalid }` 或 `{ unsupported }`；给参数判定器传入不合法的定义会抛出 `TypeError`。调用方拥有判定器及其 Schema 编译缓存。

输入 Schema 使用支持的 Draft 2020-12 子集，每个声明的参数都需要说明。参数判定时，根层未写 `additionalProperties` 会在私有校验视图中按 false 处理；模型侧 Schema 不被改写。正则上限通过 `PATTERN_MAX_CODE_POINTS` 与 `PATTERN_MAX_FINITE_COUNT` 导出。判定是同步计算，工作线程的终止与执行时限由消费者负责。

Tool Result 是返回内容，不是执行收场。结果内容与 offload 摘要都禁止工具调用，包括已经完整但参数无法解析的调用。看起来像 JSON 的字符串仍是文本。身份唯一性、权限、依赖可用性、后台工作与执行归运行时负责；本包不执行工具、不访问模型。

公开 JSON Schema 入口是 `@omne-harness-lite/tool-definition/schema`（v3）和 `/schema/v2`。参见[源码导出](src/index.ts)、[测试](tests/)与[内容块](../content-blocks/README_ZH.md)。

行为与验证职责见[薄 SPEC](SPEC.md)和[验证入口](verification/README.md)。
