# Tenant 提供者设计

状态：`f98ac926` 映射已接受为最小运行基线施工输入；本目录现已建立 workspace
成员及默认公开入口，但只实现下文归属的六种共同值声明。Tenant host、插件、身份适配、
当前资格检查及其它运行行为仍未实现。
来源、检查与采用边界见[原施工入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)。

## 契约与公开面

采用 [TG v1](../../../spec/capabilities/tenant-governance/v1/contract.md) 的
TG-01/02/04/05、[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md) 与
[work-data v1](../../../spec/data/core-work/v1/contract.md)。TG-03 后置。
状态、事件、操作结果及管理/资格端口见下文；
[原治理输入](../../../docs/proposals/core-capabilities/implementation/governance-interfaces.md)保留 `058c77c` 的接受来源。

候选默认公开入口 `@omne-harness-lite/tenant` 拥有 `createTenantHost`、
`TenantPlugin`、`IdentitySource`/`AuthenticatedInvocation` 消费协议及
`registerReferenceSource` 管理面。精确签名在所属公开源码建立后以其为准；当前目标源码
只导出 VersionSet、Instant/Validity、MembershipBasis、EvidenceRef、Conditions，
尚无上述 host、插件、身份协议或管理面的可调用实现。跨包数据直接用
work-data/records 的公共类型。

TenantHost 是本域 TG 状态权威，按 tenant 分区维护原 logical/durable 根及当前
引用来源，不输出可变根。应用只创建一次并保有恢复/关闭面；对同一 coordinator
重复创建拒绝 `authority_already_bound`。这个同一部署/同一产物的防错不代替
真实 writer 排他。第二 Context 只能挂原 host，不能重新发号或建个人租户索引。

身份协议归本包声明，由[应用身份适配](../../../apps/local-harness/design.md#身份与宿主装配)
发行实际调用依据。私有 invocation 在每次 GateFrame 重认 principal、credential
修订和当前可用性；DTO、readonly、tenant 字段与 Context 不证明认证。TG 才
解释当前成员、joinedRevision、引导与列名管理权；租户管理权不隐含 Session 正文权。

## 插件、当前检查与引用来源

`TenantPlugin` 提供 `omneTenant`，required inject 为 `omneAdmission`、
`omneDiagnostics`、`omneIdentity`。options 只接受受信装配的原 TenantHost；
apply 不创建权威。恢复相同已验证 Watermark 的 TG decoder/fold/操作记录完成，
且身份来源就绪后，才 `ctx.provide` 受限管理/资格面。缺 SR/TL 引用来源只关闭
需要完整清单的操作，不等待所有未来能力才发布整个服务。

在受信 `apply(c)` 捕获 `c.fiber` 和 host 发出的本次 mount generation；
`ctx.plugin()` 返回的 PromiseLike 外壳只用于 await/dispose，不能凭
`symbols.original` 或 uid 猜测它与 status 参数的身份。宿主生命周期观察分派
到本 host 的关闭入口；最终 check 同门核原挂载/来源 stamp、捕获 Fiber 及所有
必需 provider 当前代次/存活性，不只查仍 ACTIVE 的消费者。每次 apply 创建新
mount generation，同 Fiber 重载不恢复旧闭包。UNLOADING 后 effect 尚未开始
的窗口也拒绝旧候选；存活检查之后仍须
真实认证、成员、定义/权益/选用及本次操作资格，绝非 Fiber ACTIVE 即许可。

`registerReferenceSource` 只交受信 link，输入为已开放 source kind/适用范围、
精确来源代次和治理稿的 `prepareReferences/checkReferences`。SR 的提供实现
由 [Session](../../session/session/design.md) 拥有；TL 由其真实 owner 兑现。
来源与 TG 必须使用同一 coordinator：门外准备双方，门内登记两端精确关系及
stamp，门外通知。link 在 LOADING 时只登记 held，正常 check 等本代双方和
link 可用；任何部分失败只撤自己已登记的关系。

来源不明/恢复未完/撤除时返回 `unavailable/complete=false`，不当空集合。
只有已封闭该范围所有引用创建、并证明来源不适用时才列为不适用。SR/TL 增引用
与 TG discard/retire/disable/remove 同门检查原 stamp；TG 不反向 import 或
required inject SR/TL，也不从查询 projection 推断无引用。

## 装载效应与撤除责任

| 建立的效应及可见时点 | 拥有者、撤除与完成判据 |
|---|---|
| 恢复后的 `omneTenant` 挂载、普通监听/订阅 | 当前插件拥有本次注册；撤代先关本代新调用，再由 effect 撤精确注册。其他 Context 挂载与长期 TG 根保留 |
| source 登记/held 准备 | 原 link 及 TG host 持有精确 registrationId/generation；retire/inspect/waitReleased 认回原关系，旧 disposer 不能撤新 source。来源失联不删除业务引用 |
| owner_change 候选、原操作结果与审计 | TG host 保有；逻辑撤权立即约束新准入，正向权利等耐久。操作 Fiber 卸载不撤销已提交事实，也不移除 pending/unknown 责任 |

关闭等待可取消，原关闭继续；清理失败以原残留/诊断保有。facade 重挂只向同一
host 开放已就绪范围，旧 mount 能力不复活。替换 host 本体须关闭新工作、排空
pending publication、冻结完整 durable 水位并确认原资源释放后恢复切换；原 host
未释放拒绝第二权威。P1 失联关闭新提交，不能把未耐久控制/未知结果报为成功。

## 实施与验证范围

实际验证覆盖管理、双视图和恢复，并连接真实 P1、
身份/SR/TL link。allow 基线需要 A01–03/A11 的当前资格与 S01/S15–17 相关
切片：真实双凭据隔离、成员重加不恢复旧权、create 重试认回原 ID、准备后撤权、
SR 引用与 TG 撤选交错、来源突然失联。仅测内部 Map 次数不能通过。
当前这些产品测试未运行；[三项 Cordis 机制证据](../../../docs/proposals/core-capabilities/implementation/evidence/runtime-provider-design/README.md)
只支持内核时序，不证明本 host 已实现。

## 实施协议的采用来源

下列状态、记录、端口和算法从已接受的 `058c77c` 治理输入迁入，
迁移源快照为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c`。
原稿只保留受审/接受和取舍历史；本页拥有所列当前提供者设计，语言无关承诺
仍归所采用的精确 spec。接口记法不等于已经存在或发布的产品 API。

## TG：租户、成员、定义与选用

### 状态、stream 与事件

候选包为 `packages/governance/tenant/`，默认入口 `@omne-harness-lite/tenant`，
记录 owner 固定 `tenant`、namespace 为部署的核心 namespace。所有下面的事件
version 均为字符串 `"1"`；它是实施记录版本，与正式 TG v1 的版本独立。
Counter 不转 Number；一个 batch 触及 stream 的 revision 只加一。

| stream / 状态 | 最小数据 shape |
|---|---|
| system `tenant-personal-index` | `{userId -> tenantId}` 的纯 fold 索引；只来自 personal 的创建记录，身份不复用。部署引导记录另在 system `tenant-bootstrap` |
| tenant `tenant:<tenantId>` | `Tenant={tenantId, kind:personal|organization, creator:Principal, status:active, members:Member[]}`；`Member={member:MembershipRef, role:owner|super_admin|member, state:active|suspended|removed, revision:Counter, joinedRevision:Counter, delegatedOperations:string[]}` |
| tenant `definition:<definitionId>` | `Definition={definition:DefinitionRef, kind:skill|slash_command|plugin|agent, creator:Principal, source:official|customized, origin:DefinitionVersion|null, state:active|retired, draft:Draft|null, versions:Published[]}`；`Draft={draftRevision:Counter, content:JsonValue}`；`Published={version:OpaqueId, digest:string, content:JsonValue}` |
| beneficiary tenant `entitlement:<entitlementId>` | `Entitlement={entitlementId, beneficiaryTenantId, issuer:Principal, issuerBasis:EvidenceRef[], versions:VersionSet, rights:(use|derive|redistribute)[], conditions:Conditions, state:active|suspended|revoked, revision:Counter}`；来源权威拥有变更，受益租户的管理者不能自改 |
| consumer tenant `acquisition:<acquisitionId>` | `Acquisition={acquisitionId, tenantId, selected:DefinitionVersion, configuration:JsonObject, state:enabled|disabled|removed, revision:Counter}`；配置只允许该定义公布的开放字段 |

定义版本 ID 由 TG 分配、不复用；不利用版本名字大小推断先后。发布列表另外
保留提交顺序；content 经该定义种类的受信格式 validator 校验，引用的代码部署
仍归运行 owner，不把保存 Plugin 定义变成执行任意代码的入口。定义默认设置
由 AU 分离保存，不能用 configure/editDraft 改官方发布原件。

| kind（全部 /1） | data 与纯转移 |
|---|---|
| `tenant.bootstrap_established` | `{bootstrapId, deploymentId, seedPrincipal, initialRights: string[]}`；仅受信引导身份，重复认回原操作 |
| `tenant.personal_claimed` | `{user:UserRef, tenantId}`；system index 缺席才能加入，和下行同 batch |
| `tenant.created` | `{tenant:Tenant}`；必须恰一有效 personal owner 或至少一有效 organization super_admin；创建者与成员不是同义字段 |
| `tenant.member_changed` | `{member:Member, previousRevision:Counter, reason:string}`；完整新成员快照和旧修订，纯 fold 核对 joinedRevision/角色/状态合法性；新成员 previousRevision=0 |
| `tenant.draft_created` / `tenant.draft_edited` | `{definition:DefinitionRef, metadata:{kind,creator,source,origin}, draft:Draft, previousDraftRevision:Counter}` / `{definition, draft, previousDraftRevision}`；新定义前者 previousDraftRevision=0 |
| `tenant.definition_published` | `{published:DefinitionVersion, draftRevision:Counter, digest:string, content:JsonValue}`；消耗精确草稿，保留版本和摘要，重试不产生另一个 version |
| `tenant.draft_discarded` | `{definition:DefinitionRef, draftRevision:Counter, referenceCheck:ReferenceReport}`；只丢弃该草稿，公开版本保留 |
| `tenant.definition_retired` | `{definition:DefinitionRef, referenceCheck:ReferenceReport, reason:string}`；不再新选用，保留原件、历史和已经准入的工作 |
| `tenant.entitlement_changed` | `{entitlement:Entitlement, previousRevision:Counter, sourceOperation:OperationRef}`；新增/暂停/恢复/撤销都核对原签发权和源事实；撤销身份不可重新激活，新增授权使用新 entitlementId |
| `tenant.acquisition_changed` | `{acquisition:Acquisition, previousRevision:Counter, referenceCheck:ReferenceReport, effectiveBoundary:"next_admission"}`；移除身份不复活，重新选用新 acquisitionId |
| `tenant.operation_denied` | 沿共同拒绝 shape；写本租户的独立审计 stream，system 操作只在明确列名的 system 审计 stream |

`ReferenceReport={sources: {owner:string, revision:OpaqueId}[], references:
{owner:string, target:ResourceRef, relation:string, blocksDiscard:boolean}[], complete:boolean}`。
它由下文真实引用 owner 提供，正文不混入报告。complete=false 时不把未知当空；
影响查询或受引用约束的操作 unavailable。retire/disable/remove 记录实际影响和
next_admission，引用不默认阻止停用；草稿有 blocksDiscard 则拒绝丢弃。

### 管理与消费端口

每项变更使用[共同操作外壳](#数据边界与共同操作协议)；expected 是相关 stream/draft/object 的精确
修订，操作结果包含变更对象身份、实际 revision、affectedReferences 和生效边界。

| 端口 | 输入 → owner 结果 / 当前检查 |
|---|---|
| `bootstrap`（只供部署） | 部署持有的私有引导能力、deploymentId、seedPrincipal → established / already_established；没有公开 HTTP/IPC 方法接纳任意 seedPrincipal |
| `createTenant` | 原请求的 kind、初始成员（personal 固定当前自然人，organization 显式至少一个 super_admin）及显式前置 → created(TG 分配的 tenantId,membership revisions)；分配结果不进入原操作输入 |
| `addMember/changeMember/removeMember` | tenant、目标 UserRef、角色/状态/显式 delegatedOperations、expected → changed；change 可携带同组织多成员变更，以一个 batch 转移最高资格 |
| `createDraft/editDraft/publish/discardDraft/retireDefinition/readVersions` | DefinitionRef/种类/内容/精确 draftRevision → created/edited/published/discarded/retired 或带水位版本列表；published 返回 TG 实际分配 DefinitionVersion |
| `forkDefinition` | 源 DefinitionVersion、新 ownerTenant、内容 → 新 DefinitionRef/origin；源 derive 权、目标创建权同时成立，不复制 grants |
| `issueEntitlement/changeEntitlement` | beneficiary、精确 VersionSet、rights/conditions/state、源签发依据 → issued/changed；只开放本域有权签发者，不以本地缓存代远端权益权威 |
| `selectVersion/configure/disable/remove` | acquisition 或新选用、DefinitionVersion、开放配置、expected → selected/configured/disabled/removed、ReferenceReport；enabled 只证明选用可用，不声称真实装载 |
| `readTenant/readMembership/readDefinition/readEntitlement/readAcquisition` | 当前调用者及精确目标 → 获准字段/水位；管理元数据与定义正文/Session 正文分别检查 |
| `prepareAccess` / `checkAccess(frame,candidate)`（受信） | `{invocation, tenantId, operation:string, target:JsonValue, definition?:DefinitionVersion, rights?:(use|derive|redistribute)[]}` → TG 私有候选 / ready(basis) 或 denied/unavailable/prepare_again；只判 TG 所有资格，不判 Session 正文 ACL、工具对象权限或预算 |

createTenant 的 personal/organization 两种创建都用 system-scoped 管理 operation：
`tenantId=null`，`operationKind="tenant.create"`，`target={kind:"tenant_creation",
tenantKind:personal|organization, creator:Principal}`。Principal 来自当前认证边界，
arguments 只含原请求的初始成员等创建参数，preconditions 只含原请求显式前置；
不含 TG 分配的 tenantId、当前索引修订、生成时间或动态权限结果。相同原请求
在首次 lookupPrepared 前可跨进程重建相同 canonicalInput，无需知道旧 tenantId。

只有 lookupPrepared=not_seen 才分配拟创建 tenantId、准备 tenant stream 与
成员状态；分配身份进入 tenant.created（personal 还进入 tenant.personal_claimed）
和确定 result，不补写回 OperationInput.target。submit 再查去重：并发同键准备
即使各有不同拟分配 ID，也只能认回首次接纳的原票据/结果，其它 ID 未成为业务
对象。完整无回执批次恢复后从原 operation 的持久 result 返回原 tenantId；
unknown 时不重分配重试，只有 P1 已核实未提交才可按同一原输入重新准备。
此规则同样适用于本稿其它由 owner 分配新身份的创建/发布操作。

personal 在该 batch 同时追加 system personal index 与 tenant.created；实际新
tenantId 在 appends/result 精确列名，只有可信 TG 创建组合获跨这两个 scope 的
写权，不能让普通工具绕过“只写本租户 stream”。组织
成员变更在一个 tenant stream 条件提交，两个管理员同时删除不会都成功，重试
一个已保存冲突也不会在新状态突然成功。

TG 的首批管理操作集合明确分为 tenant.members、definition.create/edit/publish/
retire/configure、entitlement.issue/manage、acquisition.manage、budget.manage；
personal owner/organization super_admin 在本租户拥有适用管理集合，普通 member
只获明确 delegatedOperations。`session.read_content`、`request.answer`、
`call.control`、资源动作的可授予集合均不在这些管理操作的隐含闭包内。
紧急控制资格独立显式登记，经 Session/TL 控制门消费。

首次可信初始化来自部署能力；创建个人租户只需已认证自然人且唯一性检查通过，
创建组织需 seed 权限或显式 `tenant.create_organization` 资格。引导权只能建立
已列名的初始主体/治理权，不默认赋予所有 Session 正文或所有工具权限。官方
source 只允许独立受信种入能力；公开 create/edit 不接受把 customized 改 official。

本租户所有权直接支持适用的 use/derive/redistribute，不创建假外部 entitlement。
对外签发需源租户当前所有者或实际可再分发依据，动作写入 beneficiary tenant 的
权益 stream；OperationInput.tenantId 是受益 tenant，target/evidence 明确源租户
和精确资产。这是 TG 列名的跨租户共享操作，只授该权益，不给通用跨租户读写。
签发者无需冒充受益成员；其源成员/再分发资格由 TG 当前根验证。

成员移除、暂停、降权在 logical 立即关闭相关许可。grant/entitlement 记录的
joinedRevision 与当前不符即失效，重新加入不会恢复旧依据；普通成员修订继续
核对当前权限交集，不靠 observedRevision 相同或身份相同保持过期资格。
到期在每次 gate 使用同一受信时间样本核对；异步准备中的未到期不授权稍后提交。

## 共同值与协议的维护归属

本轮维护在独立只读复核后明确实现声明的归属：本包公共类型面拥有 VersionSet、
Instant/Validity、MembershipBasis、EvidenceRef、Conditions；PermissionScope 归
[authorization](../authorization/design.md#permissionscope)。这项逐类型分配由本轮明确，
不倒写为 `058c77c` 原稿已逐项指定。已有业务含义与范围保持原接受依据。

表示校验不等于当前资格；EvidenceRef 的 authority/kind 与认回责任属于真实
事实 owner，版本匹配、受信时间及成员/资源资格仍由各真实 owner 核对。本页
不引入 tenant→AU/BG 反向导入、隐式 host 创建或通用条件求值服务；未来公共声明
编译、依赖闭包与运行校验仍须产品验证。

三治理 owner 共用下列消费协议说明，其语义依据是 CC/DR 和原 `058c77c` 治理
输入。文档集中不使 TG 成为公共提交协调者，不新增调用入口、状态或服务；
AU/BG 各自实现 prepare/check/publication、拒绝审计和双视图。实际 records/
admission 签名归其[公开记录面](../../storage/records/src/index.ts)及
[准入设计](../../coordination/admission/design.md)，不在此另建复合结果工厂。

## 数据边界与共同操作协议

### 精确复用和局部值

以下形状是语言无关的数据与端口记法，`?` 表示缺席，`A | B` 表示带判别值的
联合，`T[]` 表示有序不可变数组。它们不是可直接编译的 TS 模块；本稿不宣称
已做消费者编译验证。实现分别导出所属包的类型，不建 governance-sdk 或全局状态包。

| 本稿概念 | 唯一表示与校验 |
|---|---|
| 自然人、成员、定义/版本、Session/Run/Step/Work | 直接引用 DataTypes 的 UserRef、MembershipRef、DefinitionRef、DefinitionVersion、SessionRef、RunRef、StepRef、WorkRef、WorkOwner；不再定义同义身份 |
| 工具动作、调用、声明、命令 | 直接引用 Action、CallRef、Binding、AuthorizationDeclaration、Command、ToolDefinition；先 parseData，再由拥有者检查词汇、归属和当前事实 |
| 决定、资源、秘密、金额 | 直接引用 Decision、RequestRef、ResourceRef、SecretRef、Money；数据合法不等于决定可消费、资源可用或零费用 |
| 操作、记录、因果与水位 | OperationRef 来自 work-data；Principal、Causality、Counter、OwnedRecord、StreamAppend、Position、Watermark、Receipt 等来自 records，GateFrame/OwnerPublication 等来自 admission |
| 版本集合 `VersionSet` | `{definition: DefinitionRef, versions: OpaqueId[]}`；非空、无重复、逐字段精确匹配已发布版本。不使用 semver 范围、latest 或 wildcard；扩集合需显式修改。这是 v1 允许范围的首批有限实现 |
| 时间 `Instant` / `Validity` | 规范 UTC 时间字符串 / `{notBefore: Instant, expiresAt: Instant | null}`；null 明确无到期日。由受信时钟判定区间 `[notBefore, expiresAt)`，时钟不可核实则 unavailable |
| 成员依据 `MembershipBasis` | `{member: MembershipRef, joinedRevision: Counter, observedRevision: Counter}`；TG 分配 joinedRevision，首次加入及 removed 后重加改变，普通更新不改变；observedRevision 记录当时事实，不能替代当前查询 |
| 依据 `EvidenceRef` | `{authority: string, kind: string, id: OpaqueId, revision: OpaqueId}`；只用于解释/记录，不能作为 bearer token。数据接收者按注入的真实权威认回依据 |
| 权限范围 `PermissionScope` | 由 [Authorization 当前设计](../authorization/design.md#permissionscope)拥有表示与校验；此处只导航，不形成 TG 对 AU 的运行依赖 |
| 条件 `Conditions` | `{validity: Validity, membership: MembershipBasis[], requiredFacts: EvidenceRef[]}`；无脚本、表达式字符串或任意插件 JSON。额外条件必须有明确版本化 owner，未支持则 unavailable |

同 tenant 关系逐字段核对所有嵌套 WorkOwner、Session、Run、环境、资源和秘密；
定义 ownerTenantId 只有在 TG 的精确外部权益通过时可不同。grant/预算/操作的
tenant 不能从“当前组织”菜单重写。任何权限集合、影响参数及版本集合在摘要前
无损校验、规范排序或保序，并深冻结；各字段的集合语义由其 owner 固定，Action
始终逐结构值比较，不能随意重排后声称还是同一批准。

### 谁可以调用，以及什么仍只是数据

用户 API 接收 `{operationId, targetTenant, target, expected..., arguments}`，可信
Principal 从真实本机凭据解析。应用不接收 `trusted:true`、任意 userId 代理或
可自行填写的系统主体。内部 `AuthenticatedInvocation` 是认证 owner 发行并在
私有实例表核验的活句柄：`inspectCurrent(frame)` 同步返回 Principal、凭据修订、
可用性；凭据撤销/身份源失联在同一 coordinator 短门封闭后续位置。不可复制、
反序列化或仅凭 TS 品牌取得它，创建者不能把旧句柄重新登记成新凭据。

这是本机认证适配的**候选依赖协议**，实现归应用装配的具名身份边界；TG/AU
不实现 IPC 或存凭据。P2 测试适配必须真实区分两份独立凭据、撤销和当前修订，
只能证明该端口契约；P3 的实际 IPC 验收才证明应用认证。缺少真实适配时对外
入口保持 unavailable。OS 管理员与部署引导属于受信边界，不用 Cordis scope
或 readonly 声称对恶意宿主代码隔离。

本批 Agent 以可信委托执行：Session/运行 owner 绑定原 Principal、tenant、
WorkOwner、执行 epoch、可用操作范围和 TG MembershipBasis；AU 必须通过原 owner
认回当前委托，不能把 AgentRef 当自然人凭据。归因的 initiator 与实际 Principal
分别保存；新运行实例不能继承旧 epoch 的提交权。

### 三种操作表面与结果

每个包分开导出管理/读取表面和受信组合表面。管理表面自己 prepare、submit 与
映射结果；消费者不能以“先改内存再调用 save”写业务状态。组合表面只给受信
Session/tools/model/HD 等具名组合者，不暴露给工具 body、resolver 或用户。

| 表面 | 共同约束 |
|---|---|
| 读取 | 当前认证/tenant/目标读权通过后，短门捕获一致快照；返回 `{value, watermark, availability}`。history/财务/正文各自裁剪。无权及不存在对无权者统一 `inaccessible`，列表/计数先过滤；旧 operation 结果也重新检查读权 |
| 单 owner 变更 | `{operation, invocation, expectedRevision, ...}` → AdmissionResult，committed 的 `receipt.outcome.result` 是本 owner 定义的结果。内部使用 `composition=owner_change` |
| 参与已声明组合 | 门外 `prepare...` 生成该 owner 私有候选，内含冻结 appends、publication 与依据 stamp；短门 `check...(frame,candidate)` 只返回 ready / prepare_again / 具名失败。组合者聚合全部片段后只 submit 一次 |

`prepare_again` 仅表示门外准备读到的内部依据过期，尚未占 operation，不是持久
业务结果。退出门后重准备；部署的有界准备重试耗尽返回 unavailable，可继续用
原 operation 查询。用户显式 expectedRevision 过期则通过 records 保存其确定
revision conflict，不在后台悄悄换修订。业务不变量失败由对应 owner 准备拒绝
审计并提交确定结果，不能把拒绝伪装成 records 的结构 rejected。

业务结果采用各 owner 的封闭联合，例如 `{owner:"tenant", outcome:"created", ...}`、
`{owner:"authorization", outcome:"denied", code, evidence}`。存储 committed 表示
该结果已耐久，业务 denied 不变成业务成功。pending_durability 沿原票据等待；
committed/publication=blocked 保留提交事实、关闭相关入口；unknown 保留原操作
与责任，只查询/认回。prepare 非法、服务不可用且未接纳不占操作键，不能因此
推导外部效果未发生。完整映射沿 shared-interfaces，不新增第二套提交回执。

三个 owner 的关键拒绝使用各自 `*.operation_denied/1` 普通审计记录，其数据为
`{operationKind, target: JsonValue, code, evidence: EvidenceRef[], observed: Watermark}`。
目标/原因按披露权裁剪；原 envelope 保存认证主体和因果。拒绝审计写失败返回
`audit_unavailable`，若存储已占位但结果未知同时保留原 operation/diagnosticId，
不能转成“可重新执行”。认证前无可信用户的失败由本机入口用明确 system 主体
记录未认证事件，不伪造用户；用户响应仍不泄漏存在性。

### 单批提交与双视图

一个 owner 私有候选的不可变片段具有明确的 records appends、OwnerPublication、
所有读取依据的精确 stamp；每个包自己验证候选归属和活动 GateFrame。publication
只安装预计算根/水位，严格返回 undefined。业务 owner 仅持 coordinator 及其
RecordPreparation 面；仅受信恢复装配暂持 RecordReader，按完整 envelope 向
各 owner 的纯 decoder/reducer 交付。没有业务 owner 取得完整 writer。

1. 先规范化原用户输入为 PreparedOperation，在短门 lookupPrepared 认回旧结果；
   只有 not_seen 才开始新的定义读取、resolver、依据准备、预算计算。
2. 门外各 owner 校验并计算候选根/事件。具名组合者合并同一 stream 的本 owner
   记录，保留一份 expectedRevision；不同 owner 不改写彼此记录。
   组合者调用 coordinator.prepare 编码整个 batch，owner 的 publication 集合必须
   与实际记录 owner 恰好一一对应。只读依据 owner 不必制造假的写记录。
3. 同一短门依次重查认证/TG硬资格、用户前置/对象根、Session/定义/绑定/epoch、
   AU 当前判定/HD一次消费、BG全部预算/精确使用。任何 stamp 不符退出重准备；
   不在门内解析声明、await、读磁盘、通知或运行插件。
4. 真正资源 owner 取得已准备的 pin，发行各自 ExactUse；组合者提交一个
   PreparedAdmission。TG/AU/BG 的普通状态读取不是资源，不虚构 ExactUse。
   需保留的 resolver/绑定资源由其真实运行 owner 发行，requiredUses 归实际
   使用记录 owner 声明；动作批准与预算占用是业务记录，不能藏在 release 回调。
5. 新 apply 位置的所有 publication 在门内更新 logical；耐久前缀推进后更新
   durable。只有 coordinator completion committed 且 publication=ready 才通知
   或交付下一效果。重复、冲突、unknown 的 pin 责任完全沿 P0 单次交接协议。

每个 owner 保存自身 logical 根、durable 根和按位置排列的待确认根，不保存其它
能力状态。成员/权益/grant/设置等当前允许集合是 durable 正向依据与所有尚未
耐久变更允许集合的交集。不能只比较最终 logical 与 durable：撤销后重授尚未
耐久时，中间撤销仍封闭后续准入。有效性还要检查源可用性、当前时间与硬约束。

BG 对预算使用同一原则：所有尚未耐久收紧仍生效，放宽/新周期余额只在耐久后
可用；余额的 logical 预留立即占用。普通 grant/权益撤销或预算下调不取消已位于
n 的动作；n+1 后的新准入受阻，n 只有在其耐久且执行许可未被精确控制撤销时
继续。持久结果的历史读取不重新判定并改写原业务结果。

恢复先由 P1 持锁核实完整前缀，再按 owner 校验 kind/version/shape/转移和因果；
重建到相同水位后才重新开放。unknown kind、坏业务形状、非法成员/账目转移不能
静默跳过。缓存不提供授权；旧票据/GrantRef/Receipt/Action 不反序列化成运行许可。
组件失联在短门关闭当前可用性，计划卸载先关新门、处理在途发布责任并保留
事实，重新装载认回原账目而不重放效果。业务拒绝与恢复损坏分别报告。


## 身份与引用来源的消费协议

本包声明身份消费协议，应用拥有实际 `createLocalIdentityHost` / `IdentityPlugin`
与发行资源。事实仍由其真实 owner 产生，未知不能当空或默认许可。

| 消费者需要的注入 | 最小内容与真实 owner | 必须共同验证的门 |
|---|---|---|
| TG/AU/BG 的主体事实 | 前述 AuthenticatedInvocation；本机凭据映射/撤销由身份适配持有，TG 解释成员，SR/AR 解释工作委托 | 伪造 DTO/句柄失败；两主体凭据真实区分；准备后撤凭据先封闭后续 gate；本机 IPC 在 P3 通过前不开放给用户 |
| TG 引用清单 | 相关已开放 SR/TL owner 提供 `prepareReferences(definition/acquisition/draft)` 与同门 `checkReferences`，带 owner revision 与 ReferenceReport 条目 | 新引用与 discard/retire/disable 使用同门 stamp；未知来源不可当空。部署明确未安装且已封闭引用创建的能力可报告不适用，已开放能力不能省略 |
