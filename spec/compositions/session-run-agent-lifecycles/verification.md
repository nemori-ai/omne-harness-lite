# 生命周期组合 v1 的验证范围

形式工件位于 [v1/](v1/)：`Lifecycles.tla` 建模 Session、Run、Agent 实例三台状态机、
三条关系（附着、占位、执行者）与级联矩阵中的触发动作，`LifecyclesMC.tla` 提供对称集。
两个同域配置登记在 [formal-tasks.json](../../formal-tasks.json)，它们守的是首版的义务；
两个跨域配置只是"边界就绪"的证据，不是首版义务，与否定变体一样由
[提案证据目录](../../../docs/proposals/session-run-agent-lifecycles/evidence/model/results.json)
的 `replay.py` 在提供 JAVA_BIN 与 TLA2TOOLS_JAR 后重放（作者判断
[A-14](../../../docs/proposals/session-run-agent-lifecycles/README.md#作者裁决)：跨域内容现阶段
不进入提供者设计，也不占每次 spec-check 的时间）。常量 `SameDomain` 区分
"Session 与 Run 同一协调域"与"跨域（Run 域提交事实并留意图、Session 域按视图工作并
幂等消费）"，`FreshGate` 表示 Session 的门是否带 Run 域版本戳。

| 配置 | 规范映射 | 有限范围与结果（2026-09-14，8 核 4 worker） |
|---|---|---|
| Lifecycles.cfg（同域安全） | [LC-02/04/05](v1/contract.md)；提案 [S-2、A-1、A-3、L-1、L-2、L-3](../../../docs/proposals/session-run-agent-lifecycles/invariants.md)、[I-1、I-13、I-14](../../../docs/proposals/agent-loop-inbound/invariants.md)、NoDoubleCreate | 2 Run、2 实例、队列 2、接续 1、epoch ≤ 3、崩溃 ≤ 1；13.6 万状态、2.2 万不同状态、1 秒，通过 |
| LifecyclesProgress.cfg（同域进展） | LC-06/07；提案 LP-1（LP1a 开新 Run、LP1b 重取）、LP-2（归档后关空闲实例） | 1 Run、2 实例；强公平加在开 Run/重取，弱公平加在激活、关实例、释放；1.3 万状态、2 秒，通过 |
| LifecyclesSplit.cfg（跨域安全，门带版本戳；证据，不是形式任务） | LC-09；I-1、S-2、A-1、L-1、L-3、NoDoubleCreate 与动作性质 ClassifyFresh（裁决只发生在 Run 实际非终态时） | 2 Run、1 实例；1732 万状态、199 万不同状态、36 秒，通过 |
| LifecyclesSplitProgress.cfg（跨域进展；证据，不是形式任务） | LC-09；IntentsDrain（意图最终消费并撤回）、I14Eventually（终态后接续最终为空）、ClassifyFresh | 1 Run、1 实例；4 万状态、4 秒，通过 |
| 否定 LifecyclesSplitStale.cfg（门不带版本戳） | LC-09 的版本戳义务 | 预期 L3 反例：Session 按陈旧视图归档了刚由 create 意图建立的 Run；退出 12，符合预期 |

模型发现（已同步进契约）：对 interrupted 的 Run 做 cancel/force_stop 若经 stopping 会重新
占位并与新 Run 并存（I-1 反例），因此 [RN-03](../../capabilities/run/v1/contract.md) 规定直接进入
cancelled；跨域时归档必须关闭已取项而尚未建 Run 的 create 意图，否则意图永不消费
（IntentsDrain 反例），列入 LC-09。

刻意未覆盖：租户、帧、预算数值、多 Session、工具与人类决定的具体状态机（由 tools/HD
契约与 run-driver 模型承担）、live-agent 的 preparing/releasing 细分阶段（由 Runtime.tla
承担）、多进程活性判定、真实提供者的装卸与清理失败。跨域配置只能产出"跨域部署前
必须补的义务清单"，不能证明当前条款可分布。检查是有限状态证据，不是无界系统或真实
实现的证明；实现符合性按 [场景](v1/scenarios.md) 另行验收。
