# 规范场景：生命周期组合 v2

每个场景标注它对应的[契约](contract.md)条款（LC-04 的行号即该表的行），以及证据来源：
模型（[Lifecycles.tla](Lifecycles.tla) 的配置）或提供者验收。S01～S12 沿 v1 的编号与含义，
S05 / S08 随 `superseded` 与升级路径改写；S13～S17 是本版新增。

| 编号 | 场景 | 条款 / 行 | 证据 |
|---|---|---|---|
| S01 | 用户对有活动 Run 的 Session 点归档，返回 busy；Run 完成后再归档，未取批项与未消费 arrival 同提交关闭 | LC-04 行 1、LC-05 | 模型 `Lifecycles.cfg`（I1、S2）；提供者验收 |
| S02 | 归档后，空闲实例被宿主关闭并释放附着；Session 恢复 open 后需要新实例 | LC-06 | 模型 `LifecyclesProgress.cfg`（LP2） |
| S03 | Session 级 force_stop：hold、Run stopping、epoch 撤销、整簿注销同提交；旧实例的迟到提交被拒绝 | LC-04 行 2、LC-05、[RN-05](../../../capabilities/run/v2/contract.md) | 模型（L1）；提供者验收（整簿注销） |
| S04 | 队列有项、无占位、有 ready 实例：调度者开新 Run，取项、建 Run、epoch 同提交 | LC-04 行 3、LC-06 | 模型 `LifecyclesProgress.cfg`（LP1a） |
| S05 | Run 完成时指向它的未消费接续转为 trigger 项；cancelled 时关闭；superseded 时改判为 context，不转 trigger、不唤醒 | LC-04 行 4 | 模型（I14：三种终态后均无未消费接续）；提供者验收（改判 context 与转 trigger 的区别） |
| S06 | 实例计划退役而 Run 运行中：驱动器 Yield，Run 状态、等待登记簿与占位不变，实例静止后释放；调度者随后重取 | LC-04 行 7、LC-07 | 模型（L1、LP1b）；提供者验收（登记簿不变） |
| S07 | 进程崩溃：Registry 从空重建，占位 Run 执行者为空；先裁决扫描，再重取 | LC-08 | 模型 `Lifecycles.cfg`（Crash 动作后的 L1/I1）；提供者验收（扫描顺序） |
| S08 | 对 interrupted 的 Run 做 cancel：直接 cancelled，不进入 stopping，不与新 Run 并存。对它做 force_stop：没有可升级的 unknown 调用时同样直达 cancelled | LC-04 行 5、LC-02、[RN-03](../../../capabilities/run/v2/contract.md) | 模型（I1 反例的修正：`CancelInterrupted`） |
| S09 | Run 等待人类答复且实例空闲：资源政策回收实例；答复到达后调度者重取 | LC-06、LC-07 | 提供者验收 |
| S10 | 资格失效：新准入被拒，进行中的 Run 到安全边界 Yield，实例关闭；资格恢复后重取门放行 | LC-05 | 提供者验收 |
| S11 | 跨域（未来）：Session 门带版本戳时裁决只发生在 Run 实际非终态；不带则按陈旧视图归档正在运行的 Run | LC-09 | 模型 `LifecyclesSplit.cfg`（ClassifyFresh、L3）与否定变体 |
| S12 | 跨域（未来）：create/settle 意图幂等消费并撤回；终态后接续最终为空 | LC-09 | 模型 `LifecyclesSplitProgress.cfg`（IntentsDrain、I14Eventually） |
| S13 | interrupt_then_run：新输入耐久入队并受理终止意图（行 8）；收口后旧 Run 一步进入终态 superseded，同一提交整簿注销、未消费接续改判 context、被保留工作清单作 `origin: system` 的 context 到达受理（行 4）；新 Run 随后照常开 | LC-04 行 4/8、[RN-04](../../../capabilities/run/v2/contract.md) | 模型 `Lifecycles.cfg`（`Supersede` 动作后的 I1、I13、I14、S2）；提供者验收（工作清单内容与恰一次消费） |
| S14 | 对 interrupted 的 Run 做 force_stop 且存在物理结果 unknown、owner 声明 `forced_isolation` 的调用：Run 进入 stopping，该 stopping 不重新取得占位，不阻止此时已在运行的新 Run；全部这类调用回答后进入 cancelled(force_stopped)，控制结果记 `partial{unknown: K}` | LC-02、LC-04 行 5、[RN-03/05](../../../capabilities/run/v2/contract.md) | 无模型（该转移未建模，见[验证说明](../verification.md)）；提供者验收 |
| S15 | Run 处于 waiting 的空闲点、队首是合格用户文本：同一提交固定该批、记为 `supplement`、开该 Run 的下一个 Step，不建立 Run、不发行新 epoch；占位关系不变 | LC-04 行 3、LC-05、[RN-02](../../../capabilities/run/v2/contract.md) | 无模型；提供者验收与 [run-driver v3 场景](../../../capabilities/run-driver/v3/scenarios.md) |
| S16 | 调用结算到达被裁决为 continuation：裁决提交同批注销该 holder 在其发起 Run 上的等待登记；受理已完成而尚未裁决的窗口里登记仍开放，Run 仍在 waiting | LC-04 行 9、[RN-01](../../../capabilities/run/v2/contract.md) | [tools v2 模型](../../../capabilities/tools/verification.md)的按调用投影；提供者验收（受理未裁决窗口） |
| S17 | 被越过的 Run 进入 superseded 后，Session 的归档守卫不再被它阻止；归档同提交关闭未取批项与未消费 arrival | LC-05、LC-04 行 1 | 模型 `Lifecycles.cfg`（`Supersede` 之后 `Archive` 可行、S2 成立） |
