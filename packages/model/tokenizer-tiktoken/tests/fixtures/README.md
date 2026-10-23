# tests/fixtures

本目录承载测试使用的固定输入。

## 允许的内容

测试数据文件与说明。

## 边界

固定输入不能代替规格；数据的来源与生成方式写在本 README。

## 维护

输入格式或来源变化时，同步引用它的测试。

## 本包事实

本目录有一个固定输入 `synthetic-ranks.json`。它是第二份词表，与 o200k 无关，用来证明计数用的是调用方传入的词表。

- 格式与 `TiktokenRanks` 相同：`patStr`、`specialTokens` 与 `bpeRanks`。
- `patStr` 把文本切成字母串、空白串与其他字符串。
- `bpeRanks` 先列出 256 个单字节 token（秩 0 到 255，按字节值排列），再列出三个合并：`ab` 为 256，`cd` 为 257，`abcd` 为 258。
- `specialTokens` 只有 `<|fim|>`，id 为 300。

文件由一段 Node 脚本按上述规则写出，没有外部来源。改动本文件时，同时更新 `tests/support/resources.ts` 中的摘要常量。摘要必须在本包以外独立算出，例如用 Python `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)` 的 UTF-8 字节的 SHA-256。
