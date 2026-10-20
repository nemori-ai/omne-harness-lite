# tool 业务与数据流

<!-- documentation:placeholder -->

本页将说明本实现的推进协程、独立执行和恢复的时序、状态变化与失败分支。

已实现独立执行、账本与记录仓端口、runtime 逻辑终局，以及从受理到启动记录和启动前拒绝收场的路径。准确范围与限制见 [SPEC](../SPEC.md#当前范围) 和[组支持范围](../../README.md#支持范围)，不表示已启动执行的后续闭环已实现。本页流程专题仍待展开。

独立执行的顺序、屏障与收尾规则见 [SPEC](../SPEC.md)。内部机制见 [architecture](architecture.md)。目录职责见 [README](README.md)。

## 原意图重入

公开调用先解析固定请求，再通过 source.resolve 认回或建立原身份，然后重发原 admission。原受理为 accepted 时，重入查询当前状态以判断补 wake；查询未知保守补 wake，running/settled 不补。宿主合并唤醒，driver 对账原启动。[恢复用例](../tests/invoke-recovery.spec.ts)覆盖此组合，来源和账本均非耐久。
