# D-018：消息交付与外部 Hooks 的新 v1 语义

- 状态：以下八组**语义方向已接受**；新 v1 规格的发布、依赖采用、实现和符合性仍未完成。
- 来源：[消息流三候选提案](../../proposals/message-stream/README.md)、[外部 Hooks 三候选提案](../../proposals/external-hooks/README.md)及迁移时的逐项旧/新行为比较。目标快照为 `capability.message-stream@1` 的 `contract.md` SHA-256 `a4ac7ff8fb7168d034c7bc0a5bd09bdfa57a79212a25214f3ad735589780538b`、`capability.external-hooks@1` 的 `contract.md` SHA-256 `8f2943b9b4740415982fdfc0d4825407b33615f1a51082e80a8d2e5116bf5113`；来源提案 `design.md` SHA-256 分别为 `692f6386e21626e83907cb78e8a22e1de459549ecfdef1543e817ebe298018c8`、`b904aa9c0cbc9e39ba221d9553a499ac382630a704a331bda989695280e8cc8a`。
- 需求前提：PF-003/PF-013/PF-022/PF-025；旧 E 来源 `e3573ca:spec/capabilities/{message-stream,external-hooks}/v1/contract.md` 是用户已批准的正式设计，D-015 的旧范围不因此被重新定义。
- 接受依据：2026-09-16 产品用户针对列出 MS-06/22/23/24 与 HK-02/07/15/16 的逐项旧/新行为简报，明确答复“接受这组候选语义（推荐）”。提问已明确本次只裁决**新 v1 设计方向**，不裁决 J 联合验证、catalog 冻结或实现符合性。

## 接受的选择

| 条款 | 本次接受的可观察语义 | 保留的边界 |
|---|---|---|
| MS-06 | 断线、确认丢失、重连或补齐整批可造成网络重发；客户端以稳定 `dedupKey` 至多安装/呈现一次，完整批次到齐后才推进游标。事实 key 为 `eventId`，瞬态为 `issuer:epoch:seq`，控制 key 由服务端生成并稳定认回。 | 同批事实顺序和真实事实身份不能因重发改变。 |
| MS-22 | 草稿只依模型执行的耐久 disposition 和完整授权的 SessionProjection 收口。无 receipt 的 `attempt.closing.pending` 留在 `in_progress{pendingReason:outcome_unresolved}`；业务 `unknown` 是可说明的终态，后续 revision 只细化呈现。 | 不把 pending 或观察者缺席伪装为业务终态。 |
| MS-23 | 先安装有效 listener，再取得 compact state/cut，缓冲并有序排空，最后原子切到 live；单 listener 故障隔离。 | 不撤销其他 listener 或事实源。 |
| MS-24 | 观察者失去源时只报告非终态 `source-unavailable`；等待执行方耐久结算或可信 fence。 | 不由观察者代发 `ended{abandoned}` 封闭旧 attempt。 |
| HK-02 | 维持旧有六类控制效果；用户通知须经唯一耐久 `hooks.run.completed.presentationEntries[]` 与当前读权投影。 | completion、重放和失权均不能重复或越权展示。 |
| HK-07 | 关闭项的 context 仅供审计，不注入 Step；关闭事实与唯一 completion 同准入门成立。 | pass/close 与 queue/arrival 的来源门仍有效。 |
| HK-15 | PreToolUse 超时/失败后不重跑 hook；实际准入前仍依 CC-02/AU-06 重查资格，已有 deny/ask 不放宽。 | 本次新增接受的是“不重跑 hook”的调用次数界限；资格重查是旧保证澄清。 |
| HK-16 | Stop cap 绑定租户配置 revision，入队及 take/start 都检查；take、Run start、计数 slot 为一个原子步骤。超 cap 排队项 `closed(source_invalid)`，另记 `stop_cap_exhausted` 观察原因。 | 不改写原 hook completion。 |

## 理由、取代与下游

这些变化为重复传输、不完整结算、活跃订阅切换、源失联、通知投影、关闭上下文及 Stop 上限选择单一可恢复的权威依据。E 的独立评审与有限形式模型是设计证据，覆盖和限制仍以[消息流形式模型说明](../../spec/capabilities/message-stream/v1/formal/README.md)及[Hooks 场景](../../spec/capabilities/external-hooks/v1/scenarios.md)为准；模型检查不是用户接受，也不证明真实提供者符合。

本决定只在上表明确范围内取代旧 E 已批准契约中相冲突的可观察行为，不取代未变的旧保证，也不接受两份提案的所有候选机制。目标契约快照是本次审阅对象；若后续修改可观察集合或 owner 边界，须重新分类并取得相应接受，不能沿用本决定的授权。

| 消费者或交付门 | 未完成的责任 |
|---|---|
| J 联合验证 | 固定跨能力动作链、精确资源哈希和实际执行证据，核对 MS/HK 与 Model、Session、Run、Tools、授权及媒体验证关系。 |
| I 采用与发布 | 逐条 source→target 映射，独立审阅与消费基线，catalog/decision/relation/frozen 的精确接受和发布证据。 |
| 提供者与客户端 | 实现 listener 切换、安装去重、草稿投影、hook completion 与 Stop 原子 cap，并在真实失败/重启场景证明符合性。 |
