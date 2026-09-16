# Budget 核算提供者

- 映射契约：`(omne-harness-lite-design-2026-09-15, capability.budget-accounting, 1)`（candidate）
- 来源设计：`packages/governance/budget/design.md` @ `e3573ca72d18bfe7ddd002df5025551b51eede46`，SHA-256 `742a5adfa8a8de97375e9d2e203176c2c4b600768408427a7362e4ffbfaee810`
- 当前状态：纯值、严格记录 decoder/fold 与恢复反例已实现；BudgetHost/plugin、真实来源和运行准入组合未实现。

按[设计映射](design.md)区分已实现部分与 Cordis 候选投影；涉及状态转移时按需读取
[当前协议](protocol.md)；[验证边界](verification.md)只陈述实际证据。
