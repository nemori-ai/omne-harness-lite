# src 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：源码目录的职责与现状
- [index.ts](index.ts)：根入口，显式导出类型、`createAssemblyOperations` 与纯函数

## 阅读路径

先读[公开接口页](../docs/public-api.md)找到名称与条款。模块怎样切分见[内部架构](../docs/architecture.md#模块与依赖)。类型进入后，再读 `index.ts` 与各模块源文件的精确类型。

## 内部计算模块

- [values.ts](values.ts)：共享值与准备依据，保持对执行模块无依赖。
- [ports.ts](ports.ts)：历史、转换件结果、策略及操作组类型。
- [sources.ts](sources.ts)：来源集合、组读口、窄采用来源、读取资格、主体绑定与登记协议类型（RQ-12、RQ-13）。
- [accounting.ts](accounting.ts)：收件口、恢复口、系统恢复访问与授权端口的类型（RQ-14、RQ-15）。
- [operations.ts](operations.ts)：`createAssemblyOperations`，访问与资格、主体键、读取、派生与发布前再核资格。
- [operation-context.ts](operation-context.ts)：一次操作内共用的访问身份、目标、来源与策略。
- [input-read.ts](input-read.ts)：七组的稳定读取，读计数、读来源、再读计数，每组两次尝试。
- [model-input.ts](model-input.ts)：从选择到 Model 输入的一次转换，来源调用与延续依据。
- [input-validation.ts](input-validation.ts)：输入绑定与 Runtime Context 读取前提。
- [history-read.ts](history-read.ts)：带 epoch 切换的十进制序号历史分页。
- [measurement.ts](measurement.ts)：取得准备租约、按供应商计划与计量、在全部路径上归还租约。
- [preparation.ts](preparation.ts)：`PreparedInputKey` 与稳定内容认回。
- [assembly.ts](assembly.ts)：公开组装阶段编排。
- [assembly-layers.ts](assembly-layers.ts)：动态放置与 Model 输入构造。
- [assembly-representation.ts](assembly-representation.ts)：本次转换读取及结果映射。
- [assembly-budget.ts](assembly-budget.ts)：整体和固定部分的计量与裁定。
- [assembly-coverage.ts](assembly-coverage.ts)：覆盖证据与前缀原因。
- [assembly-outcome.ts](assembly-outcome.ts)：候选与压缩结局。
- [plan.ts](plan.ts)：完整下界预算之后接受策略计划。
- [compaction-context.ts](compaction-context.ts)：增量判断窗口与完整 open 下界计量。
- [compaction-request.ts](compaction-request.ts)：摘要材料、首步之前的一次修剪与步请求构造。
- [compaction-step.ts](compaction-step.ts)：计划身份、步序号、依据核对、消费推进与摘要验证。
- [resume.ts](resume.ts)：恢复前提与组装接续。
- [schema-primitives.ts](schema-primitives.ts)：Schema 适配与边界基本谓词。
- [coverage-validation.ts](coverage-validation.ts)：按来源字段组核对覆盖证据。
- [schema.ts](schema.ts)：公开 Schema 组合，具名校验分别拥有预算、策略控制、计划身份、保留范围和摘要消息。
- [representation.ts](representation.ts)：块表示、模态与转换来源。
