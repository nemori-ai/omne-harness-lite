---
id: PF-015
title: 会话怎么建、活成什么样、什么时候归档，以及会话之间是什么关系
status: active
revision: 13
relations:
  supersedes: []
  depends-on:
    - id: PF-001
      for: 四层作用域与租户身份——会话是最内那一层
    - id: PF-002
      for: 权限设置这一层，以及它与会话内授权的分工
    - id: PF-004
      for: AgentDefinition 与装配——会话类型由它算出来
    - id: PF-005
      for: 会话级沙箱的归属与销毁，那是沙箱自己的时钟，不是会话的
    - id: PF-007
      for: 会话授权上下文、`Ask()` 的请示、放行三元组
    - id: PF-008
      for: 系统拦截卡片的四档选项，以及它与语义化授权的分界
    - id: PF-012
      for: Run 的终态、会话日志只增不改、Loop 拓展点
    - id: PF-020
      for: 工作区身份、有效参与关系、共享实例、显式登记与异步资源同步
    - id: PF-014
      for: 受理是一个动作——业务流程拓展点拦在受理之前
  extends: []
---

# PF-015：会话的生命周期与归属

**会话是这个系统里活得最久的东西。**用户看到的每一段协作、agent 产生的每一条记录、
花掉的每一分钱，都归到某一个会话名下。这个 topic 回答：**它怎么建起来、会经历哪几种状态、
什么时候停下、会话与会话之间是什么关系，以及一个会话里的授权是怎么攒起来又怎么收回的。**

边界到**会话这个聚合本身**为止。会话里发生的事——一次运行怎么走完、一条消息怎么组装、
一个工具怎么执行——分别归 [PF-012](../PF-012-agent-loop-and-run/README.md)、
[PF-010](../PF-010-context-management-and-assembly/README.md)、
[PF-006](../PF-006-tools-and-skills/README.md)；本 topic 只定**它们挂在谁身上、那个东西什么时候还在**。

## 本 rev 覆盖到哪

**这是一份还在长的设计。**产品负责人给定的讨论大纲有五块，**本 rev 整块覆盖其中四块**；
**权限那一块只覆盖它与会话这个聚合相交的部分**，剩下的各归其主：授权的完整模型与放行四步归
[PF-007](../PF-007-meta-capabilities/design.md#56-一次放行判断走四步)，执行环境权限归 [PF-005](../PF-005-execution-environments-and-sandboxes/README.md)。

| 大纲 | 本 rev |
|---|---|
| **会话的生命周期管理** | ✅ [四个状态与它们之间怎么走](design.md#五模型)；[归档的两条来路](design.md#62-归档有两条来路人手动或到期自动)——租户手动，或按出厂时限自动 |
| **会话内的数据存储和持久化** | ✅ **产品侧该说的说完了**：[存储要守住的两件事](design.md#58-存储要守住的两件事)——会话睡醒还是原来那个、别把单机焊进语义。**这是对存储提的要求，不是一份存储方案**；怎么存归技术设计 |
| **权限**（工具权限 / 执行环境权限） | ⚠️ **只覆盖与会话这个聚合相交的部分**：[归档对授权做什么、不做什么](design.md#54-会话内的授权与生命周期的交界)、[三个作用域落在同一份数据里](design.md#57-三个作用域在同一份数据里)、[单次授权在一次运行结束时清空](design.md#610-单次授权在一次运行结束时清空)，以及[会话运行模式](design.md#会话运行模式)这第三条腿。授权的完整模型（两种来源、两种撤回、三个作用域）归 [PF-007 §4](../PF-007-meta-capabilities/design.md#会话授权上下文)，执行环境权限归 [PF-005](../PF-005-execution-environments-and-sandboxes/README.md)；**[放行三元组](../PF-007-meta-capabilities/design.md#611-ask通向人)里工具权限那条腿由 [PF-007 §5.6](../PF-007-meta-capabilities/design.md#56-一次放行判断走四步) 接住**——三档执行权限各落放行四步里的一处，本 topic 不再持有这项未决 |
| **会话间的关系** | ✅ [主会话与子会话](design.md#52-会话与会话之间) |
| **会话的 [runtime context](../../ubiquitous_language/terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context)** | ✅ **整块已接下**——[它是什么](design.md#runtime-context)、[哪些是每个会话必不可少的](design.md#56-十四项-meta-runtime-context)（**十四项**）、[怎么让模型感知到](design.md#69-模型看见一块-runtime-context只有两种形态) |

**没覆盖的部分不要从本文推断。**未决项在 [§9](design.md#九未决项) 显式列着，
那里是空的地方就是真的还没定。

## 关系

| 关系 | 含义 | 本 topic 的情况 |
|---|---|---|
| `supersedes` | 对方全部内容被吸收 | **无。**本 topic 是新开的，不取代任何人 |
| `depends-on` | 引用对方定义，不重复展开 | **十个**，见 front-matter。其中 [PF-007](../PF-007-meta-capabilities/README.md) 与 [PF-012](../PF-012-agent-loop-and-run/README.md) 咬得最紧 |
| `extends` | 扩展对方范围，对方继续有效 | **无** |

**四个此前无家可归的概念，本 topic 全部收下：**

- **会话类型**——[本 topic 定义](design.md#会话类型)。
- **runtime context**——[本 topic 定义](design.md#runtime-context)，
  并圈定[哪些是每个会话必不可少的](design.md#56-十四项-meta-runtime-context)。
  **词是[统一语言里原有的那个](../../ubiquitous_language/terms/scope-and-resolution.md#ul-runtime-context--运行时-context--runtime-context)，不新造。**
- **[会话运行模式](design.md#会话运行模式)**——[PF-007 §8](../PF-007-meta-capabilities/design.md#八边界与依赖) 与
  [PF-008 §8](../PF-008-human-in-the-loop/design.md#八边界与依赖) **双双明写「依赖它、不定义它」**，
  **rev 4 定了：恰三档**。
- **[会话日志投影](../../ubiquitous_language/terms/record-and-context.md#ul-session-log-projection--会话日志投影--session-log-projection)**——
  [PF-013 早就在用这个说法](../PF-013-model-profiles-and-invocation/design.md#模态投影)却没有正式定义，
  **rev 5 把这一类立起来**，因为[从日志算出投影那套协议](design.md#58-存储要守住的两件事)要谈它。

## 状态

**active，rev 13；本次工作区一致性增量已正式接受**（2026-09-27，依据[本次登记](decisions.md#2026-09-27-工作区增量正式状态登记)）。既有产品范围与未决分别保留；[生命周期](design.md#会话的生命周期)、[会话间的传导](design.md#52-会话与会话之间)、
[会话类型](design.md#会话类型)、[业务流程拓展点](design.md#业务流程拓展点)、
[会话运行模式](design.md#会话运行模式)与[存储要守住的两件事](design.md#58-存储要守住的两件事)
六块已由产品负责人拍板（[decisions](decisions.md#一拍板记录)，共 59 条），可以被下游引用；
其余按上表，**未覆盖即未定**。

**待裁决只剩一条**：[自动归档的时限租户改不改得动](decisions.md#三待裁决)。

技术投影：**尚未开始**；本次产品状态登记不代替规格与实现映射的接受。

本 topic **属于[架构内核](../architecture-core.md)**——它立的是别的 PF 赖以成立的前提。
**此前有两条已接受的规则吊在「这段协作到此为止」这个没有名字的事实上**
（[去向见产品区索引](../README.md#已排定尚未开题的编号)），
本 rev 把那个名字定为[归档](design.md#会话归档)。
