# Session、Run 与 Agent 实例的生命周期组合 v1

本契约身份为 `composition.session-run-agent-lifecycles`，版本 1。它把三台已接受的状态机
放在一起，只拥有连接它们的三条关系、级联的形状与逐行声明、事实广播的反应义务，以及
跨协调域部署前必须补的义务；三台状态机各自的转移仍归所属能力契约，本组合不复述。
规范依赖：[session v1](../../../capabilities/session/v1/contract.md)、
[run v1](../../../capabilities/run/v1/contract.md)、
[live-agent v1](../../../capabilities/live-agent/v1/contract.md)、
[agent-session-binding v1](../../agent-session-binding/v1/contract.md)、
[core-work-coordination v2](../../core-work-coordination/v2/contract.md)、
[durable-records v1](../../../capabilities/durable-records/v1/contract.md)。
行为模型见 [Lifecycles.tla](Lifecycles.tla)，符合性要求见[场景](scenarios.md)，
覆盖与局限的验证说明由接受决定的 `verification` 字段引用。接受依据为
[决定 D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md)。

## 范围与三台状态机

**LC-01**：本组合适用于一个 Session、其全部 Run 与先后附着于它的实例。三台状态机是：
Session 的 `open ⇄ archived → deleted`（[SE-02](../../../capabilities/session/v1/contract.md)）；
Run 的 preparing/running/waiting/waiting_human/waiting_gate/interrupted/stopping/
completed/failed/cancelled（[RN-01～05](../../../capabilities/run/v1/contract.md)）；实例的
`preparing → ready → closing → releasing → disposed`（[AR-4～7、AR-11～13](../../../capabilities/live-agent/v1/contract.md)）。
Session 与 Run 的转移是耐久事实；实例的转移不耐久，Registry 重启从空重建
（[AR-7、AR-17](../../../capabilities/live-agent/v1/contract.md)）。

## 三条关系

**LC-02**：连接三台状态机的关系恰有三条，各有唯一拥有者：

| 关系 | 定义 | 拥有者 | 耐久性 |
|---|---|---|---|
| 附着 | 实例 → Session，`held → revoked/releasing → released`；一个实例一生只附着一个 Session；一个 Session 同一时刻至多一个未释放的实例，前一实例 disposed 前不能为同 Session 预留新 AgentRef | live-agent Registry 与 Session 附着提供者（[CB-04～07](../../agent-session-binding/v1/contract.md)、[AR-4](../../../capabilities/live-agent/v1/contract.md)） | 不耐久 |
| 占位 | Session → Run，`null | RunRef`，表示"该 Run 仍拥有本 Session 的驱动权"。它由 Run 状态派生：`placeholder(S)` 是 S 中唯一处于 running、waiting、waiting_human、waiting_gate 或 stopping 的 Run，没有则为 null；interrupted 与终态不占位。派生关系的唯一性就是 [RN-01](../../../capabilities/run/v1/contract.md)"精确持有"的含义（[D-012](../../../../docs/decisions/D-012-run-driver-and-inbound.md) 接受的不变量 I-1），不需要单独的预留/释放事实 | Session（读 Run 状态） | 派生 |
| 执行者 | Run → 实例，`null | {agent, epoch, workPermit}`，表示"当前谁可以为该 Run 提交"。`executor(R)` 非空当且仅当 R 的当前 epoch 未封闭且 Registry 中存在持有该 epoch 工作许可的 ready 或 closing 实例；实例消失则为 null，Run 状态不变 | Run 的 epoch（[RN-01](../../../capabilities/run/v1/contract.md)）与 AR 的 WorkPermit（[AR-8/10](../../../capabilities/live-agent/v1/contract.md)、[CB-09](../../agent-session-binding/v1/contract.md)）共同表达 | epoch 耐久，持有者关联不耐久 |

执行者非空蕴含：持有者是该 Session 当前附着的实例，处于 ready 或 closing，其 epoch
未封闭，且 Run 占位。任何非终态且执行者为空的 Run，推进的唯一路径是以新 epoch 重取
（LC-07）；控制请求可以在执行者为空时受理。

## 级联的三种形状

**LC-03**：一台状态机的转移对另外两台与三条关系的效应只能采用三种形状之一，判断
顺序固定：

1. **派生与守卫**：不写不传。效应是其他已提交事实的函数，由 fold 得到；或依赖方在
   自己转移的门里读对方当前状态并据此拒绝。能派生就派生。
2. **同提交共写**：效应必须成为新事实，且不变量禁止中间态。用 [CC-01](../../core-work-coordination/v2/contract.md)
   的具名组合在同一协调域一次提交，参与的每个权威只核自己的事实（prepare/check），
   不修改对方状态。只在派生不可能且中间态被禁止时采用。
3. **提交后反应**：效应允许延迟，或效应本身不是耐久事实（资源动作、通知）。反应者
   订阅已提交事实的广播（LC-06），幂等地做第二次提交或资源动作。

## 同提交声明

**LC-04**：以下级联采用形状 2，是本组合按 [CC-01](../../core-work-coordination/v2/contract.md)
声明的原子关系；每行由一个具名组合承担，Session 与 Run 的提供者互相不持有对方的
状态：

| 行 | 触发 | 同一提交内的效应 | 依据 |
|---|---|---|---|
| 1 | Session 归档 / 删除 | 生命周期转移；未取批队列项 closed_by_archive/delete；accepted 与 classified 未消费的 arrival closed；封闭新激活的资格。前提"无非终态 Run"由 LC-05 守卫 | [SE-02](../../../capabilities/session/v1/contract.md)、[SE-14](../../../capabilities/session/v1/contract.md) D2 列、[CB-05/06](../../agent-session-binding/v1/contract.md) |
| 2 | Session 级 force_stop | 队列 hold；当前占位 Run → stopping；该 Run 的 epoch 在受理点撤销 | [SE-09](../../../capabilities/session/v1/contract.md)、[RN-05](../../../capabilities/run/v1/contract.md) |
| 3 | 取批 / 取命令 / 取 trigger | 队列侧固定并取用项；Run 建立（basis、定义、模型、初始 epoch）；epoch 发行给持有工作许可的实例 | [SE-06/07/15](../../../capabilities/session/v1/contract.md)、[RN-01](../../../capabilities/run/v1/contract.md)、[AR-8](../../../capabilities/live-agent/v1/contract.md) |
| 4 | Run → completed / failed / cancelled | 终态转移；指向本 Run 的未消费 continuation 转为 trigger 项（completed/failed）或 closed（cancelled 与级联关闭）；执行者 epoch 封闭 | [RN-09](../../../capabilities/run/v1/contract.md)、[SE-17](../../../capabilities/session/v1/contract.md)、[D-012 的 I-14](../../../../docs/decisions/D-012-run-driver-and-inbound.md) |
| 5 | Run 的 force_stop / cancel | 控制受理；epoch 撤销；stopping 或（对 interrupted）直接 cancelled；对 TL/HD 的停止意图同域则同批、跨域沿 [CC-05](../../core-work-coordination/v2/contract.md) | [RN-03/05](../../../capabilities/run/v1/contract.md) |
| 6 | Run 的 interrupt | 关 Step；停止请求；安全收口后 interrupted；epoch 封闭 | [RN-03](../../../capabilities/run/v1/contract.md) |
| 7 | 驱动器 Yield | epoch 封闭；Run 状态、等待位置、阻塞集合不变；占位随状态派生保留 | [RD-14](../../../capabilities/run-driver/v2/contract.md)、[RN-01](../../../capabilities/run/v1/contract.md) |
| 8 | interrupt_then_run 受理 | 新 input 耐久；当时精确 Run 与复合意图记录；旧 Run 关新 Step | [SE-08](../../../capabilities/session/v1/contract.md)、[RN-04](../../../capabilities/run/v1/contract.md) |
| 9 | Inbound 裁决 | arrival 的意图与 observedRun 记录；裁决与被引用 Run 的终态转移在同一协调域全序 | [SE-12/14](../../../capabilities/session/v1/contract.md)、[D-012 的 I-13](../../../../docs/decisions/D-012-run-driver-and-inbound.md) |

首版四条流（session、queue、inbound、run）位于同一协调域；把它们拆到不同域前须先
满足 LC-09。

## 守卫与派生

**LC-05**：以下效应采用形状 1，不写事实、不发通知：归档/删除的前提"无非终态 Run"
（含 interrupted）在门内读 Run 当前状态；取批的前提"无占位"读 LC-02 的派生关系；
附着资格、租户权限、定义授权失效只封闭后续准入（[CB-06](../../agent-session-binding/v1/contract.md)、
[CC-02/04](../../core-work-coordination/v2/contract.md) 的撤销屏障），不解释为 cancel，进行中的
Run 沿冻结依据继续（[AR-9](../../../capabilities/live-agent/v1/contract.md)），驱动器在下一
安全边界的联合准入被拒即 Yield；写入权丢失封闭新提交，驱动器停在已确认水位
（[DR-03](../../../capabilities/durable-records/v1/contract.md)）；旧 epoch 的提交由每次提交的
epoch 核对拒绝（[RN-01](../../../capabilities/run/v1/contract.md)）；崩溃后"该重取"由
"占位 Run 的执行者为空"派生，不依赖任何实例事实。

## 事实广播与提交后反应

**LC-06**：协调者在提交返回 committed 后把该 envelope 原样广播一次，按租户与
Session 作用域过滤；广播只是提示，不是第二种事实。反应者的义务：幂等；动手前在
自己的门里重读权威状态，不据通知推进；容纳自身异常，不影响其他监听者；通知失败
按 [DR-02](../../../capabilities/durable-records/v1/contract.md) 单独报告 delivery 状态，不改已
提交事实；丢失由提供者启动扫描兜底。以下效应采用形状 3：

- Session 级调度者对铃的反应：队列变化、Run 终态、hold 解除、arrival 判为接续或审批
  就绪、epoch 封闭、门恢复、resume；判断"无占位且队首合格则开新 Run""占位 Run 执行者
  为空且有可干之事则重取"；先查 ready 实例，无则激活（[SE-15](../../../capabilities/session/v1/contract.md)）。
- 宿主对 Session 归档/删除的反应：关闭该 Session 的空闲实例
  （[AR-11](../../../capabilities/live-agent/v1/contract.md) 的显式退役），释放附着。
- AR 对 Run 终态、interrupted 与 Yield 的反应：`settle(work)` 结算许可
  （[AR-10](../../../capabilities/live-agent/v1/contract.md)）。
- 资源政策对"Run 等待中且实例空闲"的反应：可回收实例，Yield 无在途工作。
- 退役流程对实例的资源动作：请求驱动器 Yield（[AR-12](../../../capabilities/live-agent/v1/contract.md) 步骤 1）。

## Yield 与重取

**LC-07**：实例退役而 Run 在执行时，驱动器到安全边界提交 Yield（LC-04 行 7；前提沿
[RD-14](../../../capabilities/run-driver/v2/contract.md)），静止后按
[AR-12](../../../capabilities/live-agent/v1/contract.md) 释放资源与附着。占位 Run 的执行者为空
后，重取由 Session 级调度者发起：先完成本 Session 的裁决扫描
（[SE-18](../../../capabilities/session/v1/contract.md)），再取得 ready 实例或激活新实例，在同一
提交发行新 epoch 并封闭旧 epoch，operationId 从 `(RunRef, 封闭的 epoch)` 派生，重取须
通过 [RN-08](../../../capabilities/run/v1/contract.md) 的恢复兼容证据。多数重取不需要新实例。

## 崩溃与恢复

**LC-08**：崩溃与进程重启不留下任何实例事实或 Yield 事实。恢复顺序：耐久记录同步
有效前缀 → Session 校验并完成全部 Session 的裁决扫描 → 投影重建 → 各执行 owner 核实
在途 attempt/call/request → 当前资格重新取得 → 调度者对每个 Session 判断重取或开新 Run。
"epoch 未封闭但无实例持有"与"epoch 已封闭"在恢复上是同一种情况，都只能重取
（[RN-08](../../../capabilities/run/v1/contract.md)）。裁决扫描先于任何重取是硬顺序。

## 跨协调域部署前的义务

**LC-09**：本版只承诺同一协调域。将 Run 权威另置协调域之前，必须以新版本契约兑现
以下义务，否则形状 2 的行退化而不变量失效（[D-014](../../../../docs/decisions/D-014-session-run-agent-lifecycles.md)
引用的验证说明中 `LifecyclesSplit` 配置与否定变体给出证据）：Session 域的裁决门、归档门与取批门带
Run 域的状态版本戳；Run 域在消费 create 意图时重查占位；归档同时关闭已取项而尚未
建 Run 的 create 意图；settle 与 create 意图按 [CC-05](../../core-work-coordination/v2/contract.md)
耐久、幂等消费、源确认后撤回；[D-012 接受的 I-13 与 I-14](../../../../docs/decisions/D-012-run-driver-and-inbound.md)
与 LC-04 行 9 的"同域全序"改写为
最终性质；旧 epoch 持有者的活性判定（live-agent v1 缺口）。这是"边界就绪"的证据，
不是"已可分布"的证明。

## 验证边界

模型抽象三台状态机、三条关系与级联触发；把每个具名组合当作原子动作是提供者须实现的
线性化义务，不是对多个实际服务已能原子协作的证明。租户、帧、预算数值、多 Session、
工具与人类决定的具体状态机、多进程活性均不在模型内；实际提供者的符合性与装卸行为
另行验收。
