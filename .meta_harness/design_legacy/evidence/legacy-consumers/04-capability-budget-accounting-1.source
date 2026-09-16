# 计量预算、额度及账务关联 v1

本契约身份为 `capability.budget-accounting`，版本 1。规范依赖：[共享数据 CD](../../../data/core-work/v1/contract.md)、[共同准入 CC](../../../compositions/core-work-coordination/v1/contract.md)。

## 计量与预算

**BG-01**：ChargeAttempt 关联 tenant、StepRef/WorkRef、模型/工具 request/
call/attempt、原 Session/Run、定义、因果派发关系、供应方和价格依据。每笔
计量以 sourceId/externalFactId/revision 去重；同一回执重放不增费用，供应方
实际两次计费不得因相同逻辑请求而合并。迟到费用归原 Step 及原账期依据，
不得因 Run 已完成、Agent 已回收或当前用户换租户而丢失。

金额用十进制定点整数与 scale、currency 表示，不用二进制浮点累加。数量
带 unit，金额质量 actual/estimated/reserved/unknown 分别表达；缺失价格
或回执不是确认零。实际调整以修订/冲销关联保存，不覆盖原估算证据。
不同币种分别汇总，转换须有独立汇率事实及转换时间；首版不自动转换预算。
无法归因共享费用在租户账目列出 unallocated 差额，不平均分摊伪造精确性。

**BG-02**：Budget 具有 tenant、scope（tenant/definition/Session/Run）、currency/
单位、额度、周期、mode、阈值和 revision。首次启用计费来源必须有明确预算
立场，不隐藏 unlimited。mode 为 observe、soft、hard：observe 记录消耗；
soft 记录阈值和告警后果；hard 在下一计费准入检查并预留当前暴露。
多个适用预算分别成立，子 Agent 的新身份不重置租户预算或脱离因果归集。

**BG-03**：reserve 在调用受理共同提交中，为精确 attempt 同时检查所有适用
预算/额度的剩余量及修订，原子增加预留；任一拒绝不留下已准入调用或漏记
预留。预留和动作权限分别成立。start 前取消且可确认从未发出时释放预留；
已发出/unknown 时保留暴露直到实际对账，不能因连接关闭归零。结算时将
相同 attempt 的预留转换为实际/估算与未决差额，重复提交不扣第二次。

**BG-04**：可核实的单次费用上界来自实际价格/单位限制和 provider 的可兑现
约束，不从 token 估算自称严格封顶。事后计费上界未知时，hard 默认拒绝该
来源的新准入；获准用户可在配置中明确选择 allow_unknown_exposure，该来源
仍按已知预留和触顶规则限制新工作，但对外必须显示总超额上界未知，不能
宣称严格财务封顶。该选择不由 Agent 或普通批准工具隐式授予。

迟到收费或预算下调可使剩余量为负，不自动强杀在途调用，不改写供应方
账目；后续按新值拒绝/告警。预算周期切换记录精确周期身份，旧预留及迟到
结算留在原周期，不通过重建或午夜重置抹去。告警送达失败独立于超限事实。

## 订阅、授予额度与账单

**BG-05**：SubscriptionLink 由租户管理能力拥有本地关联和变更意图；供应方
拥有其实际订阅/账期/状态/结算。操作 list/get/requestChange/requestCancel/
reconcile 保留当前外部版本、期望变更、生效时间和 pending/applied/rejected/
unknown 结果。相同变更意图重试认回来源操作，不能重复购买；未知期间先
核实，不把本地按钮成功当供应方已修改。实际支付、税务发票和代扣未由此
接口授权或实现。

**BG-06**：授予额度有具名签发者、受益 tenant、单位、周期/重置规则、来源
事实版本和有效状态；本地未被授权的管理者不能生成供应方额度。使用资格
消费当前授予依据，不以剩余预算替代订阅。额度重置/暂停/撤销影响下一
准入并与预留协调；在途实际消耗和历史周期保留。来源权威不可达时明确
资格 unknown，只有来源保证仍有效的依据可使用，不沿用普通缓存越权。

**BG-07**：Invoice/Statement 读面保留供应方文档身份、账期、行项目、币种、
金额、结算状态与修订。它和本地 Step 计量以证据关联对账，差异分别显示
matched/unmatched/disputed/unknown；本地估算汇总不冒充正式账单。财务
管理者可看有权金额/范围和关联 ID，不据此取得私人会话正文或秘密值。
提供者卸载不删除账目与待核实意图，重新绑定必须认回相同供应方身份。
