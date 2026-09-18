---
id: PF-010
title: Agent Loop 与 Run
status: draft
revision: 1
relations:
  supersedes: []
  depends-on:
    - id: PF-008
      for: 两个维度的等待态、那个判断函数、决策池、永远等着
    - id: PF-007
      for: 十二扇门与常驻预算、Ask() 与会话授权上下文
    - id: PF-006
      for: 六种收场、可用性每次 run 开始前重算、替换件、等待态、中断不是失败
    - id: PF-004
      for: 运行实例、装配、注入；会话这个只引用不拥有的对象
    - id: PF-002
      for: 权限设置
  extends: []
---

# PF-010：Agent Loop 与 Run

> ## ⚠️ 这是草稿，设计尚未完成
>
> 骨架已经立住——**状态转移方程、恢复语义、失败三档、循环守卫四级**都已定。
> 但有几块**依赖尚未开始的 topic**，还有几处待裁决，全部列在
> [§9 未决项](design.md#九未决项)。**不要据此实施。**

**一次 run 到底怎么走完，停机之后又怎么接着走——本 topic 回答。**

前面几个 topic 各自定了 agent 能做什么（[PF-006](../PF-006-tools-and-skills/README.md)、
[PF-007](../PF-007-meta-capabilities/README.md)）、什么时候停下来等人（[PF-008](../PF-008-human-in-the-loop/README.md)）、
它由什么装配而成（[PF-004](../PF-004-agent-runtime-assembly-and-liveness/README.md)）。
**没有人回答的是：这些东西串起来，一次运行是怎么往前走的。**

一句话概括本 topic 的结论：

> **run 是数据，agent-loop 是方程。**
> 状态存在记录里，下一步由方程算出来——**所以停机不可怕，重算一遍就是了。**

## run 与 agent-loop

| | **run** | **agent-loop** |
|---|---|---|
| 是什么 | **数据 / 治理**的概念 | **执行逻辑**的描述 |
| 回答什么 | 这次运行是什么、归谁、**现在到哪一步了** | **从这一步怎么走到下一步** |
| 形态 | 可记录、可查、可审计的状态 | **状态转移方程** |
| 缺了它会怎样 | 停机之后**不知道当时在哪** | 知道在哪也**算不出下一步** |

**两个都要，缺一个恢复就不成立。**

## 方程

```text
下一步  =  f ( 记录 , 环境 )
```

**`f` 是纯的。**同一份记录配同一个环境，算出来的下一步唯一。

> **恢复不是「接着上次的进程」，是「重新算一遍 f」。**

## 关系

| 关系 | 本 topic 的情况 |
|---|---|
| `supersedes` | 无 |
| `depends-on` | [PF-008](../PF-008-human-in-the-loop/README.md)、[PF-007](../PF-007-meta-capabilities/README.md)、[PF-006](../PF-006-tools-and-skills/README.md)、[PF-004](../PF-004-agent-runtime-assembly-and-liveness/README.md)、[PF-002](../PF-002-assets-settings-and-permissions/README.md)，引用不改写 |
| `extends` | 无 |

**与 PF-008 的分界**：停下来等人这件事本身归 PF-008；**停在哪一步、怎么接着走**，归这里。

**与 PF-009 的分界**：[PF-009（编号已占，尚未开始）](../README.md)将定
**上下文的消息类型与上下文管理**。本 topic 只说压缩**在方程里的位置**与**它改不改记录**，
**压缩产出什么形状、摘要怎么组织，归 PF-009**。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| run 与 loop 是什么、方程长什么样、恢复怎么算 | [产品设计](design.md) |
| 哪些是拍板定的，哪些是推导的，还剩什么没定 | [决策与来源](decisions.md) |
| 这块设计怎么演变到今天 | [变更历史](changelog.md) |
| 当时是怎么谈的 | [设计交流笔记](interviews/README.md) |

## 状态

- 产品设计：**rev 1 · 草稿**，**设计未完成**
- 未决项：**见 [design.md §9](design.md#九未决项)**，其中数项**依赖尚未开始的 PF-009**
- 待裁决：见 [decisions.md 第三节](decisions.md#三待裁决)
- **依赖一个尚未成文的对象**：**会话**的完整定义归后续 PF，按
  [PF-004 的先例](../PF-004-agent-runtime-assembly-and-liveness/design.md#两个只引用不拥有的对象)
  只引用、不拥有
- 技术投影：**尚未开始，且草稿期不应开始**

## 本包的文件

```text
PF-010-agent-loop-and-run/
├── README.md         本页：定位、关系、状态
├── design.md         run 与 loop、状态转移方程、恢复、失败三档、循环守卫
├── decisions.md      拍板记录 / PM 推导 / 待裁决 / 来源问题
├── changelog.md      产品设计本身的演进
└── interviews/       设计交流笔记（原始材料）
```

**`flows.md` 与 `acceptance.md` 草稿期不写**——方程本身就是状态流转，
而验收标准要等设计定稿才有意义。定稿时补。
