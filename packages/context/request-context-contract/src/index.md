# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，显式导出类型与纯操作

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与条款。模块怎样切分见[内部架构](../docs/architecture.md#模块与依赖)。类型进入后，再读 `index.ts` 与各模块源文件的精确类型。

## 内部计算模块

- [values.ts](values.ts)：共享值与准备依据，保持对执行模块无依赖。
- [ports.ts](ports.ts)：历史、计量、策略及操作组合类型。
- [input-validation.ts](input-validation.ts)：输入绑定与 Runtime Context 读取前提。
- [history-read.ts](history-read.ts)：带 epoch 切换的历史分页。
- [measurement.ts](measurement.ts)：实际序列化字节与多供应者纯计量。
- [preparation.ts](preparation.ts)：修订键、显式身份比较与稳定内容认回。
- [assembly.ts](assembly.ts)：公开组装阶段编排。
- [assembly-layers.ts](assembly-layers.ts)：动态放置与 Model 输入构造。
- [assembly-representation.ts](assembly-representation.ts)：本次转换读取及结果映射。
- [assembly-budget.ts](assembly-budget.ts)：整体和固定部分的计量与裁定。
- [assembly-coverage.ts](assembly-coverage.ts)：覆盖证据与前缀原因。
- [assembly-outcome.ts](assembly-outcome.ts)：候选与压缩结局。
- [plan.ts](plan.ts)：完整下界预算之后接受策略计划。
- [compaction-context.ts](compaction-context.ts)：持有者上下文读取与完整 open 下界计量。
- [compaction-request.ts](compaction-request.ts)：摘要输入与步请求构造。
- [compaction-step.ts](compaction-step.ts)：计划身份、消费推进与摘要验证。
- [resume.ts](resume.ts)：恢复前提与组装接续。
- [schema-primitives.ts](schema-primitives.ts)：Schema 适配与边界基本谓词。
- [coverage-validation.ts](coverage-validation.ts)：按来源字段组核对覆盖证据。
- [schema.ts](schema.ts)：公开 Schema 组合。
- [representation.ts](representation.ts)：块表示、模态与转换来源。
