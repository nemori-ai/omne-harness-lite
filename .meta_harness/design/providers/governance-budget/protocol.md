# Budget 当前协议

本页提取来源设计中仍约束 BG-01～BG-04 的当前协议；它是 candidate 施工输入，不表示
`BudgetHost`、Cordis plugin 或真实来源组合已经实现。BG-05～BG-07 仍无 provider 实现。

## 暴露量与准入

对每个适用预算，当前暴露为 `E = Σ(C + R)`：`C` 是已知有效费用，`R` 是尚未结算的
预留。有限上界 `U` 的预留为 `R=max(U-C,0)`；未知上界使用已知预留 `K`，同样按
`R=max(K-C,0)` 计入。新 attempt 的 `E_after=E+Q`，其中有限来源 `Q=U`，未知来源
`Q=K`；每一个适用 hard budget 都必须独立通过。

预算放宽在耐久前不得被消费；若存在未耐久变更，以耐久状态与所有 pending 状态中更保守
的结果准入，不能提前释放余额。未知上界默认拒绝；即使明确允许 unknown，仍须满足 hard
触顶规则，`E` 已达 limit 时 `K=0` 也拒绝新工作。

## 结算、释放与完整性

仅有“确认从未发出”或 late-start fence 能释放对应预留。已发出、unknown、断连、重启、
Run 完成或 provider 卸载都不能归零。只有来源的 final 事实同时证明该 attempt 的全部费用
分量完整，才可解除 unknown/剩余预留；usage finish 本身不构成完整性证明。重复事实按
source fact identity/revision 折叠，迟到事实仍归原 attempt、period 与 tenant。

## SubscriptionLink 边界

BG 是本地 SubscriptionLink 关联、变更意图、结果与对账状态的唯一状态 owner；TG 只提供
`budget.manage` 等管理入口和当前 tenant 资格，外部供应方拥有实际订阅、账期、状态与结算。
这个边界不表示相关 provider 已交付。
