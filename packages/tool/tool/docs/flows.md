# tool 业务与数据流

<!-- documentation:placeholder -->

本页将说明本实现的推进协程、独立执行和恢复的时序、状态变化与失败分支。

已实现独立执行、账本与记录仓端口、runtime 逻辑终局，以及从受理到启动记录和启动前拒绝收场的路径。准确范围与限制见 [SPEC](../SPEC.md#当前范围) 和[组支持范围](../../README.md#支持范围)，不表示已启动执行的后续闭环已实现。本页流程专题仍待展开。

独立执行的顺序、屏障与收尾规则见 [SPEC](../SPEC.md)。内部机制见 [architecture](architecture.md)。目录职责见 [README](README.md)。

## 原意图重入

公开调用先解析固定请求，再通过 source.resolve 认回或建立原身份，然后重发原 admission。原受理为 accepted 时，重入查询当前状态以判断补 wake；查询未知保守补 wake，running/settled 不补。宿主合并唤醒，driver 对账原启动。[恢复用例](../tests/invoke-recovery.spec.ts)覆盖此组合，来源和账本均非耐久。

## 原执行事实

invoke 接纳后，宿主唤醒原 call。启动成功同提交 running 与原 start 的 facts 待办。driver 打开原 live 流，从保存 cursor 读一批。next 完成只登记 ready 并请求唤醒。下一次 run 保管全批，之后向源 ACK，再记录完整来源确认，最后才读下一批。完整 final 形成 settle 待办，后继收场通过 ledger.facts.read 取原件。

abort 关闭本连接并保留任务。已在途的保管或来源命令可能已生效，后续 run 使用同批或原 receipt 重入。旧清理期间的新 run 登记接回意图，清理完成再唤醒。通道 end/throw 走延迟重连，不推断执行结束。详见 [受管推进](../SPEC.md#25-原事实受管推进)。
