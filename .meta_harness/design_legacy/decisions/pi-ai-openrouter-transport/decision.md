# D-019：定向 fork pi-ai 用于 OpenRouter 传输

- 状态：传输复用途径已由产品用户选择；具体 fork 代码、API、产品装配与符合性尚未验收。
- 来源：[固定 pi-ai 版本研究](../../research/pi-ai-openrouter-transport/README.md)，记录 `@earendil-works/pi-ai@0.85.1` 的源码、离线 SSE、真实 OpenRouter 短请求及费用来源缺口。
- 需求前提：所有模型请求经 OpenRouter；[Model Execution v1 候选](../../spec/capabilities/model-execution/v1/contract.md)与[提供者映射](../../providers/model-execution/design.md)保留耐久 attempt、共同发出门、费用质量与迟到/停止责任。
- 接受依据：2026-09-16 产品用户在模型 provider 复用调研和实测反馈后，明确裁决定向 fork pi-ai，并针对已知问题做二次开发优化。本决定记录该**采用方向**，不把研究结论或短探针升级为产品符合性。

## 选择与范围

以 pi-ai 的 OpenRouter provider、模型目录、协议请求和流/工具解析为传输实现基线，按本项目契约做定向 fork。fork 必须把响应 ID、实际服务商、OpenRouter 原始实际费用及其来源、缺失费用状态显式传给 ModelHost；目录价格估算另存，不能冒充账户实扣。请求参数、工具调用与结果 ID、断流、错误、abort、隐藏重试和私有 replay 均按 ModelHost 接口验证后接入。

ModelHost 继续拥有耐久 attempt、Run/授权/预算的共同 DispatchGuard、结算、迟到/停止和历史投影；本地工具由 Tools/授权执行，传输库只往返模型消息。DSH `llm-pi-ai` 整包的 settings、credentials、auth 等服务权威不在本次采用范围内。用户账号、租户、预算和 OpenRouter 凭据归本项目对应能力，不由 fork 另立权威。

## 理由与限制

[固定版本观察](../../research/pi-ai-openrouter-transport/evidence.md)显示 pi-ai 已能完成 OpenRouter 路由与工具流，但原版在结果里把实际服务商折成 `openrouter`，实际 `usage.cost` 被目录估价取代。真实样例里两种金额数值相同，仍不能证明 BYOK、缓存、折扣和其他模型收费等价；在无法取得实际费用时应标 unknown 并按预算契约处理。

本选择取代 Model provider 设计中“直接 transport 或 pi-ai 候选尚未定”的实施路径状态，不取代已批准领域契约，也不批准具体 fork 补丁。固定版本和具体上游修订需由实施线锁定；任何传输字段或重试语义的可观察变化，须按 Model/Run/Budget/Tools 消费契约评估。

| 下游 | 闭合条件 |
|---|---|
| fork 与 Host bridge | 类型化实际费用/服务商/response ID，明确 unknown；无隐藏重试和双发；工具调用及回传 ID 不丢。 |
| 故障与账务验证 | 固定 SSE、真实 OpenRouter `/generation`，BYOK/缓存/折扣、断流、abort、迟到、错误和私有 replay 的适用证据。 |
| 产品组合 | AU、Budget、Run/Tools、CC/DR 与 Cordis 生命周期在真实 owner 边界闭合；短模型/LE 探针不代替该证据。 |
