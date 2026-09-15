# Unix 格式化

`@omne-harness-lite/unix-format` 提供 Unix CLI 风格的纯文本渲染函数，供工具
处理器把结果拼成模型可读的字符串：`ERROR` / `HOLD` / `OK` 信封、man-page 式
段落与命令总览、ASCII 表格、键值列表、bullet 列表和 `cat -n` 式行号块。
输出是纯 ASCII 加轻量 Markdown，不含 ANSI 色码或方框字符；相同输入产出相同字节。

来源：`omne-next` 提交 `6263fed545e4`（2026-09-12）的
`omne_core_v1/libs/omne_core_v1/omne_core_v1/data_model/unix_format/`。
与 [xml-format](../xml-format/README.md) 并列，后者产出结构化 XML。

## 用法

```ts
import { formatError, formatSuccess, formatTable } from '@omne-harness-lite/unix-format'

formatTable(['Name', 'Version'], [['alpha', '1.0'], ['beta', '2.1.3']])
formatError("Missing 'name'.", { hint: "params={'name': '<skill>'}" })
formatSuccess('Installed alpha.')
```

| 函数 | 输出 |
|---|---|
| `formatError(message, { hint? })` | `ERROR: message`，给了 `hint` 时追加 `HINT: hint`（空串也追加） |
| `formatHold(message, { steps? })` | `HOLD: message`，有步骤时逐行 `  1. step` |
| `formatSuccess(message, { hint? })` | `OK: message`，规则同 `formatError` |
| `formatSection(title, body, options?)` | `## TITLE` 或 `TITLE:`（`markdownCompatible` 为假时）加按 `indent` 缩进的正文，空行不缩进 |
| `formatUsage(toolName, command, paramsSynopsis)` | `USAGE: toolName(command="command", params=paramsSynopsis)`，synopsis 原样插入 |
| `formatCommandList(entries)` | 每条 `[name, synopsis, description]` 一行，前两列按最宽项对齐，第三列以 `—` 引出 |
| `formatTable(headers, rows, options?)` | 列宽取最宽项，两空格分隔；超出 `maxWidth` 时收缩最后一列并以 `...` 截断；行长与表头不符抛错 |
| `formatKeyValue(pairs)` | `key: value`，键右补空格使冒号对齐；接受记录或 `Map` |
| `formatBulletList(items)` | 每项 `- item` |
| `formatNumberedLines(lines, { start?, separator?, perLineCharLimit?, maxWidth? })` | 右对齐行号槽（至少六列，随最大行号加宽）、分隔符、内容；超长行截断并加 ` [truncated]` 但仍占一行 |

`UnixFormatOptions` 的默认值为 `maxWidth: 120`、`indent: 2`、
`markdownCompatible: true`；`maxWidth: 0` 表示不封顶。行号块默认不封顶，它的
`maxWidth` 语义与表格一致。对齐与截断按 Unicode 码位计数，与来源相同：宽字符
和表情在按显示宽度渲染的终端里可能错位，这是已知限制。多行的值或项原样输出，
不做续行缩进，调用方需要时自行预处理。

## 与来源实现的差异

| 来源 | 本包 | 原因 |
|---|---|---|
| 关键字参数 `hint=None` / `steps=None` | 第二个参数为选项对象 | TS 惯例；`undefined` 与空串的区分保持不变 |
| `format_table` 同时有 `options` 与 `max_width` 覆盖参数 | 只有 `options.maxWidth` | 展开合并即可覆盖，不需要两个入口 |
| `format_numbered_lines` 嵌套接收 `UnixFormatOptions` | 扁平的 `NumberedLinesOptions`，`maxWidth` 默认 0 | 去掉一层嵌套，默认不封顶的语义保持不变 |
| `format_key_value` 只接受 `dict` | 接受记录或 `Map` | JS 记录会把整数样键排到前面，`Map` 保证插入顺序 |
| 选项值不校验 | 负数或非整数的宽度、缩进与起始行号抛 `RangeError` | 错误尽早暴露 |

## 开发与证据

在仓库根按[开发指南](../../../docs/development.md)安装依赖后，从本叶子执行
`pnpm run build`、`pnpm run typecheck` 与 `pnpm test`；测试通过包名消费构建产物，
不使用源码 alias。本包没有运行依赖，也不发布到 npm；来源记录见
[provenance](provenance.json)。

与 Python 原实现的逐字节差分基线固定在
[evidence/differential](evidence/differential/README.md)，由
`tests/differential.spec.ts` 随 `pnpm test` 持续核对；上表所列差异之外的输出
均与原实现相同。
