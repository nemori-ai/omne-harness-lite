# Budget 当前协议

本页提取来源设计中仍约束 BG-01～BG-04 的当前协议；它是 candidate 施工输入，不表示
`BudgetHost`、Cordis plugin 或真实来源组合已经实现。BG-05～BG-07 仍无 provider 实现。

## 暴露量与准入

对每个适用预算，当前暴露为 `E = Σ(C + R)`：`C` 是已知有效费用，`R` 是尚未结算的
预留。首版事后计费来源没有单请求收费上界保证，以已知预留 `K` 按
`R=max(K-C,0)` 计入；新 attempt 的 `E_after=E+K`，每一个适用 hard budget
都必须独立通过。`K` 是当前已知预留，不是该请求的最高收费。

预算放宽在耐久前不得被消费。对每个 attempt，先取其 durable 根及**每一个**尚未
耐久的 pending 根中最大的 `C+R`，然后才对不同 attempt 求和形成 `E`；不能把
同一 attempt 的多个历史根重复相加，也不能只看最后 logical 根而跳过中间收紧。
预算政策、scope 目录及来源姿态的未耐久收紧同样参与准入，放宽/新周期余额须待耐久。
未知上界默认拒绝；即使明确允许 unknown，仍须满足 hard
触顶规则，`E` 已达 limit 时 `K=0` 也拒绝新工作。

## 来源立场、币种与计量事实

启用计费来源必须保存该 tenant 对来源的明确预算立场，绑定来源币种对应的 tenant
预算；所有 scope/currency 匹配的预算都参加门内检查，调用者不能只挑宽松的一项。
不同币种不隐式换汇；来源币种或价格依据无法核实则 unavailable，币种不匹配具名
拒绝。定义范围预算匹配原 Agent `subjectDefinition`，不能误用工具 Plugin 版本；
个人租户的账目归原租户，读写入口核当前账号及该租户资格；logout 或账号切换
不将历史费用重归集，组织账目也不因此复制给另一账号。

真实 TL/执行 owner 或 MC/模型来源须给出绑定 attempt 的 CostSource、已知预留
与明确的 unknown exposure、来源代次和价格依据；本地工具不默认零费用。来源的
实际供应者/路由、请求身份、实际收费及估算若都可取得，应作为可追溯且区分质量
的事实保留；目录估价不能标成供应方实际收费。金额以同币种十进制定点整数精确
比较，不能经浮点累加或四舍五入越过 hard 限额。费用事实经原来源 owner 核实，
用户填入的 usage、价格或 provider 名称不能充当计量证明。

计量事实以 `(sourceId,externalFactId,revision)` 在来源唯一索引与账目中同批
去重；同键同内容重放认回，同键异内容标 `fact_conflict` 并隔离该来源的新准入，
不覆盖已记费用。缺修订链时保留差额/unknown，不把单个 usage finish 当作所有
费用分量 final；估算改实际须有同组成修订或显式冲销关系，独立收费事实才相加。
超过已知预留的实际费用仍如实入账并呈现超额，不误报为违反不存在的收费上界；
无法归因的收费先保留来源身份和租户差额，后续有证据再关联原 attempt，
不平均分摊或丢弃迟到事实。

## 结算、释放与完整性

只有同时确认调用从未发出，且 late-start fence 已封闭，才能释放对应预留。已发出、unknown、断连、重启、
Run 完成或 provider 卸载都不能归零。只有来源的 final 事实同时证明该 attempt 的全部费用
分量完整，才可解除 unknown/剩余预留；usage finish 本身不构成完整性证明。重复事实按
source fact identity/revision 折叠，迟到事实仍归原 attempt、period 与 tenant。

## SubscriptionLink 边界

BG 是本地 SubscriptionLink 关联、变更意图、结果与对账状态的唯一状态 owner；TG 只提供
`budget.manage` 等管理入口和当前 tenant 资格，外部供应方拥有实际订阅、账期、状态与结算。
这个边界不表示相关 provider 已交付。
