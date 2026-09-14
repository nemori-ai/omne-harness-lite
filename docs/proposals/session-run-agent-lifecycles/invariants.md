# 三对象与三条关系的不变式

[提案索引](README.md) · [状态机与级联](lifecycles.md) · [需求](requirements.md)

按[需求推导性质](../../architecture-guide/assurance/invariants.md#从目标与需求推导性质)：
安全不变式说"永远不会"，进展不变式说"最终会"。编号按对象分组：S = Session，R = Run，
A = 实例，L = 关系与级联，LP = 进展。已由 [agent-loop-inbound](../agent-loop-inbound/invariants.md)
提出并随 D-012 进入规格的 I-1～I-24、P-1～P-4 只引用不复述；本文件只列本轮新增或
需要重新指明保护点的条目。证据列中"Lifecycles 模型"指本提案接受时随组合契约发布的
形式模型；未执行的证据分别保留，不表述为已证明。

来源列的编号分别指向：SR = [session-run v2](../../../spec/capabilities/session-run/v2/contract.md)，
RD = [run-driver v1](../../../spec/capabilities/run-driver/v1/contract.md)，
AR = [live-agent v1](../../../spec/capabilities/live-agent/v1/contract.md)，
CB = [agent-session-binding v1](../../../spec/compositions/agent-session-binding/v1/contract.md)，
CC = [core-work-coordination v1](../../../spec/compositions/core-work-coordination/v1/contract.md)，
I / P = [agent-loop-inbound 不变式](../agent-loop-inbound/invariants.md)，
A = [agent-loop-inbound 作者裁决](../agent-loop-inbound/README.md#作者裁决2026-09-14cordis-层)，
PF / SYS = [需求正文](../../requirements/README.md)，D-013 = [决定](../../decisions/D-013-run-driver-cordis-boundary.md)。

## Session

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| S-1 | Session 生命周期只沿 `open ⇄ archived → deleted` 转移；archive/delete 只在不存在非终态 Run 时成立，否则 busy 并披露原因，不隐式 cancel | 沿用 SR-02、PF-013.C1 | 生命周期操作的具名组合者，在门内读 Run 当前状态 | Lifecycles 模型状态谓词；场景 |
| S-2 | Session 处于 archived/deleted 时，不存在 queued/held 的队列项，也不存在 accepted 或 classified 且未消费的 arrival；它们与生命周期转移在同一提交 closed | 本次提出，落实 SR-02、SR-17 D2 列、SR-20 | 同一具名组合者（形状 2） | Lifecycles 模型动作前提 |
| S-3 | 提供者启动扫描在任何驱动器重取或恢复之前完成本 Session 全部未裁决 arrival 的裁决；空闲 Session 不留永不裁决的 arrival | 沿用 SR-14/21、I-21 | Session 提供者启动过程 | 恢复场景；LP-3 |
| S-4 | context 水位单调递增；撤回与到期只推进不再可见下界，不改写已记录的切点 | 沿用 SR-19 | Inbound 受理与消费 | 结构检查 |

## Run

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| R-1 | Run 状态只沿 SR-08～12 的封闭转移集变化；completed/failed/cancelled 吸收，之后只接受隔离证据，不接受推进 | 沿用 SR-08～12 | Run 提交面：每次提交核对当前状态 | Lifecycles 模型 |
| R-2 | 同一 Run 同一时刻至多一个有效 epoch；发行新 epoch 的提交同时封闭旧 epoch；旧 epoch 的提交被拒绝并作隔离证据 | 沿用 SR-08、I-3 | Run 提交面（形状 1 守卫） | Lifecycles 模型状态谓词；迟到提交注入 |
| R-3 | Yield 与崩溃不改变 Run 状态：它们只封闭或失去 epoch；Run 的阻塞集合、接续与占位保持 | 沿用 SR-08、RD-04/14、A-1 | 驱动器 Yield 提交；恢复从事实 fold | Lifecycles 模型；RunDriver 模型 sched 配置 |
| R-4 | 重取只以新 epoch 进行，且须通过 SR-14 恢复兼容证据（含驱动绑定与投影 reducer 版本）；不兼容的 Run 保持原状态并保留占位 | 沿用 RD-04、A-10 | 调度者重取的联合准入 | 场景 |

## Agent 实例

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| A-1 | 一个 Session 同一时刻至多一个未释放的实例；前一实例 disposed 前不能为同 Session 预留新 AgentRef | 沿用 AR-4、I-2 | Registry 预留 | 已有 Runtime.tla |
| A-2 | 实例只在 ready、持有精确工作许可且业务准入成立时为某个 Run 提交；许可结算后不再提交 | 沿用 AR-8/10、CB-09 | 每次提交的 checkWork | Lifecycles 模型动作前提 |
| A-3 | 实例进入 releasing 之前，其执行中的 Run 已 Yield、终态、interrupted 或 stopping 之一，且本实例许可已结算；不设隐含超时成功 | 沿用 AR-12/13、CB-10、D-013 §4 | AR 共享退出过程 | Lifecycles 模型：`releasing ⇒ executor ≠ self` |
| A-4 | 恢复不依赖任何实例事实：从空 Registry 与耐久的 Session/Run 事实可以唯一确定每个 Run 的状态、占位与"是否需要重取" | 本次提出，落实 SYS-RUNTIME-CONTINUITY.C1、I-19 | 派生规则（lifecycles.md） | Lifecycles 模型：崩溃动作后的可达状态检查 |

## 关系与级联

| 编号 | 陈述 | 来源 | 保护点 | 证据 |
|---|---|---|---|---|
| L-1 | `executor(R) ≠ null` 蕴含 `executor(R).agent` 是 R 所属 Session 当前附着的实例，且该实例处于 ready 或 closing | 本次提出 | 派生规则；AR 许可只发给附着实例 | Lifecycles 模型状态谓词 |
| L-2 | `placeholder(S)` 等于 S 中唯一处于 running/waiting/waiting_human/waiting_gate/stopping 的 Run，或为 null；与 I-1 等价 | 沿用 I-1，本次改为派生 | 派生规则；取批门读 Run 状态 | Lifecycles 模型：占位由状态函数定义，无需单独变量 |
| L-3 | Session 处于 archived/deleted 后不再有新的工作准入与新激活；已附着的空闲实例最终关闭（LP-2），关闭前不能为该 Session 提交任何 Run 事实 | 本次提出，落实 SR-02、CB-05/06 | 附着资格守卫；宿主对 archived 事实的反应 | Lifecycles 模型 |
| L-4 | 级联矩阵每行恰用一种主形状；形状 2 的行在同一协调域内由具名组合者一次提交；形状 3 的反应者幂等且在门内重读事实，不据通知推进 | 本次提出（用户认可的三形状规则） | 组合契约逐行标注；组合者与反应者的实现映射 | 结构检查；反应者重复投递测试 |
| L-5 | 对任何非终态且执行者为 null 的 Run，唯一的推进路径是以新 epoch 重取；不存在绕过重取的推进 | 本次提出，落实 R-2、R-3、A-4 | Run 提交面与调度者 | Lifecycles 模型：`executor = null ∧ state ∉ terminal ⇒ 下一个改变状态的动作是 Reacquire` |
| L-6 | 跨协调域部署下，形状 2 的级联改为 CC-05 耐久意图后，I-14 与 SR-17 退化为最终成立；其余安全性质保持 | 本次提出（§4a 论证对象） | 跨域意图的耐久与去重 | Lifecycles 模型 `SameDomain = FALSE` 配置的通过/反例清单 |

## 进展

| 编号 | 陈述 | 来源 | 说明 |
|---|---|---|---|
| LP-1 | Session open、附着资格有效、存在可用 Factory 且调度者存活时：占位 Run 执行者为 null 且有可干的事（running、或存在就绪接续/审批就绪/门恢复）最终被重取；无占位且队首合格最终开新 Run | 沿用 P-1、P-2，本次加上"先找 ready 实例再激活" | 调度者只响应事实广播与开机扫描，不轮询 |
| LP-2 | Session archived/deleted 后，其附着的空闲实例最终关闭并释放附着 | 本次提出 | 形状 3；关闭失败保留 blocked 与残留，不撤销归档事实 |
| LP-3 | 提供者启动后，所有 Session 的未裁决 arrival 最终被裁决（I-21 进展侧） | 沿用 I-21 | 扫描是 Session 提供者义务 |
| LP-4 | 实例计划退役最终到达 disposed 或停在有记录的 blocked 阶段；不停留在无记录的中间态 | 沿用 AR-12/13 | 与 P-3 同型 |

## 证据义务

- 本次提出的 S-2、A-3、A-4、L-1、L-2、L-3、L-5、L-6 与 LP-1、LP-2 是接受本提案前须由
  `Lifecycles` 模型覆盖的条目；模型范围为三台状态机、三条关系与矩阵中的触发动作，
  两个配置（`SameDomain` 取真假），每个配置 8 核 ≤ 2 分钟；活性只在单线程小配置检查。
- I-13、I-14、I-21 等已由 RunDriver 模型覆盖的条目不重做；本模型只在 `SameDomain = FALSE`
  下重新检查 I-13、I-14 的退化形式。
- 组合场景：实例关闭期间 Yield 前提不满足 → 热宽限 → interrupt（D-013 §6 已登记）作为
  实现验收场景，不新建模型。
- 全部测试证据在实现阶段按验证规范给出；本提案接受不等于这些性质已被证明。
