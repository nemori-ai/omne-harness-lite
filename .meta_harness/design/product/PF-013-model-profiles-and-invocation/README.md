---
id: PF-013
title: 模型档案、调用与切换
status: active
revision: 9
relations:
  supersedes: []
  depends-on:
    - id: PF-000
      for: 记录条目——「用户换了模型」是一条要被记下来的事实
    - id: PF-001
      for: 组织与租户的范围、资产与设置的层级求值、不可覆盖标记——合法目标集合由它们算出
    - id: PF-002
      for: 设置是资产的属性、四层求值——「用哪个模型」是一项设置，本 topic 不另造配置机制
    - id: PF-004
      for: 模型在哪一刻被解析、换模型要不要重建实例、实际用了哪个要留痕
    - id: PF-009
      for: 消息的内容是一串块、流式怎么回来怎么拼成完整一份
    - id: PF-010
      for: 请求体怎么攒出来、装不下时的判断——切换后的生效走的就是这条既有流程
    - id: PF-011
      for: 试尽之后交给谁、非常态的分层处置与上交
    - id: PF-012
      for: 一次模型调用在 agent 的一步里站哪一步；本 topic 不改那个状态方程
  extends: []
---

# PF-013：模型档案、调用与切换

**我们能调哪些模型、怎么把一次请求发出去、调不通怎么办、用户怎么换。**

这一层此前没有主：[一次工具执行有 PF-006](../PF-006-tools-and-skills/README.md)，
而与它同级的一次模型调用空着——[PF-011 把这一层整格排了出来，一段一段点明各归谁](../PF-011-off-nominal-handling/design.md#模型调用那一层整格是这么分的)。
本 topic 接下那一格，并按产品负责人 2026-09-20 的裁决把**模型档案**与**会话切换模型**
一并纳入：三者共享同一批事实，拆开会让一条规则跨三个包。

**边界**：模型**怎么被选、谁能配、多层怎么覆盖**归 [PF-001](../PF-001-identity-scope-and-agent-constraints/README.md) 与
[PF-002](../PF-002-assets-settings-and-permissions/README.md)；**在哪一刻被解析、换了要不要重建实例**归
[PF-004](../PF-004-agent-definition-and-assembly/README.md)；**请求体的内容怎么攒出来**归
[PF-010](../PF-010-context-management-and-assembly/README.md)；**流式怎么拼**归
[PF-009](../PF-009-context-message-types/README.md)。本 topic 只拥有
**档案自身记哪些事实**、**把它发出去**、**这一层失败了能做什么**、**什么时候算试尽**、
以及**换模型这件事怎么发生**。

## 关系

| 关系 | 含义 | 本 topic 的情况 |
|---|---|---|
| `supersedes` | **取代**：对方全部内容被本 topic 吸收，对方退役进 [archive](../archive/README.md) | **无。**本 topic 填的是一处从未有人拥有的空格 |
| `depends-on` | **依赖**：引用对方已定义的概念，直接使用而不重复定义 | **八个**，见 front-matter。最要紧的两条：**合法目标集合**整个建立在 PF-001/002 的层级求值上，**切换的生效**整个走 PF-010 已有的组装判断 |
| `extends` | **发展**：在对方基础上扩展新范围，对方**继续有效** | **无** |

> **本 topic 不改 [PF-012](../PF-012-agent-loop-and-run/README.md) 的状态方程。**
> 这是产品负责人的明确要求，也是本次最要紧的一条设计——
> [理由记在 decisions](decisions.md#裁决-12-为什么是本次最要紧的一条)。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 用户怎么换模型、一次调用失败之后怎么走 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 这块设计是怎么演变到今天的 | [变更历史](changelog.md) |

## 状态

- 产品设计：**rev 9**（2026-09-23）——[变更历史](changelog.md)。
  **rev 4 已正式接受**（产品负责人 2026-09-23，[记录](decisions.md#2026-09-23--接受为正式)）；**rev 5–9 全文待产品负责人确认**
- 待裁决：**0**
- **本 topic 拥有[转换件的契约](design.md#转换件)**：按模态或文件媒体类型登记、同键可替换；
  一个块进，**别的模态的块作为派生表示挂在原块上，外加一段 transcript**；**转失败，那条消息不落盘**——输入被拒；模型回复那次调用照常结束、loop 退避之后另起新调用；工具结果让 Run 失败；不补偿。
  位置归 [PF-012](../PF-012-agent-loop-and-run/design.md#模态转换为什么必须落在这里)（rev 9），
  「有哪些模态、哪个模型收得下哪些」是大语言模型域定的，所以契约归这里
- **本 topic 与 [PF-012](../PF-012-agent-loop-and-run/README.md)、
  [PF-014](../PF-014-inbound-intake-and-queueing/README.md) 出自同一次联合修订**；
  三份此后各自演进、各自接受，状态不互相牵连
- 技术投影：尚未开始

## 本包的文件

```text
PF-013-model-profiles-and-invocation/
├── README.md         本页：定位、关系、状态          ← 必须
├── design.md         概念、模型、规则、取舍、边界      ← 必须
├── flows.md          换模型的旅程、失败之后怎么走
├── acceptance.md     产品视角的验收标准
├── decisions.md      拍板记录 / PM 推导 / 待裁决       ← 必须
├── changelog.md      产品设计本身的演进                ← 必须
└── interviews/       产品调研的来源与观察（不是依据）
```

> **没有 `projection/`**：技术投影尚未开始，**空目录不留**——
> [占位符会被当成已有设计](../AGENTS.md)。
