# Budget 核算提供者验证边界

来源设计固定为 `packages/governance/budget/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `742a5adfa8a8de97375e9d2e203176c2c4b600768408427a7362e4ffbfaee810`）。当前结论：纯值、严格记录 decoder/fold 与恢复反例已实现；BudgetHost/plugin、真实来源和运行准入组合未实现。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。
