# 证据记录

本页是**索引与取证条件**：每家的精确对象、取得方式、这一轮实际核到了什么、以及不能据此声称什么。
逐条观察与原始引文在 [reports/](reports/) 的四份当轮报告里，本页不复制。
当前结论见 [research.md](research.md)。

## 取证条件总览

| 来源 | 精确对象与版本 | 取得方式 | 证据强度 |
|---|---|---|---|
| **DeepSeek Harness** | 只读副本 `/tmp/deepseek-harness`，commit `c291e7961a515f6d7af9304e7fd1d257929aef26`（2026-09-10），`package.json` `0.1.5-rc.2`，`SESSION_FORMAT_VERSION = 3` | 仓库内 `docs/`、各包 `README.md`、`src/` 源码，**以及 `.agents/notes/`**（DSH 自己的决策记录，含 "Alternatives considered / Consequences" 段） | **最强**。取舍理由是一手的——不是从行为反推，是作者写下的 |
| **Claude Code** | `2.1.278`（`claude --version` 实测） | 本机 `~/.claude/` **只读普查**（80 个 transcript 文件、`sessions/*.json` 16 个、`~/.claude.json`）+ 官方文档 `code.claude.com/docs/en/*.md`（2026-09-20 抓取）+ `claude --help` + 本地缓存的官方 changelog（7158 行） | **强**。落盘结构是实测的一手证据；权限层级与 managed settings 只有文档证据 |
| **Codex** | CLI `0.154.0`（本机）；源码 `openai/codex` commit `5c5308fc9a9ee789049d646ef11e5400384b9c6f`（2026-09-20T03:02:48Z） | 本机 `~/.codex/` **只读普查**（1671 个 rollout、12 GB、四个 sqlite 库的 schema 与全量统计）+ `learn.chatgpt.com/docs/*.md` + **源码** | **最强，但文档层与源码层冲突多**。见下「两层证据的冲突」 |
| **Pi**（`earendil-works/pi`） | 浅克隆 HEAD `3390bd9`（2026-09-20） | 仓库内官方文档与源码（一手）+ 作者本人博客（一手） | **强**。但仓库内有两套并存的会话模型，见下 |

## 每家的取证局限

### DeepSeek Harness

- **未核对 git 史**，所有结论基于单一 commit 的快照。
- 主报告交付时两个子调研（权限治理、感知域）未返回，**其结果后来以补遗形式追加在同一份报告末尾**，并修正了主报告的一处（默认 preset 表是两项还是三项）。
- 仍未查证：跨进程/跨设备会话同步或租约协议的具体设计（只查到**明确的否定**，被列为未来工作）；
  `session.search` 里 "authorized" 具体指什么授权；`ctx.approval` 的 answerer 链在生产组合里是否还有第三条路径（未读 `packages/client/ui-approval` 的客户端实现）；
  `agent-team`（实验性）在会话层引入了什么。
- **⚠️ 一处上游文档自身口径冲突**：`agent-scope` 是「两层扁平」还是「有父链继承」，
  `docs/glossary.md:13` 与 `packages/core/scope/README.md:66-68`、`docs/subsystems/tools.md:155` 说法不一致。
  调研方给的是**推断且标注未查证**。**在自行核对源码之前不得引用这一条。**

### Claude Code

- **本机无 `/etc/claude-code/managed-settings.json`** → managed 层的全部行为**只有文档证据，没有实测**。
- 本机 `.orphaned-*` / `.superseded-*` **0 例**，未观测到触发条件。
- 未查证：`/clear` 换 session id 之后，新旧两个 session 之间用什么记录连起来（本机全部 transcript 里只有 1 条 `continued-in`，且已确认是「转后台」那条）。
- **官方明说格式不稳定**：「The entry format is internal to Claude Code and **changes between versions**」——
  实测确实在变（同一目录下 `2.1.267` 写的记录有 `slug`/`sessionKind` 字段，别的版本没有）。
  **因此：一切基于 transcript 字段的观察都只对 `2.1.278` 这一代成立。**
- 报告原件第一行保留了 harness 的 instruction-shaped 过滤器告警。
  **那是因为报告大量引用 Claude Code 自己的权限模式名与配置键**（`bypassPermissions`、`settings.json` 等），
  是被调研对象的字面量，不是指令。落盘时未删除该行，以保留原貌。

### Codex

- **本机语料有系统性偏差**：`~/.codex/config.toml` 是 `sandbox_mode = "danger-full-access"` + `approval_policy = "never"`，
  2655 个 thread 里 2650 个 `approval_mode='never'`。**因此 1671 个 rollout 里一条审批事件都没抓到**——
  审批的落盘形态是文档 + schema + 源码证据，**不是实测**。
- **两层证据的冲突**：`openai/codex` 仓库的 `docs/` **已被掏空成指针**（`docs/sandbox.md` 全文 150 字节），
  权威正文在 `learn.chatgpt.com`，**而那些页面既不带版本号也不带日期**。
  源码 subagent 后来推翻了文档层的两处结论（配置层优先级的实际实现是 9 层不是 7 层；`--full-auto` 源码零命中）。
  **凡文档与源码冲突处，报告已声明以源码为准。**
- 未查证：cloud task 的 `status` 枚举、最大运行时长/超时/回收、取消后容器与 diff 的处置、cloud 的父子关系
  （`docs/app-server.md` 全文 grep "cloud" 零命中，**cloud 是另一套闭源服务**）；
  `thread_spawn_edges.status` 的非 `open` 取值；`.zst` 7 天压缩的确切触发与保留语义；
  rollout 缺 fsync 在崩溃下的实际丢失窗口。
- 调研方**未运行** `codex migrate-rollouts`（即便不带 `--apply` 也可能写状态），迁移语义只有 help + 源码注释。

### Pi

- **对象歧义已显式排除**：本报告的 Pi 是 `earendil-works/pi`，不是 Inflection AI 的对话产品。
  后者只做了排除性检索——它是消费级共情对话助手，**没有 harness、工具调用、会话文件或权限体系**，
  关于其记忆机制的描述全部来自评测/聚合站，不满足证据标准，**标记为无公开资料**。
- **⚠️ 仓库内有两套并存的会话模型，不可混用**：
  **(A)** 已发货的 CLI 会话（`SessionManager` + `~/.pi/agent/sessions/*.jsonl`）；
  **(B)** 新一代 `AgentHarness` 规格（`packages/agent/docs/harness.md`，1468 行）。
  **CLI 主路径尚未使用 (B)**——`grep` 显示 `AgentHarness` 在 coding-agent 里只出现在 `src/experimental/`。
  **引用 (B) 的任何机制时必须标明它是规格而非现状**；其 §0.9 自陈 WP08 进行中并逐条列出未实现项。
- 未查证：(A) 路径的会话文件并发写保护（未见锁；`proper-lockfile` 只出现在 experimental）；
  `~/.pi/agent` 是否可由环境变量整体重定向；`docs/containerization.md` 三种容器模式的细节。
- 流行度与基准数字（star 数、「powers OpenClaw」、「outscored Claude Code on a benchmark」）
  只在聚合/媒体站出现，**按证据优先级规则不采用**，报告中不含任何此类数字。

## 这一轮不能据此声称什么

- **不能据此声称任何关于多租户会话的结论。** 四家都不是多租户系统，见 [research.md](research.md#四当前证据不支持什么)。
- **不能据此声称任何一家的做法是「对的」。** 本页只记录它们做了什么、为此付了什么代价。
  方案比较和采用过程归本工作树 tmp，获准终态写回实际承诺拥有者。
- **不能把四家一致当成正确性证明。** 一致只说明另做一种选择时举证责任更重。
- **所有结论都绑在上表的精确版本上。** 四家迭代都很快（Codex 的文档页甚至不带日期），
  下一轮核对时按 [research/README.md 的演进事件词](../README.md#演进事件词)记一条，不要原地覆盖。
