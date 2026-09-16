# 租户、成员与定义资产 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.tenant-governance, 1)`。正文从同名
legacy v1 重基，保留 TG-01～TG-05；D-008 及 tenant-contracts 历史候选只作 provenance，
不自动接受新坐标。本坐标保持 candidate、`acceptance:null`。TG-01 的个人创建增量
落实用户已明确接受的首次 init 与后续注册共用一套机制方向；其候选比较见
[统一协议提案 B](../../../../proposals/personal-tenant-creation/alternatives.md)。架构方向接受
不等于本精确规格或提供者已经接受、发布和验证。

本能力拥有租户、成员、定义、权益和选用事实。自然人身份由认证边界提供；动作授权、
预算、Session 正文权限与运行控制仍由各自能力拥有。租户管理入口只核定谁可管理预算；
`SubscriptionLink` 的本地关联、变更意图和对账状态由预算核算能力唯一拥有。

个人创建精确消费同 baseline 的 [CD-01/02](../../../data/core-work/v1/contract.md) 身份与
因果绑定、[AI-01/02/02a/04/08](../../account-identity/v1/contract.md) 账号原操作、
身份、目标与一次创建授权的耐久来源，
以及 [CC-03/05/06](../../../compositions/core-work-coordination/v1/contract.md) 的逻辑排位、
耐久后果导入及全 owner 恢复。三项依赖坐标分别为 `data.core-work@1`、
`capability.account-identity@1`、`composition.core-work-coordination@1`，均为本
baseline 的 candidate；CC-05 来源导入及 CC-03/06 的提供者映射尚未闭合，不能由
本契约替它们颁发混合流写入权。下游
[ACR-03～06](../../../compositions/account-registration/v1/contract.md) 消费 TG-01
回执与可消费证明以完成跨 owner 激活，不形成 TG 对 ACR 的反向依赖。

## 租户与成员

**TG-01**：自然人全局身份与 `(tenantId,userId)` 成员关系分离。首版产品租户有
personal、organization 两类；平台提供者是可信系统主体，不沿用旧候选未定义的
platform 租户管理语义。个人租户创建与唯一有效 owner 成员共同提交；同一自然人
最多一个有效个人租户。组织至少一名有效 `super_admin`，另有 `member`；具体
委派权限使用显式操作集合，不预建一套无需求的 admin/editor 角色层次。

`createTenant`、`addMember`、`changeMember`、`removeMember`、`closeTenant` 由
对应管理主体调用。个人 owner 不可替换为其他人，不允许增加第二名个人成员。
个人 owner 也不可经普通 `changeMember`/`removeMember` 被暂停、移除或变为没有
唯一 active owner；关闭后的责任清理由 TG-03 收口，不以普通成员变更绕过。
个人租户中凡以 owner 资格发起的 TG 管理变更，均须在其逻辑准入门核对：可信
发起账号的 `UserRef` 与该租户唯一 owner 相同，且 Account 权威已耐久确认该账号
`active`。pending、其他账号、seed 或系统标签均不满足该门槛；缺少可信 active
证明时拒绝/不可用，不因创建回执或 owner 成员已耐久就授予管理权。这项门槛只
约束个人 owner 管理，不为独立组织入会设新政策。
组织 super_admin 可管理本组织成员及适用资产／配置／预算；变更不能移除最后
一名有效 super_admin，转移最高管理资格以一份共同提交完成。成员状态
active／suspended／removed，removed 后重新加入形成新 membership revision，
旧授权依据不因身份相同恢复。所有操作记录操作者和生效修订。

个人租户只有一套 Tenant 创建状态机，供两个**不同的受信入口**使用：部署首次
`initializePersonalForDeployment` 与后续账号注册的 `createPersonalForAccount`。前者的
新操作须在共同门中核对 Tenant 权威尚未建立、受信 seed 与独占初始化资格；
**初始 `UserRef` 必须由独立 Account 权威耐久分配，不能从 seed 字符串生成或由
Tenant 自造**。初始账号也须先完成唯一凭据绑定，并形成与 seed、原操作、摘要、
`UserRef` 和目标一致的一次个人创建后果；Tenant 核验该受信绑定及后果已耐久导入
才可排位。该 Tenant 前态不是 JSONL 物理空文件，也不因 writer epoch 已存在而
失效。后者的新操作须核对来自账号权威的一份已耐久、仅授权**该原注册操作**创建个人租户的后果：
凭据标识唯一绑定、稳定且不复用的 `UserRef`、原操作/冻结摘要及 personal target
已经成立。两个入口的 Account 来源后果由 CC-05 受信接收者核实来源版本和全部
绑定并耐久导入本协调域；初始后果如何在 Tenant 权威未建立时导入、怎样将 seed
绑定到来源身份，须由 Account/CC 的同一来源协议闭合，不能把 Tenant 首次前态
等同于 CC 协调域不能先有导入事实；
未核实或未耐久导入不得取得 Tenant 新逻辑位置。导入事实是 Account 原后果的引用，
不变成第二个 Account 权威。首版无取消注册/关闭账号操作，入口关闭、logout、账号
转 active 或 provider 换代不撤销已成立后果；这也不授予任何业务访问权。未来若
引入取消后阻止尚未排位创建，须另定义撤销与排位先后。短门只核已耐久导入事实、
Tenant 当前根及本代准入资格，不等待账号 provider I/O。客户端填写的 origin、
owner、operationKind、`UserRef` 字符串或旧 session 均不授予入口资格。

两个入口共用唯一 claim、操作占位、批次、结果与恢复规则。原操作、冻结输入、
`UserRef`、个人种类、creator、唯一 active owner 及目标 tenantId 在首次逻辑排位前
固定。个人 target 采用 Tenant 定义的注入式、域分离映射
`personalTarget(accountAuthorityNamespace, entryKind, originalOperationId)`；两个不同
来源操作不得映到同一 tenantId，且与非个人租户 ID 空间不相交。部署 init 与账号
注册均先按该规则确定 target，Account 首次耐久原操作绑定它；Tenant 核验来源后果
中的 target 与规则一致，不在重试时随机分配。Account 首次提交前若准备进程崩溃，
没有已发布的身份或 target；重启先核实 Account 原操作，已提交则认回原绑定，
确认未提交才以相同命名空间、入口和原操作重备，规则仍给出同一 target。提交
unknown 时不得仅凭本地缓存或暂时 `not_seen` 判断未提交，也不得开启新操作绕过核实。
Tenant 先按精确原操作查占位/耐久结果，再作新操作准入：
同键同输入认回原 target 与历史结果，不因部署后来已初始化或账号已 active 而重跑
首次前态；异摘要、异 user、异 target 或异来源，在占位或耐久 outcome 可核实的
范围冲突。另一原操作争同一 `UserRef` 的有效个人 claim 或同一 tenantId 明确冲突。
关闭后的不同新操作再建个人租户首版不开放，未来政策未决；旧操作可认回历史事实。
本创建操作自身只产生一份 personal tenant/唯一 owner，不附带组织成员；业务
使用仍核 Account active 与当前 Tenant 资格。“默认恰一”只描述本初始化/注册
创建的结果，不给独立组织入会操作增设本契约未授权的准入政策。

新操作在 CC-03 同一短门获得逻辑位置并占用 global system `tenant-personal-index`
唯一 claim，以索引 CAS 封闭竞争。本操作恰创建一份 personal tenant 和该
`UserRef` 的唯一 active owner 成员，不顺带建立组织成员关系；一个耐久批次必须
共同写入该 claim 和目标
`tenant:<tenantId>` 流中的 personal tenant、creator 与唯一 active owner 成员；部署
init **同批再写** system `tenant-bootstrap`，注册批次不写 bootstrap。目标 tenant 流
仍属目标租户，不能改记为 system 资产；不能先写索引后补租户/成员。Tenant 核对
业务唯一性和同批关联；[DR-01](../../durable-records/v1/contract.md) 与 CC-03
候选已声明共用的单次封闭混合流资格、CAS、排序、持久结果及门内颁发，提供者
尚未实现和验证，候选文字本身不开放后续注册。

逻辑占位只封闭竞争，不开放新 owner、租户管理权或 ACR 激活。Tenant 的精确原操作
查询区分 `reserved`、`pending_durability`、`unknown`、历史已提交但 owner publication
受阻的 `committed_blocked(owner_publication_required)`、以及可核实的 durable committed
与**本代**可消费证明；结果绑定原操作、摘要、来源、`UserRef`、target、个人种类、
creator/owner membership、批次/位置和水位。历史提交、当前 publication 可消费和当前
租户/成员业务资格是三层不同事实。只有完整耐久前缀与全部 owner publication 可消费
后，新正向资格和供 ACR-04 使用的同绑定证明才开放；租户后来 closing/closed 时旧
创建仍可认回，但当前 TG-03 业务准入拒绝，历史回执不能恢复权限或单独激活账号。

sync 失败、writer unknown、回执丢失或查询暂时 `not_seen` 均保留原操作/target/
claim 占位，不换键、不换目标、不重发第二批。只有独占恢复核实旧 writer 的完整
前缀、证明原操作未提交且全部占位安全解除，才允许**同一原操作、摘要与 target**
重新准备；无遗留 tombstone 时不虚构释放后永久异输入冲突。已提交而 owner 发布
失败时原 completion 保持 `committed_blocked`；仅 CC-06 受信恢复宿主在新代一次安装
覆盖该位置的全部 owner roots，本代查询再给单独的可消费证据，不重写历史 completion
或重提批次。恢复逐批按来源核对二流或三流同批、原操作/target/user/个人种类、
creator 和唯一 owner 一致性及 personal-index 唯一性；错批、错来源、错 user/owner、
第二有效 owner、撕裂或坏前缀均不得发布 ready。

**TG-02**：用户选择当前组织只是新操作的目标上下文；既有 Session 的 tenant、
owner 和原定义关联不可由切换菜单改变。组织不可用、成员失权或目标不匹配明确
拒绝，不回退个人租户。不把同一用户在多个组织的权限和权益合并。个人 Session
正文默认只对 owner 及明确获准主体可读；组织管理员的管理权或财务汇总权不
自动包含私有 Session 内容。紧急运行控制是独立资格，操作不必取得内容读取权。

**TG-03**：关闭租户先进入 closing，封闭新业务准入并保留获准读面／清理；列出
仍活动的 Run、后台调用、未结算决定、财务责任与资产引用。显式控制或交接使其
收口后才能 closed。关闭不是物理擦除、供应方退款或任意外部效果撤销；失败、
未知及剩余责任可查询。已关闭 tenant 身份不复用，重试只认回原关闭操作。
个人租户的 `closeTenant` 只准其唯一 owner 对应的耐久 `active` Account 在同一
逻辑门发起；首版没有受信系统绕过关闭入口。pending 期间到达的 close 请求可被
识别但须拒绝，不占待激活后自动执行的位置；账号 active 后 owner 可重新显式发起。
若 owner publication 尚未可消费、账号状态未知或 actor 不匹配，也不得关闭。

## 定义、权益与选用

**TG-04**：Skill、SlashCommand、Plugin、Agent Definition 具有稳定 DefinitionRef，
owner 与 creator、official/customized 来源分别记录。官方来源仅由受信种入
主体声明；公开管理面不能修改官方原件。草稿 `draftRevision` 可条件编辑，
发布产生不可变精确 version 和内容摘要；发布重试不增版本，修改旧发布内容拒绝。
有引用义务的草稿不能丢弃；已发布定义退役保留原件和历史，不提供无痕硬删除。

操作为 createDraft、editDraft、publish、discardDraft、retireDefinition、readVersions。
有权 Agent 可作为实际作者，owner 取本次明确租户而非创作者身份。fork 需要相应
派生权，新建 DefinitionRef，保留源引用和新 owner；不继承原定义的动作授权。
定义的可配置默认与原件分离，用户覆盖不修改已发布内容。

**TG-05**：`Entitlement` 由有权签发者拥有，绑定受益 tenant、DefinitionRef、版本
范围、use／derive／redistribute 等精确权利及条件、期限和状态；本租户 owner
权益来自所有权，不伪造外部自授。外部权益的暂停/撤销/到期由来源权威确认；
管理员不能把本地选择改成有效外部权益。准入检查当前依据且不借用个人权益。
明示跨租户共享只授予被引用定义在该操作内所需访问，不授予来源租户通用读取。

`Acquisition` 由消费租户拥有，记录精确选用版本、开放配置和 enabled／disabled／
removed；selectVersion、configure、disable、remove 只改变选用关系。发现新版
不自动升级；选用不等于真实装载。停用或移除先检查并报告 Agent／Session／日程
等引用，默认不级联删除、不换目标、不停止已准入调用。可以让相关后续使用明确
阻塞；引用需重选时由各自管理操作承担。操作结果记录受影响引用和后续生效边界。
