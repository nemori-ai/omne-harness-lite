---
kind: product-feature
id: PF-017
primary_dimension: agent
secondary_dimensions: [user]
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/requirements/product/agent/PF-017-cross-session-history-and-background-coordination.md
source_sha256: b31ac9489bce406983da43d10a459e494ed28c5f1393edd82d0b712c3d9332f0
source_anchor: "heading:# PF-017：跨会话历史状态检索与后台通信协作"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: equivalent-current-requirement
---


# PF-017：跨会话历史状态检索与后台通信协作

[智能体维度](../by-agent.md) · [来源与本轮取舍](../../../../research/legacy_backup/requirements-gap-resolution-sources/research.md)

2026-09-12 用户将 GAP-1 的第一部分重新定义为：Agent 能在一个 Session 中
检索其他 Sessions 的历史状态，并与其他会话后台通信、协调；GAP-2 并入这一
部分。主维度为智能体，副维度为用户。本条以这次定义为准。

## 已确认要求

- **PF-017.C1：Agent 能跨会话检索历史状态。** Agent 可在当前授权范围内
  发现其他会话，检索其已持久的消息、工作历史、状态与相关结果，按需深入到
  具体会话或记录。不能只允许检索当前会话，也不能要求目标运行时仍驻留才能
  查询其已保存历史。
- **PF-017.C2：Agent 能与其他会话后台通信和协调。** 一个会话中的 Agent
  可以向另一获准会话发送问题、信息、协调请求并接收答复或后续结果，无需用户
  在会话间手动转述。适用于有协作需要的会话，不限于父子 Sub-agent 关系；
  “后台通信”不等同于将一项工具调用转后台，也不要求把内部消息逐条推送给用户。

以下 C3–C6 根据上述要求、租户隔离和既有生命周期要求细化，精确协议待设计。

- **PF-017.C3：检索、通信与控制分别授权。** 当前会话知道目标身份，或与
  目标同属一个用户/组织，不自动获得读取、发送、唤醒或中断权限。结果、摘要、
  附件和索引均保留所属租户与访问边界；组织上下文切换不能把历史权限带入新
  上下文。检索到的内容与对端消息保留来源，不提升为系统指令或新增授权。
- **PF-017.C4：结果带有可辨认的来源与时效。** Agent 能确定结果来自哪个
  会话、哪个历史位置或状态时点，区分持久历史与当前运行状态；无匹配、权限
  不足、历史不可用或查询未完成不能混成成功空结果。无权读取时不泄漏目标存在。
- **PF-017.C5：后台协作有明确受理与接续结果。** 区分消息已提交、目标
  已受理、尚待处理、已答复与无法处理；对端休眠、繁忙、已终结、权限变化或
  运行时重建有明确处置。已经确认受理的协作不能仅因原运行时消失而无声丢失，
  重试不能重复冒充新的同一逻辑请求；实际业务效果仍按相应能力处理。
- **PF-017.C6：通信服从目标会话的工作边界。** 到达的消息是否进入当前
  运行、排队等待或请求启动下一轮，须遵循目标权限和 PF-013 的输入/运行规则。
  收到消息不自动授权中断对端或无限互相唤醒；消息、处理它的 Run 及回应能关联，
  受既有容量与预算约束，无法继续时返回可解释状态。

## 可观察场景

| 场景 | 应有表现 |
|---|---|
| 用户在新会话接着讨论上周的工作 | Agent 能检索获准旧会话的记录和结果，并注明来源；旧运行时无需仍在线 |
| 两个并行会话需要协调同一份工作材料 | 可以交换进展、请求与答复；材料并发保存仍遵循 PF-015 |
| 对端重建时请求已经被受理 | 恢复后能找回待处理请求或实际结果，不把重发当作新的工作意图 |
| 同一自然人在另一组织中发起检索 | 只返回该次访问获准的内容，不因自然人身份相同合并所有组织历史 |

## 关联与待设计事项

会话目录和面向用户的过滤归 [PF-013](../PF-013-session-run-lifecycle-and-pending-input-control/requirements.md)，
父子派发与监督归 [PF-004](../PF-004-subagent-delegation-and-supervision/requirements.md)，
独立后台工具归 [PF-003](../PF-003-tool-execution-observation-and-control/requirements.md)。
知识与认知的使用归 [PF-018](../PF-018-selfound-knowledge-and-cognition-use/requirements.md)，
不将检索历史本身等同于形成长期认知。

待设计：历史查询范围与分页/检索方式、对端寻址、消息受理与消费边界、唤醒
政策、回执/超时/撤回语义以及多方循环协调的约束。本条没有新增一个面向所有
用户的全链路因果面板；工程可观测性另归
[SYS-OBSERVABILITY](../../system/observability-and-logging/requirements.md)。
