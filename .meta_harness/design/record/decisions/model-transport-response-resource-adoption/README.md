# D-091：模型传输响应资源边界的技术采用

[决定](decision.md)在 [D-090](../model-headers-v5-adoption/decision.md) 已接受的语义范围内，部分技术采用 `pi-ai-transport` 的 [v5 响应头投影 rev2](../../../realization/packages/model/pi-ai-transport/v5-headers-design.md)：真实不透明成功响应句柄、私有 Node 资源、实际不泄露请求对象的停止方法，以及同次结果交接的结构。

S-20 三项凭据政策的生产取值、完整脱敏接线与真实 TLS／invoke／写方验证仍待；本决定不放行不安全的公开头值，也不提升整体 runtime 交付状态。
