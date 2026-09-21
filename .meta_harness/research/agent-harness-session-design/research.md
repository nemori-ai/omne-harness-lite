# 四个 agent harness 的「会话」设计：现在该信什么

本页是当前结论。**它不拥有方案选择**——每条结论写到「这条事实让什么变得不可能、什么要额外付出代价」为止。
来源与可复核观察见 [evidence.md](evidence.md)，各家当轮完整原貌见 [reports/](reports/)。

## 调查对象与基线

| 对象 | 精确基线 | 取证方式 |
|---|---|---|
| **DeepSeek Harness** | 只读副本 `/tmp/deepseek-harness`，commit `c291e796`（2026-09-10），`0.1.5-rc.2`，Session 格式 v3 | 仓库内 `docs/`、各包 `README.md`、`.agents/notes/`（含 Alternatives considered）、`src/` |
| **Claude Code** | `2.1.278` | 本机 `~/.claude/` 只读普查（80 个 transcript）+ `code.claude.com/docs/en/*.md` + `claude --help` |
| **Codex** | CLI `0.154.0`；源码 `openai/codex` commit `5c5308fc9a`（2026-09-20） | 本机 `~/.codex/` 只读普查（1671 rollout、12 GB）+ `learn.chatgpt.com` + 源码 |
| **Pi**（`earendil-works/pi`） | 浅克隆 HEAD `3390bd9`（2026-09-20） | 仓库内文档与源码 + 作者本人博客 |

**一处对象歧义已排除**：「Pi」在本次语境（与 DSH/Codex/Claude Code 并列的 agent harness）下是
`earendil-works/pi`，不是 Inflection AI 的对话产品；后者无 harness、工具调用、会话文件或权限体系，
**不存在可供本组维度对比的一手资料**，见 [reports/2026-09-20-pi.md](reports/2026-09-20-pi.md) 开头的对象确认声明。

---

## 一、四家做法一致的（可当作这一代 harness 的事实基线）

四家在下列各点上独立地走到了同一处。**一致本身不构成正确性证明**，但它把「另做一种选择」的举证责任抬高了。

### 1. 会话日志 append-only，压缩绝不改写历史

| 谁 | 怎么实现的 |
|---|---|
| DSH | 压缩写 `compaction/start` → `summary` → 一条带 `surfaceOp:{op:'replace',startSeq,endSeq}` 的 `user/message` → `end`；被替换的节点只从 surface 派生中消失，**事件本身还在**（`docs/subsystems/compaction.md:11-17`） |
| Claude Code | 追加 `compact_boundary` + `isCompactSummary`；`parentUuid` 置 null 让新链从摘要开始，**`logicalParentUuid` 保留真正的时间前驱**——同一份 transcript 承载「发给模型的链」与「完整历史链」两个图 |
| Codex | 追加一条 `compacted` 记录携带 `replacement_history`；**磁盘上原始历史一字未动**（实测单条最大 506 KB） |
| Pi | `README.md:284`「Compaction is lossy. **The full history remains in the JSONL file**; use `/tree` to revisit.」 |

DSH 把理由写在决策注记里（`.agents/notes/.../2026-06-11-event-sourced-sessions.md`）：

> 可变消息数组 + 事件通知——更简单，但**状态和日志会分叉**；事件溯源下日志**就是**状态，分叉结构性地不可能。

**代价四家也一致**：派生成本随日志长度增长（DSH 明说压缩是「intended mitigation, **not log mutation**」）；
且磁盘只增不减——Claude Code 实测单会话 transcript 93 MB、`cumulativeDroppedTokens` 累计 376 万而文件持续增长。

### 2. 权限放行链只能单调收紧，deny 不可被任何层放宽

| 谁 | 原文 |
|---|---|
| Claude Code | 「**If a tool is denied at any level, no other level can allow it.**」规则按 `deny → ask → allow` 排序，**规则特异性不改变顺序**；「An allow rule can't carve an exception out of a deny rule.」方向对称：user-level deny 压得住 project-level allow |
| DSH | `ToolGuard` 返回类型**刻意没有 allow**：「a returned reason **can only reduce permission, so a later listener cannot undo it**」；hook 折叠 `deny > ask > allow` 且**与顺序无关** |
| Codex | 文档五处重复「`deny` always wins」；execpolicy 合并取 `max()`（`Allow<Prompt<Forbidden`）；**requirements 层禁止写 `decision = "allow"`**，错误文案直说「Codex merges these rules with other config and uses the most restrictive result」 |
| Pi | 无权限系统，**不参与本条** |

**⚠️ 一处必须分清的边界**：单调收紧是**工具放行链**上的原则，**不是沙箱模式那一维**。
DSH 的沙箱模式合成是纯覆盖 `mode = request.mode ?? overrideOf(session) ?? defaultMode`，
**单次调用的显式 mode 可以比会话 mode 更宽**（这正是 escalation 的正道），
唯一收窄规则是一张显式「更宽」表且检查在执行期（`packages/sandbox/sandbox-policy/src/index.ts:163-170`、
`sandbox/src/escalation.ts:28-31`）。把这两维混为一谈会得出错误的合成语义。

### 3. 仓库不能给自己提权

| 谁 | 怎么挡的 |
|---|---|
| DSH | `DSH_` 是 bootstrap-only 前缀，任何 `.env` 设它**启动时硬抛**。理由逐字：「一个项目自己的 `.env` **不能**设这些：它是跟着 `git clone` 来的，**DSH 宁可拒绝启动**，也不让一个仓库决定你的流量去哪」 |
| Claude Code | `.claude/settings.json` / `settings.local.json` 里写 `auto` 或 `bypassPermissions` **一律不生效**，会话以 Manual 启动；且 `.claude` 是 symlink 或被 git 跟踪时，`settings.local.json` **被当作仓库提供的**，规则扣留到用户信任该文件夹 |
| Codex | 项目层有硬性禁用键清单（`openai_base_url`、`model_provider`、`notify`、`otel`、`profile` 等）；更狠的是**`.codex` 目录即使不存在也受保护**——注释写明是为了让「首次创建也走保护路径审批流」，防 agent 凭空造 `.codex/config.toml` 提权 |
| Pi | Project Trust 是**输入加载闸**：控制要不要加载项目本地的 settings/extensions/skills，**但明说「不是沙箱，不限制模型行为」** |

**这条事实的约束含义**：任何把「项目/仓库」放进权限层级并允许它放宽的设计，
都与这四家的一致做法相反；要那样做需要额外论证为什么本系统的仓库来源可信。

### 4. 子不能超过父

| 谁 | 形态 |
|---|---|
| DSH | 子 agent 审批策略**恒为 `never`**，且**这条设计反转过**（新注记 supersede 了旧的策略继承方案）。理由：在 `ask` 的父下，后台子的 escalation 会变成**没有任何产品界面显示的挂起**，于是「权限卡住的子」与「正常干活的子」从外面看一模一样。Decision 段：「**加宽的决定永远归父那一侧**」 |
| Claude Code | 子 agent 声明 `permissionMode: bypassPermissions` **无效**；主会话在 bypass/acceptEdits/auto 时子**强制用主会话的模式**，frontmatter 被忽略 |
| Codex | 源码是 `intersect(parent_authority, child_requested)`，网络维度纯 AND，路径比较前 canonicalize「使 symlink 无法获得超出任一输入的权限」，不支持的策略形状 **fail closed**。custom agent 文件**只能收窄** |
| Pi | 无 subagent |

**一处直接的分歧值得记**：DSH 因为「没有界面显示后台子的挂起」而**禁止**子发起审批；
Codex 则**做了那个界面**——「审批请求可以从**非活跃的 agent 线程**浮上来……审批浮层显示来源线程标签，可以按 `o` 打开那个线程再批」。
**同一个问题，一家用禁止解决，一家用 UI 解决。**

### 5. 强制不了就拒跑，不降级

- Codex `codex-rs/core/README.md:87-92`：「需要……的策略**仍然 fail closed，而不是以更弱的强制运行**」；
  Windows 后端 7 处 `refusing to run unsandboxed`；macOS 上策略无法被平台强制时**拒绝执行该命令**。
- DSH：没有可用后端时 `confine()` 抛结构化 `SANDBOX_UNAVAILABLE`，**而不是降级成不受限执行**。

---

## 二、四家分歧的（这里才是真取舍空间）

### 1. 会话内累积的授权：四种答案，各自付不同的代价

| 谁 | 做法 | 它为此付的代价 |
|---|---|---|
| **DSH** | **不做**。`ApprovalOutcome` 只有 `allowed-once`，会话日志里只有**审计对**不是授权 | 长时程无人值守会被反复打断；官方答案是转 `never` + 把沙箱调宽，**而不是累积授权** |
| **Claude Code** | **按工具类别分别定**：Bash = 仓库+命令（永久，落 `.claude/settings.local.json`，穿 worktree 解析到主检出）；WebFetch = 仓库+域名；**文件修改 = 只到会话结束，故意不落盘** | 一次**有意的不一致**，用户要理解「为什么这个记得住那个记不住」 |
| **Codex** | **五档**：单次 / 本会话（**纯内存，不落盘**）/ 本轮（`request_permissions` 的 `scope: turn\|session`）/ 永久（写 `rules/default.rules`）/ 本目录（`trust_level`） | 五个档位散在五处存储；会话档进程一死就没 |
| **Pi** | 无 | — |

**DSH 拒绝做这件事的理由，是本组调研里最值得记住的一段**（设计注记 Alternatives，逐字）：

> 现在就提供 `allow_always` —— **否决**：协议表达得了，但要兑现它就得设计**授权的存储、scope 身份与撤销**。
> **宣传一个 harness 兑现不了的选项，是在制造注定落空的授权。**

它的 Deferred 段把未解问题列了出来：**scope identity 到底是一次调用？一个路径？一个前缀？一个会话？一个时间窗？**

**另外两家对这个问题给出的实际答案**：

- Claude Code：**按工具类别取不同的 scope**（命令 / 域名 / 无），并对**显示不全的提示直接撤掉「不再询问」选项**——
  「Claude Code 只在提示能向你展示它将允许的全部内容时才提供这些选项」。
- Codex：会话档的缓存键是 `{environment_id, executable, canonicalized command, cwd, tty, sandbox_permissions, additional_permissions}`
  **加 execpolicy 指纹**——**规则一改，所有缓存自动失效**；且 `WriteStdin/Execve/McpToolCall/NetworkAccess/RequestPermissions`
  的 `cache_keys()` 返回空 vec，**刻意永不缓存**。

**还有一条是「怎么限制一条批准的作用半径」的现成做法**（Codex 写在给模型的 prompt 里）：

> 使用更高级 shell 特性的命令——重定向（`>`、`>>`、`<`）、替换（`$(...)`）、环境变量（`FOO=bar`）、通配（`*`、`?`）——
> **不会被拿去匹配规则，以限制一条已批准规则所允许的范围。**

同一份 prompt 还禁止请求过宽前缀、**对 `rm` 这类破坏性命令永远不许请求前缀规则**、用了 heredoc 的命令不许请求。

**还有一条硬事实**：DSH 的审批审计 `approval/asked` 的载荷是 `{id, toolName, callId?, reason?}`，
**不含工具参数**——**这份审计物理上不包含足以判定「同一个动作」的信息**。
即：把审计日志复用成授权依据这条路，在 DSH 的形态下走不通。

### 2. 「不问」有三种语义，不是一种

Claude Code 的六档模式把这件事拆得最清楚：

| 档 | 「不问」意味着什么 |
|---|---|
| `dontAsk` | **凡是会提示的，一律自动拒** |
| `auto` | 不问**人**，改问**模型**——后台 classifier 审查 |
| `bypassPermissions` | 真的不问，闸整个拆掉 |

**DSH 的 `never` 与 `dontAsk` 是同一个东西**：「never prompt anyone: every ask resolves `'rejected'` **deterministically**」。
DSH **没有**「自动批准一切」这一档——它的 `danger-full-access` 机制是**沙箱不再拦，于是没人需要问**。
Codex 的 `never` 也是同构的：`approval_policy = never` 时危险命令直接 `Forbidden`，其余靠沙箱兜底。

**约束含义**：把「全自动」当成一个档来设计，会在落地时被迫在「不问就拒」和「不问就放」之间二选一，
而这两者在事后追责上完全不同——一个是系统替人拒绝，一个是系统替人同意。
**三家有产品在跑的 harness 都把这两者分开了。**

### 3. 是「判断命令安不安全」，还是「守住边界、越界才问」

**这是本组调研里最大的一处路线分歧，而且两边都有在跑的产品。**

- **Claude Code 押在命令识别上**：不可配置的只读 Bash 命令集、wrapper 剥离表（`timeout time nice nohup stdbuf command builtin noglob`）、
  复合命令拆开批准（最多存 5 条规则）、重定向目标单独按 Edit/Read 规则查、符号链接两个路径都查、
  critical path 的 `rm` 藏进 `$(...)`/反引号/`<(...)` 都会被找出来。**代价是持续打补丁**——changelog 里 "Fixed Bash permission checks…" 出现十余次，
  而且文档自己承认「**规则匹配的是命令文本，不是程序**……**不是围绕那个程序的安全边界**」（`Bash(curl *)` 挡不住 `/usr/bin/curl` 和 `sh -c 'curl …'`）。
- **Codex 已经放弃了命令识别**：`is_known_safe_command`、`assess_command_safety`、`approved_commands` **三个符号全仓库零命中**。
  留下的启发式回退是**黑名单**，且极窄——只认 **`rm` 带 `-f`/`-rf`** 加 shell 包装的递归展开。
  结果是**在 `workspace-write` + `on-request` 下，绝大多数未知命令既不弹窗也不被拦，直接在沙箱里跑**。
- **DSH 介于两者之间**：`tools/pre-execute` 瀑布上**生产环境实际注册的只有三个包**（`hooks-claude-code`、`hooks-codex`、`tool-jobs`），
  **没有内建的权限规则引擎**；权限来自沙箱 + 工具被拒后发起的一次性审批 + 外部 hook。
- **Pi 两样都不做。**

**约束含义**：选「守边界」这条路，前提是边界真的守得住——Codex 为此配了三条显式不变量
（deny-read 存在则任何批准都不能脱沙箱、`bypass_sandbox` 只在每段命令都被显式规则 Allow 时才为 true、平台管不了就拒跑）。
**没有这三条，「越界才问」就退化成「什么都不问」。**

### 4. 会话终态：没有一家把「会话结束」做成有决策力的事实

| 谁 | 终态 |
|---|---|
| Pi | **没有状态机，也没有终态**。会话就是一个文件，进程退出就没了前台，文件永远能再打开 |
| DSH | Session 本身**没有状态机**；唯一的状态枚举在 Agent 上且只有 `idle`/`running`——「**dispose 把 agent 从注册表移除，它不是第三个可观察状态**」。「归档」只是 workspace 记录里的一个数组标记，**碰都不碰日志** |
| Codex | thread **没有 `completed` 终态**，只有 `archived` 和被删；`SessionEnd` hook 靠「**闲置 30 分钟且没有任何客户端打开**」推断，且 **advisory、不对 subagent 触发** |
| Claude Code | 有 `SessionEnd` 的 reason 枚举（`clear`/`resume`/`logout`/`prompt_input_exit`/`other`），但 **"They can't block session termination"** |

**约束含义**：把「会话结束」当成一个可被别的机制依赖的事实（例如「沙箱到点销毁」「授权随之消失」），
在这四家里**没有先例**——因为这四家都没有把东西挂在那个事实上：
DSH 无会话级授权、Pi 无权限、Codex 的云端容器缓存（≤12h）与会话生命周期**明说分离**
（「结束一个 task 或删除一个 chat **不会立刻清除每一件相关产物**」）。

### 5. 会话树：只有 Codex 做了，而且它的建模是「省掉聚合根」

Codex 的分法（`docs/app-server.md` 逐字）：

> `thread.sessionId` 标识当前**活的 session 树根**。根 thread 用自己的 thread id 作 session id；
> **fork 出来的 thread 保留它所来自的那个根的 session id。**

落盘形态（`state_5.sqlite`）：

```sql
CREATE TABLE thread_spawn_edges (
    parent_thread_id TEXT NOT NULL,
    child_thread_id  TEXT NOT NULL PRIMARY KEY,   -- 每个子只能有一个父
    status TEXT NOT NULL)
```

它自己写的取舍：**代价是 session 没有独立持久化实体，没有自己的生命周期、状态、配额**；
好处是子树天然可归属、可级联归档删除、可按 `ancestorThreadId` 查询，**而不需要额外的聚合根表**。

另外三家：**Pi 无 subagent**（`README.md:503` 明列为「不做」）；
**DSH 明确推迟**（`packages/core/session/README.md:186`「**No session tree beyond fork** — a pi-style entry tree over branched sessions is deferred」），
但有只读的 `SessionLineageTrace` 血缘查询；
**Claude Code 的 subagent 根本不是 session**——transcript 放在父会话目录下的 `subagents/`，`sessionId` 就是父的 uuid，
只有三种记录类型，**没有 `permission-mode`、没有 `cost-state`、没有 `ai-title` 这些会话级记录**。

**两条对「做会话树要付什么代价」最有信息量的事实**：

1. **DSH 刻意不合并持久血缘与运行时所有权**（决策注记 Alternatives，逐字）：
   > **不要把 `SessionHeader.parentSession` 当作活的所有权。**持久血缘不证明记录在案的父现在拥有这个子……
   > **一个 resumed fork 仍然可能是 root。**

   即：「递归到子会话」这句话，按持久血缘递归与按运行时所有权递归，**是两个不同的操作**。

2. **Codex 的 fork 在分页模式下不复制历史**，新文件只写 `history_base` 指针，物理前缀留在源文件里；
   于是 `PreparedFork` 持有 `_source_reservation`（`thread-store/src/types.rs:221-246`）：
   > **Blocks source deletion until the child's history reference is durable.**

   即：**级联删除在存储层可能是反方向的——不是父删了子跟着删，而是子还引用着父就删不掉父。**

3. **⚠️ 反面教材**：Codex 实测 `thread_spawn_edges` 的 **1184 条边全部是 `status='open'`，没有一条变成 closed**；
   同时 57 个 turn 永久卡在 `inProgress`。**字段建了但没维护到底**——append-only 日志加上没有收敛机制的直接后果。

### 6. 上下文感知域：只有 Codex 把它做成了一等对象

Codex 的 `world_state` 是落盘的、有 18 个键的**全量快照 + `full:false` 增量 delta**，渲染给模型的形态是结构化 XML：

```xml
<filesystem>
  <workspace_roots><root>/path/to/project</root></workspace_roots>
  <permission_profile type="disabled"><file_system type="unrestricted" /></permission_profile>
</filesystem>
```

**且活体 subagent 花名册是感知域的一个子树，变了就增量重注入**（实测 delta 实例）。

它付的代价也标出来了：`world_state` 里大量用 **sha1 hash 指代长文本**（`permissions.instructions`、`collaboration_mode.instructions`），
**光看 rollout 无法还原那些指令正文，只能判断「有没有变」**。

另外三家：

- **Claude Code** 有 `/add-dir` 和 `/cd`，但被迫把一件事拆成两件——**`/add-dir` 只给文件访问，不给配置根**，
  然后不得不开一张例外表（skills/commands/agents 会加载、`settings*.json` 只取两个键、CLAUDE.md 默认不加载）。
  更反直觉的是**flag 加的目录与 settings 里 `additionalDirectories` 行为不同**，文档专门用一段解释。
  另有一条干净的分界：**文件里的配置每次启动重读，命令行/会话内加的东西一次性不恢复**。
- **DSH**：`SessionHeader.cwd` **不可变**，进行中改不了；会话创建请求的**完整字段集只有 4 个**
  （`workspaceId?`/`cwd?`/`sessionId?`/`agentPreset?`），**没有 MCP、数据源、知识库字段**；
  **多根四处明文不支持**；且沙箱**只管写不管看**——「`SandboxMode` 只管文件效果。**网络与进程可见性在这套词汇之外**」。
- **Pi**：`config.cwd` **is not a sandbox** — 「it is a resolution default, not containment: absolute paths and `..` escape it」（同一句在 fs 包里重复三次）。

**一条三家共同的事实**：**「读」几乎没有会话级边界。**
DSH 的 `read-only` 意思是「拒绝一切变更」而非「只能看声明范围内的」；
DSH 文档自己承认**读无边界 + `web_fetch` 全模式免确认 + 网络不在沙箱词汇表 = 一条没堵的数据外泄路径**；
Claude Code 需要单独开 `permissions.blockReadsOutsideWorkingDirectories` 才在所有模式下拒绝工作目录外的读。

### 7. 保留策略：只有 Claude Code 做了

- **Claude Code**：`cleanupPeriodDays` 默认 **30 天**，清扫清单覆盖 transcript、subagents、tool-results、
  file-history、paste-cache、image-cache 等；**auto memory 显式豁免**（「只有整个保留期都为空才删那个目录」）；
  **读不到或解析不了 retention 配置时暂停整个清扫**并在 `/status` 报警。
- **DSH**：**没有删除 API、没有 TTL、没有保留策略**——「pruning stored sessions is **out-of-band backend maintenance**」；
  唯一的 TTL 在 spill（`cleanupPeriodDays` 默认 30），而且保留是**刻意的**：「resumed 或 forked 的 session 可能还引用着老 locator」。
- **Codex**：**没有清理策略**。实测 `~/.codex` 三个月 **12 GB**，单 rollout 最大 280 MB，
  而唯一被 `history.max_bytes` 管着的 `history.jsonl` 只有 600 KB。
  **这不像疏忽**——`history.max_bytes` 证明他们知道怎么做限额，只是刻意没给 rollout 上限额（rollout 还兼任记忆抽取与事后分析的语料）。
- **Pi**：无。文件永久留在磁盘。

**约束含义**：这三家把存储成本推给了用户的本地磁盘，这在单机本地工具上成立；
**任何按租户计费、需要合规删除、或由服务方承担存储的系统都不能照搬**——
Codex 的云端侧恰好证明了这一点：它在云端另立了一套保留矩阵，并明说
「**结束一个 task 或删除一个 chat 不会立刻清除每一件相关产物**」「删除会话不会删除存进 Library 的文件」。

---

## 三、每家独有、值得单独记住的设计

| 来源 | 设计 | 一句话 |
|---|---|---|
| DSH | **会话级状态 = log-only + last-wins 事件** | `sandbox/mode`、`approval/policy`、`permission/preset`、`plan/mode` 四样全是日志事件，靠 fold 求值，**不进模型 transcript**；切换时追加一条新的 runtime-context 快照而**不动 system prompt 节点**，理由是保住 provider 前缀缓存 |
| DSH | **`session/end-seed` 边界标记** | fork 时在精确的耐久切口追加一条；存在理由是「seed history 与 live work 否则**字节完全相同**，这会击垮任何拥有独立开闭括号的插件」 |
| DSH | **三个语义检查点 fail-closed flush** | 模型请求前、可能产生外部副作用的顶层工具执行前、下一步开始前；**写失败则模型适配器或工具体不执行** |
| Claude Code | **批准寿命按风险分级** | 把最容易被误批的那类（写文件）的记忆做成**易失的** |
| Claude Code | **auto mode 进入时丢弃宽泛 allow** | `Bash(*)`、通配解释器、包管理 run 命令的 allow 规则在 auto 下被丢弃，离开时恢复——**用户的显式授权在 auto 下被降级** |
| Claude Code | **口头边界不入库** | classifier 每次从 transcript 重读，「**一次上下文压缩若删掉说出那条边界的消息，边界就丢了**」；要硬保证得改用 deny 规则 |
| Codex | **`world_state` 全量+增量感知域** | 见上 §二.6 |
| Codex | **中断优雅窗口 100 毫秒** | `GRACEFULL_INTERRUPTION_TIMEOUT_MS = 100`，超时 `abort()` 硬砍；中断标记**显式 flush 两次**，理由是「有些客户端收到 abort 事件时会同步重读 rollout」 |
| Codex | **guardian（审批交给另一个模型）自身被关起来** | 只有 5 个工具、权限 `intersect_with_read_only()`、自己的 turn 跑 `approval_policy: Never`、上下文明确标为**不可信证据而非指令** |
| Pi | **分支摘要** | 切走一条分支时可让模型总结被放弃的那条路径并挂在新位置，落成 `branch_summary` entry 带 `fromId` 指向被放弃的 leaf |
| Pi | **`harness.md` 的 Non-goals + 实现状态自陈** | 把分布式/持久化领域里所有**没有**给出的保证一次性列清（§0.6），再逐条标注哪些「specified, not implemented」（§0.9），**使规格与现实之间不留模糊地带** |

---

## 四、当前证据不支持什么

- **四家都不是多租户系统。** DSH 唯一的身份包是 `anonymous-user-id`，README 明写「**不要用它识别用户**」；
  全仓只有两处提到 multi-tenant，都是「尚未有硬多租户边界，等容器级后端」。
  Pi 无账号体系。Claude Code 的组织身份只在登录 claude.ai 时出现在 OTel 属性与 `bridge-session` 记录里。
  **因此：本组调研不能用来支持任何关于「租户隔离下会话该怎么做」的结论。**
- **四家都不做成本归属到计费主体。** DSH 全仓 grep `budget|quota|cost` 没有任何金额、配额或计费概念；
  Pi/Claude Code/Codex 有 token 与费用统计，但归集到「会话/线程」，不归集到付费主体。
- **Codex 云端侧基本不可查**：`docs/app-server.md` 全文 grep "cloud" 零命中，cloud 是另一套闭源服务；
  task 的状态枚举、超时与回收、父子关系**全未找到**。
- **一处上游文档自身的口径冲突，引用时必须避开**：DSH 的 `agent-scope` 到底是「两层扁平」还是「有父链继承」，
  `docs/glossary.md:13`、`packages/core/scope/README.md:66-68`、`docs/subsystems/tools.md:155` **三处说法不一致**。
  调研方给的是**推断且标注未查证**（glossary 那句可能是早期设计残留）。**在自行核对源码之前不要引用这一条。**
- **Codex 的沙箱边界正式表述不在开源仓库里**：`docs/sandbox.md` 全文 150 字节，只是指向 `learn.chatgpt.com` 的指针；
  第一方代码里 `"not a security boundary"` 零命中，唯一一处在 vendored 的 bubblewrap 自述里。
  **仓库里找不到不等于没有，但也不能当它承诺过。**
- **Pi 的 (B) `AgentHarness` 是规格不是现状**：CLI 主路径尚未使用它（`grep` 显示只出现在 `src/experimental/`），
  其 §0.9 自陈 WP08 进行中并逐条列出未实现项。**引用 (B) 的任何机制时必须标明它是规格。**
