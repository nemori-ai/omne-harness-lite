## 2026-09-30 call-accounts 包根换版后的采用核对

采用不变：SA3 仍依赖 CB3／AR2／CA2，不升 CA4。A1 core 集成把 call-accounts 包根 `./schema` 换为 CA4 原字节（ACK 后继决定），CA2 原字节由同包公开 `./schema/v2`（`schema/v2/call-accounts.schema.json`）保留，依据 [call-accounts v3-design](../call-accounts/v3-design.md)「本包 Schema 与元数据」行；旧精确消费者不自动升级见 [v4 ACK 映射](../call-accounts/v4-acknowledgement-design.md)迁移段。AR2 固定图正是经该入口解析 CA2。因此本节点 INPUT-02/INPUT-04 的 CA2 原字节比对对象改为该入口文件，采用版本表与 17 项冻结资源不变。

本包源码另从 call-accounts 根取 `ExactDecimal` 值与 `TrimSummary` 类型；v4 ACK 映射第一行登记 CA4 的既有值形状、`ExactDecimal` 与计算「未因 ACK 改变」，CA2 与 CA4 Schema 仅顶层 `$id`／`title`／`description`／`$comment` 不同，`$defs` 逐项相同。这是值面同形的事实，不构成本节点对 CA4 的采用；新增 binding 0。

## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 15 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
新原始运行与逐项签收记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# stream-assembly

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`capability.stream-assembly/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/stream-assembly` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**479 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。原始执行、制品与范围。
- 逐项技术接受：本节点 14 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；精确 ID、坐标和前提。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前采用与实施层（2026-09-26 D-068）

设计显式采用 `capability.stream-assembly · v3`，精确 [规范](../../../../spec/capabilities/stream-assembly/v3/contract.md) 与 接受 已冻结；采用依据为 D-068追加。此段取代以下原2当前采用／源码不存在的旧说明，旧投影按历史读，不代替新实际验证。节点身份、纯模块或构件边界、公开操作、外部所有者与Connector延期不变。

- 可实施：沿新规范全部本节点责任和下文既有投影，只有D-068明确的表示／采用／错误例变化；不扩展外部runtime或存储。
- 源码：`packages/core/stream-assembly` 已完整建立；三份作者源提交已集成至 HUB `71c4cd32`，根锁已登记。五操作均可独立公开调用，调用方持有冻结状态；依赖明确为 CB3／AR2／CA2。
- 实际验证：当前源 HUB 复验 中 **479 tests**、构建、严格类型、27规则与五公开操作消费者通过；当前3有限模型 另有两条有限binding，不作为源码证明。W6最终真实流链、逐ID技术接受与用户总体接受仍待。


本次局部技术接受：主调度实际接受本节点 **13项 core-local义务**，见 逐项范围与证据。最终真实组合、外部宿主义务及用户总体接受不随之提升。

## 原2采用投影记录

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿，同日按 D-060 §八 M36、M41 对齐（严格无损解析；依赖 arrival-events、content-blocks、call-accounts 三包）；兑现 `omne-harness-lite-design-2026-09-15 · capability.stream-assembly · v2`（[契约](../../../../spec/capabilities/stream-assembly/v2/contract.md)，状态 `accepted`，接受由 D-061）
- 源码位置：`packages/core/stream-assembly`——**尚未建包**。归 `core`：它是纯计算（[S-1](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-1-本契约拥有什么)），被 `model` 领域的模型请求运行时与 `tools` 领域的工具执行运行时两个宿主 import（D-035 选择表第三行「落 core、纯计算、自写」；[两层布局](../../../README.md#packages-的两层布局)）
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——五个操作都作用于调用方持有的状态值，没有提交点、不持有任何一条流、不发事件（[S-1](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-1-本契约拥有什么)、[S-17](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-17-每个操作写全九件事)）。路由、持有、包消息、只记一次、首个内容的时刻都归宿主（[S-3](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-3-本契约不拥有什么)、[S-28](../../../../spec/capabilities/stream-assembly/v2/contract.md#s-28-宿主要兑现的前提)），不在本节点

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，D-062；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：本节点声称兑现 S-4～S-27（装配状态与位置、一块在状态里是什么、快照、收尾结算、一块怎样落、封口那一下的唯一解析、解析不了只标记、被砍过的调用落成半截、账与砍的汇总、首个内容的位置、五个操作、八个判定失败值、表示层拒绝值原名引用、判定次序、被拒不改状态、一次到达装配等于一次性到达），逐条见 [design.md 投影表](design.md#契约到-cordis-的投影)。**S-28、S-29 不在本节点兑现**：它们是宿主前提与部署表，本节点只写清单机时它提供了什么让宿主兑现得了。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **2 条**，都指向 formal task `stream-assembly-v2-assembly`（run `2026-09-25-formal-assets-runtimes`，退出 0、无反例）：P-1 块次序（S-6）与 P-7 一次到达装配等于一次性到达（S-27）；两条的有效性前提（三份变异配置给得出反例）由 run `2026-09-25-validity-stream-assembly` 支撑（全部退出 12，D-060 §八 M54）。**它们证的是模型，不是实现**；实现侧的一致性用例、性质测试、规范场景与静态检查一条也没有，缺口见 [verification.md「覆盖缺口」](verification.md#覆盖缺口)
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                      |
| ------------------------------------------ | ----------------------------- |
| 怎样实现、公开面是什么、状态值怎样表示     | [实现设计](design.md)         |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)       |
| 实际跑过什么、覆盖到哪里、还缺什么         | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 record/decisions。
