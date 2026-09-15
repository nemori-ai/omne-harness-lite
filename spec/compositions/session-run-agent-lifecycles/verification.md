# 生命周期组合的验证范围

当前版本是 [v2](v2/contract.md)；[v1](v1/contract.md) 的记录保留在本页末节，供已冻结版本
的复现使用。两版的形式工件各自位于其版本目录，`Lifecycles.tla` 建模 Session、Run、
Agent 实例三台状态机、三条关系（附着、占位、执行者）与级联矩阵中的触发动作，
`LifecyclesMC.tla` 提供对称集。常量 `SameDomain` 区分"Session 与 Run 同一协调域"与
"跨域（Run 域提交事实并留意图、Session 域按视图工作并幂等消费）"，`FreshGate` 表示
Session 的门是否带 Run 域版本戳。

## v2 的模型改动

v2 在 v1 模型上改动 23 行（`diff` 计数）：

- `Terminal` 加 `superseded`，使被新输入越过的 Run 成为终态——归档守卫、I13、I14、L3
  随之覆盖它，不需要为它加特例。
- 新动作 `Supersede(r)`：把 [LC-04 行 8](v2/contract.md) 的受理与行 4 的收口合成**一步**
  转移——新输入耐久入队、旧 Run 由 running/waiting 直接进入 `superseded`、释放执行者与
  epoch、`cont[r]` 清零。清零表示"未消费 continuation 改判为 context"：context 不进队列、
  不创建 Run、不唤醒等待中的 Run，因而在模型里表现为既不转 trigger 也不保留。
  该动作要求 `SameDomain`，跨域的意图形态未建模。
- `Placeholding` 处加注：模型中的 `stopping` 只由活动 Run 的终止受理进入，因此占位；
  [RN-03](../../capabilities/run/v2/contract.md) 允许的"interrupted 升级进入的不占位
  stopping"未建模。

`Supersede` 的可达性单独核过：把 `Lifecycles.cfg` 的不变量临时换成
`NoSupersede == \A r \in Runs : run[r] /= "superseded"` 后 TLC 报出反例
（`run = (r1 :> "superseded" @@ r2 :> "none")`），说明新终态确实被探索到，不是死代码；
该临时工件只在工作树 `tmp/` 中，不进版本目录。

## v2 配置与结果

四个配置全部通过（2026-09-15，8 核、`-workers 4`、`-Xmx4g`，与 v1 同一 JDK 与
`tla2tools.jar`）。与 v1 的对照说明改动的实际影响：同域两配置的状态数因新动作增加，
跨域两配置的状态数与 v1 **逐位相同**，即 v2 的改动没有触及跨域行为。

| 配置 | 规范映射 | 有限范围与结果 | v1 对照 |
|---|---|---|---|
| Lifecycles.cfg（同域安全） | [LC-02/04/05](v2/contract.md)；S-2、A-1、A-3、L-1、L-3（提案性质编号，对应 .cfg 的 S2/A1/A3/L1/L3）、[I-1、I-13、I-14](../../../docs/decisions/D-012-run-driver-and-inbound.md)、NoDoubleCreate | 2 Run、2 实例、队列 2、接续 1、epoch ≤ 3、崩溃 ≤ 1；179,563 状态、28,788 不同状态、深度 25、2 秒，通过 | v1 135,931 / 22,452 |
| LifecyclesProgress.cfg（同域进展） | LC-06/07；LP1a（开新 Run）、LP1b（重取）、LP2（归档后关空闲实例） | 1 Run、2 实例；14,053 状态、2,652 不同状态、深度 16、2 秒，通过 | v1 12,577 / 2,412 |
| LifecyclesSplit.cfg（跨域安全，门带版本戳；证据，不是形式任务） | LC-09；I-1、S-2、A-1、L-1、L-3、NoDoubleCreate 与动作性质 ClassifyFresh | 2 Run、1 实例；17,319,045 状态、1,989,480 不同状态、深度 33、63 秒，通过 | v1 17,319,045 / 1,989,480（相同） |
| LifecyclesSplitProgress.cfg（跨域进展；证据，不是形式任务） | LC-09；IntentsDrain、I14Eventually、ClassifyFresh | 1 Run、1 实例；39,671 状态、6,576 不同状态、深度 17、5 秒，通过 | v1 39,671 / 6,576（相同） |

否定变体 `LifecyclesSplitStale.cfg`（门不带版本戳，预期 L3 反例、退出 12）留在
[提案证据目录](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/results.json)，
本版未对 v2 重跑：它只检验跨域版本戳义务，而上表已显示 v2 的跨域状态空间与 v1 相同。

## v2 条款 → 证据映射与未覆盖项

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| LC-01 三台状态机与状态集合 | `Lifecycles.cfg`（TypeOK 覆盖含 `superseded` 的九值中的建模子集） | 模型不含 preparing 与实例的 releasing/disposed 细分；`waitingFor` 投影不在模型内 |
| LC-02 三条关系与占位唯一 | `Lifecycles.cfg`、`LifecyclesSplit.cfg`（I1、L1、L3、A1、A3） | **由 interrupted 升级进入的不占位 stopping 未建模**（[场景 S14](v2/scenarios.md)，提供者验收）；附着的 revoked/releasing 细分不在模型 |
| LC-04 行 1 归档 | `Lifecycles.cfg`（S2、L3；`Supersede` 之后 `Archive` 可行，即 superseded 不再阻止归档，[场景 S17](v2/scenarios.md)） | 队列项与 arrival 的具体关闭原因词表（session 契约验收） |
| LC-04 行 2 Session 级 force_stop | `Lifecycles.cfg`（`SessionForceStop`、L1） | 受理提交里的整簿注销（登记簿不在模型内） |
| LC-04 行 3 取批 / 取命令 / 取 trigger | `Lifecycles.cfg`、`LifecyclesProgress.cfg`（`CreateRun`、LP1a） | **"取入既有 Run"的第二种形态未建模**（[场景 S15](v2/scenarios.md)，提供者验收与 run-driver v3 场景） |
| LC-04 行 4 终态与接续处理 | `Lifecycles.cfg`（I13、I14 覆盖 completed / cancelled / superseded 三条路径；`Supersede` 的 `cont` 清零即"改判 context"） | failed 未单独建模（与 completed 同形）；被保留工作清单的内容、恰一次消费与 `origin: system` 到达不在模型 |
| LC-04 行 5 force_stop / cancel | `Lifecycles.cfg`（`ForceStop`、`Isolated`、`CancelInterrupted`） | 整簿注销；`stop.capability` 分流与 `isolation: isolated \| unverified`（run v2 RN-05，提供者验收） |
| LC-04 行 6 interrupt | `Lifecycles.cfg`（`Interrupt`：释放执行者、封闭 epoch、接续保留） | 收口条件中的 `unknown` 计入；登记簿保留 |
| LC-04 行 7 Yield | `Lifecycles.cfg`、`LifecyclesProgress.cfg`（`Yield`、LP1b） | 登记簿不变（不在模型内） |
| LC-04 行 8 interrupt_then_run 受理 | `Lifecycles.cfg`（`Supersede` 把受理与收口合成一步） | 受理与收口之间的窗口（模型不区分两次提交）；复合意图记录与 `partial{unknown: K}` |
| LC-04 行 9 Inbound 裁决 | `Lifecycles.cfg`（`Classify` 的守卫 + I13；跨域为 `ClassifyFresh`） | **"裁决为 continuation 与登记注销同批"未建模**：登记簿的按调用投影由 [tools v2 模型](../../capabilities/tools/verification.md)承担，本模型只有接续计数 |
| LC-05 守卫与派生 | `Lifecycles.cfg`（Archive 门读 Run 状态、CreateRun 门读占位、Crash 后由执行者为空派生重取） | 资格失效、写入权丢失、撤销屏障均不在模型 |
| LC-06 广播与提交后反应 | `LifecyclesProgress.cfg`（LP1a/LP1b/LP2 表达"最终会反应"） | 幂等、异常容纳、delivery 状态报告 |
| LC-07 Yield 与重取 | `LifecyclesProgress.cfg`（LP1b）、`Lifecycles.cfg`（`Reacquire`） | 恢复兼容证据（run v2 RN-08） |
| LC-08 崩溃与恢复 | `Lifecycles.cfg`（`Crash` 后 L1/I1） | 裁决扫描先于重取的硬顺序（提供者验收） |
| LC-09 跨域义务 | `LifecyclesSplit.cfg`、`LifecyclesSplitProgress.cfg` 与 v1 的否定变体 | 等待登记跨域退化为 CC-05 意图的新义务未建模 |

模型发现（已同步进契约）：对 interrupted 的 Run 做 cancel/force_stop 若经 stopping 会重新
占位并与新 Run 并存（I-1 反例），[RN-03](../../capabilities/run/v2/contract.md) 因此规定 cancel
直达 cancelled，并规定 force_stop 的升级路径进入的 stopping 不重新占位；跨域时归档必须
关闭已取项而尚未建 Run 的 create 意图，否则意图永不消费（IntentsDrain 反例），列入 LC-09。

刻意未覆盖：租户、帧、预算数值、多 Session、等待登记簿本身的成员规则与事实、工具与
人类决定的具体状态机（由 [tools v2](../../capabilities/tools/verification.md) 与
[run-driver v3](../../capabilities/run-driver/verification.md) 承担）、live-agent 的
preparing/releasing 细分阶段（由 Runtime.tla 承担）、多进程活性判定、真实提供者的装卸与
清理失败。跨域配置只能产出"跨域部署前必须补的义务清单"，不能证明当前条款可分布。
检查是有限状态证据，不是无界系统或真实实现的证明；实现符合性按
[场景](v2/scenarios.md) 另行验收。

## v1 的验证范围（保留）

v1 的两个同域配置曾登记在 [formal-tasks.json](../../formal-tasks.json)，守的是首版的义务；
两个跨域配置只是"边界就绪"的证据，与否定变体一样由
[提案证据目录](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/results.json)
的 `replay.py` 在提供 JAVA_BIN 与 TLA2TOOLS_JAR 后重放（作者判断
[A-14](../../../docs/proposals/session-run-agent-lifecycles/README.md#作者裁决)：跨域内容现阶段
不进入提供者设计，也不占每次 spec-check 的时间）。

| 配置 | 规范映射 | 有限范围与结果（2026-09-14，8 核 4 worker） |
|---|---|---|
| Lifecycles.cfg（同域安全） | [LC-02/04/05](v1/contract.md)；提案 [S-2、A-1、A-3、L-1、L-2、L-3](../../../docs/proposals/session-run-agent-lifecycles/invariants.md)、[I-1、I-13、I-14](../../../docs/proposals/agent-loop-inbound/invariants.md)、NoDoubleCreate | 2 Run、2 实例、队列 2、接续 1、epoch ≤ 3、崩溃 ≤ 1；13.6 万状态、2.2 万不同状态、1 秒，通过 |
| LifecyclesProgress.cfg（同域进展） | LC-06/07；提案 LP-1（LP1a 开新 Run、LP1b 重取）、LP-2（归档后关空闲实例） | 1 Run、2 实例；强公平加在开 Run/重取，弱公平加在激活、关实例、释放；1.3 万状态、2 秒，通过 |
| LifecyclesSplit.cfg（跨域安全，门带版本戳） | LC-09；I-1、S-2、A-1、L-1、L-3、NoDoubleCreate 与动作性质 ClassifyFresh | 2 Run、1 实例；1732 万状态、199 万不同状态、36 秒，通过 |
| LifecyclesSplitProgress.cfg（跨域进展） | LC-09；IntentsDrain、I14Eventually、ClassifyFresh | 1 Run、1 实例；4 万状态、4 秒，通过 |
| 否定 LifecyclesSplitStale.cfg（门不带版本戳） | LC-09 的版本戳义务 | 预期 L3 反例：Session 按陈旧视图归档了刚由 create 意图建立的 Run；退出 12，符合预期 |

v1 的条款覆盖与刻意未覆盖项与 v2 相同，差别只在 v1 没有 `superseded` 终态与
`Supersede` 动作：v1 的 `RN-04`（复合打断）在 v1 模型中没有对应动作，这一点已在
[run v1 验证范围](../../capabilities/run/verification.md)中记录。
