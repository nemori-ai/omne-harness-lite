# debugger 子代理：现在该信什么

- **调查对象与日期**：八家一方产品的子代理体系与官方 debugger 材料（Claude Code、Codex、Cursor、
  GitHub Copilot、Gemini CLI、opencode、Kimi Code CLI、DeepSeek Harness），**以 2026-09-22 当日线上文档
  与 `main` 分支源码为准**；社区侧 22 条子代理定义原文、失败经验帖与 TUI/桌面取证工具；
  方法学侧 21 条论文与工程规范（SWE-agent、AutoCodeRover、RepairAgent、Agentless、OpenHands、
  delta debugging、故障定位综述与复现研究、OpenTelemetry、asciicast/ttyrec/@xterm/headless、CDP、
  Playwright、UI flaky 测试实证、2026 年三篇新作）。精确坐标与核验状态见 [evidence.md](evidence.md)。
- **消费者**：`tmp/omne-harness-lite-tui-design/06-debugger-subagent.md`（前端调试子代理的角色设计，
  任务材料，未入库）；将来的 `.meta_harness/agents/roles/frontend-debugger/`。
- **最近核对**：2026-09-22（首轮）。
- **当前结论（一句话）**：**八家一方产品没有一个内置 debugger 角色**，所有叫 `debugger` 的东西都是文档范例
  或第三方合集，而社区对「这个角色该有多大权限」**连同一个维护方在两个宿主上都给出相反答案**；
  真正被反复实证的是**六类失败模式**——越修越差、压缩失忆循环、定位对修错、红鲱鱼与假胜利、看不见终端、
  时序与像素判定不可靠——其中前四类在代码修复场景有量化数据，后两类的量化数据来自 Web/Android 而**不是终端**；
  TUI 与桌面的取证手段都只回答「屏幕上是什么」，**没有一种回答「为什么是这样」**，
  且每一种都在输入、时序、尺寸、进程边界或阈值上各有一处结构性失真。

## 问题与区分条件

要区分四件事：**一方产品实际内置了什么**（而不是文档里出现过什么名字）；
**社区在权限这一维上是否存在可援引的共识**（分歧本身就是结论）；
**哪些失败模式有实证而不只是轶事**，以及它们的实证对象与本项目的对象差在哪；
**每一种取证手段的证明力边界**——它能证明什么、不能证明什么、已知在哪里失真。

会改变本页边界的观察：任一家把 debugger 做成内置角色；出现只读与可写 debugger 的对照实测；
出现以 TUI/终端缺陷（而非 Web/Android）为对象的 flaky 与时序实证；
出现能把「渲染是否正确」转成可插桩程序谓词的公开做法。

## 证据入口

三路的取证条件、每条来源的身份（一方/三方）与一手/转述标注、合并后的未核验清单，
以及 Reddit/Discord 的不可达记录，全部在 [evidence.md](evidence.md)。
逐条观察与原始引文在 [reports/](reports/) 的三份当轮原稿里，本页不复制。

## 当前结论

### 一、八家一方产品没有一个内置 debugger 角色，所有叫 debugger 的东西都是文档范例或第三方合集

| 产品 | 内置子代理/角色 | `debugger` 出现在哪 | 该范例的权限 |
|---|---|---|---|
| **Claude Code** | `Explore`、`Plan`、`general-purpose`，加功能性的 `claude`、`statusline-setup`、`claude-code-guide` | 「Example subagents → Debugger」完整范例（工具清单 + 5 步流程 + 5 项交付物），以及 `--agents` CLI flag 的两句话版；**两处并存** | `Read, Edit, Bash, Grep, Glob`；页面原话说明加 `Edit` 的理由是 "fixing bugs requires modifying code" |
| **Codex** | `default`、`explorer`、`worker`；`awaiter` 整段被注释掉（源码注释 `// Awaiter is temp removed`） | **无 `debugger`**。文档「UI Debugging」用例给自定义样例 `browser_debugger`，并把调试拆成 code mapping / browser debugging / implementation **三个 agent** | `sandbox_mode = "workspace-write"`，但 `developer_instructions` 里写死 "Do not edit application code" |
| **Cursor** | `explore`、`bash`、`browser` | 文档「自定义子代理示例」里有 `debugger`，措辞与 Claude Code 两句话版几乎相同 | frontmatter 只给 name/description，**未列 tools** |
| **Gemini CLI** | `codebase_investigator`、`cli_help`、`generalist`、`browser_agent` | **未发现**；唯一完整自定义示例是 `security-auditor` | — |
| **opencode** | `general`、`explore`、`scout` | 「Use cases」逐字列了一条 `Debug agent: Focused on investigation with bash and read tools enabled`，**但 Examples 一节只有 docs-writer 与 security-auditor 两份完整模板** | 只有那一句话里的 bash + read |
| **Kimi Code CLI** | `coder`、`explore`、`plan` | **未发现**；自定义示例给的是 `reviewer` | — |
| **GitHub Copilot** | （custom agents 机制，无角色清单） | **未发现**；官方示例是 `readme-creator`/`readme-specialist` 与 Security audit / IaC compliance / Release docs / Incident response | — |
| **DeepSeek Harness** | **没有角色概念**：`packages/subagent/` 是后端无关的委派基础设施，子包按**部署形态**（fork-in-process / spawn-in-process / driver）与**后端适配**（acp / codex / claude-code / dsh-sdk）划分 | **未发现**；唯一与「调试」字面相关的是 `packages/runtime-diagnostics/`（运行时不变量监控），不是可派发角色 | — |

- **适用范围**：对 2026-09-22 当日的线上文档与 `main` 分支源码成立。
  **负面结论的强度分两层**：Codex 与 DSH 是**把可穷举的清单读遍了未发现**（`role.rs` 的 `configs()` 全文 +
  `builtins/` 目录仅有的两个文件——`awaiter.toml` 1213 字节、`explorer.toml` **0 字节空文件**；
  DSH 的 `AGENTS.md`/`README.md`/`docs/user/guide/index.md`/`packages/subagent/` 目录），
  Copilot、Gemini CLI、Kimi 是**检索指定的官方页面未发现**。**两者都是读数缺口，没有一条是构造反例验证过不存在。**
- **代价与不适用**：**不支持**推广为「厂商认为这个角色不必要」——opencode 官方把 "Debug agent" 列进五种
  常见用途却**偏偏不给它模板**，Codex 官方给的是把调试拆成三个 agent 的用例，两者都说明厂商想过这件事，
  只是没有固化成内置角色。**也不支持**「照抄官方范例即可」——Claude Code 与 Cursor 两份 debugger 范例文案
  高度相似（同一句 "Debugging specialist for errors and test failures"），本轮判断是文档惯例互相参照的产物，
  不是两家各自独立得到的设计结论；两份都已核实为各自官方站点当日在线内容，非虚构。
- **撞上这条事实会怎样**：任何把「宿主会提供一个可派发的 debugger」当作前提的设计，在这八家上都不成立——
  角色定义、权限、纪律与停止条件全部要自己承担；而照抄文档范例拿到的是一份**未经实证**的五步流程，
  它与下面六条失败模式的关系在范例里一个字都没有。
- **来源**：[一方官方材料原稿](reports/2026-09-22-official.md) §1–§8 与其「未发现清单」「存在但非内置的 debugger 命名子代理」两张汇总表；
  社区侧的对照见 [社区材料原稿](reports/2026-09-22-community.md) §1。
- **最近核对**：2026-09-22。

### 二、「debugger 该有多大权限」在社区里没有共识——同一维护方在两个宿主上给出相反答案

| 定义 | 权限 | 关键约束原文 |
|---|---|---|
| VoltAgent `awesome-claude-code-subagents/debugger.md` | `Read, Write, Edit, Bash, Glob, Grep`，model sonnet | 无权限约束；全文是能力清单式 checklist |
| VoltAgent `awesome-codex-subagents/debugger.toml`（**同一维护方，另一宿主**） | **`sandbox_mode = "read-only"`**，`model_reasoning_effort = "high"` | "Do not claim definitive root cause without supporting evidence unless explicitly requested by the parent agent." |
| lst97 `claude-code-sub-agents/debugger.md` | `Read, Write, Edit, MultiEdit, Grep, Glob, Bash, LS, WebSearch, WebFetch, TodoWrite, Task` + 三个 MCP 工具 | 输出必须含 diff 格式的 Code Fix；"No New Features" |
| wshobson `debugging-toolkit/debugger.md` | 未列 tools | 5 步流程，与 Claude Code 官方范例同源措辞 |
| wshobson `incident-response/debugger.md`（**同一仓库**） | 未列 tools | 生产事故取向，强调 git bisect 自动化、依赖漂移、状态检查 |
| wshobson `agent-teams/team-debugger.md`（**同一仓库**） | `Read, Glob, Grep, Bash, TaskList, TaskGet, TaskUpdate, SendMessage`，model opus | **一个实例只查一个假设**；置信度分级 High >80% / Medium 50–80% / Low <50%；"Include contradicting evidence"；"Reports negative results (falsified hypotheses) as valuable findings"；"do not investigate other potential causes" |

一方侧同样分裂：Claude Code 官方范例**给 `Edit` 并明说理由**，Codex 官方 `browser_debugger` 拿的是
`workspace-write` **却用指令挡住改源码**（"Do not edit application code"）——即沙箱字段与实际意图不一致，
靠提示词补。

- **适用范围**：以上全部是**定义原文**，不是实测效果。**没有任何一份给出该权限选择在实践中的成功或失败数据**；
  wshobson 的 `team-debugger` 是本轮唯一显式把「证伪也是有效结果」写进契约、并用多实例并行 + 范围隔离
  应对自证偏见的设计，但仓库里**纯规格文本，无实践案例**。
- **代价与不适用**：只读路线把改动权交回上级，代价是多一次往返、并要求上级读得懂证据；
  全权路线省掉往返，代价是结论三的「越修越差」与结论六的「假胜利」都发生在**没有第二双眼睛**的地方。
  **两条路线都没有公开的对照数据**——本轮检索了三个合集仓库、两家官方文档与七条失败经验帖，
  未发现任何一份把「只读 vs 可写」的效果差异量化过。
- **撞上这条事实会怎样**：引用「社区惯例」为某一种权限配置背书，会发现被引用的那个维护方在另一个宿主上
  给的是相反答案；这条分歧不能靠多找几份合集消解。
- **来源**：[社区材料原稿](reports/2026-09-22-community.md) §1.1–§1.4；
  [一方官方材料原稿](reports/2026-09-22-official.md) §1.2–§1.3、§2.2。
- **最近核对**：2026-09-22。

### 三、失败模式一：同一个 bug 上反复尝试之后，修复能力统计性衰减

- 三方博客转述 arXiv:2506.18403 的图表数据，逐字：`"After one attempt, GPT-4 gets 50% worse at fixing your bug."`
  `"After three attempts, it's 80% worse."` `"After seven attempts, it becomes 99% worse."`
  归因两条：`"Context Pollution — Every new prompt feeds the AI the text from its past failures."`
  与 `"Mistaken assumptions — If the AI makes a wrong assumption, it never thinks to call that into question."`
- 独立的一手论文数据指向同一方向：SWE-agent 原文 `"Any attempt at editing has a 90.5% chance of eventually
  being successful. This probability drops off to 57.2% after a single failed edit."`，
  `"Cascading failed edits make up another 23.4% of failures"`，2942 个任务里 **1185（51.7%）**的轨迹有 1 次以上失败编辑。
- RepairAgent 的资源分布佐证「不收敛」而非「单次判断错」：`"The number of tokens consumed by fixed bugs
  (21,000) is clearly lower than by unfixed bugs (315,000)"`——835 个 bug 修好 164 个（19.6%）。

- **适用范围**：50/80/99% 这组数字是**三方博客对论文图表的转述，本包未核到论文原文**，标为待核实；
  SWE-agent 与 RepairAgent 的数字是一手论文原文，但对象是 GPT-4 Turbo / Claude 3 Opus / GPT-3.5 与
  SWE-bench / Defects4J 的**代码修复任务**，**不是终端或 UI 缺陷**，外推需要自己举证。
- **代价与不适用**：这条事实只说明「同一会话里多试几次不是免费的」，**不说明重置会话能换回多少**——
  博客作者自述的对策（三次失败后重置、给全错误轨迹与截图、换模型取第二意见、先列假设再改代码）
  是**作者自己的做法，未经任何对照验证**，本包不把它当作有效性证据。
- **撞上这条事实会怎样**：把「让它再试一次」当作默认恢复手段，成功率按上面的曲线走，而消耗按 RepairAgent
  的分布走——失败的那条路花掉的 token 是成功那条的十几倍，且这一点在过程中看不出来。
- **来源**：[社区材料原稿](reports/2026-09-22-community.md) §4.1；
  [方法学原稿](reports/2026-09-22-methods.md) A1、A3。
- **最近核对**：2026-09-22。
- **状态标记**：待核实（50/80/99% 一组数字未取得 arXiv:2506.18403 原文）。

### 四、失败模式二：上下文压缩抹掉「已经查过什么」，把调试变成只读探索死循环

- OpenAI 官方论坛 #1391979（用户一手）：agent `"has been running for over 3 hours across multiple model
  selections"`，固定循环为「宣布计划并跑 `rg`/`git status`/`sed`」→ 触发 `"Context automatically compacted"`
  → `"forgets its previous context, repeats the exact same file-reading steps, and loops indefinitely"`，
  **从未推进到 "actually applying file edits or executing builds"**。论坛资深成员称 issue tracker 中
  搜 **compact 有 993 个 open issue**。作者最终换宿主（Cursor 桌面里的 Codex 扩展 → 独立 Codex 桌面应用）后消失。
- OpenAI 官方论坛 #1392515（用户一手）：同源现象，**9 小时循环**，`"available weekly usage went from 100% to 0%"`
  而 `"original task was still not completed"`；并出现**倒退行为**——把已经改完的东西重新当作待办提出来。
  新开会话后任务很快完成。
- dev.to 一手账：`"It would try approach A, hit a wall, switch to B, then circle back to A. A classic failure loop."`
  归因 `"every time Auto Compact ran, earlier decisions and work got diluted."`
- **另一层同形不同因的循环**：Cursor 官方论坛 #149016——非交互模式下传单条 prompt 参数导致无限重复同一条 prompt，
  Cursor 方确认 `"a known issue with the CLI in non-interactive mode"`，数个版本后修复。
  这是**宿主 CLI 的会话管理缺陷**，不是模型的调试能力问题。

- **适用范围**：四条都是**用户自述、无第三方复现**；993 这个数字是论坛成员的说法，本包未核 issue tracker。
  现象发生在 Codex 与 Claude Code 的具体宿主与版本上，稿内未记录精确版本（#149016 记了 Cursor 2.3.35 / macOS）。
- **代价与不适用**：调试任务比一般任务更容易撞上它——调试的中间产物正是「我已经排除了什么」，
  而那是压缩最先丢掉的东西。代价被量化过一次：**整周配额清零且任务未完成**。
  本包**没有**任何关于「什么样的压缩策略能保住排除记录」的证据。
- **撞上这条事实会怎样**：循环期间 agent 一直在产生看起来正常的只读动作，**不报错、不停止**；
  上面两例都是人过了几小时才发现的。
- **来源**：[社区材料原稿](reports/2026-09-22-community.md) §3.1–§3.3、§4.2。
- **最近核对**：2026-09-22。

### 五、失败模式三：定位正确不等于修复正确；而在最新模型上定位已不是主要失败源

- AutoCodeRover 一手原文：**`"In 29.3% of the tasks, AutoCodeRover correctly decided on all patch locations
  (at the method-level), but did not produce a correct patch."`**；另有 20.0% 定位到正确文件但错方法/类、
  18.0% 定位到错文件、6.7% 无可用补丁；解出率 19%（SWE-bench-lite），$0.43/issue。
  该文 Threats to Validity 自陈两条：LLM 随机性，以及 `"this patch may be overfitting"`——
  **用测试通过判定「已解决」这个验证标准本身不可靠**。
- arXiv:2605.12270（2026，人工分析 Claude 4.5 Sonnet / Gemini 3 Pro / GPT-5 在 SWE-bench Verified 上
  900 次尝试中的 243 次失败）：失败集中在 **"strategy formulation and logic synthesis"** 与
  **"problem understanding"**，而 **"localization" 反而是失败率最低的阶段**；同时指出
  `"existing evaluation harnesses occasionally misjudge correct patches due to superficial discrepancies
  or hidden constraints"`。

- **适用范围**：AutoCodeRover 的数字取自论文原文；arXiv:2605.12270 取自摘要页片段，**属转述级**。
  两者的对象都是 GitHub issue 修复，**不含 TUI 渲染或终端行为缺陷**。
- **代价与不适用**：这两组数据界定了「把投入放在让 agent 看见问题在哪」的收益上限，
  但**都没测过 UI/终端缺陷**——在那类对象上定位是否仍然容易，本包没有证据，两个方向都不能声称。
- **撞上这条事实会怎样**：把「测试通过」当作修好了的唯一判据，会把过拟合的补丁计成解决（论文自陈）；
  反过来，评测/验收框架本身也会把正确补丁误判为失败，**两个方向的误判都已被记录**。
- **来源**：[方法学原稿](reports/2026-09-22-methods.md) A2、G3。
- **最近核对**：2026-09-22。

### 六、失败模式四：同一个 bug 会长出多个虚假根因与一次「假胜利」；故障是瞬态时这条路直接不成立

- 三方一手账（与 Claude Code 协作调试一个时序逻辑 bug）逐条记录了死胡同：
  "Cache contamination" 假设**耗费数小时、只带来部分改善**、不是根因；"T+1 semantic issues" 是**真实问题
  但同样不是根因**；"Parser/AST problems" 最终被判为 **`"a red herring"`**；
  **下午 3:45 出现「假胜利」——修复看似生效，直到跑完整套测试才发现问题仍在**。
  该次调试的有效要素是作者引述的两句：`"Evidence over intuition—every hypothesis got a corresponding trace."`
  与 `"Comprehensive logging—80+ debug logs became the breadcrumb trail."`，收敛靠
  `"incremental progress—fix one thing at a time, even if other tests still fail"`。
- 另一份一手账是**成功案例**（约 3 次崩溃循环、约 15 分钟定位到 npm 递归死循环导致的内存泄漏），
  但作者自己点出这条路的硬边界，逐字：`"at some point it is just fundamentally limited, because the
  'problem' it is trying to debug is transient and is not currently happening"`。

- **适用范围**：两条都是**单个独立开发者的一手叙述，无量化、无对照、无复现**。
  它们证明这类现象发生过并长什么样，**不支持**任何关于发生频率的说法。
- **代价与不适用**：假胜利的代价在于它**只在跑完整套验证之后才暴露**——在那之前，agent 与人看到的都是
  一次成功的修复。瞬态故障的代价更硬：事后复盘这条证据链**根本不成立**，要么在故障正在发生的窗口里抓现场，
  要么承认这类问题不在能力范围内；本包**没有**关于「怎样可靠地抓到那个窗口」的证据。
- **撞上这条事实会怎样**：以「假设 → 改 → 局部测试通过」为收敛判据，会在多个虚假根因上各消耗一轮，
  并且至少一次把未解决报成已解决。
- **来源**：[社区材料原稿](reports/2026-09-22-community.md) §4.3、§4.4。
- **最近核对**：2026-09-22。

### 七、失败模式五：agent 能执行终端命令，却看不见那条命令的输出

- 三方博客给出定义与命名，逐字：`"'Terminal Blindness' is a condition where an AI coding agent can execute
  terminal commands but fails to see the resulting standard output (stdout) or standard error (stderr)."`
  根因逐字：`"This is almost always caused by shell integrations and 'fancy' prompts that emit non-printable
  ANSI escape sequences and OSC (Operating System Command) codes."`——点名 `ble.sh`、`Starship`、`Atuin`
  以及用 OSC 633 做命令追踪的 IDE 集成。作者的做法是在 `~/.bashrc` 里检测到 agent 环境就跳过装饰性配置。
- 相邻的一手陈述：`spectatty` README 的问题陈述是「Playwright 让 agent 能看到网页 UI，
  但**没有等价工具能让 agent 看到 TUI 渲染结果**，agent 调试 TUI 时 "flying blind"」；
  tmux 编排的一手坑之一是 `"pipe-pane logs are soup. Escape codes make transcripts ugly to read."`

- **适用范围**：定义与根因出自**单个作者的一手博客**，文中**未给出任何一次具体的失败调试实例**
  （作者自陈只提供问题定义与架构性解法）。点名的四类 shell 集成没有逐个复现。
- **代价与不适用**：这类失效**不报错**——命令执行成功、退出码正常，只是 agent 读到的是被转义序列污染或
  截断的内容；在 agent 眼里，它和「命令真的什么都没输出」长得完全一样。
  代价还包括环境耦合：要消除它就要动被测者的 shell 环境，而那本身会改变被调试对象。
- **撞上这条事实会怎样**：agent 会基于「没有输出」这个错误观察去推理，而推理链条上每一步都看不出源头错了。
- **来源**：[社区材料原稿](reports/2026-09-22-community.md) §5.5、§5.1、§5.2。
- **最近核对**：2026-09-22。

### 八、失败模式六：时序判定与像素比对本身就是 UI 级观测里最大的不可靠来源

- arXiv:2103.02669（235 个真实 flaky UI 测试，62 个项目，Web 152 / Android 83）：
  **Async Wait Issues 占 45.1%（105/235）**，Test Script Logic 19.1%，Environment Issues 18.7%
  （跨浏览器/设备的平台特定渲染差异），Test Runner API 17.0%。论文强调 UI 测试有
  `"larger input spaces and more diverse running conditions than traditional unit tests"`、
  `"more complex and resource-heavy"`，**使「重跑多次以检测不稳定性」的常规做法在 UI 上不现实**。
- Playwright 官方文档原文：`"Browser rendering can vary based on the host OS, version, settings, hardware,
  power source (battery vs. power adapter), headless mode, and other factors."`——
  应对手段是 `maxDiffPixels` 之类阈值去容忍抗锯齿差异。
- tmux 侧的同类时序坑（一手）：`"send-keys has no receipt. Keys are typed, not acknowledged. If the pane was
  busy or the shell wasn't ready, the keystrokes land somewhere unexpected."`

- **适用范围**：45.1% 这组数字的实证对象是 **Web 与 Android**，**不含 TUI 与终端**；
  Playwright 那条讲的是浏览器渲染，不是终端渲染。把两者搬到 TUI 是**本包未做的外推**。
- **代价与不适用**：像素比对的代价被官方口径写死了——**放宽阈值换稳定性，同时就降低了对真实细微视觉回归的
  检测灵敏度**，两者不可兼得；而 UI 场景里最常用的「重跑几次看稳不稳」这条兜底，按论文口径在 UI 上成本过高。
- **撞上这条事实会怎样**：「等一会儿再截图/再读缓冲区」这类时机判定是 UI 观测里最大、最普遍的不确定来源，
  且它不是某个工具的实现缺陷；把不稳定的比较结果当成缺陷证据，会把时序噪声诊断成渲染回归。
- **来源**：[方法学原稿](reports/2026-09-22-methods.md) F1、F2；[社区材料原稿](reports/2026-09-22-community.md) §5.2。
- **最近核对**：2026-09-22。

### 九、TUI 取证手段：每一种能证明什么、在哪里结构性失真

| 手段 | 能证明什么 | 不能证明 / 已知失真 |
|---|---|---|
| **asciicast v2**（一手规范） | 输出流 + ANSI 序列 + 终端尺寸（header 必含 `width`/`height`）；帧为 `[time, code, data]` | **默认不录键盘输入**（原文：`"asciinema CLI doesn't capture keyboard input by default."`）——「agent 敲了什么导致了什么」默认不在录像里；`idle_time_limit` 会压缩空闲时间，**录下的时序不是忠实时间线**；v2 与 v1 不兼容 |
| **ttyrec**（转述） | 真实 tty 上的文本模式输出 + 微秒级时间戳 | 原文：`"The format does not contain any information about the character set used nor about the terminal size needed to play back the file."`，另有 2038 年问题——**回放正确性完全依赖外部约定** |
| **`@xterm/headless`**（一手类型声明 + 转述） | 把 ANSI/VT 序列解析成屏幕缓冲区对象，可程序化查询某行某列的字符与颜色，是「结构化断言终端状态」的实现基础 | 类型声明头注释原文承认**公开 API 声明与 `src/` 实现存在差异**；部分 API 标注 experimental、不受 semver 保护（该句**未逐字核验**） |
| **tmux `send-keys`/`capture-pane`**（一手博客） | 取整屏，`-S -` 取完整回滚缓冲；`"send-keys in, capture-pane out"` 这套循环可跑通 | 三条一手坑：转义序列污染日志；**`send-keys` 无回执**（时序不可靠）；detached session 因 PATH 不完整出现 `command not found` |
| **spectatty**（一手 README） | `bun-pty` → `@xterm/headless` → `@napi-rs/canvas` → MCP 的链路，**交互式**任意时刻截图与等待画面，动作原语离散化（`terminal_type`/`terminal_key`/`terminal_ctrl`） | README **未提供已知问题清单**——本包记为「未发现局限」，**等于没查到，不等于没有** |
| **tmux 证据帧流程**（一手 PR） | 一条可复核的取帧流程：隔离 `HOME` + 独立 `TMUX_TMPDIR` socket → `tmux -L` 起会话 → SGR 字节序列注入鼠标按下/释放/滚轮/拖拽 → `capture-pane -p` 取帧（可选 `od` 十六进制保留颜色）→ 清理；作者在干净机器上跑通 | 是单个项目的贡献流程，**无第三方复现**；解决的是「怎么产出可提交的视觉证据」，不解决判读 |
| **Terminal-Bench**（转述） | 「agent 向持久 tmux 会话发按键 + 程序化验证」已是学界现成范式（89 个人工编写并验证的任务、Docker 环境、oracle 解法） | 原文：`"Frontier models and agents score less than 65% on the benchmark."`——**该范式下最强组合的成功率上限也低于 65%** |

- **适用范围**：除 asciicast 规范与 `@xterm/headless` 的类型声明头注释外，本节多数来源是**项目 README 与
  个人博客**，没有独立复现；Terminal-Bench 一条是搜索摘要转述，未抓论文全文。
- **代价与不适用**：**这一层全部只回答「屏幕上是什么」，没有一种回答「为什么是这样」**；
  三种录制/回放格式各自在不同维度上失真（输入缺失、时序压缩、尺寸与字符集缺失），
  **合起来也拼不出一条完整可信的因果链**：要么补显式输入录制与未压缩时序，要么承认录像不能证明因果。
- **撞上这条事实会怎样**：拿一份默认配置的终端录像去证明「agent 做了 X 导致 Y」，
  录像里根本没有 X；拿 ttyrec 回放去比对渲染，尺寸不匹配就会产生与原始缺陷无关的错位。
- **来源**：[方法学原稿](reports/2026-09-22-methods.md) D1–D3、G2；
  [社区材料原稿](reports/2026-09-22-community.md) §5.1–§5.4。
- **最近核对**：2026-09-22。

### 十、桌面取证手段：CDP 这条链路目前没有官方标注稳定的一手工具，且 AX 树不是渲染结果的镜像

| 手段 | 能证明什么 | 不能证明 / 已知局限 |
|---|---|---|
| **Electron + CDP 截图**（一手博客） | 用 `--remote-debugging-port=9333` 起 Electron，agent 连上去截图、查 DOM——解决「agent 看不看得见自己在造什么」 | 作者自述边界逐字：`"Without visual verification, an AI coding agent is essentially coding blind in Electron. It can check that the build succeeds and tests pass, but those don't tell you whether the window is blank, the CSS is broken, or the IPC bridge failed silently."`——**只解决看得见，不覆盖构建/测试已能覆盖的问题，也不覆盖 IPC 静默失败之外的逻辑错误** |
| **Electron 官方自动化**（转述） | 可走 Playwright 对 Electron 的支持（依托 CDP） | **Spectron 已标注 DEPRECATED**，Playwright 对 Electron 的支持被官方描述为 **experimental**——这条链路**当前没有一个官方标注 stable 的一手工具**；Spectron 的 `auditAccessibility()` 依赖网页无障碍审计规则库，**不等同于渲染正确性检测** |
| **CDP Accessibility 域**（转述，官方页抓取被重定向拦截） | `getFullAXTree` 可取无障碍树（可选 `depth`/`frameId`） | 标注 **Experimental**；跨站文档被隔离到不同渲染进程，前端必须对每个 out-of-process 子文档**单独请求再拼接**；树是**懒加载**构建；`"ignored"` 节点与无名的 `"generic"` 角色节点**默认被隐藏**。即：**AX 树是按需拼接 + 语义过滤的二次构造产物，不是渲染结果的镜像** |
| **`tauri-plugin-mcp`**（一手 README） | MCP(stdio) → IPC socket/TCP → Tauri 插件(Rust) → webview → DOM 的完整链路；截图、窗口管理、DOM 访问、模拟输入 | 作者自述四条：**仅限开发环境**，任何能连上 socket 的进程获得对 app 近乎完全的控制权；macOS 原生鼠标需 Accessibility 权限，**Windows/Linux 退化为 JS 输入模拟，覆盖率约 80%**；Windows 上 token 文件用默认 ACL，存在安全缺口；**解决不了与 UI/DOM 状态、IPC 通信、应用级逻辑无关的代码级问题** |

- **适用范围**：Electron 官方自动化与 CDP Accessibility 两条**均为转述**（官方页面抓取被拦截，
  局限描述转引自 Chrome for Developers 博客对同一机制的说明）。
- **代价与不适用**：选 CDP 这条路要承担 experimental API 的变动风险；
  用 AX 树断言「页面上有什么」要接受两处扣减——跨 frame 拿到的是拼接结果而非单一权威快照，
  以及**视觉上确实存在渲染差异的节点可能因为「无语义」被主动过滤掉**。
  把调试能力做进产品构建则要正面撞上 `tauri-plugin-mcp` 自述的第一条限制。
- **来源**：[方法学原稿](reports/2026-09-22-methods.md) E1、E2；
  [社区材料原稿](reports/2026-09-22-community.md) §6.1、§6.2。
- **最近核对**：2026-09-22。

### 十一、经典定位与最小化方法的前提是二元 oracle 与可切分输入，终端与 UI 场景不自动满足

- delta debugging 的成立前提：需要「曾经能工作的版本」与「现在失败的版本」之间的一组变更，
  且**失败可重复判定（pass/fail 二元）**；1999 年那篇的案例是 GDB 4.16→4.17，
  在 178,000 行变更中数小时内定位到单一致因变更。
- `ddmin` 保证返回 1-minimal 的失败诱因输入，但效率的前提被写明：
  `"Whether this 'best case' efficiency applies depends on our ability to break down the input into smaller
  chunks that result in determined (or better: failing) test outcomes."`
- RepairAgent 的前提同形：Defects4J 每个 bug 至少有一个失败测试用例，论文自陈
  `"which may not be the case for real-world usage scenarios"`。
- 故障定位技术家族（SBFL、slice-based、program-state-based、ML-based）普遍假设
  **存在可执行、可插桩、可获取覆盖率/状态的程序**。

- **适用范围**：本条四项中，delta debugging 两篇与故障定位综述**均为转述级**（PDF 为二进制/扫描流，
  未能逐句抽取；综述全文未抓到）；RepairAgent 一条取自论文原文。
- **代价与不适用**：**终端渲染是高度状态相关的流**——前一帧的光标位置与颜色状态会影响后续帧的解释，
  因而「能否把输出切成各自可判定 pass/fail 的独立小块」是一个**必须单独验证的前提**，
  而这些论文只对独立输入元素的场景给出保证，**没有讨论非二元失败判据下的适用性**。
  同理，要复用 SBFL 类方法定位「渲染错误」，得先把「渲染是否正确」转成可插桩的程序谓词——
  **这一步在综述覆盖范围之外**，本包也没有任何公开做法的证据。
- **撞上这条事实会怎样**：在「看起来不对」这种非布尔判据上直接套用二分/最小化，
  会得到一个依赖不稳定判定的归约过程，其输出无法解释为致因。
- **来源**：[方法学原稿](reports/2026-09-22-methods.md) B1–B4、A3。
- **最近核对**：2026-09-22。
- **状态标记**：待核实（B1、B2、B3 三项一手原文本轮未取得）。

### 十二、日志与 trace 的关联必须由应用侧显式传播，系统日志这条路被规范明确排除

- OpenTelemetry Logs 规范原文：关联依赖**执行上下文被主动传播并写入日志记录**
  （`"It is a standard practice to record the execution context (trace and span IDs as well as user-defined
  context) in the spans. OpenTelemetry extends this practice to logs where possible by including TraceId and
  SpanId in the LogRecords."`），并明确写下限制：
  **`"system logs either do not include any data about the trace context or if included it is highly
  idiosyncratic and thus difficult to identify, parse and use. This makes it nearly impossible to perform
  trace context correlation for system logs."`**
- semconv **1.44.0**：通用日志标识属性、日志文件属性、I/O 流属性**全部标注 "Development" 稳定性等级**，
  不是 "Stable"——字段命名与语义在规范层面仍可能变化。
- 一手工程先例是 OpenHands 的 Event Stream（把 action 与 observation 按时间顺序统一记录，
  供 agent 与调试者回放，且全部动作在隔离的 Docker 沙箱里执行）；但论文自陈
  `"Most AI agents today are still research artifacts and lack the ability to perform complex, long-horizon
  tasks in the real world reliably."`，其手段是**缓解而非解决**：系统性评测 + 人类监督。

- **适用范围**：OTel 两条取自规范原文；OpenHands 取自论文 PDF 正文。
  规范讲的是通用可观测性，**没有任何一条是针对 agent 调试终端应用这个场景写的**。
- **代价与不适用**：想把 agent 的执行 trace 与它启动的子进程、TUI 应用、shell、tmux 产生的系统日志关联起来，
  按规范原文**接近不可行**，除非应用层显式插桩传播上下文——即**这项关联的代价落在被调试对象身上，
  而不是落在观测工具上**；并且可依赖的字段命名本身还在 Development 阶段，跨版本兼容性没有稳定承诺。
- **来源**：[方法学原稿](reports/2026-09-22-methods.md) C1、C2、A5。
- **最近核对**：2026-09-22。

### 十三、多给一种观测手段不自动更好；用人工注入缺陷验证有效性会高估

- Agentless 对 agent 式系统失败模式的三条指认（原文）：
  `"Complex tool usage/design... incorrectly or imprecisely defining/using a tool can both reduce performance
  and incur additional cost in wasted LLM queries."`；
  `"Lack of control in decision planning... can be extremely easy for autonomous agents to become confused and
  perform sub-optimal explorations."`；
  `"Limited ability to self-reflect... they tend to take all information/feedback and do not know how to filter
  out or correct irrelevant, incorrect, or misleading information."`
  该文用三阶段固定流水线（定位→修复→验证）在 SWE-bench Lite 取得 27.33%、$0.34/issue，
  **高于同期 agent 式方案且更便宜**。
- Pearson 等人在 3,242 个人工注入故障与 6 个真实程序上的 323 个真实 bug 上复现了 10 项既有主张，结论（转述）：
  **`"Of the previous claims, 7 were supported as statistically significant on artificial faults, but only 3 had
  non-negligible effect sizes. However, when evaluated on real faults, every previous result was refuted or was
  statistically and practically insignificant."`**，并据此断言
  `"artificial faults (e.g., mutants) are not an adequate substitute for real faults"`。

- **适用范围**：Agentless 取自论文原文，其 Threats to Validity 自陈两条——GPT-4o 训练数据泄漏，
  以及外部效度（`"While the performance of Agentless might not generalize to other datasets..."`）；
  Pearson 一条为**转述级**，核心数字经多个二手摘要交叉确认后采用，本包未取到全文。
  两者对象都是代码级缺陷，不是 UI/终端缺陷。
- **代价与不适用**：这条事实**不说明**应该少给工具——它说明的是**每加一种观测手段都要连同它的误导成本一起算**，
  而本包没有任何一份材料测量过「加一种 TUI 观测手段」的净效果。
- **撞上这条事实会怎样**：用人工注入的 UI 缺陷去验证一个调试角色有没有用，
  结论外推到真实缺陷上失效**已有实证先例**，不是理论担心。
- **来源**：[方法学原稿](reports/2026-09-22-methods.md) A4、B4。
- **最近核对**：2026-09-22。
- **状态标记**：待核实（Pearson 一项一手原文本轮未取得）。

## 支撑假设

| 假设 | 若它不成立，哪条结论垮掉 | 本轮是否核对 |
|---|---|---|
| 三稿转引的论文原文与数字与其一手来源一致 | 三、五、八、十一、十三 | **未核对**——主会话未回到论文原文逐句复核，三稿自身的转述标注见 [evidence.md](evidence.md) |
| 三稿记录的官方文档与源码内容为 2026-09-22 当日线上版本 | 一、二 | **部分核对**——Claude Code 与 Codex 两家另有当日独立取证（见 [evidence.md](evidence.md)），其余六家仅采信稿内声明 |
| 七条失败经验帖是真实用户的真实遭遇，而非虚构或营销 | 四、六 | **未核对**——均为论坛/博客自述，无第三方复现 |

## 未知与下一项证据

| 未知或冲突 | 最小区分调查/实验 | 受影响选择及消费时点 | 所需产物/责任 |
|---|---|---|---|
| 调试衰减 50/80/99% 出自 arXiv:2506.18403 的哪张图、什么实验设置与样本 | 取论文原文核对图表与设置 | 结论三现为转述级，**不能单独作为设计依据** | 待明确 |
| AgentStepper（arXiv:2602.06593）的技术方案与局限数据 | 逐句精读 PDF（本轮受 PDF 结构限制只确认到标题、作者、日期与问题定位） | 本轮唯一以**调试 agent 自身执行轨迹**为对象的工作，与角色设计同构，缺它就少一条最近的上游读数 | 待明确 |
| Reddit 与 Discord 上的一手失败经验 | 换取得方式（本轮 WebSearch 对 `reddit.com` 返回 API 400，WebFetch 被拒） | 社区失败模式目前只有 7 条自述样本，频率与分布无从判断 | 待明确 |
| 终端/TUI 缺陷上是否复现 45.1% 的异步时序占比 | 在终端场景重做一次 flaky 成因分类 | 结论八对 TUI 的适用性目前**是外推**，不是观察 | 待明确 |
| 只读 debugger 与可写 debugger 的实际效果差异 | 任何一份带对照的实测或事后统计 | 结论二只给出定义分歧，权限选择在本轮**没有任何效果数据可依据** | 待明确 |
| Zeller 两篇、Wong 综述、Pearson、CDP Accessibility 页只到转述级 | 取一手 PDF 与官方页面 | 结论十、十一、十三的相应条目 | 待明确 |
| 「渲染是否正确」能否转成可插桩的程序谓词 | 检索是否存在公开做法；没有就记为空白 | 结论十一给出的是前提缺口，本轮**未发现**任何公开解法 | 待明确 |

## 采用与后续核对

本包**不接受任何方案**：上面每一条都写到「这让什么不可能、什么要额外付出代价」为止，
角色该怎么设计、权限怎么配、取证手段怎么选，归 [record/proposals](../../design/record/proposals/README.md)
与 [record/decisions](../../design/record/decisions/README.md)。

当前实际消费本研究的是 `tmp/omne-harness-lite-tui-design/06-debugger-subagent.md`（任务材料，未入库），
以及将来的 `.meta_harness/agents/roles/frontend-debugger/`。

后续核对：八家产品的文档与源码迭代很快，结论一、二绑死在 2026-09-22 这一天；
下一轮重新核对时按 [演进事件词](../README.md#演进事件词) 记一条，**不要原地覆盖**——
本包尚无 `changelog.md`，第二轮真的发生时再建。
