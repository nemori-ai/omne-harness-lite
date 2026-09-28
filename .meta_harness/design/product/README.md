# 产品设计

这里保存产品**是什么**：每个 topic 一个包，承载该块的概念定义、模型、产品规则、
取舍、验收标准，以及它是怎么演变到今天的。

失效事件：产品方向改变。技术方案换了、上游升级了、实现重写了，这里一个字不动。

**这里不叫「需求」。**那个词暗示内容是被动接收的转述，而实际上这些是设计——
概念怎么定、模型什么形状、边界画在哪，都是判断的结果。
进入本目录的维护规矩、阅读地图与红线见 [AGENTS.md](AGENTS.md)；
真要在这里落字，按它的指引加载 `product-design` skill。

## 当前 topic

> **动手改任何一个之前，先看[架构内核 PF](architecture-core.md)。**
> 那份清单登记哪些 topic 覆盖[架构内核](../ubiquitous_language/terms/architecture-core-and-extension.md#ul-architecture-core--架构内核--architecture-core)——
> **改它们等于改别的 PF 赖以成立的前提**，代价与自检问题都在那里。
> **PF-000～PF-015 全在那份清单上；[PF-016 起默认在内核之外](architecture-core.md#内核之外的-pf)。**

| Topic | 状态 | rev |
|---|---|---|
| [PF-000 发生的事与记录条目](PF-000-occurrences-and-record-entries/README.md) | active | 1 |
| [PF-001 身份、范围与对 Agent 的约束](PF-001-identity-scope-and-agent-constraints/README.md) | active | 23 |
| [PF-002 设置、权限与资产的展开](PF-002-assets-settings-and-permissions/README.md) | active | 26 |
| [PF-003 资产的复制与分享](PF-003-asset-transfer-and-sharing/README.md) | active | 6 |
| [PF-004 Agent 定义与装配](PF-004-agent-definition-and-assembly/README.md) | active | 13 |
| [PF-005 执行环境与沙箱](PF-005-execution-environments-and-sandboxes/README.md) | active | 7 |
| [PF-006 工具与技能](PF-006-tools-and-skills/README.md) | active | 20 |
| [PF-007 Meta Capabilities](PF-007-meta-capabilities/README.md) | active | 19 |
| [PF-008 Human in the Loop](PF-008-human-in-the-loop/README.md) | active | 7 |
| [PF-009 上下文消息类型](PF-009-context-message-types/README.md) | active | 8 |
| [PF-010 上下文管理与组装](PF-010-context-management-and-assembly/README.md) | active | 6 |
| [PF-011 非常态的分层处置](PF-011-off-nominal-handling/README.md) | active | 4 |
| [PF-012 Agent Loop 与 Run](PF-012-agent-loop-and-run/README.md) | active | 15 |
| [PF-013 模型档案、调用与切换](PF-013-model-profiles-and-invocation/README.md) | active | 14 |
| [PF-014 输入的受理与排队](PF-014-inbound-intake-and-queueing/README.md) | active | 8 |
| [PF-015 会话的生命周期与归属](PF-015-session-lifecycle-and-ownership/README.md) | active | 13 |
| [PF-016 命令行交付面](PF-016-cli-tui-delivery-surface/README.md) | active | 10 |
| [PF-017 治理中心作为一个可部署应用](PF-017-governance-center-as-deployable-application/README.md) | active | 6 |
| [PF-020 工作区](PF-020-workspace/README.md) | active | 22 |
| [PF-021 日程与日历](PF-021-schedule-and-calendar/README.md) | active | 8 |

## 已排定、尚未开题的编号

这里只登记编号和主题，不提前创建空的 topic 包；正式开题时再按准入规则建包。

| 编号 | 预留主题 | 当前安排 |
|---|---|---|
| PF-018 | WebUI 交付面 | 预留编号，尚未开题 |
| PF-019 | Desktop 交付面 | 预留编号，尚未开题 |

PF-020「工作区」与 [PF-021「日程与日历」](PF-021-schedule-and-calendar/README.md) 已按原定顺序开题；其余预留主题尚未开题。

**PF-015 于 2026-09-21 开题**，见 [PF-015 会话的生命周期与归属](PF-015-session-lifecycle-and-ownership/README.md)。
它是 2026-09-17「agent-loop / session / inbound 会是多个 PF，不是单个」那条裁决
（记在 [PF-008 decisions](PF-008-human-in-the-loop/decisions.md#一拍板记录)）的**最后一个落点**——
agent-loop 是 [PF-012](PF-012-agent-loop-and-run/README.md)，
模型调用那一层是 [PF-013](PF-013-model-profiles-and-invocation/README.md)，
inbound 是 [PF-014](PF-014-inbound-intake-and-queueing/README.md)，**四个全部开题**。

> **那两条吊在「这段协作到此为止」上的规则，已经落到锚点上了。**
> 那个锚点是[归档](PF-015-session-lifecycle-and-ownership/design.md#会话归档)——
> [没有删除会话的概念，也就没有「会话结束」这回事](../ubiquitous_language/decisions.md#ul-d-4--主会话与子会话--2026-09-21)。
> **两条的去向各不相同**：
>
> - [会话授权上下文**不随归档消失**](PF-007-meta-capabilities/design.md#会话授权上下文)——
>   PF-007 rev 11 把它重定为**数据**，「随会话结束一起消失」那条作废；
> - [通信规则一的条件问题](PF-007-meta-capabilities/design.md#92-报告之后派发者再发一条消息子拿什么回应)
>   已由 PF-007 rev 10 闭合——规则一改双向，规则二的条件明确为**会话仍未被归档**。
>
> **PF-015 五块大纲现已全部有落点**（2026-09-23）：工具权限那条腿由
> [PF-007 §5.6](PF-007-meta-capabilities/design.md#56-一次放行判断走四步) 接住——
> 三档执行权限各落放行四步里的一处；执行环境权限归 [PF-005](PF-005-execution-environments-and-sandboxes/README.md)。
> PF-015 rev 13 已正式接受，范围与保留未决项见 [D-074](../record/decisions/session-workspace-product-acceptance/decision.md)。

> **2026-09-20**：**产品正文统一去历史化。**产品负责人的要求：
> **`design.md` 只记录最终正式确定的设计**——「之前怎么样、现在怎么样」与推导过程
> 一律不进正文，分别归 `changelog.md`、`decisions.md` 与 `interviews/`。
> **十四个 topic 的 `design.md` / `flows.md` / `acceptance.md` / `README.md` 全部过了一遍**：
> 删掉 rev 对照、交割说明、「原先写的是」，以及未决项里那些「rev N 已闭合」的条目；
> **现行规则一个字没改，所以除 PF-010 与 PF-012 之外不升 rev**。
> 这条规矩已写进[本区红线](AGENTS.md#红线)、`product-design` skill
> 与 drafter / reviewer 两个 role。

> **2026-09-19**：PF-011 开题为[非常态的分层处置](PF-011-off-nominal-handling/README.md)，
> 它的地盘此前由 PF-012 的一节暂时拿着。**PF-011 本轮设计按产品负责人要求全程未参考那一份。**
>
> **同日交割完成。**[PF-012 rev 2](PF-012-agent-loop-and-run/changelog.md) 在**同时看两边**的前提下
> 把「失败三档」整块交出，并补上 rev 1 漏掉的那一半——
> [Run 的终态与非常态的终局是两条线](PF-012-agent-loop-and-run/design.md#512-run-的终态与非常态的终局是两条线)。
> **PF-011 同步升到 rev 3**，[那边 §9.1 已关](PF-011-off-nominal-handling/changelog.md#rev-3--2026-09-19--交割完成两笔账清掉)，
> **模型一个字没改**。

> **2026-09-18 的一次编号重排**：PF-009 原名「上下文消息类型与上下文管理」，
> 因体量过大**收窄为只讲消息类型**；上下文管理与组装另立 PF-010，
> 异常分层处理另立 PF-011；**原 PF-010（Agent Loop 与 Run）顺延为 PF-012**。
> 记录见 [PF-012 changelog](PF-012-agent-loop-and-run/changelog.md)。

## 一个 topic 包含什么

```text
PF-0NN-<slug>/
├── README.md         定位、关系声明、状态              ← 必须
├── design.md         概念、模型、规则、取舍、边界、未决  ← 必须
├── flows.md          旅程、异常分支、状态流转、角色矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决        ← 必须
├── changelog.md      产品设计本身的演进（rev N）        ← 必须
├── interviews/       设计交流笔记（原始材料）
└── projection/       向 Cordis 的技术设计投影，按版本固化
```

四个必须的分别回答**是什么**、**谁定的**、**怎么变的**、**在哪**。
其余按实际情况取舍：没有多步旅程就不必有 `flows.md`。

**静态与动态分开**：`design.md` 说产品是什么，`flows.md` 说它怎么动。
研发查「这步失败了怎么办」去 flows，查「这个概念是什么」去 design。

## topic 之间怎么建立联系

关系声明在每个 topic 的 `README.md` front-matter，是唯一的机器可读处：

```yaml
relations:
  supersedes: [PF-0NN]          # 取代：对方全部内容被吸收，对方进 archive
  depends-on:                   # 依赖：引用对方定义，不重复展开
    - id: PF-0NN
      for: 一句话说明引用它的什么
  extends: []                   # 发展：扩展对方范围，对方继续有效
```

反向关系（谁依赖我）由工具派生，**不手写**——手写的反向索引每次重组就作废。

## 准入

建一个新 topic 之前必须能回答：

- 这解决谁的什么问题？（写不出「背景与问题」的 topic 不该存在）
- 不做会怎样？
- 边界到哪？它与现有 topic 的区别是什么？
- 改动它的原因，和改动现有 topic 的原因一样吗？（一样就不是新 topic）

答不上来就先不建包，把待答的问题留在交流笔记里。
**不要先创建空 topic 等着以后补齐**——空壳会被当成已有设计。

## 与技术设计的关系

产品设计是技术设计的**输入**，不是它的一部分：

```
product/<topic>/design.md   ──→  handbook skill A–G  ──→  spec/ · realization/
      （产品是什么）                                    （怎样实现）
                                      │
                                      └──→  product/<topic>/projection/vN/
                                            （投影视图，落回本 topic）
```

两者作者视角不同。产品设计不做技术判断；技术设计不改产品语义。
投影视图落回 topic 是为了让实施者有单一入口，它是派生快照而非权威。

## 数据字典的边界

概念的**业务属性与业务约束**写在 `design.md` 的概念定义里；
精确的数据结构、类型、格式归 [spec/](../spec/README.md) 的 Schema。

判据：这条约束产品负责人能看懂并判断对错吗？能，写产品侧；不能，归技术设计。
两边各写一份完整字段规格必然不一致。

返回[设计链入口](../README.md)。

## 2026-09-27 工作区产品增量正式登记

依据产品负责人授权“design/product 下的变更，如果未翻正式的，帮我翻一下顺手”，本次登记 PR #13 的 PF-001／002／003／004／005／006／007／014／015／016／017／020 工作区增量为正式产品设计。接受仅覆盖已确定条款与据已有裁决修正的残余矛盾；既有未决与此前接受范围保留，产品正式状态不升级冻结契约、提供者采用或实现完成度。独立评审范围与外部仓库登记仅参与者及受限时不取得工作区身份的同批裁决见 [PF-020 登记](PF-020-workspace/decisions.md#2026-09-27-产品正式状态登记)。
