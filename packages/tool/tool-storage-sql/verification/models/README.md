# verification/models

<!-- documentation:placeholder -->

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

<!-- documentation:placeholder -->

模型源文件、配置与说明。

## 边界

<!-- documentation:placeholder -->

说明模型对应的 `SPEC.md` 条款、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

<!-- documentation:placeholder -->

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

<!-- documentation:placeholder -->

[SnapshotCache](snapshot-cache/README.md) 检查 [TS-16](../../SPEC.md#ts-16-读取用保管的快照作答)：记录仓用保管的快照作答读取时，快照总是存储有过的内容，读取的陈旧有上界，答“没有”总是当时的内容，收不回的事只在条件提交之后做。建模对象、性质、具名负控、运行命令与模型到代码的对应在该模型自己的 README。负责人是 tool-exec 线。模型不覆盖 SQL 语句本身，那一层由 `tests/` 的真实 SQLite 用例守。
