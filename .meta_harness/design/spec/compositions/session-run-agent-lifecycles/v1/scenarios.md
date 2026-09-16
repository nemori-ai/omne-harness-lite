# Session、Run 与 Agent 实例生命周期组合场景

每个场景标注它对应的契约（legacy source: `contract.md`）条款（LC-04 的行号即该表的行），以及证据来源：
模型（Lifecycles.tla（legacy source: `Lifecycles.tla`） 的配置）或提供者验收。S01～S12 沿 v1 的编号与含义，
S05 / S08 随 `superseded` 与升级路径改写；S13～S17 是本版新增。

| 编号 | 场景 | 条款 / 行 | 证据 |
|---|---|---|---|
| S01 | 用户对有活动 Run 的 Session 点归档，返回 busy；Run 完成后再归档，未取批项与未消费 arrival 同提交关闭 | LC-04 行 1、LC-05 | 模型 `Lifecycles.cfg`（I1、S2）；提供者验收 |
| S02 | 归档后，空闲实例被宿主关闭并释放附着；Session 恢复 open 后需要新实例 | LC-06 | 模型 `LifecyclesProgress.cfg`（LP2） |
| S03 | Session 级 force_stop：hold、Run stopping、epoch 撤销、整簿注销同提交；旧实例的迟到提交被拒绝 | LC-04 行 2、LC-05、RN-05（legacy source: `../../../capabilities/run/v2/contract.md`） | 模型（L1）；提供者验收（整簿注销） |
| S04 | 队列有项、无占位、有 ready 实例：调度者开新 Run，取项、建 Run、epoch 同提交 | LC-04 行 3、LC-06 | 模型 `LifecyclesProgress.cfg`（LP1a） |
| S05 | Run 完成时指向它的未消费接续转为 trigger 项；cancelled 时关闭；superseded 时改判为 context，不转 trigger、不唤醒 | LC-04 行 4 | 模型（I14：三种终态后均无未消费接续）；提供者验收（改判 context 与转 trigger 的区别） |
| S06 | 实例计划退役而 Run 运行中：驱动器 Yield，Run 状态、等待登记簿与占位不变，实例静止后释放；调度者随后重取 | LC-04 行 7、LC-07 | 模型（L1、LP1b）；提供者验收（登记簿不变） |
| S07 | 进程崩溃：先校验完整耐久前缀并 fold Session/Run/等待视图，再裁决全部 accepted arrivals；之后核实在途 owner 与兼容/资格，最终联合准入才发行新 epoch、取得许可并重取 | LC-08、SE-11、RN-08、RD-04 | 模型 `Reacquire` 的扫描屏障仅部分覆盖；完整恢复顺序由提供者验收 |
| S08 | 对 interrupted Run 做 cancel 可直接 cancelled。force_stop 只有在所有调用已结算或已有 quiescent/强隔离证据时直达 cancelled；任何 isolation unknown/unverified 都进入不占位的 stopping 并等待 RN-05 终态门，不与新 Run 争占位 | LC-04 行 5、LC-02、RN-03/05 | 模型只覆盖 cancel 直达；force_stop 证据门由提供者验收 |
| S09 | Run 等待人类答复且实例空闲：资源政策回收实例；答复到达后调度者重取 | LC-06、LC-07 | 提供者验收 |
| S10 | 资格失效：新准入被拒，进行中的 Run 到安全边界 Yield，实例关闭；资格恢复后重取门放行 | LC-05 | 提供者验收 |
| S11 | 跨域（未来）：Session 门带版本戳时裁决只发生在 Run 实际非终态；不带则按陈旧视图归档正在运行的 Run | LC-09 | 模型 `LifecyclesSplit.cfg`（ClassifyFresh、L3）与否定变体 |
| S12 | 跨域（未来）：create/settle 意图幂等消费并撤回；终态后接续最终为空 | LC-09 | 模型 `LifecyclesSplitProgress.cfg`（IntentsDrain、I14Eventually） |
| S13 | interrupt_then_run：新输入耐久入队并受理终止意图（行 8）；收口后旧 Run 一步进入终态 superseded，同一提交整簿注销、未消费接续改判 context、被保留工作清单作 `source: system` 的 context 到达受理（行 4）；新 Run 随后照常开 | LC-04 行 4/8、RN-04（legacy source: `../../../capabilities/run/v2/contract.md`） | 模型 `Lifecycles.cfg`（`Supersede` 动作后的 I1、I13、I14、S2）；提供者验收（工作清单内容与恰一次消费） |
| S14 | force_stop 遇物理结果 unknown：没有强隔离证据时 Run 保持 stopping；活动 Run 的 stopping 保留占位并阻止后续驱动。只有绑定 call/attempt、scope、epoch、generation 与 fence revision 的强隔离证据才允许 cancelled(force_stopped)；效果结局仍未知时结果可为 partial。interrupted 升级的 stopping 不重新占位，但同样不能无证据终态 | LC-02、LC-04 行 5、RN-03/05 | 生命周期模型的 `Isolated` 只表示证据已成立；unverified 分支未建模并由提供者验收 |
| S15 | Run 处于 waiting 的空闲点、队首是合格用户文本：同一提交固定该批、记为 `supplement`、开该 Run 的下一个 Step，不建立 Run、不发行新 epoch；占位关系不变 | LC-04 行 3、LC-05、RN-02（legacy source: `../../../capabilities/run/v2/contract.md`） | 无模型；提供者验收与 run-driver v3 场景（legacy source: `../../../capabilities/run-driver/v3/scenarios.md`） |
| S16 | 三种 readiness 分开：call settlement 裁决为 continuation 时同批释放 call 登记；gate restored 同批释放 gate 登记；system approval 只标记 approval-ready，消费/start 后 call 登记仍开放直到真实 settlement；provisional readiness 同样不释放 | LC-04 行 9、SE-13/14、RN-01、HD-06 | provider 联合提交验收；ToolCall/RunDriver 模型只覆盖其中的有限 call/gate 投影 |
| S17 | 被越过的 Run 进入 superseded 后，Session 的归档守卫不再被它阻止；归档同提交关闭未取批项与未消费 arrival | LC-05、LC-04 行 1 | 模型 `Lifecycles.cfg`（`Supersede` 之后 `Archive` 可行、S2 成立） |
