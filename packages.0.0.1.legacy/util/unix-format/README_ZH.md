# @omne-harness-lite/unix-format

[English](README.md)

一组独立的小函数，用于生成易读的工具输出：帮助段落、对齐表格、列表、结果标签和带行号的文本。每个渲染器都返回字符串，没有运行时依赖、全局配置或 Cordis 服务。

本包当前是私有、尚未发布的 ESM workspace 成员。构建检出后，从 workspace 消费者通过公开包名导入；目前没有可用的 npm 发布版本。Node 与 pnpm 工具链见[开发指南](../../../docs/development.md)。

## 公开 API

| 用途       | 导出                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| 帮助       | `formatSection`, `formatUsage`, `formatCommandList`, `CommandEntry`                                         |
| 结构化文本 | `formatTable`, `formatKeyValue`, `formatBulletList`                                                         |
| 结果标签   | `formatError`, `formatSuccess`, `formatHold`                                                                |
| 可寻址文本 | `formatNumberedLines`, `NumberedLinesOptions`                                                               |
| 渲染选项   | `UnixFormatOptions`, `ResolvedUnixFormatOptions`, `DEFAULT_UNIX_FORMAT_OPTIONS`, `resolveUnixFormatOptions` |

## 渲染帮助段落

```ts
import assert from 'node:assert/strict'
import { formatCommandList, formatSection, formatUsage } from '@omne-harness-lite/unix-format'

const commands = formatCommandList([
  ['list', '{}', 'List saved notes'],
  ['read', '{id}', 'Read one note'],
])
const help = formatSection('NOTES', `${formatUsage('notes', 'read', '{id}')}\n${commands}`, {
  markdownCompatible: false,
  indent: 2,
})
assert.ok(help.startsWith('NOTES:\n  USAGE: notes(command="read", params={id})'))
console.log(help)
```

`formatUsage` 原样插入参数摘要。段落标题默认是 `## TITLE`，`markdownCompatible: false` 改为 `TITLE:`。正文空行保留原有空白。

## 格式化结构化输出

```ts
import assert from 'node:assert/strict'
import { formatKeyValue, formatTable } from '@omne-harness-lite/unix-format'

const table = formatTable(['ID', 'Description'], [['a', 'A much longer description']], {
  maxWidth: 18,
})
assert.ok(table.includes('A much long...'))
console.log(table)

const metadata = formatKeyValue(
  new Map([
    ['10', 'ten'],
    ['2', 'two'],
  ]),
)
assert.equal(metadata, '10: ten\n2 : two')
console.log(metadata)
```

需要保持插入顺序时传 `Map`。普通记录遵循 JavaScript 属性枚举顺序，包括整数形式键的排序。表格中每行的单元格数必须与表头一致，否则抛错；空表头返回空字符串。

## 保留行地址并描述结果

```ts
import assert from 'node:assert/strict'
import { formatError, formatHold, formatNumberedLines } from '@omne-harness-lite/unix-format'

const excerpt = formatNumberedLines(['alpha', '😀beta'], {
  start: 41,
  perLineCharLimit: 3,
})
assert.equal(excerpt, '    41 | alp [truncated]\n    42 | 😀be [truncated]')
console.log(excerpt)
console.log(formatError('Note was not found', { hint: 'Run list first' }))
console.log(formatHold('Choose a note', { steps: ['List notes', 'Read its ID'] }))
```

`start` 必须是整数，可以为负数。行号槽至少六个字符。`perLineCharLimit` 截断正文并加上 ` [truncated]`，不会产生新的一行；`maxWidth` 随后限制整个渲染行，也可能截掉这个标记。未提供 hint 与空 hint 不同：空 hint 仍输出 `HINT: `。

## 选项与边界

默认值为 `maxWidth: 120`、`indent: 2` 和 `markdownCompatible: true`。`maxWidth: 0` 取消宽度上限。宽度、缩进和正文限制必须是非负整数，否则抛 `RangeError`。

宽度、补齐和截断按 Unicode 码点计数，不按终端显示单元或字素簇计数。因此宽字符、emoji 和组合字符在终端中可能不对齐。表格宽度是尽力限制：只收缩最后一列，且至少保留三个码点，前面的宽列仍可能让表格超出限制。

调用者文本会被保留，包括控制字符和内嵌换行；列表和键值续行不会自动缩进。这些函数不清洗终端输出，也不决定权限、成功与否或重试政策。`ERROR`、`HOLD` 和 `OK` 是调用者选择的标签。移植后的格式化函数不承诺与一般 Python 行为逐字节等价。

开发本包时运行该成员的 `build`、`typecheck` 和 `test` 脚本。源码归属与适配记录见 [provenance.json](provenance.json)。
