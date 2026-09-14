---
kind: proposal
id: P-session-run-agent-lifecycles
status: accepted
scope: Session、Run、Agent 实例三台状态机的权威拆分、三条关系与级联的组合契约、三者的 Cordis 视角与提供者设计的联合候选
---

# Session、Run 与 Agent 实例：生命周期、关系与级联

[提案索引](../README.md) · [Agent Loop 与 Inbound](../agent-loop-inbound/README.md) · [session-run v2](../../../spec/capabilities/session-run/v2/contract.md) · [run-driver v1](../../../spec/capabilities/run-driver/v1/contract.md) · [live-agent v1](../../../spec/capabilities/live-agent/v1/contract.md) · [附着组合 CB v1](../../../spec/compositions/agent-session-binding/v1/contract.md)

本提案承接 [D-012](../../decisions/D-012-run-driver-and-inbound.md) 与
[D-013](../../decisions/D-013-run-driver-cordis-boundary.md)：那两份决定固定了 Run 驱动器
与 Session Inbound 的语义及驱动器的 Cordis 边界，但 Session、Run、Agent 实例三者各自的
权威落点、连接它们的关系、状态机之间的级联，以及 Session 与 Run 的提供者设计仍未成形。
本提案把三者放在一个联合视角下设计，接受后各自的权威落回各自目录：语义契约在
`spec/capabilities/<对象>/`，系统视图在 `docs/architecture/<对象>.md`，提供者设计在所属包
`design.md`；关系与级联归一份组合契约。任何设计点全仓只有一个权威点。

## 范围

- 在范围内：三台状态机的引用与权威拆分；附着、占位、执行者三条关系的定义与耐久性；
  级联矩阵及其采用的形状；"事实即事件"的广播与反应义务；Session 与 Run 作为独立插件的
  Cordis 视角（消费方式、装载效应与撤除、四类接口对接、依赖变化政策）；Session、Run
  提供者设计所需的流模型、事件词汇、组合者与调度者；Run 独立权威的分布前提的形式化论证。
- 不在范围内：session-run v2 / run-driver v1 已定义的状态转移与推进规则（只引用）；
  工具设计（延后）；客户端出站流协议；通知命名空间的实现（U-5）；多进程 epoch 活性判定。

## 文件

- [requirements.md](requirements.md)：需求消费基线（沿用 D-012 的基线）与按对象的覆盖表。
- [lifecycles.md](lifecycles.md)：三台状态机的引用、三条关系、三种级联形状、逐行标注的
  级联矩阵、跨协调域的预期结果。
- [invariants.md](invariants.md)：按 Session / Run / 实例 / 关系分组的安全与进展不变式，
  每条标明来源、保护点与证据义务。
- [review.md](review.md)：2026-09-14 独立只读评审 r1，对象为联合计划稿的三个决定点与分布前提；
  含逐条处置表。
- [session.md](session.md)：session-run v2 条款的逐句归属表、流模型与持久格式、事件词汇 v2 候选、
  裁决者/调度者/组合者三类宿主服务、checkpoint 处置、恢复顺序。
- [run.md](run.md)：Run 对象与执行者关系、提交面与读面、驱动位置投影、事件词汇 v2 候选、恢复
  兼容证据、Yield 与重取。
- [agent.md](agent.md)：实例生灭属于资源治理、两个相接点、崩溃与重启、live-agent v1 影响判断
  （不需要新版本）、对 `packages/core/agent` 设计的要求。
- [cordis.md](cordis.md)：三插件与组合者的消费方式、服务依赖图、事实广播机制、装载效应与撤除、
  四类接口对接、依赖变化政策、性质/证据/义务表、提供者设计归属。
- evidence/：模型运行记录（波 3）。

## 裁决记录（2026-09-14，用户）

以下为设计讨论中用户明确裁决的选择，是本提案的前提；接受本提案时它们进入决定，
接受前它们是用户已表达的方向而非正式契约。编号接续 agent-loop-inbound 的 U 系列。

| 编号 | 裁决 |
|---|---|
| U-17 | 三者的完整架构与规格设计联合交付，但各自的权威落在各自目录 |
| U-18 | 从 Cordis 视角出发，Session、Run、Agent 实例是独立插件，通过服务依赖建立关系；调度者单独成插件 |
| U-19 | 级联采用"事实即事件、三种形状"：派生与守卫、同提交共写、提交后反应；判断顺序固定（见 lifecycles.md） |
| U-20 | Run 独立成包，放 `packages/session/run`；是否独立插件由作者决定 |
| U-21 | 持久格式语言无关且存储后端无关；在 DSH `c291e796` 的 session v3 JSONL 与 `session-persistence-jsonl` 切片上二次开发；append-only 日志同样在 DSH 基础上二次开发 |
| U-22 | Inbound 账本为新增 tenant-scoped stream `inbound(S)`，与 session/queue/run 同一协调域 |
| U-23 | 取消 `checkpoint_saved` 的 authoritative 地位，phase 由 fold 得到；保留投影 checkpoint 作可选加速缓存 |
| U-24 | 不做与 DSH 的对照文档；我们的设计按自身完整性正常落文档，复用源码只由 provenance.json 记来源 |
| U-25 | 单进程下实例生灭归 AR 与资源政策，Run 的启动/续接归调度者；调度者先找 ready 实例再激活，不轮询 |
| U-26 | 归档/删除时后台调用的结算按 D2 列 closed，停止/存续沿工具政策，完整政策留给工具设计 |
| U-27 | 形式模型改为"三台状态机 + 三条关系 + 级联触发"的组合模型，单配置 ≤ 2 分钟；不单独建 Inbound 模型 |
| U-28 | `packages/session/session/design.md` 原地修订，文首标明采用 v2 与被取代段落 |
| U-29 | Run 独立插件后是否具备基本的分布式特性用 TLA+ 论证；无论结论如何都可接受，不强求具备 |
| U-30 | 工具设计延后 |
| U-31 | 三个决定点按 [评审 r1](review.md) 的建议推进：D1 拆分并先解决 CC-01 的声明规则（CC v2）；D2 重发 run-driver v2，只改引用并如实记新增依赖；D6 采用备选，新开组合身份引用 CB v1。既接受决定的工件视为已发布，走 superseded，不原地重组 |
| U-32 | 文档中引用条款、不变式、决定与需求编号时必须给出具体文档链接，不能只写代号 |
| U-33 | 事件命名一律三段式（接受后追加）：`<流>.<对象>.<事实>`；落点见 [Session 设计](../../../packages/session/session/design.md#事件命名去重键与词汇) |
| U-34 | 所有事件都带去重键，避免同一事实重复投递或重复消费；落点同上 |
| U-35 | envelope 与事件数据的 JSON Schema 在实现前具体设计，但统一遵循数据模型与定义风格的最小/最大/最佳实践约定 |
| U-36 | 通知作用域与出站流协议放到实现阶段设计；现在只划职责、方向与边界，见[出站流候选](../outbound-stream/README.md) |
| U-37 | 归档后后台调用的存续政策属于工具执行生命周期/状态机（也要级联），写成备忘录，工具设计时捞出讨论：[备忘](../tool-system/v1/session-run-cascade-memo.md) |

## 作者裁决

| 编号 | 裁决 | 用户可否决 |
|---|---|---|
| A-12 | Run 是独立插件（服务 `omneRun`）。理由：Run 是独立的状态权威，有自己的流、状态机与消费者；插件边界让这一权威在运行时可见，并使未来把 Run 权威另置协调域时有现成的边界可用（边界就绪，不是已证明可分布，见 [review.md](review.md) 发现 2）；插件代价只是服务键、效应与端口。硬规则：Session 插件与 Run 插件互不 required inject，凡同时涉及两者的操作落在单独的组合者插件里；裁决者、调度者与组合者仍归 `packages/session/session`（同包内的独立插件），不改变 D-013 的包归属 | 是 |
| A-13 | 占位由 Run 事实派生，不单独记录（lifecycles.md）；SR-08 的"精确持有"由派生关系的唯一性兑现 | 是 |
| A-14 | 跨协调域的版本戳、意图重投与租约在现阶段属于过度设计：首版同一协调域，Session 门在门内直接读 Run 状态，戳不增加任何保证。[LC-09](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md) 只保留为"跨域部署前必须补的义务清单"，跨域模型只是边界就绪的证据；提供者设计去掉 `stateStamp` 读面与带戳的门（2026-09-14 接受后作者判断，回应用户"是否过度设计"之问） | 是 |

## 已裁决的三个决定点（U-31）

经 [评审 r1](review.md) 后由用户 2026-09-14 拍板：

- D1 契约拆分：[session-run v2](../../../spec/capabilities/session-run/v2/contract.md) 拆为
  `capability.session` v1 与 `capability.run` v1，v2 冻结并标 superseded；同时发布
  [core-work-coordination](../../../spec/compositions/core-work-coordination/v1/contract.md) v2，
  把 CC-01 的原子关系声明规则改为"本契约及同一协调域内发布的组合契约明确声明的组合"。
- D2 run-driver 引用：重发 [run-driver](../../../spec/capabilities/run-driver/v1/contract.md) v2，
  只改条款引用并如实记录对生命周期组合契约的新增依赖；模型与场景原样冻结，形式任务重跑。
- D6 组合契约身份：新开 `composition.session-run-agent-lifecycles` v1，引用
  [agent-session-binding v1](../../../spec/compositions/agent-session-binding/v1/contract.md)，
  只拥有三条关系、级联矩阵、广播反应义务与形状 2 各行的同提交声明。

## 未决项

- 归档后后台调用的停止/存续政策与 TL→Inbound 端口形状：归工具执行生命周期设计，
  备忘见 [tool-system 备忘](../tool-system/v1/session-run-cascade-memo.md)（U-37）。
- 客户端出站流协议与通知作用域（U-5）：实现阶段设计，职责/方向/边界见
  [出站流候选](../outbound-stream/README.md)（U-36）。
- 多进程部署下旧 epoch 持有者的活性判定（单机首版由 Registry 直接知道，不是问题）；
  跨协调域部署所需的租约、版本戳与意图重投协议只保留为 [LC-09](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)
  的义务清单，不进入首版提供者设计（[A-14](#作者裁决)）。
- envelope 与事件数据的 JSON Schema：实现前按三段式命名、去重键与数据模型约定具体设计（U-35）。
- ~~live-agent v1 是否需要新版本~~：规格步骤判断为不需要（[agent.md §4](agent.md#4-live-agent-v1-的影响判断)），
  "会话关闭"落在 AR-11 的"显式退役"由宿主发起，写入 [core/agent 设计](../../../packages/core/agent/design.md#与-sessionrun-的相接点d-014)。

## 接受记录

2026-09-14 由 [D-014](../../decisions/D-014-session-run-agent-lifecycles.md) 接受。精确对象：
[session v1](../../../spec/capabilities/session/v1/contract.md)、[run v1](../../../spec/capabilities/run/v1/contract.md)、
[生命周期组合 v1](../../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)、
[CC v2](../../../spec/compositions/core-work-coordination/v2/contract.md)、
[run-driver v2](../../../spec/capabilities/run-driver/v2/contract.md)；session-run v1/v2 与
run-driver v1 标为 superseded。三个决定点按[评审](review.md)建议落地：D1 拆分并发布 CC v2，
D2 run-driver v2 只改引用并如实记新增的组合契约依赖，D6 新组合身份引用 CB v1。
作者裁决 A-12（Run 独立插件）与 A-13（占位派生）随决定接受，用户可另行否决。

接受的是目标设计与有限验证工件：[Lifecycles 模型](../../../spec/compositions/session-run-agent-lifecycles/verification.md)
四个配置通过、否定变体如期反例；run-driver v2 六个配置是 v1 的逐字节副本。系统视图见
[Session](../../architecture/session.md)、[Run](../../architecture/run.md)；提供者映射见
[session](../../../packages/session/session/design.md#d-014-后的插件划分)、
[run](../../../packages/session/run/design.md)、[run-driver](../../../packages/agent/run-driver/design.md)、
[persistence](../../../packages/session/persistence/design.md)、[projection](../../../packages/session/projection/design.md)、
[core/agent](../../../packages/core/agent/design.md#与-sessionrun-的相接点d-014)。上面"未决项"
中未划去的各条是接受时明确保留的未完成义务；任何提供者实现与崩溃注入验收尚未开始。
