# HTTPS JSON 单次传输承诺

根入口拥有原选项、配置错误、体检/治理结果，以及恰有两个方法的 GovernanceTransport。
`./cordis` 拥有 GovernanceTransportService 与唯一键。业务不依赖 Cordis 对象。

本批迁入公共形状和集成承诺。精确业务源、采用依据和仍有效的模型义务见
[身份迁移保持清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
本页不替代尚未迁移的完整操作条款；N5/N6 接续剩余旧源及资源登记。

客户端继续沿已接受的 HT2/EC2 协议；服务端采用 HT3/EC3 不自动升级客户端。
每次调用只发送一次，不重试、不保存登录、不替用户接受信任、不记录请求秘密。
配置错误在请求前以 GovernanceClientConfigurationError 拒绝。协议答案和网络不可用
保持原封闭联合；发送后取消或超时保留 sendAttempted，不能改称远端未发生。

调用方 signal 是取消请求，完整 Promise 结束才是本次调用收场观察。
具名 GovernanceTransportStopped 只用于关闭后的实例误用，不属于网络结果。
它不携带请求参数、地址或原异常；关闭检查先于读取新输入。

可替代实现须保持原报文成帧、响应限制、Schema校验、精确失败类别和单次发送边界。
验证须用真实TLS及有界异常路径；类型和固定回复不能替代实际网络收尾。
