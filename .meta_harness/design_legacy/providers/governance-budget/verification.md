# Budget 核算提供者验证边界

来源设计固定为 `packages/governance/budget/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`（SHA-256 `742a5adfa8a8de97375e9d2e203176c2c4b600768408427a7362e4ffbfaee810`）。当前结论：纯值、严格记录 decoder/fold 与恢复反例已实现；BudgetHost/plugin、真实来源和运行准入组合未实现。
本轮没有运行产品组合，也不复用 legacy 接受、probe 或旧日志作为新谱系符合性证据。

独立验收至少覆盖：准备后撤权/修订变化、同 key 重试与异输入冲突、writer unknown、崩溃恢复、
provider 失联/重载、旧候选不复活、清理失败及保留事实；只有真实记录、身份、来源和 Cordis
生命周期组合通过后，才能提升对应实现状态。

真实组合至少重演：hard limit 10、既有 unknown `K=7` 时新增 unknown `K=7`
被拒绝；已计 `C=3` 且剩余预留 4 时同 attempt 暴露仍为 7；
durable/多个 pending 根交错不得重复累计也不得提前释放余额。USD-only 立场面对
EUR 来源具名拒绝，明确建立对应币种立场后仍须检查全部适用预算。再注入同一
来源事实重放、同键异内容、缺修订、估算转实际、实际费用超过预留、取消早于迟到 start、
失联后迟到收费和重启；观察真实账目、原 attempt/period 及来源证据，不能只
数内存对象。MC/模型费用接入时须分别核对实际供应者/收费来源与目录估价；
尚无真实 MC 来源和供应方对账证据时不得称模型费用已验证。
