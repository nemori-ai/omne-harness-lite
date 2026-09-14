<!-- 分系统核对笔记：LangChain、LangGraph 与 deepagents。2026-09-14 由只读调研 subagent 按固定提交/版本产出，主稿见 ../README.md。本文是研究证据，不构成本项目政策；「推断」「未覆盖」标注保留。 -->

# LangChain v1 `create_agent` / LangGraph / deepagents 的 Agent Loop、事件与 Hooks 调研笔记

调研日期：2026-09-14。以 Python 版源码为准，JS 版仅在有实质差异处注明。

## 0. 证据基线

| 仓库 | 克隆位置（仓库 Git 忽略的临时目录，可重新生成） | 提交 | 包版本（`pyproject.toml`） |
|---|---|---|---|
| `langchain-ai/langchain` | `langchain/` | `15b5f57`（2026-09-13） | `libs/langchain_v1`：`langchain==1.4.0`（依赖 `langchain-core>=1.6.0`、`langgraph>=1.2.11,<1.3.0`）；`libs/core`：`langchain-core==1.6.3` |
| `langchain-ai/deepagents` | `deepagents/` | `c08cae6`（2026-09-13） | `libs/deepagents`：`deepagents==0.7.13`（CHANGELOG 记为 2026-09-02；依赖 `langchain>=1.4.0`、`langchain-core>=1.6.3`、`langchain-anthropic>=1.7.2`） |
| `langchain-ai/langgraph` | `langgraph/` | `e539ac1`（2026-09-09） | `libs/langgraph`：`langgraph==1.2.11`；`libs/checkpoint`：`langgraph-checkpoint==4.2.0` |

引用记法：`langchain:路径@15b5f57`、`deepagents:路径@c08cae6`、`langgraph:路径@e539ac1`；文档为 URL + 访问日期 2026-09-14。「推断」= 只从源码推断、无文档佐证；「未覆盖」= 本次未找到。

注意：deepagents 仓库是 monorepo，`create_deep_agent` 所在包位于 `libs/deepagents/`（顶层无 `pyproject.toml`）；`ToolNode`/`ToolCallRequest` 实际定义在 `langgraph/libs/prebuilt/`，`langchain.tools.tool_node` 只是再导出（`langchain:libs/langchain_v1/langchain/tools/tool_node.py@15b5f57`）。

## 1. 总体架构定位

三层关系（deepagents 自己的架构文档表述一致，`deepagents:libs/ARCHITECTURE.md@c08cae6`「The three layers」）：

| 层 | 职责 | 关键类型 |
|---|---|---|
| deepagents（harness） | 装配默认中间件栈、backend、subagent、skills、memory、profile；**不引入新运行时**，最终调用 `create_agent(...)` 并 `.with_config(recursion_limit=9_999, metadata={"ls_integration": "deepagents", ...})` | `create_deep_agent`、`DeepAgentState`（`deepagents:libs/deepagents/deepagents/graph.py@c08cae6`） |
| LangChain v1（agent 抽象） | `create_agent` 把 model + tools + middleware 编织成 LangGraph `StateGraph`：`model` 节点、`tools` 节点（`ToolNode`）、每个中间件 hook 一个节点、条件边 | `AgentMiddleware`、`ModelRequest`、`AgentState`（`langchain:libs/langchain_v1/langchain/agents/factory.py@15b5f57`、`.../middleware/types.py@15b5f57`） |
| LangGraph（运行时） | Pregel 执行、状态通道与 reducer、checkpoint、`interrupt()`/`Command(resume=)`、流式（`stream_mode`、`astream_events` v1/v2/v3） | `StateGraph`、`Pregel`、`ToolNode`（`langgraph:libs/langgraph/langgraph/pregel/main.py@e539ac1`、`langgraph:libs/prebuilt/langgraph/prebuilt/tool_node.py@e539ac1`） |
| LangChain core（Runnable/回调） | 每个模型/工具调用是 Runnable，回调管理器把 `on_chat_model_start` 等事件派发给 `BaseCallbackHandler`；`astream_events` v1/v2 由 `_AstreamEventsCallbackHandler` 把回调转成事件 | `langchain:libs/core/langchain_core/callbacks/base.py@15b5f57`、`.../tracers/event_stream.py@15b5f57` |

一次用户输入到回复的完整路径（图节点顺序；基于 `factory.py@15b5f57` L1648-1830 的入口/循环入口/循环出口/出口节点计算）：

```
START
 → {M_i.before_agent}（按注册正序，仅一次）
 → {M_i.before_model}（正序）
 → model（内部：wrap_model_call 洋葱 → 绑定 tools/response_format → model.invoke）
 → {M_i.after_model}（逆序：model 先连到最后一个 after_model）
 → 条件边 model_to_tools：jump_to ? → 无 AIMessage → end；无 tool_calls → end；
      有待执行 tool_calls → [Send("tools",[tc]) …]（每个 tool call 一个 Send）；
      structured_response 已产出 → end；tool_calls 全被人工 ToolMessage 回填 → 回 loop_entry
 → tools（ToolNode：wrap_tool_call 洋葱 → 工具执行；并行）
 → 条件边 tools_to_model：全部 return_direct → end；执行了结构化输出工具 → end；否则回 loop_entry（第一个 before_model 或 model）
 … 循环 …
 → {M_i.after_agent}（逆序，仅一次）
 → END
```

deepagents 在其上叠加：文件系统工具与权限（`FilesystemMiddleware`）、`task` 子代理工具（`SubAgentMiddleware`）、带 backend 卸载的摘要（`_DeepAgentsSummarizationMiddleware`）、悬空工具调用修补（`PatchToolCallsMiddleware`）、skills/memory 注入、prompt caching、HITL、harness/provider profile、`DeltaChannel` 消息 reducer（`deepagents:libs/deepagents/deepagents/graph.py@c08cae6` 与 `middleware/*`）。详见 §4.4。

## 2. Agent Loop

### 2.1 `create_agent` 生成的图

签名（`langchain:libs/langchain_v1/langchain/agents/factory.py@15b5f57` L840-858）：`create_agent(model, tools=None, *, system_prompt, middleware=(), response_format, state_schema, context_schema, checkpointer, store, interrupt_before, interrupt_after, debug, name, cache, transformers)` → `CompiledStateGraph[AgentState, ContextT, InputAgentState, OutputAgentState]`。

| 元素 | 事实 | 出处 |
|---|---|---|
| 状态 | `AgentState = {messages: Annotated[list, add_messages] (Required), jump_to: Annotated[JumpTo|None, EphemeralValue, PrivateStateAttr], structured_response}`；中间件 `state_schema` 与用户 `state_schema` 合并，用户 schema 最后合并因而字段冲突时获胜 | `types.py@15b5f57` L349-372；`factory.py@15b5f57` L1170-1181 |
| `model` 节点 | `RunnableCallable(model_node, amodel_node, trace=False)`；构造 `ModelRequest(model, tools=default_tools, system_message, response_format, messages=state["messages"], tool_choice=None, state, runtime)`，若有 `wrap_model_call` 中间件则调用组合后的 handler，否则直接 `_execute_model_sync`；返回 `list[Command]`（第一个 `Command(update={"messages": ..., "structured_response": ...})`，其后为中间件通过 `ExtendedModelResponse.command` 附加的 Command） | `factory.py@15b5f57` L1441-1543、L213-262 |
| `tools` 节点 | `ToolNode(tools=middleware_tools + regular_tools, wrap_tool_call=..., awrap_tool_call=...)`；仅当有客户端工具或有 `wrap_tool_call` 中间件时创建；dict 形式的 provider 内建工具不进 ToolNode | `factory.py@15b5f57` L1073-1096 |
| 中间件节点 | 每个实现了对应 hook 的中间件生成一个节点，命名 `f"{m.name}.before_agent"` / `.before_model` / `.after_model` / `.after_agent`；`m.name` 默认类名，要求唯一（重复抛 `AssertionError`） | `factory.py@15b5f57` L1546-1646、L1100-1103 |
| 节点顺序 | 入口 = 第一个 before_agent → 第一个 before_model → model；循环入口 = 第一个 before_model（否则 model）；循环出口 = **第一个** after_model 节点（model 先连到**最后一个** after_model，逐个逆序链回第一个）；出口 = **最后一个** after_agent 节点（逆序链到第一个 after_agent → END） | `factory.py@15b5f57` L1648-1672、L1770-1830 |
| 条件边 | `_make_model_to_tools_edge`、`_make_tools_to_model_edge`、`_make_model_to_model_edge`（无工具但有结构化输出工具时）；中间件节点若声明 `can_jump_to` 则用 `_add_middleware_edge` 加条件边，否则普通边 | `factory.py@15b5f57` L1923-2075 |
| 递归限制 | 编译后 `.with_config({"recursion_limit": 9_999})`（注释指向 langgraph issue #7313）；LangGraph 自身默认 `DEFAULT_RECURSION_LIMIT = 10007`（环境变量可改） | `factory.py@15b5f57` L1833-1835；`langgraph:libs/langgraph/langgraph/_internal/_config.py@e539ac1` L32 |
| 流式 transformer | 编译时注册 `ToolCallTransformer`、`SubagentTransformer`、各中间件声明的 `transformers`、用户传入的 `transformers`（去重）—— 供 `stream_events(version="v3")` 使用 | `factory.py@15b5f57` L1837-1857 |

### 2.2 终止条件

| 条件 | 机制 | 出处 |
|---|---|---|
| 无 `tool_calls` | `model_to_tools`：`len(last_ai_message.tool_calls) == 0` → `end_destination` | `factory.py@15b5f57` L1954-1957 |
| 无 AIMessage（消息被清空） | → end | 同上 L1946-1948 |
| 结构化输出完成 | `state["structured_response"] is not None` → end；工具策略下执行了结构化输出工具 → `tools_to_model` 返回 end | 同上 L1968-1970、L2028-2030 |
| `return_direct` | `tools_to_model`：本轮全部客户端工具均 `return_direct=True` → end | 同上 L2019-2026 |
| `jump_to="end"` | 任何 `before_*`/`after_*` 返回 `{"jump_to": "end"}` 且该 hook 声明 `can_jump_to=["end"]`；`"end"` 解析为 `exit_node`（最后一个 after_agent 或 END），即 after_agent 仍会执行 | `factory.py@15b5f57` L1887-1899、L2040-2075 |
| `ModelCallLimitMiddleware` | `before_model`/`after_model` 计数（`thread_limit`/`run_limit`）；`exit_behavior="end"`（默认）返回 `{"jump_to": "end", "messages": [AIMessage(limit_message)]}`；`"error"` 抛 `ModelCallLimitExceededError` | `middleware/model_call_limit.py@15b5f57` L166-215 |
| `ToolCallLimitMiddleware` | `after_model` 计数；`ExitBehavior = "continue"`（默认，把超限工具替换为错误 ToolMessage、其余继续）/`"error"`（抛 `ToolCallLimitExceededError`）/`"end"`（注入 ToolMessage+AIMessage 并 `jump_to="end"`） | `middleware/tool_call_limit.py@15b5f57` L23-33、L325-473 |
| 递归上限 | LangGraph `recursion_limit` 超限抛 `GraphRecursionError`（LangGraph 通用行为；create_agent 把它设为 9_999） | `factory.py@15b5f57` L1833 |

### 2.3 并行工具调用

- `model_to_tools` 对每个未回填的 tool call 返回 `Send("tools", [tool_call])`，即**每个 tool call 一个独立任务**（注释说明不再把整份 state 内联进 Send，`ToolRuntime.state` 由节点执行时读取）。`factory.py@15b5f57` L1959-1966。
- `ToolNode._func` 内部再用 `get_executor_for_config` 的线程池 `executor.map(self._run_one, ...)`，异步版 `asyncio.gather`。`langgraph:libs/prebuilt/langgraph/prebuilt/tool_node.py@e539ac1` L793-860。
- 工具可返回 `Command`（更新状态/`goto`），ToolNode 会校验并合并（`_validate_tool_command`）。同文件 L1455-1580。

### 2.4 错误处理

| 层 | 行为 | 出处 |
|---|---|---|
| ToolNode `handle_tool_errors` | 默认 `_default_handle_tool_errors`：仅把 `ToolInvocationError`（模型给出的参数非法）转成错误 ToolMessage，其他异常**重新抛出**；可配 `True`/`str`/异常类型/元组/callable/`False` | `tool_node.py@e539ac1` L383-392、L665-690 |
| `ToolErrorMiddleware` | `wrap_tool_call`：`on_error(exc, request)` 返回内容则生成错误 `ToolMessage`，返回 `None` 则异常继续传播；可限定 `tools` | `middleware/tool_error.py@15b5f57` L28-40 |
| `ToolRetryMiddleware` | `wrap_tool_call`：指数退避重试（`max_retries=2`、`backoff_factor=2.0`、`initial_delay=1.0`、`max_delay=60`、`jitter`）；`retry_on` 为异常元组或谓词；`on_failure="continue"`（默认，注入错误消息）/`"error"`/callable | `middleware/tool_retry.py@15b5f57`、`middleware/_retry.py@15b5f57` L16-74 |
| `ModelRetryMiddleware` | `wrap_model_call`，参数同上；`default_retry_on` 对 `ModelError` 看 `is_retryable`，其他异常默认重试 | `middleware/model_retry.py@15b5f57`、`_retry.py@15b5f57` L70-74 |
| `ModelFallbackMiddleware` | `wrap_model_call`：`first_model, *additional_models` 依次回退 | `middleware/model_fallback.py@15b5f57` |
| 结构化输出错误 | `_handle_structured_output_error`（工具策略解析失败时按 `handle_errors` 配置回注错误消息或抛出） | `factory.py@15b5f57` L628-656 |
| 中间件 sync/async 不匹配 | 只实现 `awrap_*` 却用 `invoke()` 会抛 `NotImplementedError`（反之亦然），错误信息明确 | `types.py@15b5f57` L585-597、L740-755 |
| 摘要模型调用失败 | `SummarizationMiddleware` 用 `with_retry` 重试至多 3 次后抛出，不伪造摘要 | `middleware/summarization.py@15b5f57` L232-242 |

### 2.5 中断 / HITL

| 项 | 事实 | 出处 |
|---|---|---|
| 原语 | `interrupt(value)`：节点内首次调用抛 `GraphInterrupt` 并把 value 交给客户端；**恢复时节点从头重跑**，同一节点内多次 `interrupt` 按顺序匹配 resume 值；需要 checkpointer | `langgraph:libs/langgraph/langgraph/types.py@e539ac1` L851-905 |
| 恢复 | `graph.stream(Command(resume=...), config)`；`resume` 可是单值或 `{interrupt_id: value}` 映射；`Interrupt` 有 `value`、`id` | `types.py@e539ac1` L799-824、L575-580；https://docs.langchain.com/oss/python/langgraph/interrupts（2026-09-14） |
| 输出中出现 | `invoke()` 结果含 `"__interrupt__"` 键（常量 `INTERRUPT = "__interrupt__"`）；v3 流式为 `run.interrupted`/`run.interrupts` | `langgraph:libs/langgraph/langgraph/_internal/_constants.py@e539ac1` L9；`stream/run_stream.py@e539ac1` L222-253 |
| 节点级中断 | `create_agent(interrupt_before=[...], interrupt_after=[...])` 透传 `graph.compile(...)` | `factory.py@15b5f57` L1839-1845 |
| `HumanInTheLoopMiddleware` | `after_model`：对 `interrupt_on` 命中的 tool call 生成 `HITLRequest{action_requests, review_configs}`，**一次** `interrupt(hitl_request)` 覆盖本轮所有需审工具；读取 `["decisions"]`，数量须与拦截数一致否则 `ValueError` | `middleware/human_in_the_loop.py@15b5f57` L407-467 |
| 决策类型 | `DecisionType = "approve" | "edit" | "reject" | "respond"`：approve 原样执行；edit 用 `edited_action{name,args}` 替换 tool call（保留 id）；reject 保留 tool call 并注入 `status="error"` 的人工 ToolMessage（含「不要重试」提示）；respond 注入 `status="success"` 的人工 ToolMessage 代替执行。不在 `allowed_decisions` 内抛 `ValueError` | 同上 L34-80、L318-372 |
| `InterruptOnConfig` | `allowed_decisions`、`description`（str 或工厂）、`args_schema`、`when: Callable[[ToolCallRequest], bool]`（按调用决定是否中断） | 同上 L147-200、L374-406 |
| 恢复后走向 | after_model 返回 `{"messages": [revised_ai_msg, *artificial_tool_messages]}`；被 reject/respond 的 call 因已有 ToolMessage 而不再进 tools；若全部被回填则 `model_to_tools` 第 6 条回到 model | 同上 L468-490；`factory.py@15b5f57` L1972-1975 |

### 2.6 Steering（运行中插入消息）

- 源码中没有「运行中向正在执行的图注入消息」的 API；可用的手段是：(a) 图在 interrupt/节点级中断暂停后 `update_state(config, values, as_node=...)` 再继续（`pregel/main.py@e539ac1` L2515-2540）；(b) `RunControl.request_drain(reason)` 请求**协作式排空**（run-scoped，线程安全，仅一个标志位）（`langgraph:libs/langgraph/langgraph/runtime.py@e539ac1` L79-100）；(c) v3 `GraphRunStream.abort()` 提前终止（关闭迭代器、取消在途节点）（`stream/run_stream.py@e539ac1` L185-208）。
- deepagents 的异步（远程）子代理有 `update_async_task` 工具，向后台运行中的子代理发送更新（`deepagents:libs/deepagents/deepagents/middleware/async_subagents.py@c08cae6` L567）；本地同步子代理无此能力。
- 结论：主循环层面 steering = 「中断后 resume/update_state」，非实时插入（推断）。

### 2.7 上下文压缩

| 中间件 | 介入位置 | 触发/保留 | 效果 | 出处 |
|---|---|---|---|---|
| `SummarizationMiddleware`（LangChain） | `before_model` | `trigger`：`ContextSize` 元组 `("fraction", f)`/`("tokens", n)`/`("messages", n)`、`TriggerClause` dict（AND）、列表（OR）；**默认 `trigger=None` → `_trigger_clauses` 为空 → 永不触发**；`keep=("messages", 20)`；`fraction` 依赖模型 profile 的 `max_input_tokens` | 返回 `{"messages": [RemoveMessage(id=REMOVE_ALL_MESSAGES), HumanMessage(summary), *preserved]}`，**重写状态**；切点保证 AI/Tool 对不拆开 | `middleware/summarization.py@15b5f57` L98-100、L187-215、L398-432、L617-657 |
| `ContextEditingMiddleware`（LangChain） | `wrap_model_call` | `ClearToolUsesEdit(trigger=100_000 tokens, clear_at_least=0, keep=3, clear_tool_inputs=False, exclude_tools=(), placeholder)` | 深拷贝后编辑请求消息，`handler(request.override(messages=edited))`，**不改状态** | `middleware/context_editing.py@15b5f57` L58-76、L250-274 |
| `_DeepAgentsSummarizationMiddleware`（deepagents） | `wrap_model_call` | 模型有 profile 时 `trigger=("fraction",0.85)`、`keep=("fraction",0.10)`；否则 `("tokens",170000)`/`("messages",6)`；另有 `truncate_args_settings` 先裁大 `write_file/edit_file` 参数 | 被驱逐消息写入 backend `/conversation_history/{session_id}.md`；摘要状态存私有字段 `_summarization_event`，**不重写 `state["messages"]`**；捕获 provider 上下文溢出错误后摘要重试 | `deepagents:.../middleware/summarization.py@c08cae6` L262-296、L1757-1800 |
| `SummarizationToolMiddleware`（deepagents） | 工具 `compact_conversation` | 仅模型/用户显式调用；有资格门槛 | 手动压缩 | 同上 L1924-1940 |
| `FilesystemMiddleware`（deepagents） | `wrap_tool_call` | 大工具结果超 token 阈值 | 结果卸载到文件系统 | `deepagents:.../middleware/filesystem.py@c08cae6` L1696-1698 |

### 2.8 Subagent（deepagents）

- `SubAgentMiddleware` 通过 `tools=[task]` 贡献 `task(description, subagent_type)` 工具，并用 `wrap_model_call` 把子代理列表追加到系统提示（`deepagents:libs/deepagents/deepagents/middleware/subagents.py@c08cae6` L842-988）。
- 每个 `SubAgent` 规格（`name, description, tools, model, middleware, interrupt_on, skills, permissions, response_format, system_prompt, mode="isolated"|"fork"`）在装配期被 `create_agent` 编译为独立图；`CompiledSubAgent` 允许传入任意 runnable（须返回含 `messages` 的状态）。同文件 L66-135、L220-310、L640-676。
- 执行方式：`task` 工具内 `subagent.invoke(subagent_state, {"configurable": {"ls_agent_type": "subagent"}})`——**同步阻塞的子图调用**，在 tools 节点的一个任务内运行（不是父图节点）。同文件 L766-795。
- 上下文隔离：`isolated`（默认）模式 `messages=[HumanMessage(description)]`，其余 state 复制但剔除 `_EXCLUDED_STATE_KEYS` 与 `private_state_keys`；`fork` 模式继承父级消息（`_fork_messages`）并标记 `_deepagents_forked_context`，forked 子代理再调 `task` 会被拒绝（`_FORK_RECURSION_REFUSAL`）。同文件 L732-765、L54-66。
- 返回：取子代理最后一条非空 `AIMessage` 文本（或 `structured_response` JSON）作为 `ToolMessage`，并把非私有状态键合并回父状态（`Command(update=...)`）。同文件 L677-706。
- `AsyncSubAgentMiddleware`：通过 LangGraph SDK 在远程 Agent Protocol 服务器启动后台运行，工具 `start_async_task`/`check_async_task`/`update_async_task`/`cancel_async_task`/`list_async_tasks`。`middleware/async_subagents.py@c08cae6` L1-12、L333-799。
- 默认 `general-purpose` 子代理由 `create_deep_agent` 自动插入到 subagents 首位（`graph.py@c08cae6` L797-859「general_purpose_spec」段）。
- 流式可见性：`SubagentTransformer` 依据 `lc_agent_name` 变化识别子代理边界并挂到 `run.subagents`（`langchain:libs/langchain_v1/langchain/agents/_subagent_transformer.py@15b5f57` L1-20）。

### 2.9 后台 / Durable execution

| 项 | 事实 | 出处 |
|---|---|---|
| checkpointer | `create_agent(checkpointer=...)` → `graph.compile(checkpointer=...)`；每步写 checkpoint，按 `config["configurable"]["thread_id"]` 分线程 | `factory.py@15b5f57` L1839；文档 https://docs.langchain.com/oss/python/langgraph/interrupts（2026-09-14） |
| `durability` | `Durability = "sync" | "async" | "exit"`：sync=下一步前同步持久化；async=与下一步并行持久化；exit=仅在退出时持久化；`stream()/invoke()` 参数 | `langgraph:libs/langgraph/langgraph/types.py@e539ac1` L89-95；`pregel/main.py@e539ac1` L2655-2670 |
| 后台运行 | 本地库无「后台运行」原语；deepagents 的异步子代理依赖远程 LangGraph Server（`langgraph_sdk`）。LangGraph Platform/Server 的 run 队列本次未覆盖 | `async_subagents.py@c08cae6` L1-12 |
| Runtime 注入 | 节点/中间件/工具可拿 `Runtime{context, store, stream_writer, previous, execution_info, server_info, control, heartbeat}`；`ToolRuntime` 额外带 `state, tool_call_id, config, tools`，并有 `emit_output_delta` | `runtime.py@e539ac1` L107-130；`tool_node.py@e539ac1` L1663-1752 |

## 3. 事件

### 3.1 LangGraph `stream_mode`

`StreamMode = Literal["values", "updates", "checkpoints", "tasks", "debug", "messages", "custom"]`（`langgraph:libs/langgraph/langgraph/types.py@e539ac1` L122-136）。

| 模式 | 产出 | 备注 |
|---|---|---|
| `values` | 每步之后的完整状态（含 interrupts） | 函数式 API 只在结束时发一次 |
| `updates` | 每步各节点/任务返回的更新，`{node_name: update}`；同一步多节点分别发出 | |
| `messages` | `(AIMessageChunk, metadata)` 二元组，逐 token；metadata 含 `langgraph_step`、`langgraph_node`、`langgraph_triggers`、`langgraph_path`、`langgraph_checkpoint_ns`、`tags` 等 | `pregel/_algo.py@e539ac1` L655-659 |
| `custom` | 节点/工具内 `StreamWriter`（`get_stream_writer()` 或 `writer` 参数）写入的任意对象 | |
| `checkpoints` | checkpoint 创建事件，格式同 `get_state()` | 需 checkpointer |
| `tasks` | 任务开始/结束：`TaskPayload{id,name,input,triggers,metadata}` / `TaskResultPayload{id,name,error,interrupts,result}` | `types.py@e539ac1` L144-178 |
| `debug` | checkpoints + tasks | |

多个模式可传列表，产出 `(mode, data)`；`subgraphs=True` 时带命名空间元组 `ns`；`stream(version="v2")` 用统一 `StreamPart`/`GraphOutput`（`types.py@e539ac1` L371；文档 https://docs.langchain.com/oss/python/langgraph/streaming 2026-09-14）。v1 格式下中断以 `__interrupt__` 键出现。

### 3.2 `astream_events` v2（Runnable 事件）

事件名由 `_AstreamEventsCallbackHandler` 生成，格式 `on_{run_type}_{start|stream|end}`（`langchain:libs/core/langchain_core/tracers/event_stream.py@15b5f57` L209、L585-609、L886-990）；固定名有 `on_chat_model_start`、`on_llm_start`、`on_tool_start`、`on_tool_end`、`on_tool_error`、`on_retriever_start`、`on_retriever_end`、`on_custom_event`。文档表（`langchain:libs/core/langchain_core/runnables/base.py@15b5f57` L1414-1428）：

| 事件 | 触发 | `data` 载荷 |
|---|---|---|
| `on_chat_model_start` / `on_chat_model_stream` / `on_chat_model_end` | 聊天模型 | `input={"messages": [[...]]}`；`chunk=AIMessageChunk`；`output=AIMessageChunk` |
| `on_llm_start` / `on_llm_stream` / `on_llm_end` | 文本 LLM | `input`、`chunk`、`output` |
| `on_chain_start` / `on_chain_stream` / `on_chain_end` | 任意 Runnable/图节点 | `input`、`chunk`、`output` |
| `on_tool_start` / `on_tool_end` / `on_tool_error` | 工具 | `input=args`；`output`；error |
| `on_retriever_start` / `on_retriever_end` | 检索器 | `input={"query"}`；`output=[Document]` |
| `on_prompt_start` / `on_prompt_end` | 提示模板 | |
| `on_custom_event` | `adispatch_custom_event(name, data)` | `name`、`data` |

每个事件还带 `name`、`run_id`、`parent_ids`、`tags`、`metadata`。`on_chain_error`/`on_llm_error` 未在 event_stream.py 中作为事件名出现（异常直接传播）；仅 `on_tool_error` 有事件（同文件 L715）。

### 3.3 `stream_events(version="v3")`（实验性，LangGraph 1.2.x 新增）

- `Pregel.stream_events(..., version="v3", transformers=...)` 返回 `GraphRunStream`，调用者迭代驱动（无后台线程）；不接受 `stream_mode`/`subgraphs`；`run.output`、`run.interrupted`、`run.interrupts` 始终可用。`pregel/main.py@e539ac1` L3638-3715。
- 原始事件为 `ProtocolEvent{type:"event", event_id, seq, method(StreamMode 值), params{namespace, timestamp, data, interrupts}}`，由 `StreamMux` 交给一组 `StreamTransformer`（`init/process/aprocess/finalize/fail`，`before_builtins`、`required_stream_modes`）投影成通道。`stream/_types.py@e539ac1` L28-115。
- 内建投影键：`values`、`custom`、`updates`、`messages`（`ChatModelStream`，事件 `message-start`/`content-block-start`/`content-block-delta`/`content-block-finish`/`message-finish`）、`lifecycle`、`subgraphs`、`checkpoints`、`debug`、`tasks`；prebuilt `ToolCallTransformer` → `run.tool_calls`（`ToolCallStream`，事件 `tool-started`/`tool-output-delta`/`tool-finished`/`tool-error`）；LangChain `SubagentTransformer` → `run.subagents`；`InternalCallTransformer` 把中间件内部模型调用（如摘要）从 `run.messages` 过滤。`stream/transformers.py@e539ac1` L28-1030；`langgraph:libs/prebuilt/langgraph/prebuilt/_tool_call_stream.py@e539ac1` L1-30；`langgraph:.../pregel/_tools.py@e539ac1` L159；`langchain:.../middleware/internal_call_transformer.py@15b5f57` L1-20。
- 回调侧新增 `on_stream_event(event: MessagesData, run_id, ...)`，每个 v3 消息协议事件触发一次，与 `on_llm_new_token` 并存。`callbacks/base.py@15b5f57` L128-153。

### 3.4 回调处理器方法全表

`BaseCallbackHandler` 由 mixin 组成（`langchain:libs/core/langchain_core/callbacks/base.py@15b5f57`）；`AsyncCallbackHandler` 提供同名 async 版本：

| Mixin | 方法 |
|---|---|
| `LLMManagerMixin` | `on_llm_new_token`、`on_llm_end`、`on_llm_error`、`on_stream_event` |
| `ChainManagerMixin` | `on_chain_end`、`on_chain_error`、`on_agent_action`、`on_agent_finish` |
| `ToolManagerMixin` | `on_tool_end`、`on_tool_error` |
| `RetrieverManagerMixin` | `on_retriever_end`、`on_retriever_error` |
| `CallbackManagerMixin` | `on_llm_start`、`on_chat_model_start`、`on_retriever_start`、`on_chain_start`、`on_tool_start` |
| `RunManagerMixin` | `on_text`、`on_retry`、`on_custom_event` |

`on_agent_action`/`on_agent_finish` 是旧 `AgentExecutor` 时代的回调；`create_agent` 生成的图不调用它们（`factory.py` 中无引用，推断）。

### 3.5 deepagents 是否新增事件

未新增事件类型。deepagents 通过 `ToolMessage.artifact`（`ExecuteArtifact`）、私有状态字段与 LangSmith 元数据（`ls_integration`、`ls_agent_type="subagent"`、`lc_agent_name`）区分，`_messages_reducer.py` 明确说明流式在输出侧走 `astream_events`（`deepagents:.../graph.py@c08cae6` 末尾；`_messages_reducer.py@c08cae6` L1-8）。`RubricMiddleware` 有 `rubric_grader` 工具与 `RUBRIC_GRADER_MESSAGE_SOURCE` 常量，非事件。

## 4. Hooks / 中间件

### 4.1 `AgentMiddleware` 全部 hook

类属性：`state_schema`、`tools: Sequence[BaseTool]`、`trace_policy`、`transformers`、`name`（默认类名）。`langchain:.../middleware/types.py@15b5f57` L385-430。

| Hook（sync/async） | 时机 | 输入 | 可返回 | `jump_to` | 能否阻断/改写 | 出处 |
|---|---|---|---|---|---|---|
| `before_agent` / `abefore_agent` | 每次 invoke 开始一次（tools 回环**不**再经过） | `state, runtime` | `dict` 状态更新 / `Command` / `None` | 声明 `can_jump_to` 后可 `"end"`/`"model"`/`"tools"`（`_add_middleware_edge` 对所有四类节点式 hook 均生效） | 可改状态；可跳过整轮 | types L431-453；factory L1727-1748 |
| `before_model` / `abefore_model` | 每次模型调用前 | 同上 | 同上 | 同上 | 可重写 `messages`（如摘要）；`jump_to="end"` 阻断 | types L455-477 |
| `after_model` / `aafter_model` | 每次模型响应后、路由前 | 同上 | 同上 | 同上 | 可改写 AIMessage.tool_calls（HITL）、注入人工 ToolMessage、`jump_to` | types L479-501 |
| `after_agent` / `aafter_agent` | 循环结束后一次 | 同上 | 同上 | 同上（`"model"` 可重新进入循环） | 清理（ShellTool）、评分（Rubric `can_jump_to=["model"]`） | types L650-672 |
| `wrap_model_call` / `awrap_model_call` | 包裹每次模型执行 | `request: ModelRequest{model, messages, system_message, tool_choice, tools, response_format, state, runtime, model_settings}`、`handler` | `ModelResponse` / `AIMessage` / `ExtendedModelResponse(model_response, command)` | 不支持 `goto/resume/graph`（抛 `NotImplementedError`），用 node hook 代替 | 可改写请求（`request.override(...)`，直接赋属性已弃用）、重试、短路不调模型、改写响应；`ExtendedModelResponse.command` 经 reducer 追加状态 | types L503-648、L87-270；factory L213-262 |
| `wrap_tool_call` / `awrap_tool_call` | 包裹每次工具执行（每个 tool call 独立） | `request: ToolCallRequest{tool_call, tool(None=未注册), state, runtime: ToolRuntime}`、`handler` | `ToolMessage` / `Command` | — | 可改参数（`override(tool_call=)`）、重试、短路、拦截未注册工具、把异常转 ToolMessage | types L674-830；`tool_node.py@e539ac1` L133-200 |

`jump_to` 值：`JumpTo = Literal["tools", "model", "end"]`；`"model"` 解析到循环入口（第一个 before_model），`"end"` 到出口（最后一个 after_agent）。`types.py` L68；`factory.py` L1887-1899。必须用 `@hook_config(can_jump_to=[...])` 或装饰器参数声明，否则不会建条件边（`factory.py` L523-558、L2040-2075）。

### 4.2 执行顺序

- `before_*`：注册正序；`after_*`：逆序；`wrap_*`：列表首个为最外层（`_chain_model_call_handlers`/`_chain_tool_call_wrappers` 两两 compose）。`factory.py@15b5f57` L263-354、L658-770；文档 https://docs.langchain.com/oss/python/langchain/middleware/custom（2026-09-14）「before_* First to last; after_* Last to first; wrap_* Nested」。
- `ExtendedModelResponse.command` 多层叠加时按 reducer 合并，非 reducer 字段外层覆盖内层。`types.py` L290-320。
- 每个 hook 用 `traceable(name=f"{m.name}.wrap_model_call")` 打 LangSmith span，`TracePolicy(process_inputs=omit_payload)` 可省略载荷。`factory.py` L1053、L158-195。

### 4.3 装饰器与工具/状态贡献

- 装饰器：`@before_agent`、`@before_model`、`@after_model`、`@after_agent`（参数 `state_schema`、`tools`、`can_jump_to`、`name`）、`@wrap_model_call`、`@wrap_tool_call`、`@dynamic_prompt`（wrap_model_call 的便捷形式，返回 str/SystemMessage 设为系统提示）、`@hook_config(can_jump_to=)`。`types.py@15b5f57` L879-2200。
- `tools` 贡献：`middleware_tools = [t for m in middleware for t in m.tools]` 进入 ToolNode 与 `default_tools`。`factory.py` L1035、L1084。
- `state_schema` 贡献：合并进图 schema；`OmitFromSchema`/`OmitFromInput`/`OmitFromOutput`/`PrivateStateAttr` 控制输入/输出投影。`types.py` L328-347。

### 4.4 内置中间件清单（LangChain）

`langchain.agents.middleware` 导出（`middleware/__init__.py@15b5f57`）：

| 中间件 | hook | 介入位置/要点 |
|---|---|---|
| `SummarizationMiddleware` | `before_model` | 见 §2.7；声明 `transformers=(InternalCallTransformer,)` |
| `ContextEditingMiddleware`（`ClearToolUsesEdit`） | `wrap_model_call` | 请求内编辑 |
| `HumanInTheLoopMiddleware` | `after_model` | 见 §2.5 |
| `ToolCallLimitMiddleware` | `after_model`（`can_jump_to=["end"]`），state `ToolCallLimitState` | `tool_name`、`thread_limit`、`run_limit`、`exit_behavior` |
| `ModelCallLimitMiddleware` | `before_model`+`after_model`（`can_jump_to=["end"]`），state `ModelCallLimitState` | `thread_limit`、`run_limit`、`exit_behavior="end"|"error"` |
| `ModelFallbackMiddleware` | `wrap_model_call` | 模型序列回退 |
| `ModelRetryMiddleware` | `wrap_model_call` | 退避重试 |
| `ToolRetryMiddleware` | `wrap_tool_call` | 退避重试 |
| `ToolErrorMiddleware` | `wrap_tool_call` | 异常→ToolMessage |
| `TodoListMiddleware` | `after_model` + `wrap_model_call`，tools=[`write_todos`]，state `PlanningState` | 规划提示注入 |
| `ShellToolMiddleware` | `before_agent`/`after_agent`，tools=[shell]，state `ShellToolState` | 会话启动/关闭；`HostExecutionPolicy`/`CodexSandboxExecutionPolicy`/`DockerExecutionPolicy`；`RedactionRule` |
| `PIIMiddleware` | `before_model`+`after_model`（`can_jump_to=["end"]`） | `strategy="block"|"redact"|"mask"|"hash"`；block 抛 `PIIDetectionError` |
| `FilesystemFileSearchMiddleware` | 仅 tools（glob/grep 类） | `root_path`、`use_ripgrep` |
| `LLMToolSelectorMiddleware` | `wrap_model_call` | 用 LLM 缩减 `request.tools` |
| `LLMToolEmulator` | `wrap_tool_call` | 用 LLM 伪造工具结果 |
| `ProviderToolSearchMiddleware` | `wrap_model_call` + tools | provider 侧工具搜索 |

（hook 归属由源码 `def` 抓取，`middleware/*.py@15b5f57`。）

### 4.5 deepagents 默认栈与可替换性

`create_deep_agent(model, tools, *, system_prompt, middleware, subagents, skills, memory, permissions, backend, interrupt_on, response_format, state_schema, context_schema, checkpointer, store, debug, name, cache)`（`deepagents:libs/deepagents/deepagents/graph.py@c08cae6` L271-291）。主代理栈顺序（源码装配段 + docstring）：

| 序 | 中间件 | hook | 条件 |
|---|---|---|---|
| 1 | `SkillsMiddleware` | `before_agent` + `wrap_model_call` | `skills` 提供 |
| 2 | `FilesystemMiddleware` | `wrap_model_call` + `wrap_tool_call`；tools `ls/read_file/write_file/edit_file/glob/grep/delete/execute`；state `FilesystemState.files`（`DeltaChannel`） | 必选（`_REQUIRED_MIDDLEWARE`，profile 不能剔除） |
| 3 | `SubAgentMiddleware` | `wrap_model_call`；tools `task` | 有内联 subagent（含自动加入的 `general-purpose`）；必选 |
| 4 | `_DeepAgentsSummarizationMiddleware`（`create_summarization_middleware`） | `wrap_model_call` | 总是 |
| 5 | `PatchToolCallsMiddleware` | `before_agent` | 总是；补齐悬空 tool call 的 ToolMessage |
| 6 | `AsyncSubAgentMiddleware` | `wrap_model_call`；5 个 async 工具 | 有 `AsyncSubAgent` |
| — | **用户 `middleware` 插入点**：同名替换原位，否则插在最后一个核心项之后（`_apply_custom_middleware(core_names=...)`） | | |
| 7 | profile `extra_middleware` | | `HarnessProfile` 定义 |
| 8 | `AnthropicPromptCachingMiddleware`（+ Bedrock/Fireworks 版本，装了才加） | | 总是（非对应模型 no-op） |
| 9 | `MemoryMiddleware` | `before_agent`（加载 AGENTS.md 到私有 `memory_contents`）+ `wrap_model_call`（注入系统提示） | `memory` 提供 |
| 10 | `HumanInTheLoopMiddleware` | `after_model` | `interrupt_on` 或 `permissions` 中含 `mode="interrupt"` 规则（`_build_interrupt_on_from_permissions` 生成带 `when` 谓词的条目） |
| 11 | `_ToolExclusionMiddleware` | `wrap_model_call` + `wrap_tool_call` | profile `excluded_tools` |

出处：`graph.py@c08cae6` L204-270（合并规则与 `_REQUIRED_MIDDLEWARE`）、docstring「The full ordering is」段、装配段 L862-930 附近（`deepagent_middleware.append(...)`）；`middleware/_fs_interrupt.py@c08cae6` L1-8；https://docs.langchain.com/oss/python/deepagents/customization（2026-09-14）。

- **`TodoListMiddleware` 已不在默认栈**：CHANGELOG 记录 `create_deep_agent` 不再默认包含 `TodoListMiddleware`/`write_todos`/`todos` 通道，需要时 `middleware=[TodoListMiddleware()]`（`deepagents:libs/deepagents/CHANGELOG.md@c08cae6` L106）。`ARCHITECTURE.md` 仍提到 todo，已过时。
- 剔除：`HarnessProfile.excluded_middleware`（类或 `name` 字符串）可过滤，但剔除 `FilesystemMiddleware`/`SubAgentMiddleware` 抛 `ValueError`。`graph.py` L240-262；`profiles/harness/harness_profiles.py@c08cae6` L483+（字段 `base_system_prompt, system_prompt_suffix, tool_description_overrides, excluded_tools, excluded_middleware, extra_middleware, general_purpose_subagent`）。
- 子代理栈：`Skills`（在 Patch 之后）、`Filesystem`、摘要、`PatchToolCalls`、profile extras、prompt caching、`Memory`、`HITL`；无 `SubAgentMiddleware`；父级 `middleware` 会作为可继承项合并进子代理（`graph.py` L689-790 附近）。
- 状态：`DeepAgentState.messages` 用 `DeltaChannel(_messages_delta_reducer, snapshot_frequency=50)` 让 checkpoint 增长线性（`graph.py` L73-76；`_messages_reducer.py`）。

### 4.6 与旧版 `AgentExecutor` 的差异

旧 `AgentExecutor` 只能通过 `BaseCallbackHandler.on_agent_action/on_agent_finish` 等**只读回调**观察，无法改写请求或跳转；v1 中间件是图节点/包装器，能改状态、改写 `ModelRequest`/`ToolCallRequest`、短路和 `jump_to`（对比 `callbacks/base.py` 与 `types.py`，推断）。`langgraph.prebuilt.create_react_agent` 的 `AgentState` 已标 `@deprecated` 指向 `langchain.agents`（`langgraph:libs/prebuilt/langgraph/prebuilt/chat_agent_executor.py@e539ac1` L53-60）。

## 5. 持久化与恢复

| 项 | 事实 | 出处 |
|---|---|---|
| Checkpointer 实现 | `InMemorySaver`（别名 `MemorySaver`）、`SqliteSaver`/`AsyncSqliteSaver`、`PostgresSaver`/`AsyncPostgresSaver`/`ShallowPostgresSaver`/`AsyncShallowPostgresSaver`；基类 `BaseCheckpointSaver` | `langgraph:libs/checkpoint/langgraph/checkpoint/memory/__init__.py@e539ac1` L625；`libs/checkpoint-sqlite`、`libs/checkpoint-postgres`@e539ac1 |
| Store 实现 | `BaseStore`、`InMemoryStore`、`PostgresStore`/`AsyncPostgresStore` | 同上 |
| thread_id | `config={"configurable": {"thread_id": ...}}`；同 id 续同一 checkpoint | 文档 interrupts（2026-09-14） |
| Time travel | `get_state(config)`、`get_state_history(config, filter, before, limit)` → `StateSnapshot`；`update_state(config, values, as_node, task_id)` 以指定节点身份写入并产生新 checkpoint（fork）；`bulk_update_state` | `pregel/main.py@e539ac1` L1392、L1480-1495、L2515-2540、L1590 |
| interrupt 后 resume | `Command(resume=值或{id: 值})`，节点从头重跑；HITL 中间件的 resume 载荷形如 `{"decisions": [...]}` | `types.py@e539ac1` L851-905；`human_in_the_loop.py@15b5f57` L458 |
| `durability` | `"sync"/"async"/"exit"` | `types.py@e539ac1` L89-95 |
| deepagents 短期/长期 | 图状态与 checkpoint = 线程内；文件/记忆持久化走 backend：`StateBackend`（默认，存于状态 `files`，线程内）、`FilesystemBackend`、`StoreBackend(namespace=lambda rt: (...), store=None→运行时 `get_store()`)`（跨线程）、`CompositeBackend(default=..., routes={"/memories/": StoreBackend(...), "/skills/": ...})` 按路径前缀路由、`LocalShellBackend`、`LangSmithSandbox`、`ContextHubBackend`；`SandboxBackendProtocol` 提供 `execute` | `deepagents:.../backends/__init__.py@c08cae6`；`backends/store.py@c08cae6` L90-120；`backends/protocol.py@c08cae6` L404-912；`graph.py@c08cae6` L637；https://docs.langchain.com/oss/python/deepagents/memory（2026-09-14） |
| deepagents `memory=` | AGENTS.md 规范文件路径列表，`MemoryMiddleware.before_agent` 从 backend 读入 `memory_contents`（私有状态，同线程只读一次），`wrap_model_call` 拼进系统提示；`skills=` 为按需加载的过程性记忆 | `middleware/memory.py@c08cae6` L1-30、L88-102、L279-385 |

## 6. 小结表：循环阶段 → 事件 → hook/中间件 → 能否阻断/改写

| 循环阶段 | 对应事件（v2 `astream_events` / `stream_mode` / v3） | 对应 hook / 中间件 | 能否阻断/改写 |
|---|---|---|---|
| 运行开始 | `on_chain_start`（图）/ `tasks` start / v3 `lifecycle` | `before_agent`（PatchToolCalls、Memory、Skills、ShellTool、Rubric） | 可改状态；`jump_to="end"` 跳过整轮 |
| 模型调用前 | `on_chain_start`（`X.before_model` 节点）/ `updates` | `before_model`（Summarization、ModelCallLimit、PII） | 可重写 messages；`jump_to` 阻断 |
| 模型调用中 | `on_chat_model_start/stream/end`、`messages` 模式 token、v3 `run.messages`、回调 `on_llm_new_token`/`on_stream_event` | `wrap_model_call`（ContextEditing、ModelRetry、ModelFallback、ToolSelector、dynamic_prompt、deepagents 摘要/Skills/Memory/SubAgent/ToolExclusion/PromptCaching） | 可改写请求、短路、重试、改写响应；不能 `goto` |
| 模型响应后、路由前 | `on_chain_end`（model）/ `updates {"model": ...}` | `after_model`（HITL、ToolCallLimit、ModelCallLimit、PII、TodoList） | 可改 tool_calls、注入 ToolMessage、`interrupt()`、`jump_to` |
| 路由 | 无独立事件（条件边 `trace=False`） | `_make_model_to_tools_edge`（只读 `jump_to`/tool_calls/structured_response） | 由前一阶段的状态决定 |
| 工具执行 | `on_tool_start/end/error`、v3 `run.tool_calls`（`tool-started/-output-delta/-finished/-error`）、`custom`（`stream_writer`） | `wrap_tool_call`（ToolRetry、ToolError、ToolEmulator、deepagents Filesystem 权限/卸载、ToolExclusion）、`ToolNode.handle_tool_errors` | 可改参数、短路、拦截未注册工具、异常转 ToolMessage；工具可返回 `Command` |
| 子代理 | 子图事件（`subgraphs=True` 的 ns / v3 `run.subagents`），期间父级 `on_tool_start`→`on_tool_end` | deepagents `task` 工具（同步 `invoke` 子图） | 子代理自有中间件栈；结果作为 ToolMessage 回填 |
| 中断/恢复 | `values` 含 `__interrupt__` / v3 `run.interrupts`；恢复后节点从头重跑 | `interrupt()`、`Command(resume=)`、`interrupt_before/after` | 恢复前可 `update_state` |
| 循环结束 | `on_chain_end`（图）/ `tasks` end / `checkpoints` | `after_agent`（ShellTool 清理、Rubric 评分可 `jump_to="model"`） | 可改状态、可重入循环 |

## 7. 局限与未覆盖

- 官方文档抓取仅覆盖 overview/custom/streaming/interrupts/persistence/customization/memory 页面，且 `docs.langchain.com` 页面提取不完整（durability、built-in middleware 页未成功提取）；相关结论以源码为准。
- LangGraph Platform/Server 的后台运行、run 队列、`langgraph_sdk` 细节未覆盖；v3 `stream_events` 标注「experimental」，API 可能变化。
- JS 版仅核对文档：hook 名为 `beforeAgent/beforeModel/afterModel/afterAgent/wrapModelCall/wrapToolCall`，用 `createMiddleware({name, ...})` 定义，`jumpTo` + `canJumpTo`（https://docs.langchain.com/oss/javascript/langchain/middleware/custom，2026-09-14）；deepagents JS 包 `deepagents`/`createDeepAgent`，文档称功能对齐（https://docs.langchain.com/oss/javascript/deepagents/overview，2026-09-14）。未读 JS 源码，内置中间件清单差异**未覆盖**。
- `ExecutionInfo`、`server_info`、`heartbeat` 语义、`ToolRuntime.emit_output_delta` 的具体流式路径、`SubgraphTransformer` 细节未深入。
- deepagents `RubricMiddleware`、`SkillsMiddleware` 的内部逻辑、`profiles/` 中各模型 profile 内容、`_video.py`、`_overflow_clip.py`、`_message_eviction.py` 未展开。
- HITL 在并行工具调用 + 部分 reject 的完整路由（`model_to_tools` 第 4/6 条组合）未做运行验证，属推断。
- 所有结论基于上述三个提交的浅克隆，未运行任何代码。
