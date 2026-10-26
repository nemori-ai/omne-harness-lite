# 并行 coding agent 实践调研（2025–2026）

**状态：调研材料。**本文是 [Map-Reduce 式交付推进](../README.md) 的依据，不是规则。标「未核」的结论使用前要复核。文中的「我们」指写作时采用这种交付做法的项目，文中的数值是当时的粗估或示例，不是阈值。

取证日期：2026-10-26。来源编号见文末 [S1]–[S29]。「未核」= 只见到二手转述，没有在一手原文里核到。厂商自报的数字标「厂商自报」。

## 0. 一句话结论

业界在 2026 年收敛到这个格局：**智能可以并行，写入保持单线程；验证尽量左移到每条线自己，集成节点只做组合与放行**。我们的「独立线并行 + reduce 串行」方向和这个格局一致。瓶颈不在并行度。瓶颈在三处：评审吞吐、每条线自带的确定性验证，以及上下文包的新鲜度。

## 1. 并行编排模式

| 模式 | 一手做法与限制 | 数据 | 来源 |
| --- | --- | --- | --- |
| orchestrator/worker（研究型） | lead 规划，subagent 各用独立上下文并行搜索，压缩后回报。每个 subagent 的 brief 要写明 objective、output format、工具与来源、task boundaries。早期出现过简单查询起 50 个 subagent、多个 subagent 重复做同一块的问题，后来按复杂度规定规模：简单查询 1 个 agent、3–10 次工具调用 | 多 agent 比单 Opus 4 高 90.2%（内部评测）。token 用量单独解释 80% 的方差。多 agent 的 token 约为聊天的 15 倍。原文明确说：**coding 可并行的子任务少于研究，强依赖的工作不适合** | [S1] 2025-06-13 |
| 单线程写、多方贡献智能 | Cognition 2025 年反对多 agent。2026 年修正为：generator-verifier 评审回路、「Smart Friend」升级、manager-child（map-reduce-and-manage）可用。**并行写者的 swarm 仍会各自做出冲突的隐式决策**，无结构 swarm「mostly a distraction」 | Devin Review 平均每个 PR 找出 2 个 bug，约 58% 为严重（厂商自报） | [S2] 2026-04-22 |
| 每 agent 一个 worktree | Claude Code `--worktree`；subagent 可设 `isolation: worktree`；`/batch` 把改动分给 5–30 个 subagent，每个在自己的 worktree 里做。worktree **只隔离文件**，端口、数据库、服务不隔离 | — | [S3][S4] 文档，无日期 |
| agent teams | 共享 task list（文件锁认领）+ mailbox。**实验特性，默认关闭**。官方建议 3–5 个 teammate，每人 5–6 个任务；同文件编辑会互相覆盖；已知问题：lead 会自己动手、任务状态滞后、不能恢复会话 | — | [S5] 文档 |
| 云端会话 | Claude Code cloud：每个会话一个隔离 VM，每条 `--cloud` 命令是一个独立会话，与其他用量共享 rate limit；auto-fix 能响应 CI 失败和评审意见，但**收不到 base 前进导致冲突的事件**。Cursor Cloud Agents：每个 agent 一个隔离 VM，用 `.cursor/environment.json` 或 snapshot 配环境，官方称「as many agents as you want in parallel」，复杂仓库配环境要 1 小时左右。Codex cloud：每个任务一个沙箱。Copilot coding agent：在临时环境里跑，用 `copilot-setup-steps.yml` 预装依赖 | — | [S6][S7][S8][S9][S10] |
| best-of-N | Cursor 2.0 支持「一个 prompt 最多 8 个 agent」，这是同一任务多候选，**不是 fan-out** | — | 二手转述 Cursor 2.0 changelog，未核 |

吞吐与质量的实测数据：

| 结论 | 数据 | 来源 |
| --- | --- | --- |
| 个人产出涨，组织指标不动；评审成为瓶颈 | AI 采用率高的团队：任务 +21%，合入 PR +98%，**评审时间 +91%**，PR 体积 +154%，人均 bug +9%（1 万名开发者、1,255 个团队；厂商研究，属相关性） | [S11] 2025-07-23 |
| 吞吐与稳定性背离 | AI 采用与交付吞吐正相关，与稳定性仍然负相关；「AI amplifies what's already there」；约 5,000 份调研 | [S12] 2025-09-23 |
| 体感与实测相反 | RCT：16 名资深开发者、246 个任务，用 AI **慢 19%**，但自评快了 20% | [S13] 2025-07-10 |
| agent PR 合入率 | 157 个项目中 567 个 Claude Code PR，83.8% 合入；其中 45.1% 需要人工修订 | [S14] 2025-09 |
| 并行 agent PR 普遍存在 | AIDev-pop 中 40.2% 的仓库有同时活跃的 agent PR 对；范围窄、规则清楚的任务合入率最高 | [S15] 2026-07，摘要页二手，未核 |
| 规模化后台 agent | Spotify Honk 合入 1,500+ 个 PR，迁移类任务省时 60–90% | [S16] 2025-11-06 |

## 2. 上下文工程

**原则**（[S17] 2025-09-29）：context rot 和有限的 attention budget 决定了做法：追求「smallest set of high-signal tokens」；**just-in-time retrieval**，只给路径、查询等标识，运行时再加载，不要一次倒进全文；长任务靠 compaction、结构化笔记，或用 subagent 回传 1,000–2,000 token 的摘要。

**AGENTS.md / CLAUDE.md 的证据**

| 结论 | 来源 |
| --- | --- |
| 上下文文件「does not generally improve task success rates」，推理成本平均高 20% 以上。分类型数字（LLM 生成的文件降低成功率，人写的约 +4pp）只见于二手转述，**未核** | [S18] arXiv 2602.11988，2026-02 |
| 「A short, accurate AGENTS.md is more useful than a long file」；同一错误出现两次再加规则；离得最近的文件优先 | [S8] Codex 文档 |
| 每一行都问「去掉会不会导致犯错」；文件过长，规则会被忽略；只在部分场景用到的知识放进 skill，必须执行的规则写成 hook | [S19] Claude Code 文档 |
| 上下文写进代码库（测试、linter、API 文档），比写进 prompt 更可复用；工具越多越不可预测；一个 prompt 只做一个改动；写明**何时不要动手** | [S20] Spotify Part 2，2025-11-24 |
| 长任务交接用初始化 agent，产出 progress 文件、JSON feature list（全部初始标为 failing）和 init.sh；后续会话先读 progress 文件和 git log 再开工，一次只做一个 feature | [S21] 2025-11-26 |

**「自包含任务」的判据**（四家官方说法对齐）

| 维度 | Codex [S8] | Copilot [S10] | Anthropic subagent brief [S1] | Claude Code spec [S19] |
| --- | --- | --- | --- | --- |
| 目标 | Goal | 问题描述 | objective | — |
| 输入 | Context（文件、错误） | 指向要改的文件 | 工具与来源指引 | 写明涉及的文件与接口 |
| 约束、边界 | Constraints | — | task boundaries | 写明不在范围内的内容 |
| 完成判据 | **Done when** | **验收标准** | output format | **以端到端验证步骤结尾** |

二手指南补充一条：写不出具体的「done when」，就说明任务太虚，不能派（未核）。

**陈旧与冲突的处理**：社区没有成体系的方法。可见的做法有三种：(a) 派发前先放一个 **scout** agent 试做，不合入，只为摸清坑在哪里（[S22] 2025-10-05）；(b) 开工时从 git 历史和 progress 文件重新定位，不全信交接包（[S21]）；(c) 会话里纠正两次还不对，就清空上下文重来（[S19]）。

## 3. 集成与合并

| 机制 | 要点 | 来源 |
| --- | --- | --- |
| GitHub merge queue | 把 PR 和前面排队的 PR 叠在临时分支 `gh-readonly-queue/*` 上构建；CI 必须监听 `merge_group`；`build concurrency` 可设 1–100；可设分组上下限和 wait time；开启「only merge non-failing PRs」后每个 PR 都必须通过；某组失败就移出失败的 PR，重建后续组 | [S23] 文档 |
| Zuul 推测式门控 | 假设前面的变更都会合入，并行测试；失败后重置后续变更；窗口初始 20，每次成功 +1，每次失败减半；`Depends-On` 声明跨仓依赖，依赖必须是单向图 | [S24] 文档 |
| Stacked PR + 队列 | Graphite 提供按栈排序的 merge queue，并能在 PR 页继续 agent 对话。提速数字为厂商自报；被 Cursor 收购一事**未核** | 二手 |
| 批量评审 | Copilot：用「Start a review」把意见攒成一批再发，避免逐条往返（[S10]）。Cognition：评审者**不共享**作者上下文，只看 diff；中间用 bridge 过滤意见，防止循环和越界修改（[S2]） | [S2][S10] |
| 集成者角色 | Willison：「only focus on reviewing and landing one significant change at a time」；评审是天然瓶颈；先写清 spec 的任务评审更快 | [S22] |

## 4. 质量与验证

| 做法 | 证据 | 来源 |
| --- | --- | --- |
| 独立评审优于自评 | 新上下文的 reviewer 不偏向自己刚写的代码（Writer/Reviewer 模式）；reviewer 被要求找问题时总会报出一些，所以要限定「只报影响正确性和需求的缺口」，否则会过度工程化 | [S19] |
| 确定性验证器 + LLM judge | Spotify：格式化、构建、测试的验证器在 Stop hook 上跑，**PR 打开前**全部跑完；judge 看 diff 和原 prompt，否决约「a quarter」的会话，被否决后约「half the time」能自行纠正；judge **尚未做正式评测**。三类失败按严重度排：没产出 PR < PR 挂 CI < **过了 CI 但功能错** | [S25] 2025-12-09 |
| mutation 作为生成指引 | Meta ACH 针对特定关注点生成未被检出的变异体，再写测试去杀；工程师接受 73% 的生成测试 | [S26] FSE 2025 |
| spec-driven | GitHub Spec Kit 走 Specify → Plan → Tasks → Implement，每一阶段放行后才进下一阶段；用 `constitution.md` 记录不可协商的原则。批评意见：它只管到第一次生成 | [S27] 2025-09-02 |

**失败模式集锦**

| 模式 | 一手例子 |
| --- | --- |
| 绕过或改动测试 | Anthropic 在 harness 里写明「unacceptable to remove or edit tests」（[S21]）；Spotify 的 judge 专门拦禁用 flaky test 的改动（[S25]）；METR：o3 读取评分代码里的答案并关闭计时（[S28] 2025-06-05；比例「1–2%」未核） |
| 过早宣布完成 | 只做完部分 feature 就宣布结束；没做端到端测试就标完成（[S21]） |
| 重复实现、分工不清 | 多个 subagent 做同一块（[S1]）；并行写者各自做出隐式决策（[S2]） |
| 上下文漂移 | 长会话积累失败尝试；CLAUDE.md 过长导致规则被忽略（[S19]） |
| 越界改动 | judge 最常见的否决理由是超出 prompt 范围（[S25]） |

## 5. 治理与度量

| 框架或案例 | 量什么 | 来源 |
| --- | --- | --- |
| DX AI Measurement Framework | Utilization（AI 参与的 PR 比例、派给 agent 的任务数）/ Impact（PR 吞吐、省下的时间、DX Core 4）/ Cost。Booking.com 吞吐 +16%（厂商案例） | [S29] 2025 |
| DORA 2025 | 四个交付指标加 rework；文中的「七项 AI 能力」原文是图片，名称**未核** | [S12] |
| Faros 跨季度追踪 | 按季度聚合，只保留 ≥6 家公司、p<0.05 的指标；2026 版报告（2.2 万名开发者）与 2025 版数字差别大，**不能直接当趋势比较** | [S11] |
| Spotify 跨迭代 | 合入 1,000 个 PR 从约 3 个月降到约 10 天（InfoQ 转述，未核） | 二手 |

公开的「同一团队跨迭代对比」案例很少。现有数字大多是厂商自报或调研相关性，**没有找到有对照的返工率公开数据**。

## 6. 对我们怎么用、量什么

| # | 实践 | 针对的痛点 | 可测指标 |
| --- | --- | --- | --- |
| 1 | **验证左移到每条线**：每条线在交回前，用 Stop hook 或 gate 脚本跑完自己写范围内的类型检查、测试和结构读数，交回包附上证据（命令和退出码）。reduce 只复核组合效应 | 集成节点串行 | reduce 每张卡的墙钟时间；交回后首次准入失败率 |
| 2 | **reduce 改用推测式分组**：参照 merge queue 和 Zuul，把同一波里写范围不相交的 PR 叠在一起跑一次 gate，失败就二分剔除；窗口按成败调整 | 集成节点串行 | 每波 gate 运行次数 / PR 数；分组失败重置率 |
| 3 | **独立评审 + 限定范围 + 批量下发**：reviewer 用新上下文，只看 diff 和卡片验收标准，只报正确性和需求缺口；意见一次成批下发；在评审者和写者之间放一层过滤，剔除越界意见 | 评审修复往返 | 每个 PR 的评审轮数；否决率与自行纠正率（Spotify 口径）；需人工修订的比例（基线参考 45.1%） |
| 4 | **自包含判据写进卡片模板，做成可机检的准入**：Goal / 输入路径 / 写范围与不在范围 / Done when（必须是可运行的命令）；任何一栏缺失就不派发 | 上下文包陈旧、分解错误 | Done-when 可执行卡片的比例；因分解错误而重开或拆卡的次数 |
| 5 | **上下文包改为指针加时间戳**：包里只放路径、提交号和查询，不粘贴正文；开工第一步用当前 HEAD 校验包（diff 包里记录的 SHA）；对把握不大的分解，先派 scout 试做 | 上下文陈旧 | 派发时包的年龄（相对 HEAD 落后的提交数）；包过期导致返工的次数 |
| 6 | **运行时隔离与名额**：worktree 不隔离端口、数据库和 CPU。同机并行时给每条线分端口段和数据库文件，重测试走名额队列；能上云的线用每任务一个 VM | 同机测试挤超时 | 超时导致的伪失败率（按波统计）；排队等待时长 |
| 7 | **AGENTS.md 只做减法**：只写模型推不出的命令和坑；同一错误出现两次才加规则；必须执行的规则写成 hook 或检查器 | 上下文噪声 | AGENTS 加载的 token 数；规则被违反的次数 |
| 8 | **看板加交付度量列**：每张卡记录 attempt 数、评审轮数、首次准入结果、交回到接受的时长，按 Wave 汇总后做跨波比较 | 治理 | 合入率、返工率（attempt>1 的卡占比）、Cycle days 的 P50/P90 |

**社区明确反对或踩过坑的做法**

- 多个并行写者共享同一块写范围，或无结构的 swarm 互相协商（[S2][S5]）。
- 用 LLM 生成又长又全的 AGENTS.md（[S18][S19]）。
- 让 agent 自己判断「完成」，不设可运行的检查；允许它改测试（[S19][S21]）。
- 子任务分得太碎，协调成本超过收益；不按复杂度控制 agent 数量（[S1][S5]）。
- 把 best-of-N 当成 fan-out 用；在 team 里让 lead 自己写代码（[S5]）。
- 追着 reviewer 的每条意见改，导致过度工程化（[S19]）。
- 只看个人或 PR 产出量，不看评审时长和稳定性（[S11][S12]）。

## 来源

- [S1] Anthropic, How we built our multi-agent research system, 2025-06-13. https://www.anthropic.com/engineering/multi-agent-research-system
- [S2] Cognition (Walden Yan), Multi-Agents: What's Actually Working, 2026-04-22. https://cognition.com/blog/multi-agents-working
- [S3] Claude Code docs, Run parallel sessions with worktrees. https://code.claude.com/docs/en/worktrees
- [S4] 实践者博客，worktree 的端口与数据库冲突（实践者报告）. https://developer.upsun.com/posts/ai/git-worktrees-for-parallel-ai-coding-agents
- [S5] Claude Code docs, Agent teams. https://code.claude.com/docs/en/agent-teams
- [S6] Claude Code docs, Use Claude Code in the cloud. https://code.claude.com/docs/en/claude-code-on-the-web
- [S7] Cursor docs, Cloud Agents. https://cursor.com/docs/cloud-agent
- [S8] OpenAI Codex, Best practices. https://learn.chatgpt.com/guides/best-practices
- [S9] GitHub, Responsible use of Copilot coding agent. https://docs.github.com/en/copilot/responsible-use/copilot-coding-agent
- [S10] GitHub, Best practices for using Copilot to work on tasks. https://docs.github.com/en/copilot/tutorials/coding-agent/get-the-best-results
- [S11] Faros AI, The AI Productivity Paradox Report 2025, 2025-07-23. https://www.faros.ai/blog/ai-software-engineering
- [S12] Google Cloud, Announcing the 2025 DORA report, 2025-09-23. https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report
- [S13] METR, Early-2025 AI on experienced OS developers, 2025-07-10. https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- [S14] Watanabe et al., On the Use of Agentic Coding (arXiv 2509.14745), 2025-09. https://arxiv.org/abs/2509.14745
- [S15] AIDev 相关研究（arXiv 2601.18749，2026-01；alphaxiv 2607.21832，2026-07）. https://arxiv.org/abs/2601.18749
- [S16] Spotify, 1,500+ PRs Later (Honk Part 1), 2025-11-06. https://engineering.atspotify.com/2025/11/spotifys-background-coding-agent-part-1
- [S17] Anthropic, Effective context engineering for AI agents, 2025-09-29. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- [S18] Gloaguen et al., Evaluating AGENTS.md (arXiv 2602.11988), 2026-02-12. https://arxiv.org/abs/2602.11988
- [S19] Claude Code docs, Best practices. https://code.claude.com/docs/en/best-practices
- [S20] Spotify, Context Engineering (Honk Part 2), 2025-11-24. https://engineering.atspotify.com/2025/11/context-engineering-background-coding-agents-part-2
- [S21] Anthropic, Effective harnesses for long-running agents, 2025-11-26. https://anthropic.com/engineering/effective-harnesses-for-long-running-agents
- [S22] Simon Willison, Embracing the parallel coding agent lifestyle, 2025-10-05. https://simonwillison.net/2025/Oct/5/parallel-coding-agents/
- [S23] GitHub docs, Managing a merge queue. https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- [S24] Zuul docs, Project gating. https://zuul-ci.org/docs/zuul/latest/gating.html
- [S25] Spotify, Predictable Results Through Strong Feedback Loops (Honk Part 3), 2025-12-09. https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3
- [S26] Meta, Mutation-Guided LLM-based Test Generation at Meta (arXiv 2501.12862), FSE 2025. https://arxiv.org/abs/2501.12862
- [S27] GitHub Blog, Spec-driven development with AI (Spec Kit), 2025-09-02. https://github.blog/2025-09-02-spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- [S28] METR, Recent Frontier Models Are Reward Hacking, 2025-06-05. https://metr.org/blog/2025-06-05-recent-reward-hacking
- [S29] DX, AI Measurement Framework, 2025. https://getdx.com/ai-measurement-framework/
