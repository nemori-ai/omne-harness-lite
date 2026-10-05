# Node HTTPS 治理传输提供者

纯根保留 readPublicHealth、exchangeGovernance 两个独立函数，并提供 createGovernanceTransport。
独立函数可以单独调用，拥有实例只等待通过该实例准入的请求。`./cordis` 单独拥有绑定。

本批迁入公共形状和集成承诺。精确业务源、采用依据和仍有效的模型义务见
[身份迁移保持清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
本页不替代尚未迁移的完整操作条款；N5/N6 接续剩余旧源及资源登记。

请求解析、发送、响应成帧及Schema校验沿原算法，不添加自动重试或取消。
实例close同步停止新调用，保存稳定Promise；完整请求在调用原函数前登记，防止输入getter重入漏记。
已准入请求保持原signal、timeout与sendAttempted，真实完成后实例close才结束。
关闭后新调用先拒绝 GovernanceTransportStopped，不读取输入或产生请求。

原函数观察 ClientRequest.close 和实际 socket.close。Node内部DNS任务可能仍继续，
不得把此边界扩大成所有OS内部工作均已停止。其他实例和独立函数不受本实例关闭影响。
原EC2 Schema仅改公共消费坐标，字节与$id不变。验证须覆盖真实TLS、取消、晚完成及独立调用。
