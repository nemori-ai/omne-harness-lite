# run 的验证范围

当前版本是 [v2](v2/contract.md)；[v1](v1/contract.md) 的记录保留在本页末节，供已冻结版本
的复现使用。两版都没有自己目录下的形式模型：Run 的状态机、epoch、控制与等待由三处模型
分担——[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)
（`Lifecycles.tla`，状态机、占位与执行者关系、控制、崩溃、v2 新增的 `superseded` 终态与
interrupt_then_run 一步转移）、[run-driver 模型](../run-driver/verification.md)（`RunDriver.tla`，
驱动、等待、消费与结算）与 [tools 模型](../tools/verification.md)（`ToolCall.tla`，调用五维
状态机，其 `rel` / `Claimed` / `Route` 字段即等待登记簿的按调用投影）。Inbound 侧的对应见
[session 验证范围](../session/verification.md)。

## v2 条款 → 证据映射与未覆盖项

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [RN-01](v2/contract.md) Run 对象、状态集合与终态 | `Lifecycles.cfg`（TypeOK；I1：同 Session 至多一个占位 Run；`Supersede` 使 `superseded` 可达并受 I13/I14/S2 约束）；`RunDriver.cfg`（Run 状态与等待） | basis / `supplement` 的数据形状；`waitingFor` 投影；preparing 不在模型 |
| [RN-01](v2/contract.md) 等待登记簿：登记项、成员规则、两条事实与提交边界 | `ToolCall.tla` 的按调用投影（`Claimed(c)` = 有开放登记，`Route` 的 A 列 = holder 有开放登记且发起 Run 活动，`RunWait` = Step 收束后登记簿非空即 waiting） | **门（GateRef）不建模**；模型把结算与裁决相邻建模，**不区分受理未裁决的窗口**；"一个 holder 至多一条开放登记""非本 Run 对象登记被拒"是 Run 提供者的单测义务 |
| [RN-01](v2/contract.md) 占位由状态与终止受理记录派生 | `Lifecycles.cfg`（I1、L1、L3） | **由 interrupted 升级进入的不占位 stopping 未建模**（[LC v2 场景 S14](../../compositions/session-run-agent-lifecycles/v2/scenarios.md)，提供者验收） |
| [RN-02](v2/contract.md) 驱动前提与就绪接续词表 | `Lifecycles.cfg`（L1：旧 epoch 提交被拒；L3）；`RunDriver.cfg`（发网前耐久、恢复不重发）；`Inbound.cfg`（ScanBeforeDrive） | 业务资格的实际来源（TG 验收）；"`human` 调用的答复经调用结算到达"由 HD v2 与 tools v2 的条款验收 |
| [RN-02](v2/contract.md) 完成条件按登记簿陈述 | `ToolCall.tla`（`RunComplete` 只在无开放登记时可行；`RunWait` 与之互补） | "剩余后台责任已确认独立持有"的实际判定（提供者验收） |
| [RN-02](v2/contract.md) 不可恢复失败只结算未准入调用 | `ToolCall.tla`（`RunFail` 不关闭已准入调用与人类请求；`FailKeepsHuman`、`TerminalRunOnlyBackground`） | 失败原因分类与预算暴露 |
| [RN-02](v2/contract.md) `supplement` 批与开下一 Step 同提交 | 无模型 | 全部：由 [LC v2 场景 S15](../../compositions/session-run-agent-lifecycles/v2/scenarios.md)、run-driver v3 场景与提供者单测验收 |
| [RN-03](v2/contract.md) 控制请求、权限键与结果形状 | `Lifecycles.cfg`（`Interrupt` / `ForceStop` / `CancelInterrupted` 动作；对 interrupted 做 cancel 直达 cancelled 的规定来自本模型的 I1 反例）；[LC v2 场景 S08](../../compositions/session-run-agent-lifecycles/v2/scenarios.md) | `session.emergency_control` 与合法发起者（TG / 提供者验收）；`complete \| partial{unknown: K}` 的结果形状；stale_target / ended 的返回码 |
| [RN-03](v2/contract.md) 安全收口含 `unknown`、interrupted 保留登记簿 | `ToolCall.tla`（`StopProgressUnknown`：有派发意图后停止未知；interrupt 后登记保留、结算仍为 continuation） | "每个停止请求都有物理事实"的收口判定与无系统超时（提供者验收）；interrupted 上 force_stop 的升级路径未建模 |
| [RN-04](v2/contract.md) 复合打断与终态 `superseded` | `Lifecycles.cfg`（`Supersede`：一步入队新输入、旧 Run 进终态、`cont` 清零即 continuation 改判 context；随后 I13、I14、S2、I1 仍成立，`Archive` 可行）；`ToolCall.tla`（`RunInterruptThenRun`、`SupersedeReleasesPositions`、`SupersedeKeepsWork`） | 被保留工作清单的内容、`origin: system` 到达与"恰一次消费"（session v2 / run-driver v3 与提供者验收）；受理与收口之间的窗口（模型合成一步）；待批准调用的 cancelled_before_execution（tools v2 验收） |
| [RN-05](v2/contract.md) force_stop 受理、stopping 与隔离记录 | `Lifecycles.cfg`（`ForceStop`、`Isolated`、L1；[LC v2 场景 S03](../../compositions/session-run-agent-lifecycles/v2/scenarios.md)）；QueueControl（SafeRelease：静止确认前不释放） | 受理提交的整簿注销；按 `stop.capability` 分流与 `isolation: isolated \| unverified` 的记录（tools v2 与提供者验收） |
| [RN-06](v2/contract.md) 命令 Run 的终态映射 | QueueControl（CommandHasExecutionRight）；[run-driver 场景](../run-driver/verification.md) | unknown 保留占位可见；命令 Run 不消费工作清单、不取 `supplement`（提供者验收） |
| [RN-07](v2/contract.md) authoritative 事实与投影 | 无模型；提供者验收（[run 设计](../../../packages/session/run/design.md)、[projection](../../../packages/session/projection/design.md)） | 全部 |
| [RN-08](v2/contract.md) 恢复与兼容证据 | `Lifecycles.cfg`（Crash 后 L1/I1）；`RunDriver.cfg`（恢复不重发） | compat 三元组校验；basis / `supplement` 与 Step 切点重建；登记簿由事实前缀重算（均为提供者验收） |
| [RN-09](v2/contract.md) 终态与接续同提交、同批整簿注销 | `Lifecycles.cfg`（I14 覆盖 completed / cancelled / superseded 三条路径）；`Inbound.cfg`（NoStaleContinuation） | 整簿注销本身（登记簿不在生命周期模型内，由 `ToolCall.tla` 的 `SupersedeReleasesPositions` 按调用投影覆盖 superseded 一路） |

刻意未覆盖：多进程下旧 epoch 持有者的活性判定、预算数值、租户、真实提供者的装卸。
检查是有限状态证据，不是无界系统或真实实现的证明；实现符合性按
[生命周期组合场景](../../compositions/session-run-agent-lifecycles/v2/scenarios.md)、
[tools v2 场景](../tools/v2/scenarios.md)与 run-driver v3 场景另行验收。

## v1 的验证范围（保留）

v1 定义的 Run 状态机、epoch 与控制由两处模型分担：[run-driver v2 模型](../run-driver/verification.md)
（`RunDriver.tla` 六个配置）与[生命周期组合 v1 模型](../../compositions/session-run-agent-lifecycles/verification.md)
（`Lifecycles.tla` 的四个 v1 配置）。

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [RN-01](v1/contract.md) Run 对象、状态集合与终态 | Lifecycles.cfg（TypeOK、I1）；RunDriver.cfg（Run 状态与等待位置） | basis 三种来源的数据形状（提供者验收） |
| [RN-02](v1/contract.md) 驱动前提 | Lifecycles.cfg（L1、L3）；RunDriver.cfg（I-18、I-21）；Inbound.cfg（ScanBeforeDrive） | 业务资格的实际来源（TG 验收） |
| [RN-03](v1/contract.md) 控制请求与状态转移 | Lifecycles.cfg（interrupt / cancel / force_stop；对 interrupted 做 cancel/force_stop 直接 cancelled 的修正来自本模型的 I1 反例）；[v1 场景 S08](../../compositions/session-run-agent-lifecycles/v1/scenarios.md) | stale_target / ended 的返回码 |
| [RN-04](v1/contract.md) 复合打断对旧 Run 的处置 | v1 无已接受模型：v1 的 Lifecycles.cfg 不含 interrupt_then_run 动作（此前误记为证据，2026-09-15 更正）。该缺口由 v2 关闭：`superseded` 终态与 `Supersede` 一步转移进入 [v2 模型](../../compositions/session-run-agent-lifecycles/v2/Lifecycles.tla)，条款改写见 [RN-04 v2](v2/contract.md) | v1 正文"记录 interrupted、可 resume"与 v2 的终态 `superseded` 语义不同，v1 的这一条款没有模型证据 |
| [RN-05](v1/contract.md) force_stop 撤销 epoch、尽力停止 | Lifecycles.cfg（L1；[v1 场景 S03](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)）；QueueControl（SafeRelease） | 停止进度作为隔离证据（tools 设计） |
| [RN-06](v1/contract.md) 命令 Run 的终态映射 | QueueControl（CommandHasExecutionRight）；[run-driver v2 场景 S17](../run-driver/v2/scenarios.md) | unknown 保留占位可见 |
| [RN-07](v1/contract.md) authoritative 事实与投影 | 无模型；提供者验收 | 全部 |
| [RN-08](v1/contract.md) 恢复与兼容证据 | Lifecycles.cfg（Crash 后 L1/I1）；RunDriver.cfg（I-24）；[run-driver v2 场景 S13/S14](../run-driver/v2/scenarios.md) | compat 三元组校验 |
| [RN-09](v1/contract.md) 结算与接续同提交 | Lifecycles.cfg（I14）；Inbound.cfg（NoStaleContinuation）；RunDriver 否定变体 splitSettle；[run-driver v2 场景 S12](../run-driver/v2/scenarios.md) | — |

v1 刻意未覆盖的范围与 v2 相同：多进程下旧 epoch 持有者的活性判定
（[A-14](../../../docs/proposals/session-run-agent-lifecycles/README.md#作者裁决)）、预算数值、
租户、真实提供者的装卸。
