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

统一 personal creation 的逻辑排位只作为原 T、目标流首位置的冲突占位；资格读面
不得直接消费未耐久 `tenant.created` 的 owner/member。Tenant 先按 T/C 查询历史
占位/结果；同键同输入认回固定 target，不重新运行来源首次准入。受信 init 的
一次性资格由 Account AI-08 核实；Tenant 核已经证实的空 Tenant 根、Account
已耐久分配且不复用的初始 `UserRef`、凭据唯一绑定及不可变 F。seed 字符串本身不能
造 `UserRef` 或 target。后续注册也须先有 Account 的完整 F。两个入口均在短门外经
当前受信同进程 Account 服务读取 F，核版本、`sourceRef`、`entryKind`、`UserRef`、
target 与来源真实性；目标由 `personalTarget(UserRef)` 重算，T 从 F.sourceRef 派生，
C 仅取公开 F 字段计算摘要。较早 pending、凭据碰撞或客户端自报来源均不构成资格。
短门核冻结 F 与 Tenant/Admission 当前根的同代绑定，不等待 Account I/O；Account
短暂失联不撤销同代已冻结的 F，换代须重新读取，旧 generation 不得取得新写权。

两来源共用同一套 T/C、记录、认回与恢复协议：仅向目标 `tenant:<target>` 流的
空前态提交一个 append，其中 personal tenant、creator 与唯一 active owner 成员
同成同败。目标由不复用的 UserRef 注入得到，不需要 global index；init 一次性资格
属于 Account，不产生 Tenant bootstrap 流。DR 按普通单租户写入验证 scope、CAS、
原操作与完整前缀，Tenant 验证 F/T/C、user、target、creator/owner 和个人种类。
不同 F 声称同一 UserRef 时仅一个 T 可占目标首位置，另一 T 是本操作的 durable
conflict，不可认回别人的成功；第二 owner 或坏前缀均拒绝 ready。新的
owner 正向资格和 ACR 激活证明只在完整耐久前缀、全部 owner publication 与本代
可消费基线同时成立时可读；unknown、sync 失败和 blocked publication 均不开放。

Host 查询分别呈现历史 durable 提交、当前 publication 可消费、本次 tenant/owner
业务资格；旧租户 closing/closed 后同操作只认回历史，当前业务拒绝。writer unknown、
回执丢失或暂时 `not_seen` 保留原 target/claim 占位；仅独占恢复证明旧 writer
未提交且安全解除全部占位后，同输入同 target 才可重备。已提交但 owner publication
失败时原 completion 永久保留 `committed_blocked`，CC-06 新代全 owner 基线完成后
本代查询另给可消费证明，不重发批次或改写原 completion。

## 个人 owner 管理与关闭守卫

`closeTenant(personal)` 及 TG 中以个人 owner 资格发起的管理变更，在取得逻辑
位置的短门内核对可信 actor 的 `UserRef`、当前唯一 active owner membership
revision，以及 Account 对同一 `UserRef` 已耐久 `active` 的当前可核验证明。
任何一项缺失、pending、异账号、seed/系统标签或 owner 尚未可消费均拒绝/
unavailable；pre-active close 不排位也不保留待激活后自动执行的占位。active
后须由 owner 另行显式发起。普通 `changeMember`/`removeMember` 不能暂停或移除
个人唯一 owner；closing 后的清理按 TG-03 留存责任进行，不从 member 变更
旁路关闭。首版没有受信系统关闭入口。Account active 事实的受信交付和在短门
中的同代读取尚无 provider 证据，未闭合前不得开放这些管理入口。

## 组织、定义与权益的来源交接

组织成员管理沿当前 Tenant 根核对真实账号主体及 `(tenantId,UserRef)` 成员，不能
用 CLI 当前组织选择代替资格；移除最后一名有效 super_admin 须拒绝，最高资格
转移在一份共同提交中成立。个人 owner 的特殊守卫不授予组织成员关系，组织入会
仍由自身准入规则裁决。`tenant.members` 等治理操作集合不隐含 Session 正文、
请求代答、调用控制或资源动作权限。

定义发布由 TG 保留精确草稿修订、不可变发布版本及内容摘要；公开管理不能把
customized 改成 official，官方种入只由受信来源完成。Entitlement 的签发权与
修订事实来自源资产/权益 owner，受益租户管理员不能通过本地选择自授；跨租户
签发仅授被指明的定义及版本权利，不开放来源租户通用读写。Acquisition 是消费
租户的选用关系，enabled 不是运行贡献已装载，停用/移除也不撤销已经准入的工作。

`registerReferenceSource` 只给具名 SR/TL 等真实引用 owner 的受信 link。双方在
短门外各自准备，在同一 coordinator 逻辑位置登记相同的 source、registration、
generation、适用范围及 stamp；LOADING 仅 held，双方及 link 当代可用后才参与
正向检查。撤除只退休本次精确登记，旧 disposer 不得移除新代来源。来源对
`prepareReferences` / `checkReferences` 返回带 owner revision 的完整性报告；
`complete=false`、恢复未完或来源失联不是“没有引用”，应使依赖完整清单的
discard/retire/disable/remove unavailable。仅在引用创建已封闭且能证明来源
不适用时才可从该操作的必需清单排除。新增 SR/TL 引用与 TG 撤选/退役须在
同一门核对来源 stamp；TG 不从异步投影推断无引用，也不反向依赖 SR/TL 实现。

## 与预算核算的边界

TG 拥有 tenant/member 以及 `budget.manage` 等管理资格，负责入口是否可用；它不拥有
SubscriptionLink 的本地关联、变更意图、结果或对账状态。BG 唯一保存这些状态，供应方仍
拥有实际订阅事实。跨能力操作必须在共同门中重读 TG 资格与 BG 修订。
