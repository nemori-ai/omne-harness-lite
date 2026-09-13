# 设计基线来源与维护映射

本页把源事实、拟保留语义和未接受的产品政策分开。[契约](draft/contract.md) 是
本轮候选的唯一语义正文；上游源码及测试提供观察证据，不自动批准本项目设计。

## 固定版本

- 上游仓库：`deepseek-ai/deepseek-harness`，commit `c291e7961a515f6d7af9304e7fd1d257929aef26`。
- 取证日期：2026-09-13；源码包名 `@deepseek-ai/dsh-agent`，版本 `0.1.5-rc.2`。
- [官方包说明](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/core/agent/README.md)。实际核对同一 commit 的源码快照，Web 页面抓取失败不替代本地源码证据。
- [精确版本源码归档](https://codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/c291e7961a515f6d7af9304e7fd1d257929aef26)，归档 SHA-256 和逐文件摘要见 [清单](upstream-baseline.json)。这是无 `.git` 的归档解包，不能在其中调用 Git 来识别上游 commit。
- 本次不把该源码版本与同名 npm 发布物视为已经逐字等价，也不采用浮动 master 作为维护基线。
- [上游 MIT 文本](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/LICENSE) 的摘要在清单中；后续导入代码保留许可和版权。完整复用与许可研究仍留在临时研究区，本页只记录本包维护来源。

## 需求消费快照

当前候选使用 OMNE commit `2d6eff6f7a0e7db73fb35f3ab5011fcd0a55662d` 下列文件的
已确认条款；这不是用户对本候选细节的接受。来源为当时正文所记确认范围，未决条款
仍然未决。正式发布前按[需求基线保留](../../../docs/maintenance/requirements.md#基线保留)
建立可交付保留引用与恢复证据。

| 需求/约束来源 | 本次覆盖及限制 |
|---|---|
| [系统约束](../../../docs/requirements/system/constraints.md) | Cordis 与 DSH agent 的复用方向；本次只建模原语。租户身份默认拒绝和 OpenRouter 统一入口仍约束未来装配，原语本身不兑现它们。 |
| [运行状态与连续性](../../../docs/requirements/system/runtime-state-and-continuity.md) | 明确 runtime live 状态、因果归因、结构化释放的边界；不声称具备重启恢复、全局状态持久化或无限待机。 |
| [总体范式](../../../docs/architecture-guide/foundations/paradigm.md)、[基础概念](../../../docs/architecture-guide/foundations/concepts.md) | 以动态能力、作用域、依赖与生命周期建模；不把包目录等同能力/进程，不新增同义 Session/租户数据定义。 |
| 本轮用户明确要求（2026-09-13） | 先在 spec 保存 dsh-agent 维护基线，每步设计、独立评审、验收后再继续；尚未授权跳过细节验收直接导入源码。 |

以上相对链接导航当前正文，历史含义以固定 commit 的同路径为准。候选接受前若正文
发生变更，先核对消费范围，不能用新正文悄悄改写本次依据。

## API 与语义归属

以下路径相对上游仓库根，均绑定上述 commit。清单保存相应文件摘要及 peer 包声明。

| 源位置 | 公共表面/源码职责 | 本候选映射 |
|---|---|---|
| `packages/core/agent/src/index.ts` | AgentRegistry/default；enter/announce/register/get/list/roots/isOwnedBy；currentInitiator/requireInitiator/withInitiator/withoutInitiator；setFactory/create/resume；AgentFactory、AgentHandle、AgentSetup、AgentSetupCommit、CreateAgentOptions、ResumeAgentOptions | LA-R*、LA-I*、LA-F*；可选 typert 注入对应 LA-T1 |
| `packages/core/agent/src/dispatch.ts` | agentCarrier、agentEvents（emit/serial/waterfall）、emitAgentEvent、assembleContextFor 及对应类型 | LA-E1 |
| `packages/core/agent/src/model-selection.ts` | ModelSelection、ModelSelectionRef、installModelSelection | LA-M1；系统提示、LLM 与 pre-step 组合助手 |
| `packages/core/agent/src/consumed-work.ts` | ConsumedWork、foldConsumedWork | LA-W1；Session 事件计算，不拥有日志 |
| `packages/core/agent/src/invariant.ts` | 独立 invariant 插件入口 | LA-S1；依赖 invariants 服务的检测器 |
| `packages/core/agent/src/runtime-types.ts` | AgentOptions、CancelOptions、Inbox、AgentStatus、PreStepDecision、RequestErrorAction、SessionStartSource、AssistantStreamFrame；Agent 扩展与 13 个事件；AgentCancelCause 重导出 | 端口记录；Loop 实现不在本包，取消原因权威来自 Session |
| `packages/core/agent/src/types.ts` | Agent.id、InboxTarget、InboxState、InboxWireState、TurnBoundaryProjection；agent/inbox/spliced；typert 与 projection 类型扩展 | 共享词汇依赖，未发布 OMNE 数据契约 |
| `packages/core/agent/src/projection.ts` | 载入投影类型扩展 | 类型贡献，不是投影 fold 的实现 |
| `packages/core/agent/package.json` | ESM 根入口、invariant/types 子入口、src 通配路径、包声明；9 个 peer | 导入面与依赖基线；源码通配入口不构成 OMNE 未来稳定公共入口承诺 |

根入口运行时直接使用 Cordis、scope、Node 异步上下文及 Promise 检测，并经
model-selection 使用 LLM 运行时助手。Session、system-prompt、projection、typert
protocol、util-values 多处用作类型/扩展协议；invariants 由独立附属入口使用。
实际服务是否必须挂载由访问行为决定，不能从 peer 数量推导。Node 是此上游实现的
宿主要求；语言无关模型不假定其他语言天然具有同等上下文传播语义。

测试映射见[规范场景](draft/scenarios.md)，实际运行绑定的源码与工具见[证据](evidence/validation.md)。
`verify-export-jsdoc.spec.ts` 验证上游文档检查器，非原语行为，本轮未运行。

## 需要显式保留的源差异

1. `index.ts` 的 AgentHandle 注释描述先 unregister/remove session 再作用域清理；
   `runtime-types.ts` 的 disposed 注释则明确 Loop 先 quiescence、scope unwind，
   再 agent detach，最后 session detach。后续 factory/Loop 设计必须消除这处差异；
   本轮不替它确定端到端释放契约，仅固定注册表可独立兑现的行为。
2. `announce` 注释的“同步否决并回滚”需结合调用层：直接 announce 的 finally
   只兑现已有 detach 请求；`register` 的效果或 factory 清理链才提供异常回滚。
3. model-selection 源测试使用 snapshot 一词，但实现只捕获 current 引用；只有
   以新对象替换且不再修改旧对象的调用方式才满足本候选的一致性前提。
4. cancel 注释同时有“无活动时 no-op”和“默认清 pending”。前者不能覆盖后者；
   本轮将无活动理解为没有活动信号可 abort，具体 inbox/driver 行为归 Loop。
5. durable/committed 在事件类型说明中不能扩张为磁盘 fsync 或断电恢复保证；
   scoped dispatch 和 typert ID lookup 也不能扩张为租户隔离。

这些差异不是默许 fork 改行为的批准。若下一步要修改其可观察语义，应明确变更范围、
依据和回归场景，再完成那一步的设计评审与验收。
