---
id: PF-014
title: 输入的受理与排队
status: active
revision: 8
relations:
  supersedes: []
  depends-on:
    - id: PF-000
      for: 记录条目——每一件从外面到达的事都要先成为一条记下来的事实
    - id: PF-002
      for: 连接件是「agent 从哪里被触达」的那个资产、斜杠命令（三种绑定目标、只由交付面识别）、拓展件的形状与授权
    - id: PF-006
      for: 六种收场、转后台（声明允许时）、中断不是失败——插队要把正在跑的工具推向其中两种
    - id: PF-007
      for: Ask() 的等待复用工具等待态原语，且前台阻塞不过期
    - id: PF-008
      for: 决策卡片与决策池、等待期间照常收、答复只在卡片上做
    - id: PF-009
      for: 中断时已经吐出来的那半份怎么收成一条消息
    - id: PF-010
      for: 组装是纯派生的——到达的东西必须先落盘，不能攒在内存里等组装去取
    - id: PF-012
      for: 待处理消息队列、Run 的边界由 loop 进出划定、状态转移表与两层循环的出口、拓展点
    - id: PF-013
      for: 一次模型调用被中断是它的一种收场，且不带故障成因；用户可以单独中断一次模型调用；转换失败即不落盘
  extends: []
---

# PF-014：输入的受理与排队

**外面进来的每一件事，怎么被收下、怎么排队、什么时候被取走。**

一个会话随时会被外面找上：用户说话、外部消息推进来、到点了、别的会话捎来一句、
后台活干完了、人答了一张卡片。**它们与一次运行的生命周期不对齐**——
可能在运行中途到达、在它停着等人的时候到达、也可能在它早就结束之后才到达。
本 topic 定的是**怎么收、收下之后算什么、什么时候到 agent 眼前**。

**两个穷举是本 topic 的核心交付**（产品负责人点名要的）：
**什么会发起一次运行**，以及**什么会影响「退出循环」这个判断**。

> **第一个穷举的形式由 PF-012 定死：**
> 「[触发就是让待处理消息队列从空变成非空的那件事](../PF-012-agent-loop-and-run/design.md#run)」，
> 所以**要穷举的不是「哪些情形会开运行」，而是「什么会进队列」**——
> **不必逐情形判断「此刻有没有运行在跑」**。

**边界**：**loop 自己怎么转、从哪里出去**归
[PF-012](../PF-012-agent-loop-and-run/README.md)，本 topic 不改那个模型；
**卡片长什么样、决策池怎么陈列**归 [PF-008](../PF-008-human-in-the-loop/README.md)；
**被中断的那半份回复怎么收成消息**归 [PF-009](../PF-009-context-message-types/README.md)；
**工具的转后台声明与六种收场**归 [PF-006](../PF-006-tools-and-skills/README.md)。
本 topic 只拥有**受理、排队、调序、取批**，以及**控制指令的受理**。

## 关系

| 关系 | 含义 | 本 topic 的情况 |
|---|---|---|
| `supersedes` | **取代**：对方全部内容被本 topic 吸收，对方退役进 [archive](../archive/README.md) | **无。**本 topic 填的是一处从未有人拥有的空格 |
| `depends-on` | **依赖**：引用对方已定义的概念，直接使用而不重复定义 | **九个**，见 front-matter。最要紧的一条：**插队的全部效果都建立在 PF-012 已定的状态转移与出口模型上**，本 topic 一个新分支都不加 |
| `extends` | **发展**：在对方基础上扩展新范围，对方**继续有效** | **无** |

> **[PF-012 §5.8](../PF-012-agent-loop-and-run/design.md#58-loop-拓展点) 已经把「消息落盘之前」这个拓展点划了一半给本 topic**：
> 那个位置存在、挂的是拓展件、走同一套干预力，归 PF-012；
> **那一刻具体看得到什么、队列怎么排、一次取几条，归这里。**
>
> **⚠️ 那个位置比本 topic 的受理面大**：它**每有一条消息落盘就经过一次**，
> 包括模型吐的、工具交回来的。**本 topic 只管其中「从外面进来」的那些。**

**[待处理消息队列](../PF-012-agent-loop-and-run/design.md#待处理消息队列)这个概念归 PF-012，本 topic 不另造。**
**不要管它叫「输入队列」**——[同一个概念只有一个说法](../../ubiquitous_language/README.md)。

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 这块产品是什么：概念、模型、规则、取舍 | [产品设计](design.md) |
| 用户插队怎么走、一条消息从到达到被取走经过什么 | [流程与状态](flows.md) |
| 做成什么样算做对了 | [验收标准](acceptance.md) |
| 哪些是拍板定的，哪些是推导的，还有什么没定 | [决策与来源](decisions.md) |
| 这块设计是怎么演变到今天的 | [变更历史](changelog.md) |

## 状态

- 产品设计：**rev 8**，本次工作区显式资产 reload 增量**已正式接受**（2026-09-27，依据[本次登记](decisions.md#2026-09-27-工作区增量正式状态登记)）；rev 5 的定稿范围保留，**rev 6、rev 7 仍待产品负责人确认**，既有未决和未覆盖范围不随本事件闭合。
- 待裁决：**0**，去向见 [decisions.md 第三节](decisions.md#三待裁决)
- **连接件的事件可以经受理开出一个新会话**（[§5.7](design.md#57-穷举一什么会让队列从空变成非空) 第四行）：本 topic **只登记这一路存在**；
  新会话以哪个 agent definition、哪个租户身份建归会话那一块，去重、合并与这一路的验收下次升 rev 时做（[decisions §四](decisions.md#四已知的来源问题)）
- **本 topic 引入的三个概念已经落进词表**：
  [入站到达](../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-inbound-arrival--入站到达--inbound-arrival) ·
  [控制指令](../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-control-command--控制指令--control-command) ·
  [插队](../../ubiquitous_language/terms/interaction-and-dispatch.md#ul-queue-jump--插队--queue-jump)，
  外加 PF-012 那边的[待处理消息队列](../../ubiquitous_language/terms/agent-runtime-loop.md#ul-pending-message-queue--待处理消息队列--pending-message-queue)
- **[PF-013](../PF-013-model-profiles-and-invocation/README.md) 与
  [PF-012](../PF-012-agent-loop-and-run/README.md) 是同一次联合修订的另两份产物**，要对齐后才谈接受
- 技术投影：尚未开始

## 本包的文件

```text
PF-014-inbound-intake-and-queueing/
├── README.md         本页：定位、关系、状态          ← 必须
├── design.md         概念、模型、规则、取舍、边界      ← 必须
├── flows.md          到达与取走的旅程、插队的四种走法
├── acceptance.md     产品视角的验收标准
├── decisions.md      拍板记录 / PM 推导 / 待裁决       ← 必须
└── changelog.md      产品设计本身的演进                ← 必须
```
