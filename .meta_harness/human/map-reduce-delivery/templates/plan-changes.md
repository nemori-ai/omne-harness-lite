# 方案版本表模板

**用途：**把每一项方案调整登记为一个变量，使跨里程碑对比能把改善或回归归因到具体调整。用法见[跨里程碑对比协议](../README.md#跨里程碑对比协议)。

规则：

- 一行记一项调整。
- 每个里程碑开工时取一个方案版本代号。里程碑中途改方案就升小版本，例如从 `X` 升到 `X.1`，并把同一指标上的多项调整记为共干预。
- 每张卡挂派发时的方案版本。
- 调整的作用范围之外的卡，自动成为这项调整的对照组。
- 表可以存为 CSV，列名与下表一致。

## 列定义

| 列 | 含义 |
| --- | --- |
| `plan_version` | 方案版本代号 |
| `change_id` | 调整编号，在全部里程碑中唯一 |
| `effective_date` | 生效日期 |
| `scope` | 作用范围：哪些交付线、哪些卡的类型、哪些波，或 reduce 的哪一段 |
| `metric` | 预期影响的指标 |
| `expected_direction` | 预期方向：升或降 |
| `rationale` | 为什么做这项调整 |
| `source` | 依据：调研文章的节，或裁定的链接 |

## 示例

下面一行只是示例，编号与日期都是虚构的。

| plan_version | change_id | effective_date | scope | metric | expected_direction | rationale | source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X | C-X-03 | 2000-01-01 | 全部交付线 | reduce 时长中位数 | 降 | 评审与修复轮移到线内，reduce 只做确认 | [agent-practice-2026 第 4 节](../research/agent-practice-2026.md) |
