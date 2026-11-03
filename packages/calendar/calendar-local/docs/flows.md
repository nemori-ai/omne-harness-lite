# 关键流程

## 流程

发布应用先保管原文和候选，再调用发布 participant。一致提交不可变版本、pointer/generation、receipt 和 outbox；回执未知按完整原操作查询。已提交后只恢复未完反应。确认意图用 acknowledgementKey，同 key 认回旧结果；未知沿原 key，重新获准的新确认才用新 key，不重做发布。

离线初始化显式读取 registry，核 packHash/条目与政策，再逐历导入。runner 只有种子达到 published/noChange 后才初始化供应与执行 phases。seed=null 报 seedSkipped，不隐含默认导入。来源获取的失败保留旧快照，不阻止覆盖内读取。

runner tick 串行完成 recover、runDue、deliverReactions 中启用的阶段。contextSupplier 每周期提供可信上下文，timer 只唤醒，due 和未完责任保存在数据库。start 不把观察事件当业务成功。

完整业务流程见[Calendar 关键流程](../../calendar/docs/key-flows.md)。

## 失败与生命周期

停止先关闭新准入并清 timer。owned supply 停 runner 或应用，borrowed 不停止借入应用。排空有界，超时保管未完成调用并通过 observer 报告，持久运行记录保留。清理失败不报全部释放，退出不回滚发布或外部告知。SQL L-1 的授权窗口、L-4 的跨进程排除和目标介质断电耐久仍按提供者契约核对。
