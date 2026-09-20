# 六个项目的评测构成与迭代证据

本页属于[研究报告](README.md)，来源快照、核对日期和整体局限以报告入口为准。
以下将源码中的机制、作者发布的实验结果，以及本研究的判断分别表述。

## 目录

- [DSH](#dsh)
- [Pi](#pi)
- [LangChain](#langchain)
- [Deep Agents](#deep-agents)
- [OpenCode](#opencode)
- [Raven](#raven)

## DSH

### 已有构成

DSH 的根 `BENCHMARK.md` 提供外部评测接入方向：通过 Python SDK 启动最小
`jsonrpc-agent`，独立任务使用不同 workspace 和 session。这个入口本身没有定义
通用任务集或智能质量评分协议。[Benchmark 入口](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/BENCHMARK.md)

仓库另有真实模型行为 smoke。例如 coding-task 用例让模型修复一个确实失败的
小程序，然后由测试进程重新执行验证，并检查原测试文件未被修改。它测的是外部
结果，不以模型的完成声明评分；范围仍只是很小的编程 smoke，不能称为完整
SWE-bench。[任务与独立验证](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/apps/cli/tests/profiles/headless/tests/coding-task.e2e.ts)

Compaction 的真实模型用例同时检查事件配对、旧上下文被替换和任务仍能给出结果。
这说明行为质量与生命周期机制可以在一个场景中共同观测，但当前断言不构成全面的
摘要忠实度评测。真实 API 测试有独立工作流与密钥条件。
[Compaction smoke](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/apps/cli/tests/profiles/headless/tests/compaction.e2e.ts)、
[E2E 工作流](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/.github/workflows/e2e.yml)

顶层 `benchmarks/` 则主要承担跨包用户路径的**工程性能门禁**：按会话打开、继续
运行、长会话浏览器等路径组织，使用固定合成输入、独立进程/浏览器和构建产物，
测量时间、内存、比例与预算；避免网络服务和真实用户会话污染可重复性。
[Benchmark 维护约定](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/benchmarks/AGENTS.md)

### 结果怎样指导开发

Session 格式变化后出现打开大会话的明显性能退化，促成了专门的必需 CI 检查。
其设计记录比较分阶段成本与用户实际等待的完整路径，使用已知正常与已知退化
实现校准预算，并解释为何不能只测一个底层 API。后续 runner 与预算变更继续
附带样本和反例，而非只提高阈值让 CI 变绿。
[性能退化、方案与校准记录](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/.agents/notes/implemented/testing/2026-09-04-session-open-performance-gate.md)、
[固定 hosted runner 的后续选择](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/.agents/notes/implemented/testing/2026-09-06-standard-hosted-benchmark-runner.md)

**可借鉴判断：** 真实结果由外部验证；长会话性能按用户路径归属；预算与优化
需要测量及因果解释。本次未确认其公开仓库已有与 Deep Agents 相同的多能力
AI 评测矩阵、重复比较报告和统一质量采用协议。搜索中出现的社区 `dsh-eval`
不能作为 DeepSeek 官方已实现的证据。

### 本地调用补充

已在仓库外安装 `deepseek-harness-sdk` 与匹配原生运行时 `0.1.5rc1`，实际执行
官方 `sdk-default`、`sdk-minimal`、`sdk-custom`，三项均通过。它们覆盖完整轮次、
持续 shell 状态、同一 session 多轮调用，以及日志和快照检查；模型响应由官方
本机模拟服务提供。版本、调用方式、结果和未覆盖范围见[执行记录](dsh-invocation.md)。

进一步核对的官方 `sdk-live` 通过两轮工具任务与中途随机改写文件检验模型是否
重新读取真实状态；评分检查字节结果，不只检查完成声明。该场景本次未执行，
不能把上面三个无密钥 smoke 当成真实模型质量成绩。
[真实模型入口及验证](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/scripts/smoke-python-runtime.py#L868)

## Pi

### 已有构成

当前官方仓库已重定向至 `earendil-works/pi`，拥有独立的 `packages/evals/`。
它适配真实 `AgentSession` 到 `vitest-evals`，每次运行使用独立的临时项目目录与
agent 目录，保存原生 session JSONL 和报告；被测配置可改变模型、提示、工具和
输出投影。[Eval 入口](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/README.md)、
[真实 session 适配器](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/pi-harness.ts)

具体对照不是空架子：model-authoring 用例比较“包含 Pi 文档导航”和“移除这段
导航”的提示，让 agent 新增模型配置、reload，再通过运行时读取配置并核对既有
模型仍然存在。扩展用例同样观察创建、加载和实际使用，而非只检查生成文件里
出现某段文字。
[模型配置实验](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/models.eval.ts)、
[扩展实验](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/extensions.eval.ts)

### 比较与开发反馈

比较工具按输入身份和重复编号配对 baseline/candidate，分别汇总成功率变化、
token、延迟和估计成本。缺少评分、重复观测和执行错误都有诊断，缺失遥测不被
填成零。会话和源附件使开发者可以从差值回到具体行为。
[配对身份](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/vitest-evals/harness-table.ts)、
[汇总与缺失观测](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/vitest-evals/summary.ts)

比较套件建议把质量写成 judge 分数并关闭硬阈值，低分作为观察保留下来；基础设施
和实验前提仍用断言。这让“实验成功测得效果差”成为可用结果。README 建议开发
用例时少量运行、报告增益时增加重复，但这不是统计功效保证。
[比较套件约定](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/README.md#writing-comparative-eval-sets)

**局限：** README 中的 lift 数字明确是示例，本次没有获得可据以宣布某提示增益
的实测工件。所查常规 CI 执行构建、检查与测试，没有调用 `npm run eval`；
因此可确认它支持决策实验，不能进一步宣称每次 PR 都有 AI 质量门禁。
[常规 CI](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/.github/workflows/ci.yml)

成功率差值的分母是双方都已评分的有效配对，报告另列总配对数和不完整观测。
因此有效配对上的高分不能替代完整任务集合的端到端可靠性，分析时还要检查
缺失是否集中在某个候选或困难任务上。
[分母与覆盖实现](https://github.com/earendil-works/pi/blob/71dca871bc80b6bc97be37f0ca3189399d651fff/packages/evals/src/vitest-evals/summary.ts)

**可借鉴判断：** 在现有测试生态上增加薄适配器，直接测试我们的运行时与产物，
用最小对照回答一项提示、工具或动态加载设计是否值得保留。

## LangChain

### 先分清库与平台

LangChain 库自身有单元、集成和性能检查；例如 CodSpeed 工作流为主分支保留
性能基线、对 PR 运行受影响包的 benchmark。这类测量主要保护软件性能，不能
当作智能任务质量成绩。
[库级 CodSpeed 工作流](https://github.com/langchain-ai/langchain/blob/348c9dc572599947d2d7d33d6a5b8b936e92a1d4/.github/workflows/codspeed.yml)

Agent 行为评测的官方指导通过 AgentEvals 比较消息与工具轨迹，支持严格或宽松
的轨迹匹配，以及按 rubric 的 LLM judge。确定性评分器可以评价非确定性的
agent；是否要求唯一顺序，取决于被测行为本身。
[Agent Evals](https://docs.langchain.com/oss/python/langchain/test/evals)

LangSmith 提供实验管理层：数据集承载输入及可选参考，目标函数执行 agent，
评分器给出反馈，实验绑定输出和 trace。它支持人工、代码、模型裁判及成对比较，
并能比较不同模型、提示和应用配置。
[评测入口](https://docs.langchain.com/langsmith/evaluation)、
[基本概念](https://docs.langchain.com/langsmith/evaluation-concepts)

### 结果怎样进入迭代

官方方法把离线与线上连接起来：上线前用人工样例、历史轨迹或合成任务比较候选；
上线后从真实 run/thread 发现问题，再把有价值的失败转成离线任务，验证修正。
线上没有参考答案时，评分能判断的性质也相应受限。
[离线与在线评测](https://docs.langchain.com/langsmith/evaluation-types)、
[多轮线上评测](https://docs.langchain.com/langsmith/online-evaluations-multi-turn)

评分器自身也需要校准。LangSmith 文档提供用人工反馈改进 judge 的方式；这支持
“评分是否可信”成为独立的维护对象，而不是默认更强的模型必然能公平判卷。
[用人工反馈改进 judge](https://docs.langchain.com/langsmith/improve-judge-evaluator-feedback)

**局限：** 这些资料说明平台支持什么、团队推荐怎样工作，不证明每个 LangChain
项目都已经使用同样的质量门禁。团队如何利用这些机制改变自己的 harness，有更
具体的 Deep Agents 源码和实验文章作证，见下一节。

**可借鉴判断：** 数据、运行、轨迹、评分和采用理由分开管理，并建立从实际失败
回到可重复任务的反馈关系；是否使用 LangSmith 服务仍是独立的选型问题。

## Deep Agents

### 两套互补的测量

第一套是 **SDK 行为评测**。`libs/evals/tests/evals/` 用真实模型运行，覆盖工具
选择、文件操作、记忆、多轮对话、摘要、skills、委派和人工介入等。轨迹同时
保留工具调用、文件变化与最终输出，便于定位具体哪种行为出了问题。
[评测包](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/README.md)、
[用例目录](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/EVAL_CATALOG.md)

它区分结果正确性与过程效率：`success(...)` 失败记作测试失败，`expect(...)`
的步数、工具调用等预期主要作诊断反馈。这样，正确但用了另一条合理路径的
agent 不必只因偏离预设步骤而失败。
[评分器实现](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/tests/evals/utils.py)、
[编写说明](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/CONTRIBUTING.md#two-tier-assertion-model)

第二套是 **外部端到端任务**。通过 Harbor 提供任务环境、指令、agent 适配与评分：
autonomous 使用 Harbor Index 一类终端任务，conversation 使用 τ³ 多轮任务，
context 使用 ContextBench 衍生集，research 使用 DRBench。当前指南的默认组合
是 autonomous/conversation/research，context 可另选；不能把较早三轴文章或
历史 scorecard 当成当前默认集合。
[统一评测设计](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/UNIFIED_EVALS.md)、
[类别与环境的执行配置](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/.github/scripts/evals/unified_prep.py)

### 比较、诊断与运行方式

统一工作流可以比较不同模型，也支持同模型下不同分支和 agent 配置；比较分支
时数据集、verifier 和评分仍来自工作流版本，避免改 agent 时顺手改掉试卷。
汇总脚本记录配对结果、任务覆盖及缺失状态。
[工作流输入与汇总](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/.github/workflows/unified_evals.yml)、
[分支/配置比较器](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/.github/scripts/evals/aggregate_unified_compare.py)

模型横向比较与单模型重复试验有独立入口；后者保留逐轮结果和波动，报告缺少
预定试验时也要暴露缺口。失败分析脚本读取失败断言和完整轨迹，用 LLM 提出
提示问题、工具选择、模型不足或评测过严等解释。这些解释是诊断建议，不是
评分结果已经证明的原因。
[重复试验工作流](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/.github/workflows/evals_trials.yml)、
[失败分析器](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/.github/scripts/evals/analyze_eval_failures.py)

一个需要特别区分的实现细节：reporter 会在已有实际用例运行时，将普通测试
失败导致的 pytest 退出码改为零，以便继续汇总；配置错误等其他失败保留。
`trials/aggregate` CLI 再检查报告中的失败计数。因此绿色 shell step 不代表
所有评测通过。所查评测工作流使用手动 dispatch，也不能据此推断每次 PR 必须
通过这些付费试验。
[Reporter](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/tests/evals/pytest_reporter.py)、
[CLI 退出语义](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/AGENTS.md#exit-codes)

### 实际指导过哪些改变

2026-02-17 的官方实验保持 GPT-5.2-Codex 不变，报告通过修改提示、工具与
middleware，将 Terminal Bench 2.0 成绩从 52.8 提高到 66.5。trace 诊断发现未
验证即结束、重复失败路径和时间耗尽等问题，促成针对性修改；推理预算实验还
显示，更高 effort 在有超时约束时未必更好。该结果属于当时的配置与任务，不是
当前版本的通用增益保证。
[Harness engineering 实验](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering)

2026-04-08 的 Better-Harness 文章进一步将带标签的样例分成调优和留出部分，
从失败轨迹形成候选，再检查新收益、原有成功案例退化及人工审阅。它讨论的
实际改动包括减少无谓澄清、遵守已给定约束、停止重复搜索，也主张清理失去价值
的评测；这不意味着可以撤销被测系统的保证。
[Better-Harness 方法与实验](https://www.langchain.com/blog/better-harness-a-recipe-for-harness-hill-climbing-with-evals)

2026-07-23 的文章明确提出：为准备 0.7，正在用 benchmark 判断能否移除 todo
middleware、明显缩减系统提示。这里的证据支持“用评测指导删除复杂度”，不能
把文章中的候选动作写成已经全部发布。它还说明以固定 lite 子集快速迭代，
重要判断再运行完整集合。
[How We Benchmark Deep Agents](https://www.langchain.com/blog/how-we-benchmark-deep-agents)

### 不能直接照搬的地方

- 统一评测既有二元结果，也有研究任务的连续质量分。当前指南解释了研究评分
  为什么不能简单套用“至少一次达到 1”的 `pass@K`，更换 judge 后也要求重建
  可比基线。[评分口径](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/UNIFIED_EVALS.md#the-three-categories)
- 文档描述部分图表默认排除全零模型以避开疑似基础设施失败；这是可视化选择，
  不能作为我们删除原始失败数据的理由。
  [图表说明](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/CONTRIBUTING.md#composite-radar-across-multiple-workflow-runs)
- 历史 scorecard 记录了任务、模型、judge、运行 ID 和异常口径，但仍是特定配置
  的测量，不能自动外推到完整产品、其他提供者或本项目。
  [历史 scorecard](https://github.com/langchain-ai/deepagents/blob/9e7d62ff6e7131505995a706d717e01837aa8617/libs/evals/UNIFIED_SCORECARD.md)

**可借鉴判断：** 具体行为用于诊断，端到端任务用于检验整体价值；将质量、效率、
覆盖和采用分开，并让评测既能推动添加机制，也能支持删除已无收益的指导。

## OpenCode

### 两类已确认的证据

仓库有单元与产品 E2E 工作流；浏览器性能 benchmark 则要求生产构建、串行
执行、保留原始诊断数据，按需使用 Chrome/Electron tracing。它明确不设置
依赖机器的性能阈值，只断言场景完成及指标采集，并与普通测试发现分开。
这是诊断取向，和 DSH 的校准预算 gate 有明显区别。
[产品测试工作流](https://github.com/anomalyco/opencode/blob/95daf90670b7c039c436c85537da5fbfe2205b41/.github/workflows/test.yml)、
[性能评测约定](https://github.com/anomalyco/opencode/blob/95daf90670b7c039c436c85537da5fbfe2205b41/packages/app/e2e/performance/AGENTS.md)

Zen 官方文档说明团队评估模型及提供者配置，与相关团队调整服务方式，然后
benchmark 模型/提供者组合，以此形成推荐列表。这是结果影响产品选择的直接
说明；同名模型通过不同服务配置运行，并不自动产生相同效果。
[Zen：背景与组合评估](https://opencode.ai/docs/zen/#background)

### 公开证据的限度

在本次路径清单、相关源码与官方页面中，未确认 Zen 完整任务集、judge 规则、
重复次数、原始成绩和上线阈值。仓库存在存储 model/agent/result 的 benchmark
表，但一个表不足以证明评测如何执行或决策如何自动闭合。
[Benchmark 存储形状](https://github.com/anomalyco/opencode/blob/95daf90670b7c039c436c85537da5fbfe2205b41/packages/console/core/src/schema/benchmark.sql.ts)

**可借鉴判断：** 产品性能和智能质量分别测量；服务提供者也属于实验条件。
这不改变本项目统一使用 OpenRouter 的要求，我们需要在该入口下记录和控制
路由条件，而非因 Zen 的选择改用另一个网关。

## Raven

### 能力、主动性和长期任务

Raven 将评测 harness 放在独立的 `benchmarks/`，不作为普通 runtime wheel 的
组成部分。AppWorld 负责任务环境和批量评分；PinchBench 可直接驱动 AgentLoop，
也可经过完整 gateway/channel；ClawBench 适配连续 session；主动性有专门 runner。
这种区分允许比较局部能力与完整入口带来的差异。
[评测目录与依赖边界](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/benchmarks/README.md)

PinchBench 任务卡描述指令、工作区素材、预期行为和评分标准，评分器支持代码、
LLM judge 与混合方式，能够读取轨迹和工作区状态。
[任务格式](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/benchmarks/pinchbench/tasks/TASK_TEMPLATE.md)、
[评分器](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/benchmarks/pinchbench/direct/grading.py)

主动性分成两个不同问题：pbench 的 one-shot help-or-skip 判断，和 longrun 的
六类 persona、每类 30 个模拟日。后者分别测自主预判、预约执行、被动问答和
克制；“用户已经预约的提醒”不计为自主预判。公开记录主动性较高而克制较弱的
结果，也说明提醒总数受任务频率与重复计划风格影响，不用于能力排名。
[协议与分项结果](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/benchmarks/proactivity_eval/README.md)、
[Longrun 情景与适配说明](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/benchmarks/proactivity_eval/data/longrun/README.md)

这些是模拟用户、模拟时间与指定版本适配器下的结果。文档承认某些对照系统的
投递通道没有得分路径，以及 session 轮换需要评测适配。因此不能把它们当成
真实用户连续使用 30 天的观察，也不能把某个分数推广成全产品的绝对排名。

### Benchmark 如何成为演进反馈

独立的 `evolver/` 提供预算受限的候选搜索：固定被测代码与模型，先测基线，
从失败轨迹归纳原因，生成受路径约束的补丁，低成本筛选后增加尝试确认，记录
候选及其谱系，最后检查留出表现。配置指纹和试验级恢复用于避免续跑时混入
不同条件。[Evolver 入口](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/README.md)

它还把测量条件作为问题本身处理：AppWorld precheck 会检查环境和真实生成的
吞吐，避免“短探针可用、长任务因端点拥堵大量超时”被误诊为模型变化；基线
策略支持同一时间窗口测量控制组，以减轻跨时间服务漂移的影响。
[环境检查](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/benchmarks/appworld/evolve/precheck.py)、
[基线策略](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/orchestrator/gates/policy.py)

需要以源码细化 README 对“三道 gate”的概括：

- 测量中的基础设施失败被标记，未恢复的尝试不能通过缩小分母凭空抬分。
- 接线支持时，激活标记检查候选机制是否实际运行；没有激活数据时存在跳过
  归因检查的路径，不能宣称所有候选都通过了执行归因。
- 进入候选库/继续搜索使用较宽松的改善条件，`credited_2sigma` 是另一个统计
  标记；**源码并不要求每次 promotion 都达到该统计阈值**。

[Gate 管线](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/orchestrator/gates/pipeline.py)、
[配对结果的两种判据](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/orchestrator/gates/paired.py)、
[候选选择策略](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/orchestrator/gates/strategies.py)

留出结果不供演进决策路径读取，最后按训练表现选择交付候选再展示留出曲线，
避免从多个留出成绩中挑最高者。打开结果后不再继续同一搜索。这是防止调优
污染的具体机制，但不是对任意候选代码的安全隔离证明。
[留出与选择规则](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/orchestrator/DESIGN.md)、
[留出执行实现](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/orchestrator/sealed/runner.py)

### EvoAgentBench 与公开状态

相关的 EvoAgentBench 明确测量从旧轨迹提取程序性知识，再迁移到留出任务的能力。
公开协议给出四个领域的固定 train/test ID 划分，先采集训练轨迹、提取知识，再在
相同测试任务上比较 baseline 与知识增强版本。公开适配器、数据准备和试验产物
范围也有说明，不能把网站成绩当作所有框架均可立即复现的默认配置。
[EvoAgentBench 协议](https://github.com/EverMind-AI/EvoAgentBench/blob/948a17288782d5120778da16b4cf1cad9305d8b4/benchmark/README.md)、
[固定 split 的来源](https://github.com/EverMind-AI/EvoAgentBench/blob/948a17288782d5120778da16b4cf1cad9305d8b4/benchmark/data/splits/README.md)

本次快照还有两项重要限制。Evolver README 顶部说明该目录已计划进入待确认的
退役波次；其验证记录也区分真实 smoke、模拟测试与尚未大规模实测的路径。
宣传页成绩、这个工具的验证状态和本次读取的代码不能互相替代。候选代码与
grader 的运行隔离也有限，项目自身要求审计改动后再引用成绩。
[状态与验证局限](https://github.com/EverMind-AI/Raven/blob/fcf469ae619d91f7adc6fc7a4f963c17d176f9f5/evolver/README.md#status-and-known-limitations-2026-07)

**可借鉴判断：** 评测长期状态、主动性与克制；把演进搜索和独立检验分开；记录
候选真实生效、基线漂移和原有能力退化。其自动 promotion 权限、2σ 实现、缺失
归因时的处理与目录组织均不直接成为本项目方案。
