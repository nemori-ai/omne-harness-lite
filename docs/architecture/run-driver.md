# Run 驱动器与 Session Inbound

本页是 Agent Loop 的系统视图；选择依据见[提案](../proposals/agent-loop-inbound/README.md)
与 [D-012](../decisions/D-012-run-driver-and-inbound.md)，精确承诺归
[run-driver v1](../../spec/capabilities/run-driver/v1/contract.md)与
[session-run v2](../../spec/capabilities/session-run/v2/contract.md)。目标实现尚未开始；
DSH agent-loop 的[源基线](../proposals/core-capabilities/fork/loop-source.md)只按
[取舍表](../proposals/agent-loop-inbound/loop.md#对-dsh-agent-loop-源码的取舍)保留算法思想。

## 系统位置

```mermaid
flowchart LR
    U[用户输入 / 命令 / 控制] --> IN[Session Inbound<br/>受理 → 裁决 → queue / continuation / context / control]
    X[连接器、日程、跨会话、工具结算、人类答复、门恢复] --> IN
    IN -- queue --> Q[SR 队列：文本批 / 命令 / trigger]
    Q -- takeBatch / takeCommand / takeTrigger --> D[Run 驱动器<br/>decide(view) → intent]
    IN -- continuation --> D
    IN -- context 水位 --> D
    IN -- control --> D
    D --> M[模型执行]
    D --> T[工具执行 owner]
    D --> H[人类决定]
    M --> F[(已提交事实：Run / Step / attempt / 调用 / 请求 / arrival)]
    T --> F
    H --> F
    F --> D
    S[Session 级调度：无占位则开 Run，已 Yield 则重取] --> D
```

三层分工：事实层由各能力权威持有；驱动层只有 `decide`、节点拓扑与收口协议；
投影层是 runtime-context 快照与流式帧。驱动位置从事实 fold 得到，恢复时重算。

## 已确认的选择

- 一次 Run 恰有一个启动依据（连续文本批、有序命令或 trigger），运行中不接收新
  输入；用户中途插入走 `interrupt_then_run`。
- 异步到达统一受理成 arrival，由不依赖驱动器的 Session 级裁决者按裁决时刻的 Run
  状态判为四种意图之一并耐久记录；同一事实只有一条进入驱动器的路径；已终态
  Run 的晚到回调作为 trigger 开新 Run，人主动终止的 Run 不复活。
- 占位与 epoch 分离：等待与 stopping 都占位；退役只封闭 epoch，由调度重取；
  预算与 Run 级依赖缺失进入 `waiting_gate`，恢复事实返回原点重做准入。
- 停止、退役、失败共用收口协议；收束后才被批准的调用以 Run 级位置等待。
- 恢复是"重建位置后用同一个决策函数继续"，不重放执行；成立前提是发网前耐久
  dispatched 记录与工具 owner 的幂等接纳。

## Cordis 位置与效应

由 [D-013](../decisions/D-013-run-driver-cordis-boundary.md) 接受，正文见
[提案 cordis.md](../proposals/agent-loop-inbound/cordis.md)。驱动器是 Factory 为每个
活体实例准备并拥有的实例驱动，落在 [运行时共同边界](runtime-composition.md) 四类
接口之"谁准备和驱动实例"；`decide` 是纯函数，Session 级裁决者与调度者是 session-run
提供者的宿主级服务。

| 效应 | 所有者 | 撤除 | 保留 |
|---|---|---|---|
| Factory 贡献登记 | 驱动器包插件 | 关新激活准入 → 使用者退出 → 撤销登记 | 已发行实例按各自账目收口 |
| 实例驱动 | AR 预留后由 Factory 准备 | AR-12 复合退出：关准入 → Yield/收口 → 静止 → 释放 | Run/Step/调用/请求事实；Yield 保留占位 |
| 工作许可与 epoch | E0 联合准入 | `settle(work)`；Yield 只结算许可不结算 Run | Run 状态、接续、阻塞集合 |
| 驱动位置投影贡献 | 驱动器包 reducer | 撤回 reducer，不删事实 | fold 输入事实 |
| Inbound / 执行 owner 订阅 | 实例 Context effect | 取消订阅，不重判工作 | arrival 与 TL 事实 |

依赖变化不引入新的 Run 状态：实例存续必需绑定的变化走关实例/Yield/重取（换代
重取须通过 SR-14 兼容证据），操作必需条件的变化走 `waiting_gate`，调用级绑定沿
TL-06 结算，资格失效由实例关闭与重取门承担。提供者设计建议归
`packages/agent/run-driver`，服务键与注入等映射待 Session 与工具提供者设计后闭合。

## 证据与缺口

[RunDriver 有限模型](../../spec/capabilities/run-driver/verification.md)覆盖占位唯一、
接续不丢不双投、结算与接续同提交、恢复不重发、门等待返回等性质及四个否定
变体；它们是有限范围证据。尚未完成：任何提供者实现与崩溃窗口注入；
`gate_restored` 生产者义务（预算与依赖可用性提供者）；通知命名空间（U-5）；
PF-004 完整派发协议；多进程部署下旧 epoch 持有者的活性判定。
