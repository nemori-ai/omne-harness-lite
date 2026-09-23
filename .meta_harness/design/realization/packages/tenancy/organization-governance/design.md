# organization-governance 实现设计

## 实现路径与来源

**自建一个 Cordis 插件。**契约拥有的是组织、成员关系、两类邀约、当前租户身份四组持久事实与 25 个操作的提交语义；DSH 没有对应上层包，没有可 fork 的对象。
可复用的部分是三个纯模块（[identity-values](../../core/identity-values/design.md)、[offer-expiry](../../core/offer-expiry/design.md)）与两个提供者（存储、时间源），都是别的节点。

**一个插件、一条 fiber、四个服务面。**内部三组（隶属、成员、邀约）本版不拆，理由是三处跨「组」的同提交：
[S-20](../../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)／[S-21](../../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) 一次提交同时写组织行与成员记录，
[S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 一次提交同时删两者，
[S-25](../../../../spec/capabilities/organization-governance/v1/contract.md#s-25-接受邀请) 一次提交写成员记录与邀请终结记录——三处跨「组」的同提交在拆成多个 fiber 后都做不到（内核不提供跨 fiber 事务）。
四个服务面是**同一实例的四个入口**，不是四个变化原因。

**Cordis 版本**：手册基线 4.0.2，采用版本尚无决定；依赖机制语义逐条引 basis。

## 能力到 Cordis 的投影

服务名、方法名一律候选。操作落点：`organizations` 承 S-20／S-21／S-22／S-33／S-34／S-35；`memberships` 承 S-26／S-27／S-28／S-29／S-59／S-36／S-37；`offers` 承 S-23／S-24／S-25／S-30／S-31／S-32／S-55／S-56／S-57／S-58／S-60；`organization-purge` 只承 S-53。
契约的九件事本表不复述，只写兑现点与缺口。**每个写操作恰一次 `storage` 提交，事件在提交返回后 `emit`**，下表不再逐行重复。

### 持久记录（存储布局候选）

| 记录 | 列 | 对应条款 |
|---|---|---|
| 组织 | `organizationId`、`kind`、`parent: OrganizationId \| null`、`ownerAccount: AccountId \| null`（**只对 `personal` 非空**）、`createdAt` | [S-5](../../../../spec/capabilities/organization-governance/v1/contract.md#s-5-组织)、[S-7](../../../../spec/capabilities/organization-governance/v1/contract.md#s-7-上级组织属性)「至多一个上级」由 `parent` 单列兑现；`ownerAccount` 唯一约束兑现「每个账号至多一个个人组织」并给 S-53「由 `AccountId` 定位个人组织」一条路 |
| 成员关系 | 复合主键 `(organizationId, accountId)`、`effective: boolean`、`role: TenantRole` | [S-8](../../../../spec/capabilities/organization-governance/v1/contract.md#s-8-成员关系记录)：键就是 `TenantId`；**用两列复合键，不用标量键**（[identity-values G-05](../../core/identity-values/design.md#实施缺口与消费者影响) 未裁） |
| 邀请 | `invitationId`、`issuerOrganization`、`invitedAccount`、`role`、`issuedAt`、`expiresAt`、`settled: SettledState \| null` | [S-10](../../../../spec/capabilities/organization-governance/v1/contract.md#s-10-邀请)；`settled` 列类型受 offer-expiry 的 SC-OE-1 约束，**没有 `expired` 可写** |
| 隶属请求 | `affiliationRequestId`、`initiator`、`recipient`、`direction`、`issuedAt`、`expiresAt`、`settled` | [S-11](../../../../spec/capabilities/organization-governance/v1/contract.md#s-11-隶属请求) |
| 当前租户身份 | 主键 `loginStateId`、`organizationId`、`accountId` | [S-14 ⑤](../../../../spec/capabilities/organization-governance/v1/contract.md#s-14-当前租户身份是登录状态上的一项选择)：独立记录，以 LoginStateId 引用账号契约的登录状态记录 |
| 创建键登记 | 复合主键 `(creatorAccount, creationKey)`、`organizationId`、`registeredAt` | [S-21 ⑦](../../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) |

### 操作

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-20](../../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) | `organizations.createPersonal(accountId)`。`accounts.read` ⇒ `account-not-found` ⇒ `accountDoesNotExist`；`retentionExpired` ⇒ `accountRecordExpired`；`storage-unavailable` ⇒ `unavailable`；再在**一次提交**内查 `ownerAccount = accountId` 的组织：有 ⇒ 返回它（幂等）；无 ⇒ 插入组织行（`ownerAccount` 引用账号行，R-6）+ 成员记录（`effective`，`superAdministrator`）。返回 `OrganizationId` 与 `TenantId` | 尚未实现 | 「至多一个」由 `ownerAccount` 唯一约束兜底（并发插入撞唯一冲突 ⇒ 提交内重读返回既有）。②两条账号判定「与写入同提交边界」怎么在两个插件之间成立，见[跨 owner 的同一提交](#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)，**是本节点最要紧的一处解释** |
| [S-21](../../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织) | `organizations.createTeam(creatorAccountId, creationKey?)`。`accounts.read` ⇒ 不存在／未激活 ⇒ 对应拒绝；一次提交内：带键则先查登记（读不到 ⇒ `unavailable`；命中且未过 `team_creation_key_retention` ⇒ 返回既有；命中但已过期 ⇒ 视作未命中），插入组织行 + 创建者成员记录 + 键登记（三者同提交） | 尚未实现 | 键登记与组织行同提交由 R-1 兑现；过期登记的清理不在本节点（卫生，与 G-13 同类） |
| [S-22](../../../../spec/capabilities/organization-governance/v1/contract.md#s-22-读组织) | `organizations.read(organizationId) → { id, kind, parent }` | 尚未实现 | `organizationDoesNotExist` 只在 S-53 清除之后可达；读不到 ⇒ `unavailable` 不是不存在 |
| [S-23](../../../../spec/capabilities/organization-governance/v1/contract.md#s-23-发出邀请) | `offers.issueInvitation(issuerTenant, targetAccount, role?, ttl?)`。表示层（含 `parseOfferTtl` ⇒ `invalidOfferDuration`）→ 读发起者组织 `kind = personal` ⇒ `issuerIsPersonalOrganization` → `memberships` 判定超管 ⇒ `notAuthorized` → `accounts.read` 目标 ⇒ `accountDoesNotExist`／`accountNotActivated` → 目标已有效成员 ⇒ `alreadyAnEffectiveMember` → 一次提交写邀请（`timingFrom(clock.now(), ttl ?? invitationTtlDefault)`）。提交后 `emit('invitation.issued')` | 尚未实现 | ③结构性禁止排在授权之前——[S-15](../../../../spec/capabilities/organization-governance/v1/contract.md#s-15-结构性禁止不是权限判定)：它与发起者无关，超管在个人组织里也没有这个动作；`invitation.issued` **必发**，只 `emit` 一次 |
| [S-24](../../../../spec/capabilities/organization-governance/v1/contract.md#s-24-撤回邀请)／[S-31](../../../../spec/capabilities/organization-governance/v1/contract.md#s-31-撤回隶属请求) | `offers.withdrawInvitation(issuerTenant, invitationId)`／`withdrawAffiliationRequest`。一次提交内：读邀约 → 不存在或不属发起者组织 ⇒ **同一个** `…DoesNotExist` → 超管判定 → `deriveState`（`now`、组织存在性都在提交内读）：`withdrawn` ⇒ `ok`；`accepted` 或 `expired` ⇒ `alreadyConcluded`，**不写**；`unavailable` ⇒ `unavailable` 不写；`pending` ⇒ 写 `settled = withdrawn` | 尚未实现 | 「已过期不写终结记录」由先 `deriveState` 后写兑现（offer-expiry S-8 反方向）；`alreadyConcluded` 的定义归本契约 S-24，本节点照它的四支映射 |
| [S-25](../../../../spec/capabilities/organization-governance/v1/contract.md#s-25-接受邀请) | `offers.acceptInvitation(accountId, invitationId)`。三段，**不把别的插件的服务面嵌进本节点的存储事务**（存储协议的消费者义务：`accounts.read` 自己就是 AI 的一次提交，嵌套 ⇒ `StorageDefect`）：① 一次 `storage.read` 读邀请（不存在 ⇒ `invitationDoesNotExist`；`invitedAccount ≠ accountId` ⇒ `notTheInvitedAccount`）→ ② `accounts.read` 已激活（未激活／不存在 ⇒ 对应拒绝；已激活不回退，读到即可）→ ③ R-3a 序列化的一次写提交内**现读**邀请（再判①两支）→ `deriveState` 重判（非 `pending` ⇒ `offerNoLongerValid`，`unavailable` ⇒ `unavailable`）→ 提交内读该账号在本组织的成员记录，`effective = true` ⇒ `alreadyAnEffectiveMember` → 成员记录 upsert（`effective = true`，`role = 邀请指定`，**同一主键**：再加入是同一条记录）+ `settled = accepted`。提交后 `emit('membership.changed')` | 尚未实现 | 三种来路同收 `offerNoLongerValid`：经 offer-expiry 的 `acceptable()` 折成布尔再映射，SC-OE-2 守；S-39「回来的是同一个租户」由复合主键 upsert 兑现（不插新行） |
| [S-26](../../../../spec/capabilities/organization-governance/v1/contract.md#s-26-成员资格判定) | `memberships.standing(tenantId) → Parsed<MembershipStandingResult>`。每次现读；读不到 ⇒ `{ failure: 'unavailable' }`；无记录或 `effective = false` ⇒ `ineffective` | 尚未实现 | 返回类型是 identity-values 的 `MembershipStandingResult`，**不抛异常**；本节点内部所有需要成员资格的操作都调这个方法，不另开一条「顺手读一下」的路 |
| [S-27](../../../../spec/capabilities/organization-governance/v1/contract.md#s-27-我的租户) | `memberships.mine(accountId)`：查该账号 `effective = true` 的成员记录，返回 `TenantId[]`；读失败 ⇒ `unavailable`（空数组只在查询成功时返回） | 尚未实现 | 不判账号存在性（契约②） |
| [S-28](../../../../spec/capabilities/organization-governance/v1/contract.md#s-28-调整角色)／[S-29](../../../../spec/capabilities/organization-governance/v1/contract.md#s-29-解除成员) | `memberships.changeRole(initiator, target, role)`／`remove(initiator, target)`。R-3a 序列化的一次提交内：授权（S-29 含「本人」支）→ 目标有效 ⇒ 否则 `membershipNotEffective` → S-29 的③目标组织 `kind = personal` ⇒ `personalOrganizationMemberCannotLeave` → **提交内**数「之后仍有效的超管」≥ 1，否则 `wouldLeaveNoSuperAdministrator` → 写。提交后 `emit('role.changed')`／`emit('membership.changed')` | 尚未实现 | **S-17 序列化落在存储要求 R-3a**（写事务开头锁组织行），见[状态与并发](#状态并发与失败映射)；并发移除对方的收场（先成者成、后成者 `wouldLeaveNoSuperAdministrator`）由此得出，S-48 真并发演练证 |
| [S-30](../../../../spec/capabilities/organization-governance/v1/contract.md#s-30-发出隶属请求) | `offers.issueAffiliationRequest(initiatorTenant, recipientOrg, direction, ttl?)`。表示层 → `recipientOrg` 逐码点等于发起者组织 ⇒ `wouldFormACycle`（**不读存储**）→ 读两组织（任一 `personal` ⇒ `personalOrganizationTakesNoPartInAffiliation`；接收方不存在 ⇒ `organizationDoesNotExist`）→ 超管判定 → 一次提交写请求。**不发事件** | 尚未实现 | 指向自己在这里判，一般环与「己方已有上级」留给 S-32 |
| [S-32](../../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) | `offers.acceptAffiliationRequest(acceptorTenant, requestId)`。R-3b 序列化（部署级）的一次提交内：读请求 → 接收方超管判定 → 两组织变体 → `deriveState` 重判 → 由方向定 `child`／`newParent`；`child.parent ≠ null` ⇒ `alreadyHasAParentOrganization`；判环：`child === newParent ∨ child ∈ ancestorChain(newParent)` ⇒ `wouldFormACycle`——`ancestorChain` 用 identity-values 的纯函数，输入是**提交内**逐行读出的 `parent` 快照，任一行读不到 ⇒ `unavailable`（不判「不成环」）→ 写 `child.parent = newParent` + `settled = accepted` | 尚未实现 | 判环两半逐字对齐契约④；[Alloy 曾给出的自环反例](../../../../spec/capabilities/organization-governance/v1/formal/README.md)由 `child === newParent` 那一半挡 |
| [S-33](../../../../spec/capabilities/organization-governance/v1/contract.md#s-33-解除隶属) | `organizations.dissolveAffiliation(initiatorTenant, childOrg)`。任一方超管 → `child.parent = null` ⇒ `noSuchAffiliation` → 清空。提交后 `emit('affiliation.dissolved')` | 尚未实现 | — |
| [S-34](../../../../spec/capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) | `organizations.ancestorChain(orgId)`／`shareAncestor(a, b)`：一次读事务里沿 `parent` 逐行读到根，任一行读不到 ⇒ `unavailable`（**不返回截断链**）；`shareAncestor` 调 identity-values 的纯函数（含自身），**不从返回的链求交** | 尚未实现 | 两个口径不同（链不含自己、`shareAncestor` 含自己）由两个方法各自调对应纯函数兑现 |
| [S-35](../../../../spec/capabilities/organization-governance/v1/contract.md#s-35-层身份) | `organizations.scopeLayers(tenantId) → { organization: ScopeLayerIdentity, tenant: ScopeLayerIdentity }`，纯计算，失败集合只有 `invalidInput` | 尚未实现 | 不读存储，无 `unavailable`；会话级不返回也不填 `null`（G-1） |
| [S-36](../../../../spec/capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询)／[S-37](../../../../spec/capabilities/organization-governance/v1/contract.md#s-37-切换当前租户身份) | `memberships.currentTenant(loginStateId: LoginStateId)`／`switchCurrentTenant(loginStateId: LoginStateId, tenantId: unknown)`——**登录状态参数是 identity-values 的品牌 `LoginStateId`**，其余参数照旧 `unknown`。三层：① 表示层只判其余参数（S-37 的目标 `TenantId` ⇒ `invalidInput`）；登录状态参数**本节点不再 `parseLoginStateId`**，原样交给下一步；② `logins.verify(loginStateId)`（AI 自己的读事务，**在开本节点的事务之前**调用，不嵌套），四出口按 [S-4 映射](../../../../spec/capabilities/organization-governance/v1/contract.md#s-4-依赖方向与被消费的面)：AccountId ⇒ 往下；`login-state-rejected` ⇒ `loginStateNotValid`；`storage-unavailable` ⇒ `unavailable`；`invalid-input` ⇒ `invalidInput`——只有绕过类型的调用方到得了这一支：AI 对品牌参数在运行期仍先过 `parseLoginStateId`、先于它的任何读（[AI 公开入口](../account-identity/design.md#公开入口导出与类型)末段）；③ S-36：读选择记录，读失败 ⇒ `unavailable`（**不填初值**），无记录 ⇒ 查 `ownerAccount = accountId` 的组织给初值（个人组织读不到 ⇒ `unavailable`）；S-37：`tenantId.account ≠ 校验出的账号` ⇒ `notOwnTenant`，`standing` ⇒ `unavailable`／`ineffective ⇒ membershipNotEffective`，一次提交 upsert 选择记录 | 尚未实现 | **参数收窄是实现层的类型选择，不是契约变化**：OG v1 冻结，S-36／S-37 的输入、⑥ 失败集合与 ⑧ 收场逐字不变。「`LoginStateId` 缺席或不合形状 ⇒ `invalidInput`、在任何判定之前」仍成立，只是那一次 S-31 解析由 AI S-17 在运行期做、本节点按 S-4 第三行映射；S-4「那一支到不了」对类型正确的调用方照旧成立（两侧同用 IV S-31 的前提未变）。**为什么收窄**：[AI v2 S-30 第 10 行右列](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)——接收边界不得以线上收到的 LoginStateId 作「治理契约以 LoginStateId 为输入的操作的那个身份」来认人。参数是 `unknown` 时，入口层可以把线上的串直接交进来，本节点自己解析、再交给 `logins.verify`：AI 的品牌参数被本节点合法满足，入口节点[约束第 8 条](../governance-center-entry/design.md#本节点约束存储要求之外)的两条文本规则都不触发，整条链每步返回成功。收窄之后这条路编译不过：调用方手里的 `LoginStateId` 只能来自 AI S-15／S-44／S-37 的返回，或本节点以它为键的记录（S-30 第 10 行左列）。校验与读选择之间有一个**单次调用内的窗口**（校验通过后撤销、再读选择）：契约以 [S-18](../../../../spec/capabilities/organization-governance/v1/contract.md#s-18-每道准入现读)「每道准入现读」为口径，这次准入的校验是现读的，窗口不构成违反；记在 verification 覆盖缺口 |
| [S-14 ⑤](../../../../spec/capabilities/organization-governance/v1/contract.md#s-14-当前租户身份是登录状态上的一项选择) 残留清扫 | `memberships.sweepStaleSelections(batch)`：逐条对选择记录调 `logins.verify`——记录里的 `loginStateId` 先 `parseLoginStateId` 再交进去（本节点以它为键的记录是 AI v2 S-30 第 10 行许可的来源；**本节点里 `parseLoginStateId` 只剩这一处调用点**；解析不过是缺陷，记 error 日志、跳过该行），`login-state-rejected` ⇒ 删；`storage-unavailable` ⇒ 跳过本轮。**触发与节奏不在本节点**（G-13，owner 装配）；本节点只给方法，不建定时器 | 尚未实现 | 无可观察结果、不进失败集合；S-14 ⑤ 明写卫生工作 |
| [S-53](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) | `organization-purge.purgePersonalOrganization(accountId) → { ok, warrant } \| failure`。先 `accounts.read`（它在账号那边**落盘过期事实**，见[下节](#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)），再 R-3a 序列化的一次提交：`storage-unavailable` ⇒ `unavailable`（不删不签）；`account-not-found` ⇒ 读 `ownerAccount = accountId` 的组织：无 ⇒ `ok` + 签发依据（⑦乙）；有 ⇒ `accountDoesNotExist`（缺陷观测，**必须写可观测日志**，不删不签）；读到账号 ⇒ `activated` ⇒ `accountIsActivated`；`¬retentionExpired` ⇒ `accountNotExpired`；再读组织：无 ⇒ `ok` + 签发（⑦甲）；有且 `kind ≠ personal` ⇒ `organizationIsNotPersonal`（空真守卫，仍写）；否则删组织行 + 删该组织唯一成员记录（同提交），签发 `handoffWarrant.issue(purgeKey, 'purge', accountId)`。提交后 `emit('organization.purged')`，幂等路径不发 | 尚未实现 | 求值次序逐字对齐契约②③；依据**只在 `ok` 路径签发**；服务名单列的理由见[下节](#s-53-单独一个服务名只给清除链) |
| [S-55](../../../../spec/capabilities/organization-governance/v1/contract.md#s-55-读邀请)～[S-60](../../../../spec/capabilities/organization-governance/v1/contract.md#s-60-列出组织收到的隶属请求) 六个读面 | `offers.readInvitation(caller, id)`、`readAffiliationRequest`、`listReceivedInvitations(accountId, includeSettled?)`、`listIssued(tenant, includeSettled?)`、`listReceivedAffiliationRequests(tenant, includeSettled?)`；`memberships.list(tenant, includeIneffective?)`。**同一次读事务**里取全部行 + 一次 `clock.now()` + 各项指向组织的存在性，逐项 `deriveState`；任一输入 `unavailable` ⇒ 整个调用 `unavailable`（**不返回残缺列表**）；默认过滤在求值之后做 | 尚未实现 | S-59 两档授权分开判：`includeIneffective` 为真先判超管；被拒 `notAuthorized` 不降级。S-55 的调用方身份是判别联合 `{ kind: 'account', accountId } \| { kind: 'tenant', tenantId }`，集合外 ⇒ `invalidInput` |
| [S-40](../../../../spec/capabilities/organization-governance/v1/contract.md#s-40-事件都是通知)／[S-41](../../../../spec/capabilities/organization-governance/v1/contract.md#s-41-本版不开控制类事件) | 五个事件 `ctx.emit`，提交后发；**不开任何控制事件、不开扩展点** | 尚未实现 | `emit` 不 await（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md) 的 emit 行，probe null，待核对主张）。将来开扩展点须 `serial`，红线 |
| 政策参数 | config：`invitationTtlDefault`、`affiliationRequestTtlDefault`（offer-expiry `parseOfferTtl` 加载时校验，非正 ⇒ 启动失败）、`teamCreationKeyRetention`（同样为正）、`purgeSigningKey`（私钥，S-53 用；缺或形状不对 ⇒ **启动失败**，与三个持钥节点同一政策） | 尚未实现 | 两类默认值各配各的，不共用；默认值配错启动失败是 offer-expiry S-17 第 4 行；密钥缺失是配置错误不是运行期抖动——把它报成 S-53 `unavailable` 会让清除链无限重扫、主链每次 `interrupted` 且不记缺陷 |

### 跨 owner 的「同一提交」：账号行上的过期事实，加组织行对账号行的引用约束

[S-20 ④](../../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织)、[S-25 ④](../../../../spec/capabilities/organization-governance/v1/contract.md#s-25-接受邀请)、[S-53 ④](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 都要求「账号那一侧的现读与本操作的写入落在同一提交边界内」。
账号记录归 account-identity，读它走 `accounts.read` 服务面；**本节点的存储事务包不住另一个插件的读**——除非存储提供者把事务句柄暴露给服务面并让 account-identity 的读接受它，而那会把存储抽象焊进两个契约的公开面。

「读与写在同一提交」这句话真正要挡住的是两条交错（推导在 [account-identity 的「过期事实」一节](../account-identity/design.md#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)，本节不重复）：**激活 vs 清除**（终态「已激活、没有个人组织」）与**创建个人组织 vs 清除**（终态「个人组织在、账号不在」）。本节点的兑现方式是让这两条交错各撞上一个存储对象：

1. **过期事实落在账号行上**（account-identity 的 `expiredAt` 列）。`accounts.read` 不是一个纯读：读到未激活且已到期就在账号那边的提交里先落盘再返回。S-20／S-25／S-53 读到的「已过期」「已激活」因此是**存储里的事实**，与 account-identity 自己的 S-14 写在同一行、受同一把行锁——两个插件的判定在**账号行**上排成了一个次序。
2. **组织行引用账号行**（R-6）：`organization.ownerAccount` 是指向账号行的引用约束，删除受限。S-20 的插入与 S-38 的删除因此在存储层互斥：先删则插入被拒（S-20 提交内重读 ⇒ `accountDoesNotExist`）；先插则删除被拒（account-identity 报 `storage-unavailable`，清除链按抖动型重扫，S-53 这次读到已落盘的过期事实与那个组织、删掉它，S-38 再成）。**孤儿个人组织不可达**。
3. **S-25 只依赖「已激活」不回退**，读到已激活即可提交，不需要额外机制。

**为什么不用进程内临界区**：锁的实例随插件实例生灭，插件体重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）后旧实例的在途持锁者与新实例互不相知；而 S-14 在另一个插件里，本节点的锁根本管不到它。
**为什么不用跨插件事务句柄**：改两个契约的公开面，且跨进程后整套形状作废；行上的事实与引用约束跨进程后仍是同一种机制（[`ai#S-30` 第 7 行右列](../../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)自己列的做法）。
**它比契约字面弱的地方**：契约写的是「同一提交边界」，本节点给的是「两个提交在同一存储对象上序列化」；S-20 可能为一个刚被落盘过期的账号建出组织（读「未过期」之后、提交之前被 S-53 落盘）——这个瞬态由主链 ③ 的 `account-record-expired` 与清除链重扫各自收掉，没有一条契约允许的可观察结果被改变。前提两条：**同一存储提供者、同一约束域**（装配给）；`accounts.read` 的落盘确实在账号行的锁下（account-identity R-3）。

### S-53 单独一个服务名，只给清除链

[S-42 第 4 行](../../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)把「S-53 只由清除链调用」记为装配给。Cordis 的服务面没有调用方鉴别；能做到的最具体形状是：

- S-53 不放进 `organizations`，单独 `provide('organization-purge')`；
- 仓库里**只有 [account-registration](../account-registration/design.md) 解析它**——一条可静态查的结构检查（verification），**同时覆盖 inject 声明与 `ctx.get('organization-purge')` 一类的动态解析**，只查 inject 声明否定不了它声称覆盖的事；
- `isolate` 不用于此：它隔离实例可见性不隔离调用方（basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md)），且本版只有一个实例。

**这不是权限边界**，跨进程后失效（S-42 右列）；它只让「谁够得着」在源码层可见、可查。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values/v1` 27 条 | 包依赖 identity-values：类型、`ancestorChain`／`shareAncestor` 纯函数、`handoffWarrant.issue` | 随包版本 | — |
| `data.offer-expiry/v1` | 包依赖 offer-expiry：`timingFrom`、`deriveState`、`acceptable`、`parseOfferTtl`、`Clock` 形状 | 随包版本 | — |
| `capability.account-identity/v1` [S-18](../../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号)、[S-17](../../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态) | **必需 inject** `accounts`、`logins`（[account-identity](../account-identity/design.md)）。**不 inject `credentials`** | 提供者换代 ⇒ 本插件重跑——[契约 S-4 自己写明「那个提供者换代本来就会重跑本契约」](../../../../spec/capabilities/organization-governance/v1/contract.md#s-4-依赖方向与被消费的面)；插件体只 provide 与校验 config，可重跑 | 缺席 ⇒ `PENDING`，四个服务面不可见 ⇒ 消费者按各自契约明确失败；已 `ACTIVE` 后运行期读到 `storage-unavailable` ⇒ 各操作 `unavailable`（[S-43](../../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)） |
| 存储（无契约，`storage`） | 必需 inject；要求清单见下 | 换代 ⇒ 重跑 | 缺席 ⇒ `PENDING` |
| 时间源（`clock`） | 必需 inject；`'unavailable'` ⇒ 涉过期判定的操作 `unavailable` | 装配启动 provide | 缺席 ⇒ `PENDING` |
| `purge` 签名私钥 | 插件私有 config | 启动（加载时校验存在与形状） | 缺或形状不对 ⇒ **启动失败**，与三个持钥节点同一政策（见[政策参数行](#能力到-cordis-的投影)与[装卸表](#成对的装载与撤除)）；不做成运行期 `unavailable`——那会让清除链无限重扫、主链每次 `interrupted` 且不记缺陷 |

### 对存储提供者的要求清单

| # | 要求 | 对应条款 |
|---|---|---|
| R-1 | 单次提交原子（多表写同成同败） | 全部写操作 ④；S-42 第 3 行 |
| R-2 | 唯一约束：`organization.ownerAccount`（非空时唯一）、成员关系复合主键、`(creatorAccount, creationKey)`、两类邀约标识、选择记录主键 | S-20「至多一个个人组织」、S-8、S-21 ⑦ |
| R-3a | **同组织成员写序列化**：对同一 `organizationId` 的成员关系写入不交错，后一次看到前一次提交后的状态。机制：写事务开头对组织行取排他锁（`SELECT … FOR UPDATE` 一类），或可串行化隔离下冲突即重试。**由存储兑现，本节点不加进程内锁** | [S-17](../../../../spec/capabilities/organization-governance/v1/contract.md#s-17-同一组织的成员写入序列化)；S-42 第 1 行 |
| R-3b | **隶属写序列化（部署级）**：S-32／S-33 之间不交错——两次并发接受各自读到「不成环」再各自写入会成环，且链跨多个组织，按组织加锁不够。机制：写事务开头对一行哨兵取排他锁，或可串行化隔离。同样由存储兑现 | S-32 ④；S-42 第 2 行（跨节点收场未定，G-7） |
| R-3c | **提交内读写同源**：提交内读到全部已提交写 | 各读面「写入即可被下一次读看到」；S-42 第 5、6 行 |
| R-3d | **只读事务快照一致**：六个列表面「同一次读事务取全部行」读到的是同一个已提交状态，不是逐行不同时刻的混合 | S-55～S-60「不返回残缺列表」 |
| R-4 | 持久 | S-43「全部事实都在存储里」 |
| R-5 | 不可用可识别，不返回空结果或旧快照 | S-16、各读面 ⑧ |
| R-6 | **`organization.ownerAccount` 引用账号行，删除受限**：账号行被引用时不可删（account-identity 那边收到可区分错误，[其 R-7](../account-identity/design.md#对存储提供者的要求清单)）；插入引用一个不存在的账号行时提交失败并可被本节点识别（S-20 提交内重读 ⇒ `accountDoesNotExist`）。**跨节点的存储约束，装配给**：同一存储提供者、同一约束域 | 组合 [S-35](../../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿)；[跨 owner 的同一提交](#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束) |

## 状态、并发与失败映射

**写权**全部在本插件 25 个方法内。**提交点**每写操作一次。

**不加进程内锁**：S-17 的序列化落在 R-3a（写事务开头锁组织行），判环落在 R-3b（锁哨兵行）——两者都是「事务开头取一把存储锁」，多行的读在锁下做，与单行的情形没有区别。进程内锁不加的理由与 account-identity 相同，且多一条：锁的实例随插件实例生灭，插件体重跑后新旧实例互不相知，锁在最需要它的时候恰好不在。锁竞争若成为瓶颈，那是有测量之后的优化，不是本版的正确性机制。

**S-42 九行装配给，本版由谁给**：第 1 行 R-3a；第 2 行 R-3b；第 3 行 R-2；第 4 行 `organization-purge` 单列服务名 + 结构检查（含动态解析）；第 5、6 行 R-3c／R-3d；第 7 行 offer-expiry 节点的 `clock`；第 8、9 行**装配**：入口层先凭出示物过 [AI v2 S-44](../../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)（`logins.exchange`）得 `{ LoginStateId, AccountId }`，再以这个 `LoginStateId` 调本节点 S-36 得当前租户身份，带着这些身份值调其余面——本节点不核实身份值真伪，**它的面不得直接暴露为终端 API**（入口节点的[约束第 8 条](../governance-center-entry/design.md#本节点约束存储要求之外)与装配）。S-36／S-37 免于第 8 行的理由是「自己就带一道 S-17 校验」，在 AI v2 下只在进程内成立（[AI v2 S-30 第 10 行右列](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)）；本节点为此把这两条的登录状态参数收窄为品牌，线上的串交不进来（[S-36／S-37 行](#操作)）。

**失败映射**：`storage` 不可用 ⇒ `unavailable`；`accounts`／`logins` 返回 `storage-unavailable` ⇒ `unavailable`；`clock` 不可用 ⇒ 涉过期判定的操作 `unavailable`；identity-values／offer-expiry 解析失败 ⇒ `invalidInput`／`invalidOfferDuration`；S-53 的 `accountDoesNotExist` **必须**落一条可观测记录（结构化日志，级别 error）——契约要求它可被观测且不折进 `unavailable`。没有 catch-all。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（两个 ttl 默认值、键保留期为正；`purge` 私钥存在且形状对） | 插件体开头，失败即抛（fiber 不进 `ACTIVE`，**待核对主张**） | 无部分状态 | — |
| 四个 `ctx.provide`：`organizations`、`memberships`、`offers`、`organization-purge` | 本 fiber；`ACTIVE` 后可解析 | 任一 provide 失败 ⇒ 抛出，已 provide 的随 fiber 撤（`ctx.provide` 的纳管**待核对主张**，同 account-identity） | 撤除：服务消失，消费者重跑或 `PENDING`；**在途调用跑完**——内核不取消在途调用，每个调用的收场由它那一次 `storage` 提交决定，本节点无锁、无排空、无补偿；**保留**：全部记录（[S-43](../../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)：没有只活在运行实例内的事实） |
| 无定时器：残留清扫的定时器归装配（G-13），过期登记的清理同 | — | — | — |

## 实施缺口与消费者影响

- **「同一提交」的跨 owner 解释**改为账号行上的过期事实 + R-6 引用约束（首稿的「临界区 + 单调事实」被 architecture-reviewer 以两条交错否定，见 [verification](verification.md#覆盖缺口)）；证据是 account-identity S-43 第 2 支含两条交错的真并发演练，未开始。
- **R-6 是跨节点的存储约束**：两个节点的表在同一约束域，装配给；装配节点尚未建立。
- **S-36／S-37 的登录状态参数收窄为品牌**（[S-36／S-37 行](#操作)）：骨架的 `currentTenant`／`switchCurrentTenant` 仍是 `unknown`，第二程改；收窄后 `invalidInput` 那一支靠 account-identity「品牌参数在运行期仍先过 `parseLoginStateId`」，那边去掉这道运行期解析须先告知本节点。
- **R-3b 部署级隶属写序列化**是对存储的强要求；本版单机由哨兵行锁兑现，跨进程归 G-7。
- **G-13 残留清扫**：本节点只给方法，触发归装配；装配节点尚未为本批建立。
- **G-05 标量键**：成员关系用复合键绕开；需要按 `TenantId` 建索引的消费者（计量 G-3）落包前要 G-04／G-05 裁定。
- **待核对主张**：`ctx.provide` 纳管、插件体抛出后的 fiber 状态、`emit` 不 await——三条同 account-identity。
- **Alloy 模型未登记为 formal task**（退出码归 tooling），S-7／S-12／S-32 的结构证据只能在 verification 里引 evidence run，不能进 bindings。
