---
id: PF-013
title: 模型档案、调用与切换
status: active
revision: 17
relations:
  supersedes: []
  depends-on:
    - id: PF-000
      for: 记录条目——「用户换了模型」是一条要被记下来的事实
    - id: PF-001
      for: 组织与租户的范围、资产与设置的层级求值、不可覆盖标记——合法目标集合由它们算出
    - id: PF-002
      for: 设置是资产的属性、四层求值——「用哪个模型」是一项设置，本 topic 不另造配置机制
    - id: PF-004
      for: 模型在哪一刻被解析、换模型要不要重建实例、实际用了哪个要留痕
    - id: PF-009
      for: 消息的内容是一串块、流式怎么回来怎么拼成完整一份
    - id: PF-010
      for: 请求体怎么攒出来、装不下时的判断——切换后的生效走的就是这条既有流程
    - id: PF-011
      for: 试尽之后交给谁、非常态的分层处置与上交
    - id: PF-012
      for: 一次模型调用在 agent 的一步里站哪一步；本 topic 不改那个状态方程
  extends: []
---

# PF-013：模型档案、调用与切换

**我们能调哪些模型、怎么把一次请求发出去、调不通怎么办、用户怎么换。**

本 topic 拥有 [PF-011 的一次模型调用层](../PF-011-off-nominal-handling/design.md#模型调用那一层整格是这么分的)，以及**模型档案**与**会话切换模型**：三者共享同一批事实，拆开会让一条规则跨三个包。消费方处理或自行保管结果后，可以确认并触发模型侧副本清理，让超长期运行不必永久积累每次调用的临时内容。

**边界**：模型**怎么被选、谁能配、多层怎么覆盖**归 [PF-001](../PF-001-identity-scope-and-agent-constraints/README.md) 与
[PF-002](../PF-002-assets-settings-and-permissions/README.md)；**在哪一刻被解析、换了要不要重建实例**归
[PF-004](../PF-004-agent-definition-and-assembly/README.md)；**请求体的内容怎么攒出来**归
[PF-010](../PF-010-context-management-and-assembly/README.md)；**流式怎么拼**归
[PF-009](../PF-009-context-message-types/README.md)。本 topic 只拥有
**档案自身记哪些事实**、**把它发出去**、**这一层失败了能做什么**、**什么时候算试尽**、
以及**换模型这件事怎么发生**、**消费方确认结果后模型侧副本怎样结束保管**。

## 关系

| 关系 | 含义 | 本 topic 的情况 |
|---|---|---|
| `supersedes` | **取代**：对方全部内容被本 topic 吸收，对方退役进 [archive](../archive/README.md) | **无** |
| `depends-on` | **依赖**：引用对方已定义的概念，直接使用而不重复定义 | **八个**，见 front-matter。最要紧的两条：**合法目标集合**整个建立在 PF-001/002 的层级求值上，**切换的生效**整个走 PF-010 已有的组装判断 |
| `extends` | **发展**：在对方基础上扩展新范围，对方**继续有效** | **无** |

> **本 topic 不改 [PF-012](../PF-012-agent-loop-and-run/README.md) 的状态方程。**
> 这是产品负责人的明确要求，也是本次最要紧的一条设计——
> [理由记在 decisions](decisions.md#裁决-12-为什么是本次最要紧的一条)。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 用户怎么换模型、一次调用失败之后怎么走 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 这块设计是怎么演变到今天的 | [变更历史](changelog.md) |

## 状态

- 产品设计：**rev 17**，调用结果确认与副本清理增量经独立评审并按 [D-110 后继](../../record/decisions/model-runtime-reference-lifecycle-adoption/ack-product-and-direction-decision.md)接受；输入范围的正式接受沿 [D-096](../../record/decisions/model-profile-input-limits-product-adoption/decision.md)，其余范围及逐次状态见 [decisions](decisions.md)。技术规格、提供者映射或实现接受不随本稿升级。
- 待裁决：**0**
- **[消费方确认结果后清理模型侧副本](design.md#619-消费方确认结果后清理模型侧不再需要的副本)**：消费方已自行处理或保管即可确认，不依赖正式 Session 完整实现。确认、清理完成与调用收场分别可见；释放句柄不自动确认，确认不取消执行、不改结果事实、不抹账，也不等待所有历史消费者。
- **[上游限制与档案提供的上限分别可读](design.md#上游限制与档案提供的上限)**：上游限制可以明确未知；官方与自建档案实际提供的输入范围必须有明确、有限的上限。提供图片输入就必须给出单图字节上限，缺失或超过相应限额检查都不能先发请求；token 允许有依据估算和明确余量，字节与图片数量精确检查。
- **凭据只在租户层**：每人自取，[组织那一层不持有](design.md#组织那一层为什么不持有)；出厂默认那一格另有部署配的一把
- **档案的身份是[所在范围加路由名](design.md#档案的身份所在范围加路由名)**：官方、组织、租户可以各有一条同路由名的，列表上每条标着来源；[已撤回的可以恢复在册](design.md#64-撤回不删行会话指向被撤回的档案时说已下架)
- **路由名就是能力**：「用哪个模型」记的是名字，同名的几条**运行时按层从下往上覆盖**（租户 > 组织 > 官方）——先滤掉已撤回的与这个范围不允许的，再取最具体一格；
  组织的锁锁的是名字；被盖住的照列、只作标注；[链上同名都撤回了才说「已下架」](design.md#64-撤回不删行会话指向被撤回的档案时说已下架)
- **「用哪个模型」这项设置的值是一个路由名，不是某一层的某一行**；验收已按同名覆盖写（S5f、S5g、S5j、S5k、S10e）
- 来源问题：新增两条未处置——档案没有「把替换锁住」这一把；词条与对象条目要跟上（[decisions §四](decisions.md#四已知的来源问题)）
- **本 topic 拥有[转换件的契约](design.md#转换件)**：按模态或文件媒体类型登记、同键可替换；
  一个块进，**别的模态的块作为派生表示挂在原块上，外加一段 transcript**；**转失败，那条消息不落盘**——输入被拒；模型回复那次调用照常结束、loop 退避之后另起新调用；工具结果让 Run 失败；不补偿。
  **模型读的是转出来的那一份时，用户要看得出**——落在[交付面对那条消息的呈现](../PF-016-cli-tui-delivery-surface/design.md#621-被转换过的消息呈现上说得出模型读的是哪一份)上。
  位置归 [PF-012](../PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里)（rev 9），
  「有哪些模态、哪个模型收得下哪些」是大语言模型域定的，所以契约归这里
- **本 topic 与 [PF-012](../PF-012-agent-loop-and-run/README.md)、[PF-014](../PF-014-inbound-intake-and-queueing/README.md) 各自演进、各自接受**，状态不互相牵连
- 技术投影：[v2](projection/README.md)，当前 accepted／post-review；规格来源已冻结，产品与节点以快照 hash 核对；显式缺口及未实现状态分别保留

## 本包的文件

```text
PF-013-model-profiles-and-invocation/
├── README.md         本页：定位、关系、状态          ← 必须
├── design.md         概念、模型、规则、取舍、边界      ← 必须
├── flows.md          换模型的旅程、失败之后怎么走
├── acceptance.md     产品视角的验收标准
├── decisions.md      拍板记录 / PM 推导 / 待裁决       ← 必须
├── changelog.md      产品设计本身的演进                ← 必须
├── interviews/       产品调研的来源与观察（不是依据）
└── projection/       技术投影（按版本固化的派生快照，不是权威）
```


[Session 归属、Run 工作与句柄](../PF-012-agent-loop-and-run/design.md#613-取消跟着宿主走)，持久关联见 [PF-015 §6.21](../PF-015-session-lifecycle-and-ownership/design.md#621-三类-runtime-的归属与执行关联)；释放 Agent runtime 不取消模型／工具执行。
