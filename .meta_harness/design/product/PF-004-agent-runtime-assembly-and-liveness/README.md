---
id: PF-004
title: Agent 运行时——定义、装配与实例
status: active
revision: 2
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 身份与四层作用域、Context 两种、撤销的效应、成本按租户归属
    - id: PF-002
      for: 资产五类、能力标识、持有与层级求值、移除与禁用
  extends: []
---

# PF-004：Agent 运行时——定义、装配与实例

**[PF-002](../PF-002-assets-settings-and-permissions/README.md) 把 Agent Definition
定成一类资产，[PF-003](../PF-003-asset-transfer-and-sharing/README.md) 说清了它怎么流动。
本 topic 回答它们都没回答的问题：**一份定义怎么变成一个真正在跑的 agent。**

缺的不是一个环节，是一个**对象**——跑起来的那副身子此前没有名字，
于是「这个 agent 现在能做什么」「改一项权限要不要重启」「当时它装的是什么」
「成本算谁的」，一个都答不出来。

```text
Agent Definition ──装配(定义, 作用域)──→ 运行实例 ──→ 一次运行在它上面执行
   数据，长期          产出装配清单        计算资源，可回收可重建
                                                ↑
                          注入：上下文 · 执行环境 · 权限
                            （可变，实例不因此重建）
```

一句话概括本 topic 的结论：**有三个时刻，不是两个。**

| | **装配时** | **注入变化时** | **请求时** |
|---|---|---|---|
| 定什么 | 构成：动作空间、技能、**需要哪几类执行环境**、提示词的**成分** | 上下文、执行环境、权限 | 模型、提示词**成品**、上下文视图 |
| 变了 | 实例**重建** | 实例**不变** | 每次都重算 |

中间那一列是关键。没有它，任何环境或权限的变化都只能靠重建实例来生效，
而重建会打断正在进行的工作。

## 本 topic 只管实例化，不管驱动

**会话、输入的受理与排队、一次运行的驱动，都不在这里。**
本 topic 只用到它们各自的一件事：运行实例**附着在**一个会话上，
一次运行**在**运行实例上执行。

理由是三者的改动原因不同：会话因协作形态变，驱动因调度策略变，
实例化因装配与资源治理变。合在一起，改任何一处都要动其余两处。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-001](../PF-001-identity-scope-and-agent-constraints/README.md) 与 [PF-002](../PF-002-assets-settings-and-permissions/README.md)，引用不改写 |
| 上游前提 | [SYS-COMPOSITION](../../foundation/definition-and-runtime-composition/README.md)。**本 topic 是它在 agent 这件事上的产品落点**，不重复陈述结构本身 |
| `extends` | 无 |

**与 PF-002 的分界**：有哪几类资产、怎么组合、怎么求值，归 PF-002；
求值结果**怎样变成一个跑着的东西**，归这里。判据是**改动它的原因**——
PF-002 因对象的种类或组合形状变，本 topic 因装配与资源治理变。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：对象、三个时刻、不变式、取舍 | [产品设计](design.md) |
| 实例怎么装出来、变化怎么传播、怎么退役 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 2**，已定稿
- 未决项：**无**
- 待裁决：**无**
- 一处已报告、尚未裁决的来源问题：见 [decisions.md 第四节](decisions.md#四已知的来源问题)
- 技术投影：**尚未开始**

技术投影按[设计手册](../../../agents/skills/harness-design-handbook/canonical/SKILL.md)展开，
产物按其步骤 G 落回本包的 `projection/v1/`。

## 本包的文件

```text
PF-004-agent-runtime-assembly-and-liveness/
├── README.md         本页：定位、关系、状态
├── design.md         对象、三个时刻、不变式、规则、取舍、边界
├── flows.md          旅程、异常分支、状态流转、影响矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
