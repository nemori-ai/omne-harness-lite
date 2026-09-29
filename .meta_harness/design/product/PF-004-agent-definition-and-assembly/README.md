---
id: PF-004
title: Agent 定义与装配
status: active
revision: 20
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 身份与四层作用域、Context 两种、撤销的效应、成本按租户归属
    - id: PF-002
      for: 资产八类、能力标识、持有与层级求值、移除与禁用
    - id: PF-020
      for: 工作区来源、身份与实例边界，相关规则按工作区产品设计求值
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
会话类型要求 ＋ Agent Definition ＋ 作用域输入
                  └──装配──→ 装配清单 ──照它起──→ agent runtime
                    一次求值    数据，可跨尝试复用     协程，归 PF-012
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
一次运行**按当前已生效装配清单推进**，agent runtime **照它起**。

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

明确会话与各 runtime 消费关系；能力身份单调保留，数据／实现更新不自动重建 Agent runtime；必需能力不等于 Loop 的直接服务依赖。本轮为产品规则与消费边界的修订，未据此接受具体 Cordis 插件划分或实现。

补齐 Agent runtime 装配输入、可变性、作用范围和触发矩阵；显式 reload 可在同一 Run 采用同身份新版并开启新尝试；撤除与不可用只给原则。本次为产品设计增量，直接裁决与 PM 推导见 decisions；不扩大此前整包接受、规格或实现状态。

- 产品设计：**rev 20**，定义身份固定、同身份内容在运行边界热重载，能力装卸的会话声明参与求值；本轮明确自动继承默认 false、声明随生效定义，补齐 official 定义不可替换与三层自定义 non-master 边界；三类能力绑定规则由产品负责人直接裁定，推导与未决项另记；此前 rev 13 工作区一致性增量仍为草稿，原有整包接受与评审范围不扩张。此前状态：**rev 12，已正式接受**（产品负责人，2026-09-26，[D-065](../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。现行规则及显式缺口按本包正文。
- 未决项：当前装配范围无；spawn／delegate 可选 master，连接件范围搁置。
- 待裁决：**两项**（[D-1、D-2](decisions.md#三待裁决)）；D-3 已闭合：默认 false，声明随生效定义。
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


创建、动态部件与持久化的当前规则见 [PF-015 完整矩阵](../PF-015-session-lifecycle-and-ownership/design.md#616-会话组成与创建输入)。本 topic 的本轮变更见 [changelog](changelog.md)。

本次产品裁决：明确 spawn／delegate 允许 master 与 non-master，定义类型不改变子会话关系。新增裁决的依据与范围见 decisions；不扩大既有整包接受、规格或实现状态。
