# 租户、成员与定义资产 v1

本契约坐标为 `(omne-harness-lite-design-2026-09-15, capability.tenant-governance, 1)`。正文从同名
legacy v1 重基，保留 TG-01～TG-05；D-008 及 tenant-contracts 历史候选只作 provenance，
不自动接受新坐标。本坐标保持 candidate、`acceptance:null`。

本能力拥有租户、成员、定义、权益和选用事实。自然人身份由认证边界提供；动作授权、
预算、Session 正文权限与运行控制仍由各自能力拥有。租户管理入口只核定谁可管理预算；
`SubscriptionLink` 的本地关联、变更意图和对账状态由预算核算能力唯一拥有。

## 租户与成员

**TG-01**：自然人全局身份与 `(tenantId,userId)` 成员关系分离。首版产品租户有
personal、organization 两类；平台提供者是可信系统主体，不沿用旧候选未定义的
platform 租户管理语义。个人租户创建与唯一有效 owner 成员共同提交；同一自然人
最多一个有效个人租户。组织至少一名有效 `super_admin`，另有 `member`；具体
委派权限使用显式操作集合，不预建一套无需求的 admin/editor 角色层次。

`createTenant`、`addMember`、`changeMember`、`removeMember`、`closeTenant` 由
对应管理主体调用。个人 owner 不可替换为其他人，不允许增加第二名个人成员。
组织 super_admin 可管理本组织成员及适用资产／配置／预算；变更不能移除最后
一名有效 super_admin，转移最高管理资格以一份共同提交完成。成员状态
active／suspended／removed，removed 后重新加入形成新 membership revision，
旧授权依据不因身份相同恢复。所有操作记录操作者和生效修订。

个人租户的首次 bootstrap 是受信 Tenant owner 在共同准入门内的一次操作：同一耐久批次
同时写入系统 bootstrap、个人租户唯一索引和新租户流；新租户流仍属于该租户，不能改记为
系统资产。Tenant 在门内核对当前初始化前态、seed principal、唯一 claim、创建者及唯一
有效 owner 成员；在恢复时按**同一批次**重新核对这三条事实的 tenantId、userId、
creator/owner 和个人租户种类。分别解码成功但批次关联不符或出现第二个有效个人租户的
前缀不能 ready。此处的初始化前态是 Tenant 权威尚未建立，而非存储日志物理空文件。

逻辑位置可以先占用唯一索引并封闭竞争初始化，但新成员、新租户管理权限和任何扩大
的正向资格只能在共同耐久发布后供准入消费；sync 失败、unknown 或部分发布均不得开放。
相同操作认回原结果及已经分配的目标 tenantId；异输入沿原身份冲突，不借新键
重试。逻辑排位后尚未耐久或写入结果 unknown 时必须保留原操作/目标占位并查询
核实，不能因查询暂时 `not_seen` 再分配目标。重启后只有完整前缀与写者隔离共同
证明原操作未提交、原占位已安全解除，才可重新准备目标。异输入冲突保证只在
仍有原操作准备占位或耐久 outcome 可核实的范围内成立；安全证明未提交并释放
全部占位后，没有保留未提交旧输入的隐含 tombstone。

**TG-02**：用户选择当前组织只是新操作的目标上下文；既有 Session 的 tenant、
owner 和原定义关联不可由切换菜单改变。组织不可用、成员失权或目标不匹配明确
拒绝，不回退个人租户。不把同一用户在多个组织的权限和权益合并。个人 Session
正文默认只对 owner 及明确获准主体可读；组织管理员的管理权或财务汇总权不
自动包含私有 Session 内容。紧急运行控制是独立资格，操作不必取得内容读取权。

**TG-03**：关闭租户先进入 closing，封闭新业务准入并保留获准读面／清理；列出
仍活动的 Run、后台调用、未结算决定、财务责任与资产引用。显式控制或交接使其
收口后才能 closed。关闭不是物理擦除、供应方退款或任意外部效果撤销；失败、
未知及剩余责任可查询。已关闭 tenant 身份不复用，重试只认回原关闭操作。

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
