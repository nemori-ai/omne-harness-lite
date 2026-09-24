---
id: PF-004
title: Agent 定义与装配
status: active
revision: 12
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 身份与四层作用域、Context 两种、撤销的效应、成本按租户归属
    - id: PF-002
      for: 资产八类、能力标识、持有与层级求值、移除与禁用
  extends: []
---

# PF-004：Agent 定义与装配

**[PF-002](../PF-002-assets-settings-and-permissions/README.md) 把 Agent Definition
定成一类资产，[PF-003](../PF-003-asset-transfer-and-sharing/README.md) 说清了它怎么流动。
本 topic 回答它们都没回答的问题：**一份定义，在某个作用域下，到底算出一个什么样的 agent。**

缺的不是一个环节，是一个**对象**——**当下那份构成**此前没有名字，
于是「这个 agent 现在能做什么」「改一项权限要不要重来」「当时它装的是什么」
「成本算谁的」，一个都答不出来。

```text
Agent Definition ──装配(定义, 作用域)──→ 装配清单 ──照它起──→ agent runtime
   数据，长期           一次求值            数据，可跨尝试复用     协程，归 PF-012
                                                 ↑
                           注入：上下文 · 执行环境 · 权限
                         （可变，清单不因此重算、协程不因此重起）
```

> **最右边那一格不归本 topic**，它归 [PF-012](../PF-012-agent-loop-and-run/README.md)。
> 用一个对象同时表示中间和右边两格，它就会**一半是不可变的数据、
> 一半是「占用即消耗的计算资源」**——[两者必须分开的依据见 UL-D-3](../../ubiquitous_language/decisions.md#ul-d-3--runtime-与活体--2026-09-20)：
> **数据在这里叫装配清单，活体在那边叫 agent runtime。**

一句话概括本 topic 的结论：**有三个时刻，不是两个。**

| | **装配时** | **注入变化时** | **请求时** |
|---|---|---|---|
| 定什么 | 构成：动作空间、技能、**需要哪几类执行环境**、提示词的**成分** | 上下文、执行环境、权限 | 模型、提示词**成品**、上下文视图 |
| 变了 | **重新装配**，得到新清单 | 清单**不变** | 每次都重算 |

中间那一列是关键。没有它，任何环境或权限的变化都只能靠重新装配来生效，
而重新装配会打断正在进行的工作。

## 本 topic 只管「算出一份构成」

**会话、输入的受理与排队、一次运行的驱动、那个协程的生灭，都不在这里。**
本 topic 只用到它们各自的一件事：**一次装配为一个会话而做**，
一次运行**照一份装配清单跑**，agent runtime **照它起**。

理由是四者的改动原因不同：会话因协作形态变，驱动因调度策略变，
**agent runtime 因资源治理变**，而装配因求值的输入变。
合在一起，改任何一处都要动其余三处。

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
| 清单怎么算出来、变化怎么传播、什么时候失效 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 12**，已定稿；**rev 12 的[「构成变小，也重新装配，下一次运行起生效」](design.md#三类变化背后只有一条判据系统提示词的成分会不会变)是主线裁定，待产品负责人确认**——
  非常驻条目被移除、禁用或收回「谁可以使用它」时成分不变，照判据字面清单会继续复用，这一句把它们也归到下一次运行起重新装配（**rev 11 写明 [I-4](design.md#61-不变式) 的时间尺度是一次运行**：一次运行之内权限怎么变都不改变动作空间，运行之间下一次装配按当时的权限求值——
  [「谁可以使用它」被收回的自下一次运行起不再装入](design.md#65-权限变化动作空间不变)，跟上 [PF-002 rev 19](../PF-002-assets-settings-and-permissions/changelog.md)；
  **rev 10 让[技能在系统提示词里的那一格](design.md#52-三段结构是递归的)跟上
  [PF-006 rev 15 的常驻](../PF-006-tools-and-skills/design.md#常驻)**：常驻的才进，进的是 name 与说明；
  rev 9 接住[工作区那一级的内容在装配时自动进来](design.md#装配)——跟上 [PF-002 rev 10](../PF-002-assets-settings-and-permissions/changelog.md)；
  rev 8 把[执行环境](design.md#执行环境)从「注入的三样之一」改判为「装配留下两样、落点每次执行现算」——跟上 [PF-005 rev 4](../PF-005-execution-environments-and-sandboxes/changelog.md)）
- 未决项：**两项**——[「master 的全套机制」包含哪些](design.md#九未决项)、
  [`spawn`/`delegate` 能不能派一份 master 定义](design.md#九未决项)
- 待裁决：**两项**（[D-1、D-2](decisions.md#三待裁决)，即上面那两条）。
  **第一条更要紧**：`non-master` 是由 master 反向定义的，**那份清单不全，这条线就划不准**
- 来源问题：[§6.3 判据没有覆盖非常驻条目](decisions.md#四已知的来源问题)那一条**已闭合**（rev 12，主线裁定）；其余仍按原处置
- 技术投影：**尚未开始**

技术投影按 `harness-design-handbook` skill 展开，
产物按其步骤 G 落回本包的 `projection/v1/`。

## 本包的文件

```text
PF-004-agent-definition-and-assembly/
├── README.md         本页：定位、关系、状态
├── design.md         对象、三个时刻、不变式、规则、取舍、边界
├── flows.md          旅程、异常分支、状态流转、影响矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
