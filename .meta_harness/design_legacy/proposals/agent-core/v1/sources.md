# 研究依据与术语映射

取证日期：2026-09-11。以下是社区事实的来源；具体 OHL 模型字段与取舍是本提案，不冒充上游定义。

## 任务来源与重试

- DSH 系统提示词：gpt-5.6-sol，第 1 次重试完成。
- LangChain 系统提示词：gpt-5.6-sol，第 1 次重试完成。
- Pi 系统提示词：gpt-5.6-sol 返回报告；其中 fork 链接只作线索，主代理重新读取官方重定向后的仓库。
- 工具：gpt-5.6-terra 返回中间报告后失败；第 1 次重试完成关键身份与契约核查。
- DSH / OMNE 执行层：gpt-5.6-sol，均在第 2 次重试完成。
- Pi 执行层：gpt-5.6-sol 第 1 次重试给出中间报告后失败；主代理核对官方源码，第 2 次重试完成独立复核。

重试上限均未超过用户约定的三次。完成任务不重复派发。

## 系统提示词三方对照

| 社区 | 已核事实 | 设计启示（推导） |
|---|---|---|
| DSH | scoped service 收集 sections/variables/contexts/tool schemas，每 Step 组装；同 Step retry 复用；不是持久 Prompt 聚合 | owner 与 disposer 清晰；按 Step 生成一致请求视图 |
| Pi | coding-agent 构建基础字符串；extensions before_agent_start 可修改；底层 prepareNextTurn 支持后续模型周期换 context | 配置、扩展贡献与实际请求区分；不要把 Pi 的 turn 一概当用户输入轮 |
| LangChain | 静态 system message 与 messages state 分开；dynamic middleware 在 model-call 路径计算；retry 求值次数受 middleware 顺序影响 | 显式规定 OHL 每 Step 一次解析及 retry 复用，避免依赖装配顺序定义语义 |

DSH 固定 commit `c291e7961a515f6d7af9304e7fd1d257929aef26`：
[SystemPrompt 文档](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/system-prompt/README.md)、
[SystemPrompt 源码](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/system-prompt/src/index.ts)、
[Agent Loop](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent-loop/src/agent.ts)。

Pi：原 `badlogic/pi-mono` 官方地址重定向到 `earendil-works/pi`；主代理固定读取
`62129190d81067ec86ae5a5fc907c96bfe435a78`：
[system-prompt.ts](https://github.com/earendil-works/pi/blob/62129190d81067ec86ae5a5fc907c96bfe435a78/packages/coding-agent/src/core/system-prompt.ts)、
[extensions](https://github.com/earendil-works/pi/blob/62129190d81067ec86ae5a5fc907c96bfe435a78/packages/coding-agent/docs/extensions.md)、
[agent-loop.ts](https://github.com/earendil-works/pi/blob/62129190d81067ec86ae5a5fc907c96bfe435a78/packages/agent/src/agent-loop.ts)、
[types.ts](https://github.com/earendil-works/pi/blob/62129190d81067ec86ae5a5fc907c96bfe435a78/packages/agent/src/types.ts)、
[compaction](https://github.com/earendil-works/pi/blob/62129190d81067ec86ae5a5fc907c96bfe435a78/packages/coding-agent/docs/compaction.md)。
先前报告的 1kuna / ai-cre / pipiha 等 fork 不作为权威依据。Pi 没有这里提出的持久 SystemPromptProfile。

LangChain 使用本次读取的官方在线文档，未锁 release，后续采用 API 前须重新 pin：
[Agents](https://docs.langchain.com/oss/python/langchain/agents)、
[dynamic prompt](https://docs.langchain.com/oss/python/langchain/middleware/custom#dynamic-prompt)、
[Runtime](https://docs.langchain.com/oss/python/langchain/runtime)、
[factory 源码](https://github.com/langchain-ai/langchain/blob/master/libs/langchain_v1/langchain/agents/factory.py)、
[middleware types](https://github.com/langchain-ai/langchain/blob/master/libs/langchain_v1/langchain/agents/middleware/types.py)。

## 执行术语不是同义词

| 概念 | DSH | Pi | OMNE 当前权威设计 | OHL 本提案 |
|---|---|---|---|---|
| Session | 持久类型化日志 | 持久会话历史与分支 | canonical session_id 的延续身份 | 采用 OMNE 身份/控制边界，日志可派生上下文 |
| Turn | admitted-input drain，0..N Steps | 低层 agent-loop event Turn：一次 assistant response + 工具批 | UserChatTurn 输入接纳实体 | 保留 OMNE 输入身份 |
| Run | 非固有日志 bracket；whole-agent idle 不能任意归因 | 低层 agent_start/end 活动；settled 是更高层观察 | 逻辑 invocation，技术恢复保 run_id | 逻辑执行与输入 batch |
| Step | 逻辑模型周期 + 工具，内有多次 retry | 无独立同名持久聚合 | 无正式 Step；有 logical action slot | 采用 DSH 周期，另以 action slot 承载重放 |

DSH：[glossary](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/glossary.md)、
[session](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/subsystems/session.md)、
[checkpoint policy](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/session/session-checkpoint-policy/README.md)。
Pi 粒度由上述 agent-loop/types 中的 turn_start/turn_end 与 retry/prepareNextTurn 路径核实。

## OMNE 本地来源

根目录：`/data/qiwei/repos/omne-next/omne_harness`；主代理读取时 HEAD 为
`fe913ebf19d1555d7814e8335aca99a639374055`。该仓同时有其他 session 工作，以下为工作树读取来源，
不能把 HEAD 视为未提交内容的永久快照；采用前应复核相关文件差异。

| 路径（相对上述根） | 采用范围与状态 |
|---|---|
| `contracts/schemas/common/component.schema.json` | 共享 ComponentRef/Profile/ToolVariant 的结构权威 |
| `libs/omne_harness_contracts/omne_harness_contracts/component_schema.py` | 生成的语言绑定，辅助确认，不反向代替 Schema |
| `adrs/accepted/ADR-120-tool-result-ledger-offloading-and-retrieval.md` | 结果 custody、独立 row_id、读取与墓碑 |
| `adrs/accepted/ADR-127-tool-execution-fact-and-transparency.md` | execution_id 与骨架事件投影，不是台账主键 |
| `libs/omne_harness_runtime_plane/omne_harness_runtime_plane/domain/aggregates/tool_result.py` | 当前 row_id 字段与 store 自铸身份验证 |
| `libs/omne_harness_runtime_plane/omne_harness_runtime_plane/domain/aggregates/detached_work_order.py` | 工作单身份、claim/redrive 与执行引用 |
| `requirements/capabilities/resource-model-capability-tier-aware-tool-provisioning.md` | **accepted/committed-future**；不是已交付选择引擎 |
| `design_docs/subsystems/cross-subsystem/official-harness-capability-discovery-and-invocation.md` | 声明、发现、请求与授权分离 |
| `adrs/accepted/ADR-130-state-managed-execution-authority.md` | State 控制 Run，Runtime 执行 attempts；替代旧 Runtime ownership 描述 |
| `adrs/accepted/ADR-131-session-input-batching-and-command-scheduling.md` | 有序输入批次，恢复不重扫队列 |
| `adrs/accepted/ADR-021-execution-checkpoint-residency.md` | runtime checkpoint 非持久领域真相 |
| `design_docs/subsystems/state/managed-execution-spec.md` | managed Run 状态与恢复窗口，部分路径实现，不代表全仓迁移完成 |
| `design_docs/system-model/object-catalog.md` | UserChatTurn 已接受目标但未完整实现；不复制 transient compatibility 字段 |
| `libs/omne_harness_state/omne_harness_state/application/services/managed_action_slots.py` | action ordinal/input_hash/try 与 accepted cut |

原仓 legacy thread_id/session_address、嵌入式四态 Run 与 LangGraph super-step 均不作为新规格公共身份。

Pi 内部也有术语碰撞：coding-agent 的 compaction 文档用 turn 指从一条 user message 到下一条 user message 之前的整段，可能含多个低层 Turn；本提案的 Step 映射仅指低层 agent-loop event Turn。
