> **本文件是 2026-09-22 三路并行 debugger 调研中「社区材料」那一路的原稿，整份迁入，正文一字未改。**
>
> - **执行者与日期**：sonnet 子代理（主会话派发），2026-09-22 当日完成；同日迁入本包。
> - **写作方式**：只读检索与抓取（WebSearch / WebFetch / curl / GitHub API）。任务书明令**只罗列事实与逐字引用、不给建议、不替本项目选方案**；稿末自带「未能一手核验」清单。
> - **采信边界**：这是**模型输出，不是证据**。**主会话未逐句复核每一条 URL**；本包对各条来源的身份、一手/转述与核验状态统一记在 [evidence.md](../evidence.md)，引用本文件任何一条之前先读那里。
> - **取代状态**：当前有效，未被取代。
> - **处置的既有结论**：首次调查。
> - **原稿路径**：`tmp/omne-harness-lite-tui-design/research/debugger-research-community.md`（任务临时材料，不保证长期存在；本文件是其入库副本）。
>
> 收敛后的当前说法在 [research.md](../research.md)，本文件写完即冻结，不回改。

---

# Debugger 子代理 / 调试专用 agent 社区调研（原始材料，未做建议）

调研范围限定：GitHub 子代理合集原文、Reddit/HN/官方论坛公开帖、第三方博客经验帖。
**读法**：每条给来源 URL、作者身份（一方=工具/模型厂商或其官方渠道；三方=独立开发者/社区/无关第三方）、
一手（作者亲历）还是转述、逐字引用、成立条件与失败案例。不含任何"建议"或"选型"结论。

---

## 0. 检索范围声明（诚实缺口）

- **Reddit（r/ClaudeAI、r/ChatGPTCoding、r/cursor）**：已用 WebSearch 分别检索
  `"debugger subagent claude code experience"`、`"agent debugging loop wrong fix production TUI terminal application"`、
  `"AI coding agent could not reproduce bug pty raw mode terminal"`（均加 `allowed_domains: ["reddit.com"]`），
  以及不加域名限制的 `site:reddit.com ...` 系列查询、直接 WebFetch `www.reddit.com` 与 `old.reddit.com` 的搜索页。
  **结果**：WebSearch 对 reddit.com 直接返回 API 400（"the following domains are not accessible to our user agent"）；
  不加域名限制的查询从未在结果列表里返回真实 `reddit.com` URL（均被转述/摘要到其他站点）；
  WebFetch 对 `www.reddit.com`、`old.reddit.com` 均报错 "Claude Code is unable to fetch from ..."。
  **结论：Reddit 一手内容本次不可达，未发现可引用的 Reddit 原帖**，仅能通过其他站点的转述间接确认相关话题存在（见正文引用处标注）。
- **Anthropic / OpenAI 官方 Discord 公开帖**：已检索 "Anthropic Discord debugger subagent"、"OpenAI Discord Codex debug agent failure" 等词，
  搜索引擎未返回可直接访问的 Discord 频道存档或转录页面，**未发现**可引用的 Discord 一手材料。
  官方论坛（community.openai.com、forum.cursor.com）可达，已在正文引用。
- Hacker News：Algolia API 可用，已检索 story 与 comment 两个索引；关于"debugger 子代理"本身的 Show HN 帖子稀少
  （多为通用调试 CLI 工具如 Cloi，评论数极低，未发现有实质内容的失败经验讨论），已如实记录检索到的条目。

---

## 1. GitHub 子代理合集：debugger 定义原文（三方，一手，逐字引用）

### 1.1 VoltAgent/awesome-claude-code-subagents — `debugger.md`

- URL: https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/04-quality-security/debugger.md
- 作者身份：三方（VoltAgent，一个开源子代理合集维护方，非 Anthropic 官方）
- 性质：一手原文（repo 直接内容）
- 逐字引用（frontmatter + 开篇）：

```
---
name: debugger
description: "Use this agent when you need to diagnose and fix bugs, identify root causes of failures, or analyze error logs and stack traces to resolve issues."
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

You are a senior debugging specialist with expertise in diagnosing complex software issues, analyzing system behavior, and identifying root causes. Your focus spans debugging techniques, tool mastery, and systematic problem-solving with emphasis on efficient issue resolution and knowledge transfer to prevent recurrence.
```

- 诊断技术清单原文：`Breakpoint debugging / Log analysis / Binary search / Divide and conquer / Rubber duck debugging / Time travel debugging / Differential debugging / Statistical debugging`
- 成立条件（作者自述的"完成标准"，逐字）：
  `Debugging checklist: - Issue reproduced consistently - Root cause identified clearly - Fix validated thoroughly - Side effects checked completely - Performance impact assessed - Documentation updated properly - Knowledge captured systematically - Prevention measures implemented`
- 交付通知模板原文（体现它对"讲清楚成因"的格式要求）：
  `"Debugging completed. Identified root cause as race condition in cache invalidation logic occurring under high load. Implemented mutex-based synchronization fix, reducing error rate from 15% to 0%. Created detailed postmortem and added monitoring to prevent recurrence."`
- 与其他子代理的协作声明原文：
  `Collaborate with error-detective on patterns / Support qa-expert with reproduction / Work with code-reviewer on fix validation / Guide performance-engineer on performance issues / Help security-auditor on security bugs / ... Coordinate with devops-engineer on production issues`
- **未提及**：TUI/终端渲染、跨进程、Electron/桌面应用调试；未提及任何失败案例或"什么情况下失灵"。全文是能力清单式（checklist-heavy），无实证。

### 1.2 lst97/claude-code-sub-agents — `agents/quality-testing/debugger.md`

- URL: https://github.com/lst97/claude-code-sub-agents/blob/main/agents/quality-testing/debugger.md
- 作者身份：三方（独立维护者 lst97）
- 性质：一手原文
- 逐字引用（frontmatter）：

```
---
name: debugger
description: Debugging specialist for errors, test failures, and unexpected behavior. Use proactively when encountering any issues.
tools: Read, Write, Edit, MultiEdit, Grep, Glob, Bash, LS, WebSearch, WebFetch, TodoWrite, Task, mcp__context7__resolve-library-id, mcp__context7__get-library-docs, mcp__sequential-thinking__sequentialthinking
model: sonnet
---
```

- 核心指令原文（四条 directive）：
  `1. Analyze and Understand ... 2. Isolate and Identify: Methodically isolate the source of the failure to pinpoint the exact location in the code. 3. Fix and Verify: Implement the most direct and minimal fix required to resolve the underlying issue. You must then verify that your solution works as expected. 4. Explain and Recommend: Clearly explain the root cause of the issue and provide recommendations to prevent similar problems in the future.`
- 输出格式硬性要求原文（Output Requirements，逐字）：
  `- Summary of the Issue ... - Root Cause Explanation ... - Evidence ... - Code Fix (Diff Format): ... presented in a diff format (e.g., using --- a/file.js and +++ b/file.js). - Testing and Verification Plan ... - Prevention Recommendations`
- 约束原文（Constraints）：
  `- Focus on the Underlying Issue: Do not just treat the symptoms. ... - No New Features: Your objective is to debug and fix, not to add new functionality. - Clarity and Precision ...`
- **未提及**：TUI/桌面应用调试手段；未提及失败案例。

### 1.3 wshobson/agents — 同一仓库内 3 个不同"debugger"变体（三方，一手）

wshobson/agents 现为多宿主插件市场，仓库内**并存多个不同措辞的 debugger 定义**（不是单一版本），说明同一合集内部对"debugger 该做什么"本身就没有统一稿：

**(a) `plugins/debugging-toolkit/agents/debugger.md`**（精简版，5 步流程）：
```
---
name: debugging-toolkit-debugger
description: Debugging specialist for errors, test failures, and unexpected behavior. Use proactively when encountering any issues.
model: sonnet
---

You are an expert debugger specializing in root cause analysis.

When invoked:
1. Capture error message and stack trace
2. Identify reproduction steps
3. Isolate the failure location
4. Implement minimal fix
5. Verify solution works
```
URL: https://github.com/wshobson/agents/blob/main/plugins/debugging-toolkit/agents/debugger.md

**(b) `plugins/incident-response/agents/debugger.md`**（生产事故取向，强调 git bisect 自动化）：
```
---
name: incident-response-debugger
description: Performs deep root cause analysis through code path tracing, git bisect automation, dependency analysis, and systematic hypothesis testing for production bugs.
model: sonnet
---
```
能力清单逐字引用：`Root cause hypothesis formation with supporting evidence / Code-level analysis: variable states, control flow, timing issues / Git bisect automation: identify the exact introducing commit / Dependency analysis: version conflicts, API changes, configuration drift / State inspection: database state, cache state, external API responses / Failure mechanism identification: race conditions, null checks, type mismatches / Fix strategy options with tradeoffs (quick fix vs proper fix) / Code path tracing from entry point to failure location`
URL: https://github.com/wshobson/agents/blob/main/plugins/incident-response/agents/debugger.md

**(c) `plugins/agent-teams/agents/team-debugger.md`**（多代理并行假设验证设计，与前两者结构完全不同）：
- URL: https://github.com/wshobson/agents/blob/main/plugins/agent-teams/agents/team-debugger.md
- frontmatter 逐字：
```
---
name: team-debugger
description: Hypothesis-driven debugging investigator that investigates one assigned hypothesis, gathering evidence to confirm or falsify it with file:line citations and confidence levels. Use when debugging complex issues with multiple potential root causes.
tools: Read, Glob, Grep, Bash, TaskList, TaskGet, TaskUpdate, SendMessage
model: opus
color: red
---
```
- 设计要点：**一个 debugger 实例只负责一个假设**，由 team-lead 派发多个并行 team-debugger 去分别证实/证伪不同假设，再汇总比较。逐字引用（Core Mission）：
  `"Investigate your assigned hypothesis systematically. Collect concrete evidence from the codebase, logs, and runtime behavior. Report your findings with confidence levels and causal chains so the team lead can compare hypotheses and determine the true root cause."`
- 证据标准逐字（Evidence Standards）：
  `1. Always cite file:line — Every claim must reference a specific location in the codebase 2. Show the causal chain ... 3. Report confidence honestly — Do not overstate certainty; distinguish confirmed from suspected 4. Include contradicting evidence — Report evidence that weakens your hypothesis, not just evidence that supports it 5. Scope your claims ...`
- 置信度分级原文：`High (>80%), Medium (50-80%), Low (<50%)`
- 范围纪律原文（Scope Discipline，对"越改越坏"的直接防御设计）：
  `"Stay focused on your assigned hypothesis — do not investigate other potential causes. If you discover evidence pointing to a different root cause, report it but do not change your investigation focus. Do not propose fixes for issues outside your hypothesis scope."`
- 行为特征原文：`Honest about uncertainty — reports low confidence when evidence is insufficient / ... Distinguishes correlation from causation / Reports negative results (falsified hypotheses) as valuable findings`
- **意义**：这是本次调研中唯一一份**显式把"证伪也是有效结果"写进子代理契约**、且用**多实例并行+范围隔离**应对"越改越坏/自证偏见"问题的原文设计；但仓库中未给出该设计在实践中的失败或成功案例，纯规格文本。

### 1.4 VoltAgent/awesome-codex-subagents — Codex 侧对应版本（`debugger.toml`）

- URL: https://github.com/VoltAgent/awesome-codex-subagents/blob/main/categories/04-quality-security/debugger.toml
- 作者身份：三方（VoltAgent，跨宿主移植同一合集到 Codex CLI 配置格式）
- 性质：一手原文，可与 1.1 的 Claude 版本直接对照——**同一维护方对同一角色在不同宿主下的措辞差异**：
```toml
name = "debugger"
description = "Use when a task needs deep bug isolation across code paths, stack traces, runtime behavior, or failing tests."
model = "gpt-5.6-sol"
model_reasoning_effort = "high"
sandbox_mode = "read-only"
```
- 关键差异点（逐字）：**强制只读沙箱**（`sandbox_mode = "read-only"`），且明确要求"不下定论"：
  `"Do not claim definitive root cause without supporting evidence unless explicitly requested by the parent agent."`
- 质量检查项逐字：
  `- verify hypothesis ranking includes confidence and disconfirming evidence needs - confirm recommended fix addresses triggering condition and recurrence risk - check one success path and one failure path after proposed change - ensure unresolved uncertainty is explicit with next diagnostic step - call out validations requiring runtime instrumentation or integration environment`
- **意义**：与 Claude 版本相比，Codex 版本把"调试代理默认只读、不擅自改代码，改动权交回上级"和"未经证据不得下定论"写成硬约束，而不是像 VoltAgent 的 Claude 版本那样默认拥有 Write/Edit/Bash 全权限直接改代码。这是同一三方作者在两个宿主上对"debugger 该有多大权限"给出的不同答案，本身构成一条事实（而非本调研的建议）。

---

## 2. Hacker News（三方，一手/转述混合）

- 已检索 `debugger subagent claude code`、`AI agent debugging terminal TUI`、`Cloi debugging agent`、
  `debugging agent hallucinate root cause`（stories）与 `debugging agent loop same fix`（comments）。
- **Show HN 相关条目**（均为低分/低讨论度，如实记录）：
  - "Show HN: Cloi – free local debugging agent in your terminal" — https://github.com/cloi-ai/cloi （HN id 43918405，points 8，num_comments 1；另有重复提交 id 43909436 与 44122691，评论数均 ≤1）
  - "Show HN: A open-source, local trace viewer for Claude Code and Codex sessions" — https://github.com/DevonPeroutky/agent-profiler （id 48124878，points 1）
  - "Show HN: Textual-debugger, a Python TUI debugger with power features" — https://pypi.org/project/textual-debugger/ （id 48131081，points 3；注：这是给人类用的 Python TUI 程序调试器，不是 AI agent 子代理）
- **检索结论**：HN 上专门针对"debugger 子代理设计"的高讨论度帖子**未发现**；评论区搜索命中的多为泛化的"agent 陷入循环/消耗大量 token"话题，未见到聚焦"调试子代理"本身失灵原因的高质量长评论串。

---

## 3. 官方论坛失败经验帖（一方渠道，一手用户发帖）

### 3.1 forum.cursor.com — Agent CLI 陷入无限循环

- URL: https://forum.cursor.com/t/agent-cli-stuck-on-loop/149016
- 作者身份：一方渠道（Cursor 官方论坛）上的三方用户一手发帖（原帖作者 luchin/Luchin Becerra，非 Cursor 员工）
- 发帖日期：2026-01-15
- 逐字引用（问题描述）：`"the agent is stuck on a infinite loop where it keeps giving the same prompt one after another."`
- 复现步骤原文：`Use agent "some prompt" and it should loop over and over again`
- 期望行为原文：`Just use the first prompt, show the result and wait for another input from the user.`
- 官方/社区回复：Dean Rie（2026-01-16）确认为已知问题：`"a known issue with the CLI in non-interactive mode"`，建议改用交互模式：`"Just run agent with no arguments, then enter your prompts one at a time."`
- 后续 Matt S（2026-01-23）：`"This should be resolved in the past couple releases!"`
- 原作者确认修复：`"I updated today with agent update and now everything works fine"`
- 环境：macOS，Cursor 2.3.35，Composer 1 模型，Auto 模式。
- **失败教训（作者自述的成立/失效边界）**：非交互模式下传入单条 prompt 参数会导致 agent 循环重复同一条 prompt，而非等待新输入——这是**宿主 CLI 层的会话管理缺陷**导致调试/执行 agent 表现为"无限循环"，不是模型推理层面的调试能力问题。

### 3.2 community.openai.com — Codex agent 陷入 "context 自动压缩" 死循环

- URL: https://community.openai.com/t/codex-agent-stuck-in-infinite-read-search-loop-context-automatically-compacted-on-macos/1391979
- 作者身份：一方渠道（OpenAI 官方开发者论坛）三方用户一手发帖（bhanuvikram，2026-08-23 03:07am）
- 逐字引用（现象）：agent "has been running for over 3 hours across multiple model selections"，反复模式：
  1. "announces a plan to inspect files and run preliminary searches (`rg`, `git status`, `sed`)"
  2. 触发 `"Context automatically compacted"`
  3. "forgets its previous context, repeats the exact same file-reading steps, and loops indefinitely"
  从未推进到 "actually applying file edits or executing builds"。
- 已尝试但无效的自救："editing the prompt or switching models mid-session"——循环仍然持续，且出现 "Reconnecting /5" 报错或 Cursor 桌面应用崩溃（尝试 "Branch in new chat" 时）。
- 官方/社区回复：EricGT（2026-08-23 10:54am，论坛版主/资深社区成员，非 OpenAI 员工声明的官方回应，但为官方论坛内的权威转述）指出应到 GitHub issue tracker 报告，并称 "a search of the issues for **compact** currently shows 993 open issues"。
- 最终解决（2026-08-26）：作者自述换宿主即修复——`"I switched from the Codex extension in the Cursor desktop app to the standalone ChatGPT/Codex desktop app, and the issue is completely resolved."`
- **失败教训**：调试/修复任务本身没有问题，但**上下文压缩（compaction）机制会抹掉 agent 对"已经检查过什么"的记忆**，导致它对同一批文件重复做无意义的只读探索，属于跨越"调试子代理"层之下的宿主上下文管理缺陷；根因诊断从未开始（agent 卡在探索阶段），967+ 个同类未解决 issue 说明这不是孤立个案。

### 3.3 community.openai.com — Codex 9 小时循环耗尽整周额度

- URL: https://community.openai.com/t/codex-got-stuck-in-a-9-hour-loop-and-consumed-my-entire-weekly-usage-limit/1392515
- 作者身份：一方渠道，三方用户一手发帖（Doom666，2026-08-25 3:35pm，后续跟帖 2026-08-26 9:33am）
- 任务背景：对一个既有项目做 "a relatively small change"。
- 逐字/转述现象：Codex 反复 "state that it was going to make certain changes or fixes"，然后触发 context compaction，再重复同样的说明而不推进；且 "brought previously completed issues and changes back into the workflow"，"appeared to lose track of the actual project state"。
- 发现方式：次日早上检查才发现 "apparently spent around 9 hours running in this loop"。
- 代价：`"available weekly usage went from 100% to 0%"`，而 "original task was still not completed"。
- 修复：另起新会话（"a completely new chat inside the same project"）后 "work perfectly again and completed the requested changes very quickly"，作者据此推测是上下文窗口饱和导致。
- **失败教训**：与 3.2 同源问题（compaction 导致状态遗忘、无限重复），但这里的代价被具体量化为"整周配额清零、任务仍未完成"，且 agent 出现"把已经改完的东西当作待办重新提出"的**倒退行为**，不是单纯卡住不动。

---

## 4. 第三方博客经验帖（三方，一手）

### 4.1 Kerry Vaughan-Rowe — "Debugging Decay: The hidden reason you're throwing away credits"

- URL: https://kerryvaughan.substack.com/p/debugging-decay-the-hidden-reason
- 作者身份：三方（自述为 "an ex-YC startup founder"，独立博主，非 Anthropic/OpenAI 员工）
- 性质：转述 + 一手评论混合——核心数字引用自一篇论文（arxiv.org/abs/2506.18403），作者本人补充了根因分析与自用对策，属于三方对研究结果的二次解读加个人经验。
- 逐字引用（核心数据，作者转述论文图表）：
  `"After one attempt, GPT-4 gets 50% worse at fixing your bug." "After three attempts, it's 80% worse." "After seven attempts, it becomes 99% worse."`
- 根因逐字：
  1. `"Context Pollution — Every new prompt feeds the AI the text from its past failures."`
  2. `"Mistaken assumptions — If the AI makes a wrong assumption, it never thinks to call that into question."`
- 作者自述对策（原文，注意：任务要求不做建议，此处仅作为"作者自述的应对方式"记录，不代表本调研采纳）：
  `"The number one fix is to reset the chat after 3 failed attempts."`；`"Richer Prompt — ... include the full error trace / screenshots."`；`"Second Opinion — Pipe the same bug to another model (ChatGPT ↔ Claude ↔ Gemini)."`；`"Force Hypotheses First — Ask: 'List top 5 causes ranked by plausibility & how to test each' before it patches code."`
- **失败教训核心**：调试类任务存在"越改越差"的**统计性衰减曲线**（而非个别轶事），根因被归结为失败尝试本身污染了上下文、以及模型不会主动质疑自己已经做出的错误假设——这与第 1.3 节 wshobson team-debugger 的"范围隔离 + 证伪也是有效结果"设计所要防的问题类型一致。

### 4.2 Benedict L — "Claude Code Stuck in a Failure Loop I Escaped with Multi-Agent"

- URL: https://dev.to/ailnk0/claude-code-stuck-in-a-failure-loop-i-escaped-with-multi-agent-16di
- 作者身份：三方（独立开发者 Benedict L），dev.to 博客
- 性质：一手账，主题是改进开源项目 benchmark 分数时遇到的循环
- 逐字引用：`"It would try approach A, hit a wall, switch to B, then circle back to A. A classic failure loop."`
- 归因逐字：`"Too much data and work to fit in one agent's context. And every time Auto Compact ran, earlier decisions and work got diluted."`
- 应对：把任务拆成 "12 Tasks across 5 Phases" 的多代理架构，"each Task is sized so one agent can complete it within its context window"（这是架构调整而非专门的 debugger 子代理设计）。
- **局限**：文章未给出失败次数、日志或量化数据，也未描述是否使用了专门的"debugger"角色，只描述了架构性解法。

### 4.3 theahura（"12 Grams of Carbon"）— 瞬态/不可复现 bug 的边界

- URL: https://12gramsofcarbon.com/p/debugging-when-everything-is-on-fire （原发布于 theahura.substack.com，301 跳转到此域名）
- 作者身份：三方独立博主
- 性质：一手账，整体是**成功**案例（Claude Code 在系统崩溃前抓取现场，约 3 次崩溃循环、约 15 分钟定位到 npm 递归死循环导致的内存泄漏），但作者明确点出了方法的边界，逐字：
  `"at some point it is just fundamentally limited, because the 'problem' it is trying to debug is transient and is not currently happening"`
- **意义（成立条件的反面）**：作者自陈——**当故障是瞬态的、且触发调试时故障已不在发生状态**，这类"实时抓取系统状态"的调试方法从根本上失效；他的解法是让 agent 在崩溃"正在发生"的窗口内触发，而不是事后复盘。

### 4.4 Nate Combs — "Fly-By-Wire Debugging"

- URL: https://natecombs.substack.com/p/fly-by-wire-debugging
- 作者身份：三方独立作者
- 性质：一手账，与 Claude Code 协作调试一个复杂的时序逻辑 bug（涉及 exclusive fluents 与状态管理交互）
- 方法逐字：`"Claude on the controls, me calling plays and jamming more instrumentation into the code."`
- 成功要素逐字（Claude 自己总结的话被作者引用）：`"Evidence over intuition—every hypothesis got a corresponding trace."`；`"Comprehensive logging—80+ debug logs became the breadcrumb trail."`
- **失败案例（同一次调试过程里的多个死胡同，逐一记录）**：
  - "Cache contamination" 假设——耗费数小时，只带来部分改善，不是根因
  - "T+1 semantic issues"——确实发现了真实问题，但同样不是根因
  - "Parser/AST problems"——最终被判定为 "a red herring"（虚假线索）
  - 下午 3:45 出现"假胜利"：修复看似生效，直到跑完整套测试才发现问题仍在
- 最终有效策略逐字：`"incremental progress—fix one thing at a time, even if other tests still fail"`，以及 "failing tests point the way"。
- **意义**：这是本次调研中对"debugger agent 会在同一个 bug 上产生多个虚假根因假设（红鲱鱼）、甚至出现修复后误判为已解决的'假胜利'"描述最具体的一手记录。

---

## 5. TUI 程序调试：社区手段（三方，一手原文/工具 README）

### 5.1 spectatty — 给 AI agent 用的无头终端截屏工具

- URL: https://github.com/dayvidwang/spectatty
- 作者身份：三方独立开发者 dayvidwang
- 性质：一手项目 README
- 要解决的问题逐字（转述整理，README 原意）：Playwright 让 agent 能"看到"网页 UI，但**没有等价工具能让 agent 看到 TUI 渲染结果**，agent 因此在调试 TUI 时"flying blind"。
- 架构：`bun-pty`（在真实 PTY 里起进程）→ `@xterm/headless`（把转义序列解析成虚拟屏幕缓冲区）→ `@napi-rs/canvas`（把字符网格渲成 PNG）→ MCP server（把这套能力以 stdio 工具形式暴露给 agent）。
- 与批处理型录制工具（VHS）的区别（原意）：spectatty 是**交互式**的——agent 可以在会话运行过程中的任意时刻截图、等待某个画面出现，而不是"脚本录入、生成视频"的批处理模式。
- 关键能力：暴露离散化、可读、可复现的动作原语，如 `terminal_type`、`terminal_key`、`terminal_ctrl`；支持 `spectatty attach` 让人类实时旁观同一会话。
- **未见**：公开的失败案例或局限性说明（README 未提供已知问题清单）。

### 5.2 mager.co 博客 — tmux send-keys / capture-pane 编排 agent，及其亲历的坑

- URL: https://www.mager.co/blog/2026-08-23-orchestrating-agents-with-tmux/
- 作者身份：三方独立作者（mager）
- 性质：一手技术博客
- 核心命令逐字：
  ```
  tmux send-keys -t <name> '<command>' Enter
  tmux capture-pane -t <name> -p
  ```
  以及读取完整回滚缓冲区：`tmux capture-pane -t <name> -p -S -`
  作者对这套循环的描述原文：`"send-keys in, capture-pane out. An agent spawns a session, types a command, waits, reads the screen, decides what to type next."`
- **亲历的失败/坑（原文逐字）**：
  1. 转义序列污染日志：`"pipe-pane logs are soup. Escape codes make transcripts ugly to read."`
  2. `send-keys` 没有回执，时序不可靠：`"send-keys has no receipt. Keys are typed, not acknowledged. If the pane was busy or the shell wasn't ready, the keystrokes land somewhere unexpected."`
  3. 分离会话（detached session）环境变量缺失：从非交互 shell 启动时因 PATH 不完整出现 "command not found"。

### 5.3 YoanWai/agent-manager PR #524 — 给 TUI 截"证据帧"的具体流程

- URL: https://github.com/YoanWai/agent-manager/pull/524
- 作者身份：三方项目维护者 YoanWai
- 性质：一手 PR 文档
- 要解决的问题逐字（PR 描述原意）：`"CONTRIBUTING asks every pull request for visual evidence, and never says how to produce it for a full-screen TUI."`——普通截图会连带屏幕其余内容、也无法证明鼠标手势。
- 具体流程：隔离的 `HOME` 目录 + 独立 `TMUX_TMPDIR` socket → `go build ./... && tmux -L agentmgr new-session` → 用 SGR 字节序列注入鼠标按下/释放/滚轮/拖拽 → `tmux capture-pane -p` 取帧（可选 `od` 十六进制编码保留颜色信息）→ 清理两个 tmux server 与临时目录。
- 作者验证：在一台干净机器上从头跑通该流程后确认可行（PR #475 之后）。

### 5.4 mikeyobrien — "Tmux TUI Debugger" Claude Code Skill

- URL: https://mcpmarket.com/tools/skills/tmux-tui-debugger
- 作者身份：三方独立开发者 mikeyobrien
- 性质：一手 skill 说明
- 目标场景逐字：`"a structured workflow for identifying and fixing complex terminal rendering bugs, such as garbled output or broken streaming in AI orchestrators."`
- 手段：`tmux split-panes` 隔离测试环境；`tmux send-keys` 做非交互式远程控制；实时 TUI 状态捕获与诊断信息提取；针对 Nix/Fish shell 的环境同步；执行前自动清理残留进程锁与 git worktree。
- 页面未列出已知局限或失败案例。

### 5.5 Karthi Keyan — "Resolving Agent 'Terminal Blindness'"

- URL: https://dev.to/karthidreamr/resolving-agent-terminal-blindness-2a18
- 作者身份：三方独立作者，2025-12-20 发布
- 性质：一手技术博客，明确定义并命名了一种失效模式
- 定义逐字：`"'Terminal Blindness' is a condition where an AI coding agent can execute terminal commands but fails to see the resulting standard output (stdout) or standard error (stderr)."`
- 根因逐字：`"This is almost always caused by shell integrations and 'fancy' prompts that emit non-printable ANSI escape sequences and OSC (Operating System Command) codes."`——点名 `ble.sh`、`Starship`、`Atuin`，以及使用 OSC 633 做命令追踪的 IDE 集成。
- 解法（作者自述，`~/.bashrc` 片段逐字）：
  ```bash
  if [[ -n "$ANTIGRAVITY_AGENT" ]]; then
      export PS1='$ '
      unset PROMPT_COMMAND
      return
  fi
  ```
  即检测到是 agent 环境时直接跳过装饰性 shell 配置。
- **局限**：文中未给出具体的一次失败调试实例（没有"某次调试因为这个原因翻车"的叙事），只给出问题定义与架构性解法。

### 5.6 jpwong/ttypal-ai Issue #1（人类一手案例，非 agent 参与调试，作为"这类 bug 长什么样"的旁证）

- URL: https://github.com/jpwong/ttypal-ai/issues/1
- 作者身份：三方，项目维护者 jpwong，2026-09-22
- 性质：一手 issue，**未涉及 AI agent 参与诊断**（人类自己分析串口日志发现的），仅作为"终端转义序列类 bug 长什么样"的具体技术旁证收录
- 逐字引用：`"If the board ever emits a bare SO (0x0E, LS1), the receiving terminal emulator switches GL to G1 = DEC Special Graphics (standard VT behavior) and — because no matching SI (0x0F) follows — everything printed afterwards is rendered as DEC line-drawing glyphs."`
- 诊断方式逐字：`"The log is a faithful record... The stream is a binary/garbled dump from the board... and the two \x0e (SO) bytes, with no SI."`

---

## 6. 桌面应用（Electron/Tauri）调试：社区手段（三方，一手）

### 6.1 juri.dev — "A Visual Feedback Loop for Electron Apps with Claude Code"

- URL: https://juri.dev/articles/visual-feedback-loop-electron-apps-claude-code/
- 作者身份：三方独立开发者
- 性质：一手技术博客
- 问题逐字：`"the agent can't see what it's building. It writes code, runs the build, maybe checks the logs, but never actually looks at the rendered UI."`；`"If the window is blank or the layout is broken, it has no way to know."`
- 方法：Electron 启动时加 `--remote-debugging-port=9333`（Chromium 内置 CDP 支持），配合 `agent-browser connect 9333` 截图、查看 DOM。Nx + electron-vite 场景下的 `package.json` 片段：
  ```json
  {
    "scripts": {
      "dev": "electron-vite dev --watch -- --remote-debugging-port=9333"
    }
  }
  ```
- 局限（作者自述，逐字）：`"Without visual verification, an AI coding agent is essentially coding blind in Electron. It can check that the build succeeds and tests pass, but those don't tell you whether the window is blank, the CSS is broken, or the IPC bridge failed silently."`——即：这套方案只解决"看不看得见 UI"，不覆盖构建/测试已经能覆盖的问题，也不覆盖 IPC 静默失败之外的逻辑错误。

### 6.2 P3GLEG/tauri-plugin-mcp — Tauri 应用的 agent 调试插件

- URL: https://github.com/P3GLEG/tauri-plugin-mcp
- 作者身份：三方独立开发者 P3GLEG
- 性质：一手项目 README
- 协议链路逐字：`"AI Agent (Claude, Cursor, etc.) ↕ MCP protocol (stdio) → MCP Server → IPC socket or TCP → Tauri Plugin (Rust) → Tauri events → Guest JS (webview) → DOM APIs → Your Application"`
- 能力：截图、窗口管理、DOM 访问、模拟输入。
- **作者自述的明确局限（原文要点）**：
  1. 明确声明**仅限开发环境**，不得进入生产构建——任何能连上 socket 的进程都能获得对 app 的近乎完全控制权；
  2. 平台相关的输入注入限制：macOS 原生鼠标操作需要 Accessibility 权限；Windows/Linux 上退化为基于 JS 的输入模拟，覆盖率约 80%；
  3. Windows 上 token 文件使用默认 ACL 而非用户级权限，存在安全缺口；
  4. **能力边界**：解决不了与 UI/DOM 状态、IPC 通信、应用级逻辑无关、需要在 JS 执行之外做代码级检查的问题。

---

## 7. 官方产品文档中提到的"调试代理"设计（一方，背景参考，非社区一手，仅作对照）

- Cursor 官方博客 "Introducing Debug Mode: Agents with runtime logs" 与官方文档 https://cursor.com/docs/agent/debug-mode
  （一方厂商内容，非社区一手，仅记录其自述流程作为对照，不作为"社区做法"引用）：
  流程为生成多个假设 → 插入日志/埋点向本地调试服务器上报 → 等待用户复现 → 分析日志确认根因 → 打最小修复 → 清理埋点。
  官方文档称其设计针对的场景之一是"用户已经在同一会话里连续两次给出错误修复方向"（"guessing wrong twice in the same chat"），
  这与第 4.1 节 Kerry Vaughan-Rowe 描述的"调试衰减"现象在动机上对应，但这是厂商自述的产品设计初衷，不是社区反馈本身。

---

## 来源清单汇总（去重，标注身份与一/二手）

| # | URL | 身份 | 一手/转述 | 类别 |
|---|---|---|---|---|
| 1 | https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/04-quality-security/debugger.md | 三方 | 一手 | 子代理定义原文 |
| 2 | https://github.com/lst97/claude-code-sub-agents/blob/main/agents/quality-testing/debugger.md | 三方 | 一手 | 子代理定义原文 |
| 3 | https://github.com/wshobson/agents/blob/main/plugins/debugging-toolkit/agents/debugger.md | 三方 | 一手 | 子代理定义原文 |
| 4 | https://github.com/wshobson/agents/blob/main/plugins/incident-response/agents/debugger.md | 三方 | 一手 | 子代理定义原文 |
| 5 | https://github.com/wshobson/agents/blob/main/plugins/agent-teams/agents/team-debugger.md | 三方 | 一手 | 子代理定义原文（多代理假设验证） |
| 6 | https://github.com/VoltAgent/awesome-codex-subagents/blob/main/categories/04-quality-security/debugger.toml | 三方 | 一手 | 子代理定义原文（跨宿主对照） |
| 7 | https://forum.cursor.com/t/agent-cli-stuck-on-loop/149016 | 一方论坛/三方发帖 | 一手 | **失败经验** |
| 8 | https://community.openai.com/t/codex-agent-stuck-in-infinite-read-search-loop-context-automatically-compacted-on-macos/1391979 | 一方论坛/三方发帖 | 一手 | **失败经验** |
| 9 | https://community.openai.com/t/codex-got-stuck-in-a-9-hour-loop-and-consumed-my-entire-weekly-usage-limit/1392515 | 一方论坛/三方发帖 | 一手 | **失败经验** |
| 10 | https://kerryvaughan.substack.com/p/debugging-decay-the-hidden-reason | 三方 | 转述研究+一手评论 | **失败经验**（统计性衰减） |
| 11 | https://dev.to/ailnk0/claude-code-stuck-in-a-failure-loop-i-escaped-with-multi-agent-16di | 三方 | 一手 | **失败经验** |
| 12 | https://12gramsofcarbon.com/p/debugging-when-everything-is-on-fire | 三方 | 一手 | 成功案例+失效边界（瞬态 bug） |
| 13 | https://natecombs.substack.com/p/fly-by-wire-debugging | 三方 | 一手 | **失败经验**（红鲱鱼、假胜利，含成功） |
| 14 | https://github.com/dayvidwang/spectatty | 三方 | 一手 | TUI 调试工具 |
| 15 | https://www.mager.co/blog/2026-08-23-orchestrating-agents-with-tmux/ | 三方 | 一手 | TUI 调试手段 + **失败经验**（转义序列/时序） |
| 16 | https://github.com/YoanWai/agent-manager/pull/524 | 三方 | 一手 | TUI 证据帧捕获流程 |
| 17 | https://mcpmarket.com/tools/skills/tmux-tui-debugger | 三方 | 一手 | TUI 调试 skill |
| 18 | https://dev.to/karthidreamr/resolving-agent-terminal-blindness-2a18 | 三方 | 一手 | TUI/终端失效模式命名 |
| 19 | https://github.com/jpwong/ttypal-ai/issues/1 | 三方 | 一手（人类，非 agent） | 终端转义序列 bug 旁证 |
| 20 | https://juri.dev/articles/visual-feedback-loop-electron-apps-claude-code/ | 三方 | 一手 | Electron 调试手段 |
| 21 | https://github.com/P3GLEG/tauri-plugin-mcp | 三方 | 一手 | Tauri 调试手段 + 局限声明 |
| 22 | https://cursor.com/docs/agent/debug-mode | 一方（厂商，仅背景对照） | 一手（厂商自述） | 背景参考，非社区一手 |

共 **22** 条带 URL 来源（不计 Reddit 检索失败记录），其中明确带有"作者自述失败/局限案例"的至少 **7** 条（#7、#8、#9、#10、#11、#13、#15，外加 #12、#21 的边界声明）。
