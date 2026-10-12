# Node HTTPS 治理传输提供者

纯根保留 readPublicHealth、exchangeGovernance 两个独立函数，并提供 createGovernanceTransport。
独立函数可以单独调用，拥有实例只等待通过该实例准入的请求。`./cordis` 单独拥有绑定。

共享业务与公开形状归[公共承诺](../../core/governance-center-entry-https-json/SPEC.md)，本页拥有具体提供者的资源、绑定和实际关闭责任。持续验证资源由实际接口及应用拥有者维护，不从包存在推断全部组合通过。

请求解析、发送、响应成帧及Schema校验沿原算法，不添加自动重试或取消。
实例close同步停止新调用，保存稳定Promise；完整请求在调用原函数前登记，防止输入getter重入漏记。
已准入请求保持原signal、timeout与sendAttempted，真实完成后实例close才结束。
关闭后新调用先拒绝 GovernanceTransportStopped，不读取输入或产生请求。

原函数观察 ClientRequest.close 和实际 socket.close。Node内部DNS任务可能仍继续，
不得把此边界扩大成所有OS内部工作均已停止。其他实例和独立函数不受本实例关闭影响。
治理交换采用公共定义包明确的线上协议 `3` 与唯一 Schema，组织名称由中心提供。
原 HT2 的成帧、限制、取消和单次发送行为保持，不开放运维面。
验证须覆盖当前 Schema、真实TLS、取消、晚完成及独立调用。

## 独立和管理绑定

/cordis的governanceTransportPlugin和managedGovernanceTransportPlugin分别使用governance-center-client-https及governance-center-client-https-managed限定name。严格空配置，无业务必需依赖；管理版另需assemblyLifetime，缺席不回退独立模式。两个绑定共用原纯实例和真正请求收场。当前线上协议和Schema由公共governance-center-entry/schema唯一维护；CG Schema由公共客户端定义拥有，Cordis入口迁移不改变业务版本。
