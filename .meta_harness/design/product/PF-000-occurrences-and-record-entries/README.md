---
id: PF-000
title: 发生的事与记录条目
status: active
revision: 1
relations:
  supersedes: []
  depends-on:
    - id: PF-009
      for: 内容块与块标注——给谁看这件事归它，本 topic 不重定
    - id: PF-012
      for: 状态转移方程 f 与「记录先于可见」，「依据」这一档靠它才说得清
  extends: []
---

# PF-000：发生的事与记录条目

**系统里每天发生无数件事。哪些必须被记下来、记下来的那条算什么——本 topic 回答。**

它是后面每个 topic 共用的那一层：PF-001 的成员变更、PF-003 的资产转移、
PF-006 的工具执行、PF-008 的请示、PF-012 的每一步，**都要回答同一个问题**。
在此之前没有人拥有这个问题，于是每个 topic 各自凭感觉回答。

一句话概括本 topic 的结论：

> **先判断这件事要不要留下记录，再谈它留下的是几条、各自算什么。**
> **判断只有一个，打在「一件发生的事」身上；标记挂在它产出的每一条条目上。**

## 编号是 000，依赖却指向下游

**这不是笔误。**本 topic 的概念是从 PF-001 到 PF-012 已有的设计里提炼出来的，
不是先验地立在那里——所以它**引用**两处已有的权威，而不是重新定义它们：

| 引用谁 | 引用什么 | 为什么不自己定 |
|---|---|---|
| [PF-009](../PF-009-context-message-types/README.md) | [内容块](../PF-009-context-message-types/design.md#消息的内容是一串块不是一段文本)与[块标注](../PF-009-context-message-types/design.md#每个块带两个标注给人看吗给模型看吗) | **「给谁看」已经有主。**本 topic 定的是「留不留」，两件事必须分开 |
| [PF-012](../PF-012-agent-loop-and-run/README.md) | [状态转移方程](../PF-012-agent-loop-and-run/design.md#agent-loop)与[记录先于可见](../PF-012-agent-loop-and-run/design.md#61-日志先于可见) | **「依据」这一档的定义就是「方程要读它」**，离开方程说不清 |

> **⚠️ PF-012 目前是 draft。**本 topic 引用的是它已经稳定的那两条
> （[§5.2 记录是唯一的真相来源](../PF-012-agent-loop-and-run/design.md#52-会话日志是唯一的真相来源)、
> [§6.1 记录先于可见](../PF-012-agent-loop-and-run/design.md#61-日志先于可见)）。
> **PF-012 转正时，这两处引用要复核。**

## 它定什么，不定什么

| 定 | 不定 |
|---|---|
| **一件发生的事要不要留下记录**，凭什么判断 | **具体有哪些事件类型**——那归各自的 topic |
| 一条记录条目上**必须声明什么** | **存在哪里、存几份、留多久、用什么技术** |
| 哪些组合**不合法** | **给谁看**——归 [PF-009](../PF-009-context-message-types/README.md) |

**最后一格是红线。**[SYS-OBSERVABILITY](../../foundation/observability-and-logging/requirements.md)
明写「**不预选 OpenTelemetry、日志后端、统一 EventLog 或特定部署拓扑**」——
本 topic 说的是一条条目的**性质**，不是它**装在哪**。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-009](../PF-009-context-message-types/README.md)、[PF-012](../PF-012-agent-loop-and-run/README.md)，引用不改写 |
| `extends` | 无 |

反过来，**后续每个 topic 在给自己的东西定形态时都要回到这里**；
反向索引由工具派生，不在此手写。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 概念是什么、判断怎么做、哪些组合不合法 | [产品设计](design.md) |
| 拿一件真实发生的事走一遍 | [design.md §5.6 校准表](design.md#56-校准表拿真实发生过的事走一遍) |
| 哪些是拍板定的，哪些是推导的，还剩什么没定 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 1**
- 待裁决：见 [decisions.md 第三节](decisions.md#三待裁决)
- **一处已知的来源冲突**：见 [decisions.md 第四节](decisions.md#四已知的来源问题)
- 技术投影：尚未开始

## 本包的文件

```text
PF-000-occurrences-and-record-entries/
├── README.md         本页：定位、关系、状态
├── design.md         概念、三组标记、判断、禁格、校准表
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```

**`flows.md` 不写**——本 topic 没有多步旅程，它给的是一个判断和一组标记。
**`acceptance.md` 写**，因为「哪些组合不合法」正是可验收的。

返回[产品设计入口](../README.md)。
