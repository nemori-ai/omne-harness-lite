---
kind: decision
id: D-014
status: accepted
scope: Session、Run、Agent 实例三台状态机的权威拆分（session v1、run v1 取代 session-run v2）、三条关系与级联的生命周期组合契约、CC v2 的声明规则、run-driver v2 的引用迁移，以及三者作为独立插件的 Cordis 边界
date: 2026-09-14
sources:
  - ../proposals/session-run-agent-lifecycles/README.md
  - ../research/agent-loop-events-and-hooks/README.md
acceptance: ../proposals/session-run-agent-lifecycles/README.md#接受记录
supersedes:
  - id: D-008
    scope: capability.session-run v1 作为新设计依赖的身份；其 QueueControl 模型、v1 正文与 D-008 其余契约不变
  - id: D-012
    scope: capability.session-run v2 与 capability.run-driver v1 作为精确对象身份；条款语义不变，分别逐句迁入 session v1 / run v1 与只改引用的 run-driver v2
  - id: D-013
    scope: 驱动器提供者依赖表中对 session-run v2 服务的引用；实例驱动的消费方式、装载效应、四类接口对接与包归属不变
change_basis:
  observation: 用户 2026-09-14 明确要求三个对象的权威各落各目录（U-17），独立评审指出 CC-01 只承认本契约列出的原子关系、拆分后同提交条款将无人拥有（评审 r1 发现 1），且 Run 独立权威"可分布"的理由把驱动器实例可迁移与 Run 权威可另置协调域混为一谈（发现 2）
  causal_explanation: 在同一契约内的同提交条款拆到两个能力后成为跨能力原子关系，按 CC-01 原文无人声明，I-13/I-14 失去保护位置；因此拆分必须同时改 CC-01 的声明规则并由组合契约逐行声明，run-driver 的引用随之迁移；分布前提只能作为边界就绪并由跨域模型给出义务清单
  reproduction: ../proposals/session-run-agent-lifecycles/review.md
  verification: ../../spec/compositions/session-run-agent-lifecycles/verification.md
---

# D-014：Session、Run 与 Agent 实例的生命周期、关系与级联

接受[Session、Run 与 Agent 实例提案](../proposals/session-run-agent-lifecycles/README.md)，
精确对象为 [capability.session v1](../../spec/capabilities/session/v1/contract.md)、
[capability.run v1](../../spec/capabilities/run/v1/contract.md)、
[composition.session-run-agent-lifecycles v1](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)、
[composition.core-work-coordination v2](../../spec/compositions/core-work-coordination/v2/contract.md)
与 [capability.run-driver v2](../../spec/capabilities/run-driver/v2/contract.md)。
[session-run v2](../../spec/capabilities/session-run/v2/contract.md)、CC v1 与 run-driver v1
保持冻结与可引用，标为 superseded。事实依据来自
[六系统循环/事件/hooks 研究](../research/agent-loop-events-and-hooks/README.md)
中 DSH 对耐久事件与活体事件的分家。

## 选择

- **权威各落各目录。** session-run v2 逐句拆为 session v1（身份、生命周期、历史、队列、
  复合打断受理、会话级 hold、状态贡献注册、恢复顺序、Inbound）与 run v1（Run、状态、
  epoch、Step、驱动位置投影、控制、命令 Run 终态映射、恢复兼容证据），语义不变；
  归属表见[提案](../proposals/session-run-agent-lifecycles/session.md#2-条款逐句归属)。
- **三条关系与级联归一份组合契约。** 附着、占位、执行者三条关系各有唯一拥有者；占位由
  Run 状态派生，不单独记录；级联只有三种形状，判断顺序固定：能派生就派生，不能派生看
  不变量允不允许中间态，允许就提交后反应，不允许才同提交。同提交的行由组合契约逐行
  声明，CC v2 把 CC-01 的声明规则改为"本契约及同一协调域内发布的组合契约明确声明的组合"。
- **事实即事件。** 提交后把 envelope 原样广播一次，按租户与 Session 作用域过滤；广播只是
  提示，反应者幂等、在门内重读事实、不据通知推进，丢失由启动扫描兜底。不设第二种事件。
- **三个独立插件加组合者。** Session、Run、Agent 实例各为独立插件，通过服务依赖建立关系；
  Session 插件与 Run 插件互不 required inject，凡同时涉及两者的操作落在组合者、裁决者或
  调度者插件里；三者与 Session 插件同归 `packages/session/session`，Run 独立成包
  `packages/session/run`，驱动器归 `packages/agent/run-driver`。
- **实例生灭是资源与装配的治理。** 实例只在两个点与 Run/Session 相接：调度者交 Run 时
  先找 ready 实例再激活；退役时驱动器 Yield。live-agent v1 不需要新版本。
- **Run 独立权威只算边界就绪。** 跨协调域部署前必须补的义务由跨域模型给出清单
  （[LC-09](../../spec/compositions/session-run-agent-lifecycles/v1/contract.md)）；不据此声称当前
  条款可分布。
- **模型发现进入契约。** 对 interrupted 的 Run 做 cancel/force_stop 直接进入 cancelled，不经
  stopping（[RN-03](../../spec/capabilities/run/v1/contract.md)）。

## 理由与边界

拆分让每个对象的状态机、关系与级联都有一个可引用的权威点，让 Run 权威在运行时可见，
并为未来把 Run 权威另置协调域留出边界；代价是 session-run v2 与 run-driver v1 刚发布即
被取代，run-driver v2 只改引用、模型与场景逐字节复制。三形状规则让每条级联的失败模式
显式：同提交全成或全不成，门前重查不可能漏，唤醒丢了有扫描。用户裁决 U-17～U-32 与
作者裁决 A-12（Run 独立插件）、A-13（占位派生）记录在提案，A-12/A-13 用户可另行否决。

证据为[生命周期组合模型](../../spec/compositions/session-run-agent-lifecycles/verification.md)：
同域安全、同域进展、跨域安全、跨域进展四个配置通过，否定变体如期给出反例，每个配置
在 8 核上 36 秒内完整探索；run-driver v2 的六个配置是 v1 的逐字节副本。它们是有限范围
证据，不是实现的证明。独立评审 r1 及逐项处置保存在提案内。本决定接受目标设计与有限
验证工件，不接受实现已完成：事件词汇与 envelope 的 JSON Schema、通知作用域过滤的
实现、归档后后台调用的存续政策（工具设计）、多进程 epoch 活性判定、跨域义务清单的
兑现仍待后续。

需求消费基线沿用 D-012 的 `6f7f1de1bc2fe0e772dc48a83da4699fece82e89`，自该基线起需求
正文无变更；确认条款与覆盖归[消费记录](../proposals/session-run-agent-lifecycles/requirements.md)。
