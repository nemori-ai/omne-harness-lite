# Budget 核算提供者设计映射

消费 `capability.budget-accounting@1`，并固定 S 的 `data.core-work@1`、`capability.durable-records@1`、
`composition.core-work-coordination@1` 与 `capability.engineering-observation@1` 所需条款。
旧 `f98ac926`/`058c77c` 接受只说明 legacy 施工来源，不接受本 baseline 坐标或候选插件。
状态转移、失败语义与重载细节见[当前协议](protocol.md)，其内容同样保持 candidate。

## 实现路径与来源

来源 `packages/governance/budget/design.md`（SHA-256 `742a5adfa8a8de97375e9d2e203176c2c4b600768408427a7362e4ffbfaee810`）在 legacy 仓库已区分现有实现和目标设计；本包只提取
持续映射，不把源设计状态提升为当前实现符合。纯值、严格记录 decoder/fold 与恢复反例已实现；BudgetHost/plugin、真实来源和运行准入组合未实现。


## 能力到 Cordis 的候选投影

| 契约责任 | 候选公开面 | 当前事实与缺口 |
|---|---|---|
| BG-01～BG-04 | `createBudgetHost`、`BudgetPlugin` / `omneBudget`、`registerChargeSourceFacts` | 记录解释层已实现；host/plugin、真实来源与同批准入未实现 |
| BG-05～BG-07 | 订阅、额度、账单关联提供者 | 后置，当前没有产品实现或 provider mapping |

## 预留、结算、释放与恢复

reserve 绑定精确 ChargeAttempt、tenant、来源、币种、period 和全部适用 budget revision，并与调用
受理在同一协调批次成立；动作授权与预算分别通过。只有确认从未发出才能 release；已发出或
unknown 保留暴露，迟到事实归原 attempt/period，重复回执以 source fact identity/revision 去重。

恢复从耐久记录重建已知预留、unknown exposure、原 period 和 pending settlement，不能因 Run 完成、
断连、重启或 provider 卸载归零。来源失联关闭新 reserve，晚到事实仍由原 owner 认回。撤除先
关新准入、排空 publication/source preparation 并保留账本与 unknown；当前实现尚未证明这些运行保证。


## 依赖与共同门

提供者实际组合依赖固定为：ARI-1/ARI-2；CD-01/CD-02；DR-01～DR-05；CC-01～CC-07；OB-01～OB-03。其中 DR、OB 与 F 身份是提供者实现依赖，
不因此成为语言契约的新依赖；catalog 仍只保留原 G→CD/CC 六条语义依赖。

| 输入 | 使用范围 | 缺席/换代 |
|---|---|---|
| 列出的 ARI/CD 条款 | 稳定身份、tenant、因果、冻结输入 | 结构有效不代表当前资格；不补造身份 |
| 列出的 DR 条款 | 原操作、耐久回执、恢复/unknown、writer 换代 | 未核实写入保持 unknown，不能换 key 重试 |
| 列出的 CC 条款 | prepare、同门检查、共同提交、publication 与恢复 | blocked/unknown 不执行效果；通知不是状态权威 |
| 列出的 OB 条款 | 关联、拒绝/unknown 与 gap | 普通诊断失败不改业务事实；关键审计失败在效果前 fail closed |

具体 Cordis API 和生命周期仍须在采用版本核对；这里不声称候选 service/plugin 已存在。
