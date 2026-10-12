# HTTPS JSON 单次传输承诺

根入口拥有原选项、配置错误、体检/治理结果，以及恰有两个方法的 GovernanceTransport。
`./cordis` 拥有 GovernanceTransportService 与唯一键。业务不依赖 Cordis 对象。

本批迁入公共形状和集成承诺。精确业务源、采用依据和仍有效的模型义务见
[传输提供者](../../frontend/governance-center-client-https/SPEC.md)。
完整字节、成帧与服务端拒绝责任归[提供者](../../tenancy/governance-center-entry-node/SPEC.md)；本页约束客户端单次读取和交付。

HTTPS 成帧、限制与单次发送沿已接受的 HT2 行为。治理交换明确采用
governance-center-entry 公共 SPEC 的线上协议 `3` 与唯一 Schema，含中心组织名称。
此采用不开放运维入口，服务端其余 HT3/EC3 行为不自动成为客户端能力。
每次调用只发送一次，不重试、不保存登录、不替用户接受信任、不记录请求秘密。
配置错误在请求前以 GovernanceClientConfigurationError 拒绝。协议答案和网络不可用
保持原封闭联合；发送后取消或超时保留 sendAttempted，不能改称远端未发生。

调用方 signal 是取消请求，完整 Promise 结束才是本次调用收场观察。
具名 GovernanceTransportStopped 只用于关闭后的实例误用，不属于网络结果。
它不携带请求参数、地址或原异常；关闭检查先于读取新输入。

可替代实现须保持原报文成帧、响应限制、Schema校验、精确失败类别和单次发送边界。
验证须用真实TLS及有界异常路径；类型和固定回复不能替代实际网络收尾。

## 客户端的四步读取

1. 先完整读取HTTP/1.1及Content-Length指定body。提前关闭、超时、TLS失败或非HTTP均为网络问不到，不能从片段猜领域答案。
2. 仅完整成帧后才识别精确18字节的version-mismatch body，它是跨版本特殊出口，不跳过framing。
3. 其他JSON必须符合本次operation的Exchange或public-health响应。坏status、非JSON或其他路由结果为问不到，并记录安全peer anomaly，不自造业务失败。
4. 只发一个请求，发送后不继续写、不pipeline重试；对端drain吞掉回复仍问不到，不据此断言未提交。

客户端发POST、Content-Length且不等待100Continue。方法、路径、query、header和TLS/peer属性不决定治理答案；只有body的presentation参与认证。配置错误、停止实例误用、signal和sendAttempted仍沿上文精确边界。服务端新维护协议不自动扩充客户端业务版本或公共方法。
