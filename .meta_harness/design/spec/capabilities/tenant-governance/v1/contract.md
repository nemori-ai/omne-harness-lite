# 租户、成员与定义资产 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.tenant-governance, 1)`。正文从同名
legacy v1 重基，保留 TG-01～TG-05；D-008 及 tenant-contracts 历史候选只作 provenance，
不自动接受新坐标。本坐标保持 candidate、`acceptance:null`。TG-01 的个人创建增量
落实用户已明确接受的首次 init 与后续注册共用一套机制方向；其候选比较见
[个人租户提案](../../../../proposals/personal-tenant-creation/README.md)。架构方向接受
不等于本精确规格或提供者已经接受、发布和验证。

本能力拥有租户、成员、定义、权益和选用事实。自然人身份由认证边界提供；动作授权、
预算、Session 正文权限与运行控制仍由各自能力拥有。租户管理入口只核定谁可管理预算；
`SubscriptionLink` 的本地关联、变更意图和对账状态由预算核算能力唯一拥有。

个人创建精确消费同 baseline 的 [CD-01/02](../../../data/core-work/v1/contract.md) 身份与
因果绑定、[AI-01/02/02a/04/08](../../account-identity/v1/contract.md) 的来源事实 F，
以及 [CC-03/06](../../../compositions/core-work-coordination/v1/contract.md) 的当前代排位
与恢复发布。三项依赖坐标分别为 `data.core-work@1`、
`capability.account-identity@1`、`composition.core-work-coordination@1`，均为本
baseline 的 candidate。下游
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

个人租户只有一套 Tenant 创建状态机，供受信 init 与后续注册使用。Tenant 经当前装配
直接读取 Account 的完整 F，核对来源服务、版本、`sourceRef`、`entryKind`、
`UserRef` 与 target；客户端字段、旧 session、seed 文本、未发行 F 的 pending 身份
均不能取得资格。Account 缺席则保持 pending；F 已发行后 logout、注册入口关闭、
账号 active 或 provider 换代不撤销它。旧实例不能在新代提交。

`personalTarget(UserRef)` 的精确编码是 `personal:user:` 加 `UserRef.userId` 的 UTF-8
字节按 RFC 4648 URL-safe base64 无填充编码；输入必须是共享 `OpaqueId` 的规范字符串，
且只含 Unicode scalar values；解码再编码必须相同。此编码对 UserRef 注入，与非个人租户 ID 空间不相交。Account
首次持久绑定 UserRef 时固定此 target，Tenant 从 F.userRef 重算，错配拒绝。两个不同
F 若含相同 UserRef，落在同一 target，但不得因此把第二来源认回为第一来源的成功。

Tenant 原操作 T 为 `{namespace:"tenant.personal-create",principalId:"{\"kind\":\"system\",\"systemId\":\"tenant-personal-creator\"}",operationId:"source:"+base64url(UTF8(F.sourceRef))}`；
来源 ref 的完整编码注入且域分离。T 不等于 Account 内部 A。Tenant 对同一 T 先查
占位/耐久结果；同输入认回，异 F、异 target 或异输入在可核实占位/结果时冲突。
不同 T 争同一 target 时，唯一目标流的空前态 CAS 只允许一个成功，另一个明确
冲突；不同 UserRef 的目标流互不竞争。关闭后不同新来源再建个人范围首版不开放。

编码正反例：`UserRef={userId:"u1"}` 的字节 `75 31` 给 `personal:user:dTE`，
`{userId:"u2"}` 给 `personal:user:dTI`；`F.sourceRef="src-1"` 的字节
`73 72 63 2d 31` 给 T.operationId `source:c3JjLTE`。解码必须回得原字节及规范
字符串，带填充的 `dTE=`、不规范 UTF-8 或不成对 surrogate 均拒绝。`sourceRef`
同样必须只含 Unicode scalar values；不以固定长度哈希代替上述注入编码。

T 的冻结 C 使用 [DR-01](../../durable-records/v1/contract.md) `core-operation/1`：
`tenantId=target`、`principal={kind:"system",systemId:"tenant-personal-creator"}`、
`operationKind="tenant.personal-create/1"`、`target={kind:"personal-tenant",tenantId:target}`、
`arguments={sourceRef:F.sourceRef,sourceVersion:F.version,entryKind:F.entryKind,userRef:F.userRef,targetTenantId:target}`、
`preconditions={}`、`causality={}`。`inputDigestT=SHA-256(UTF8(core-json/1(C)))`。
DR 只认回 T/C，不存 A、`digestA`、密码或凭据标识。当前 CAS、writer/host/owner
generation 和短门资格是尝试状态，不进 C。Tenant 将同一目标租户流
`{namespace:"tenant",owner:"tenant-governance",scope:{kind:"tenant",tenantId:target},streamId:"tenant:"+target}`
的空前态、个人种类、creator 与唯一 active owner 成员放在 CC-03 当前代短门核对，
再用普通单租户 DR-01 commit 一批提交。一个 append 内的 tenant/owner facts 同成同败；
没有 system personal-index、bootstrap 流或跨 scope 特例。init 的额外一次性准入归
AI-08，Tenant 仍核对受信 init 来源与已核实空 Tenant 前态；writer epoch 存在不等于
Tenant 已建立。个人创建不附带组织成员，不以历史创建授业务访问。

Tenant 的 T 查询区分 `reserved`、`pending_durability`、`unknown`、历史已提交而 owner
publication 受阻的 `committed_blocked(owner_publication_required)`、durable committed
及本代可消费证明。结果绑定 F/T/C 摘要、target、UserRef、creator/owner、批次位置
与水位。逻辑占位不开放 owner 管理或账号激活。只有完整耐久前缀与 CC-06 全 owner
publication 本代可消费后，才能给 ACR 激活证明；当前业务仍分别核 Account active
与 Tenant 资格。租户 closing/closed 后旧 T 只认回历史，不能恢复访问权。

sync 失败、writer unknown、回执丢失及暂时 `not_seen` 均保持 T/target 占位；只在
独占恢复核实完整前缀、证明 T 未提交且安全解除占位后，才可用同 T/C 重备。
publication blocked 时不重提批次；CC-06 受信宿主在新代一次安装覆盖该位置的全部
owner roots 后，查询另给可消费证明，不改写历史 completion。恢复按单条目标流核对
F/T/C、个人种类、creator、唯一 owner 和 target；错来源、错 owner、第二有效 owner、
撕裂或坏前缀不得发布 ready。

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
