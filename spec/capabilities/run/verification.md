# run v1 的验证范围

[run v1](v1/contract.md) 没有自己目录下的形式模型；它定义的 Run 状态机、epoch 与
控制由两处模型分担：[run-driver v2 模型](../run-driver/verification.md)（`RunDriver.tla`
六个配置，建模驱动、等待位置、消费与结算）与
[生命周期组合模型](../../compositions/session-run-agent-lifecycles/verification.md)
（`Lifecycles.tla`，建模状态机、占位与执行者关系、控制与崩溃）。Inbound 侧的对应见
[session 验证范围](../session/verification.md)。

| 条款 | 证据 | 未覆盖部分 |
|---|---|---|
| [RN-01](v1/contract.md) Run 对象、状态集合与终态 | Lifecycles.cfg（TypeOK、I1：同 Session 至多一个占位 Run）；RunDriver.cfg（Run 状态与等待位置） | basis 三种来源的数据形状（提供者验收） |
| [RN-02](v1/contract.md) 驱动前提：有效 epoch、工作许可、资格、无未裁决 arrival | Lifecycles.cfg（L1：旧 epoch 提交被拒，L3）；RunDriver.cfg（I-18：发网前耐久、I-21）；Inbound.cfg（ScanBeforeDrive） | 业务资格的实际来源（TG 验收） |
| [RN-03](v1/contract.md) 控制请求与状态转移 | Lifecycles.cfg（interrupt / cancel / force_stop 动作；对 interrupted 做 cancel/force_stop 直接 cancelled 的修正来自本模型的 I1 反例）；[场景 S08](../../compositions/session-run-agent-lifecycles/v1/scenarios.md) | stale_target / ended 的返回码 |
| [RN-04](v1/contract.md) 复合打断对旧 Run 的处置 | Lifecycles.cfg（LC-04 行 8）；[run-driver 场景 S16](../run-driver/v2/scenarios.md) | 待批准调用 cancelled_before_execution（tools 契约验收） |
| [RN-05](v1/contract.md) force_stop 撤销 epoch、尽力停止 | Lifecycles.cfg（L1；[场景 S03](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)）；QueueControl（SafeRelease：静止确认前不释放） | 停止进度作为隔离证据（tools 设计） |
| [RN-06](v1/contract.md) 命令 Run 的终态映射 | QueueControl（CommandHasExecutionRight）；[场景 S17](../run-driver/v2/scenarios.md) | unknown 保留占位可见 |
| [RN-07](v1/contract.md) authoritative 事实与投影 | 无模型；提供者验收（[run 设计](../../../packages/session/run/design.md)、[projection](../../../packages/session/projection/design.md)） | 全部 |
| [RN-08](v1/contract.md) 恢复与兼容证据 | Lifecycles.cfg（Crash 后 L1/I1）；RunDriver.cfg（I-24：恢复不重发）；[场景 S13/S14](../run-driver/v2/scenarios.md) | compat 三元组校验（run-driver 设计） |
| [RN-09](v1/contract.md) 结算与接续同提交 | Lifecycles.cfg（I14）；Inbound.cfg（NoStaleContinuation）；RunDriver 否定变体 splitSettle；[场景 S12](../run-driver/v2/scenarios.md) | — |

刻意未覆盖：多进程下旧 epoch 持有者的活性判定（[A-14](../../../docs/proposals/session-run-agent-lifecycles/README.md#作者裁决)）、
预算数值、租户、真实提供者的装卸。检查是有限状态证据，不是无界系统或真实实现的
证明；实现符合性按 [生命周期组合场景](../../compositions/session-run-agent-lifecycles/v1/scenarios.md)
与 [run-driver v2 场景](../run-driver/v2/scenarios.md) 另行验收。
