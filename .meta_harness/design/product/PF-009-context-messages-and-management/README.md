---
id: PF-009
title: 上下文消息类型与上下文管理
status: draft
revision: 1
relations:
  supersedes: []
  depends-on:
    - id: PF-010
      for: 记录、三类事件、组装与压缩在方程里的位置
    - id: PF-006
      for: 工具的产出、附件、卸载、六种收场
    - id: PF-008
      for: 决策卡片、答复怎么回到 run
    - id: PF-004
      for: 系统提示词的成分与三个时刻
    - id: PF-007
      for: 十二扇门与常驻预算、Cordis 视角的 scope
  extends: []
---

# PF-009：上下文消息类型与上下文管理

> ⚠️ **这是草稿，设计尚未完成。**
> 本版只做了**消息类型**这一块，**上下文管理整块尚未开始**。
> 缺口见 [design.md §9](design.md#九未决项)。**不要据此实施。**

前面几个 topic 都在往上下文里放东西——工具的返回、卡片的答复、事件做成的提醒——
**却没有人说过上下文里一共有哪几种东西**。

一句话概括本版的结论：

> **五种消息，按「谁在说话」分；其中一种是我们加的，它在任何一家供应商那里都不存在。**

## 五种消息

| 谁在说 | 这一种 | 它说的是什么 |
|---|---|---|
| **系统**，在开头 | `SystemMessage` | 你是谁、你该怎么做 |
| **人** | `UserMessage` | 我要你做什么 |
| **模型** | `AssistantMessage` | 我的回答，以及我要调哪些工具 |
| **工具** | `ToolMessage` | 你让我跑的那个，结果是这样 |
| **系统**，在中途 | **`SystemReminderMessage`** | **刚才发生了一件事，你得知道** |

**头一种与末一种都是系统在说话，但说的不是一回事**：前者是长期成立的设定，
后者是刚刚发生的事。**把后者做成前者，等于把一件偶发的事写进了长期设定。**

## `SystemReminderMessage` 为什么独立成一种

它在**任何一家供应商那里都不存在**，所以必须在发出去之前被翻译掉：

```text
          SystemReminderMessage
                    │
          ┌─────────┴─────────┐
          ↓                   ↓
      openai              anthropic
   DeveloperMessage      UserMessage
```

**把选择推迟到 adapter，是让每一家都能用它最合适的形状。**
在模型层就定死成用户消息，openai 那边就永远用不上更贴切的那个。

**而标识由系统加，不由产生提醒的那一处加**——
生产者交出来的是一条消息，不是一段带标签的文本，**它根本没有机会伪造**。

## 说状态的取代，说事的追加

| 它说的是 | 新的来了，旧的怎么办 |
|---|---|
| **现在是什么样** | **取代**——只留最新的那份 |
| **刚才发生了什么** | **追加**——旧的照样留着 |

**判据：这条提醒讲的是一个状态，还是一件事。**
状态有「当前值」，事没有——**事只有发生过与没发生过**。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-010](../PF-010-agent-loop-and-run/README.md)、[PF-006](../PF-006-tools-and-skills/README.md)、[PF-008](../PF-008-human-in-the-loop/README.md)、[PF-004](../PF-004-agent-runtime-assembly-and-liveness/README.md)、[PF-007](../PF-007-meta-capabilities/README.md) |
| `extends` | 无 |

**与 PF-010 的分界**：那边定**什么时候**把事件做成消息，这边定**做成什么**。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 有哪几种消息、`SystemReminderMessage` 凭什么独立 | [产品设计](design.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的、参考了什么 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 1 · 草稿**
- **上下文管理整块尚未开始**——压缩产出什么形状、上下文怎么组装成一次请求，全都没定
- 待裁决：**1 项**（[D-1](decisions.md#三待裁决) 另一个 agent 发来的消息算哪一种）
- 技术投影：**尚未开始**

## 本包的文件

```text
PF-009-context-messages-and-management/
├── README.md         本页：定位、五种消息、关系、状态
├── design.md         背景、消息类型、模型、规则、取舍、未决项
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```

**草稿期没有 `flows.md` 与 `acceptance.md`**——
消息类型本身没有流程，而验收标准要等上下文管理那块定下来才有意义。
