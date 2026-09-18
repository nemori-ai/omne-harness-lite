---
id: PF-006
title: 工具与技能
status: active
revision: 4
relations:
  supersedes: []
  depends-on:
    - id: PF-004
      for: 运行实例、装配清单、动作空间、注入、三个时刻、移除与禁用
    - id: PF-005
      for: 执行环境的四种、设施声明（供给侧）
    - id: PF-002
      for: 七类资产的形状与组合、层级求值
    - id: PF-001
      for: 租户与租户隔离
    - id: PF-007
      for: meta 的定义、哪些条目恒定占槽位
  extends: []
---

# PF-006：工具与技能

**[PF-002](../PF-002-assets-settings-and-permissions/README.md) 说了工具和技能各自是什么，
[PF-004](../PF-004-agent-runtime-assembly-and-liveness/README.md) 说了它们在装配的哪一步进来。
本 topic 补中间那段：**一份定义怎么变成 agent 真的能用的动作。

一句话概括本 topic 的结论：

> **「能做什么」「怎么够得着」「现在做不做得了」是三件事，正交，变化节奏各不相同。**

三件事混作一谈，「agent 怎么不会用这个工具」就永远查不出原因——
而它们的修法完全不同。

## 三层

| 层 | 回答什么 | 由谁决定 | 什么时候变 |
|---|---|---|---|
| **动作空间** | 我**能做**什么 | 构成 | 装配时；运行中 agent 自己追加 |
| **呈现方式** | 哪些**直接占槽位**，哪些**经代理够得着** | **常驻标记** | 装配时 |
| **当下可用性** | 现在**做不做得了** | **依赖解析** | **每次 run 开始前重算** |

**常驻标记挂在「装配它」这条引用上**，不在工具自身——上下文预算是装配方的问题，
工具作者不知道。两处都标了，**agent definition 压 plugin**。

**不可用时装的是同名替换件，不是不装。**否则动作空间随环境波动变形，
[I-4](../PF-004-agent-runtime-assembly-and-liveness/design.md#61-不变式) 当场作废，
而且用户查不出东西为什么没了。

## 一次工具执行的六种收场

**完成 / 失败 / 不可用 / 转后台 / 被中断 / 等不到应答。**

四种「非完成」里**只有一种是失败**。六种都以正常的返回消息到达 agent，
没有一种以异常形式抛给它——异常不带语义，agent 只能猜。

## 「工具」这个词指三样东西

```text
Tool Definition ──装配──→ 动作空间里的条目 ──调用──→ Tool Execution
   数据，长期                构成，绑运行实例          计算资源，绑 session
```

这是「数据 vs 计算资源」的**第四次出现**，但这次换了宿主——前三次的计算资源
（运行实例、沙箱本体）都挂在运行实例上，**这次挂在 session 上**。
正因如此，一次 run 结束了它发起的执行还能继续，结果照样回得到那个 session。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-004](../PF-004-agent-runtime-assembly-and-liveness/README.md)、[PF-005](../PF-005-execution-environments-and-sandboxes/README.md)（**rev 2 起**）、[PF-002](../PF-002-assets-settings-and-permissions/README.md)（**rev 2 起**）、[PF-001](../PF-001-identity-scope-and-agent-constraints/README.md)，引用不改写 |
| `extends` | 无 |

**与 PF-005 的分界**：执行环境**声明自己提供什么**，归 PF-005；
工具**声明自己需要什么**、怎么匹配、匹配不上怎么办，归这里。

**与 PF-007 的分界**：本 topic 定能力发现与取用**必须成立的性质**；
`Skills()` 与 `Tools()` 这两个常驻工具**具体长什么样**，归 PF-007。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：三层、依赖、执行、规则、取舍 | [产品设计](design.md) |
| 一次调用怎么走、变化怎么传播、执行怎么收场 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 4**，已定稿
- 未决项：**无**
- 待裁决：**无**
- 来源问题：**已全部闭合**（PF-004 的重建触发点已随其 rev 3 精化），
  处置记录见 [decisions.md 第四节](decisions.md#四已知的来源问题)
- 技术投影：**尚未开始**

技术投影按[设计手册](../../../agents/skills/harness-design-handbook/canonical/SKILL.md)展开，
产物按其步骤 G 落回本包的 `projection/v1/`。

## 本包的文件

```text
PF-006-tools-and-skills/
├── README.md         本页：定位、关系、状态
├── design.md         三层、常驻、依赖与可用性、工具执行、规则、取舍
├── flows.md          旅程、异常分支、状态流转、决定权矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
