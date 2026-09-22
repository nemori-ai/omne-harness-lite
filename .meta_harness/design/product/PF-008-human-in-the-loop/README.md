---
id: PF-008
title: Human in the Loop
status: active
revision: 4
relations:
  supersedes: []
  depends-on:
    - id: PF-007
      for: Ask() 这扇门、会话授权上下文、放行由三样东西组合决定
    - id: PF-006
      for: 等待态原语、前台/后台两个维度、六种收场、中断不是失败
    - id: PF-004
      for: 装配清单，以及「只引用不拥有」的先例
    - id: PF-012
      for: Run 与 agent runtime
    - id: PF-015
      for: 会话的生命周期与归档、会话运行模式
    - id: PF-014
      for: 入站队列、插队
    - id: PF-002
      for: 权限设置
    - id: PF-001
      for: 租户与租户隔离
  extends: []
---

# PF-008：Human in the Loop

**[PF-007](../PF-007-meta-capabilities/README.md) 定了 agent 怎么问人（`Ask()` 那扇门），
但那只是 agent 那一侧。人在哪里看到这些问题、怎么答、答完怎么回去，本 topic 回答。**

还有一件 PF-007 没覆盖的事：**不是 agent 想问，是系统认为该问。**

一句话概括本 topic 的结论：

> **停下来等人，这件事挂在两个不同的生命周期上；
> 但人只看见一个池子——因为人不关心它挂在哪。**

## 两个维度，一个池子

| | **tool 的等待态** | **run 的等待态** |
|---|---|---|
| 谁停下来 | 一次工具执行 | 一个 run |
| 谁发起 | 工具内部的业务逻辑 | 系统，在拿到一次 llm 响应之后算出来 |
| 典型 | **`Ask()`** | **危险动作被拦下来给人看** |

**`Ask()` 属于左边。**run 之所以也停住，是因为它恰好是**前台**调用——
那是[前台/后台](../PF-006-tools-and-skills/design.md#66-前台后台-与-等待态是两个维度)在起作用，
不是新机制。**一个转到后台的工具进了等待态，它照样需要人输入，但 run 不受影响。**

## 永远等着

人不输入，就一直等。**没有超时，没有默认答案，系统永不替人作答**——
这条继承自 [PF-007](../PF-007-meta-capabilities/design.md#611-ask通向人)，
理由也一样：**等待期间什么都没发生，不花钱的等待没有理由到点**；
而设了上限就必须规定「到点算什么」，那就是替人签字。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-007](../PF-007-meta-capabilities/README.md)、[PF-006](../PF-006-tools-and-skills/README.md)、[PF-004](../PF-004-agent-definition-and-assembly/README.md)、[PF-002](../PF-002-assets-settings-and-permissions/README.md)、[PF-001](../PF-001-identity-scope-and-agent-constraints/README.md)、[PF-012](../PF-012-agent-loop-and-run/README.md)、[PF-015](../PF-015-session-lifecycle-and-ownership/README.md)、[PF-014](../PF-014-inbound-intake-and-queueing/README.md)，引用不改写 |
| `extends` | 无 |

**与 PF-007 的分界**：`Ask()` 这扇门长什么样、agent 侧看见什么，归 PF-007；
**等待怎么被承载、人在哪里答、答复怎么回传**，归这里。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 两个维度的等待态、决策池与卡片是什么 | [产品设计](design.md) |
| 人怎么走、run 怎么流转、谁能答什么 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 4**，**已正式接受**（rev 1 于 2026-09-17；**rev 3 随 [PF-007 rev 11](../PF-007-meta-capabilities/changelog.md) 重写了 §5.2 的一小节**——那里原本论证「agent 请示时不能给长期授权」，**前提已被推翻**；**rev 4 把「归后续 topic」的指路落到具体 topic，并统一「会话被归档」这个说法**）
- 未决项：**无**
- 待裁决：**无**
- **两个只引用、不拥有的对象现在各有其家**：**Run** 归
  [PF-012](../PF-012-agent-loop-and-run/README.md)，**会话**归
  [PF-015](../PF-015-session-lifecycle-and-ownership/README.md)。
  本 topic 按 [PF-004 的先例](../PF-004-agent-definition-and-assembly/design.md#三个只引用不拥有的对象)
  只引用、不拥有，用到哪几件事写在 [design.md §4](design.md#只引用不拥有的两个对象)
- 上游欠账：**已闭合**——[PF-007 rev 3](../PF-007-meta-capabilities/changelog.md) 已补上
  「**禁的是系统替人解释，不是禁止人给长期授权**」这句交叉引用
- 技术投影：**尚未开始**

技术投影按 `harness-design-handbook` skill 展开，
产物按其步骤 G 落回本包的 `projection/v1/`。

## 本包的文件

```text
PF-008-human-in-the-loop/
├── README.md         本页：定位、关系、状态
├── design.md         两个维度、判断函数、决策池、卡片、产品规则
├── flows.md          旅程、异常分支、状态流转、决定权矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
