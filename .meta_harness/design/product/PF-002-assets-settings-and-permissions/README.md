---
id: PF-002
title: 设置、权限与资产的展开
status: draft
revision: 0
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 范围化对象的四层作用域、三种合成语义、能力标识、official/customized
  extends: []
---

# PF-002：设置、权限与资产的展开

**[PF-001](../PF-001-identity-scope-and-agent-constraints/README.md) 把设置、权限、资产
三者定为「范围化对象」，说清了它们对外的样子——挂在哪一层、多层同时有值时怎么合成。
本 topic 把这三者展开：它们各自是什么，彼此之间是什么关系。**

一句话概括本 topic 的结论：**三者都是组合关系上的东西。**
资产之间组合，资产组装成 agent 也是组合；而设置与权限**附着在具体资产上**，
与资产之间同样是组合关系。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-001](../PF-001-identity-scope-and-agent-constraints/README.md)。直接使用它定义的**四层作用域**、**三种合成语义**、**能力标识**与 **official/customized**，不重复定义 |
| `extends` | 无 |

**与 PF-001 的分界**：同一个字段在多层都有值时听谁的，归 PF-001；
有哪几类资产、一个 plugin 里装了什么、一个 tool 的执行权限长什么样，归这里。
判据是**改动它的原因**——PF-001 因身份模型变，本 topic 因对象的种类或组合形状变。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

**draft，设计进行中。**本 topic 尚未定稿，**不可作为实施依据**。

已确定：

- 资产有**五类**：skill、tool、plugin、agent definition、slash command
- 资产之间是组合关系；资产组装成 agent 本质上也是组合关系
- 设置与权限是**具体资产的两种属性**；身份层的设置是持有资产上的**投影**
- **默认与强制**用同一个机制（`immutable`）表达，管资产、设置、权限三处
- 设置页**随资产自动增删**，且分「界面偏好」与「资产设置与权限」两块
- 「移除」与「禁用」是**两个动作**

**待裁决：无**（见 [decisions.md 第三节](decisions.md#三待裁决)）。

仍待填的是 [design.md §4](design.md#四概念定义) 那张表：**五类资产各自的详细定义与组合能力**。
在它填完之前本 topic 不能定稿——**那是这个 topic 的主体**。

`flows.md`、`acceptance.md`、`changelog.md` 在模型稳定之后再写——
现在写只会写成一份要推翻的东西。
