# 规范场景：生命周期组合 v1

每个场景标注它对应的[契约](contract.md)条款、[级联矩阵](../../../../docs/proposals/session-run-agent-lifecycles/lifecycles.md#级联矩阵)
的行，以及证据来源：模型（[Lifecycles.tla](Lifecycles.tla) 的配置）或提供者验收。

| 编号 | 场景 | 条款 / 行 | 证据 |
|---|---|---|---|
| S01 | 用户对有活动 Run 的 Session 点归档，返回 busy；Run 完成后再归档，未取批项与未消费 arrival 同提交关闭 | LC-04 行 1、LC-05 | 模型 `Lifecycles.cfg`（I1、S2）；提供者验收 |
| S02 | 归档后，空闲实例被宿主关闭并释放附着；Session 恢复 open 后需要新实例 | LC-06 | 模型 `LifecyclesProgress.cfg`（LP2） |
| S03 | Session 级 force_stop：hold、Run stopping、epoch 撤销同提交；旧实例的迟到提交被拒绝 | LC-04 行 2、LC-05 | 模型（L1）；提供者验收 |
| S04 | 队列有项、无占位、有 ready 实例：调度者开新 Run，取项、建 Run、epoch 同提交 | LC-04 行 3、LC-06 | 模型 `LifecyclesProgress.cfg`（LP1a） |
| S05 | Run 完成时指向它的未消费接续转为 trigger 项；cancelled 时关闭 | LC-04 行 4 | 模型（I14） |
| S06 | 实例计划退役而 Run 运行中：驱动器 Yield，Run 状态与占位不变，实例静止后释放；调度者随后重取 | LC-04 行 7、LC-07 | 模型（L1、LP1b） |
| S07 | 进程崩溃：Registry 从空重建，占位 Run 执行者为空；先裁决扫描，再重取 | LC-08 | 模型 `Lifecycles.cfg`（Crash 动作后的 L1/I1）；提供者验收（扫描顺序） |
| S08 | 对 interrupted 的 Run 做 force_stop：直接 cancelled，不进入 stopping，不与新 Run 并存 | LC-04 行 5、[RN-03](../../../capabilities/run/v1/contract.md) | 模型（I1 反例的修正） |
| S09 | Run 等待人类答复且实例空闲：资源政策回收实例；答复到达后调度者重取 | LC-06、LC-07 | 提供者验收 |
| S10 | 资格失效：新准入被拒，进行中的 Run 到安全边界 Yield，实例关闭；资格恢复后重取门放行 | LC-05 | 提供者验收 |
| S11 | 跨域（未来）：Session 门带版本戳时裁决只发生在 Run 实际非终态；不带则按陈旧视图归档正在运行的 Run | LC-09 | 模型 `LifecyclesSplit.cfg`（ClassifyFresh、L3）与否定变体 |
| S12 | 跨域（未来）：create/settle 意图幂等消费并撤回；终态后接续最终为空 | LC-09 | 模型 `LifecyclesSplitProgress.cfg`（IntentsDrain、I14Eventually） |
