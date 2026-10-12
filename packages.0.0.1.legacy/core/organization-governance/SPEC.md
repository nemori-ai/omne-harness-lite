# 组织治理公共承诺

本包拥有公开操作类型及四个 Cordis 服务定义。形状以 `src/index.ts` 的导出为准，
本文件在[现行系统架构](../../../docs/architecture/README.md)下拥有业务及集成细化。[资产治理增量](#已接受而未实现的资产治理增量)的关系时刻与分享不复活细化有PF-003及[资产责任](../../../docs/domains/assets-and-rules/README.md)依据，仍未实现；旧接受记录不授予架构例外。原模型及真实组合责任归本成员verification。不得从提供者现状推导承诺。

## 接缝与消费者

根入口不加载 Cordis。`./cordis` 拥有四个抽象 Service、唯一服务键和 Context/Events 增补。
提供者继承服务定义，消费者引用公共定义。提供者的工厂、迁移及后端对象不进入本包。
四个服务由同一能力拥有，不因分成四个类就变成四份数据或独立事务。

| 定义              | 唯一键            | 操作形状                 |
| ----------------- | ----------------- | ------------------------ |
| Organizations     | organizations     | OrganizationsService     |
| Offers            | offers            | OffersService            |
| Memberships       | memberships       | MembershipsService       |
| OrganizationPurge | organizationPurge | OrganizationPurgeService |

清除面只供注册/清除链消费。公开类型可见不等于获得调用权限。
服务定义不实现授权、存储或运行时调用防火墙。装配、静态约束与业务前置各自承担保护。
本批将清除键改成 IC-7 要求的 camelCase，取消旧运行时键，不保留兼容别名。

## 保持的行为与共同提交

公开形状表达闭合结果集合；本页拥有业务判定、失败次序、幂等边界和租户责任。形状本身不证明授权或同提交。

普通操作在自身事务结束后返回最终结果。`participate` 加入调用方拥有的 StorageUnit，
内部返回为暂存结果，外部成功和通知必须等真实提交。参与事务必须与账号参与面使用同一 StorageUnit。
创建个人组织和清除个人组织仍归注册/清除独立链，不隐式加入入口业务事务。

参与面不能把存储异常提前转成 unavailable 后提交半份业务事实。
异常和不可验证成功污染共同事务，由唯一终结边界回滚后映射失败。
授权现读、角色/成员有效性、当前租户比较及业务写入须在共同保护下完成。
租户键跨解除/重新加入保持同一，跨租户访问默认拒绝。

事件是提交后的通知，不是权限更新或效果已经被消费者接收的证明。
同步监听者失败只记诊断，不改已提交事实及业务结果。异步工作由监听者自己收场。
五个事件采用 organization-governance 命名空间，载荷和派发时点保持，不双发旧名。

## 组织名称、创建与读取

本增量依据 PF-001 rev26 的组织名称规则及负责人对中心保存名称的实施授权。
公开接口采用 `createTeam(creatorAccountId, name, creationKey?)`，组织读面新增必有的 `name`。
它取代当前提供者中旧 OG2 S-21 的无名称输入，以及 S-20/S-22 的无名称效果与读面。
账号判定、个人组织唯一性、首位超管、父链和原失败集合保持。
冻结旧源不原地修改，不约束这一已明确取代的名称形状。

- 名称必须是非空白字符串。校验以 JavaScript `trim()` 判空，存储和读取保留原字符串，不静默裁剪或改名。
- 团队组织必须显式提供名称。名称、组织、创建者的有效超管成员关系及可选创建键在同一提交中成立。
- 名称不参与身份、授权或去重，同名可以创建不同组织。本增量没有改名操作。
- 自动创建个人组织时名称为“个人组织”。同账号重复创建仍返回原身份，仍现读账号存在及未过期事实。
- 组织读取返回持久名称及原身份、种类、父组织。读失败不能以默认名称填充，损坏记录按缺陷处理。

团队创建仍以 `(creatorAccountId, creationKey)` 为去重边界。没有键时每次创建独立组织。
保留期内同键、同名称返回原身份，不重写名称或成员关系。同键、不同名称以 `invalidInput` 拒绝，
不创建另一组织、不改原名称。过保留期后同键允许新创建，按本次名称产生新组织。
名称及创建键的表示校验先于账号读取，账号读取先于存储创建。失败不得留下部分效果。
创建两类组织均不增加通知事件，现行共同参与、回滚及提交后通知义务保持。

验证须覆盖名称落盘与重开读取、另一个有权客户端读取、同名不同身份、个人默认名称、
无效名称零效果、同键参数冲突、保留期及首位管理员插入失败的整笔回滚。

## 验证义务

提供者须验证真实存储的唯一约束、末位超管竞争、隶属无环、邀约终结竞争、
清除链、幂等键、租户键稳定以及共同事务回滚。类型测试不替代这些验证。
集成验证须覆盖四键同 fiber、依赖缺失、提供者替换、卸载和调用方 Context。
必需提供者换代时，消费插件的旧效应须撤除并重新装载，持久业务事实不随换代丢失。
现有模型与故障用例继续有效，其资源、有限前提及真实组合义务见[验证入口](verification/README.md)。

## 组织、成员与隶属

kind 在创建时定死。personal 唯一 owner 及有效 superadmin，无上级，不能邀请、退出或参与隶属。team 没有销毁路径；唯一清除是过期未激活账号的 personal purge。单 parent／无环的隶属不创成员或 TenantId，发起、接受各一步，不能单方指定；解除可由任一端 superadmin 单方执行。ancestorChain 不含自身；shareAncestor 比较含自身的两条链，personal 与不同组织恒 false。纯定义由 identity-values 拥有，不另造算法。

身份缺失先 invalidInput，不从环境或当前租户补。邀请 role 默认 member（普通成员）；两类 offer 各有独立部署默认 duration，非法值拒绝，不共享默认。创建键缺失不去重；三类 offer 列表默认 pending，成员列表默认有效。表示先于授权，非法过滤先拒；不可用不等于不存在／失权／空集，不回退 personal。每道准入现读资格，不借幂等、通知、旧名单跳授权；撤销不追溯停止已准入动作。

createPersonal 含已有幂等在本次提交现读 Account 存在且未到期；未激活可建，到期拒，旧依据不复活。组织、owner 成员及 superadmin 同提交，按 AccountId 幂等，不二建、不区分返回、不发事件。createTeam 需 active Account；组织、创建者成员、superadmin 及有键时的登记同提交。键作用域为(account,key)，保留期内认原组织，无键每次新组织，过期同键造新组织。登记或账号不可判为 unavailable，不当未见。read 只交结构，不交成员列表；不存在／不可用／invalidInput 分开。

邀请 issuer 须非 personal 组织的当前有效 superadmin，target 须 active 且非有效成员。每 issue 新 offer，不对 pending 去重，期限在提交内定死。accept 的调用 accountId 须等于 invitation.target，否则 notTheInvitedAccount；同提交重判 pending、target active，并按组织串行化。pending 目标已为有效成员则 alreadyAnEffectiveMember，不改其 role、不把新邀请标 accepted；accepted、有效成员、指定 role 一起成立。重复 accept 为 offerNoLongerValid，多份邀请也不能二建成员；重新加入同 TenantId，新 role 取本次 offer，不继承旧 role。withdraw 仅当前 issuer 组织 superadmin；foreign 与未找到同定位失败，自己 withdrawn 仍先授权才幂等成功；accepted／declined／expired 为 alreadyConcluded，不写。送达意味着可查询，不靠事件交付。

declineInvitation 次序是表示→定位且 receiver 相等（foreign 统一 doesNotExist）→active Account；declineAffiliation 是表示→定位且 acting organization 为 receiver→当前 receiver superadmin。两者与 accept／withdraw 排同一 offer 次序。pending 才迁 declined，已 declined 仍先授权才幂等成功，其他终结 alreadyConcluded。不创成员／TenantId／隶属，不反撤已 accept，不发事件；必要时刻／身份／组织不可判为 unavailable，未知不证明没拒绝或可自动重试。期限和终结谓词只引用 offer-expiry，不复刻。

changeRole／remove 的 initiator TenantId 与 target TenantId 必须指同一组织，不跨组织借超管资格。changeRole 须发起者为该组织当前有效 superadmin，目标当前有效；普通成员无改role权，无效目标拒绝，不先更新后核资格。remove 的发起者必须当前有效，且是self或该组织superadmin；同组织的资格和目标效力都现核。成员 join／change／remove 按同组织串行化，不能只保各自先读再写。表示或组织不相等为 invalidInput，发起者无当前权限为 notAuthorized，目标无效为 membershipNotEffective；最后有效 superadmin 不可降级或移除，拒绝为 wouldLeaveNoSuperAdministrator。无法读取末位超管条件为 unavailable，不证明仍有或已无其他超管。原 role 幂等仍须核当前资格，且不二次效果。无效目标 remove 为 membershipNotEffective，personal 禁止移除，拒绝为 personalOrganizationMemberCannotLeave；self 退出或 superadmin 移除仍核当前资格。standing 仅 effective(role) 或 ineffective；不可判 unavailable。mine 对不存在／未激活无 personal 可真空；active 空是缺陷，不可用不是空。remove 不删持有、不迁资产、不造 TenantId；历史身份可引用，重新加入同 pair／同 TenantId，新 role 不继承旧值。资产保留／不可达责任归资产拥有者。

issueAffiliation 两端非 personal、receiver 不为自身，issuer 当前 superadmin，方向定 parent／child，每次新 offer。accept 在同提交重核 pending、receiver superadmin、child 无 parent、child≠newParent 且 child 不在 newParent 的祖先链。链不可读不放行，不能因 issue 挡自环省 accept 守卫。parent 与 accepted 同提交，不创 tenant；重 accept 为 offerNoLongerValid。withdrawAffiliation 须由 sender 组织的当前有效 superadmin 发起；非该组织的请求与未找到统一 affiliationRequestDoesNotExist。自己 withdrawn 仍先核当前授权才幂等，其他 terminal alreadyConcluded；dissolve 核实际关系及任一端 superadmin，无关系 noSuchAffiliation，无二次效果。

## 受限清除、读取和当前选择

purgePersonal 先 Account，再组织，再 kind；Account 存在时须同提交未 active 且 expired。Account 不存在仍查组织：也无为幂等成功并产绑定依据，组织还在为 accountDoesNotExist 缺陷，不补删、不交依据、不掩成 unavailable。Account 在而组织已无仍核账号状态。真实 personal 的组织及成员同提交删；成功及幂等均产不可伪造、绑定 AccountId 的清除依据，不消费、不以它免除身份域再次现判。不可用无依据。正常删除仅 organizationPurged 通知，幂等无，不伪 membershipChanged。该受限面只给注册组合，公开类型可见不授调用权。

scopeLayers 只从合法 Tenant 结构推层，不授资格。currentTenant 先有效登录，只有明确从未切换才初值 personal，不可读不是初值。选中租户失权不自动改选，使用仍核 standing。switch 核同账号及当前有效成员，同 choice 幂等，只影响未来新对象，不复制事实，不迁旧 Session 或费用。

readInvitation 仅 target Account 或 issuer 组织 superadmin；readAffiliation 仅两端 superadmin，其他统一隐匿定位，依赖不可用不装不存在。receivedInvitation 是本人入口，无跨人超管路径；listIssued 同时列本组织发出的 invitation 与 affiliation，两类均仅该组织当前有效 superadmin 可读；received affiliation 列表也仅接收组织当前有效 superadmin。成员默认有效项给任何有效成员；includeIneffective 仅 superadmin，拒绝不降默认，不把超管完整名单裁剪后冒普通读取。每项 offer state 读时求值，任何项不可判整体 unavailable，不丢项／返空／捏 pending 或 expired。列表 role／效力只是投影，不当未来准入。

个人初值／选择清扫与登录活动、revoke、改密排序；清扫在同边界证明登录当前无效才删，不可判不删。本能力不新增清扫调度器。可信业务入口在同提交把当前 selection 与客户端 expectedTenant 对照；JSON Tenant 不是授权。

## 已接受而未实现的资产治理增量

当前公开操作与提供者是上述治理能力；资产治理增量不是当前接口的版本兼容层。以下义务已接受但尚未实现，不从当前结构类型或模型通过推断兑现：

- 隶属 accept 同提交写建立时刻，dissolve 清 parent 及该时刻；成员从无／无效变有效写生效时刻，role 改动不改，remove 保原时刻，rejoin 写严格更晚值，TenantId 不变。
- readOrganization 交 parent 及其建立时刻；listMembers 每项交成员生效时刻，无效项保上次值；currentTenant 交所选成员的生效时刻。三个面不能省字段或给旧记录猜值，必要时刻无法判定时返回 unavailable。standing 不带时刻，不新增按 TenantId 直接读时刻的面。
- 时刻与资产确认同源且不回退，先后串行提交须严格不等，即使同分辨率内断开重连也更晚。分享使用时在一次可串行化读取内取关系及该时刻，不分事务拼接成“未断开”。实际共同存储及精确资产参与范围由实际提供者／资产拥有者约束。
- 同机runtime代行须先取得该资产使用及相应读取的有效授权，再按被读租户取默认成员名单、逐链读组织，不借分享发起人的资格。被读租户只定位数据，不授予读取权限。共同存储可在一次可串行化事务内直读，不强制服务转调。跨进程服务身份、全序时钟及传播尚未定义，不用Tenant brand补保证。现有Membership／Affiliation不含timestamp；分享NoRevival模型的同源严格递增及原子读取只是成立前提。

模型与有限前提见 [models](verification/models/README.md)，真实存储及组合义务见 [verification](verification/README.md)。账号、存储和时钟仍从其公共定义消费，不吸纳提供者。
