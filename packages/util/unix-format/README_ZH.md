# @omne-harness/unix-format

[English](README.md)

按 Unicode 码位排版文本的纯函数。本成员从封存的 `packages.0.0.1.legacy/util/unix-format` 迁入。函数名和测试锁定的输出字节不变。包名是 `@omne-harness/unix-format`。

## 职责与状态

本成员拥有段落标题、用法行、对齐的命令列表、键值块、表格、带行号的文本，以及成功、暂停和错误信封。它不拥有某个应用的命令表或帮助政策。类型表达不了的行为在 [SPEC.md](SPEC.md)。

## 使用

```ts
import { formatSection } from '@omne-harness/unix-format'

formatSection('SYNOPSIS', 'my_tool command [params]')
```

上面的调用返回 `## SYNOPSIS\n  my_tool command [params]`。

## 契约

`formatSection` 在缩进正文上方放 Markdown 标题。`markdownCompatible: false` 改用 `TITLE:` 标题。它只校验 `indent` 和 `markdownCompatible`。`formatTable` 只校验 `maxWidth`。`formatKeyValue` 接受 `Map` 或普通记录，不接受自定义的 `ReadonlyMap`。`formatUsage(toolName, command, paramsSynopsis)` 返回一行 `USAGE:`，并把概要原文插入。`formatCommandList` 对齐名称列和概要列，空列表返回空字符串。`formatBulletList` 渲染短横线列表。`formatNumberedLines` 渲染带地址的行。`formatSuccess`、`formatHold` 和 `formatError` 渲染结果信封。

列宽按 Unicode 码位计算，不按 UTF-16 码元计算。

## 设计

`src/sections.ts` 渲染帮助形状的块。`src/structured.ts` 渲染列表和表格。`src/numbered.ts` 渲染带地址的行。`src/envelope.ts` 渲染结果。`src/text.ts` 按码位测量和填充。`src/options.ts` 解析缩进和标题样式。`src/index.ts` 再导出公开表面。

## 配置与运行

`UnixFormatOptions` 仍描述缩进、标题样式和表格宽度。每个函数只读取自己的字段。`formatSection` 不读取 `maxWidth`。`formatTable` 不读取 `indent`。这些函数不读环境变量，也不读文件系统。

Node `>=24`。没有运行时依赖。

## 验证

`pnpm test` 先构建，再运行从封存包迁来的表征测试。`pnpm run typecheck` 先构建，再对测试做类型检查。其中一个用例用普通 Node 导入构建出的 `dist/index.js`。

## 维护

改变输出字符串时，同一次修改 SPEC.md 和对应测试。`omne --help` 不是本包的调用方。不要为了贴合那份帮助文本而改这些函数。
