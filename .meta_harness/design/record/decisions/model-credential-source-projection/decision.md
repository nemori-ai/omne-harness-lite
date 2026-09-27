# D-075 模型凭据来源投影采用

2026-09-27。依用户“Implement the plan.”委托和[读取链提案](../../proposals/model-request-adaptation/read-projection.md)，采用 model/model-profile-directory v3 与 infra/credential-custodian-local rev2 的精确投影，四件套哈希见 adoption.json。

目录与模型副本在同一真实 AtomicStorage 单元锁定读当前租户绑定；副本持久保存可信来源 sourceRef，并以 tenant/sourceRef 为认证加密关联。当前绑定、expectedRef、副本来源必须相同；RefA 切换 RefB 后旧 A 不能取出，缺失或错源不回退 factory。异常先退出参与单元，外层 atomic 完成后才映射失败或交出明文；Unit 误用与存储缺陷不得降格。独立 architecture-reviewer core_projection_review 对两轮保护点复审无阻断；spec-reviewer binding_batch_spec_review 对最终失败表及逐 symbol 权限确认原 B1/B2 闭合。真实故障和权限负控仍待执行。

只建设 model-only 公共技术组件及其迁移，不注册假完整 credentialCustodian 服务。工厂要求已存在的本机 32 字节普通文件密钥、0600及同句柄检查；缺失即启动失败，不自行生成。装配唯一构造/关闭，bootstrap 可构造并传递受限 reader、持可信 source/body 成对写入，但不能执行取值；读面仅 CCL/P-1r 执行。需有路径与 symbol 负控守卫。generic tenant-only 读写的既有语义保留，但 sourceRef 未证实的 generic 写入不能成为目录可读绑定副本。

本事件不接受新领域操作，不声称完整 CCL、OAuth 用户流程、MCP tx-reads/清除链或中心送达已交付；这些旧范围和缺口明确保留。模型验收的真实账号、登录、租户、密钥、来源对和资源关闭仍由验收装配提供，未代替完整产品能力的采用或总体签收。
