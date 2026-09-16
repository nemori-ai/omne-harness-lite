# 耐久记录

- 坐标：`(omne-harness-lite-design-2026-09-15, capability.durable-records, 1)`
- 状态：candidate；`acceptance:null`；旧决定只作 lineage
- 精确条款：DR-01～DR-05
- 责任：append/read/recovery/ordering/unknown、独占 writer 与提供者换代。
- 提供者：[storage-records](../../../providers/storage-records/README.md)、[session-persistence](../../../providers/session-persistence/README.md) 与 [storage-jsonl](../../../providers/storage-jsonl/README.md)
- 个人租户创建候选：DR-01 一笔封闭混合流资格，注册二流、首次 init 三流；新格式 `core-journal/3`。前置的受信来源和排位见 [CC-03/05](../../compositions/core-work-coordination/v1/contract.md)。

## 准入与阅读

该主题有独立语义拥有者和持续消费者，符合 spec family 准入。先读 [v1 契约](v1/contract.md)，
再按问题读取 [验证范围](verification.md)；形式工件存在不表示已运行或实现符合。
