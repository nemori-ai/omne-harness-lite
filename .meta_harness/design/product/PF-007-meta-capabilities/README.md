---
id: PF-007
title: Meta Capabilities
status: active
revision: 16
relations:
  supersedes: []
  depends-on:
    - id: PF-006
      for: 常驻、槽位、动作空间、可用性、替换件、六种收场、等待态
    - id: PF-005
      for: 执行环境的四种、设施
    - id: PF-002
      for: 八类资产、多命令工具只占一个槽位、派发权限
    - id: PF-004
      for: 装配、注入
    - id: PF-012
      for: agent runtime、Run、会话日志
    - id: PF-015
      for: 会话的生命周期与归档、会话运行模式、会话授权上下文在会话上的承载
    - id: PF-001
      for: 租户隔离、official 与 customized
  extends: []
---

# PF-007：Meta Capabilities

**[PF-006](../PF-006-tools-and-skills/README.md) 定了「常驻」，并说有**一批条目恒定占槽位、
任何人关不掉**——那批是什么、有几扇、各自长什么样，本 topic 回答。**

答案是**十三扇门**。（PF-006 rev 1 当时写的是「只有能力发现与取用的两个入口」，
本 topic 落定之后已随其 rev 2 改过来。）

一句话概括本 topic 的结论：

> **meta 是一整类能力的统一入口。它自己不是某一个动作，而是通向一族动作的那扇门。**

「工具的工具、技能的技能」是这个定义最纯的两个例子。这十三扇门合起来，
就是**一个 agent 的基本盘**——什么都不配的 agent，天生就有它们。

## meta 必定常驻，而那不是产品选择

```text
够到非常驻能力的唯一途径 ──是──→ meta
                ↑                  │
                └── 如果 meta 自己也不常驻 ──┘
                    那就永远够不着它
```

自指的闭环，**必须有一个不动点**。所以「必定常驻」是结构逼出来的，不是我们规定的。
反过来，**常驻不一定是 meta**：一个普通工具标了常驻，它只是占了个位置。

**meta 不可禁用、不可替换。**关掉一扇门，等于门后一整类能力凭空消失。

## 十三扇门，五族

| 族 | 作用于 | 有哪些 |
|---|---|---|
| **世界** | 系统之外的东西 | `Files()` `Shell()` `Web()` `Browser()` `Computer()` |
| **自己的能力集** | agent 由什么构成 | `Tools()` `Skills()` |
| **自己的运行状态** | 正在做什么、做到哪 | `TodoItems()` `BkgJobs()` |
| **他者** | 别的主体 | `Agents()` `Ask()` |
| **自己的底层结构** | agent **赖以成立**的那两套结构 | `Cordis()`（行动 / 拓扑）· `Engram()`（知识）——**都不在首批** |

**五族的风险完全不同**：世界族碰外部效果，能力族碰自己的构成，
状态族只碰自己，他者族要占用别人的时间，**底层结构族碰的是 agent 赖以成立的东西**。

**最后一族的两个都不在首批，不是巧合：**

> **动自己赖以成立的东西，是最彻底的能力，也是最该缓的。**

**两个的「不交付」程度也不一样**：`Cordis()` **定义完整、只是不实现**；
`Engram()` **只占位**——**连命令集都不定**，
[本版只声明终局会有它](design.md#613-engram通向自己的知识结构占位声明不作实现交付要求)。

## 十三个槽位是地板，但门后的能力没有上限

全部采用**多命令范式**——一套命令一个入口，
[整套只占一个槽位](../PF-002-assets-settings-and-permissions/design.md#八类资产)。
`Files()` 有十一个命令，占一个位置。

> **常驻预算的正确用法，是把钱花在门上，不是花在具体的动作上。**

装一千个工具，`Tools()` 仍然只占一个位置。

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-006](../PF-006-tools-and-skills/README.md)、[PF-005](../PF-005-execution-environments-and-sandboxes/README.md)、[PF-002](../PF-002-assets-settings-and-permissions/README.md)、[PF-004](../PF-004-agent-definition-and-assembly/README.md)、[PF-001](../PF-001-identity-scope-and-agent-constraints/README.md)、[PF-012](../PF-012-agent-loop-and-run/README.md)、[PF-015](../PF-015-session-lifecycle-and-ownership/README.md)，引用不改写 |
| `extends` | 无 |

**与 PF-006 的分界**：常驻这个机制怎么运作，归 PF-006；
**哪些东西必定常驻、各自长什么样**，归这里。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| meta 是什么、十三扇门各自的命令与性质 | [产品设计](design.md) |
| agent 怎么用这些门、哪些路径必须走得通 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 16**，**已正式接受**（[逐版变更见 changelog](changelog.md)；**rev 16 把放行四步的第 ② 步与 PF-002 三档执行权限对上，运行模式只在第 ④ 步出场**；**rev 11 重定授权模型——用嘴说的话算数，而且能说得出作用域**；**rev 12 定下「只保守」**；**rev 13 把放行判断展开成四步，并划清「权限关得掉一条命令、关不掉一扇门」**；**rev 14 把几处仍按旧模型写的措辞对齐到现行结论**；**rev 15 定死 `spawn` 交出去的是上下文副本，并把「授权表达」定为正式名**）
- 未决项：**一项**——**[§9.2](design.md#92-报告之后派发者再发一条消息子拿什么回应) 报告之后 master 再发一条消息，子拿什么回应**（**通路已通**，剩下那条回应算不算子会话里新的一次运行）
- 待裁决：**无**。
  **D-1 已于 rev 15 闭合**：`spawn` 交出去的是[派发那一刻组装出来的那份上下文的副本](design.md#两处分水岭各自只有一条)，**不是共享一本账**。
  **D-2 已于 rev 12 闭合**：表达不清按最窄算，**这是授权的原则**。
  **§9.2 不列为待裁决**——剩下那一半要等[同一子会话上的并发派发](../PF-015-session-lifecycle-and-ownership/design.md#九未决项)定了才谈得上选
- 交付范围：**十一扇门首批交付**；`Cordis()` **定义完整但不实现**，`Engram()` **只占位**
- 上游欠账：**已全部闭合**。rev 2 报告的那笔（PF-006「等待态等不到应答有上限」对
  `Ask()` 不成立）已由 [PF-006 rev 3](../PF-006-tools-and-skills/changelog.md) 闭合；
  rev 1 的三笔更早已闭合
- 技术投影：**尚未开始**

技术投影按 `harness-design-handbook` skill 展开，
产物按其步骤 G 落回本包的 `projection/v1/`。

## 本包的文件

```text
PF-007-meta-capabilities/
├── README.md         本页：定位、关系、状态
├── design.md         meta 的定义、五族、十三扇门逐个设计、取舍
├── flows.md          旅程、异常分支、状态流转、决定权矩阵
├── acceptance.md     可观察场景、绝不能发生的事、判据
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```
