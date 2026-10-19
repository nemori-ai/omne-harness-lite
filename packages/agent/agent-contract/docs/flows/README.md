# Agent 业务与数据流

本页给出已接受设计的业务与数据流。图表投影设计，不表示运行实现或真实提供者验证已完成。完整节点、次序与转移只在[Loop 完整算法](../../../agent/docs/architecture/loop-algorithm.md)维护，下图是它的派生说明。

下图只给出主干阅读次序，不穷举控制优先级、状态或并发交错。完整行为和失败条件归 [SPEC](../../SPEC.md)，各参与者只通过自己的公开能力交接。

```mermaid
flowchart TD
  Advance[取得原推进与固定采用] --> Facts[读取原事实与当前条件]
  Facts --> Evaluate[纯求值与扩展经过]
  Evaluate --> Model[发起并等待原模型调用]
  Model --> ModelResult[处理或保管原模型结果]
  ModelResult --> Barrier{全批判断与卡片处理完成}
  Barrier -->|尚未完成| Wait[保持原批等待，不发起工具动作]
  Wait --> Barrier
  Barrier -->|完成| Bind[保存整批屏障及原 Tool 绑定]
  Bind --> Tools[当前资格下受理获准工具动作]
  Tools --> ToolResult[处理或保管原 Tool 结果]
  ToolResult --> Facts
  Evaluate --> End[满足完成条件，经终态前判断后条件提交本执行结束]
  Facts --> Lost[失权后交还自己]
```

## 关键流程与失败分支

[关键协作流程](scenarios.md)保存本包业务 UML、数据来源和去向，以及控制、恢复和终态分支。[消费与系统定位](../context.md)给出独立调用者与外部协调者的调用、原结果交接和反例。两者保留各自的状态说明，图示不代替真实存储、外部效果或故障试验。

## 生命周期与验证入口

逻辑工作、执行实例和结果保管分别定位到[对象模型](../object-model.md)。插件撤除及依赖换代见 [Cordis](../../../agent-cordis-contract/docs/cordis.md)。后继实现的验证范围见[共同交接](https://github.com/nemori-ai/omne-harness-lite/blob/a69de04ae9b70f299ff74dd2b10343172433bc6c/docs/architecture/runtime/runtime-contract-handoff.md)，当前未覆盖项记录在原场景及规格中。
