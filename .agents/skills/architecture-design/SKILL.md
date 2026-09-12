---
name: architecture-design
description: >
  Find and use authoritative architecture guidance for omne-harness-lite.
  Use when assigned architecture design or review, modeling capability boundaries,
  choosing libraries or subsystem designs with architectural consequences, or
  resolving architectural tradeoffs during development. Ordinary local changes
  within an established contract do not require this skill.
---

# 架构设计信息导航

在设计架构或遇到影响能力边界、所有权、状态、生命周期、交互协议的抉择时，
用本 skill 找到有权解释该问题的资料。它负责导航与识别依据，具体原则和契约
由对应文档维护。

## 权威入口

以下链接均相对于本 skill 文件；在仓库子目录或 worktree 中也应从当前检出的
仓库读取，不把同机其他仓库或历史检出的文档当成当前版本。

| 需要回答的问题 | 入口与职责 |
|---|---|
| 哪些项目方向与红线约束当前判断？ | [根 AGENTS.md](../../../AGENTS.md)：项目心智模型、顶层约束与权威文档导航。 |
| 本次设计要满足什么？ | [系统目标与产品要求](../../../docs/requirements/README.md)定位相关确认条款；[需求维护](../../../docs/maintenance/requirements.md)说明消费基线、覆盖和变更影响。 |
| 应当怎样建模和作架构判断？ | [架构设计指南](../../../docs/architecture-guide/README.md)：自包含的概念、原则与按问题导航。 |
| 本项目已经决定了什么，还有什么在讨论？ | [当前架构](../../../docs/architecture/README.md)及[决定索引](../../../docs/decisions/README.md)：已接受方向、选择和范围；候选设计从[提案](../../../docs/proposals/README.md)进入。 |
| 某个概念、操作或不变量的具体含义是什么？ | [规格清单](../../../spec/catalog.json)定位接受依据和精确版本，[规格索引](../../../spec/README.md)解释数据、能力与组合契约的分工；未登记的候选不冒充正式依赖。 |
| 新发现怎样支持提案或复议已有决定？ | [知识流转](../../../docs/maintenance/knowledge-flow.md)：来源、权威与可因果解释的取代。 |
| 怎样发布、引用或迁移规格？ | [维护规范](../../../docs/maintenance/README.md)：精确版本、冻结与证据归属。 |
| 应运行哪些检查，结果支持什么结论？ | [验证规范](../../../docs/maintenance/verification.md)说明检查职责与覆盖，[Makefile](../../../Makefile)提供当前命令；提案或研究中的历史命令不代表当前工具。 |
| 有哪些错误、并发和资源边界需要保护？ | [防御性研发模式](../../../docs/defensive-patterns.md)：相关风险的防御原则。 |

指南首页维护专题导航，本 skill 不另建一份目录。首次做整体设计时，按首页
指引阅读总体范式和基础概念；处理已有系统中的局部抉择时，从“按设计问题进入”
找到相关专题，并核对该能力的当前决策与具体规格。

选型应针对已明确的契约比较候选实现。项目资料决定需要什么保证；候选库的
官方资料、源码和验证说明其是否能兑现，二者不能相互替代。

## 必要时展开

- 涉及 Cordis API、服务解析、插件或 Fiber 生命周期等实现语义时，使用
  [cordis-authoritative-docs](../cordis-authoritative-docs/SKILL.md) 查权威资料。
  [实现映射](../../../docs/architecture-guide/reference/cordis-mapping.md)可帮助定位，
  但具体行为要核对实际采用的源码版本，不把上游应用策略直接当作项目约定。
- 需要判断抽象价值、过度设计、复用或优化复杂度时，使用
  [engineering-taste](../engineering-taste/SKILL.md) 展开高阶判断。
- 需要核对一份能力设计是否表达充分时，按需读
  [契约描述要点](../../../docs/architecture-guide/reference/contract-description.md)。
  它是描述维度，不要求创建统一模板、框架或一组新模型。
- 调整防御辅助或准备切换开发主力模型时，读
  [防御演化](../../../docs/maintenance/defensive-evolution.md)和
  [开发模型评估](../../../docs/evaluation/README.md)。辅助的实验结果不能撤销系统保证。

## 判断依据与读取边界

用户明确的新要求优先于旧文档。规范、已接受决策、讨论、提案和说明性示例
具有不同地位；临时报告和上游实现可提供证据，不因内容详细就成为已批准的
项目契约。复用已有权威定义，不能因上下文或实现不同而另写一份相同语义。

没有新观测时，有效需求前提和适用范围内的有效决定是研究、提案、决定三者的最终权威，
不因换了 agent 或重新措辞而重开争论。每份决定至少关联一份提案或研究；
复议需新观测、足够强的因果解释、可复现与可验证依据，接受后才取代旧决定。
观察到反例时如实报告；新证据本身不自动批准新政策。

遇到冲突，定位相关章节、适用版本和责任归属，区分已确认事实与待选政策，
在任务授权范围内解决并同步需要更新的投影。确实缺少决定性信息时指出缺口；
不要静默选用更方便的旧说法，也不要把假设写成既有约定。

设计探索不要求预先存在完整规格。缺少已接受契约时，可以在授权范围内形成
候选并标注已知、假设与未知；若缺口会改变授权、所有权、失败或在途工作政策，
且任务没有授权选择，就暂停依赖该选择的定稿或实施并向任务发起者澄清，
其余独立分析可以继续。提出方案、接受决定和发布规格是不同动作；本 skill
适用于设计或评审任务，但不会为当前角色增加另一项职责或批准权。

设计先定位相关要求的确认范围与缺口，候选写明覆盖；接受设计时按需求维护固定
消费基线。要求变更使旧选择与之冲突时，标出受影响范围，不能继续默认采用；
新要求不自动选定替代机制，设计接受也不能豁免已确认要求。

形成判断时，说明所依据的文档或章节、相关版本与决策状态，并区分沿用的
契约和本次提出的建议。信息已足以支持当前判断时停止展开；无需通读所有
专题、外部仓库或示例，也不因调用 skill 就扩大模型落盘、重构或发布范围。
