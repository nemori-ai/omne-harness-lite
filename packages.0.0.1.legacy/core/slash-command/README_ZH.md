# @omne-harness-lite/slash-command

[English](README.md)

识别交付面的斜杠命令，根据显式会话命令集解析参数，并展开提示词或已选技能内容。结果描述消费者应做的事；本包不交付内容、不派发服务。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下导入均使用包的公开入口，每个示例都可以独立使用。

| 公开 API                                                         | 用途                                 |
| ---------------------------------------------------------------- | ------------------------------------ |
| `recognize`                                                      | 区分普通文本、字面斜杠文本与命令尝试 |
| `parseInvocation`                                                | 根据显式传入的会话命令集解析         |
| `expandPrompt`、`expandSkill`                                    | 投影提示词文本或已选技能内容块       |
| `judgeSlashCommand`、`judgeInvocation`、`judgeSlashCommandValue` | 校验定义与交换值                     |
| `slashCommandBodyContract`、声明与引用辅助函数                   | 将定义接入资产求值                   |

## 识别并解析提示词命令

只有首个码点上的斜杠才开始命令尝试。`//` 表示发送字面斜杠文本；未知命令仍是失败。

```ts
import {
  recognize,
  parseInvocation,
  type SlashCommandDefinition,
} from '@omne-harness-lite/slash-command'

const definition: SlashCommandDefinition = {
  description: 'Summarize text',
  binding: { kind: 'prompt', template: 'Summarize: $ARGUMENTS' },
}
console.log(recognize('//summarize text')) // { kind: 'literal', text: '/summarize text' }
console.log(recognize(' /summarize text').kind) // text
const recognized = recognize('/summarize a short note')
if (recognized.kind !== 'invocation') throw new Error('Invocation required')
console.log(parseInvocation(recognized.invocation, { summarize: definition }))
// { kind: 'expanded', text: 'Summarize: a short note' }
console.log(parseInvocation(recognized.invocation, {}))
// { kind: 'failed', reason: 'unknown_command', at: { start: 0, end: 10 },
//   explanation: 'This session has no command with this name.' }
```

## 解析带类型的服务参数

服务命令使用官方保留命名空间。解析只产生数据，不解析或调用服务。

```ts
import {
  judgeSlashCommand,
  recognize,
  parseInvocation,
  type SlashCommandDefinition,
} from '@omne-harness-lite/slash-command'

const name = 'omne-official:reload'
const definition: SlashCommandDefinition = {
  description: 'Reload an asset',
  binding: { kind: 'command', service: 'registry.reload' },
  parameters: [{ name: 'version', kind: 'integer', required: true, positional: true }],
}
console.log(judgeSlashCommand(definition, { capabilityName: name, origin: 'official' })) // { ok: true }
const recognized = recognize('/omne-official:reload 7')
if (recognized.kind !== 'invocation') throw new Error('Invocation required')
console.log(parseInvocation(recognized.invocation, { [name]: definition }))
// { kind: 'command', service: 'registry.reload', arguments: { version: 7 } }
console.log(judgeSlashCommand(definition, { capabilityName: name, origin: 'customized' }))
// { rejected: 'name_reserved' }
```

## 展开显式选择的技能

调用方已经选定生效且经过授权的技能。正文保留字面内容，参数成为另一个带来源的块。

```ts
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { recognize, parseInvocation, expandSkill } from '@omne-harness-lite/slash-command'

const recognized = recognize('/review focus on errors')
if (recognized.kind !== 'invocation') throw new Error('Invocation required')
const parsed = parseInvocation(recognized.invocation, {
  review: {
    description: 'Review code',
    binding: {
      kind: 'skill',
      skill: { category: 'skill', name: 'review' },
    },
  },
})
if (parsed.kind !== 'skill') throw new Error('Skill binding required')
const skill = {
  manifest: { name: 'review', description: 'Review code' },
  body: 'Review the code. Keep $0 literal.',
  resources: [],
}
const blocks = expandSkill(recognized.invocation, parsed.skill.name, skill, [
  {
    id: unwrap(parseOpaqueIdentifier('skill_body', 'BlockId')),
    visibility: { toHuman: true, toModel: true },
  },
  {
    id: unwrap(parseOpaqueIdentifier('skill_arguments', 'BlockId')),
    visibility: { toHuman: true, toModel: true },
  },
])
console.log(blocks.map(block => block.text))
// ['Review the code. Keep $0 literal.', 'focus on errors']
console.log(blocks.map(block => block.origin?.kind)) // ['skill_body', 'slash_command_args']
```

## 失败与边界

表示判定返回 `{ ok: true }` 或 `{ rejected }`。解析返回 `expanded`、`skill`、`command` 或 `failed`；失败带原因、说明以及适用时的 Unicode 码点区间。因为解析只看到传入的集合，缺失与无权限的命令表现相同。不能把失败静默转换为文本交付。

`recognize` 用于经交付面到达的人工输入。调用方应确保模型输出、连接件、定时或其他会话文本不进入这套文法。名字区分大小写。只有定义提供 `parameters` 时，才解析引号、带类型的位置与具名参数及枚举值；没有声明时，参数文字仍是自由文本。

`expandSkill` 接收已经选定的 SkillPackage，并要求调用方为每个输出块提供一份身份与可见性标注。它不读取、不选择、不授权技能。不符合辅助函数前提的输入会抛出 `TypeError`，与解析失败不同。本包不记录日志、不发送内容、不执行命令、不解析服务名；这些效果由调用方负责。

JSON Schema 通过 `@omne-harness-lite/slash-command/schema` 公开。参见[源码导出](src/index.ts)、[测试](tests/)与[技能包](../skill-package/README_ZH.md)。

行为与验证职责见[薄 SPEC](SPEC.md)和[验证入口](verification/README.md)。
