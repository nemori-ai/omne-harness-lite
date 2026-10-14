# unix-format 行为

本页记录类型没有写明的行为。输出字节以 `tests/` 中从封存包迁来的表征测试为准。

## 段落和命令列表

`formatSection(title, body)` 默认输出 `## ${title}`，正文的非空行按默认缩进。`markdownCompatible: false` 时标题为 `${title}:`。它只校验 `indent` 和 `markdownCompatible`。传入 `maxWidth` 不是这个函数的选项，类型上不接受。

`formatUsage` 的形状是 `USAGE: ${toolName}(command="${command}", params=${paramsSynopsis})`。概要字符串原样插入，本函数不解析它。

`formatCommandList` 把 `[name, synopsis, description]` 排成三列。名称和概要按码位宽度对齐。描述前有一个 U+2014 破折号。空数组返回空字符串。

`formatTable` 只校验 `maxWidth`。它不因 `indent` 无效而失败。`formatKeyValue` 接受 `Map<string, string>` 或普通记录。它不接受自定义的 `ReadonlyMap`。

## 其他输出

`formatKeyValue`、`formatTable`、`formatBulletList`、`formatNumberedLines`、`formatSuccess`、`formatHold` 和 `formatError` 的具体换行与缩进由对应测试锁定。本页不另写第二份样例。

## 依赖

函数不读环境，不读文件，不导入 Cordis、CLI 或 `xml-format`。
