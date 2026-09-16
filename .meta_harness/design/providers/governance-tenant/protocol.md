# Tenant 当前协议

本页提取来源设计中仍约束 TG 的当前协议；它是 candidate 施工输入。现有代码只有共享值、
严格 decoder 与纯 fold，`TenantHost`、Cordis plugin、身份适配和运行资格门尚未实现。

## 正向事实与 pending 交集

每个 owner 分别保存逻辑 root、耐久 root，以及按位置排列的全部未耐久 pending roots。
member、entitlement、grant 与 setting 的当前允许集合，取耐久正向依据与**所有** pending
root 所允许集合的交集。不能只比较最终逻辑 root 与耐久 root：撤销后又授予均在 pending
时，跳过中间 root 会让尚未耐久的正向权利提前生效。

撤销在逻辑位置立即封闭之后的准入；新增或扩大权利只有耐久后才可消费。来源缺失或无法
证明完整时返回 unavailable/complete=false，不把它解释为空集合或默认允许。重加入产生新
joinedRevision，旧 grant 不因 userId 相同复活。

统一 personal creation 的逻辑排位只作为原操作、目标及 global personal-index claim
的冲突占位；资格读面不得直接消费未耐久 `tenant.created` 的 owner/member。Tenant
先按 operationRef 查询历史占位/结果；同键同输入认回固定 target，不重新运行来源
首次准入。部署 init 的新操作核 Tenant 权威尚未建立（不是 JSONL 物理空文件）与
受信 seed；账号注册的新操作核 CC-05 已耐久导入的 Account 单操作授权后果，
sourceFact/version、原操作、摘要、`UserRef` 和 target 必须同属一份受信绑定。较早
pending 分配、凭据标识碰撞或未耐久导入不构成该授权。短门只读耐久导入事实和
Tenant/Admission 当前根，不等待 Account provider；Account 失联不撤销已导入的
原后果，旧 provider generation 不能取得新写权。

两来源共用同一套记录/认回/恢复协议：system `tenant-personal-index` claim 与新
`tenant:<target>` 流中的 personal tenant、creator、唯一 active owner 同一耐久批次；
init 在**同一批**另写 `tenant-bootstrap`，注册不写它。写入能力对每笔冻结操作按来源
限定精确二/三流形状，不能由客户端 origin 或 owner 字符串获得。恢复在完整共同批次
核对来源、原操作、target、user、creator/owner、个人种类和唯一 claim；三流/二流
交叉错配、单流各自解码成功但批次不同、第二 owner 或坏前缀均拒绝 ready。新的
owner 正向资格和 ACR 激活证明只在完整耐久前缀、全部 owner publication 与本代
可消费基线同时成立时可读；unknown、sync 失败和 blocked publication 均不开放。

Host 查询分别呈现历史 durable 提交、当前 publication 可消费、本次 tenant/owner
业务资格；旧租户 closing/closed 后同操作只认回历史，当前业务拒绝。writer unknown、
回执丢失或暂时 `not_seen` 保留原 target/claim 占位；仅独占恢复证明旧 writer
未提交且安全解除全部占位后，同输入同 target 才可重备。已提交但 owner publication
失败时原 completion 永久保留 `committed_blocked`，CC-06 新代全 owner 基线完成后
本代查询另给可消费证明，不重发批次或改写原 completion。

## 与预算核算的边界

TG 拥有 tenant/member 以及 `budget.manage` 等管理资格，负责入口是否可用；它不拥有
SubscriptionLink 的本地关联、变更意图、结果或对账状态。BG 唯一保存这些状态，供应方仍
拥有实际订阅事实。跨能力操作必须在共同门中重读 TG 资格与 BG 修订。
