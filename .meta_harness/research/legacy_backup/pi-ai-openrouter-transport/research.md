# pi-ai 能否承担本项目的 OpenRouter 传输

- 调查对象与日期：2026-09-16，`@earendil-works/pi-ai@0.85.1`、本项目已有直接 OpenRouter transport；模型与实验输入见[证据记录](evidence.md)。
- 消费者：[Model Execution 提供者映射](../../../design_legacy/providers/model-execution/design.md)与其[验证边界](../../../design_legacy/providers/model-execution/verification.md)。
- 当前结论：pi-ai 的 OpenRouter 协议、目录、流解析和工具流可作为传输基线；未经定向修改的结果**不能**作为本项目的实际费用或实际服务商权威。

## 要区分的事实

ModelHost 需要用一次模型响应建立 attempt 的身份、成本质量与迟到结算。OpenRouter 作为唯一模型出口时，选定的路由条件、实际服务商、原始账户收费和模型目录估价分别是什么，不能因为金额偶然相同就合并为一个字段。复用库只负责传输与解析，不能接管本项目的 Account、Budget、共同发出门或耐久 attempt。

## 观察与推断

在固定 SSE 中，pi-ai 发出正确的 OpenRouter URL、路由条件和工具请求，并形成 `toolUse` 终态；但其结果将 `provider` 留为 `openrouter`，丢弃响应中的服务商，并用模型目录费率重算 `usage.cost.total`，没有保留原始 `usage.cost`。一次真实 `openai/gpt-4o-mini` 请求中，这个估价数值碰巧与 OpenRouter `/generation` 记录的实扣相同；这是**数值重合**，不使目录估价成为有来源的实扣证据。源码解析点与实验输入见[证据记录](evidence.md)。

推断：在 ModelHost 下定向 fork pi-ai 的 OpenRouter 解析路径，给出响应 ID、实际服务商、原始费用/来源和缺失状态，是比把整个 DSH `llm-pi-ai` 服务层并入产品更窄的复用途径。DSH 整包还带 settings、credentials、authorization、attachment 等 peer；这些权威已由本项目的能力边界承担，不由传输库接管。fork 的具体 API 和产品采用仍以[决定记录](../../../design_legacy/decisions/pi-ai-openrouter-transport/decision.md)与真实故障验证为准。

## 未闭合的证据

| 问题 | 最小核对 | 消费时点 |
|---|---|---|
| BYOK、缓存、折扣或路由变化时真实费用质量 | 对照响应 `usage.cost`、`cost_details` 与 `/generation`，缺失时报 unknown | Budget 计费接入前 |
| 跨 chunk 的服务商、响应 ID 和费用一致性 | 固定 SSE 变体、断流与重复块；类型化解析测试 | fork 替换直接 transport 前 |
| abort、错误、redirect 与隐藏重试 | 可控 loopback/fault 注入，核对至多一次出站与晚到结果 | ModelHost dispatch 接入前 |
| 工具和私有 replay | 原始调用 ID、结果回传、非文本结果与多轮恢复 | Tools/Run 组合前 |

复用选择不能把这项模型请求探针提升为产品 Agent Run、授权、预算、DR/CC 恢复或 Cordis 换代的验证。
