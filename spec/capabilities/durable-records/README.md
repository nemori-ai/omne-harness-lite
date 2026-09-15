# 耐久记录与 JSONL 提供者

当前接受版本：[v2](v2/contract.md)，接受依据
[D-015](../../../docs/decisions/D-015-tool-execution-message-stream-and-hooks.md)。
[v1](v1/contract.md) 为 superseded，保持冻结与可引用，未迁移的消费者继续按 v1，接受依据
[D-008](../../../docs/decisions/D-008-core-capabilities.md)。

覆盖说明与模型对应见[验证范围](verification.md)；v1 的设计来源与评审见
[core-capabilities 提案](../../../docs/proposals/core-capabilities/README.md)。本版本为目标
契约，源码 fork 不表示实现已符合。

当前数据/端口与 codec 实现见 [records](../../../packages/storage/records/README.md)，
真实 writer、锁及恢复的待实现映射见 [JSONL 设计](../../../packages/storage/jsonl/design.md)。
