---
id: PF-002
title: 设置、权限与资产的展开
status: active
revision: 21
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
| 被谁展开 | [PF-003 资产的复制与分享](../PF-003-asset-transfer-and-sharing/README.md) 定义资产怎样跨组织流动，[PF-004 装配与存活](../PF-004-agent-definition-and-assembly/README.md) 定义怎样把这些搬进运行时，[PF-012 Agent Loop 与 Run](../PF-012-agent-loop-and-run/README.md) 定义 loop 上**一共有哪些拓展点位置**。三者都依赖本 topic，**方向不能反**：本 topic 不引用它们的结论 |
| `extends` | 无 |

**与 PF-001 的分界**：同一个字段在多层都有值时听谁的，归 PF-001；
有哪几类资产、一个 plugin 里装了什么、一个 tool 的执行权限长什么样，归这里。
判据是**改动它的原因**——PF-001 因身份模型变，本 topic 因对象的种类或组合形状变。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 资产怎么进来、怎么配、怎么组装，谁能做什么 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 21**，工作区本体与资产层分离的增量为草稿；**rev 20 已正式接受**（产品负责人，2026-09-26，[D-065](../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)），其接受范围与 OAuth 到期人工重授权的已知缺口保留。本次工作区增量不自动继承该接受状态。
- 未决项：**一项**（[§九](design.md#九未决项)）——同一份连接件送来的一条事件，走两种投递方式的哪一路；另有一处缺口**归会话那一块**（新会话以哪个 agent definition、哪个租户身份建），§九只指路
- 待裁决：**一项**（D-6，同上），见 [decisions §三](decisions.md#三待裁决)；D-2～D-4 已于 2026-09-24 裁定，D-5 的现行主线裁定已由 D-065 确认
- 技术投影：[v2](projection/README.md)，当前 accepted／post-review；规格来源已冻结，产品与节点以快照 hash 核对；显式缺口及未实现状态分别保留

技术投影按 `harness-design-handbook` skill 展开，
产物按其步骤 G 落回本包的 `projection/v2/`。

## 本包的文件

```text
PF-002-assets-settings-and-permissions/
├── README.md         本页：定位、关系、状态
├── design.md         概念、模型、规则、取舍、边界、未决
├── flows.md          旅程、异常分支、状态流转、角色矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
