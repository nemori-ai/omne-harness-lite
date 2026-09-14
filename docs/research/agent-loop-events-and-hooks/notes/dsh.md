<!-- 分系统核对笔记：DeepSeek Harness。2026-09-14 由只读调研 subagent 按固定提交/版本产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# DeepSeek Harness（DSH）Agent Loop / 事件 / Hooks 调研笔记

- 来源仓库：`github.com/deepseek-ai/deepseek-harness`
- 固定提交：`c291e7961a515f6d7af9304e7fd1d257929aef26`（2026-09-10，"Merge pull request #3977 … release-0.1.5-sync-master"）
- 当前 `origin/master`：**与固定提交相同**（`git rev-parse origin/master` = c291e79，`c291e79..origin/master` 为 0 个提交，核对日期 2026-09-14）。因此本主题不存在"master 与固定提交的实质差异"。
- 包版本：`@deepseek-ai/dsh-agent` / `dsh-agent-loop` 均为 `0.1.5-rc.2`；vendored Cordis `4.0.2`（`vendor/cordis/package.json@c291e79`）。本项目 `packages/agent/provenance.json` 记录的原件来源提交与版本一致。
- 引用格式：`路径@c291e79`。标注「推断」= 仅由源码/测试推出，文档未直述；「未覆盖」= 未读到或未找到。
- 克隆目录：仓库 Git 忽略的临时目录（可按固定提交重新克隆）。

---

## 1. 总体架构定位

### 1.1 层次关系

| 层 | 内容 | 依据 |
|---|---|---|
| Cordis 内核（vendored 4.0.2） | 插件 = 实现 `Service` 的对象/函数；Context 是服务仓库（`ctx.<key>`）；`inject` 声明依赖决定加载顺序；类型化事件五种分发模式；注册即可逆效果（`ctx.effect()` / `ctx.on()`）。Fiber 状态机 `PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED`（`↘ FAILED`）。 | `docs/cordis-primer.md@c291e79`；`docs/cordis-tutorial/02-lifecycle-and-effects.md@c291e79`；`vendor/cordis/src/fiber.ts@c291e79`（`FiberState` 枚举） |
| DSH 产品 = 插件树 | "There is no privileged core to patch"：模型适配器、工具注册表、Session 日志、Agent Loop 本身都是插件，按 profile + bundle + `cordis.patch.yml` 分层装配。 | `docs/architecture.md@c291e79` §Cordis / §Profiles and bundles |
| `core/session`（`ctx.sessions`） | 追加式 `SessionEvent` 日志 + 内存 store，模型历史由 `deriveMessages()` 从日志派生，"Model-visible means logged"。 | `docs/architecture.md@c291e79` §Session log；`docs/subsystems/session.md@c291e79` |
| `core/system-prompt`（`ctx.systemPrompt`） | 提示词 section / 动态 context / 工具 schema / 变量的注册与装配。 | `docs/subsystems/system-prompt.md@c291e79` |
| `core/tools`（`ctx.tools`） | 作用域化工具注册表 + 受守卫的执行管线。 | `docs/subsystems/tools.md@c291e79` |
| `core/agent`（`ctx.agents`） | `Agent` 接口、活体注册表、initiator 作用域、`agent/*` 事件词汇；不含具体循环。 | `docs/subsystems/core.md@c291e79` |
| `core/agent-loop`（`ctx.agentLoop`） | `Agent` 契约的唯一具体实现（`ReactLoopAgent`），通过 `ctx.agents.setFactory()` 注册为工厂；扩展插件只依赖 `agent`，不依赖 `agent-loop`，使循环可替换。 | `docs/subsystems/core.md@c291e79` §The spine；`packages/core/agent-loop/README.md@c291e79` |
| `core/scope` | 无依赖库 `createScope/scopeOf/scopeTarget`，实现按 Agent 的作用域注册与作用域过滤事件。 | `docs/subsystems/scope.md@c291e79`；`packages/core/scope/README.md@c291e79` |
| `llm/llm`（`ctx.llm`） | Message/StreamChunk 词汇、`llm/stream` waterfall、`prepareCall()`、adapter seam。 | `docs/subsystems/llm-streaming.md@c291e79` |

关系摘要：Agent = Session 驱动器；一个 `SessionId` 同时是 Agent id 与 Session id（`Agent.id: SessionId`，`docs/subsystems/core.md@c291e79`）。Agent 拥有 `agent.ctx`（作用域化 Context），在其上注册的工具/提示词/监听器仅对该 Agent 可见并随其销毁卸载。

### 1.2 一次用户输入到回复的完整路径

`docs/agent-lifecycle.md@c291e79`（生成的时序图）与 `docs/architecture.md@c291e79` §Turn flow：

1. 消费者调用 `agent.followup(message)`（= `send(message,'next-turn',true)`），消息写入 inbox（durable `agent/inbox/spliced` 事件 + 活体 `agent/inbox/inserted`），唤醒 driver → `agent/status` = `running`。
2. driver 追加 `turn/start`；原子地 claim 全部 `next-step` 输入 + 一条 `next-turn` 消息（发 `agent/inbox/claimed`）。
3. `ctx.systemPrompt.assemble()`（内部跑 `system-prompt/assemble` waterfall）→ 投影 runtime context → `agent/pre-step` waterfall 决定 `reject | enter(messages)`。
4. 进入：追加 `step/start` → `agent/request` waterfall → `ctx.llm.prepareCall()` → 同步把渲染后的提示词对账为 `system/message` 节点、追加 `user/message`（仅首次尝试）、按需 `request/header` / `request/context` → 从日志派生并冻结请求。
5. `llm/stream` waterfall → adapter 流；每个 chunk 发 `agent/assistant-stream`；结束时追加 `assistant/message`（成功）或 `assistant/attempt`（失败/取消）。
6. 有 tool-call：每个调用追加 `tool/call` → `tools/pre-execute` → guards → `tools/execute` → 工具体 → `tools/post-execute` → `finalizeContent` → `tools/result` → 追加 `tool/result`。
7. 追加 `step/end`。若还欠模型响应（有工具结果）或 `next-step` inbox 有输入 → 回到 3（`target='next-step'`）；否则 `agent/turn-stopping`（serial）→ 若无人 steer → 追加 `turn/end` → `agent/status` = `idle`。

---

## 2. Agent Loop

### 2.1 循环步骤（源码级）

驱动器 `ReactLoopAgent`，位于 `packages/core/agent-loop/src/agent.ts@c291e79`：`kick()`（L225）`while (await this.turn()) {}`；`turn()`（L269）；`preStep()`（L240）；`step()`（L352）；`prepareRequest()`（L501）；工具调度 `packages/core/agent-loop/src/tool-calls.ts@c291e79` `executeToolCalls()`。

| 阶段 | 具体动作 | 依据 |
|---|---|---|
| 唤醒 | `send()` 把消息 splice 进 inbox；`wakeup=true` 时 `wakeDriver()`：若 idle → `setPhase(running)` 并在 `ctx.agents.withInitiator(this, () => this.kick())` 内跑；若在 maintenance 或已 abort 的活动中 → 只置 `wakeRequested` 闩，收敛后重放。 | `agent.ts@c291e79` L128-147, L180-208 |
| 开启 turn | `session.append('turn/start',{turn})`；`target='next-turn'`。 | `agent.ts@c291e79` L269-281 |
| 组装上下文 | `preStep()`：`inbox.claim(target, turn)`（纯删除 splice + 每条 `agent/inbox/claimed`）→ `systemPrompt.assemble(assembleContextFor(agent, signal))` → `renderContextSections` / `runtimeContext.project(...)`（动态 runtime context 变化时形成一条 plugin-sourced `user/message` 快照）→ `agent/pre-step` waterfall，默认决定 `{kind:'enter', messages: claimed (+ context)}`。 | `agent.ts@c291e79` L240-260；`packages/core/agent-loop/src/runtime-context.ts@c291e79` |
| 无步骤关闭 | `reject` → `turnEnds={kind:'blocked'}`；首个 batch 为空 → `{kind:'completed'}`，均不开 step。 | `agent.ts@c291e79` L286-296 |
| 模型调用 | `step()`：每次尝试 `prepareRequest()`（`agent/request` waterfall → `ctx.llm.prepareCall()`；`NO_ADAPTER` 时允许中间件供路由）→ `systemPrompt.project(renderedPrompt,{inHistory,startsSeries})` 生成 `system/message` 提交 → 首次尝试追加 `user/message` → `buildRequest()`（`header.config` + `deriveMessages()` + `header.tools`，无 `system` 字段）→ `preparedCall.stream(request)` 或 `ctx.llm.stream(request)` → 逐 chunk `live.push()` 并 emit `agent/assistant-stream`。 | `agent.ts@c291e79` L352-410, L501-545；`packages/core/agent-loop/README.md@c291e79` §Turn and step flow |
| 解析工具调用 | `assistant/message` 提交后 `toolCalls = message.content.filter(type==='tool-call')`；无则 step 返回 `{kind:'completed'}`。 | `agent.ts@c291e79` L485-487 |
| 执行工具 | `executeToolCalls(loopCtx, turn, step, toolCalls, signal, acceptContext)`；结果的 `additionalContexts` 通过 `acceptContext` 追加到 `next-step` inbox；`concludesTurn` → step 返回 `completed`，否则返回 `null`（继续）。 | `agent.ts@c291e79` L488-493；`tool-calls.ts@c291e79` L37, L157-158 |
| 写回 | 一切模型可见事实都先 `session.append` 再派生下一步请求；`step/end` 在 `finally` 中追加。 | `agent.ts@c291e79` L305-312 |
| 继续/结束判定 | 见 2.2。 | |

### 2.2 终止条件

`turn()` 内循环（`agent.ts@c291e79` L282-320）：

| 条件 | 结果（`turn/end.reason`） |
|---|---|
| `agent/pre-step` 返回 `reject` | `blocked`，无 step |
| 首 step 的 enter 消息为空 | `completed`，无 step |
| step 返回 `completed`（无 tool-call，或某工具结果 `concludesTurn`）且 `inbox.nextStep` 为空 | 先 `serial('agent/turn-stopping')`，再检查 nextStep 仍为空 → break → `completed` |
| step 命中 `finish.kind==='max-tokens'` | `max-tokens`，且"粘性"：后续 step 完成也不降级 |
| 有 tool-call 且未 `concludesTurn`（step 返回 `null`），或 nextStep 非空 | 继续下一 step，`target='next-step'` |
| turn 结束后 `inbox.hasPending` | 新建 `AbortController`，`turn()` 返回 `true` → 下一 turn |
| signal aborted | `aborted { reason: AgentCancelCause }`，异常向上抛 |
| 其他异常 | `error { error: LlmFailure | {message, code:'UNKNOWN'} }`，emit `agent/error` |

`TurnEndReasonMap` 定义见 `docs/subsystems/session.md@c291e79` §Why a turn ended：`completed | aborted | blocked | error | max-tokens | interrupted`（`interrupted` 仅由崩溃恢复合成，循环从不发出）。**没有内置 turn 预算 / 最大步数**："No built-in turn budget — … a policy that bounds runaway turns must cancel from … `agent/turn-stopping`"（`packages/core/agent-loop/README.md@c291e79` §Known Limitations）。

### 2.3 并行工具调用

- 配置 `maxParallelToolCalls`（默认 10，`1` 即串行），也是 `agent-loop` settings 段，可在用户层热改（`packages/core/agent-loop/README.md@c291e79`）。
- 分类：`ctx.tools.executionMode(exec)` 只有定义了 `isConcurrencySafe(args)` 且返回精确 `true` 才为 `parallel`；未知/隐藏/未声明/抛错一律 `exclusive`（fail-closed）（`docs/subsystems/tools.md@c291e79`）。分类是一元的，依赖兄弟调用比较的安全性必须保持 exclusive。
- 调度：exclusive 调用形成屏障；parallel 调用用有界滚动池（`inFlight.size < maxParallelToolCalls`），启动前重新分类；**分发可重叠，但 pre 策略、durable 结果与结果上下文保持模型顺序**（"ordered pre, concurrent execute … ordered post"）。`tool/call` 在启动时记录，`tool/result` 按模型顺序在 post 后记录（`tool-calls.ts@c291e79` 头注释与 L200；`docs/agent-lifecycle.md@c291e79`）。
- 取消：未分发的调用得到合成 `tool/call` + `ABORTED_BEFORE_DISPATCH` 结果对；已启动的被 drain（`tool-calls.ts@c291e79` L257；README §Failure and cancellation）。

### 2.4 错误与重试

| 层 | 机制 | 依据 |
|---|---|---|
| Adapter | 一次 adapter 调用 = 一次 provider 尝试，库级重试禁用；两条失败路径（throw 或 in-band `finish{kind:'error'|'aborted', failure}`），统一 `LlmFailure {message, code, status?, providerRetryAfterMs?, requestId?}`；空补全 → `EMPTY_RESPONSE`（可重试）；上下文溢出 → 规范码 `CONTEXT_WINDOW_EXCEEDED`；流空闲看门狗默认 5 分钟 → `TIMEOUT`。 | `docs/subsystems/llm-streaming.md@c291e79` §The adapter contract、§LlmFailure |
| Loop | 失败尝试先记 `assistant/attempt`（不进模型历史），再 `waterfall('agent/request-error', {turn, step, provider, failure, retryPolicy, signal})`；监听器返回 `{kind:'retry'}`（不调 `next()`）→ `continue` 在**同一开放 step** 内重试：重跑 `prepareRequest` + 提示词对账，但**不重复 assemble、pre-step、user 追加**；返回 `undefined` → 抛 `LlmError`，turn 以 `error` 结束。 | `agent.ts@c291e79` L438-460；`docs/subsystems/core.md@c291e79` §Interception decisions |
| `dsh-llm-retry` 插件 | `agent/request-error` 的执行器；策略来自各 provider adapter 的 `retryPolicy`（`ResolvedRetryPolicy`：`normal` 有限 `maxRetries`（默认 5）+ `retryableCodes` + 退避；`always` 无限）；计划的重试先写入日志（`llm/retry` 事件）再退避。 | `packages/llm/llm-retry/README.md@c291e79`；`docs/subsystems/llm-streaming.md@c291e79` §ResolvedRetryPolicy |
| 工具 | 工具体抛错/未知工具都变成结构化 `isError` 结果（`UNKNOWN_TOOL`、`INVALID_ARGS`、`INVALID_TOOL_OUTPUT`…），**不结束 turn**；但 middleware / 结果处理 / 扩展点自身抛错会直接关闭 turn（"plugin failure ends the turn, not the loop"）。 | `docs/subsystems/tools.md@c291e79`；`packages/core/agent-loop/README.md@c291e79` §Failure and cancellation |

### 2.5 取消与中断

- API：`agent.cancel(cause, {keepInbox?})`；`cause ∈ {user | parent | hook{reason} | disposed}`。实现：非 `keepInbox` 则 `inbox.clear()`（durable 取消 splice + `agent/inbox/discarded`）并清 wake 闩；若有活动阶段则 `abort.abort(cause)`；无活动则 no-op、不预装后续（`agent.ts@c291e79` L149-155；`docs/subsystems/core.md@c291e79`）。
- 传播：每个 turn 一个 `AbortController`；`signal` 传给 `agent/pre-step`、`agent/request`、`prepareCall`、流迭代、工具 `exec.signal`、`agent/turn-stopping`。流被中断时把已交付前缀作为 `assistant/message { interrupted: true }` 追加（保留用户已看到的文本），无内容则记 `assistant/attempt`（`agent.ts@c291e79` L392-430）。
- `turn/end` 记为 `{kind:'aborted', reason: cause}`。取消后到达的唤醒输入被归入 `next-turn`，在收敛到 idle 后运行；`disposed` 取消则停车（`docs/subsystems/core.md@c291e79` `send()` JSDoc）。
- 超时：**循环本身无 turn/step 超时**。工具级 `timeoutMs` 由 `dsh-tool-call-timeout-policy`（`tools/execute` 包装器，协作式，不能硬杀）执行；模型流由 adapter 的 `streamIdleTimeoutMs` 看门狗兜底（`packages/guard/timeout-policy/README.md@c291e79`；`docs/subsystems/llm-streaming.md@c291e79`）。
- `whenIdle()` 等待整个 Agent 活动静止；`runMaintenance(task)` 在真正 idle 时同步占据 `maintenance` 阶段（状态对外仍 `idle`），期间唤醒被闩住（`agent.ts@c291e79` L157-178）。

### 2.6 上下文压缩（compaction）

- 是**可选能力 seam**（`ctx.compaction`），不在 loop 主干（`docs/subsystems/compaction.md@c291e79`）。
- 触发（`dsh-compaction-basic`）：(a) **压力**——在 `agent/pre-step` waterfall 内、请求派生前，按最近一次 durable `request/context.contextWindow × thresholdRatio`（默认 0.8）判断，保留最新 `retainRatio`（默认 0.16）；(b) **溢出恢复**——`agent/request-error` 收到规范码 `CONTEXT_WINDOW_EXCEEDED` 时压缩并返回 `retry`（仅当 surface 替换代数推进）；(c) 手动 `/compact` → `compactNow()` 作为 agent maintenance 在 turn 之间运行；(d) 可选先跑 `ctx.toolResultPruner` 修剪工具结果（`docs/subsystems/compaction.md@c291e79`；`packages/compaction/compaction-basic/README.md@c291e79`；`docs/agent-lifecycle.md@c291e79` 尾注）。
- 落盘形态：`compaction/start` / `compaction/summary` / `compaction/end` 三个 log-only 事件做锁与审计，摘要本身是一条 `user/message`，`surfaceOp: {op:'replace', startSeq, endSeq}` 遮蔽旧区间——这是摘要压缩对 surface 的唯一改动；边界保持 tool-call/result 配对但不要求整 turn。
- 与 loop 的耦合：surface `replaceGeneration` 变化 → 下一请求开启新 request series（`agent.ts@c291e79` L360-366），系统提示词在头节点合并。

### 2.7 Steering / inbox

- 两个有序待处理列表 `nextTurn` / `nextStep`，作为 durable 投影（`agent/inbox/spliced` 事件 + `inbox` projection）（`docs/subsystems/core.md@c291e79` §Inbox）。
- `followup()` → `next-turn` + 唤醒（独占自己的 turn）；`steer()` → `next-step` + 唤醒（运行中的 driver 在下一 step 边界消费；idle 则开新 turn）；`inject()` → `next-step` 不唤醒（等其他消息唤醒；可能错过已 claim 的 pre-step）（`agent.ts@c291e79` L136-147）。
- 每个 step 边界 claim 全部 `next-step`；turn 边界另加一条 `next-turn`。steering 与注入上下文与普通输入走**同一条** `agent/pre-step` waterfall（`docs/agent-lifecycle.md@c291e79`）。
- 被拒绝的 step 会让已 claim 的消息"就此结束"（既不 discard 也不写 `user/message`），未被 claim 的 steering 留在 inbox 直至下次唤醒（`agent/inbox/claimed` JSDoc，`docs/subsystems/core.md@c291e79`）。
- `agent/turn-stopping` 监听器若想续跑，就调用 `agent.steer(...)`，机器重读 inbox："Data decides, so listener order cannot change the outcome"。

### 2.8 子 agent 如何进入循环

- Seam：`ctx.subagents`（`SubagentRuntime`），provider 有 `spawn`（新会话）、`fork`（seed = 父 log 到最近 `turn/end` 的平衡前缀）、`acp`、`claude-code`、`codex`、`dsh-sdk` 等（`docs/subsystems/subagent.md@c291e79`；`packages/subagent/`）。模型侧工具 `tool-subagent` 是消费者。
- 进程内路径（`dsh-subagent-in-process-driver`）：校验深度（父深度+1，持久化 `SessionHeader.delegationDepth`）→ 通过宿主工厂 `ctx.agents.create({sessionId, parentAgent, seed?, setup, signal})` 创建子 Agent → 在未发布的 setup 窗口装 persona / 工具限制 / 结构化输出运行时 → 发布，驱动**一个任务**（推断：即一次 `followup`）→ 读子 Agent 自己最后一条非空 assistant 消息作为输出 → `dispose()`（`packages/subagent/subagent-in-process-driver/README.md@c291e79`）。
- 子 Agent 是**普通 Agent，跑同一套 `agent-loop`**；获得新的扁平作用域（不继承父的工具限制/授权），继承父 provider/model/effort/maxTokens（可覆盖）；`agentPresets.composeFrom(childCtx, parentCtx)` 可让子加入父的同一 standing composition（`docs/subsystems/core.md@c291e79` §ctx.agentPresets）。
- 事件：`subagent/start` / `subagent/end`（emit，按委派父 Agent 作用域过滤）；子 Agent 的自身生命周期照常发 `agent/created`、`agent/session-start`、`agent/disposed`。
- 父 turn 与子 turn 的关系：子在父的工具调用（`tools/execute`）期间运行，父 turn 保持开放；取消通过 request signal 传播（`kind:'parent'`）。

---

## 3. 事件

### 3.1 分发模式（Cordis）

| 模式 | 是否 await | 顺序 | 返回值 | 可取消/可改写 |
|---|---|---|---|---|
| `emit` | 否（同步广播，忽略返回） | 注册顺序 | 无 | 否，纯通知 |
| `parallel` | 是（全部并发，一起 await） | 并发 | 无 | 否 |
| `serial` | 是（顺序 await，直到首个非 null/false/undefined 返回） | 注册顺序 | 首个 bail 值 | 可"bail"短路 |
| `bail` | 否（serial 的同步版） | 注册顺序 | 首个 bail 值 | 可短路 |
| `waterfall` | 取决于签名 | 注册顺序，around-middleware，每个 listener 收 `(...args, next)` | 最外层 listener 返回值 | **调 `next()` 委托；不调即否决/替换**；可包裹或替换下游结果；`prepend:true` 前置 |

依据：`docs/cordis-primer.md@c291e79` §Dispatch Modes / §Waterfall Semantics；`docs/cordis-api/events.md@c291e79`；`docs/cordis-tutorial/04-events.md@c291e79`。仓库纪律：只观察/注解的 waterfall listener **必须**调 `next()`。`ctx.on(name, listener, {prepend?, global?})` 返回 disposer，随 fiber 卸载自动移除；`global:true` 绕过作用域过滤。

### 3.2 Cordis 内核生命周期事件（vendored 4.0.2）

| 事件 | 模式 | 时机 / 载荷 | 依据 |
|---|---|---|---|
| `internal/plugin` | emit | fiber 创建或销毁时清 uid；`(fiber)` | `vendor/cordis/src/events.ts@c291e79` L331 |
| `internal/status` | emit | fiber 状态变化；`(fiber, oldState)` | L333；`docs/cordis-api/fiber.md@c291e79` |
| `internal/config` | waterfall | 注入激活后解析原始配置 | L339 |
| `internal/service` | emit | 服务绑定拦截钩子（核心无生产者） | L341 |
| `internal/update` | waterfall | 配置更新即将应用，不调 `next()` 可否决重启 | L343；`fiber.update()` |
| `internal/get` / `internal/set` | waterfall | 通过 Context 代理读/写服务 | L345-347 |
| `internal/listener` | bail | 注册监听器时，非 null 返回替换注册 | L349 |
| `internal/dispatch` | emit | 非 `internal/*` 事件被分发时 `(mode, name, args, thisArg)` | L351；`events.ts` L168 |
| loader：`exit`、`loader/config-update`、`loader/entry-init`、`loader/partial-dispose`、`loader/patch-context`（waterfall） | — | 进程退出信号 / 配置树变化 / entry 初始化 / reload 部分卸载 / reload 时 patch context | `vendor/loader/src/index.ts@c291e79` L25-29；`docs/cordis-api/inherited.md@c291e79` |
| hmr：`hmr/change`、`hmr/reload` | — | 源文件变化 / 插件重载 | `docs/cordis-api/inherited.md@c291e79` |

**注意**：该 Cordis 版本**没有** `ready` / `dispose` 事件名（`grep` `vendor/cordis/src` 无命中，`Events` 接口仅列上述 `internal/*`）。生命周期观察靠 `internal/status` 与 fiber 状态；插件清理靠 effect disposer（逆序运行；多个 async disposer 并发）。

### 3.3 Session 事件（durable，写入日志并通过 `session/event` 广播）

核心 `SessionEventMap`（`docs/subsystems/session.md@c291e79` §SessionEventMap）：

| 事件 | 触发时机 | 载荷要点 | 进入模型历史？ |
|---|---|---|---|
| `turn/start` | claim 输入前 | `{turn}` | 否 |
| `turn/end` | turn 关闭 | `{turn, reason: TurnEndReason}` | 否 |
| `step/start` / `step/end` | 进入/关闭 step | `{turn, step}` | 否 |
| `system/message` | 首 step 作为 surface node 0，之后变更时替换或（in-history 路由）追加 | `{turn, step, message}` + `surfaceOp` | 是（最新非空节点为有效提示词） |
| `user/message` | pre-step enter 的每条消息、注入上下文、runtime-context 快照、压缩摘要 | `UserMessage {id, source, content}`；`surfaceOp: append | replace{startSeq,endSeq}` | 是 |
| `assistant/message` | 每次成功 provider 调用（含空内容、max-tokens、被中断前缀） | `{turn, step, message, usage?, stream, interrupted?}`，内嵌紧凑时序流 | 是（空内容跳过） |
| `assistant/attempt` | 失败/重试/取消/流错误的尝试 | `{turn, step, stream}` | 否 |
| `tool/call` | 工具启动前记录 | 调用身份与参数 | 是（在 assistant 块中） |
| `tool/result` | post 后按模型顺序记录 | `content, error?, meta?`（`value` 不落盘） | 是（user 角色 tool-result 块） |
| `request/header` | 首请求 / envelope 变化 / 新 series / resume | `{header: EpochHeader{config, adapterDefaults?, tools?}, reason: initial|resume|change|series}` | 否 |
| `request/context` | 路由 provider/model/contextWindow/systemPromptUpdate 变化时 | `RequestContext` | 否 |
| `session/end-seed` | seed 边界 | — | 否 |
| 插件合并：`agent/inbox/spliced`、`compaction/start|summary|end|prune`、`hook/invoked|result`、`approval/asked|decided|policy`、`llm/retry`、`todo/write`、`fs/observed`、`tool/ptc-dispatch` … | 各自插件 | log-only（无 `surfaceOp`） | 否 |

Session 服务级事件（`docs/subsystems/session.md@c291e79` §session/* events）：

| 事件 | 模式 | 说明 |
|---|---|---|
| `session/created` | emit | 会话发布 |
| `session/event` | emit | 提交后 fire-and-forget 追加流；按 Agent 作用域过滤；observer 失败被容纳 |
| `session/flush` | parallel | 可 await 的持久化屏障，所有 listener 并发，无否决 |
| `session/disposed` | emit | 会话退役 |

### 3.4 Agent 事件（`docs/subsystems/core.md@c291e79` §agent/* events；均按 Agent 作用域过滤）

| 事件 | 模式 | 触发时机 | 载荷 | 可取消/改写 |
|---|---|---|---|---|
| `agent/created` | emit | Agent + 会话发布后（setup 完成、`session/created` 之后） | `{agent}` | 同步抛错可否决发布；promise 拒绝仅报告 |
| `agent/session-start` | emit | 首 turn 前一次；`source: startup|resume|clear|compact` | `{agent, source}` | 否（通知；可 `agent.inject()` 播种上下文） |
| `agent/status` | emit | `idle ⇄ running` | `{agent, status}` | 否 |
| `agent/inbox/inserted` / `claimed` / `discarded` | emit | 入箱 / 被 step claim（`{message, turn}`）/ 被取消 | `{agent, message[, turn]}` | 否 |
| `agent/pre-step` | **waterfall** | claim 之后、`step/start` 之前 | `{agent, messages, turn, step, signal}` → `PreStepDecision = reject | enter{messages, startsRequestSeries?}` | **可拒绝（无 step）/ 改写进入的消息批 / 声明新 request series**；`next()` 保留当前消息 |
| `agent/request` | **waterfall** | `step/start` 后、系统提示与 user 提交前 | `{agent, turn, step, signal}` → `LlmCallConfig` | **可替换 provider/model/reasoningEffort/采样**；不能改消息 |
| `agent/assistant-stream` | emit | 每次模型尝试：`start` / `chunk`* / `end{outcome: committed{eventType, seq} | abandoned}` | `{agent, frame}` | 否（进程本地、chunk 瞬态） |
| `agent/request-error` | **waterfall** | 失败 step 关闭后、turn 关闭前 | `{agent, turn, step, provider, failure, retryPolicy, signal}` → `{kind:'retry'} | undefined` | **可要求在同一 step 重试**（不调 `next()`） |
| `agent/turn-stopping` | **serial** | 无工具续接、无新 steering 时，`turn/end` 前 | `{agent, turn, signal}` | 不能直接否决；listener 通过 `agent.steer()` 使 turn 继续；`concludesTurn` 反向提前停止 |
| `agent/error` | emit | step/turn 出错（含无 durable 位置的错误） | `{agent, turn, step, error}` | 否 |
| `agent/disposed` | emit | driver 静止、作用域卸载后，会话 detach 前 | `{agent}` | 否 |
| `agent-loop/config-start-failed` | emit | 声明式 agent 条目启动失败 | `{sessionId, error}` | 否 |

生产者/消费者矩阵见 `docs/event-producer-consumer.md@c291e79`（例如 `agent/pre-step` 的监听器包括 compaction-basic、hooks-claude-code/codex、plan-mode、session-checkpoint-policy、time-context、tool-skill、tool-subagent 等）。

### 3.5 工具管线事件（`docs/subsystems/tools.md@c291e79`；按 `exec.agent` 作用域过滤）

| 事件 | 模式 | 时机 | 载荷 / 返回 | 可取消/改写 |
|---|---|---|---|---|
| `tools/change` | emit（**不过滤**） | 工具注册/注销/限制变化 | 无 | 否 |
| `tools/pre-execute` | waterfall | `tool/call` 记录后、guards 前 | `(exec, next) → PreToolDecision = allow | deny{reason} | ask{reason?}` | **可拒绝 / 要求审批**；不能改参数（已记录/展示） |
| （guards） | `ctx.tools.guard(fn)` | pre 之后、体前 | 返回 string 即拒绝，`undefined` 保持 | 只能收紧，不能放行 |
| `tools/execute` | waterfall | around-dispatch | `(exec: ToolDispatchExecution, next) → ToolExecutionResult` | 可包裹（超时/重试/度量）、只可替换 `exec.signal`；短路即替代工具体 |
| `tools/post-execute` | waterfall | 体返回后（抛错也到达） | `(exec, result, next) → PostToolDecision = accept{content?|value?, additionalContexts?} | block{feedback, additionalContexts?}` | **可替换内容或值（二选一）、附加下一步上下文、以反馈阻断** |
| `tools/ptc-dispatch-log` | waterfall | PTC 模式子分发落盘前 | 替换 durable 副本内容 | 只影响日志副本 |
| `tools/result` | emit | 冻结的最终结果 | `(exec, result)` | 否，失败被容纳 |

管线图：`docs/tool-execution-pipeline.md@c291e79`。审批：`ask` → `ctx.approval.request()` → `approval/request` waterfall（`Scoped<Agent>`，返回 `ApprovalOutcome = allowed-once | rejected | cancelled | unavailable`，仅 `allowed-once` 放行；`never` 策略在 waterfall 前强制 `rejected`；审计 `approval/asked|decided` 为 log-only）（`docs/subsystems/approval.md@c291e79`）。

### 3.6 其他与循环相关的事件

| 事件 | 模式 | 说明 | 依据 |
|---|---|---|---|
| `system-prompt/assemble` | waterfall | 对组装好的 sections/contexts/tools/variables 的专家级改写；返回值权威；`complete` section 在其后被恢复为唯一提示词 | `docs/subsystems/system-prompt.md@c291e79` |
| `system-prompt/change` | emit（不过滤） | 任一提示词提供者变化 | 同上 |
| `llm/stream` | waterfall | 每次流式模型调用的 around；`next()` 到达 adapter，可自行 yield 短路；loop 构建的请求深冻结不可改 | `docs/subsystems/llm-streaming.md@c291e79` |
| `llm/adapters-updated` | emit | adapter 注册变化 | 同上 |
| `subagent/start` / `end` / `provider-added` / `provider-removed` | emit | 子 agent 生命周期对；provider 注册 | `docs/subsystems/subagent.md@c291e79` |
| `approval/request` | waterfall | 审批回答链 | `docs/subsystems/approval.md@c291e79` |
| `fs/write-intent` / `fs/edit-intent`（waterfall）、`fs/observed`（emit） | — | 文件系统策略 seam | `docs/event-producer-consumer.md@c291e79` |
| `user-questions/request` | waterfall | 向用户提问 seam | 同上 |
| `session-telemetry/record` | waterfall | 遥测记录 | 同上 |

### 3.7 作用域过滤（Scoped dispatch）

`agent/*`、`tools/*`、`session/event|flush`、`system-prompt/assemble`、`subagent/*`、`approval/request` 声明 `this: Scoped<T>`，用 `scopeTarget(base, key)` 作为 `thisArg` 分发：未打标的 listener 全局接收；通过 `agent.ctx.on(...)` 注册的 listener 仅接收该 Agent（及其后代 scope）的事件；`{global:true}` 绕过（`packages/core/scope/README.md@c291e79` §Event filtering；`packages/core/agent/src/dispatch.ts@c291e79` `agentEvents` 把 subject 与 carrier 融合，二者不会分叉）。注册视图沿 scope 链**向下**继承（子见祖先注册，最近定义优先），事件接收沿链**向上**扩展（祖先 listener 收后代事件）。

---

## 4. Hooks / 扩展点

原则："Events are the extension points"；改循环本身需更新 `docs/architecture.md` §Where new behavior goes 的映射表（`docs/architecture.md@c291e79`）。

| 需求 | 机制 | 时机 | 能否阻止/改写 | 返回值语义 | 执行顺序与作用域 | 卸载清理 |
|---|---|---|---|---|---|---|
| 系统提示词装配 | `ctx.systemPrompt.section({name, order, text | fn, complete?})`、`.context()`、`.variable()`、`.tools(provider)`、`.suppressRuntimeContext()`；专家级 `system-prompt/assemble` waterfall | 每 step 的 `preStep()` 内 assemble | 可增删改；`complete` section 独占且 waterfall 不能覆盖 | assemble 返回 `PromptAssembly` | 按 `order` 升序再按名字；scoped section **遮蔽**同名 global；通过 `agent.ctx` 注册即 agent-local | 返回精确 Cordis disposer；注册/注销发 `system-prompt/change` |
| 工具注册/撤销/限制 | `ctx.tools.register(def)` / `restrict({allow?,deny?})` / `presentAs(mode)` | 任意时刻；下一次 assemble 生效 | scoped 遮蔽 global；`restrict` 只对继承的工具生效且多重限制取交集 | disposer | 通过 `agent.ctx` 即仅该 Agent 可见 | disposer 注销并发 `tools/change`；**schema 变化会开启新 request series**（`toolsChanged()`） |
| 工具执行前拦截 / 权限 | `tools/pre-execute`（allow/deny/ask）→ `ctx.tools.guard()`（单调拒绝）→ `ctx.approval` / `approval/request` | `tool/call` 记录后 | 可拒绝、要求审批；不可改参数 | `PreToolDecision`；`next()` = allow | 注册顺序；scoped listener 仅本 Agent | effect-bound |
| 工具执行环绕（超时/重试/度量/检查点） | `tools/execute` waterfall | 体前后 | 可替换 `signal`、可短路替代体 | `ToolExecutionResult` | 同上 | 同上 |
| 工具结果过滤/改写/附加上下文 | `tools/post-execute` waterfall | 体返回后 | 替换 content **或** value、`block` 成错误、`additionalContexts` 注入下一 step | `PostToolDecision` | 同上 | 同上 |
| 消息过滤 / 输入拦截 / 注入 | `agent/pre-step` waterfall；`agent.inject()` / `steer()` / `Inbox.replace/remove/splice` | claim 后、step 前 | 可 reject / 改写整批 / 声明新 series；只对已 claim 的消息 | `PreStepDecision`（"authoritative"，包裹者应 `{...decision, messages}` 保留 `startsRequestSeries`） | 注册顺序；`prepend` 可前置 | effect-bound |
| 模型 provider / 路由替换 | `ctx.llm.registerAdapter(providers, adapter)`；`agent/request` waterfall 换 `LlmCallConfig`；`llm/stream` waterfall 短路/重路由 | `step/start` 后 / 每次流 | 可换 provider/model/effort/采样；`llm/stream` 可自造流 | `LlmCallConfig` / `AsyncIterable<StreamChunk>` | `llm/stream` 绑定 `LlmRuntime`，adapter 查找在终端 continuation | `llm/adapters-updated` |
| 模型请求失败恢复 | `agent/request-error` waterfall（`dsh-llm-retry`、`compaction-basic` 用之） | 失败 step 关闭后 | 可要求 `retry` | `{kind:'retry'} | undefined` | 不调 `next()` 即拥有决定 | effect-bound |
| 提前/延后结束 turn | `agent/turn-stopping`（serial；`steer()` 续跑）；工具 `exec.concludeTurn()`；`agent.cancel({kind:'hook', reason})` | 停止边界 / 工具成功结果 / 任意 | 续跑或结束 | serial 无 `next()`；"data decides" | 顺序不影响结果 | effect-bound |
| Compaction 策略 | 实现 `ctx.compaction`（`compactIfNeeded / compactNow / compactRegion`）；`compaction-basic` 挂 `agent/pre-step` 与 `agent/request-error` | 见 2.6 | 替换 surface 区间为摘要 | `CompactionResult | null` | 每 context 一个实现 | effect-bound |
| 会话启动播种 | `agent/session-start`（emit）+ `agent.inject()` | 首 turn 前 | 不可否决 | — | — | — |
| 创建期定制 | `ctx.agents.create({setup(agentCtx, agent)})` | 发布前 | setup 抛错回滚创建 | 可返回同步 commit | 所有 `agentCtx` 注册在 `agent/created` 与首次 assemble 前存在 | 随 agent scope dispose |
| 持久化检查点 | `dsh-session-checkpoint-policy`：包裹 `llm/stream`（请求前 flush）、`tools/execute`（顶层工具体前 flush）、监听 `agent/pre-step`（上一 step 结果 flush） | — | 检查点失败 fail-closed | — | — | — |
| 外部命令式 hooks（兼容层） | `dsh-hooks-claude-code` / `dsh-hooks-codex`：`SessionStart→agent/session-start`、`UserPromptSubmit→agent/pre-step`、`PreToolUse→tools/pre-execute`、`PostToolUse→tools/post-execute`、`Stop→agent/turn-stopping`（用 `steer()` 强制再跑一步）、`SubagentStart/Stop→subagent/start|end` | 各点 | 退出码 2 阻断并把 stderr 作为模型可见原因；仅附加上下文的 hook 先 `next()` 再折叠；`{"continue":false}` 仅记录无效果 | 最严格合并 `deny > ask > allow` | 同事件的 hooks 按配置顺序**串行** | 卸载时 abort 未完成进程并 drain（`packages/hooks/*/README.md@c291e79`） |

作用域/继承要点：`agent.ctx` 的注册"agent-local、随销毁卸载、销毁后拒绝注册"（`Agent.ctx` JSDoc）。`agentPresets.mount(agentCtx, id)` 把 agent scope 挂到 preset 的 standing mount 下，从而继承其注册与 listener；`composeFrom(childCtx, parentCtx)` 让子 agent 绑定父的同一代组合；`recompose()` 仅在 agent 尚无产出时换 preset，并发 `tools/change`（`docs/subsystems/core.md@c291e79` §ctx.agentPresets）。

清理保证：所有 `ctx.on/effect/plugin` 与 harness 注册表返回的都是精确 Cordis disposer；fiber 卸载时逆序运行；`AgentHandle.dispose()` 顺序为"停止并 drain driver → 关闭会话写路径 → 卸载 scope → detach agent（`agent/disposed`）→ detach session（`session/disposed`）"，每个 detach 绑定精确对象，避免陈旧 disposer 移除同 id 的替代者（`packages/core/agent-loop/README.md@c291e79` §Creation and teardown）。

---

## 5. 持久化与恢复

| 主题 | 事实 | 依据 |
|---|---|---|
| Seam | `ctx.sessionPersistence`（`create/open/stat/list/export`）返回每会话 `SessionHandle {read, append, flush, close}`；单写者：活体 Agent 持有写句柄，第二个 `open(id,'write')` 抛 `SessionAlreadyOwnedError`；无并行的"持久化事件类型"，直接存 `SessionEvent`。 | `docs/subsystems/persistence.md@c291e79` |
| 后端 | 内置 `dsh-session-persistence-jsonl`：`session.vN.jsonl[.zstd]`，按代（generation）选择，不改名/不覆盖已提交代；格式迁移为相邻 `vN→vN+1` 包链。 | `docs/architecture.md@c291e79` §Session log |
| 写路径 | `session/event`（同步通知）被后端路由进写句柄的有界 write-behind 窗口；`session/flush`（parallel）取消等待并 drain，是持久化屏障；`session/disposed` 做最终 drain 并 close。`append` 解析≠落盘，只有 `flush` 保证崩溃存活。 | `docs/subsystems/persistence.md@c291e79` §The flush checkpoint |
| 检查点策略 | loop 在 turn 边界**不**等 flush；`dsh-session-checkpoint-policy` 在模型请求前、顶层工具体前、每个 `agent/pre-step` 前 flush，失败 fail-closed。 | `packages/session/session-checkpoint-policy/README.md@c291e79` |
| 崩溃 | 持久化不截断/修复中途 turn；只丢弃未解析 append 的撕裂物理尾部。修复是读者的责任。 | `docs/subsystems/persistence.md@c291e79` §Crash recovery |
| 恢复流程 | `ctx.agents.resume({resumeSessionId,...})` → loop `resume()`：先 `persistence.open(id,'write')` 抢占写权 → `handle.read(0)` → `interruptedTurnClosers(persisted)`（补缺失的 tool error、`step/end`、合成 `turn/end {kind:'interrupted'}`）→ 作为普通批 `append` → `ctx.sessions.prepare(id,{seed:[...persisted,...closers], meta: header, inheritedEventCount})` → `appendUnstoredSuffix`（setup 窗口内追加的事件）→ `setupAndPublish(..., 'resume')` → `agent/session-start{source:'resume'}` → 启动 driver。 | `packages/core/agent-loop/src/index.ts@c291e79` L860-925；`packages/core/session/src/repair.ts@c291e79` |
| 恢复后的循环状态 | 无独立"循环状态"文件：turn 号来自 `sessionProjections.stateOf(session,'turnBoundary').lastTurn`；inbox 来自 `agent/inbox/spliced` 折叠的 `inbox` 投影（重启后未 claim 的待办消息仍在）；请求 envelope 来自最新 `request/header`；resume 时写 `request/header{reason:'resume'}`；模型历史全部由 `deriveMessages()` 重派生。**未完成的 assistant 流在硬崩溃前没有 durable attempt**。 | `agent.ts@c291e79` L106-110；`docs/subsystems/core.md@c291e79` §Inbox；`docs/agent-lifecycle.md@c291e79` |
| Fork | `ctx.sessions.fork(source, boundary?)` 或 `ctx.agents.create({sessionId, seed, meta:{parentSession, seedLength}})`；只有 agent-loop 发布的会话才持久化。 | `docs/subsystems/session.md@c291e79` §Live-session fork API；`docs/architecture.md@c291e79` |
| 只读观察 | `open(id,'read')` 得到验证过的连续前缀；session-query 在内存中做同样的 closers 平衡，不回写。 | `docs/subsystems/persistence.md@c291e79` |

---

## 6. 小结表：循环阶段 → 事件 → hook → 能否阻断/改写

| 循环阶段 | durable session 事件 | 活体事件 / hook | 模式 | 能否阻断 | 能否改写 |
|---|---|---|---|---|---|
| Agent 创建/发布 | `session/created` | `setup(agentCtx, agent)`；`agent/created`；`agent/session-start` | setup 回调 / emit / emit | setup 抛错回滚；`agent/created` 同步抛错否决 | setup 可注册 agent-local 一切 |
| 输入入箱 | `agent/inbox/spliced` | `agent/inbox/inserted`；`Inbox.replace/remove/splice` | emit / 方法 | 可删除待处理消息 | 可替换待处理消息 |
| 唤醒 | — | `agent/status` running | emit | 否 | 否 |
| 开 turn | `turn/start` | — | — | — | — |
| claim 输入 | `agent/inbox/spliced`（纯删除） | `agent/inbox/claimed` | emit | 否 | 否 |
| 装配提示词/工具 | — | `system-prompt/assemble`；section/context/variable/tools providers；`tools/change`、`system-prompt/change`（通知） | waterfall / 注册表 | 否（但 `complete` 独占） | 是 |
| 准入决定 | （reject → `turn/end{blocked}`） | `agent/pre-step` | waterfall | **是**（reject） | **是**（消息批、`startsRequestSeries`） |
| 开 step | `step/start` | — | — | — | — |
| 请求配置 | `request/header`、`request/context` | `agent/request` → `prepareCall()` | waterfall | 否（可抛错使 turn 出错） | **是**（provider/model/effort/采样） |
| 提示词/用户提交 | `system/message`、`user/message` | （checkpoint-policy 在 `agent/pre-step` 已 flush） | — | — | — |
| 模型流 | `assistant/message` / `assistant/attempt` | `llm/stream`；`agent/assistant-stream` | waterfall / emit | `llm/stream` 可短路 | `llm/stream` 可自造流；请求本身不可改 |
| 请求失败 | `assistant/attempt`、`llm/retry`（插件） | `agent/request-error`；`agent/error` | waterfall / emit | 决定终止或重试 | 可修复 durable 状态后 `retry` |
| 工具调用 | `tool/call` | `tools/pre-execute` → guards → `approval/request` | waterfall / guard / waterfall | **是**（deny/ask/guard） | 否（参数不可改） |
| 工具执行 | 工具自有事件 | `tools/execute` | waterfall | 可短路替代体 | 只改 `signal` |
| 工具结果 | `tool/result` | `tools/post-execute` → `finalizeContent` → `tools/result` | waterfall / 回调 / emit | `block` | **是**（content 或 value、附加上下文） |
| 关 step | `step/end` | — | — | — | — |
| 停止边界 | — | `agent/turn-stopping` | serial | 通过 `steer()` 让 turn 继续；`concludesTurn` 提前结束 | 否 |
| 关 turn | `turn/end{reason}` | `agent/status` idle | emit | 否 | 否 |
| 压缩 | `compaction/*` + `user/message{replace}` | `ctx.compaction`（挂 `agent/pre-step` / `agent/request-error` / maintenance） | 服务 | — | 替换 surface 区间 |
| 取消 | `turn/end{aborted}`、`assistant/message{interrupted}`、合成 `tool/result ABORTED_BEFORE_DISPATCH` | `agent.cancel(cause)` | 方法 | 是 | — |
| 销毁 | `session/disposed` | `agent/disposed`；`AgentHandle.dispose()` | emit | 否 | 否 |
| 持久化 | `session/event`（通知）、`session/flush` | 后端 listener；checkpoint-policy | emit / parallel | flush 失败 fail-closed | 否 |

---

## 7. 局限与未覆盖

- **推断**项：子 agent "驱动一个任务" 具体是否等价于一次 `followup()` + 等待 `turn/end`，文档描述为 "drive one task to completion"，未读 `subagent-in-process-driver/src/index.ts` 逐行确认。
- **推断**：`runtime-context.ts` 中 runtime-context 快照作为 plugin-sourced `user/message` 的精确替换规则（"CLEARED" 文本、何时替换 vs 追加）只读了文件头部；细节以源码为准。
- **未覆盖**：`packages/core/agent-loop/src/inbox.ts`（`ReactLoopInbox.claim` 的精确 splice 坐标与投影折叠）、`assistant-stream.ts`（`AssistantStreamAttempt` 的 settle/abandon 细节）、`invariant.ts`（请求重构不变量）未逐行阅读，仅依据 README/文档。
- **未覆盖**：`docs/subsystems/agent-team.md`（实验性 Agent Teams：roster/task board/mailbox）、`workflow/*` 事件、`goal-round-driver`（目标续跑如何用 `agent/*`）、`schedule`（定时唤醒）、ACP/SDK 宿主如何映射 `agent/*` 到线协议。
- **未覆盖**：`.agents/notes/implemented/**` 决策记录（文档多处引用，例如 explicit-turn-cancellation、agent-initiator-scope、system-prompt-as-surface-node）未直接阅读；本文只转述文档正文的引用结论。
- **未覆盖**：Cordis `Context.filter` / `ctx.isolate` realm 与 preset `isolate` 服务的交互细节（`docs/cordis-api/context.md` 仅读了 `extend/isolate/intercept` 概述）。
- **不确定**：`agent/pre-step` 中 "listener 可 prepend" 与 checkpoint-policy、compaction-basic、hooks 等多个监听器之间的实际相对顺序取决于装配顺序（bundle 行顺序），文档未给出权威顺序表。
- 事件清单以 `docs/event-producer-consumer.md@c291e79`（由 TypeScript Program 生成）为准；本文只展开与 Agent Loop 直接相关的事件，`api-session/*`、`cordis/*`（host-runner）、`credentials/*`、`settings/*`、`workflow/*`、`webserver/*`、`domain/changed`、`goal/*`、`skills/change`、`feedback/committed`、`authorization/settled`、`commands/change` 未展开。
- 本项目本地 `packages/agent/upstream/` 是同一提交、同一版本（0.1.5-rc.2）的选择性原件，与官方仓库一致；本文全部以官方克隆为准。
