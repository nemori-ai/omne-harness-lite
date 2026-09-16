# 产品账号身份

本主题定义账号权威、注册状态与登录会话的语言无关候选契约。账号回答“这是哪个产品账号、这份登录态现在是否有效”；[Tenant Governance](../tenant-governance/v1/contract.md)回答“该账号属于哪个租户、在其中有什么成员资格”。两者共同约束资产的访问，但本能力不拥有资产、设置、额度或租户成员事实。

- 契约坐标：`(omne-harness-lite-design-2026-09-15, capability.account-identity, 1)`，已登记为候选，整个坐标尚未接受或发布；当前无消费者采用本坐标。
- 来源：[PF-026](../../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、已批准的[账号身份提案 A](../../../proposals/account-identity/design.md)及其接受范围 [D-016](../../../decisions/account-identity/decision.md)。[D-021](../../../decisions/account-personal-local-creation/decision.md)另接受 A→F、冲突和 init 的列明语义；整个坐标仍待 catalog 登记与发布。
- 精确依赖：同 baseline 的 [`data.core-work@1` CD-01/02](../../data/core-work/v1/contract.md)、[`data.agent-runtime-identity@1` ARI-1/2](../../data/agent-runtime-identity/v1/contract.md) 与 [`capability.tenant-governance@1` TG-01/02](../tenant-governance/v1/contract.md)，按 [v1 契约](v1/contract.md)的依赖表消费；三者当前亦是迁移候选。
- 提供者与装配：尚无采用的 provider、插件映射或可用装配。成熟嵌入式认证 provider 是已接受的架构方向，Better Auth 只是研究对象，未获采用。

## 准入与阅读

注册身份、凭据验证和会话撤销有独立状态权威，不能由 Tenant 成员资格或 Agent 运行身份代替。精确操作、[F Schema](v1/schema.json)和失败边界见 [v1 契约](v1/contract.md)；可观察反例见[场景](v1/scenarios.md)；证据范围见[验证](verification.md)。初始账号与后续注册的 Account→Tenant 激活链由独立 composition 规格负责，本包仅规定本能力的门槛及所需权威证明。
