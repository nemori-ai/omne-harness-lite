---
id: PF-001
title: 身份、范围与对 Agent 的约束
status: active
revision: 3
relations:
  supersedes: []
  depends-on: []
  extends: []
---

# PF-001：身份、范围与对 Agent 的约束

**在本系统中，一个自然人可以同时在不同的组织下拥有不同的身份；
这个身份要能够约束该组织范围下一个 agent 的组装与行动。**

本 topic 定义账号、组织、租户、角色四种身份，以及身份如何通过设置、权限、资产
三类对象约束 agent——资产决定它由什么组装而成，权限决定它能做什么，设置决定它怎么做。
其中只有**资产**是独立对象，设置与权限是**资产的属性**；一个身份层的设置与权限，
是它持有的资产集合上的投影。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | 无。本 topic 是基础，不引用别人的结论 |
| 被谁展开 | [PF-002 设置、权限与资产的展开](../PF-002-assets-settings-and-permissions/README.md) 依赖本 topic，把资产的种类与组合展开。**方向不能反**：本 topic 不引用它的结论。其余紧邻内容（成本与账单明细、技能与工具的装载等）目前还没有对应的产品设计，分界见 [design.md 第八节](design.md#八边界与依赖) |
| `extends` | 无 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 用户怎么走、对象怎么流转、谁能做什么 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |
| 要实施它，当前该怎么做 | 技术投影**尚未开始** |

## 状态

- 产品设计：**rev 3**，已定稿
- 未决项：**无**
- 待裁决：**无**
- 技术投影：**尚未开始**

技术投影按[设计手册](../../../agents/skills/harness-design-handbook/canonical/SKILL.md)展开，
产物按其步骤 G 落回本包的 `projection/v1/`。

## 本包的文件

```text
PF-001-identity-scope-and-agent-constraints/
├── README.md         本页：定位、关系、状态
├── design.md         概念、模型、规则、取舍、边界、未决
├── flows.md          旅程、异常分支、状态流转、角色矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
