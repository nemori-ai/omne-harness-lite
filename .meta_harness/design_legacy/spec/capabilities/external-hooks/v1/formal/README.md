# Hooks 与 Run 控制的有限联合模型

[JointHooksRunControl.tla](JointHooksRunControl.tla) 是现有条款的验证抽象，
不定义独立组合契约，不提升 candidate 坐标的接受/发布状态。持续消费者是 Hooks
提供者、RunDriver/Session 准入实现及 J 联合验证。依据为
[D-018](../../../../../decisions/e-message-stream-hooks/decision.md) 的 HK-07/15/16
设计方向及未被取代的既有保证；D-020 只固定相关设计基线，不贡献新的 Hooks 权力。

## 条款、动作与性质

| 消费条款 | 模型与安全性质 | 边界 |
|---|---|---|
| [HK-16/17](../contract.md)、SE-06/15、RN-05 | `Observe/Take`：两个 handler、同一已完成来源 Run、固定 cap=1；completion 在入队前；take、slot、Run start 原子；`count <= 1`、completion 唯一、强停屏障禁止 take | 两个 worker 的交错归约为原子提交次序；不证明提交实现 |
| HK-15、AU-04/06、HD-05/06、RD-09/11/13 | `Prepare/Timeout/Approve/HumanApprove/Admit`：超时一次、保留 ask/deny、批准与撤权/取消/强停竞态；`calls <= 1`、`admissionSafe`、`decisionSafe` | 单 Action；授权资格合并为当前布尔屏障；HD 准确身份绑定作为前提 |
| HK-07、RD-06/17 | `Evaluate/CommitInput`：pass 的实际 take 才投影 context；close、arrival close、completion 审计同提交；`arrivalClosed => audit /\ ~stepContext /\ ~taken` | 单 text 项及已聚合 context；不验证多 handler 串行合并 |
| RN-03/05、RD-13 | `Cancel/Force/Evidence/ForceFinish`：cancel 无复活动作；force 先 stopping，再接受可信隔离证据；`terminalSafe`、`startSafe` | 一项 exposure；精确 identity/generation/fence 校验被抽象为 verified |

`Safety` 是上述合取，三个 `*-none.cfg` 同时检查它与 `Progress`。
十个其余配置只开启一个缺陷开关，必须实际产生安全反例；对应关系及原始运行在
[证据入口](../../../../../evidence/formal-2026-09-16/j-hooks-control/README.md)。

## 抽象、进展与未覆盖义务

- 三个 Case 分别限定 Stop/control、工具门/control、输入上下文。没有把它们的局部
  状态空间乘积误称端到端执行；共用控制动作把真实竞态放在 Stop、gate 各自分支。
- Stop `Observe` 始终对应初始那个已经 completed 的来源 Run；`s.run` 是后续
  continuation Run 的运行位置，取消它不会取消来源 Run 的耐久完成事实。
  `done` 是来源 Run/handler 去重集合；重复通知和恢复重读为 stutter，未建立第二次执行。
  两个 handler 都可在首次 take 前排队。计数只由 start 增加，配置漂移不改固定 cap。
- 模型只检查一个连续段；普通 Run 重置计数、多轮续跑、跨 tenant、预算、真实恢复 fold、
  failed/superseded/cancelled 来源的事件过滤、reasonCode、presentation 投影不在覆盖内。
- `currentAuth` 代表原 Action 所需的全部当前资格；已准入后撤权不回滚效果。
  `Admit` 是已准备工具门的准入/拒绝终点；ask 等批准，或者被撤权/取消收口。
  `HumanApprove` 假定合法人工答复，`Approve` 是 standard 模式程序化答复。
  两者都不产生持久 grant。错误/超时在此归为同一无贡献路径，不模拟计时器。
- `ProgressSpec` 使用 Next 弱公平，并对隔离证据、强停完成和每项 Take 加弱公平。
  这要求环境最终响应合法人工请求或撤权/取消，并最终提供可信静止/隔离证据；
  永久失联、永不回答与永远 unverified 不具有此进展结论。安全检查不需要这些响应前提。
  Stop 进展仅表示这两个来源通知已处理且队列排空，不保证一定启动续跑。
- `Evidence` 假定实际 RN-05 所要求的精确强隔离或 quiescent 身份绑定已验证；
  unknown 本身不能解锁。取消不宣称物理效果回滚。外部执行隔离、CC 原子性、DR 耐久性、
  全状态机 refinement 与 provider 符合性仍须独立证明/验证；有限 TLC 不替代它们。

本目录资源未写入 catalog/frozen/formal-tasks；登记与发布由集成拥有者处理。
