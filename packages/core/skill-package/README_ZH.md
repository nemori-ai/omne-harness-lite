# @omne-harness-lite/skill-package

[English](README.md)

提供 Skill 包规范值、YAML/Markdown 文本读入，以及根据调用方显式目录条目构造包的纯模块。保留完整正文，推出设置与依赖，列出资源，不执行其中内容。

本包是尚未发布的私有 ESM workspace 成员。请在本仓库内使用声明的 Node 与 pnpm 版本，环境准备见[开发指南](../../../docs/development.md)。以下示例均自包含，只导入公开入口。

| 公开入口或 API                                                                       | 用途                              |
| ------------------------------------------------------------------------------------ | --------------------------------- |
| 根入口                                                                               | v3 规范值、判定、正文规则与读入器 |
| `readSkillMd`、`readSkillPackage`                                                    | 读入完整文本或显式包条目          |
| `judgeSkillPackage`、`validate`                                                      | 判定包语义或检查 Schema 形状      |
| `skillAttributeDeclarations`、`skillReferences`、`skillDependencies`、`skillScripts` | 推出包中的事实                    |
| `skillBodyContract`                                                                  | 提供默认 v3 正文规则              |
| `@omne-harness-lite/skill-package/v2`                                                | 保留的 v2 规范值 API 与正文规则   |

`/v2` 入口不提供文本或条目读入器，也不提供 `SkillReadUndetermined` API。JSON Schema 入口是 `@omne-harness-lite/skill-package/schema`（v3）与 `/schema/v2`（完整保留的 v2）。

## 读入文本与显式目录条目

普通未知键会被忽略并留下可见诊断。目录读入消费调用方提供的观察，不访问文件系统。

```ts
import {
  readSkillMd,
  readSkillPackage,
  type SkillPackageEntry,
} from '@omne-harness-lite/skill-package'

const body = '\nKeep $ARGUMENTS literal.\r\n'
const text =
  [
    '---',
    'name: review',
    'description: Review code',
    'user-invocable: false',
    'vendor-note: arbitrary',
    '---',
  ].join('\n') +
  '\n' +
  body
const markdown = readSkillMd(text)
if (!('ok' in markdown)) throw new Error(JSON.stringify(markdown))
console.log(markdown.ok.body === body) // true
console.log(markdown.ok.unknownKeys.map(entry => [entry.key, entry.category]))
// [['user-invocable', 'external_attribute'], ['vendor-note', 'unknown']]
const entries: readonly SkillPackageEntry[] = [
  { kind: 'file', path: 'SKILL.md', text },
  { kind: 'directory', path: '.omne' },
  {
    kind: 'file',
    path: '.omne/skill.json',
    text: '{"format":1,"tools":[{"category":"tool","name":"repo:read"}]}',
  },
  { kind: 'directory', path: 'references' },
  { kind: 'file', path: 'references/checklist.md', mediaType: 'text/markdown' },
]
const read = readSkillPackage(entries, { capabilityName: 'review' })
if (!('ok' in read)) throw new Error(JSON.stringify(read))
console.log(read.ok.package.resources.map(resource => resource.path)) // ['references/checklist.md']
console.log(
  readSkillMd(
    [
      '---',
      'name: review',
      'description: Review code',
      '!opaque a: first',
      '!opaque b: second',
      '---',
      'body',
    ].join('\n'),
  ),
) // { rejected: 'malformed', malformed: 'M16' }
```

## 判定包并推出声明

只有定义记录的设置参与声明推导。scripts 路径只标识资源，不授予运行权限。

```ts
import {
  judgeSkillPackage,
  skillAttributeDeclarations,
  skillReferences,
  skillDependencies,
  skillScripts,
  skillBodyContract,
  type SkillPackage,
} from '@omne-harness-lite/skill-package'

const pkg: SkillPackage = {
  manifest: { name: 'review', description: 'Review code', 'allowed-tools': 'Bash Read' },
  body: 'Review every change. Keep $0 literal.',
  definition: {
    format: 1,
    tools: [{ category: 'tool', name: 'repo:read' }],
    dependencies: ['repository-index'],
    settings: [
      {
        item: 'variant',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema: { type: 'string', enum: ['brief', 'full'] } },
        default: 'brief',
      },
    ],
    environmentRequirement: { bindingLayer: 'stateless_sandbox', facilities: ['python'] },
  },
  resources: [
    { path: 'references/checklist.md' },
    { path: 'scripts/review.py', mediaType: 'text/x-python' },
  ],
}
console.log(judgeSkillPackage(pkg, { capabilityName: 'review' })) // { ok: true }
console.log(skillAttributeDeclarations(pkg).map(entry => entry.item)) // ['variant']
console.log(skillReferences(pkg)) // [{ category: 'tool', name: 'repo:read' }]
console.log(skillDependencies(pkg).map(entry => entry.kind))
// ['tool', 'external_service', 'execution_environment']
console.log(skillScripts(pkg).map(entry => entry.path)) // ['scripts/review.py']
console.log(skillBodyContract.category) // skill
```

## 显式选择保留的 v2 正文规则

v2 入口接收规范化值并提供自身正文规则。交给 v2 消费者之前，先用该入口判定；作者定义的 Schema 引用与版本有关。

```ts
import { schemaId, judgeSkillPackage, type SkillPackage } from '@omne-harness-lite/skill-package'
import {
  judgeSkillPackage as judgeV2,
  skillBodyContract as bodyV2,
} from '@omne-harness-lite/skill-package/v2'

const pkg: SkillPackage = {
  manifest: { name: 'review', description: 'Review code' },
  body: 'Review code.',
  resources: [],
}
const judgment = judgeV2(pkg)
if ('rejected' in judgment) throw new Error(judgment.rejected)
console.log(bodyV2.judge(pkg, { capabilityName: 'review' })) // { ok: true }
const withV3Reference: SkillPackage = {
  ...pkg,
  definition: {
    format: 1,
    settings: [
      {
        item: 'variant',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema: { $ref: `${schemaId}#/$defs/SkillName` } },
        default: 'review',
      },
    ],
  },
}
console.log(judgeSkillPackage(withV3Reference)) // { ok: true }
console.log(judgeV2(withV3Reference)) // { rejected: 'malformed', malformed: 'M12' }
```

## 失败与边界

判定器与 v3 读入器返回成功或 `{ rejected }`，不返回未判定结果。拒绝可带形状错误的 `M` 诊断。普通未知 frontmatter 键被忽略并列入 `unknownKeys`；外部属性键不会授予权限。`allowed-tools` 保留为清单数据，没有执行效果。

忽略字段之前，读入器检查 YAML 1.2 结构与整个映射图的键唯一性，包括被忽略值内部的映射、复杂键与别名。如果键唯一性依赖未知标量标签缺失的 canonical 判等知识，整个文本读入返回 `malformed` 与 `M16`。已经能够区分键时，不会只因出现未知标签而拒绝。重复键与核心字段类型不合法仍是错误。

开头与闭合定界行必须逐字为 `---`。正文是闭合行终止符之后的所有字符，保留空白与 LF/CRLF 的原写法。不插值、不作命令替换、不截断。可选扩展放在 `.omne/skill.json`，该文件不列入资源。规范化包记录资源路径，不内联资源字节。

`readSkillPackage` 不观察文件系统，也不解码 UTF-8。调用方提供完整条目、链接解析事实与已解码的控制文件文本，并负责文件系统范围约束与版本一致性。资源路径、脚本成员与执行位都不确立可用性、执行许可或授权。本模块不调用工具或模型、不执行脚本、不持久化。

v3 接收的值不自动被 v2 接收。交给 v2 消费者前，须交给保留的 v2 判定器；作者定义的 v3 Schema 引用在那里可能产生 `malformed` `M12`。Asset Model、Asset Evaluation 与 Slash Command 保持显式的 v2 正文集成；使用新的默认入口不会升级这些消费者。

参见[源码导出](src/index.ts)、[测试](tests/)、[资产模型](../asset-model/README_ZH.md)与[斜杠命令](../slash-command/README_ZH.md)。

行为与验证职责见[薄 SPEC](SPEC.md)和[验证入口](verification/README.md)。
