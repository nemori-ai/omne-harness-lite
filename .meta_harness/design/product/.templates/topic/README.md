---
id: {{PF-0NN}}
title: {{一句话说清这个 topic 是什么}}
status: {{draft | active | retired}}
revision: {{N}}
relations:
  supersedes: []
  depends-on: []
  extends: []
---

# {{PF-0NN}}：{{标题}}

> 模板提示（成稿删除）：本页是 topic 入口。用**两三句话**说清这块在产品上解决什么、
> 边界到哪；概念与模型归 design.md，不在这里展开。
> front-matter 的 `relations` 是 topic 间关系的唯一声明处，工具据它派生反向索引。

{{这个 topic 在产品上解决什么问题，边界到哪里。写给第一次读到它的人。}}

## 关系

> 模板提示（成稿删除）：三种关系含义不同，不要混用。声明在 front-matter，
> 本节用人话解释**为什么**是这个关系。反向关系（谁依赖我）由工具派生，不在此手写。

| 关系 | 含义 | 本 topic 的情况 |
|---|---|---|
| `supersedes` | **取代**：对方全部内容被本 topic 吸收，对方退役进 [archive](../archive/README.md) 并带条款级映射 | {{列出并说明}} |
| `depends-on` | **依赖**：引用对方已定义的概念，本 topic 直接使用而不重复定义 | {{列出，并说明依赖它的哪一部分}} |
| `extends` | **发展**：在对方基础上扩展新范围，对方**继续有效** | {{列出并说明}} |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 用户怎么走、对象怎么流转、谁能做什么 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 这块设计是怎么演变到今天的 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |
| 要实施它，当前该怎么做 | [技术设计投影](projection/README.md) |

## 状态

- 产品设计：**rev {{N}}**，{{草稿 / 已定稿 / 部分待定}}
- 未决项：{{数量}}（见 [design.md 第九节](design.md#九未决项)）
- 待裁决：{{数量}}（见 [decisions.md 第三节](decisions.md#三待裁决)）
- 技术投影：{{尚未开始 / v{{N}} 可实施}}

## 本包的文件

> 模板提示（成稿删除）：**design.md、decisions.md、changelog.md 必须有**——
> 分别回答「是什么」「谁定的」「怎么变的」，缺一项就会有人来问而无处可查。
> 其余按 topic 实际情况取舍：没有多步旅程就不必有 flows.md，
> 没有独立交流场次就不必有 interviews/。

```text
{{PF-0NN}}-{{slug}}/
├── README.md         本页：定位、关系、状态          ← 必须
├── design.md         概念、模型、规则、取舍、边界      ← 必须
├── flows.md          旅程、异常分支、状态流转、角色矩阵
├── acceptance.md     产品视角的验收标准
├── decisions.md      拍板记录 / PM 推导 / 待裁决       ← 必须
├── changelog.md      产品设计本身的演进                ← 必须
├── interviews/       设计交流笔记（原始材料）
└── projection/       向 Cordis 的技术设计投影，按版本固化
```

**静态与动态分开看**：`design.md` 说产品是什么，`flows.md` 说它怎么动。
研发查「这一步失败了该怎样」去 flows，查「这个概念是什么」去 design。
