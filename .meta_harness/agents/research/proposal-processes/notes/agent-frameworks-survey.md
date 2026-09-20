<!-- 多来源横扫笔记：八个 AI agent 框架的提案/决定机制。2026-09-15 由只读调研产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# 八个 AI agent 框架：没有一个有正式提案流程；"备选方案"只作为可选的 issue 字段存在

本笔记横扫 AutoGen / AG2、LangChain、LangGraph、Letta、Dify、Mastra、CrewAI、OpenAI Agents SDK。有独立提案机制的三家（MCP、Semantic Kernel、DeepSeek Harness）各有单独笔记。

- 核对方式：GitHub contents API 列目录 + 读关键文件，2026-09-15
- 固定版本（各仓库当日 HEAD）：

| 仓库 | HEAD | 日期 |
|---|---|---|
| `ag2ai/ag2` | `362d487` | 2026-09-14 |
| `microsoft/autogen` | `027ecf0` | 2026-04-06 |
| `langchain-ai/langchain` | `41d3572` | 2026-09-14 |
| `langchain-ai/langgraph` | `230927f` | 2026-09-14 |
| `letta-ai/letta` | `5bcdd17` | 2026-09-10 |
| `langgenius/dify` | `07dc8eb` | 2026-09-15 |
| `mastra-ai/mastra` | `f4a0091` | 2026-09-15 |
| `crewAIInc/crewAI` | `66ef97c` | 2026-09-14 |
| `openai/openai-agents-python` | `fbf59a4` | 2026-09-14 |

## 1. 有没有提案 / 决定记录机制（观察）

**八家全部没有** `rfcs/`、`proposals/`、`decisions/`、`adr/` 或等价目录，也没有 `DISCUSSION_TEMPLATE` 里的 RFC 模板（Dify 的 `DISCUSSION_TEMPLATE/` 只有 `general.yml`、`help.yml`、`suggestion.yml`）。

有三家有**近似物**，性质各不相同：

| 项目 | 近似物 | 性质 |
|---|---|---|
| `microsoft/autogen` | `docs/design/` 五份编号文档：`01 - Programming Model.md` … `05 - Services.md` | 现状设计说明书，不是提案；没有 status、没有备选、没有决定记录 |
| `mastra-ai/mastra` | `explorations/` 八个文件（`agent-network-vs-ralph-wiggum.md`、`durable-agent.md`、`batching-spec.md`、`orchestrator-report.md` 等） | 自由格式的探索稿；无模板、无 status、不入任何流程 |
| `openai/openai-agents-python` | `PLANS.md`（ExecPlan 规范） | 面向 agent 的**施工计划**规范，见 §3 |
| `langchain-ai/langchain` | `openwiki/`（`architecture.md`、`agent-execution.md`、`middleware.md` 等 20 余页，带 `.claims`、`.page-manifest.json`、`.last-update.json`） | 机器生成/维护的代码 wiki；`INSTRUCTIONS.md` 要求 `Inspect git history to understand reasoning behind code changes`——即理由**从 git 历史反向重建**，不是被记录 |

**观察（Mastra 的探索稿）**：`explorations/agent-network-vs-ralph-wiggum.md`（492 行）实际上是一份质量不低的候选比较——开篇是七行的 `Side-by-Side Comparison` 表（Purpose / Completion Check / Primitive Selection / Context Strategy / Routing / Validation / Best For 七个维度），然后逐一分析两种形态的弱点（`Agent Network Weakness` / `Ralph Wiggum Weakness`），再给三个方案（`Proposed API`、`Option 2: Validation as a Primitive`、`Option 3: Hybrid Completion Step`）与分三期的推荐实现。

**推断**：真实的候选比较在这些项目里是**存在的**，只是不以"提案"的身份存在、没有 status、不产生可追溯的决定记录，因此半年后无法判断哪个 Option 被选了、为什么。这正是本项目要避免的失败。

## 2. issue 模板里的 "Alternatives"（观察）

八家都用 GitHub issue 表单做 feature request。相关字段：

| 项目 | 有无备选字段 | 是否必填 |
|---|---|---|
| `crewAIInc/crewAI` | `Describe alternatives you've considered` | `validations: required: false` |
| `mastra-ai/mastra` | `Alternatives Considered`（description: `Describe any alternative solutions or features you've considered.`；placeholder: `Are there any workarounds or alternative approaches you're currently using?`） | `validations: required: false` |
| `ag2ai/ag2` | 无（字段为 `Is your feature request related to a problem?` / `Describe the solution you'd like` / `Additional context`） | — |
| `langchain-ai/langchain` | 无备选字段；有五条 `required: true` 的**提交前检查框**（是 feature request 不是 bug、标题清晰、搜过重复、查过文档、不属于 community 包） | — |
| `langgenius/dify` | `suggestion.yml` 只有三问：`Is this request related to a challenge you're experiencing?` / `Additional context or comments` / `Can you help us with this feature?` | — |
| `langchain-ai/langgraph` | 无 feature request 模板（只有 bug-report / config / privileged） | — |
| `openai/openai-agents-python` | `feature_request.md`（纯 markdown 模板） | — |

**观察**：唯二存在的两个 "Alternatives considered" 字段都显式 `required: false`。它们继承自 GitHub 的默认 feature-request 模板措辞（`A clear and concise description of any alternative solutions or features you've considered.`），不是各项目自己设计的。

**观察**：LangChain 把强制力全部投在**去重与归位**上（五个必填复选框），一个都没投在论证质量上。**推断**：对一个开源框架来说，issue 洪水的主要成本是重复与错投，不是论证不充分；本项目的成本结构相反（单一作者、无 issue 洪水、真实风险是决定不可追溯）。

## 3. OpenAI Agents SDK 的 `PLANS.md`（观察）

这是本轮找到的、唯一一份**专为 AI agent 撰写而写**的长文档规范。要点（原文摘）：

> This file defines how to write and maintain an ExecPlan: a self-contained, living specification that a novice can follow to deliver observable, working behavior in this repository.

> - Required for multi-step or multi-file work, new features, refactors, or tasks expected to take more than about an hour.

必须存在且持续维护的四个"活"小节（原文）：

> - Progress: checkbox list with timestamps; every pause should update what is done and what remains.
> - Surprises & Discoveries: unexpected behaviors, performance notes, or bugs with brief evidence.
> - **Decision Log: each decision with rationale and date/author.**
> - Outcomes & Retrospective: what was achieved, remaining gaps, and lessons learned.

其他规则：`Self-contained and beginner-friendly: define every term`；`Explicit acceptance: state behaviors, commands, and observable outputs that prove success`；`Validation is required: state exact test commands and expected outputs`；`Checklists are permitted only in the Progress section (and are mandatory there)`。

对并行路径也有一条（原文）：`Parallel implementations are acceptable when reducing risk; describe how to validate each path and how to retire one safely.`

**观察**：`Decision Log` 要求"每个决定 + 理由 + 日期/作者"，但**不要求备选**。`Surprises & Discoveries` 要求带证据（`with brief evidence`）。

**推断**：`PLANS.md` 的设计目标是"让一次 agent 施工可被接手与复盘"，不是"让一个架构选择可被复议"。它对应本项目的[交付规划](../../../maintenance/knowledge-flow.md)一环，不对应提案。

## 4. AI 撰写政策（观察，Q4 直接证据）

| 项目 | 政策 | 关键措辞 |
|---|---|---|
| `letta-ai/letta` | `AI_POLICY.md`（改编自 Ghostty） | `All AI usage in any form must be disclosed.`；`The human-in-the-loop must fully understand all code. If you can't explain what your changes do … do not contribute`；`any content generated with AI must have been reviewed _and edited_ by a human before submission. AI is very good at being overly verbose and including noise`；**自动执行**：`Issues that do not comply with this policy will be automatically closed and locked`，并要求 issue 里选 AI Disclosure、列出所用工具、确认读过政策 |
| `ag2ai/ag2` | `.github/AI_POLICY.md` | `you remain responsible for everything you publish`；`Be prepared to discuss and revise your contribution in your own words based on reviewer feedback. Reviewers may ask follow-up questions; pasting AI responses back without engaging with the question doesn't move the conversation forward.` |
| `modelcontextprotocol` | `AI_POLICY.md` | 必须披露；目的是决定审查强度（见 [mcp-sep](mcp-sep.md)） |
| `tc39/how-we-work` | `AI_POLICY.md` | **禁止** LLM 代写散文（见 [tc39-stages](tc39-stages.md)） |

**观察**：四家的共同点是——**AI 可以参与，但"论证的所有权"必须在人身上**，且必须可被追问。Letta 是唯一把它做成自动门（不合规自动关闭并锁定）的。

**观察**：Letta 的 `AI_POLICY.md` 里还有一句直接针对本项目场景的判断：`It is rude and disrespectful to approach this boundary with low-effort, unqualified work, since it puts the burden of validation on the maintainer.`

## 5. 与本项目骨架的对照（推断）

- **没有一家 AI agent 框架给"提案 → 备选 → 决策"提供了可借鉴的正面先例。** 本项目若要在这一层建框架，参照系只有通用开源流程（Rust/PEP/KEP/Swift/TC39/Nix/EIP/IETF）、ADR 家族，以及 MCP / Semantic Kernel / DSH 三家。
- **值得借鉴的一条**：`PLANS.md` 的 `Surprises & Discoveries`（带证据的意外发现）——本项目的[知识流转](../../../maintenance/knowledge-flow.md)里"新观测挑战有效决定"缺一个轻量入口，这个形状可用。
- **必须正视的一条**：四份 AI 政策指向同一个判断——机器可以写，但要有人对论证负责、并能在被追问时用自己的话解释。本项目"由 AI agent 撰写与维护提案"的设定在上游没有先例支持，因此"谁为论证负责"必须由本项目自己的裁决分层（作者裁决 / 用户裁决）承担，不能诉诸上游惯例。

## 6. 局限与未覆盖

- 只看了仓库根目录、`.github/`、`docs/` 一层与几个明显的候选目录；**没有**全仓库 grep "RFC"/"ADR"/"design doc"，因此可能遗漏埋在子包里的设计决定记录。
- 没有看任何一家的 GitHub Discussions 实际内容（只看了 discussion 模板），也没有看它们的公司内部流程（LangChain、Letta、Mastra、CrewAI 均有商业主体，内部可能有不公开的设计评审）。
- `microsoft/autogen` HEAD 停在 2026-04-06，主线开发已迁往 `ag2ai/ag2`（社区 fork）与微软自己的后继项目；本笔记对 AutoGen 的观察只对该快照有效。
- 未覆盖 Anthropic / OpenAI 自身的公开设计文档惯例——本轮能找到的最接近物是 MCP 的 SEP（Anthropic 发起）与 OpenAI Agents SDK 的 `PLANS.md`；两家公司内部的设计文档流程**不公开，本轮无法核对**。
- Mastra 的 `explorations/` 只读了一份（`agent-network-vs-ralph-wiggum.md`）；其余七份的形态未逐份核对。
