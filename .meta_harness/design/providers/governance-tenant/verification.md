# Tenant 治理提供者验证边界

来源设计固定为 `packages/governance/tenant/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `5dc39f429f3decbfe9f32a93f5a5bffd034faea1bd87b319643b3b2a1ffe4f55`）。当前结论：共同值声明、bootstrap/personal-index/tenant/member 严格 decoder 与纯 fold 已实现；TenantHost、插件、身份适配和运行资格门未实现。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。
