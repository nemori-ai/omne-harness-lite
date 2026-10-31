# tool 业务与数据流

本页解释当前受理、启动、事实保管与原结果收场的跨域顺序。准确支持范围见 [SPEC](../SPEC.md#当前范围) 和[组支持范围](../../README.md#支持范围)。独立执行的顺序、屏障与收尾规则见 [SPEC](../SPEC.md)，内部模块见 [architecture](architecture.md)。可运行的[三条教学旅程](../examples/README.md)展示公开调用、完整参数失败与确认的发起前排除。模型可见的续读仅消费 P14 投影与真实帮助。

## 原意图重入

公开调用先解析固定请求，再通过 source.resolve 认回或建立原身份，然后重发原 admission。原受理为 accepted 时，重入查询当前状态以判断补 wake；查询未知保守补 wake，running/settled 不补。宿主合并唤醒，driver 对账原启动。[恢复用例](../tests/invoke-recovery.spec.ts)覆盖此组合，来源和账本均非耐久。

## 原执行事实

invoke 接纳后，宿主唤醒原 call。启动成功同提交 running 与原 start 的 facts 待办。driver 打开原 live 流，从保存 cursor 读一批。next 完成只登记 ready 并请求唤醒。下一次 run 保管全批，之后向源 ACK，再记录完整来源确认。一批未确认前不读下一批。

receiveFacts 保存完整 final 并形成 settle 待办，不直接写 settled、原结果或释放依据。ACK 与已保存 final 的收场分别履责。driver 优先修复 settled queue，再推进尚未终局的 settle，之后处理 ACK、可推进 facts 及既有准备和启动。ACK 故障不能阻止已保存 final 收场，blocked 清理也不遮蔽剩余来源任务。同轮失败保留原失败，并有界尝试独立责任，不立即热重试同一失败任务。

abort 关闭本连接并保留原任务。已在途的保管或来源命令可能已生效，后续 run 使用同批或原 receipt 重入。旧清理期间的新 run 登记接回意图，清理完成再按仍有效信号唤醒。取消协调不等同源失联，清理也不证明物理结束。详见 [受管推进](../SPEC.md#25-原事实受管推进)。

## 原结果与释放

收场由原 settle.basis 经 ledger.facts.read 取得完整 SavedFact，driver 使用原 task.operation 重送 preserveResult。账本核原 final 和执行身份，按稳定 retain 身份调用独立 custody。保管确认后，call CAS 同提交唯一原结果、delivery、真实 effect、可信 ended、操作回执及全部后继责任。保管 applied-unknown 保持未确认，call 未知用原 preserve operation 认回。

随后 releaseQueue 重读 call 的可信结束依据，queue CAS 同提交 entry 删除与墓碑，call CAS 最后关闭原 queue duty。认回主回执仍执行这一 tail。driver 成功后再读原 queue 任务，确认任务消失才报告进展并 wake。同 key 等待者也能 reconcile queue；迟到入队不能越过墓碑。没有跨域共同事务。

正常 completed 且全部历史输出已独立保管时，canonical 环境计划与终局同提交。planRelease 按 preparation 认回它，task 关闭后不重建。recordRelease 核完整记录，并由原环境 inspectRelease 确认 reported released 后闭合 release task。本路径不调用环境 release，slot 释放不能代替资源释放。

正常 completed 收场关闭原 reader，关闭过程不阻塞 queue 修复。未确认 ACK 留在原 live 或 recover 路由。异常 final 保留 blocked 清理与 facts，原 reader 可以继续接收 late process；后继保管不改变原结果。随后 end/throw/失联经受限 recordTask 持久 blocked facts，再关闭本地 reader。完整异常恢复另行交付。

final 缺执行结束 clock marker 时，running 计时保留 unknown、原 segment、累计与 blocked clock，不采晚到 elapsed 或补零。该时钟缺口不阻止可信结束的 slot 释放。完整失败、资格、未知和输入边界归 [收场规则](../SPEC.md#26-原结果收场与释放责任)。
