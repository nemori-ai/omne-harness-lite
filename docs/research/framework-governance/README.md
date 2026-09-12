# 架构知识流转与防御规则演化：社区证据

性质：**研究证据，不是 omne-harness-lite 已接受的设计或执行指令**。核对日期：2026-09-12；本报告记录固定来源版本下的观察、推断与局限，不随当前规则的修改而被改写。

本报告支持[文档与规格体系提案](../../proposals/documentation-system/README.md)，并可为[D-002](../../decisions/D-002-decision-authority.md)和[D-003](../../decisions/D-003-defensive-evaluation.md)提供背景证据。有效决定在其范围内且没有新观测时仍有最终权威；本报告不能自行批准、取代或撤回决定。阅读范围是官方维护约定、文档、选定源码与公开评测说明；没有执行各框架的运行测试，没有测量删减规则对本项目模型的影响，也不把源码中存在一个模块等同于所有安装默认启用它。

## 目录

- [范围与版本](#范围与版本)
- [DSH：决定与事故有不同归属](#dsh决定与事故有不同归属)
- [Pi：轻量扩展与按需获取](#pi轻量扩展与按需获取)
- [OpenCode：规则入口和模型适配](#opencode规则入口和模型适配)
- [Oh-my 系列：经验提取分层与退出](#oh-my-系列经验提取分层与退出)
- [LangChain：用评测决定增减](#langchain用评测决定增减)
- [能够支持的综合结论](#能够支持的综合结论)

## 范围与版本

“oh my 系列”在本次具体指以下三个项目，不假定它们同源或共享同一治理机制。Pi 和 oh-my-opencode 的旧仓库 URL 目前重定向到下表名称。

| 项目 | 核对仓库 | 固定源码版本 |
|---|---|---|
| DSH | `deepseek-ai/deepseek-harness` | `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| Pi | `earendil-works/pi` | `71dca871bc80b6bc97be37f0ca3189399d651fff` |
| OpenCode | `anomalyco/opencode` | `95daf90670b7c039c436c85537da5fbfe2205b41` |
| Oh My OpenAgent，原 oh-my-opencode | `code-yeongyu/oh-my-openagent` | `e0746bcbcdf6341f697358867b2de436251fa5ad` |
| Oh My ClaudeCode | `Yeachan-Heo/oh-my-claudecode` | `5281b19e0d64f8e6dc6767f2130299a88af2dc71` |
| Oh My Codex | `Yeachan-Heo/oh-my-codex` | `cb955b0d5becbef76d2c1f0096b6e1f238e1e7f7` |
| Deep Agents | `langchain-ai/deepagents` | `9e7d62ff6e7131505995a706d717e01837aa8617` |

六个非 DSH 仓库的 `metadata.json`、完整文件路径清单和选读原件保存在本报告所在临时目录；DSH 使用先前已固定的只读检出，并再次核对远端 HEAD 相同。官网文章绑定下面列出的页面与发布日期，不能推断文章中考虑的变化已经全部发布。

## DSH：决定与事故有不同归属

**观察 D1。** Agent Notes 将提案、已实现决定和拒绝记录分开。提案落地时改写为最终决定、实际代价和验证说明；已实现记录跟随当前事实更新，决定本身变更要由新记录取代。完整取代允许合并，但独有理由、备选方案、验证要求和缺口必须得到承接。[Agent Notes 约定](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/.agents/notes/README.md)

**观察 D2。** 事故复盘解释故障机制与防线失效，关联由此增加的测试和规则。防御模式则提炼已发生或险些发生的缺陷类别。[复盘约定](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/postmortem/README.md)、[防御模式](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/defensive-patterns.md)

**观察 D3。** 文档分层强调同一事实只有一个归属，根提示保留简短常驻规则，细节经链接展开；有篇幅检查及过时记录退出规则。它限制信息负担，但篇幅上限本身不是模型行为收益评测。[文档标准](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/AGENTS.md)

**观察 D4。** 一次明确的简化决定移除了 209 个空 invariant companion 及一个缺少独立观察的探针，保留有价值的检查和对应行为测试。删除依据是机制不产生独立保证，而非声称模型已不会犯错。[省略无独立观察的 companion](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/.agents/notes/implemented/simplification/2026-08-28-omit-unneeded-invariant-companions.md)

**可借鉴范围。** 区分事实、理由、当前规则与历史，且允许规则资产合并、简化。我们处于设计阶段，应将“已接受”与“已实现”分开，不能直接复制 DSH 的 implemented 生命周期来表达本项目设计批准。

## Pi：轻量扩展与按需获取

**观察 P1。** Coding Agent 明确采用小内核和可选扩展；Skills 先暴露名称与描述，需要时再读取正文。其文档也承认模型不一定主动加载，显式调用可以加强发现。[Coding Agent](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/README.md)、[Skills](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/coding-agent/docs/skills.md)

**观察 P2。** Pi 官方仓库链接 Earendil RFC 体系，其说明区分草案、讨论、公开参考、接受和放弃；强调问题、备选方案、代价及理由，允许重新审视假设。公开发表与选择采用不是同一件事。[RFC 规则](https://rfc.earendil.com/0001/)

**可借鉴范围。** 少量常驻信息加按需展开，设计结论保留状态和理由。不能据此声称 Pi 已有一个自动评估并淘汰所有过时防御提醒的系统。

## OpenCode：规则入口和模型适配

**观察 O1。** 规则由 AGENTS.md、配置指定的 instructions 等入口提供。文档明确普通文件引用不会自动展开，需配置注入或明确要求 agent 按需读取。因此“目录里有文档”不等于“本轮模型已经看到了它”。[Rules](https://opencode.ai/docs/rules/)

**观察 O2。** 固定版本的 `provider()` 按模型匹配不同系统提示。它提供适配机制，但选择表不是某条规则已无收益的实验结果。[系统提示选择源码](https://github.com/anomalyco/opencode/blob/95daf90670b7c039c436c85537da5fbfe2205b41/packages/opencode/src/session/system.ts)

**可借鉴范围。** 把文档身份、发现入口、读取行为和实际注入区分，并允许模型相关提示独立调整。未在本次选读资料中确认其存在统一的 research → proposal → decision 转化标准。

## Oh-my 系列：经验提取分层与退出

### Oh My OpenAgent

**观察 M1。** Rules Injector 的维护文档描述按访问路径查找规则并做会话内去重。它属于内容发现与注入，不负责判定文档是否经过项目接受。[Rules Injector](https://github.com/code-yeongyu/oh-my-openagent/blob/e0746bcbcdf6341f697358867b2de436251fa5ad/packages/omo-opencode/src/hooks/rules-injector/AGENTS.md)

**观察 M2。** Memory Core 的 reflection 提示要求提取有持续价值的经验、处理过时内容和矛盾。记忆分为常驻提示、按需 skill 和外部参考；内容可以降层，skill 可以被替换或废弃，退休内容可退出常驻区。[Reflection 提示](https://github.com/code-yeongyu/oh-my-openagent/blob/e0746bcbcdf6341f697358867b2de436251fa5ad/packages/memory-core/src/reflection/assets/reflection-persona.md)

**观察 M3。** 模型匹配指南区分不同模型的提示习惯，并指出对 GPT 的小任务过度编排风险。一次已有简化记录移除针对手写提示文本本身的自动化断言，同时保留解析、路由、状态、安全和交付行为检查。[模型匹配](https://github.com/code-yeongyu/oh-my-openagent/blob/e0746bcbcdf6341f697358867b2de436251fa5ad/docs/guide/agent-model-matching.md)、[提示文本检查简化记录](https://github.com/code-yeongyu/oh-my-openagent/blob/e0746bcbcdf6341f697358867b2de436251fa5ad/.omo/evidence/20260817-remove-prompt-contract-tests/FINAL-REPORT.md)

**限制。** Reflection 指令和模型适配说明不等于已经证明记忆增删总能改善效果。模型匹配指南中也存在“切模型提示不变”与“按模型选择 preset”的不同描述，需要具体路径才能解释，不能据此推断全部 adapter 都在每次换模型时实时重编提示。本报告只采用其明确的分层、废弃与适配设计，不替它作跨 adapter 保证。

### Oh My ClaudeCode

**观察 C1。** `skillify` 从真实完成的重复工作提炼 skill 草案，要求经验值得保存、具体且经过实际发现，并区分适合 skill 还是普通文档。auto-learner 源码记录问题/解决对、出现次数和候选分数；这个分数是提取启发式，不是规则有效性概率。[Skillify](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/5281b19e0d64f8e6dc6767f2130299a88af2dc71/skills/skillify/SKILL.md)、[Auto Learner](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/5281b19e0d64f8e6dc6767f2130299a88af2dc71/src/hooks/learner/auto-learner.ts)

**观察 C2。** Notepad 区分常驻优先上下文、限期清理的工作笔记和不自动清理的手工内容。这是在管理记忆的用途与新鲜度，并未证明过期笔记对应的缺陷已经消失。[Notepad](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/5281b19e0d64f8e6dc6767f2130299a88af2dc71/src/hooks/notepad/index.ts)

### Oh My Codex

**观察 X1。** 模板 AGENTS 将根约定与窄职责角色提示区分，并明确过时 skill 不继续参与路由。Memory server 提供工作笔记清理接口，同时保留手工区；architect 提示要求判断有文件证据并比较取舍。[模板约定](https://github.com/Yeachan-Heo/oh-my-codex/blob/cb955b0d5becbef76d2c1f0096b6e1f238e1e7f7/templates/AGENTS.md)、[Memory server](https://github.com/Yeachan-Heo/oh-my-codex/blob/cb955b0d5becbef76d2c1f0096b6e1f238e1e7f7/src/mcp/memory-server.ts)、[Architect](https://github.com/Yeachan-Heo/oh-my-codex/blob/cb955b0d5becbef76d2c1f0096b6e1f238e1e7f7/prompts/architect.md)

**可借鉴范围。** 经验先成为候选，再按用途放置；记忆和提示需要降层、替换和退出。不能把“有学习模块”“按年龄清理”“存在禁用开关”分别等同于行为有效性证明。

## LangChain：用评测决定增减

这里主要考察 Deep Agents 与 LangChain 官方 harness 工程实践，不把它们等同于整个 LangChain 生态的一套统一文档制度。

**观察 L1。** 2026-02-17 的实践文章从 traces 分析失败，调整提示、工具和 middleware，并明确循环提醒等措施针对当前模型弱点，未来可能不再需要。[Harness engineering](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering)

**观察 L2。** 2026-04-08 的 Better-Harness 实践将证据获取、实验、优化和接受串联，使用独立留出集和人工检查防止过拟合，并定期清理已饱和或已失去价值的 eval。[Better-Harness](https://www.langchain.com/blog/better-harness-a-recipe-for-harness-hill-climbing-with-evals)

**观察 L3。** 2026-07-23 的文章说明用多次运行、快速子集和端到端任务评估删减提示及 todo middleware 的候选变化。这是“正在用评测决定是否删除”的公开说明，不能改写成“已经全部删除”。[How We Benchmark Deep Agents](https://www.langchain.com/blog/how-we-benchmark-deep-agents)

**观察 L4。** 当前仓库有按模型/类别发现评测、重复试验和汇总的工具入口；Memory middleware 将配置记忆放入上下文，Skills middleware 则按渐进展开处理。[评测入口](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/AGENTS.md)、[Memory](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/deepagents/deepagents/middleware/memory.py)、[Skills](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/deepagents/deepagents/middleware/skills.py)

**可借鉴范围。** 对某条提醒或流程做添加和删除实验，按任务与模型评估净收益；不把某个模型在一种 harness 上的得分直接外推到本仓库开发 agent 的架构判断质量。

## 能够支持的综合结论

以下是本报告的综合判断，不是任何单一框架已提供的统一标准：

1. 成熟实践覆盖了不同环节：DSH 更直接展示文档归属与决定维护；Pi/OpenCode 展示发现与加载；oh-my 展示经验提取、记忆分层及退出；LangChain 展示基于评测的增减。
2. 没有依据把它们概括为共同采用三目录线性审批流水线。我们需要按本项目设计阶段、语言无关规格和用户主导决策的要求组合这些做法。
3. 证据可信度、项目选择的权威、规格精度、信息是否被加载、规则当前是否有收益是不同问题，必须分别表达。
4. 防御知识可以长期可检索，而常驻提醒可以更少。规则的文字、触发范围、执行机制和所保护的系统保证需要分别评估。
5. 未观察到错误复发，不足以证明已无需防御；也可能恰恰是防御在起作用。删除提示需要在声明范围内比较有无该提示的行为。

本项目的当前转化和退出机制见[知识流转](../../maintenance/knowledge-flow.md)与[防御演化](../../maintenance/defensive-evolution.md)；历史方案讨论保存在[文档体系 v1](../../proposals/documentation-system/v1/README.md)。
