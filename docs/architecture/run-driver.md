# Run 驱动器与 Session Inbound

本页是 Agent Loop 的系统视图；选择依据见[提案](../proposals/agent-loop-inbound/README.md)、
[工具执行提案](../proposals/tool-execution/README.md)与 [D-012](../decisions/D-012-run-driver-and-inbound.md)，
精确承诺归 [run-driver v3](../../spec/capabilities/run-driver/v3/contract.md)
（[D-014](../decisions/D-014-session-run-agent-lifecycles.md) 的 v2 只改引用；
[D-015](../decisions/D-015-tool-execution-message-stream-and-hooks.md) 的 v3 改 Step 收束与合批规则、
切点来源、占位与迟到结果、Yield 判据与受理后守卫；依赖 [session v2](../../spec/capabilities/session/v2/contract.md)、
[run v2](../../spec/capabilities/run/v2/contract.md) 与
[生命周期组合 v2](../../spec/compositions/session-run-agent-lifecycles/v2/contract.md)）。
Session 与 Run 的系统视图分别见 [Session](session.md) 与 [Run](run.md)。目标实现尚未开始；
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
  预算与 Run 级依赖缺失是登记簿里的门登记，恢复事实返回原点重做准入。
- Step 在 attempt 结算且提议登记后就收束；"结果一起回"是开下一 Step 的合批规则：每个 tool_use
  在切点恰得一个 `tool_result` 或 `deferred_receipt`，缺省等本批前台登记注销，只在审批就绪、
  门恢复、队首合格文本时提前开；迟到结果以 `system_reminder` 引用已耐久的结果进入到达的 Step。
- 切点来源封闭：就绪接续、占位、取入的用户批、被越过 Run 的工作清单、hooks 注入的上下文、
  迟到结果与人类答复；Yield 按登记簿判定，等审批与门不阻止。
- 停止、退役、失败共用收口协议，停止未知计入收口；失败不处置已准入的调用。
- 恢复是"重建位置后用同一个决策函数继续"，不重放执行；成立前提是发网前耐久
  dispatched 记录与工具 owner 的幂等接纳。

## Cordis 位置与效应

由 [D-013](../decisions/D-013-run-driver-cordis-boundary.md) 接受，正文见
[提案 cordis.md](../proposals/agent-loop-inbound/cordis.md)。驱动器是 Factory 为每个
活体实例准备并拥有的实例驱动，落在 [运行时共同边界](runtime-composition.md) 四类
接口之"谁准备和驱动实例"；`decide` 是纯函数，Session 级裁决者与调度者是 Session 包内
不随实例生灭的独立插件（D-014 后的插件划分见 [Session 视图](session.md#cordis-位置)）。

| 效应 | 所有者 | 撤除 | 保留 |
|---|---|---|---|
| Factory 贡献登记 | 驱动器包插件 | 关新激活准入 → 使用者退出 → 撤销登记 | 已发行实例按各自账目收口 |
| 实例驱动 | AR 预留后由 Factory 准备 | AR-12 复合退出：关准入 → Yield/收口 → 静止 → 释放 | Run/Step/调用/请求事实；Yield 保留占位 |
| 工作许可与 epoch | E0 联合准入 | `settle(work)`；Yield 只结算许可不结算 Run | Run 状态、接续、阻塞集合 |
| 驱动位置投影贡献 | 驱动器包 reducer | 撤回 reducer，不删事实 | fold 输入事实 |
| Inbound / 执行 owner 订阅 | 实例 Context effect | 取消订阅，不重判工作 | arrival 与 TL 事实 |

依赖变化不引入新的 Run 状态：实例存续必需绑定的变化走关实例/Yield/重取（换代
重取须通过 [RN-08](../../spec/capabilities/run/v2/contract.md) 兼容证据），操作必需条件的
变化走门登记，调用级绑定沿 [TL-06](../../spec/capabilities/tools/v2/contract.md) 结算，
资格失效由实例关闭与重取门承担。提供者设计归
[run-driver 包](../../packages/agent/run-driver/design.md)；对 Session/Run 侧的服务键
（`omneSession`、`omneRun`、`omneLifecycleCompositions`）与订阅接口（`records/committed`
广播加各读面）已由 D-014 闭合，工具侧映射见[工具执行视图](tool-execution.md)，随 tools
提供者设计按 v2 重写。

## 证据与缺口

[RunDriver 有限模型](../../spec/capabilities/run-driver/verification.md)覆盖占位唯一、
接续不丢不双投、结算与接续同提交、恢复不重发、门等待返回等性质及四个否定
变体；它们是有限范围证据，v3 对模型的处置见[验证范围](../../spec/capabilities/run-driver/verification.md)。
尚未完成：任何提供者实现与崩溃窗口注入；`gate_restored` 生产者义务（预算与依赖可用性
提供者）；PF-004 完整派发协议；多进程部署下旧 epoch 持有者的活性判定。通知命名空间已由
[消息流视图](message-stream.md)闭合。
