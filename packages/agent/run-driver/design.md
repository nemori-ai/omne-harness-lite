# Run 驱动器提供者设计

状态：目标设计，尚无源码。语义归 [run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md)；
运行位置与责任归 [D-013](../../../docs/decisions/D-013-run-driver-cordis-boundary.md) 接受的
[提案 cordis.md](../../../docs/proposals/agent-loop-inbound/cordis.md)；对 Session/Run 侧的
服务键、订阅接口、stateKey、driverKey 与兼容性声明由
[D-014](../../../docs/decisions/D-014-session-run-agent-lifecycles.md) 闭合（本页固定），
这些正是 [D-013 §7](../../../docs/proposals/agent-loop-inbound/cordis.md#7-提供者设计归属与实施入口)
留下的映射缺口；工具侧的读面形状仍待工具提供者设计。消费的契约：
[run v1](../../../spec/capabilities/run/v1/contract.md)、[session v1](../../../spec/capabilities/session/v1/contract.md)、
[生命周期组合 LC v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)、
[live-agent v1](../../../spec/capabilities/live-agent/v1/contract.md)、
[CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md)、
[CC v2](../../../spec/compositions/core-work-coordination/v2/contract.md)、
[tools v1](../../../spec/capabilities/tools/v1/contract.md)、
[human-decisions v1](../../../spec/capabilities/human-decisions/v1/contract.md)、
[model-execution v1](../../../spec/capabilities/model-execution/v1/contract.md)。

## Host 与服务

候选默认入口 `@omne-harness-lite/run-driver` 拥有 `RunDriverFactoryPlugin`、纯函数
`decide`、节点拓扑、驱动位置 reducer 与兼容性声明类型。插件不提供业务服务：它把
Factory 贡献登记到 `agents`（AR 的 `registerFactory`，[AR-8](../../../spec/capabilities/live-agent/v1/contract.md)），
并把 reducer 登记到 `omneSession` 的状态贡献面。required inject：`agents`、`omneRun`、
`omneSession`、`omneLifecycleCompositions`、`omneAdmission`、`omneRecords`（只读）、
`omneTools`、`omneHumanDecisions`、`omneBudget`、`omneAuthorization`、`omneDiagnostics`。
它不 inject `omneSessionScheduler` 与 `omneInboundAdjudicator`：驱动器被调度者交付 Run，
不反向调用调度。

| 约定 | 值 | 依据 |
|---|---|---|
| Factory driverKey / version | `omne.run-driver` / `1` | [D-013 §7](../../../docs/proposals/agent-loop-inbound/cordis.md#7-提供者设计归属与实施入口) 的缺口；写入 `epoch_issued.driverBinding` |
| 投影 stateKey | `run.driver_position`，`kind: projection`，输入 run 流事件 | [RN-07](../../../spec/capabilities/run/v1/contract.md)、[SE-10](../../../spec/capabilities/session/v1/contract.md) |
| 订阅接口 | `records/committed` 广播（DR-01 envelope，按租户与 Session 作用域过滤）加 `omneRun.readRun`、`omneSession` 的 Inbound 读面、TL/HD/MC 的非结算读面 | [LC-06](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)、[RD-02](../../../spec/capabilities/run-driver/v2/contract.md) |
| 提交面 | 单 owner 提交直接用 `omneRun.prepare*`；跨 owner 提交用 `omneLifecycleCompositions` 或 TL/HD/MC 的具名组合 | [RD-03](../../../spec/capabilities/run-driver/v2/contract.md)、[CC-01](../../../spec/compositions/core-work-coordination/v2/contract.md) |

## 实例驱动的生命周期

Factory 为每个活体实例准备一个实例驱动（D-013 消费方式），在实例 Context 内持有：
当前 Run 的 view 组合器、`records/committed` 的监听、执行 owner 的订阅、WorkPermit。
交付点只有两个（[LC-07](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）：
调度者经受限 Handle 交 Run（新 epoch、新 WorkPermit）；AR 的退出过程调用
`requestRetire` → 驱动器到安全边界经 `omneRun.prepareYield` 封闭 epoch →
`awaitQuiescent` 返回后 AR `releaseResources`。热宽限到期仍有前台执行时按 interrupt
收口并记 `yield_forced`（[RD-14](../../../spec/capabilities/run-driver/v2/contract.md)）。
静止判据：无在途 prepare、无未回执的 attempt start、监听已撤。

`decide(view) → intent` 是纯函数：view 由 run 流 fold、Inbound 读面与 TL/HD/MC 非结算
视图组合；intent 是一次 prepare 的输入，提交由协调者裁决。广播只是铃：驱动器收到
铃后重读 view 再 decide，不据通知推进；铃丢失由调度者的开机扫描兜底。

## 兼容性声明

`epoch_issued.compat`（[RN-08](../../../spec/capabilities/run/v1/contract.md)）的形状由本包固定：

```text
compat = {
  driverBinding: { driverKey: "omne.run-driver", driverVersion: 1 },
  contracts: { session: 1, run: 1, "run-driver": 2, tools: 1, "human-decisions": 1, "model-execution": 1 },
  reducer: { stateKey: "run.driver_position", version: 1 },
  media: { reachable: [...contentRef], unreachable: [...contentRef] },
  externalWork: { calls: [...CallRef], attempts: [...AttemptRef], requests: [...RequestRef] }
}
```

重取时 Factory 比较自己的 driverKey/version 与 contracts 精确版本；任一不兼容返回
`incompatible(reason)`，Run 保持原状态、占位派生保留，等待用户控制或兼容实现。

## 装载效应与撤除责任

| 效应 | 所有者 | 撤除 | 保留 |
|---|---|---|---|
| Factory 贡献登记 | 本插件 | 关新激活准入 → 使用者退出 → 撤销登记 | 已发行实例按各自账目收口 |
| 实例驱动 | AR 预留后由 Factory 准备 | AR-12 复合退出：关准入 → Yield/收口 → 静止 → 释放 | Run/Step/调用/请求事实；Yield 保留占位 |
| WorkPermit 与 epoch | E0 联合准入 | `settle(work)`；Yield 只结算许可不结算 Run | Run 状态、接续、阻塞集合 |
| 驱动位置 reducer 登记 | 本插件 | 撤回 reducer，视图 unavailable，不删事实 | run 流事实 |
| 广播与执行 owner 订阅 | 实例 Context effect | 取消订阅，不重判工作 | arrival 与 TL 事实 |

Factory 换代：新版本登记后关旧版本新激活；持有旧版本实例的 Run 沿 Yield → 重取，
重取须过兼容声明（[RD-04](../../../spec/capabilities/run-driver/v2/contract.md)）。

## 实施与验证

先实现 `decide` 与节点拓扑（可脱离 Cordis 单测：以 RunDriver 模型的场景为用例），再接
`omneRun` 提交面与 Factory 贡献。验收沿 [run-driver 场景](../../../spec/capabilities/run-driver/v2/scenarios.md)
S01～S20 与 [RD-16](../../../spec/capabilities/run-driver/v2/contract.md) 的崩溃窗口表逐窗口注入；
可改写站点（S20）以静态检查保证守卫只能收紧。现有 [loop 切片](../loop/README.md)
的 runtime-context 与 assistant-stream 只作投影层参考，是否并入由流帧设计决定。
