# DSH（DeepSeek Harness）「会话」对象调研报告

> **本文是 2026-09-20 一次调研的完整原貌**，由本仓库派出的只读调研 agent 产出，落盘时未改写结论。
> 当前该信什么见 [research.md](../research.md)；本页只保留当时看到了什么、怎么推的。
> **文末有交付后追加的补遗**（权限治理与感知域两个子线程的结果），其中修正了正文一处。

**调研对象版本**：只读副本 `/tmp/deepseek-harness`，commit `c291e7961a515f6d7af9304e7fd1d257929aef26`（2026-09-10），`package.json` version `0.1.5-rc.2`。Session 格式当前写入版本 `SESSION_FORMAT_VERSION = 3`（`/tmp/deepseek-harness/packages/core/session/src/types.ts:88`），最新已发布格式同为 3（`/tmp/deepseek-harness/docs/session-format-status.md:33-35`）。

**方法说明**：证据主要来自仓库内 `docs/`、各包 `README.md`、`.agents/notes/`（DSH 自己的决策记录，含「Alternatives considered / Consequences」，是取舍分析的一手来源）和 `src/` 源码。我另外并行派了两个只读子调研（权限治理细节、感知域细节），截至交付时未返回；下述第 2、3 节全部是我本人一手读取的证据，不含任何未返回的推测。

---

## 0. 对象确认

**结论：DSH 里承担「一段持续协作的身份与归属边界」的对象就叫 `Session`，而且它是一个纯粹的 append-only 事件日志，不是一个有状态机的实体。**三个关键事实：

1. **`Session` = 类型化 `SessionEvent` 的只增日志，是 agent 全部交互历史的唯一真相源**；送给模型的 message history 是从日志**派生**的（`deriveMessages()`），从不单独存储。
   > "A `Session` is an **append-only log** of typed `SessionEvent`s — the single source of truth for an agent's whole interaction history. The LLM message history is *derived* from the log, never stored separately; replay is re-derivation from the same events."
   > — `/tmp/deepseek-harness/docs/subsystems/session.md:5`

2. **`Session` 与 `Agent` 是 1:1，且 Agent 的身份就是 SessionId**：
   ```ts
   /** Session-backed Agent identity. */
   readonly id: SessionId
   ```
   — `/tmp/deepseek-harness/packages/core/agent/src/types.ts:14-15`
   即：**DSH 不区分「会话」和「运行中的 agent 实例」的身份**。一个 Session 最多对应一个活的 Agent。

3. **`Session` 是普通 class，不是 Cordis Service**：`ctx.sessions`（`SessionStore`）是内存注册表，持久化是另一条 seam（`ctx.sessionPersistence`）。
   — `/tmp/deepseek-harness/docs/subsystems/session.md:391-395`（"Plain class (not a Service)"）、`/tmp/deepseek-harness/docs/architecture.md:61`

**与「会话」相关但职责不同的邻近对象**（重要，避免混淆）：

| 对象 | 归属 | 职责 |
|---|---|---|
| `Session` | `packages/core/session`，`ctx.sessions` | 事件日志 + 身份 + 不可变 header |
| `Agent` | `packages/core/agent`，`ctx.agents` | 活的驱动器：inbox、status、cancel、scoped ctx |
| `Workspace` | `packages/workspace/workspace`，`ctx.workspaceRegistry` | 「用户工作的那个目录」的持久记录，按 `SessionHeader.cwd` 归属 session；**对模型完全不可见**（无工具、无 prompt、无 session 事件） — `/tmp/deepseek-harness/docs/subsystems/workspace.md:5` |
| `agent-scope` | `packages/core/scope` | 每-agent 的注册可见性与生命周期，两层扁平（**不向 subagent 继承**） — `/tmp/deepseek-harness/docs/glossary.md`「agent-scope」条 |
| `turn / step / round` | 词汇表 | 循环层级，**turn 只包住一次模型循环执行，不等于整个 session 日志** — `/tmp/deepseek-harness/docs/subsystems/session.md:655-659` |
| `Activation` | `packages/subagent/subagent` | 一个可续 subagent 子 Session 的「进程内驻留期」，**持久 Session 与进程内驻留被刻意分开** |

**取舍分析**：DSH 把 Session 压缩成「日志 + 不可变 header」，不给它状态机、不给它配置对象、不给它可变 summary（可变 summary 曾存在后被删除，见 `2026-06-19-drop-mutable-session-summary.md`，引用于 `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`）。代价是：任何「会话级状态」都必须表达成一个日志事件类型并写 fold（见第 2 节的 `approval/policy`、`sandbox/mode`、`plan/mode`、`permission/preset`）；收益是**状态与日志结构性不可能分叉**：

> "**A mutable message array with events fired as notifications** — simpler, but state and log can diverge; with event-sourcing the log IS the state, so divergence is structurally impossible."
> — `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-11-event-sourced-sessions.md`（Alternatives considered）

---

## 1. 数据存储

### 1.1 存在哪、什么格式

**结论：内存里是 `SessionEvent[]`；落盘由一条可替换 seam 承担，唯一一方提供者是每 session 一个 JSONL 文件（默认 Zstandard 压缩帧）。**

- **seam**：`ctx.sessionPersistence`（抽象 Service），五个方法 `create` / `open` / `stat` / `list` / `flush`；`create`/`open` 返回**每 session 一个 `SessionHandle`**，所有日志读写都经过 handle，**没有按 id 寻址的 append/load 方法**。
  — `/tmp/deepseek-harness/docs/subsystems/persistence.md:7`、`docs/subsystems/persistence.md:341-400`
- **唯一一方后端**：`dsh-session-persistence-jsonl`。盘上布局：
  ```text
  <root>/
    --<normalized-cwd>--/          # 可读的项目目录（无 cwd 则 _no-cwd/）
      <encoded-id>/                # session 自己的目录
        session.v3.jsonl.zstd      # 当前格式，压缩
        session.v3.jsonl           # 当前格式，raw
        session.jsonl[.zstd]       # 历史 v0（无版本后缀）
        session.vN.jsonl[.zstd]    # 历史 v1/v2
  ```
  — `/tmp/deepseek-harness/packages/session/session-persistence-jsonl/README.md:60-72`
- `root` **必填且无默认值**，理由写在配置注释里：默认 `process.cwd()` 会随 bash 调用/子进程漂移而把 session 文件撒得到处都是。 — `/tmp/deepseek-harness/docs/config-catalog.md:1929-1934`
- 当前格式**每个持久事件一行**；冻结的 v0/v1 reader 还认得历史上的「打包 assistant delta 行」。 — 同上 `README.md:58`

### 1.2 什么时候落盘

三段式，且「接受」与「持久」被明确分开：

1. `session.append()` 是**同步**的，热路径从不阻塞 I/O；事件进日志后立即通过模块私有 hook 同步通知观察者。 — `/tmp/deepseek-harness/docs/subsystems/session.md:508-520`
2. 后端一次性装上监听器，把 `session/event` 按 session id 路由进**该 session 写 handle 的有界 write-behind 窗口**；第一个待写事件启动一个固定批窗，后续事件加入但不重置截止时间。**批窗大小不是配置项**——刻意的 provider 常量。 — `/tmp/deepseek-harness/docs/subsystems/persistence.md:106`、`packages/session/session-persistence-jsonl/README.md:31`（"Live-event write batching is not configuration"）
3. `flush` 是**唯一的耐久屏障**：`append` 解析只代表「已接受、已排序、本后端实例的读可见」，**只有 `flush` 解析才承诺扛得住崩溃**。 — `/tmp/deepseek-harness/docs/subsystems/persistence.md:66-73`

谁来 flush：`dsh-session-checkpoint-policy` 在三个**语义检查点** fail-closed 地 flush——模型请求前、顶层工具（可能产生外部副作用）执行前、下一步开始前；**写失败则模型适配器或工具体不执行**。 — `/tmp/deepseek-harness/packages/session/session-checkpoint-policy/README.md:15`

JSONL 后端的物理保证：**惰性物化**（`create(header)` 什么都不写）、首次 append 用 `link()`（POSIX）无覆盖发布 header + 首批并 `fsync`、之后每批 append + `fsync` 后才解析、写/同步失败回滚文件长度。 — `/tmp/deepseek-harness/packages/session/session-persistence-jsonl/README.md:76`

### 1.3 消息、事件、工具调用结果分别怎么存 —— 一份还是多份

**结论：一份。DSH 刻意拒绝了「并行的持久化消息类型」。**

- 持久单元**就是现存的 `SessionEvent`（`{type, seq, time, data}`），原样复用，没有转换类型**。
  > "Its persisted unit IS the existing `SessionEvent` … reused verbatim — no conversion type."
  > — `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`
- 只有 4 种事件类型会产出 LLM 消息（`SurfaceEventType`）：`system/message`、`user/message`、`assistant/message`、`tool/result`。其余（`turn/*`、`step/*`、`tool/call`、`assistant/attempt`、插件事件）是结构性的，不进模型历史。 — `/tmp/deepseek-harness/packages/core/session/src/types.ts:412`、`docs/subsystems/session.md:141-146`
- **工具调用与结果是两个事件**：`tool/call` 在执行**之前**写入，`tool/result` 是唯一进入模型的产物（投影成一条带 `tool-result` block 的 user message）。 — `/tmp/deepseek-harness/docs/tool-execution-pipeline.md:13`、`docs/subsystems/session.md:604`
- **assistant 消息内嵌它自己的完整 provider 流**：每个 attempt 精确地落成一个 `assistant/message` 或 `assistant/attempt`，其中嵌入原始的带时间戳 chunk 序列。失败/重试/取消/流错误的 attempt 用 `assistant/attempt` 保留，**不进模型历史**。 — `/tmp/deepseek-harness/docs/architecture.md:117`
- 内容为空的 `assistant/message` 也会写（为了保住 stream、usage、provider、model），但**投影时跳过**。 — `/tmp/deepseek-harness/docs/subsystems/session.md:601`

### 1.4 是否 append-only？有没有原地改写

**结论：严格 append-only，从无原地改写。「删除」通过 surface 遮蔽（shadow）表达，不是删事件。**

- `seq = log.length`，`events[i].seq === i`，连续无洞。 — `/tmp/deepseek-harness/docs/subsystems/session.md:60`
- `append()` 会拒绝一切非无损 JSON（BigInt / function / symbol / undefined / 负零 / 非有限数 / 循环引用 / 稀疏数组 / Map/Set/Date/类实例），**在 append 点就抛**，而不是等到后端 flush 才发现。一次迭代读取+校验+拷贝每个嵌套值，所以有状态 getter 不能给校验一个值、给存储另一个值。 — `/tmp/deepseek-harness/docs/subsystems/session.md:521-546`
- **压缩（compaction）不改写日志**：它写 `compaction/start` → `compaction/summary` → 一条带 `surfaceOp: {op:'replace', startSeq, endSeq}` 的 `user/message` → `compaction/end`。被替换的节点只是从 surface 派生中**消失**，事件本身还在。
  > "Derivation cost grows with log length — compaction (dsh-compaction) is the intended mitigation, **not log mutation**."
  > — `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-11-event-sourced-sessions.md`（Consequences）
  > `/tmp/deepseek-harness/docs/subsystems/compaction.md:11-17`
- **人类 transcript 与模型 surface 是两条投影**：transcript 读 append-origin 事件，因为 surface 会刻意遮蔽被 summary 覆盖的区间。 — `/tmp/deepseek-harness/docs/subsystems/session.md:189`
- **唯一的「事后写入」是崩溃修复**，而且它也是 append：resume 读回日志，算出 `interruptedTurnClosers`（未应答工具调用的合成错误结果、缺失的 `step/end`、`turn/end {kind:'interrupted'}`），**通过同一个写 handle 当普通批追加**。 — `/tmp/deepseek-harness/docs/subsystems/persistence.md:110`
- **格式迁移也不覆盖**：写开启时把当前版本的后继文件**排他发布在原文件旁边**，「已提交的代次路径永不被重命名、替换或删除」。 — `/tmp/deepseek-harness/docs/architecture.md:119`

**取舍分析（原文级）**：崩溃时不截断被开着的 turn，理由是一个 turn 在长时程任务里可能非常大：
> "persistence returns its contiguous, parseable events unmodified; the reader owns balancing … **truncating a crashed turn** — silently destroys a long autonomous run's real work"
> — `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`

被明确拒绝的另一条路是「过滤掉 stream 成员以瘦身」：会丢掉 replay、时序、usage、部分失败和诊断事实；而且删一个完整事件会破坏 `seq = log.length` 的连续性，必须做显式稠密重编号迁移（v1→v2 就是这么干的）。 — 同上

### 1.5 会话结束后数据怎么处理：保留、归档、删除、TTL

**结论：永久保留。DSH 既没有删除 API，也没有 TTL，也没有保留策略。**这是**两处明文写下的限制**：

> "- **No deletion or retention API** — pruning stored sessions is out-of-band backend maintenance."
> — `/tmp/deepseek-harness/packages/session/session-persistence/README.md:152`

> "- **Nothing deletes session files** — logs accumulate under `root` until removed externally; the seam has no deletion API."
> — `/tmp/deepseek-harness/packages/session/session-persistence-jsonl/README.md:159`

「归档」存在，但**只是一个列表可见性标记**，不碰日志：`WorkspaceRegistry.archiveSession(sessionId)` 把 id 加进 workspace 记录的 `archivedSessionIds` 数组，要求该 session 存在（live 或在持久层），已归档的 id 直接返回不写。 — `/tmp/deepseek-harness/packages/workspace/workspace/src/index.ts:236-254`

我也确认了**没有 session 空闲超时**：全仓 grep `idleTimeout|idle timeout|sessionTimeout|inactivity` 只命中 LLM 流的空闲超时（`packages/llm/llm-deepseek/src/adapter.ts:508`）和测试文档，没有任何 session 级 TTL。

**取舍分析**：这是「日志即真相 + 已提交事件永不重写」立场的必然延伸——引入删除就得回答「删一半怎么办」「fork 的父日志被删了怎么办」。DSH 把这笔账整个推给运维（out-of-band maintenance）。代价写在限制里：`list()` **不分页不过滤**，返回每个存储 session 的快照，「本地存储够用，规模上无索引」（`packages/session/session-persistence/README.md:153`）。

### 1.6 大对象（长工具输出、附件、文件）怎么存

**三套独立机制，都是「日志里只放引用，字节放别处」：**

**(a) Spill —— 长工具输出外置**（`ctx.spillStore`，`packages/spill/spill`）
- 只有一个方法 `saveText(input) → SpillRef`，逐字持久化全文，返回不透明 locator + 检索提示 + 精确字节数。
- 本地后端写在 `<root>/session-<sha256(sessionId)>/<random>-<safeName>`，root 为 0700，写用 `open(path,'wx',0o600)` 排他，**防止被种下的符号链接重定向**。 — `/tmp/deepseek-harness/docs/subsystems/spill.md:92`
- 消费策略 `dsh-spill-policy`：超过 `maxInlineBytes` 的纯文本最终结果被替换成 head/tail 预览 + spill 引用，**best-effort**——保存失败就保留原 inline 结果，绝不把成功的调用变成 `isError`。 — 同上
- **唯一的 TTL 在这里**：`cleanupPeriodDays` 默认 30，`0` 关闭；一次性启动扫描，删 mtime 严格早于截止的普通文件，剪空目录；POSIX 上跳过其他本地用户能改写的 root 和 session 目录。注释明写「保留是刻意的——resumed 或 forked 的 session 可能还引用着老 locator，直到它过期」。 — `/tmp/deepseek-harness/docs/config-catalog.md:2230-2245`
- **fork 语义**：子 session 继承种子日志里已有的 locator，**artifact 不被拷贝也不被重新归属**；fork 之后产生的 spill 用子 session id。 — `/tmp/deepseek-harness/docs/subsystems/spill.md:30-38`

**(b) Attachment —— 图片与通用文件**（`ctx.attachments`，`packages/attachment/attachment`）
- 内容寻址、不可变；**只有对象耐久之后才发布引用**。Session 事件和模型可见的 attachment block 里放的是引用+元数据，**绝不是 browser object URL、宿主临时路径、provider URL 或 base64**。
- 对象落在 `<DSH_HOME>/attachments/v1` 之下，**在 user 事件被 append 之前**就已移入。 — `/tmp/deepseek-harness/docs/subsystems/attachment.md:5-9`
- `AttachmentId` 当前渲染成 `sha256:<digest>`，但**消费者不得解析它、不得从中推导文件路径**。 — 同上 `:16`
- 本地后端限额：每条消息最多 20 张图、200 MiB 源数据；单张最多 20 MiB / 64,000,000 像素 / 单边 8192 px；随后独立的归一化阶段把长边限到 2048 px、编码数据限到 4 MiB。 — 同上 `:71`
- **明确不做生命周期回收**：
  > "The service is retention-neutral: resumed and forked sessions may share objects, so **reference-aware garbage collection is deferred rather than tied to one session's deletion**."
  > — `/tmp/deepseek-harness/docs/subsystems/attachment.md:160`

**(c) 物理压缩** —— 日志本身默认用带校验和的 Zstandard 帧；`compression: 'none'` 可换成可直接行读的文本，但**换编码必须换一个新 root**。 — `/tmp/deepseek-harness/packages/session/session-persistence-jsonl/README.md:156-158`

---

## 2. 权限治理

### 2.1 运行模式

**结论：有，而且是会话级、可持久重放的。但它不是一个枚举，而是两个正交「旋钮」+ 一个 preset 壳 + 一个不参与强制的软模式。**

| 机制 | 值域 | 载体（会话事件） | 强制力 |
|---|---|---|---|
| **sandbox mode** | `read-only` \| `workspace-write` \| `danger-full-access` | `sandbox/mode`，log-only，**最后一条获胜** | 真强制（**仅文件效果**） |
| **approval policy** | `ask` \| `never` | `approval/policy`，log-only，最后一条获胜 | 真强制（决定 ask 是否分发给回答者） |
| **permission preset** | 表键，默认表 `workspace-write` / `danger-full-access` | `permission/preset`，log-only，**纯记录用户意图，本身不强制** | 无（只是写穿两个旋钮） |
| **plan mode** | `active: boolean` | `plan/mode`，log-only，整值替换 | **无——明文「soft guidance」** |

证据：
- `type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'` — `/tmp/deepseek-harness/docs/subsystems/sandbox.md:20`
- `type ApprovalPolicy = 'ask' | 'never'` — `/tmp/deepseek-harness/packages/interaction/user-approval/src/index.ts:60`，`docs/subsystems/approval.md:46`
- 三个事件的完整声明 — `/tmp/deepseek-harness/docs/persistence-catalog.md:176-192`（`approval/policy`）、`:560-571`（`permission/preset`）、`:575-589`（`plan/mode`）、`:629-651`（`sandbox/mode`）
- 默认 preset 表：`workspace-write`（workspace-write + ask）与 `danger-full-access`（danger-full-access + **never**） — `/tmp/deepseek-harness/docs/subsystems/permission-presets.md:11`

**一个反直觉但很重要的点：`approval: 'never'` 不是「自动批准」，是「永远拒绝」。**
> "`'never'` — never prompt anyone: every ask resolves `'rejected'` deterministically. The strict headless stance (CI, unattended runs) and the policy whose outcome is knowable without asking."
> — `/tmp/deepseek-harness/docs/subsystems/approval.md:40-45`

所以所谓「YOLO 模式」（`danger-full-access`）的机制是：**沙箱根本不再拦，于是没人需要去问**；万一还有谁问，答案确定性地是拒绝。DSH **没有**「自动批准一切」这一档。

**切换路径**：`ctx.permissionPresets.set(session, name)` 是产品级单一入口；它先 append `permission/preset`（若 preset 未变则什么都不 append），再**只对实际发生变化的旋钮**调用各自的 canonical setter（`setSandboxMode` / `setApprovalPolicy`）。选回当前 preset 什么都不写。 — `/tmp/deepseek-harness/docs/subsystems/permission-presets.md:66`
另有人类命令面（`/plan` 等，`ctx.commands`）与 UI。`permission/preset` 存在的唯一理由是：两个 preset 可能共享同一组旋钮值，需要记住用户**选的是哪个**。 — 同上 `:68`

**切换后什么变了**：旋钮值变；同时模型通过**runtime-context 快照**（一条 sourced `user/message`）被告知新策略——**不是改 system prompt**：
> "changing approval state appends a new full snapshot after retained history **without touching the `system/message` nodes** that hold the rendered system prompt."
> — `/tmp/deepseek-harness/docs/subsystems/approval.md:49`
这是为了保住 provider 的 prompt 前缀缓存。

`custom` 是**派生态**：旋钮值不匹配任何表项时 `current()` 返回 `'custom'`；它**永远不能作为切换目标，也永远不是事件载荷**，表里叫 `custom` 会在插件加载时抛。 — `/tmp/deepseek-harness/docs/subsystems/permission-presets.md:33, :48`

### 2.2 权限分几层

**结论：五层，但它们不是同一维度的「层级覆盖」，而是管道上不同位置的独立关卡。**

1. **部署组合层（`cordis.yml`）**——装不装 `dsh-sandbox-local`、`dsh-bash-sandbox`、`dsh-user-approval`、`dsh-permission-presets` 这四行，决定这套能力是否存在。删掉 sandbox 与 permission 两行、把 bash 换回 `dsh-bash-local`，就是完全的 opt-out：执行不再受限，**而且转义字段从工具 schema 里消失**——因为它们是按「挂载的执行器有没有 `sandboxMode` capability fact」门控的，不是按配置。 — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md`（"How a deployment uses it"）
2. **部署默认值**——`dsh-bash-sandbox.config.mode` 是每个 session 起始的默认模式；`dsh-user-approval.config.policy` 同理。模式值不在封闭词汇表内**在插件加载时就被拒绝**。 — 同上
3. **agent preset 层**——`SessionHeader.agentPreset` 持久记录该 session 的 agent 由哪个 preset 组合而成，因为「preset 决定了这个 session 的工具和 prompt：resume 时恢复成另一套组合会重放模型已经无法执行的历史」。 — `/tmp/deepseek-harness/packages/core/session/src/types.ts:124-129`
4. **会话层（日志覆盖）**——`sandbox/mode` / `approval/policy` 最后一条事件即该 session 的 override，回退到服务配置。读取入口 `ctx.approval.effectivePolicy(session)`、`ctx.sandboxPolicy.resolve(...)`；写入唯一路径 `setApprovalPolicy` / `setSandboxMode`，**所以 replay 能重建 override**。 — `/tmp/deepseek-harness/docs/subsystems/approval.md:33`
5. **单次调用层**——策略随**每一次 capability 调用**走，不绑在 provider 上：
   > "Policy rides each CALL, not the provider: two consumers may confine under different policies at the same instant (bash under `read-only` while a confined child agent keeps its state directory writable), and an approved escalated retry is a new call with a wider policy — **inexpressible under a config-fixed provider mode**."
   > — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md`

**关键结构性发现：DSH 没有 Claude-Code 式的「工具名 / 命令模式允许列表规则引擎」。**我查了事件生产者-消费者表，生产环境里注册在 `tools/pre-execute`（那个 allow/deny/ask 瀑布）上的**只有三个包**：`hooks-claude-code`、`hooks-codex`、`tool-jobs`（`/tmp/deepseek-harness/docs/event-producer-consumer.md:67`）。没有内建的权限规则插件。权限来自沙箱（在 argv 包装/fs 后端里强制）+ 工具自己在被拒时发起的一次性审批 + 外部 hook。

### 2.3 多层怎么合成

**结论：单调收紧（monotonic restriction）。每一层只能减权限，没有任何一层能强制放行。**这是我找到的最一致的设计原则，在三个独立位置各写了一遍：

- **monotonic guards**（`ctx.tools.guard`）——返回类型**刻意没有 allow**：
  > "A `ToolGuard` is scope-aware final pre-dispatch policy. Its return type **deliberately has no allow result**: `undefined` preserves the waterfall decision, while a returned reason **can only reduce permission, so a later listener cannot undo it**."
  > — `/tmp/deepseek-harness/docs/subsystems/tools.md:313`
  > "Any matching guard may deny by returning a reason, while **no guard can force-allow** a call another guard denied."
  > — 同上 `:518-521`
- **hooks**——最严格者胜，且与顺序无关：
  > "the most-restrictive fold is **order-independent** (`deny > ask > allow`)"
  > — `/tmp/deepseek-harness/packages/hooks/hooks-claude-code/README.md:95`（`hooks-codex/README.md:91` 同文）
  并且 hook 的 `allow` **不能预批准**：
  > "- **`PreToolUse` is partial** — `deny` and `ask` decisions work; **`allow` does not pre-approve**, `defer` is unsupported …"
  > — `/tmp/deepseek-harness/packages/hooks/hooks-claude-code/README.md:177`
- **审批结局是封闭的、fail-closed**：
  > "`ApprovalOutcome` is closed and fail-closed. `allowed-once` grants only the asked-about action; callers deny on `rejected`, `cancelled`, and `unavailable`. A missing, non-owning, throwing, or non-conforming answerer becomes `unavailable` **rather than opening the gate**."
  > — `/tmp/deepseek-harness/docs/subsystems/approval.md:21`
- **沙箱不可用也 fail-closed**：没有可用后端时 `confine()` 抛结构化 `SANDBOX_UNAVAILABLE`，**而不是降级成不受限执行**。 — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md`

**唯一的「放宽」路径是单次转义（escalation），而且它被三重收紧**：必须**严格宽于**会话当前的有效模式、需要一次用户审批、**只放宽那一次重试**，拒绝后**不许再问**：
> "A confining executor adds paired `sandbox_permissions` and `justification` fields for one approved retry that **must be strictly wider** than the session's effective mode. A grant widens **only that retry**; rejection executes nothing, returns `the user rejected escalating this command to "<mode>"`, and **permits no re-ask**."
> — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md`

转义字段是**模型可见的工具参数**（`sandbox_permissions`、`justification`），且**只有在挂了限制性后端时才出现在 schema 里**；bash 和 fs 共用同一套词汇与 fail-closed 审批序列。 — `/tmp/deepseek-harness/packages/fs/tool-fs/src/sandbox.ts:1-30`

### 2.4 逐次批准的同意存在哪、活多久

**结论：`allowed-once` —— 一次调用，仅此一次。DSH 里不存在「always allow」，不存在同意的持久化，也不存在任何作用域升级路径。**

```ts
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```
— `/tmp/deepseek-harness/packages/interaction/user-approval/src/types.ts:32`

- 每个请求拿一个**全新的** `ApprovalRequestId`。 — `/tmp/deepseek-harness/docs/subsystems/approval.md:11`
- 会写进会话日志的**只有审计对**，不是授权：`approval/asked { id, toolName, callId?, reason? }` 和恰好一条对应的 `approval/decided { id, outcome }`。两者都是 **log-only**，**不进模型 transcript**。 — `/tmp/deepseek-harness/docs/persistence-catalog.md:131-172`、`docs/subsystems/approval.md:88`
- 模型看到的只有「发起询问那个工具的最终结果」+ runtime-context 快照里的当前策略；审计事件与人类权限 UI 都不是模型上下文。 — `/tmp/deepseek-harness/packages/interaction/user-approval/README.md:56`
- 会话层能被记住的**只有策略本身**（`ask` / `never`），不是任何一次具体同意。

**取舍分析**：这是与 Claude Code / Codex 最大的分歧点。DSH 完全放弃了「批准一次、以后同类放行」的便利，换来一个「不存在需要过期、需要作用域、需要被撤销的授权对象」的系统——审批这一层没有可变状态需要治理。代价是长时程无人值守运行会被反复打断，DSH 对此的答案是转到 `approval: 'never'`（一切确定性拒绝）+ 把沙箱调宽，而不是累积授权。

### 2.5 完整判定链

按管道顺序（`ctx.tools.execute()`）：

```
0. 模型发出 tool-call block
   ↓
1. Session 写 tool/call（执行之前就落日志）
   ↓
2. tools/pre-execute  —— 可重排的 allow/deny/ask 瀑布
   参与者（生产环境实际注册的只有）：hooks-claude-code、hooks-codex、tool-jobs
   PreToolDecision = {kind:'allow'} | {kind:'deny',reason} | {kind:'ask',reason?}
   hook 侧折叠规则：deny > ask > allow，与顺序无关；hook 的 allow 不能预批准
   ↓  deny → 直接物化成错误结果，工具体跳过
   ↓  ask  ↓
3. ctx.approval.request(...)  —— 一次性人类/机器审批
   先看会话策略：policy='never' → 确定性 rejected，不分发任何回答者
                 policy='ask'  → 分发 approval/request 回答者瀑布，无人应答 → unavailable
   日志：approval/asked + approval/decided（log-only 审计）
   ↓  只有 'allowed-once' 通过；rejected / cancelled / unavailable 一律 denied
   ↓
4. 已注册的 monotonic guards —— 只能 deny 或弃权，identity 受保护
   ↓
5. tools/execute 瀑布 —— around-dispatch 包装（超时、重试、指标）
   ↓
6. 工具 execute() 体
   ├─ bash / 子进程：ctx.sandbox.confine(argv, policy) 返回「替代要 spawn 的 argv」
   │    policy.workspaceRoot 来自「调用方 session 的不可变 cwd」
   │    被拒 → [sandbox: file access denied under <mode> mode] 标记 + 不要绕过的指示
   │    模型可用 sandbox_permissions + justification 请求一次更宽的重试 → 回到第 3 步
   └─ fs write/edit：fs/write-intent、fs/edit-intent 门（tool-fs 变更专用）
        fs-sandbox 后端按会话 sandbox 模式拒绝 → FS_SANDBOX_DENIED + 同回合转义提示
   ↓
7. tools/post-execute 瀑布 —— accept / block(feedback) / 附加上下文
   ↓
8. 注册表外层归一化（管道抛错 → isError）
   ↓
9. ToolDefinition.finalizeContent（最后一道纯内容不变量）
   ↓
10. tools/result 同步通知（冻结的权威结局）
   ↓
11. Session 写 tool/result（唯一面向模型的结局）
```

证据：`/tmp/deepseek-harness/docs/tool-execution-pipeline.md:8-44`（Mermaid 图，含 `pre -->|deny| denied`、`approval -->|rejected, cancelled, unavailable| denied`）、`docs/subsystems/tools.md:172`（管道顺序一句话）、`docs/subsystems/tools.md:364-390`（`PreToolDecision` / `PostToolDecision` 定义）、`docs/subsystems/approval.md:33`（策略前置）、`.agents/notes/implemented/feature/2026-07-06-sandbox.md`（转义回路）。

**明确不在这条链上的**：
- **fs / web / todo 等进程内工具不受 OS 沙箱约束**——`execve` 包装对一个闭包着 `ctx` 的函数毫无意义。DSH 明说「每个工具都有边界」**不是**它的主张：
  > "An every-tool boundary is deliberately NOT the claim: fs/web/todo execute in-process where an `execve` wrapper is meaningless"
  > — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md`（Problem）
  （fs 的写/改是靠 `dsh-fs-sandbox` 这个**后端替换**单独做的，不是靠 argv 包装。）
- **plan mode 完全不参与**：「Sandbox mode 和 approval policy 独立强制；两者都不读也不写 plan 状态。」 — `/tmp/deepseek-harness/docs/subsystems/plan.md:5`

---

## 3. 上下文感知域（这个会话能看见哪些外部世界）

### 3.1 会话开始时能指定什么

**能绑进 `SessionHeader` 的只有一个感知域字段：`cwd`。**完整 header（`/tmp/deepseek-harness/packages/core/session/src/types.ts:93-130`）：

```ts
interface SessionHeader {
  readonly version: typeof SESSION_FORMAT_VERSION
  readonly id: SessionId
  readonly createdAt: number
  readonly cwd?: string              // 绝对路径，创建时校验
  readonly parentSession?: SessionId // fork 血缘
  readonly isSeeded: boolean
  readonly origin?: 'subagent'       // 展示用分类，不证明可续
  readonly delegationDepth?: number  // 持久化，使递归预算能扛住重启与 resume
  readonly agentPreset?: string      // 持久化，因为 preset 决定工具与 prompt
}
```
header 明确标注为 **immutable validated storage metadata**，且**不属于 `SessionEventMap`、不进 `deriveMessages()`**。`meta.cwd` 非绝对路径直接抛（「存储后端按它建目录」）。 — `/tmp/deepseek-harness/docs/subsystems/session.md:862-878`

其余「外部世界」的绑定**不在 session 上**，而在 **agent preset / Cordis 插件组合**上：
- `ctx.agentPresets.mount(agentCtx, id)` 在 agent 工厂的 `setup(agentCtx)` 里调用：确保该 preset 的 **standing mount**（长驻挂载）存在，然后**把这个 agent 的 scope key 挂到那个 mount 下**，使 mount 的注册与监听器覆盖这个 agent。这里失败会回滚整个 agent 创建，「所以坏掉的 preset 绝不会产生半组合的 session」。 — `/tmp/deepseek-harness/docs/subsystems/core.md:543-556`
- `bind` 是子 agent 继承父能力的方式：「这是 bind 不是 mount：父的 generation 已经组合好了」。 — 同上 `:557-560`
- **MCP**：`dsh-mcp-client` 每个 entry 配一个 server，工具以 `mcp__<server>__<tool>` 形式出现。**默认不启用任何 server**；**只桥接 tools，MCP 的 resources 与 prompts 不支持**。 — `/tmp/deepseek-harness/packages/mcp/mcp-client/README.md`（Summary）
- **Skills**：`ctx.skills` 注册表**跨宿主层和 per-scope 层合并** provider 目录；skill 是「可选指令，不是 session 事件」。 — `/tmp/deepseek-harness/docs/subsystems/skills.md:5`
  skill 根目录是配置项（`agentsHome`、`customSkillDirs`、`bundledSkillDir`），可选文件监听。 — `/tmp/deepseek-harness/docs/config-catalog.md`（`skill-filesystem` 段）
- **Workspace**：`WorkspaceId` 是生成的 uuid **而不是路径**（「路径归一化会重写路径，而引用锚点必须稳定」）；路径唯一性用 `realpathNormalize`（`fs.realpath`，解析尾斜杠、`..`、符号链接）做规范化后字符串相等——**指向已拥有目录的符号链接会碰撞**；attach 时的 session cwd 检查走同一套规范。 — `/tmp/deepseek-harness/docs/subsystems/workspace.md:13-20`

### 3.2 进行中能不能追加/移除

- **cwd：不能。**`SessionHeader` 是不可变的，且沙箱策略解析明说：
  > "Normal tool calls derive `workspaceRoot` from the calling session's **immutable cwd**; deployment configuration is the agentless fallback."
  > — `/tmp/deepseek-harness/docs/subsystems/sandbox.md:43`
- **能力组合：能，但走 Cordis 插件生命周期，不是 session API。**Cordis 的注册是「可撤销的 effect，插件卸载时解绕」；`web` profile 默认**实时 patch 重载**，`headless`/`sdk`/`sdk-minimal`/`acp` 刻意只在启动时应用一次（「在一个一次性或 stdio 应用已经拥有工作之后替换它的依赖会使那个生命周期失效」）。 — `/tmp/deepseek-harness/docs/architecture.md:13, :29`
- **Skills：能热变。**发现是**非记忆化**的：`list()` 和 `resolve()` 每次调用都重读根目录，所以进程运行期间新写的 preset/skill 立即可见，被删的立即消失。 — `/tmp/deepseek-harness/docs/subsystems/core.md:490`（preset），`docs/subsystems/skills.md`（skill 注册表 + 可选 watch）
- **动态定义工具：能，而且是 session 作用域的**（`dsh-tool-cordis`）——但见下节的隔离缺口。
- **Session 引用（读另一个 session 的内容）**：`packages/context/session-reference` 定义了规范 URI、当前 surface 投影、tag-safe JSON 与字节保留、稳定错误码，以及**给模型的「不可信」提示**。宿主适配器用这些类型，而不是把自己的 UI @ 语法塞进 agent 核心。 — `/tmp/deepseek-harness/docs/subsystems/session-reference.md:5`

### 3.3 绑定的作用域

**两层扁平，刻意不继承。**
> "**scope** — the unit of per-agent registration: a contribution (tool, prompt section, variable, restriction, listener) is either *global* … or *scoped* (owned by exactly one scope key). **Two levels, flat: scoped registrations do not inherit down to subagents**; subtree behavior is expressed with lineage data, never scope structure."
> — `/tmp/deepseek-harness/docs/glossary.md`（agent-scope 条）

- **scope key 就是活的 `Agent` 对象本身**，按对象身份比较。 — 同上；`/tmp/deepseek-harness/docs/subsystems/scope.md:14-20`
- **注册上下文同时决定可见性和所有权**（一个事实驱动两者），「防止一个贡献在一个 scope 里可见却随另一个 scope 被拆掉」。 — `/tmp/deepseek-harness/packages/core/scope/README.md:60`
- **shadowing**：scoped 工具/段/变量对该 scope 替换同名的全局孪生体——这就是 per-agent persona 和 per-agent 工具变体的机制。
- **restriction**：`tools.restrict` 过滤**全局**工具集，**按交集合成**；被过滤掉的全局工具**在 prompt 里缺席且执行时拒绝，与不存在的工具不可区分**。
- **preset 是 standing mount，多个 session 共享同一个已组合的 generation**（不是每 session 一份隔离实例）；要每 session 不同能力集，`architecture.md:141` 说「组一个 agent preset；其中的 service 行需要一个 `isolate` realm」。
- **session 结束后**：`AgentHandle.dispose()` 停 loop、等它退出、注销 agent、**把 session 从 store 移除**、最后解绕它的 scoped world。 — `/tmp/deepseek-harness/docs/subsystems/core.md:26-38`

### 3.4 感知域边界检查 —— 最重要的一条

**结论：DSH 的沙箱只管「写」，不管「看」。读、网络、进程可见性都在词汇表之外。**

> "`SandboxMode` governs **filesystem effects only**. … `workspace-write` permits writes under the workspace root and the backend's promised temp area; `danger-full-access` bypasses confinement. **Network and process visibility are outside this vocabulary.**"
> — `/tmp/deepseek-harness/docs/subsystems/sandbox.md:11`

> "`dsh-fs-sandbox` confines model file **writes and edits** according to each session's sandbox mode **while preserving the local filesystem's read behavior**."
> — `/tmp/deepseek-harness/packages/fs/fs-sandbox/README.md:12`

即：`read-only` 模式的含义是「拒绝一切变更」，不是「只能读声明范围内的东西」。**agent 能读的东西没有会话级边界。**

其他边界事实：
- **enforcement 是一个被上报的事实，不是保证**：`full` / `partial`；老 Landlock ABI 和 Windows ACL runner 的 Everyone/硬链接边界是当前的 partial 情形，「需要绝对边界的调用方不得把它当作 `full`」。 — `/tmp/deepseek-harness/docs/subsystems/sandbox.md`（`SandboxEnforcement`）
- **seam 只约束同世界子进程**：后端共享宿主的文件系统与内核。**容器、microVM、远程执行器不是这条 seam 的后端**——它们替换的是整条能力 seam（`ctx.shell`、`ctx.fs`）的 Service Provider，作为环境一致的组，「因为一个 bash 在容器里跑而 fs 工具写宿主的 agent 活在两个分裂的世界里」。 — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md`
- **Session 之间的进程内隔离有明确缺口**（动态工具包）：
  > "Definitions are session-scoped and process-local: a package is visible and controllable only in the session that defined it, stays active across later turns, and **can affect other sessions in the same process while running**."
  > — `/tmp/deepseek-harness/packages/extensions/tool-cordis/README.md:59`
- **Spill 的存储命名空间不是访问控制**：
  > "**Storage is not access control** — the owner session namespaces writes but does not authorize reads of a locator; each backend and retrieval consumer must enforce its own boundary."
  > — `/tmp/deepseek-harness/packages/spill/spill/README.md:137`
- `packages/core/scope` 同样自我声明：「这个原语路由的是可信的同进程插件；**它不是沙箱，也不是权限边界**」。 — `/tmp/deepseek-harness/packages/core/scope/README.md:60`

---

## 4. 生命周期控制

### 4.1 怎么创建（能不能没人说过话就存在）

**能。至少四条路径不需要任何人先说话。**

1. **声明式配置**：`dsh-agent-loop.config.agents[]` 里声明的 agent **在插件加载时自动启动**。省略 `sessionId` 每次启动都新建一个 `${id}-session-<uuid>`；要「有就 resume、没有就 create」必须显式给稳定 `sessionId`；`resumeSessionId` 要求已有持久历史（二者互斥）。 — `/tmp/deepseek-harness/packages/core/agent-loop/README.md`（配置表）、`:198`
2. **程序化**：`ctx.agents.create(options)` / `ctx.agents.resume(options)`，返回 `AgentHandle`。 — `/tmp/deepseek-harness/docs/subsystems/core.md:806-820`
3. **外部 webhook**：`ctx.webhookRuntime` 把认证过的外部投递变成**普通的根 Session**。规则返回一个 `WebhookSessionRequest`（必须有绝对 `workspacePath`、title、文本 prompt、agent preset、permission preset），runtime 校验 preset、解析或创建规范 Workspace、创建 cwd 等于 workspace path 的 Agent、在发布前挂载 preset、耐久地 attach Session，然后施加 permission、title 和首条 follow-up。 — `/tmp/deepseek-harness/docs/subsystems/webhook.md:23-31`
4. **subagent 委派**：`SubagentRuntime.startContinuable()` 预留稳定子 id、快照 `subagent/descriptor`、向 provider 要 `ContinuableCreateSpec`、通过私有 activation-owner scope 创建子 Agent、建立父所有权、提交初始 prompt。 — `/tmp/deepseek-harness/docs/subsystems/subagent.md:130`

**Schedule 不创建 session**，它只往**原有的活 Session** 里投递普通的后续对话回合（`after` / `at` / `every`，`every` 最小 5 分钟）。 — `/tmp/deepseek-harness/docs/subsystems/schedule.md:5`

创建是个**带回滚的事务**：`prepare()` 构造但不入 store → `enter()` 装发布 hook 并入 store，返回 detach disposer → `announce()` 发一次 `session/created`。三步分开，是为了调用方能**先 yield detach disposer 再 announce**，这样一个抛异常的 `session/created` 监听器会把 attach 回滚掉而不是泄漏它。 — `/tmp/deepseek-harness/docs/subsystems/session.md:882-935`

### 4.2 有哪些状态，状态机长什么样

**结论：Session 本身没有状态机。唯一的状态枚举在 Agent 上，而且只有两个值。**

```ts
/**
 * An agent's lifecycle state, emitted on every transition as `agent/status`:
 * `idle` means no driver is active; `running` begins when waking input starts
 * cancellable pre-step processing and lasts while the driver drains,
 * closes, or checkpoints turns. **Disposal removes the agent from its registry;
 * it is not a third observable status.**
 */
type AgentStatus = 'idle' | 'running'
```
— `/tmp/deepseek-harness/packages/core/agent/src/runtime-types.ts:109`，`docs/subsystems/core.md:146-152`

- `running` 描述的是**驱动器整体的 drain 区间**，可能跨连续多个排队的 turn；**它不证明某个 turn 还开着**。 — `/tmp/deepseek-harness/docs/subsystems/core.md:154`
- Session 的「生命阶段」全部体现为**日志里的事件**：`turn/start` … `turn/end`、`step/start` … `step/end`、`session/end-seed`。

DSH 刻意**没有**第二套执行状态机。可续 subagent 的三态（`running` / `waiting` / `settled`）是从既有信号**推导**出来的，不是维护出来的：
> "The manager **derives these internal conditions** from `Agent.whenIdle()`, `Agent.inbox.hasPending`, the owned-child set, and an Activation generation that invalidates stale observations, **rather than maintaining a second execution state machine**."
> — `/tmp/deepseek-harness/docs/subsystems/subagent.md:140`

### 4.3 终态与进入方式

Session 层面的「结束」只有两类表达：

**(a) 一个 turn 怎么结束** —— `TurnEndReasonMap`（merge-extensible sum type，`/tmp/deepseek-harness/packages/core/session/src/types.ts:200`）：

| kind | 进入方式 |
|---|---|
| `completed` | 自然停止 |
| `aborted` | 取消中断了活 turn，带 `TurnEndCancelCause`（下见） |
| `blocked` | 被拦截（如 hook 丢弃了 prompt，模型不可见） |
| `error` | 结构化失败（`LlmError` 逐字，或扁平化成 `{message, code:'UNKNOWN'}`） |
| `max-tokens` | **任一** step 撞到输出 token 上限，整个 turn 就是 `max-tokens`（「被截断这个事实胜过后续的继续」） |
| `interrupted` | **唯一一个没有任何 loop 会发出的 reason**——由崩溃恢复合成 |

取消原因是封闭联合：`{kind:'user'} | {kind:'parent'} | {kind:'hook',reason} | {kind:'disposed'}`；持久化时额外允许 `{kind:'legacy'}` 表示导入的粗粒度旧记录。 — `/tmp/deepseek-harness/docs/subsystems/core.md:317-327`

**(b) 一个 Session 怎么离开进程** —— `session/disposed`，「一个已宣告的 session 离开 store 时恰好发一次，**包括发布回滚**，但对宣告从未开始的条目永不发出」。 — `/tmp/deepseek-harness/docs/subsystems/session.md:1116-1136`

**没有「已归档」「已删除」「已过期」这样的持久终态。**日志本身没有终结状态——见第 1.5 节。

### 4.4 终止时名下正在跑的东西怎么办

```
AgentHandle.dispose():
  停 loop → await 它退出 → 注销 agent → 把 session 从 store 移除 → 解绕 scoped world
```
— `/tmp/deepseek-harness/docs/subsystems/core.md:26-38`（"`dispose()` stops the loop, awaits its exit, unregisters the agent, removes its session from the store, and finally unwinds its scoped world."）

- `dispose` 是一个 **capability**：消费者中只有持有者能拆掉这个 agent；注册的 factory provider 也是结构性所有者（provider 卸载会停掉并 drain 它造的每个活 handle）。 — 同上
- **有序拆解是刻意设计的**：需要 session 与 loop **按序**拆（这样 loop 的最后一批事件在 store attach 结束前被发布）的 agent，**不能用 `ctx.sessions.create()`**，必须把 session 生命周期折进 agent 自己的 `ctx.effect`——否则「会在驱动器的收尾事件提交之前就移除发布 hook，把它们丢掉」。 — `/tmp/deepseek-harness/docs/subsystems/session.md:862-870`
- `cancel(cause, options)`：中止活 turn 或 turn 间任务，**并清空排队与 steering 工作，除非 `keepInbox`**。第一个 cause 获胜。没有活动时取消是 no-op 且**不会武装后来的工作**。 — `/tmp/deepseek-harness/docs/subsystems/core.md:75-82`
- `session/disposed` 触发持久化的**最终 drain 并关闭 handle**；`close()` 自己也会把路由缓冲经由仍然打开的存储 drain 掉，所以后端拆解的 close sweep 不丢东西。 — `/tmp/deepseek-harness/docs/subsystems/persistence.md:106`
- **明确承认的丢失窗口**：root fiber 在 turn 中途 dispose「按设计仍会丢掉这个 turn 尚未 emit 的余部——下一次 resume 的 `interruptedTurnClosers` 耐久地修复那条尾巴」。 — `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.md`

### 4.5 父子会话 / 会话树

**存在两套彼此独立的父子关系，DSH 刻意不把它们合并：**

| | 持久血缘 | 运行时所有权 |
|---|---|---|
| 载体 | `SessionHeader.parentSession`、`isSeeded`、`delegationDepth`、`origin:'subagent'` | Activation 的 `ownedChildren: Set<SessionId>`；`ctx.agents` 的 parentAgent 关系 |
| 语义 | 「这个 session 从哪来」 | 「现在谁在拆解链上拥有它」 |

> "**Treat `SessionHeader.parentSession` as live ownership.** Durable lineage does not prove that the recorded parent currently owns the child. Membership in the live parent's `ownedChildren` records the process-local relationship **without changing the durable parent id**."
> — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md`（Alternatives considered）

> "durable session lineage does not affect this runtime relation, so **a resumed fork may still be a root**."
> — `/tmp/deepseek-harness/packages/core/agent/src/index.ts:593-594`

**父终止时子怎么办（可续 subagent）**：
- 每个 Activation 拥有自己的 `AgentHandle` 和 `ownedChildren`；启动子或提交父发起的工作会在子能跑之前把子登记进父的集合，而**父在集合非空时不能 settle**。 — `/tmp/deepseek-harness/docs/subsystems/subagent.md:169`
- 释放子只发生在：子没有活跃 Agent 工作 **且** Inbox 空 **且** 它自己的每个子都已 dispose **且** best-effort 最终 session flush 已 settle **且** 子的 `AgentHandle` 完成 disposal。 — 同上
- **child-first 拆解**：manager 卸载会跑一次全局 drain，关闭准入并 dispose 每一片活的森林；`drainContinuableDescendants(parents)` 只在指定的活 host-owned Agent 之下关闭准入并 dispose 其可续后代，**无关的森林保持存活**。两者都自顶向下传播取消、**child-first 释放 handle**，并在个别失败时仍等待每个选中的分支。
- **持久子 Session 在这种进程内拆解后仍然存活。** — 同上
- `interrupt(targetSessionId, authority)` 是唯一的公开停止：同步授权、对活目标发 `Agent.cancel(cause, {keepInbox:true})`、**不等静默就返回**。Activation、未认领的 inbox 工作和已发布的后代**都不受影响**；已被认领进被中断 turn 的工作**不会重新排队**。 — `/tmp/deepseek-harness/docs/subsystems/subagent.md:157`

**没有更一般的会话树**：
> "- **No session tree beyond fork** — a pi-style entry tree over branched sessions is deferred unless a consumer needs more than boundary-based forking."
> — `/tmp/deepseek-harness/packages/core/session/README.md:186`

但**只读的血缘查询**是有的：`SessionLineageTrace` 带「从最近父往外」的祖先列表和递归后代森林，且用 `complete: true + root` / `complete: false + unresolvedParentId` 这个判别式把「已知根」和「父链走出可见语料」变成互斥的两种情况。 — `/tmp/deepseek-harness/docs/subsystems/session-query.md:224-262`

### 4.6 恢复 / 继续 / fork / 分支

**Resume**：`ctx.agents.resume({ resumeSessionId })` 打开该 session 的写 handle、读回存储日志、把准备好的 Session 以持久 id 发布、继续它的投影。agent-loop **刻意不硬注入 `sessionPersistence`**（那会让非持久化的 demo 永远 pending），`resume` 在它缺席时以清晰错误拒绝。 — `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-14-session-persistence.md`

**Fork**：`ctx.sessions.fork(source, boundary?, childSessionId?)`
- 接受活 `Session` 对象或活 `SessionId`，按**包含式 `SessionSeq` 边界**选事件（默认当前最后一个），**要求选中前缀结束在一个开着的 turn 之外**，然后创建带深拷贝种子事件、`parentSession`、`isSeeded: true`、精确 `inheritedEventCount` 和继承 `cwd` 的活子 session。
- **拒绝结束于开着 turn 的前缀，而不是静默裁剪**。（`dsh-subagent-fork-in-process` 保留它自己的「裁到已完成前缀」行为，因为工具时委派通常在父 turn 开着的时候开始。） — `/tmp/deepseek-harness/docs/subsystems/session.md:608-614`
- 限制：**只能在活 session 的稳定边界上切**——「fork 一个已持久化但未加载的 session 被排除在 fork API 之外」。 — `/tmp/deepseek-harness/packages/core/session/README.md:183`
- Web 侧有 `session.fork` Remote，能「把一个冷可读的已完成 turn 前缀 fork 成新 Session」。 — `/tmp/deepseek-harness/docs/subsystems/session.md:792-797`

**`session/end-seed` —— 一个很精巧的边界标记**：新 fork 的构造器要求种子等于继承前缀，并在**精确的耐久切口**处追加 `session/end-seed { inherited: true }`。它存在的理由是：
> "seed history and live work are otherwise **byte-identical**, which defeats any plugin owning a standalone open/close bracket: an unmatched `compaction/start` reads the same whether the writer crashed mid-compaction or is compacting right now."
> — `/tmp/deepseek-harness/docs/subsystems/session.md:663-669`

并且：**按人类活动排序 session 的消费者要排除这个边界**——「把一个 Session 捡起来不算工作，按日志尾排序会让每个被打开的 Session 都浮到顶上」。 — 同上

---

## 5. 它在会话层面还设计了什么别的维度

**有的（7 项），但有 3 项明确没有。**

**(1) 派生状态的统一 seam —— `ctx.sessionProjections`**
注册的单元**增量折叠**已提交事件；宿主消费者用 `stateOf()` 读一个类型化状态；carrier 用 `snapshot()` 批量输出裁剪过的客户端视图。「框架驱动，领域计算」：注册表**只订阅一次** `session/event` 并把每个事件折过每个单元；领域不持有订阅，客户端永不折叠领域事件——它们收到的是成品值。单元的 `apply` **必须同步**（异步单元会撕裂 carrier 的一致性切面），`state` **必须是纯 JSON**（持久缓存的前提）。 — `/tmp/deepseek-harness/docs/architecture.md:123`、`docs/subsystems/session-projection.md:5-15`
已知的投影单元：`turnBoundary`（agent-loop 注册的共享状态）、`permissions`、`plan`、`subagent`、`inbox`、`title`、`sessionStats`、`goal`。

**(2) 持久投影检查点缓存 —— `dsh-session-projection-cache`**
让历史列表、统计、goal 快照**不用加载每个 session 日志**就能读到缓存值；冷折叠可以从检查点前缀之后续跑。日志仍是权威：「崩溃可能留下过期的检查点，但**永不会超前于已提交事件**」；不兼容记录被忽略或备份。三个强制写点（session 创建、`turn/end`、session 销毁）**是策略不是可调项**。 — `/tmp/deepseek-harness/packages/session/session-projection-cache/README.md`、`docs/config-catalog.md:1955+`

**(3) 会话统计 —— `sessionStats`**
整 session 的 turn/step 计数与 LLM、工具、首 token、解码墙钟时间。数字来自**完整的持久日志**，所以**分页和压缩不改变它们**。 — `/tmp/deepseek-harness/packages/session/session-stats/README.md`

**(4) Token 计量 —— `ctx.tokenMeter`**
`TokenMeasurement` 带 `logRevision`（消费的持久事件数）、`baseline`（provider usage 锚点 or 启发式）、`surfaceDeltaTokens`（有符号，保留增长与缩减）、`totalTokens`、`surfaceTokens` 与逐节点定价。每次测量都按**当前路由**解析 request-image 定价，所以图片历史按请求实际发送的方式计价。 — `/tmp/deepseek-harness/docs/subsystems/token-meter.md:9-30`

**(5) 会话遥测 —— `ctx.sessionTelemetry` + OTel provider**
每个规范 session 事件（包括带完整压缩流的 `assistant/message`/`assistant/attempt`，以及 seam 从未听说过的插件合并类型）**整个**作为一条有序 ledger 记录通过。`session-telemetry/record` 是脱敏瀑布。**边界公理**：harness 的切面止于 `emit()`；批处理、重试、排队和丢失策略属于上报 SDK。**投递是 best-effort**：游标标记的是「已交接」不是「已投递」，记录可能丢（崩溃、重载窗口）或重复（新对象重放、SDK 重试），所以接收方按 `(session.id, session.format_version, event.seq)` 去重。 — `/tmp/deepseek-harness/docs/subsystems/session-telemetry.md:5, :58`

**(6) 会话日志上传给官方 API —— `dsh-session-log-deepseek`（默认关闭）**
`enabled` 默认 `false`。开启后按水位增量上传规范 session 日志后缀到 `dsh_session_log` 请求字段。模型看不到它（不进 messages / system prompt / tool schema，零模型输入 token）。**at-least-once**：不确定造成重复，永不跳号。 — `/tmp/deepseek-harness/packages/session/session-log-deepseek/README.md:27-52`

**(7) 同会话目标 —— `ctx.goals`**
一个附在既有 session 上的持久完成目标，有带 revision 的 `active`/`paused`/`blocked`/`complete` 阶段和 goal-round 上限；`blocked` 保留策略码和解释。**goal 是状态，不是调度器也不是另一个会话；session 日志仍是它的真相源。**
关键设计：**goal activation 是进程本地的，刻意不进持久重放**——所以 resume 和 fork 在自动工作之前，需要一次后续的、人类授权的 resume 变更（走 `/goal` 或模型工具）。 — `/tmp/deepseek-harness/docs/glossary.md`（goal 条）、`docs/subsystems/goal.md:5-30`

**明确没有的：**
- **没有成本/计费归属。**全仓 grep `budget|quota|cost` 没有任何金额、配额或计费概念；只有 token 压力（token-meter）、字节预算（shell stdout、attachment 像素/字节）、goal round 上限和工具超时。
- **没有租户/多用户身份。**唯一的身份包是 `packages/identity/anonymous-user-id`：每个 harness home 一个随机 UUID，存在 `$DSH_HOME/.anonymous-user-id`，用于关联遥测、feedback 和 DeepSeek 请求（`x-deepseek-harness-user-id` 头）。README 明写「**不要用它识别用户，也不要用它跨 home 关联记录**；它是匿名且 home 作用域的」。 — `/tmp/deepseek-harness/packages/identity/anonymous-user-id/README.md`
  Web 承载层「**自己不拥有 TLS、认证或 Origin 策略**」；`dsh web` 只绑 loopback、拒绝 `--host 0.0.0.0`，它的 Connection 插件提供 Host/Origin 检查加浏览器会话认证。 — `/tmp/deepseek-harness/docs/subsystems/web-server.md:47`
  全仓只有两处提到 multi-tenant，都是「**尚未有**硬多租户边界，等容器级后端」。 — `/tmp/deepseek-harness/packages/code-runtime/code-runtime-worker-thread/README.md:75`、`packages/code-runtime/code-runtime/README.md:142`
- **没有多设备同步。**见下节的「进程本地驻留」限制。

**审计**：`approval/asked` + `approval/decided` 对、`hook/invoked` + `hook/result` 对（按 `handlerId` 关联）、`permission/preset`、`sandbox/mode`、`approval/policy` 全部在会话日志里，可重放、log-only、**不进模型 transcript**。`dsh-invariants` 提供运行时不变量注册表（按 npm 包名归属、可用正则 allowlist/blocklist 选择、失败带包名抛 `InvariantError`）。 — `/tmp/deepseek-harness/docs/subsystems/invariants.md`

---

## 6. 它刻意不做什么（原文引用）

### 6.1 整个产品层面

> "DeepSeek Harness is experimental developer-preview software. **It has not undergone a security audit and must not be treated as secure or production-ready.**"
> — `/tmp/deepseek-harness/SAFETY.md:7`

> "**Sandboxing, approval prompts, and permission controls can reduce risk, but they do not guarantee isolation or prevent damage.** Even correctly enforced restrictions cannot protect resources that the project is allowed to access."
> — `/tmp/deepseek-harness/SAFETY.md:13`

> "**Do not rely on DeepSeek Harness as the sole security control for untrusted workloads.**"
> — `/tmp/deepseek-harness/SAFETY.md:15`

> "DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**"
> — `/tmp/deepseek-harness/README.md:13`

### 6.2 存储与持久化

> "- **No deletion or retention API** — pruning stored sessions is out-of-band backend maintenance.
> - **`list()` is unpaginated and unfiltered** — it returns every stored session's snapshot; fine for local stores, unindexed at scale.
> - **Synthetic closers are the only crash story** — resume appends `interruptedTurnClosers` through the write handle; **there is no partial-turn resume that continues an interrupted turn instead of closing it.**
> - **The seam guarantees write ownership only within one backend instance** — cross-process exclusion is provider-specific.
> - **A backend plugin reload under live sessions fails their writers loudly** — a reloaded backend cannot serve handles the old instance issued; writes fail until the sessions restart, and nothing silently re-adopts the logs.
> - **Only handle-acquired sessions persist** — `ctx.sessions.create` + `session/flush` alone stores nothing."
> — `/tmp/deepseek-harness/packages/session/session-persistence/README.md:149-154`

> "- **Nothing deletes session files** — logs accumulate under `root` until removed externally; the seam has no deletion API.
> - **Compressed files are not directly line-readable**.
> - **One live writer per session** … Advisory `flock` is unreliable on some network filesystems (NFSv3), and the Windows semaphore name is per login session."
> — `/tmp/deepseek-harness/packages/session/session-persistence-jsonl/README.md:156-165`

### 6.3 Session 模型本身

> "- **`fork()` cuts only at stable boundaries of live sessions** — … **forking a persisted-but-unloaded session is excluded from the fork API.**
> - **`TurnEndReasonMap` omits the ACP-named `refusal` / `max_turn_requests` variants** — producer-gated.
> - **No session tree beyond fork** — a pi-style entry tree over branched sessions is deferred unless a consumer needs more than boundary-based forking."
> — `/tmp/deepseek-harness/packages/core/session/README.md:183-186`

### 6.4 Agent loop

> "- **No built-in turn budget** — tool calls or steering continue the current turn; a policy that bounds runaway turns must cancel from an existing lifecycle extension point such as `agent/turn-stopping`.
> - **Config agents have no per-agent persona field or setup hook** — they use the deployment persona; scoped persona and tool composition are available only through the programmatic `ctx.agents.create()` / `resume()` factory options.
> - **Classification is unary** — calls whose safety depends on comparing siblings or resources must remain exclusive."
> — `/tmp/deepseek-harness/packages/core/agent-loop/README.md:197-200`

### 6.5 父子会话 / 跨进程

> "- **Process-local residency** — the Activation inbox and ownership graph **do not coordinate two harness processes**; concurrent access to one persistence store needs a durable mailbox and cross-process lease protocol.
> - **No replay of accepted-but-unlogged messages** — a crash can lose an accepted prompt that never reached the child's session log; the lost message is not replayed automatically.
> - **No durable parent mailbox** — child-to-parent messages require a resident continuable child and live direct parent, and provide **acceptance identity rather than exactly-once delivery**.
> - **A direct parent must remain live for child-to-parent delivery** — the service has no durable parent mailbox; a missing parent rejects the message instead of accepting work it cannot wake.
> - **Adjacent model messaging only** — … 只允许「直接父 ↔ 直接可续子」一条边；兄弟、隔代祖先、自指、陈旧 Agent 对象、一次性子全部拒绝。
> - **ACP children remain one-shot and are not trace-enumerable**.
> - **Lifecycle events are observe-only** — a run-affecting `subagent/end` continuation or decision API waits for a concrete consumer."
> — `/tmp/deepseek-harness/packages/subagent/subagent/README.md:170-178`

### 6.6 沙箱与权限

> "An every-tool boundary is **deliberately NOT the claim**: fs/web/todo execute in-process where an `execve` wrapper is meaningless, and the cross-family boundary is staged follow-up work."
> — `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md`（Problem）

> "`SandboxMode` governs **filesystem effects only**. … **Network and process visibility are outside this vocabulary.**"
> — `/tmp/deepseek-harness/docs/subsystems/sandbox.md:11`

> "Plan mode is **soft guidance**. Sandbox mode and approval policy enforce restrictions independently; **neither reads or writes plan state**."
> — `/tmp/deepseek-harness/docs/subsystems/plan.md:5`

> "**`PreToolUse` is partial** — `deny` and `ask` decisions work; **`allow` does not pre-approve**, `defer` is unsupported, `additionalContext` is ignored, and `updatedInput` is logged + warned but not honored."
> — `/tmp/deepseek-harness/packages/hooks/hooks-claude-code/README.md:177`

> "The primitive routes trusted same-process plugins; **it is not a sandbox or an authority boundary.**"
> — `/tmp/deepseek-harness/packages/core/scope/README.md:60`

> "**Containment, not a security boundary** … the design optimizes for reconstructability and bounded resource use rather than **for a hard multi-tenant boundary — that awaits a container-class backend**."
> — `/tmp/deepseek-harness/packages/code-runtime/code-runtime-worker-thread/README.md:55, :75`

> "- **The worker and vm are not a security boundary** — model-written code can escape `node:vm` and reach the worker's process authority; a hostile-code deployment needs a separate-process or container engine."
> — `/tmp/deepseek-harness/packages/workflow/workflow-worker-thread/README.md:167`

> "**The sandbox is containment for honest code, not a security boundary** — host-realm helpers on the sandbox global are reachable, so package code can reach Node; load this plugin as deliberately as you would grant a bash tool."
> — `/tmp/deepseek-harness/packages/extensions/tool-cordis/README.md:182`

### 6.7 大对象

> "- **No retrieval or deletion API** — consumers can only render the backend's locator and guidance; lifecycle and access semantics remain backend-specific.
> - **Storage is not access control** — the owner session namespaces writes but does not authorize reads of a locator."
> — `/tmp/deepseek-harness/packages/spill/spill/README.md:136-137`

> "The service is **retention-neutral**: resumed and forked sessions may share objects, so **reference-aware garbage collection is deferred rather than tied to one session's deletion**."
> — `/tmp/deepseek-harness/docs/subsystems/attachment.md:160`

### 6.8 Webhook

> "The runtime has **no queue, retry, deduplication, execution status, crash replay, Agent-status listener, or completion result**. **Repeated delivery may create repeated Sessions.**"
> — `/tmp/deepseek-harness/docs/subsystems/webhook.md:25`

### 6.9 Schedule

> "The narrow crash interval after admission but before durable dispatch can repeat reminder content after recovery, so the boundary is **best-effort at-least-once rather than exactly-once delivery**."
> — `/tmp/deepseek-harness/docs/subsystems/schedule.md:192`

### 6.10 MCP

> "The package bridges **tools only**; **MCP resources and prompts are unsupported**."
> — `/tmp/deepseek-harness/packages/mcp/mcp-client/README.md`（Summary）

---

## 证据清单（关键主张 → 出处）

| # | 主张 | 出处 |
|---|---|---|
| 1 | 「会话」对象就叫 `Session`，是 append-only 事件日志，唯一真相源 | `/tmp/deepseek-harness/docs/subsystems/session.md:5` |
| 2 | Agent 身份 = SessionId（1:1） | `/tmp/deepseek-harness/packages/core/agent/src/types.ts:14-15` |
| 3 | Session 是普通 class 不是 Service | `/tmp/deepseek-harness/docs/subsystems/session.md:391-395` |
| 4 | 事件溯源 + 拒绝可变消息数组的理由 | `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-11-event-sourced-sessions.md` |
| 5 | 持久单元就是 `SessionEvent`，无并行持久类型 | `/tmp/deepseek-harness/.agents/notes/implemented/architecture/2026-06-14-session-persistence.md` |
| 6 | 五方法 handle-based seam、单写者、freshness 语义 | `/tmp/deepseek-harness/docs/subsystems/persistence.md:341-400`；`.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.md` |
| 7 | JSONL 盘上布局与惰性物化 / fsync / 回滚 | `/tmp/deepseek-harness/packages/session/session-persistence-jsonl/README.md:60-78` |
| 8 | `root` 必填无默认及其理由 | `/tmp/deepseek-harness/docs/config-catalog.md:1929-1934` |
| 9 | append 同步、写后行批窗非配置、flush 是唯一耐久屏障 | `/tmp/deepseek-harness/docs/subsystems/persistence.md:66-73, :106` |
| 10 | 三个语义检查点 fail-closed | `/tmp/deepseek-harness/packages/session/session-checkpoint-policy/README.md:15` |
| 11 | `seq = log.length`、append 拒绝非无损 JSON | `/tmp/deepseek-harness/docs/subsystems/session.md:60, :521-546` |
| 12 | 压缩用 surface replace 遮蔽而非改日志 | `/tmp/deepseek-harness/docs/subsystems/compaction.md:11-17`；`docs/subsystems/session.md:150-169` |
| 13 | 崩溃不截断 turn + `interruptedTurnClosers` | `/tmp/deepseek-harness/docs/subsystems/persistence.md:110` |
| 14 | 格式迁移旁边发布、已提交代次永不改名/替换/删除 | `/tmp/deepseek-harness/docs/architecture.md:119` |
| 15 | 无删除/保留 API | `/tmp/deepseek-harness/packages/session/session-persistence/README.md:152`；`packages/session/session-persistence-jsonl/README.md:159` |
| 16 | archiveSession 只写 workspace 标记 | `/tmp/deepseek-harness/packages/workspace/workspace/src/index.ts:236-254` |
| 17 | Spill：0700 root、`wx`/0600 排他写、防符号链接 | `/tmp/deepseek-harness/docs/subsystems/spill.md:92` |
| 18 | Spill `cleanupPeriodDays` 默认 30、0 关闭、刻意保留 | `/tmp/deepseek-harness/docs/config-catalog.md:2230-2245` |
| 19 | fork 继承 spill locator 但不拷贝不重归属 | `/tmp/deepseek-harness/docs/subsystems/spill.md:30-38` |
| 20 | Attachment 内容寻址、耐久后才发引用、限额 | `/tmp/deepseek-harness/docs/subsystems/attachment.md:5-9, :71` |
| 21 | `SandboxMode` 三值、只管文件效果 | `/tmp/deepseek-harness/docs/subsystems/sandbox.md:11, :20` |
| 22 | `ApprovalPolicy = 'ask' \| 'never'`，`never` = 确定性拒绝 | `/tmp/deepseek-harness/packages/interaction/user-approval/src/index.ts:60`；`docs/subsystems/approval.md:40-46` |
| 23 | `ApprovalOutcome` 只有 `allowed-once`，无 always-allow | `/tmp/deepseek-harness/packages/interaction/user-approval/src/types.ts:32`；`docs/subsystems/approval.md:21-28` |
| 24 | 四个策略事件都是 log-only、last-wins、不进 transcript | `/tmp/deepseek-harness/docs/persistence-catalog.md:176-192, :560-571, :575-589, :629-651` |
| 25 | 默认 preset 表与 `custom` 派生态规则 | `/tmp/deepseek-harness/docs/subsystems/permission-presets.md:11, :33, :48, :66-68` |
| 26 | `tools/pre-execute` 生产环境消费者只有 3 个包（无内建规则引擎） | `/tmp/deepseek-harness/docs/event-producer-consumer.md:67` |
| 27 | guard 单调、无 allow、无法 force-allow | `/tmp/deepseek-harness/docs/subsystems/tools.md:313, :518-521` |
| 28 | hook 折叠 `deny > ask > allow` 且顺序无关；allow 不预批准 | `/tmp/deepseek-harness/packages/hooks/hooks-claude-code/README.md:95, :177` |
| 29 | 完整工具管道顺序与 deny/ask 分支 | `/tmp/deepseek-harness/docs/tool-execution-pipeline.md:8-44`；`docs/subsystems/tools.md:172, :364-390` |
| 30 | 转义：严格更宽、只放宽这一次、拒绝后不许再问 | `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md` |
| 31 | 转义是模型可见工具参数、capability 门控 | `/tmp/deepseek-harness/packages/fs/tool-fs/src/sandbox.ts:1-30` |
| 32 | 沙箱不可用 fail-closed（`SANDBOX_UNAVAILABLE`） | `/tmp/deepseek-harness/.agents/notes/implemented/feature/2026-07-06-sandbox.md` |
| 33 | 策略随「每次调用」走而非绑 provider | 同上 |
| 34 | `SessionHeader` 全字段（cwd/lineage/depth/preset） | `/tmp/deepseek-harness/packages/core/session/src/types.ts:93-130` |
| 35 | `workspaceRoot` 来自 session 的**不可变** cwd | `/tmp/deepseek-harness/docs/subsystems/sandbox.md:43` |
| 36 | fs-sandbox 只限写/改，保留本地读行为 | `/tmp/deepseek-harness/packages/fs/fs-sandbox/README.md:12` |
| 37 | agent-scope 两层扁平、不向 subagent 继承；restriction 取交集 | `/tmp/deepseek-harness/docs/glossary.md`（agent-scope 条） |
| 38 | scope 不是沙箱不是权限边界 | `/tmp/deepseek-harness/packages/core/scope/README.md:60` |
| 39 | preset standing mount / bind 语义 | `/tmp/deepseek-harness/docs/subsystems/core.md:543-560` |
| 40 | preset & skill 发现非记忆化，运行期可热变 | `/tmp/deepseek-harness/docs/subsystems/core.md:490` |
| 41 | MCP 只桥接 tools，默认无 server | `/tmp/deepseek-harness/packages/mcp/mcp-client/README.md` |
| 42 | 动态工具包 session 作用域但可影响同进程其他 session | `/tmp/deepseek-harness/packages/extensions/tool-cordis/README.md:59` |
| 43 | `AgentStatus` 只有 idle/running，disposal 不是第三态 | `/tmp/deepseek-harness/packages/core/agent/src/runtime-types.ts:109`；`docs/subsystems/core.md:146-154` |
| 44 | `TurnEndReasonMap` 六变体 + `interrupted` 只由崩溃恢复合成 | `/tmp/deepseek-harness/packages/core/session/src/types.ts:200`；`docs/subsystems/session.md:616-654` |
| 45 | `AgentCancelCause` 四值 + 持久 `legacy` | `/tmp/deepseek-harness/docs/subsystems/core.md:317-327` |
| 46 | 配置声明的 agent 随插件加载自动启动；`sessionId` 缺省每次新建 | `/tmp/deepseek-harness/packages/core/agent-loop/README.md:198` |
| 47 | webhook 创建根 Session 的完整序列 | `/tmp/deepseek-harness/docs/subsystems/webhook.md:23-31` |
| 48 | prepare/enter/announce 三步与回滚安全 | `/tmp/deepseek-harness/docs/subsystems/session.md:882-935` |
| 49 | `dispose()` 顺序与 capability 语义 | `/tmp/deepseek-harness/docs/subsystems/core.md:26-38` |
| 50 | 有序拆解要求：不能用 `ctx.sessions.create()` | `/tmp/deepseek-harness/docs/subsystems/session.md:862-870` |
| 51 | 持久血缘 ≠ 运行时所有权 | `/tmp/deepseek-harness/packages/core/agent/src/index.ts:593-594`；`.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md` |
| 52 | Activation 三态是派生的，不是第二套状态机 | `/tmp/deepseek-harness/docs/subsystems/subagent.md:140` |
| 53 | child-first 拆解；持久子 Session 存活于进程内拆解 | `/tmp/deepseek-harness/docs/subsystems/subagent.md:169-171` |
| 54 | `interrupt` 不等静默、保 inbox、不动后代 | `/tmp/deepseek-harness/docs/subsystems/subagent.md:157` |
| 55 | `fork()` 边界规则与拒绝开着的 turn | `/tmp/deepseek-harness/docs/subsystems/session.md:608-614` |
| 56 | `session/end-seed` 的存在理由 | `/tmp/deepseek-harness/docs/subsystems/session.md:661-670` |
| 57 | 投影 seam：同步 apply、纯 JSON state | `/tmp/deepseek-harness/docs/subsystems/session-projection.md:5-15`；`docs/architecture.md:123` |
| 58 | goal activation 刻意不进持久重放 | `/tmp/deepseek-harness/docs/glossary.md`（goal activation 条）；`docs/subsystems/goal.md` |
| 59 | 遥测边界公理 + best-effort + 去重键 | `/tmp/deepseek-harness/docs/subsystems/session-telemetry.md:5, :58` |
| 60 | 匿名 per-home id，非用户身份 | `/tmp/deepseek-harness/packages/identity/anonymous-user-id/README.md` |
| 61 | Web 承载层无 TLS/认证/Origin 策略 | `/tmp/deepseek-harness/docs/subsystems/web-server.md:47` |
| 62 | SAFETY.md 三条免责 | `/tmp/deepseek-harness/SAFETY.md:7, :13, :15` |
| 63 | Session 格式版本 3 与发布记录 | `/tmp/deepseek-harness/packages/core/session/src/types.ts:88`；`docs/session-format-status.md:33-35` |

---

## 未能查证的

1. **DSH 有没有跨进程/跨设备的会话同步或租约协议的具体设计**。查了 `packages/session/*`、`packages/subagent/subagent/README.md`、`docs/subsystems/persistence.md`。只查到**明确的否定**：跨进程写排他是 provider 特定的（JSONL 用 `flock`/Windows 命名信号量），可续 subagent 的 Activation 与所有权图「不协调两个 harness 进程」，「需要一个持久邮箱和跨进程租约协议」——**都被列为未来工作，没有设计文档**。

2. **`session.search`/`list` Remote 里「authorized」到底指什么授权**。`/tmp/deepseek-harness/docs/subsystems/session.md:733, :802` 出现 "authorized bounded Session search results" 和 "identities used for authorization"，我 grep 了 `docs/subsystems/session-query.md` 与 `docs/subsystems/session.md` 全文，只找到「attachment 必须被证明可从被寻址的 Session 日志到达」这一条具体规则；更一般的 Session 读授权模型我没有在 `packages/api/session-controller/src/` 里逐文件追下去。

3. **`ctx.approval` 的 answerer 链在生产组合里具体由谁实现、UI 侧的「记住这个选择」有没有另一条路径**。我确认了 `ApprovalOutcome` 里没有 always-allow，也确认了 `packages/client/ui-approval` 存在，但没有读它的客户端实现来排除「UI 自己维护一个本地记忆并自动回答」这种可能。这是我在权限维度上最不确定的一点。

4. **`e2b` 远程沙箱与会话生命周期的绑定关系**。我只看到 `timeoutMs`（"E2B sandbox lifetime in milliseconds; expiry always deletes the sandbox"，`/tmp/deepseek-harness/docs/config-catalog.md:554`），没有查证这个 TTL 与 session 生命周期是否关联。

5. **`agent-team`（实验性 Agent Teams）在会话层引入了什么**。`docs/subsystems/agent-team.md` 我只读到 `architecture.md:131` 的一句转述（「发布的 opt-in 协调 seam，`ctx.agentTeams`，带持久名册、任务板和邮箱，叠在可续 subagent 之上」），没有展开读。如果需要「会话之上的多 agent 组织结构」这一层，这份文档是缺口。

6. **两个并行只读子调研（权限治理细节、感知域细节）截至本报告交付未返回。**上文第 2、3 节全部由我本人一手读取并逐条给出出处，不含它们的结果，也不含对它们结果的任何预测。

---

# 补遗：权限治理与感知域子线程结果（交付后追加）

> 上文「未能查证」第 6 条提到的两个子调研在主报告交付后返回，带来**一处对正文的修正**和一批新证据。
> 以下只写新增/纠正内容，不重复正文。路径相对 `/tmp/deepseek-harness`（同一 commit `c291e796`）。

## A. 对正文的一处修正

正文说默认 preset 表是两项（`workspace-write` / `danger-full-access`）——那是 `dsh-permission-presets` 的**代码默认值**
（`packages/interaction/permission-presets/src/index.ts:165-176`）；**`dsh-base` bundle 把它覆盖成三项**
（`packages/bundle/base/cordis.patch.yml:229-241`）：`read-only`(read-only+ask)、`workspace-write`(workspace-write+ask)、
`danger-full-access`(danger-full-access+never)。**CLI/Web 用户实际看到三档，中间那档在代码默认表里不存在。**

另有 `DSH_PERMISSION_MODE` 环境变量通过 `!!js` 表达式喂进 base bundle 的组合期默认值（`cordis.patch.yml:211,227`），**不是会话级开关**。

## B. 权限治理：新证据

**B1. 「never 不可绕过」的精确机制**：它是**服务方法体内的一条分支，不是监听器**，所以 `prepend:true` 也插不到前面。
`packages/interaction/user-approval/src/index.ts:260-268` 的注释本身就是论证：

> "The 'never' policy is decided HERE, before any dispatch: a listener registered with `prepend: true` after this service mounts would sit ahead of any gate LISTENER, so a listener-shaped gate cannot keep the documented promise... only the service's own request path can."

且**没有对称的 force-allow**。

**B2. sandbox mode 合成是纯覆盖，不是取交集**（正文未说清）。`packages/sandbox/sandbox-policy/src/index.ts:163-170`：
`mode = request.mode ?? overrideOf(session) ?? defaultMode`。
**单次批准的显式 mode 可以比会话 mode 更宽**——这正是 escalation 的用法。
唯一收窄规则是一张显式「更宽」表 `WIDER_MODES`（`packages/sandbox/sandbox/src/escalation.ts:28-31,162-164`），
且检查在**执行期**而非 schema 期，理由（`escalation.ts:22-27`）：

> "schemas are registry-global while the effective mode is per-call truth"

非加宽请求**直接 throw、不弹任何提示**（`:152`「A non-widening request never prompts a human.」）。

**B3. `tools.restrict` 跨 scope 链取交集的实现位置**：`packages/core/tools/src/index.ts:1159-1164`

> "Restrictions intersect across the whole chain: any scope on it may mask an inherited name for everything nested inside it."

且 `restrict()` 拒绝在全局 context 注册（`:1061-1066`）。

**B4.【重要，正文未覆盖】没有项目级权限层，而且是被硬拦住的。**
`DSH_` 是 bootstrap-only 前缀，任何 `.env` 文件设它都在启动时硬抛（`packages/boot/app-boot/src/index.ts:176-182`）。
理由见 `docs/user/guide/network-proxy.md:14`：

> "A project's own `.env` cannot set them: it arrives with `git clone`, and **DSH refuses to start rather than let a repository decide where your traffic goes.**"

即 `DSH_PERMISSION_MODE` **不能被 clone 下来的仓库设置**。唯一的项目级目录是 skills 的 `<projectRoot>/.dsh/skills`，与权限无关。
这与正文「持久状态全压进会话日志」是同一取舍的两面：**没有跨会话的持久授权，因为压根没有能装它的容器。**

**B5.【正文未覆盖】子 agent 的审批被钉死为 never。**
`packages/subagent/subagent/src/child-agent.ts:220-247`：`approvalPolicy` 在 approval capability 组合时**恒为 `'never'`**。
`:234-238` 注释：只捕获父会话的 explicit sandbox override，**绝不捕获部署默认值或一次性授权**。

决策注记 `.agents/notes/implemented/feature/2026-08-10-subagent-approval-pinned-never.md` 的 Decision 段一句话概括整个模型：

> "The child's whole permission story is therefore its sandbox scope: a `danger-full-access` parent delegates children that need no approvals,
> a `read-only` parent delegates children with no escape hatch, and **a widening decision always belongs to the parent side.**"

Problem 段：在 `ask` 的父下，后台子的 escalation 会变成**没有任何产品界面显示的挂起**问题，
于是「权限受阻的子」与「正常工作的子」无法区分。
该注记自称 supersede 了 `2026-07-25-subagent-policy-inheritance.md` 的 approval 部分——**说明这条设计反转过**。

**B6.【正文只说「不存在」，这是拒绝理由】`allow_always` 是明确拒绝而非遗漏。**
`packages/interaction/user-approval/README.md:155` 列为限制。设计注记 Alternatives：

> "Offering `allow_always` now — **rejected**: the protocol can express it, but honoring it means designing **grant storage, scope identity, and revocation**.
> **Advertising an option the harness cannot honor manufactures doomed grants.**"

Deferred 段列出未解难题：**scope identity 到底是 call? path? prefix? session? time window?**
（`.agents/notes/implemented/feature/2026-07-06-sandbox.md:87` 记录了同一个开放问题。）

**B7. 审批审计物理上不可能被复用成授权**：`approval/asked` 的 payload 是 `{id, toolName, callId?, reason?}`，**不含工具参数**
（`docs/subsystems/approval.md:53` 说理由是 UI 通过 `callId` 挂到已流式呈现的 tool call 上，避免第二份可能漂移的副本）。
后果：**这份审计不包含足以判定「同一个动作」的信息。**
另：审批请求必须在开启的 turn 内，否则在写审计之前就 throw（`user-approval/src/index.ts:77-85,210-216`），
错误文案理由是「a bare event between turns is crash-tail garbage on reload」。

**B8. answerer 之间没有优先级机制，且是已接受的代价。** README:32「sibling listener order is not a policy-priority mechanism」；
设计注记 Consequences：「Two decide-eager answerers race for the slot... mitigated by convention rather than a priority mechanism the event bus does not have.」
生产环境 answerer 只有两个：ACP 桥（`packages/acp/acp/src/index.ts:155-174`，options 硬编码为 `[allow-once, reject-once]`，
未知 optionId 一律映射为 rejected，注释：「never infers a durable grant from an unknown client response」）
和浏览器 UI（`packages/client/ui-approval/README.md:34`「exposes transient decisions only」）。

**B9. 外部子 agent 驱动确实有 bypass 模式，但那是透传给对方 CLI**：
`subagent-claude-code/src/run.ts:44-56`、`subagent-codex/src/wire.ts:32-43`、`subagent-acp/src/index.ts:45`。
**DSH 自身治理路径 grep `yolo|bypass|auto-approve|full-auto` 零命中。**

**B10. hooks 层额外缺口**：`packages/hooks/hooks-claude-code/README.md` 的 Known Limitations 明说
不支持 Claude Code 30 个 hook 事件中的 23 个，其中包括 `PermissionRequest` 和 `PermissionDenied`；
mapped payload 省略 `permission_mode`（**hook 拿不到当前权限模式**）；
「Claude Code's layered project, user, plugin, and policy discovery and live reload are not implemented」。
代码里还有 TODO（`hooks-claude-code/src/index.ts:188`）：`continue:false` 目前只记录不生效。
折叠实现在 `packages/hooks/hook-protocol/src/merge.ts:35-42,71-73`（`deny|block→3, ask→2, approve|allow→1, 无决策→0`，取 max）。

**B11. 命名陷阱**：`packages/guard/` **不是**权限 guard 目录，`README.md:12` 说它是「loop-hygiene guard family」（重复调用提醒 + 超时策略）。
真正的权限 guard 是 `ctx.tools.guard()`（`packages/core/tools/src/index.ts:1091-1117`）。

## C. 上下文感知域：新证据

**C1. 会话创建请求的完整字段集只有 4 个**（`packages/api/session-controller/src/types.ts:265-270`）：
`workspaceId?` / `cwd?` / `sessionId?` / `agentPreset?`。`workspaceId` 与 `cwd` 互斥。
**没有 MCP、数据源、知识库字段。**「数据源/知识库」在 DSH 里不是一等概念——**没有 vector store / embedding / RAG**。
唯一沾边的是挂第三方 memory MCP server，且责任划得很清（`docs/user/guide/mcp-memory.md:11`）：

> "DSH does not download the server, initialize its database, choose its model or embedding provider, create a cloud account, migrate vendor data, or supervise a separate HTTP service."

**C2.【正文未查到】preset 只能在「什么都还没产出」的会话上切。** `packages/preset/agent-presets/README.md:82`：

> "A session can switch to a different preset **only while it has produced nothing** — no messages or tool calls.
> After that, the composition is fixed for the session's life, because **swapping tools mid-conversation would leave logged tool calls the new composition cannot make.**"

**C3. 读完全没有边界**——子调研给出了远更多证据点：

- `packages/fs/fs-local/README.md:129`（同文 `:32`、`:93` 重复三次）：
  > "`config.cwd` **is not a sandbox** — it is a resolution default, not containment: absolute paths and `..` escape it."
- `packages/fs/fs-sandbox/README.md:28`：「while reads stay unconfined」
- GUI 文件服务同样：`packages/api/workspace-files/README.md:12`「File reads may target paths outside the workspace」、
  `:42`「does not impose workspace containment on file reads」
- 最直白：`packages/api/workspace-files/README.md:79` 给出的**合法地址示例**是 `dsh-resource://file/session/s//etc/hosts`
- `docs/user/guide/python-sdk.md:147`：「it does not confine access to that directory」

并且 **`fs-sandbox` 默认不装**：`packages/fs/tool-fs/README.md:35-38` 的最小组合用 `dsh-fs-local`（完全不受限）；
`fs-sandbox` 还硬依赖 `ctx.sandboxPolicy`——「the backend does not confine without it composed」(`README.md:125`)。

**C4.【正文未找到】会话级 MCP 挂载只有 ACP 一条路。**
`packages/acp/acp/src/mcp.ts:26-33` 在 setup 窗口内用 `agentCtx.plugin(McpClient, config)` 逐个挂。
stdio server 的 cwd 强制成会话 cwd，`failOnStartupError:true`，命令必须绝对路径（`mcp.ts:45-57`）。
resume 时 MCP 是当次请求现给的，**不从持久化恢复**（`session.ts:143` 注释）。
关键：DSH **没有为 MCP 造注册表 service**，而是「一个 Cordis 插件实例 = 一个 server」；
好处是作用域/生命周期/HMR/disposal 全免费继承插件语义，代价是**没有统一的「当前挂了哪些 server」查询面**
（`packages/mcp/mcp-client/README.md:130` 自陈）。stdio 子进程环境从 `scrubbedParentEnv()` 起步，
匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的名和所有 `DSH_*` 被丢弃（`:138`）。

**C5. preset standing mount = 同 preset 的会话共享 MCP 连接与 skill 注册。** `packages/preset/agent-presets/README.md:100`：

> "One standing composition per preset. A preset is mounted once per process under a standing scope; agents join by parenting their scope key to it..."

即 **preset 内部没有会话隔离**，是刻意的资源取舍（一个 MCP 子进程服务多个会话）。

**C6.【补上正文「未能查证」第 4 条】E2B 远程沙箱是进程全局共享，不是会话级。**
`packages/e2b/e2b/README.md:12`「one shared remote Linux sandbox」；
`:77`「One sandbox, one handle. All adapters await the same `getSandbox()` promise, so filesystem and process operations share one remote Linux world.」
→ **多个会话共用同一个远程世界，互相可见对方写的文件。**

**C7. 唯一「感知域随 agent 活动自动扩张」的机制及其漏洞**：`packages/context/agent-instructions/README.md:38`——
read/write/edit 触及更深目录后，下一次请求带上新适用的指令文件（**只扩张指令文件，不扩张访问权**）。
漏洞（同文 `:218`）：

> "Symlinked instruction files are followed across the trust boundary — a candidate whose final component is a symlink is resolved and its target loaded,
> so a cloned repository can surface off-tree file content as lower-authority workspace guidance."

**C8. 多根/多目录：四处明文不支持。**
`packages/acp/acp/README.md:169`「**One primary workspace** — additional directories remain unsupported.」；
`packages/sandbox/sandbox-policy/README.md:147`「**One primary workspace root per session** — extra writable roots are not part of `SandboxExecutionPolicy`.」；
`packages/host/directory-picker/README.md:101`「No multi-root support」+ `directory-picker-browse/README.md:112`
「Whole-filesystem scope — there is no per-deployment browse-root restriction... a root here would be UX scoping rather than a security boundary.」

**C9. `web_fetch` 不受任何沙箱/审批档管辖。** `docs/subsystems/web.md:129`：

> "The shipped Cordis, Code, and Standard presets expose `web_fetch` **in every sandbox and approval mode without per-call confirmation**.
> File sandbox presets do not govern Web network access."

`:131`：「These checks prevent SSRF access to non-public destinations but **do not stop a model from sending data to a public URL**.」
合起来：**读无边界 + web_fetch 全模式免确认 + 网络不在沙箱词汇表内 = 一条 DSH 文档自己承认没堵的数据外泄路径。**

**C10. skills 根的精确层级**（`docs/subsystems/skills.md:70-75`）：
`<projectRoot>/.dsh/skills`(100) / `<projectRoot>/.agents/skills`(200) / `Config.customSkillDirs`(300) /
`<dshHome>/skills`(400) / `<agentsHome>/skills`(500) / `Config.bundledSkillDir`(600)。
`projectRoot` = 最近含 `.git` 的祖先，否则当前 cwd(`:77`)。
明确不做：`:87`「Nested recursive `**/SKILL.md` discovery is not supported.」；`:77`「does not synthesize built-in system skills」。

## D. DSH 自身文档的一处口径冲突（值得知道）

`agent-scope` 到底是「两层扁平」还是「有父链继承」，**三处说法不一致**：

- `docs/glossary.md:13`：「**Two levels, flat**: scoped registrations do not inherit down to subagents」（正文引的是这句）
- `packages/core/scope/README.md:66-68`：「registration views **inherit DOWN the chain** (a child scope sees its ancestors' layers), while event admission extends UP it」，且 `scopeChainOf` 返回 `[key, parent, …]`
- `docs/subsystems/tools.md:155`：「the deployment-global layer **plus every ancestor scope on its chain**」

**【推断，未查证】** glossary 的「two levels, flat」是早期设计残留，父链是后来为 agent preset 的 standing mount 引入的。
这对理解隔离模型有实际影响：若父链继承成立，「preset 层 → agent 层」是两级继承，restrict 在链上取交集（见 B3），与 glossary 的扁平模型不同。
**引用这一条时必须避开，或先自行核对源码。**

## E. 两份子报告各自的「未能查证」（叠加到正文那一节）

**权限侧**：CLI 是否有终端 answerer（只确认 ACP + 浏览器 UI 两个）；`hooks-codex` 是否也产 ask；
`dsh-tool-fs` 的 escalation `subject:'operation'` 路径未逐行读；`session/end-seed` 与 fork/resume 的权限继承
（`pinInitialPermission` 三分支只读了描述）；未核对 git 史。

**感知域侧**：`.agents/notes/` 下若干被反复引用的设计记录未读
（`2026-07-08-agent-scope-contexts.md` 标题即「the security non-goals and context design」、
`2026-07-14-cross-family-fs-sandbox.md`、`2026-07-07-mcp-client-plugin.md`）；
`packages/core/scope/src/` 实现未读；`fs-sandbox` 的 canonicalize 代码未读；
CLI 启动参数未查（`dsh` 有没有 `--cwd` / `--add-dir` 之类开关未验证，只验证了 Remote/程序化创建面没有）。