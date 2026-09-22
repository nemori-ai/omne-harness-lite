# 可复核的来源与观察

本页是**取证条件、来源身份与核验状态的索引**：三路各自的精确对象、怎么取得、每条来源是一方还是三方、
一手还是转述、本包实际核到了哪一步。逐条观察与原始引文在 [reports/](reports/) 的三份当轮原稿里，本页不复制；
当前该信什么在 [research.md](research.md)。

> **核验状态的总声明（先读这条）**：本包的三份原稿是 **subagent 产出，属模型输出而非证据**。
> **主会话（派发者）没有逐句复核任何一条 URL**，也没有回到论文原文核对数字。
> 因此下面每张表的「本包核验」一列，绝大多数是 **「仅转述稿内声明，未复核」**——
> 这不是说那些来源不可信，而是说**本包不为它们背书**：要把其中任何一条当作设计依据，
> 先自己核一遍，核完回本页改这一列。

## 三路的取证条件与证据强度

| 路 | 来源域 | 取得方式 | 来源数 | 证据强度（稿内自评 + 本页判读） |
|---|---|---|---|---|
| **一方官方材料** | 八家产品的官方文档站、官方 GitHub 仓库源码、官方博客。第三方博客/教程/社区仓库**明确排除** | WebFetch + curl 直取页面 HTML／Next.js payload 并正则还原 markdown 源文本；`raw.githubusercontent.com` 直取源码；GitHub API 读目录清单与 byte size | 稿末编号清单 **20 条**（见下文「计数不一致」） | **最强（做了什么这一层）**：Codex 一路有源码逐字与 blob 大小；Claude Code / opencode 有逐字还原的页面原文。**弱（为什么这么做）**：除 Codex 的源码注释外，几乎没有作者自述理由 |
| **社区材料** | GitHub 子代理合集原文、官方论坛公开帖、第三方博客经验帖、TUI/桌面取证工具仓库 | repo 直读、论坛帖直读、博客直读；HN 走 Algolia API | **22 条** | **强（定义原文这一层）**：合集与工具 README 是 repo 直接内容。**中（失败经验这一层）**：7 条用户自述，**无一条有第三方复现**。**缺口**：Reddit 与 Discord 一手内容不可达 |
| **论文与工程规范** | 修复/调试 agent 论文、假设驱动调试经典、OpenTelemetry、终端录制与无头仿真、CDP、截图对比、2026 年新作 | WebFetch 抓 arXiv HTML/ar5iv/PDF 正文段落；规范页直取 | **21 条** | **混合**：A1–A5、B4 之外的部分、C1–C2、D1、F1–F2 为一手抓取；**B1、B2、B3、B4、D2、D3(部分)、E1、E2、G1(部分)、G2、G3 只到转述级**，逐项见下文合并清单 |

**一处计数不一致（照实记录）**：一方那份稿的来源清单**实际编号到 20 条**，但该节标题与任务导读都写的是
「15 条一手」，差额稿内**未解释**。本页按**实际列出的 20 条**登记。

## 两处版本坐标：稿内只到「当日线上版本」

三份稿**都没有记录 commit SHA 或产品版本号**：一方那份的取得方式写的是「取材内容以当日线上版本为准，
未逐一核对历史 commit hash」，Codex 一路只说明是 `main` 分支的 raw 文件内容。
因此本包结论一、二的对象坐标，严格说只有 **「2026-09-22 当日线上文档 + `main` 分支」** 这一层精度。

同一天另有一次**独立于三稿**的取证，把其中两家钉到了精确坐标。它是本包的第四条证据，取得方式如下：

| 对象 | 坐标 | 取得方式 | 观察 |
|---|---|---|---|
| Claude Code | `2.1.278` | 本机 `claude --version` 输出 `2.1.278 (Claude Code)`；对同一二进制做 `strings` 抽取内置 agent 名 | 内置子代理只有 `Explore`、`Plan`、`general-purpose` 与功能性的 `claude`、`statusline-setup`、`claude-code-guide`；没有 debugger |
| Codex | `16bb1b9d7e21f73d67f20aacc3a7c37d80cde352`（提交时间 2026-09-22 12:19 UTC） | `git clone --depth 1 https://github.com/openai/codex` 后读 `codex-rs/core/src/agent/role.rs` 与 `codex-rs/core/assets/agent/builtins/` | 内置角色 default / explorer / worker；awaiter 已注释；`explorer.toml` 为 0 字节；没有 debugger |

**这两个坐标不出自 reports/ 里的三份稿**，引用它们时依据的是这张表。其余六家**没有任何精确版本坐标**，
重新核对时只能按日期回溯。

## 一方官方材料：20 条来源

全部为**一方（厂商官方渠道）**。「本包核验」一列统一为「仅转述稿内声明，未复核」，另有标注的除外。

| # | URL | 一手/转述 | 稿内记录的取得方式与已知限定 |
|---|---|---|---|
| 1 | https://code.claude.com/docs/en/sub-agents | 一手（逐字还原） | curl 抓 Next.js payload 原始 HTML，正则从 `children:` 片段还原 markdown 源文本；原链接 `docs.claude.com/en/docs/claude-code/sub-agents` 301 重定向到此 |
| 2 | https://code.claude.com/docs/en/agent-sdk/subagents | 一手 | WebFetch 摘要 + 大段原文直出 |
| 3 | https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/src/agent/role.rs | 一手（逐字） | curl 直取 `main` 分支 raw 文件；**未记 commit SHA** |
| 4 | https://api.github.com/repos/openai/codex/contents/codex-rs/core/assets/agent/builtins | 一手 | GitHub API 读目录，确认文件清单与 byte size（`explorer.toml` `"size": 0`，blob sha 为 git 空文件标准 sha `e69de29b…`） |
| 5 | https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/assets/agent/builtins/awaiter.toml | 一手（逐字） | curl 直取，1213 字节 |
| 6 | https://learn.chatgpt.com/docs/agent-configuration/subagents | 一手 | WebFetch 摘要 + 原文引用 |
| 7 | https://cursor.com/docs/subagents | 一手 | WebFetch |
| 8 | https://cursor.com/docs/agent/debug-mode | 一手页面，**部分内容为转述** | WebFetch；稿内**自标** Debug Mode 五阶段与适用场景是「官方原话转述，非逐字网页文案」 |
| 9 | https://cursor.com/docs/bugbot | 一手 | WebFetch；Bugbot 的数值限制（30,000/100,000 字符、30/10/60 次每分钟）为页面原文 |
| 10 | https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents | 一手 | 官方文档 |
| 11 | https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/create-custom-agents | 一手 | 官方文档，frontmatter schema 与字符上限取自原文 |
| 12 | https://github.blog/ai-and-ml/github-copilot/from-one-off-prompts-to-workflows-how-to-use-custom-agents-in-github-copilot-cli/ | 一手 | 官方博客 |
| 13 | https://github.blog/news-insights/product-news/your-stack-your-rules-introducing-custom-agents-in-github-copilot-for-observability-iac-and-security/ | 一手 | 官方博客，四个示例的 name/description/tools 逐字摘录 |
| 14 | https://geminicli.com/docs/core/subagents/ | 一手 | WebFetch；**本页附加限定**：该域名是否为 Google 官方站，稿内按「官方文档站」采信而**未溯源**，本包不为此背书 |
| 15 | https://opencode.ai/docs/agents/ | 一手（逐字） | curl 直接抓渲染后 HTML 并去标签核验，非仅靠模型摘要 |
| 16 | https://moonshotai.github.io/kimi-cli/en/customization/agents.html | 一手 | WebFetch；稿内**自记**域名路径是 `kimi-cli` 而 GitHub 仓库名为 `MoonshotAI/kimi-code`，**未做进一步溯源核实** |
| 17 | https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md | 一手 | 官方仓库 `master` 分支页面；**未记 commit** |
| 18 | https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md | 一手 | 同上 |
| 19 | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md | 一手 | 同上 |
| 20 | https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/subagent | 一手 | 官方仓库目录列表 |

**明确排除的来源（稿内已声明，保留在此以免后人重走）**：`copilot-academy.github.io` 上关于
「security auditor、test writer、documentation reviewer、performance investigator、API designer 都可做成
custom agent」的罗列——非 `docs.github.com` / `github.blog` 域名，**判为非一手，未采信、未计入引用**。

**这一路的四条「未发现」及其检索位置**（负面结论的强度全在这一列，不能脱离它引用）：

| 对象 | 检索了哪里 | 结论强度 |
|---|---|---|
| GitHub Copilot | 两份官方文档页 + 两篇 `github.blog` 官方博客 | 读遍**指定的四份材料**未发现，不是穷举 |
| DeepSeek Harness | `AGENTS.md`、`README.md`、`docs/user/guide/index.md`、`packages/subagent/` 目录 | 读遍**指定的四处**未发现任何预置角色清单 |
| Codex CLI | `role.rs` 的 `configs()` 全文 + `builtins/` 目录**仅有的两个文件** | **清单可穷举、已读遍**——本路最强的一条负面结论 |
| Kimi Code CLI | `customization/agents.html` | 读遍**该单页**未发现 |

**未对任何一家做构造性反例验证**（例如实际启动产品、枚举可派发角色）。四条都是读数缺口。

## 社区材料：22 条来源

| # | URL | 身份 | 一手/转述 | 类别与本包附注 |
|---|---|---|---|---|
| 1 | https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/04-quality-security/debugger.md | 三方 | 一手 | 子代理定义原文；**全文能力清单式，无实证、无失败案例** |
| 2 | https://github.com/lst97/claude-code-sub-agents/blob/main/agents/quality-testing/debugger.md | 三方 | 一手 | 子代理定义原文；未提及 TUI/桌面，无失败案例 |
| 3 | https://github.com/wshobson/agents/blob/main/plugins/debugging-toolkit/agents/debugger.md | 三方 | 一手 | 子代理定义原文（精简 5 步版） |
| 4 | https://github.com/wshobson/agents/blob/main/plugins/incident-response/agents/debugger.md | 三方 | 一手 | 子代理定义原文（生产事故向） |
| 5 | https://github.com/wshobson/agents/blob/main/plugins/agent-teams/agents/team-debugger.md | 三方 | 一手 | 子代理定义原文（多实例并行假设验证）；**纯规格文本，仓库未给实践案例** |
| 6 | https://github.com/VoltAgent/awesome-codex-subagents/blob/main/categories/04-quality-security/debugger.toml | 三方 | 一手 | 子代理定义原文；**与 #1 同一维护方、另一宿主，权限结论相反**——本轮并行调研最值钱的一条对照 |
| 7 | https://forum.cursor.com/t/agent-cli-stuck-on-loop/149016 | 一方渠道上的三方用户 | 一手 | **失败经验**；环境 macOS / Cursor 2.3.35 / Composer 1 / Auto；官方确认为已知问题并已修复 |
| 8 | https://community.openai.com/t/codex-agent-stuck-in-infinite-read-search-loop-context-automatically-compacted-on-macos/1391979 | 一方渠道上的三方用户 | 一手 | **失败经验**（压缩失忆循环）；「993 个 open issue」出自论坛资深成员发言，**本包未核 issue tracker** |
| 9 | https://community.openai.com/t/codex-got-stuck-in-a-9-hour-loop-and-consumed-my-entire-weekly-usage-limit/1392515 | 一方渠道上的三方用户 | 一手 | **失败经验**；代价被量化为「整周配额 100%→0% 且任务未完成」 |
| 10 | https://kerryvaughan.substack.com/p/debugging-decay-the-hidden-reason | 三方 | **转述研究 + 一手评论** | **失败经验**（统计性衰减）；50/80/99% 出自 arXiv:2506.18403 的图表，**本包未取论文原文** |
| 11 | https://dev.to/ailnk0/claude-code-stuck-in-a-failure-loop-i-escaped-with-multi-agent-16di | 三方 | 一手 | **失败经验**；**未给失败次数、日志或量化数据**，也未说明是否用过专门的 debugger 角色 |
| 12 | https://12gramsofcarbon.com/p/debugging-when-everything-is-on-fire | 三方 | 一手 | 成功案例 + **失效边界**（瞬态故障）；原发布于 theahura.substack.com，301 跳转到此域名 |
| 13 | https://natecombs.substack.com/p/fly-by-wire-debugging | 三方 | 一手 | **失败经验**（红鲱鱼、假胜利，含最终成功）；本轮对这两类现象描述最具体的一手记录 |
| 14 | https://github.com/dayvidwang/spectatty | 三方 | 一手 | TUI 调试工具；**README 未提供已知问题清单**——「未见局限」是没查到，不是没有 |
| 15 | https://www.mager.co/blog/2026-08-23-orchestrating-agents-with-tmux/ | 三方 | 一手 | TUI 手段 + **三条一手坑**（转义序列污染、`send-keys` 无回执、detached session PATH 不全） |
| 16 | https://github.com/YoanWai/agent-manager/pull/524 | 三方 | 一手 | TUI 证据帧捕获流程；作者在干净机器上跑通，**无第三方复现** |
| 17 | https://mcpmarket.com/tools/skills/tmux-tui-debugger | 三方 | 一手 | TUI 调试 skill；**页面未列已知局限或失败案例** |
| 18 | https://dev.to/karthidreamr/resolving-agent-terminal-blindness-2a18 | 三方 | 一手 | 命名并定义「Terminal Blindness」；**文中无具体失败实例**，只有问题定义与架构性解法 |
| 19 | https://github.com/jpwong/ttypal-ai/issues/1 | 三方 | 一手（**人类分析，无 agent 参与**） | 终端转义序列 bug 的技术旁证（裸 `SO` 0x0E 无配对 `SI` 导致后续全部按 DEC 线绘字符渲染） |
| 20 | https://juri.dev/articles/visual-feedback-loop-electron-apps-claude-code/ | 三方 | 一手 | Electron 取证手段 + 作者自述边界 |
| 21 | https://github.com/P3GLEG/tauri-plugin-mcp | 三方 | 一手 | Tauri 取证手段 + **四条作者自述局限**（仅限开发环境、平台输入注入退化、Windows ACL 缺口、能力边界） |
| 22 | https://cursor.com/docs/agent/debug-mode | **一方（厂商）** | 一手（厂商自述） | 稿内明确标为**背景对照，非社区一手**；与 #10 的「调试衰减」在动机上对应，但那是厂商自述的产品设计初衷 |

**Hacker News**：已检索 stories 与 comments 两个索引（检索词见原稿 §2）。
命中的三条均为低分低讨论度条目（Cloi id 43918405，8 分 1 评论，另有两次重复提交评论数 ≤1；
agent-profiler id 48124878，1 分；textual-debugger id 48131081，3 分——后者是给人类用的 Python TUI 程序调试器，
不是 AI 子代理）。**未发现**聚焦「调试子代理失灵原因」的高质量讨论串。

## 论文与工程规范：21 条来源

| # | 条目 | URL | 一手/转述 | 本包附注 |
|---|---|---|---|---|
| A1 | SWE-agent（arXiv:2405.15793，NeurIPS 2024） | https://arxiv.org/abs/2405.15793 | **一手**（抓 HTML 全文相关段落） | 失败率数字取自原文；对象为 SWE-bench，非 UI/终端 |
| A2 | AutoCodeRover（arXiv:2404.05427，ASE 2024） | https://arxiv.org/abs/2404.05427 | **一手**（抓 §6.3/§7/§8 原文） | 29.3% 等数字与 Threats to Validity 取自原文 |
| A3 | RepairAgent（arXiv:2403.17134，ICSE 2025） | https://arxiv.org/abs/2403.17134 | **一手**（抓「VI Threats to Validity and Limitations」原文） | 前提「每个 bug 至少一个失败测试」为论文自陈局限 |
| A4 | Agentless（arXiv:2407.01489，FSE 2025） | https://arxiv.org/abs/2407.01489 | **一手**（抓 Introduction 与 §7 原文） | 三条对 agent 式系统失败模式的指认取自原文 |
| A5 | OpenHands（arXiv:2407.16741，ICLR 2025） | https://arxiv.org/abs/2407.16741 | **一手**（抓 PDF 正文段落） | Event Stream 与论文自陈局限取自原文 |
| B1 | Zeller 1999「Yesterday, my program worked…」 | https://www.st.cs.uni-saarland.de/publications/files/zeller-esec-1999.pdf | **转述** | 原始 PDF 为扫描/二进制流，WebFetch 无法可靠抽取；178,000 行这个数字经多个二手源交叉确认，**最终归约行数未获一手确认** |
| B2 | Zeller & Hildebrandt 2002「Simplifying and Isolating Failure-Inducing Input」（TSE 28(2)） | https://www.cs.purdue.edu/homes/xyzhang/fall07/Papers/delta-debugging.pdf | **转述** | PDF 抽取失败，依赖 https://blog.acolyer.org/2015/11/16/simplifying-and-isolating-failure-inducing-input/ 的二手总结 |
| B3 | Wong 等 2016「A Survey on Software Fault Localization」（TSE 42(8)） | https://doi.org/10.1109/TSE.2016.2521368 | **转述** | 未抓到全文限制章节；稿内**主动拒绝**采用常见的「无单一技术全面占优」转述说法，以免编造引文 |
| B4 | Pearson 等 ICSE 2017「Evaluating and Improving Fault Localization」 | https://ieeexplore.ieee.org/document/7985698/ | **转述** | 未直接抓全文或 IEEE Xplore 页；3,242 人工故障 / 323 真实故障经多个二手摘要交叉确认后采用；技术报告版 https://www.cs.washington.edu/tr/2016/08/UW-CSE-16-08-03.pdf |
| C1 | OpenTelemetry Logs 规范 | https://opentelemetry.io/docs/specs/otel/logs/ | **一手**（WebFetch 抓规范原文） | 「system logs…nearly impossible」一句为原文 |
| C2 | OpenTelemetry Semantic Conventions — General Logs Attributes（semconv 1.44.0） | https://opentelemetry.io/docs/specs/semconv/general/logs/ | **一手**（WebFetch） | 全部日志属性标注 "Development" 而非 "Stable" |
| D1 | asciicast file format v2 | https://docs.asciinema.org/manual/asciicast/v2/ | **一手**（WebFetch 抓规范原文） | 默认不录键盘输入、`idle_time_limit` 压缩时序、v1/v2 不兼容三条均为原文 |
| D2 | ttyrec 格式 | https://github.com/mjording/ttyrec | **转述** | 未取得 0xcc.net 原始规范全文；「不记录字符集与终端尺寸」「2038 问题」转自 https://handwiki.org/wiki/Ttyrec 等综合描述 |
| D3 | `@xterm/headless` | https://www.npmjs.com/package/@xterm/headless | **一手（类型声明头注释）+ 转述（npm 页描述）** | npm 页 WebFetch 返回 **HTTP 403**；「部分 API 标注 experimental、不受 semver 保护」一句**未逐字核验** |
| E1 | Chrome DevTools Protocol — Accessibility 域 | https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/ | **转述** | 该页直接抓取被重定向拦截；局限描述转引自 https://developer.chrome.com/blog/full-accessibility-tree |
| E2 | Electron 官方文档 — Automated Testing | https://www.electronjs.org/docs/latest/tutorial/automated-testing | **转述**（WebSearch 摘要，未逐字抓全文） | Spectron DEPRECATED 见 https://github.com/electron-userland/spectron |
| F1 | Playwright — Visual comparisons | https://playwright.dev/docs/test-snapshots | **一手**（WebFetch 抓原文） | 「渲染受 OS/版本/设置/硬件/电源/headless 影响」为原文 |
| F2 | An Empirical Analysis of UI-based Flaky Tests（arXiv:2103.02669） | https://arxiv.org/abs/2103.02669 | **一手**（抓 ar5iv 渲染全文相关段落） | 235 个样本，**Web 152 / Android 83，不含 TUI** |
| G1 | AgentStepper: Interactive Debugging of Software Development Agents（arXiv:2602.06593v1） | https://arxiv.org/abs/2602.06593 | **部分一手**（抓 PDF，仅确认标题、作者、日期与问题定位） | 技术细节章节因 PDF 结构**未能逐句核验**，稿内**拒绝编造**其局限措辞 |
| G2 | Terminal-Bench（arXiv:2601.11868） | https://arxiv.org/abs/2601.11868 | **转述**（WebSearch 摘要汇总，未抓全文） | 「<65%」一句为摘要级转述；项目页 https://www.tbench.ai/ ，仓库 https://github.com/laude-institute/terminal-bench |
| G3 | Characterizing the Failure Modes of LLMs in Resolving Real-World GitHub Issues（arXiv:2605.12270） | https://arxiv.org/abs/2605.12270 | **转述**（抓摘要页原文片段） | 900 次尝试中的 243 次失败，人工分析 |

## 未能一手核验：三稿清单合并

**方法学那一路的诚实存疑清单（原样保留 7 条）**：

- **B1（Zeller 1999）**：原始 PDF 为扫描/二进制流，WebFetch 无法逐句抽取，**最终归约行数未获一手确认**。
- **B2（Zeller & Hildebrandt 2002）**：同样因 PDF 二进制流无法逐句抽取，依赖 the morning paper 的二手总结。
- **B3（Wong 等 2016 综述）**：未能抓取全文；「无单一技术全面占优」一类常见转述说法**未在可核实片段中找到一手原文，
  该稿因此未采用该说法**。
- **B4（Pearson 等 2017）**：未能直接抓取论文全文或 IEEE Xplore 页面，核心数字经多个二手摘要交叉确认后采用。
- **D3（`@xterm/headless`）**：npm 页面直接抓取返回 403，局限描述部分依赖 WebSearch 汇总而非逐字核验。
- **E1（CDP Accessibility 域）**：官方文档页面本身抓取被重定向拦截，局限描述转引自 Chrome for Developers 博客。
- **G1（AgentStepper）**：PDF 结构限制导致技术细节章节未能逐句核验，仅确认标题、作者、日期与问题定位。

**本页补记：D2（ttyrec）与 G2（Terminal-Bench）同样只到转述级**，但**没有进这份清单**——
前者未取得 0xcc.net 原始规范全文，后者只有 WebSearch 摘要。引用这两条时按转述对待。

**社区那一路的缺口**：见下一节（Reddit / Discord 不可达；HN 无高质量讨论串）。

**一方那一路的缺口**：稿内自述「无」，但本页补记三条**它自己写下、却没有进入其缺口清单**的限定——
（a）**全路没有任何 commit SHA 或产品版本号**，只到「当日线上版本 / `main` 分支」；
（b）Cursor Debug Mode 的五阶段与适用场景是**官方原话转述，非逐字**；
（c）Kimi 的文档域名（`kimi-cli`）与 GitHub 仓库名（`kimi-code`）不一致，**稿内明说未进一步溯源**。
另有 geminicli.com 是否为 Google 官方站，**稿内按官方采信而未溯源**，本页不为此背书。

**本包（主会话）自身的核验缺口**：**一条都没有独立复核。** 上面三张表里「一手」的标注
全部是**各路自己声明的取得方式**，本包只做了三件事——去重、查冲突、把负面结论与它的检索位置绑在一起。

## 检索过但不可达：Reddit 与 Discord

**这一节不能省略**：沉默读起来和「那里没有内容」一模一样，而事实是取得方式失败了。

- **Reddit（r/ClaudeAI、r/ChatGPTCoding、r/cursor）**：已用 WebSearch 分别检索
  `"debugger subagent claude code experience"`、
  `"agent debugging loop wrong fix production TUI terminal application"`、
  `"AI coding agent could not reproduce bug pty raw mode terminal"`（均加 `allowed_domains: ["reddit.com"]`），
  以及不加域名限制的 `site:reddit.com …` 系列查询，并直接 WebFetch `www.reddit.com` 与 `old.reddit.com` 的搜索页。
  **结果**：WebSearch 对 `reddit.com` 直接返回 **API 400**（"the following domains are not accessible to our
  user agent"）；不加域名限制的查询从未在结果列表里返回真实 `reddit.com` URL；
  WebFetch 对两个域名均报错 "Claude Code is unable to fetch from …"。
  **结论：Reddit 一手内容本轮不可达，未发现可引用的原帖。**
- **Anthropic / OpenAI 官方 Discord 公开帖**：已检索「Anthropic Discord debugger subagent」
  「OpenAI Discord Codex debug agent failure」等词，搜索引擎未返回可直接访问的频道存档或转录页面，
  **未发现**可引用的一手材料。
- **可达并已引用的官方论坛**：`community.openai.com`、`forum.cursor.com`（见社区表 #7–#9、#22）。

## 这一轮不能据此声称什么

- **不能据此声称任何一家「不支持某能力」。**八家的负面结论全部是**读数缺口**，
  没有一条做过构造性反例验证；每个「未发现」必须连同上文那张**检索位置表**一起读。
- **不能把 `debugger` 这个名字的出现当成产品提供了这个角色。**八家里出现该名字的三处（Claude Code、
  Cursor、opencode）分别是文档范例、文档范例、一句话用例分类，**都不随产品安装**。
- **不能把社区合集当共识。**同一维护方在两个宿主上给出相反的权限答案（社区表 #1 与 #6），
  同一个仓库里并存三份措辞完全不同的 debugger（#3、#4、#5）。**这条冲突是本轮并行调研的产出，不能静默挑一个采用。**
- **不能把失败经验帖的频率当统计。**7 条用户自述、**零第三方复现**，它们证明这类失败发生过并长什么样，
  不支持任何关于发生率的说法；「993 个 open issue」是论坛成员的说法，本包未核 tracker。
- **不能把代码修复基准的数字搬到 UI/终端场景。**SWE-bench / Defects4J 系列的对象是 GitHub issue 与 Java 缺陷；
  UI flaky 的 45.1% 对象是 Web 与 Android。**本包里没有一条以 TUI 渲染缺陷为对象的量化数据。**
- **不能把「作者自述的对策」当有效性证据。**调试衰减那篇的重置/换模型/先列假设，
  以及 Terminal Blindness 那篇的 `~/.bashrc` 片段，都是作者自己的做法，**未经任何对照验证**。
- **不能把工具 README 的沉默读成「没有局限」。**spectatty 与 tmux-tui-debugger 两条**未提供已知问题清单**，
  本页记为「没查到」，不是「没有」。
- **不能把三份稿当证据。**它们是模型输出。**采信前自己核对关键来源**；核不动的，就停在「仅转述，未核原文」。
- **所有结论都绑在 2026-09-22 这一天。**八家的文档与源码迭代很快，而本轮**没有钉下 commit**——
  下一轮重新核对按 [演进事件词](../README.md#演进事件词) 记一条，不要原地覆盖本页与 [research.md](research.md)。
