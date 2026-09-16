# D-017：首次初始化与新账号注册共用个人租户创建机制

- 状态：已接受的架构方向；具体规格、格式、提供者与实施未因此获得接受。
- 来源：[个人租户创建三候选提案](../../proposals/personal-tenant-creation/README.md)，HUB `6811db8`；独立架构评审和处置记录见[提案评审](../../proposals/personal-tenant-creation/review.md)。
- 需求前提：[PF-026.C1/C3/C5](../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、[D-016](../account-identity/decision.md)。
- 接受依据：2026-09-16 产品用户在本会话听取 A/B/C 说明后直接说“共用同一套”，并明确新账号创建后默认只有一个个人租户；用户同时授权在无生产部署及真实业务用户的早期阶段重构旧实现，避免兼容负担。[INT-010](../../requirements/interviews/cli-account-flow-2026-09-16/notes.md#int-010)记录范围。

## 接受的选择

Tenant 对个人租户只维护**一套**唯一 claim、固定目标、提交、操作认回和恢复语义。首次部署 `init` 与后续账号注册可以有不同的受信调用入口和准入依据，但不能长期维持两套互不相同的个人租户状态机、结果协议或恢复规则。账号权威与 Tenant 权威仍按 D-016 分离，统一 Tenant 机制不把账号凭据或会话改归 Tenant。

注册成功时，新账号默认恰有一个租户，且它是该账号的个人租户。注册中的 pending 身份可以暂时没有可用租户，但不能获业务准入或报告为完成；组织入会是独立操作，具体时序由其自身契约决定，不构成注册默认第二租户。

本项目没有生产部署和真实用户数据需要兼容。本次设计可以替换旧 bootstrap 专属接口、`bootstrapTargetTenantId` 编码与重复实现，不为沿用它们增加适配层；任何实际存在的旧开发记录仍须明确拒绝或保全，不能静默按新格式误读。

## 接受边界与理由

[候选比较](../../proposals/personal-tenant-creation/alternatives.md)表明两个入口有相同的个人唯一性、claim、同批成立、unknown 认回和 publication 恢复责任，差别主要在可信来源：首次初始化的 seed/前态与新账号的耐久注册后果。统一机制减少两条协议分头演进的维护风险，同时保留来源防冒充边界。

本决定**未接受** global `tenant-personal-index` 的具体存储形状、二/三流 envelope、`core-journal` 版本、Account→CC 交付证明、认证 provider 或 CLI 通道；它们须由候选规格、评审、形式模型与真实故障验证收敛。也未决定未来关闭个人租户后是否允许新操作创建替代个人租户；首版不开放此入口。来源提案 B 中与这些细节有关的推荐仍按候选处理。

## 取代与下游

本决定不取代 D-016，也不追溯宣称旧迁移候选已被接受。它取代 **TG/DR/CC 新 v1 候选中为首次 bootstrap 保留一套专属创建/结果/恢复协议、再为后续注册另建一套** 的设计方向；这些候选须以统一语义重写。接受、发布、实现和验证仍分别记录，不由本决定自动完成。

| 下游 | 必须补齐的工作 |
|---|---|
| Tenant、Account 与注册组合 | 两来源受信准入、单一 claim/target/历史结果、账号激活屏障及失联认回。 |
| DR、CC 与各提供者 | 精确混合流许可、统一 outcome/codec、短门和 writer 代际、完整前缀与 owner publication 恢复。 |
| 形式模型与真实装配 | 两来源及多账号竞争、unknown、被阻发布、重启、旧实例迟到和注册完成时唯一默认个人租户的证据。 |
