---
id: PF-002
title: 资产的种类与组合
status: draft
revision: 0
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 资产作为范围化对象的层次、合成语义与能力标识；official/customized 的含义
  extends: []
---

# PF-002：资产的种类与组合

**「资产」这个抽象下面有四类具体的东西：skill、tool、plugin、agent definition。
它们之间是组合关系，而资产组装成一个 agent，本质上也是同一种组合关系。**

[PF-001](../PF-001-identity-scope-and-agent-constraints/README.md) 定义了资产
**对外**的样子——它挂在哪一层身份上、多层同时有值时怎么合成。
本 topic 定义资产**对内**的结构：有哪几类、谁能组合谁、组合出来的东西怎么确定。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-001](../PF-001-identity-scope-and-agent-constraints/README.md)。本 topic 直接使用它定义的**能力标识**、**五层作用域**、**资产合成语义**与 **official/customized**，不重复定义 |
| `extends` | 无 |

**与 PF-001 的分界**：同一个字段在多层都有值时听谁的，归 PF-001；
一个 plugin 里装了哪些 skill、一个 agent 由什么组装而成，归这里。
判据是**改动它的原因**——PF-001 因身份模型变，本 topic 因资产种类或组合语义变。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

**draft，设计进行中。**本 topic 尚未定稿，**不可作为实施依据**。

- 已确定：四类资产的名字、"资产之间与资产到 agent 都是组合关系"这一判断
- 待裁决：见 [decisions.md 第三节](decisions.md#三待裁决)

`flows.md`、`acceptance.md`、`changelog.md` 在模型稳定之后再写——
现在写只会写成一份要推翻的东西。
