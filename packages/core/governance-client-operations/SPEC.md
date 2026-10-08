# 治理客户端公共操作承诺

根入口拥有 ActionInput、ActionIntent、预备输入、使用期、报告、错误和 exitStatus。
`./cordis` 拥有正式服务和唯一键。根入口不加载 Cordis，不选择具体本地状态或传输。
CG2 S1～16 的完整行为保持，包括全部动作、use、敏感槽和封闭失败集合。

当前输入/报告资源由 `./schema` 拥有，完整意图/预览资源由 `./schema/intents` 拥有。
两者采用包级 Schema 身份，治理载荷与结果引用当前 governance-center-entry 的唯一 Schema。
本次明确采用线上协议 `3` 和中心组织名称增量，替代运行消费者的旧协议 `2` Schema。
当前输入中团队创建必须含名称，读取结果必须含中心名称，其余 CG2 生命周期和敏感槽规则保持。
冻结旧源不原地修订，未迁行为义务仍按原范围接续。

本批迁入公共形状和集成承诺。精确业务源、采用依据和仍有效的模型义务见
[身份迁移保持清单](../../../.meta_harness/design/architecture/identity-integration/preservation.md)。
本页不替代尚未迁移的完整操作条款；N5/N6 接续剩余旧源及资源登记。

ActionIntent 在等待前捕获。InputPrompt 的调用次数、取消与晚返回规则保持。
单个 use 固定中心、信任与登录选择，busy 与 invalid-input 的判定次序不变。
依赖注入不授予租户权限，不在已开始的动作中换入另一代 state/transport。
未知远端结果、CAS未确认、一次查证和副本过滤各按原语义保留，不能自动重投。
exitStatus 是报告到原退出码的纯映射；提供者与 CLI 共用此函数。

close 同步停止新 use/action，取消仍在等待输入的 prompt，等待网络、本地写入、
查证和完整预备输入责任真实结束。必须先登记完整工作再调用可重入的依赖。
重复 close 返回同一 Promise；旧引用拒绝原 ClientUseUsageDefect。
借入依赖只可在实际静止后释放。关闭拒绝本身不是静止许可。

ClientCloseObservation 是装配运行观察资源，在分配实例前接管一次原关闭尝试。
它没有关闭权，也不把拒绝变成静止。管理绑定、表示门与启动前缀的跨模块责任沿
[CLI生命周期采用](../../../.meta_harness/design/architecture/identity-integration/cli-lifecycle.md)。
验证覆盖原全部动作、真实SQLite/TLS/CLI、取消晚完成、忙碌、故障、机密输出及替代依赖。
