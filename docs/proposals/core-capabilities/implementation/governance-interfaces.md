# P2 租户、授权与预算施工接口候选

本稿状态为 **proposed，待独立架构评审与主调度接受**。它是 P2 三个治理 owner 的
一份施工输入，不是正式规格、产品 API 已发布声明或 P2 完成记录。只开放本批
TG-01/02/04/05、AU-01–06、BG-01–04；租户关闭清算、外部订阅/额度/账单、专属
账号/设备同意、暂行批准和分布式实施均不在本稿施工范围。

## 输入与采用状态

| 输入 | 固定身份与用途 |
|---|---|
| [README](README.md)、[scope](scope.md)、[acceptance](acceptance.md)、[implementation-spec](implementation-spec.md)、[plan](plan.md)、[delivery](delivery.md) | `4253ee0b194ee8c7ccdc16b049db54748e9a0095`；完整 M1/M2 与 A01–A32 不缩减，优先最小 Agent/Session/工具闭环 |
| [共享接口](shared-interfaces.md) | 接受版本 `8f4cfa9`；RecordPreparation、AdmissionCoordinator、双视图、单次 ExactUse 与 core-journal/1 均沿用，不重做 P0 |
| `@omne-harness-lite/work-data` | 已接受产品 `eef1ba1`，交付 `73ac35e`，HUB 锁 `728d665`；本文引用真实默认公开入口的 DataTypes |
| [TG v1](../../../../spec/capabilities/tenant-governance/v1/contract.md)、[AU v1](../../../../spec/capabilities/action-authorization/v1/contract.md)、[BG v1](../../../../spec/capabilities/budget-accounting/v1/contract.md) | [catalog](../../../../spec/catalog.json) 的 accepted v1，接受依据 D-008；拥有业务语义 |
| [CD v1](../../../../spec/data/core-work/v1/contract.md)、[CC v1](../../../../spec/compositions/core-work-coordination/v1/contract.md)、[DR v1](../../../../spec/capabilities/durable-records/v1/contract.md) | accepted v1；拥有共享数据、原子关系与耐久性 |
| [SR v1](../../../../spec/capabilities/session-run/v1/contract.md)、[HD v1](../../../../spec/capabilities/human-decisions/v1/contract.md)、[OB v1](../../../../spec/capabilities/engineering-observation/v1/contract.md) | 只消费本稿涉及的 Session 资格、一次决定与观测责任；不声称这些 owner 已实现 |
| D-010 共享诊断施工选择 | 另消费 HUB `5e81ee8` 的 `docs/decisions/D-010-shared-diagnostics.md`；本 spoke 未 rebase，已用 git show 核对原文。P1 施工选择已接受，产品未交付；本文不复制其 API |

需求消费沿原工作包基线；本稿起点的 `docs/requirements/` 与 `dae2df3` 无差异。
相关要求是 [PF-001](../../../requirements/product/user/PF-001-tenant-organization-context.md)、
[PF-006](../../../requirements/product/user/PF-006-user-settings-and-agent-definition-authorization.md)、
[PF-010](../../../requirements/product/user/PF-010-organization-personal-assets-and-permissions.md)、
[PF-019.C2–C7](../../../requirements/product/user/PF-019-tenant-subscription-usage-billing-and-budget.md#已确认要求)
及 SYS-TENANT/SYS-OBSERVABILITY；范围限制仍归 scope，不将局部通过映射成完整 PF 交付。

以下标为“候选”的字段、事件名、分包接口与算法是本次实施选择。正式 v1 没有
给出的权限词汇、认证证据与资源事实，不从历史候选或 fork baseline 补造。
当前 records 仅在开发端口/codec，真实 writer/admission 尚未交付；本稿的所有
P1 组合门均待实际执行。业务 owner 的观测注入消费上表 D-010 的受限 Diagnostics；
records/work-data 不引入诊断依赖，jsonl/admission factory 必须注入它。P2 原生
Cordis bridge 与 P3 查询仍有独立验证门，不从 D-010 接受推导它们已交付。

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
| 权限范围 `PermissionScope` | `{permissions: string[], resources: ResourceRef[], environment: ResourceRef, session: SessionRef | null}`；首批仅精确有限对象集，null 明确允许在该环境的多个获准 Session 使用；不解释任意字符串路径/glob |
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

每项变更使用上一节共同操作外壳；expected 是相关 stream/draft/object 的精确
修订，操作结果包含变更对象身份、实际 revision、affectedReferences 和生效边界。

| 端口 | 输入 → owner 结果 / 当前检查 |
|---|---|
| `bootstrap`（只供部署） | 部署持有的私有引导能力、deploymentId、seedPrincipal → established / already_established；没有公开 HTTP/IPC 方法接纳任意 seedPrincipal |
| `createTenant` | kind、初始成员（personal 固定当前自然人，organization 显式至少一个 super_admin） → created(tenantId,membership revisions) |
| `addMember/changeMember/removeMember` | tenant、目标 UserRef、角色/状态/显式 delegatedOperations、expected → changed；change 可携带同组织多成员变更，以一个 batch 转移最高资格 |
| `createDraft/editDraft/publish/discardDraft/retireDefinition/readVersions` | DefinitionRef/种类/内容/精确 draftRevision → created/edited/published/discarded/retired 或带水位版本列表；published 返回 TG 实际分配 DefinitionVersion |
| `forkDefinition` | 源 DefinitionVersion、新 ownerTenant、内容 → 新 DefinitionRef/origin；源 derive 权、目标创建权同时成立，不复制 grants |
| `issueEntitlement/changeEntitlement` | beneficiary、精确 VersionSet、rights/conditions/state、源签发依据 → issued/changed；只开放本域有权签发者，不以本地缓存代远端权益权威 |
| `selectVersion/configure/disable/remove` | acquisition 或新选用、DefinitionVersion、开放配置、expected → selected/configured/disabled/removed、ReferenceReport；enabled 只证明选用可用，不声称真实装载 |
| `readTenant/readMembership/readDefinition/readEntitlement/readAcquisition` | 当前调用者及精确目标 → 获准字段/水位；管理元数据与定义正文/Session 正文分别检查 |
| `prepareAccess` / `checkAccess(frame,candidate)`（受信） | `{invocation, tenantId, operation:string, target:JsonValue, definition?:DefinitionVersion, rights?:(use|derive|redistribute)[]}` → TG 私有候选 / ready(basis) 或 denied/unavailable/prepare_again；只判 TG 所有资格，不判 Session 正文 ACL、工具对象权限或预算 |

personal 创建用一个 system-scoped 管理 operation（tenantId=null，target 列名
实际新 tenant/user），同时追加 system personal index 与 tenant.created；仅
可信 TG 创建组合获此写 scope，不能让普通工具绕过“只写本租户 stream”。组织
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

## AU：设置、持久 grant 与 Action 判定

### 设置 owner 和保存/生效分离

候选包 `packages/governance/authorization/`，默认入口 `@omne-harness-lite/authorization`，
record owner 为 `authorization`。它依赖 TG 的只读当前资格端口；TG 不反向依赖
AU。TG 管理资格的根来自 TG，不用 AU grant 自举组织最高管理员。

固定设置目录的保存 owner 均为 AU，目录中的 Schema/范围/缺席/生效规则是本批
版本化实现数据；不开放任意 setting 注册表或任意插件 JSON 合并。Session/MC
仍拥有工作选择和状态转移，保存模型覆盖不等于模型切换完成。

本稿明确采用一个需要在 P3 消费端共同核对的映射：`subjectDefinition` 是 SR
保存的原 Agent DefinitionVersion，AU 定义级 grant 与用户定义设置以它为目标，
符合 PF-006.C2；`Action.definition` 是 TL 原工具贡献的 DefinitionVersion，符合
TL-01/CD-04，可能属于 Plugin。两者复用同一个 DataTypes 类型，却不是同一个
对象。AU 准备依据和判定审计同时保存二者，TG 分别检查权益；不能因为两个
Agent 使用同一个 Plugin 就让一个 Agent 的 grant 转给另一个。辅助 Work 的
subjectDefinition 必须由该 Work owner 的实际创建事实给出，缺失则 unavailable。
这不向冻结 Action 增加字段：其 WorkOwner 经 SR/Work owner 关联 subjectDefinition，
不能由调用者随意选择。P3 若无法提供这个精确关系，应回报缺口而非混用两个引用。

| settingId | 值与合法 scope | 求值与生效边界 |
|---|---|---|
| `confirmation_mode` | standard/confirm/unattended；`session(SessionRef)`、`user_definition(UserRef,DefinitionRef)`、`definition_default(DefinitionRef)` | Session 覆盖 → 当前执行所代表用户对此定义的覆盖 → 定义默认 → standard；下一尚未准入 Action。用户来自真实委托，不能由读取者或 Action params 指定 |
| `text_model` | `{profileId:OpaqueId, profileRevision:OpaqueId}`；session、user(UserRef)、definition_default | session → 用户偏好 → 定义默认；缺席返回 missing_model，不能挑第一个模型。该局部投影对应 MC v1 精确 profile/revision；后续 MC 接受时固定正式公开类型，不能暂用 ResourceRef 冒充第五类定义 |
| `busy_input` | 本批仅 `queue`；user(UserRef)；本次请求显式 queue 不保存 | 本次显式值 → 用户偏好 → queue；输入受理时写入 SR Input.busyBehavior；interrupt_then_run 明确 unsupported，不静默转 queue |

user 与 user_definition 是自然人设置，保存在 AU 列名的 system-scope
`settings-user:<userId>`；只有其本人或明确合法代理可改。definition_default
在原 Agent 定义 owner tenant 的 `settings-definition:<definitionId>`，独立于发布原件；
session 覆盖在其 tenant 的 `settings-session:<sessionId>`。修改时检查实际字段
owner、当前配置权和 expected stream revision；用户全局设置的 operation tenantId
为 null，作用域完全列名，不能夹写 tenant 业务 stream。

`Override={settingId, scope, value:JsonValue, revision:Counter}`；缺席用独立状态
`{saved:"absent"}`，保存用 `{saved:"present", override}`。`readEffective` 返回
`{savedLayers:[...], selected:{value,source,revision}|{state:"missing"},
effective:{state:"usable",value}|{state:"blocked"|"unavailable",code}, constraints:EvidenceRef[],
appliesAt:"next_admission"|"input_acceptance"|"next_run", watermark}`。
clear 的事件与 set(value) 不同。当前三个值 Schema 都不接受 false/null，测试
必须观察非法 set 返回拒绝且原覆盖仍在，而不是当 clear；将来可接受 null 的字段
也必须用 present/null 保留其含义。组织/部署强约束作为独立资格交集解释，不
伪装普通默认，readEffective 不用保存值假报已通过约束。

`setOverride/clearOverride/readEffective/listSettings` 是最小公开端口。Session
text_model 写入由 SR/MC 具名组合准备 AU 覆盖与 Session 选择意图，一次提交，
忙时结果为 pending_next_run；没有真实模型兼容 owner 时该写入口 unavailable。
其它合法层可保存受结构校验的选择，但 readEffective 仍标 profile unavailable，
不被 P2 当可运行模型。当前 Run 的已固定选择从不由 AU 覆盖表改写。

### Grant 状态与管理

`Grant={grantId, tenantId, definition:DefinitionRef, beneficiary:
{kind:"user",user:UserRef,membership:MembershipBasis}|{kind:"tenant",tenantId},
versions:VersionSet, scope:PermissionScope, conditions:Conditions,
grantor:Principal, grantorBasis:EvidenceRef[], state:active|revoked,
revision:Counter}`，保存在 tenant `grant:<grantId>`。默认用户新授予只含请求时
明确的当前精确 subjectDefinition；版本集合扩大、session 从精确对象扩到 null、
资源/权限扩大均要显式表达并再次验证可授予边界，不能由“升级”自动推导。

`grant/amend/revoke/readGrant/listGrants` 接收共同操作外壳及精确修订。结果为
granted/amended/revoked 或具名 denied。revoke 不能把任意他人 grant 变成可改；
授予者须当前具有管理该 grant 的资格。amend 不能修改 tenant/definition/beneficiary
身份，改变这些应新建 grant；revoked 身份不重新 active，重新授予新 grantId。
状态的暂时无效（成员暂停、条件到期、资格不可用）由 effective 投影表达，不
伪造用户已经 revoke；恢复只按仍有效的原版本/条件判断。

grant 的可授予范围来自真实资源 owner 的当前授权与委托上限，不从请求中的
permissions、TG 管理角色或已有“同名 grant”推定。AU 对每个 permission/resource
核对 `mayPerform`、`mayDelegate`、版本/tenant/Session/环境上限和硬限制；所有
授予范围是它们的子集。专属账号/设备同意缺失不能普通 grant 补足。资源 owner
不可用时 grant/amend/revoke 依赖的判定 unavailable，不能自授通过。

这里 mayPerform/mayDelegate 的主体是实际授予者，不要求被授予的 Agent 已经
拥有全部动作权限才可申请。Action 判定先检查其不可授予的硬资格，再检查现有
授权，最后询问资源权威当前是否存在能授予精确缺口的主体；缺口是可合法委托
的动作权限，不能包含“把自己变成其它租户成员”等硬资格。

tenant 受益 grant 只可由具备该租户相应授予资格者创建，消费时仍需要当次成员/
委托与原资源当前权限。user 受益 grant 绑定 joinedRevision；两者都保存授予者
的成员/源依据，移除后再加入不复活旧授权链。Agent 重建不影响仍合法的 grant，
fork 和未列入 VersionSet 的 v2 不继承；批准一次 Action 从不写 grant stream。

### 声明解析与最小 Action 端口

AU 发布的受信解析注册输入为 `{resolverId, version, supportedPermissions,
supportedResourceKinds, supportedGrantorKinds, implementation}`。implementation 只
在门外运行，由部署信任；不执行用户脚本，不接受声明引用任意可下载代码。
resolver 身份与 Action.binding.parserVersion 的精确映射由 AU 固定，不能用
同名新版替换旧版本。未知词汇、provisional、未实现专属同意、缺失资源解析、
声明/实现错配均使可调用贡献 unavailable，help 可按读权显示未就绪原因。

| 受信端口 | 输入 → 输出与责任 |
|---|---|
| `prepareDeclaration` | 精确 ToolDefinition/Command、真实实现绑定、已编译完整参数 Schema 的 owner 证据 → 私有声明候选，含 resolver 版本/词汇/确认资格；TL 同一发布门安装工具与声明索引 |
| `resolveAction` | TL 原 proposed call/attempt、冻结已校验参数、声明候选、真实资源解析上下文 → parseData 校验过的冻结 Action 或 unavailable；AU 构造权限/资源/impact，不能信调用者自行填写的这些字段 |
| `prepareEvaluation` | AuthenticatedInvocation/真实工作委托、精确 Action、可选 RequestRef → AU 私有候选；门外收集 TG、Session、TL、资源 owner、HD 的精确依据和真实 subjectDefinition，不产生授权或请求 |
| `checkEvaluation(frame,candidate)` | 同步核对全部当前根与取消/撤销关系 → 与准备结论一致的 allow/deny/ask/unavailable 或 prepare_again；返回依据，不返回通用启动 token |
| `prepareDecisionAudit` | 已冻结判定候选、明确 composition 和原 OperationRef → AU 的判定记录片段/publication；记录结论必须与 gate 当前核对一致，消费者不可改结论 |
| `evaluateAction`（公开预览） | 当前调用者/Action 引用 → 四值判定与可披露依据/水位，标明 preview；实际执行仍调用上面三个受信端口并联合提交 |

TL 拥有参数 inputSchema 全字段校验与实际实现绑定，AU 拥有授权声明解析与判断；
真正对象 owner 拥有资源身份、版本、权限和 mayDelegate。动态子动作若超出原
Action，必须生成新的 Action/attempt 并过门。任何预览 allow、冻结 Action、摘要、
纯读取 effect 标签或 readonly 参数都不构成能力凭证。

公开判定为 `{outcome, action:Action, evidence:EvidenceRef[], ...}`；deny 包含
code，unavailable 包含 authority/code，ask 包含精确 `MissingPermission[]` 及
合法 grantor 规则。`MissingPermission={permission, resource:ResourceRef,
environment:ResourceRef, session:SessionRef|null, grantorKinds:string[]}`；不把
硬资格缺失写成可批准缺口。实际准入记录保留全部验证依据的版本以及采用的
grant IDs 或 HD 决定引用；只按读权披露这些内部明细。

| 先决条件 / 确认类型 | standard | confirm | unattended |
|---|---|---|---|
| 身份/tenant/权益/绑定/环境/硬限制任一明确拒绝 | deny | deny | deny |
| 必需资格来源未知、失联、解析器不可用 | unavailable | unavailable | unavailable |
| confirmation=none，当前动作权限完整 | allow | allow | allow |
| confirmation=none，缺当前动作权限 | deny | deny | deny |
| before_effect，有完整有效持久 grant，无可消费一次决定 | allow | ask（当前合法授予者仍存在） | allow |
| before_effect，grant 不完整，但缺口可向当前合法主体申请 | ask | ask | deny(human_confirmation_disabled) |
| before_effect，耐久一次决定恰好补足原可授予缺口，其余当前资格全部有效 | allow | allow | allow |
| before_effect，既无足够权限也无合法申请路径 | deny | deny | deny |

confirm 需要 ask 而无合法授予者时 deny(no_eligible_grantor)，资格服务不可核实
则 unavailable。一次决定仍受 HD 的 pending/取消/后果协议约束：由模式变化已
关闭/取代的后果不能以表中最后一个 allow 复活。硬拒绝与来源不可用均不创建
“批准就能继续”的请求。readEffective 的模式来自实际执行所代表用户和 Session，
用户文本“approved”或调用者传 Decision DTO 永不当一次决定证据。

### AU 事件与恢复

| kind（全部 /1） | data / 状态作用 |
|---|---|
| `authorization.override_set` | `{override:Override, previousRevision:Counter}`；只更新明确 scope 的该字段 |
| `authorization.override_cleared` | `{settingId, scope, previousRevision:Counter}`；只清除此层，恢复不保存计算所得默认 |
| `authorization.grant_created` / `authorization.grant_amended` / `authorization.grant_revoked` | `{grant:Grant, previousRevision:Counter, grantingEvidence:EvidenceRef[]}`；完整合法新快照，0 仅用于 created |
| `authorization.action_evaluated` | `{action:Action, subjectDefinition:DefinitionVersion, outcome:allow|deny|ask|unavailable, code:string|null, evidence:EvidenceRef[], grants:{grantId,revision}[], decision:{request:RequestRef,contentVersion,outcomeVersion}|null, missing:MissingPermission[]}`；是该操作的业务判断审计，不拥有 call/request 或一次消费状态 |
| `authorization.operation_denied` | 共同拒绝 shape；用于未形成 Action 的设置/grant/管理拒绝 |

判定记录置 tenant `authorization-attempt:<attemptId>`，不可用/拒绝的未形成调用
操作置独立 audit stream；两者均不泄漏存在性。声明索引是 TL/AU 的运行贡献，
恢复从精确可信定义/解析器重建；历史判定保留原版本，但旧 allow 不作为当前
权限缓存。失去原 resolver 可继续按权读获准历史，不能执行未准入的旧 Action。

## BG：本地预算立场、attempt 与结算

### 状态和数据 shape

候选包 `packages/governance/budget/`，默认入口 `@omne-harness-lite/budget`，owner
为 `budget`。预算管理资格消费 TG 的精确 budget.manage 与独立财务读取权；
具体 Step/Session 正文依其 owner。BG 不依赖 AU grant 实现、不决定动作权限。

| 值 | 最小数据 shape |
|---|---|
| `BudgetScope` | `{kind:"tenant",tenantId}` / `{kind:"definition",tenantId,definition:DefinitionRef}` / `{kind:"session",session:SessionRef}` / `{kind:"run",run:RunRef}`；源定义 owner 可不同，但归集 tenant 必须匹配获权使用租户 |
| `Period` | `{periodId, startsAt:Instant, endsAt:Instant|null}`；明确身份不复用，边界 `[start,end)`；开启下周期是显式操作，不靠午夜清空账本 |
| `Budget` | `{budgetId, tenantId, scope:BudgetScope, currency, scale, limit:Money|null, mode:observe|soft|hard, thresholds:Money[], period:Period, revision:Counter}`；hard/soft 要求非负 limit，observe 的 null 必须显式保存；unknown 例外只由 source posture 持有，不在此复制 |
| `CostSource` | `{sourceId, revision, providerId, currency, priceEvidence:EvidenceRef[], bound: {kind:"finite",maximum:Money, guarantee:EvidenceRef[]}|{kind:"unknown",knownReserve:Money}, kind:tool|model}`；有限上界必须来自可兑现价格/单位约束，0 也要真实零成本依据 |
| `ChargeAttempt` | `{chargeAttemptId, tenantId, owner:WorkOwner, session:SessionRef|null, run:RunRef|null, subjectDefinition:DefinitionVersion, target:{kind:"tool",call:CallRef,toolDefinition:DefinitionVersion}|{kind:"model",requestId,attemptId}, source:CostSource, causality:Causality, allocations:Allocation[], phase:reserved|possibly_emitted|reconciled|released_before_start, uncertainty:known|unknown}` |
| `Allocation` | `{budgetId, budgetRevision:Counter, periodId, reserved:Money}`；该 attempt 准入时一次性绑定每个适用预算/周期，之后不能移到新周期 |
| `MeterFact` | `{sourceId, externalFactId, revision:Counter, previousRevision:Counter|null, chargeAttemptId:OpaqueId|null, providerRequestId:string|null, quality:actual|estimated|unknown, amount:Money|null, quantities:{integer:string,scale:number,unit:string}[], completeness:partial|final, corrects:{sourceId,externalFactId,revision}|null, evidence:EvidenceRef[]}`；null 只用于尚未归因的来源事实；unknown 的 amount=null，actual/estimated 必须有 Money |

ChargeAttempt 由 BG 分配唯一 chargeAttemptId，工具 target.call 精确匹配
Action.owner/callId/attemptId；模型 target 保留原 requestId/attemptId，而不是
为了套 CallRef 造一个虚假 tool call。同一次物理重连沿原 target，不分配第二次
ChargeAttempt；实际新尝试用新 attempt 并保留原费用。WorkOwner 是 Step 时
session/run 必须等于嵌套原值；辅助 WorkRef 可为 null，但原可得关联及派发因果
不能丢失，不虚构用户 Run。费用事实可在 Run/Agent 结束后到达。

definition 范围预算按 subjectDefinition 匹配原 Agent 定义；工具源版本另由
target.toolDefinition 保存且等于 Action.definition，两者与 AU 采用相同映射。
本批不另外开放“按 Plugin 定义归集”的预算类型，以免含糊 definition 同时指两种
对象。需要扩大预算范围时先增加明确的范围判别值和验收，不重新解释旧账目。

Budget 在 tenant `budget:<budgetId>`，ChargeAttempt 和计量事实在 tenant
`charge:<chargeAttemptId>`；source 姿态在 tenant `budget-source:<sourceId>`，显式
记录该来源已启用、采用哪些 tenant 立场、可信 source revision 与撤除状态。
首次 enableSource 必须存在可用的明确 tenant 预算立场；不存在返回
budget_posture_missing，不隐藏 unlimited。所有已注册且 scope 匹配的预算均参与，
消费者不能自选只检查最宽松的一个。新增/变更/停用适用预算更新 BG 的 scope
目录 stamp，使准备阶段漏掉新预算的调用必须重准备。

每个 sourceId 由来源注册权威分配并固定唯一 tenant/provider；源回执不能被重指
另一租户。tenant `meter-source:<sourceId>` 保存事实键与归属/当前修订的唯一
索引，计量提交同时条件更新它和相应 charge/budget streams；因此将同一 fact
填到两个不同 attempt 也不能重复记账。unallocated 与后续 cost_attributed 使用
同一索引，归因移动不新增费用。索引与主事实同批，不依赖最终一致投影查重。

金额沿 Money：integer 是规范十进制整数字符串，scale 是校验过的非负整数，
currency 非空。内部用整数精确换 scale，同币种在共同 scale 上相加比较，只有
可整除才缩 scale；不经 Number 累加或四舍五入跨越上限。负数只用于实际调整/
余额，预留/上界/limit 不能负。不同 currency 分组，不自动换汇；同一来源存在
无法核实币种时 unavailable。数量 unit 独立于 Money，首批不把 tokens 当货币。

### 公开端口与联合准入

| 端口 | 输入 → 结果与责任 |
|---|---|
| `createBudget/changeBudget/openPeriod` | 当前管理主体、Scope/金额/mode/period/expected → created/changed/period_opened；记录影响边界，未耐久放宽不可用，普通下调不强停在途 |
| `enableSource/changeSourcePosture` | 明确来源、tenant 立场与已核实 CostSource、expected → enabled/changed；`allow_unknown_exposure` 只能获准用户在此显式选择，Agent/普通审批无此写权 |
| `readBudget/readAttempt/readStepCosts` | 财务读权及目标 → 已确认消耗、预留、未决差额、质量、负剩余、未知上界、原周期与水位；不附正文/秘密 |
| `prepareReservation`（受信） | 真实调用 owner 提供的精确拟准入 target/WorkOwner/subjectDefinition、真实 CostSource 证据 → BG 私有 reservation 候选及其冻结 appends/publication；不预先扣账 |
| `checkReservation(frame,candidate)` | 当前调用/来源/budget scope目录/各预算修订与余额 → ready 或 denied/unavailable/prepare_again；与 call/AU/HD 的同一门、同一 batch |
| `recordExposure` | 原执行 owner 的 emitted/possibly_emitted/unknown 事实（经原权威认回） → exposure_recorded；调用者字符串不证明已发出或未发出 |
| `releaseBeforeStart` | 原 attempt、执行 owner 的已耐久 not_started 加迟到 start 封闭证明 → released；已发出或证明缺失为 refused/unknown，AbortSignal/not_found 不算证明 |
| `recordMeterFact/reconcileAttempt` | 来源 owner 核实的 MeterFact/最终对账证据 → recorded/replayed/superseded/fact_conflict 或 reconciled；不接受用户自报 usage 清零 |

工具 actions 的组合由 TL 拥有，模型请求的组合由 MC 拥有；它们调用 BG 准备和
检查后聚合调用/授权/批准消费/预算/执行许可记录，使用 action_execution 或
budget_call 只提交一份 batch。BG 不自己提前 submit 预留，应用也不能调用
“reserve 成功后再写 call”。候选中的 source/attempt 必须由真实 owner 私有
证据与准入记录对应；仅给 BG 填一个 `price:0` 不开放调用。

对有限上界 U，在每个适用 hard 预算检查 `已入账费用 + 尚未结算的有限预留 + U
<= 当前有效 limit`，并在 logical 原子增加 U。soft 同样记录预留和阈值事实但
不以余额拒绝；observe 保留费用/质量。多个适用预算任一个 hard 拒绝都不产生
call 准入或部分 reservation。新调用与未耐久预算下调交错仍用收紧交集，降低
后剩余可为负，后续拒绝/告警；旧调用不被 BG 停止。

上界未知且适用 hard 时默认拒绝 bound_unknown。每个适用 hard 的该 source
都显式允许 unknown 才可准入，至少预留 knownReserve；已知费用/预留触顶仍
拒绝（即使下一 knownReserve=0），另保留 unknownExposures 的 attempt 集合。
不能把 unknown 当 0 或声称 total 上界有限。没有 hard 的 observe/soft 也要
明确展示未知费用；实际零成本工具必须有真实 CostSource finite(0) 证据和来源
姿态，不能因“本地工具”默认免费。

预算周期打开同时保存新 Period 和政策 revision。旧 reservation 继续挂原
periodId，late fact 不依据当前日期重归集。下一周期未耐久时不能用新余额准入；
跨边界的门外准备必须重算绑定周期，绝不在同一个 attempt 结算时改周期。
本批没有供应方授予额度；未来 BG-06 不能混成用户可自行增减的 limit。

### 计量、未知和事件

每笔来源事实按 `(sourceId,externalFactId,revision)` 去重。相同内容重放返回
原记录；同键异内容记 fact_conflict 并隔离该来源的后续准入，原费用不覆盖。
同一个逻辑 request 若真实供应方两次收费，用两个 externalFactId 或明确两个
attempt 记录，不能逻辑去重掉实际支出。source 修订链缺失则保留待核实事实及
差额，不跳到“完整 final”；旧修订晚到不覆盖较新有效值。

每个费用组成保留原估算和修订/冲销关系，读面计算当前有效值而非把所有历史
版本累计。由 estimated 转 actual 要有同组成的修订或显式 corrects 链；独立
收费事实则相加。令 C 为该 attempt 当前有效的已知计费组成之和，保留其各自
actual/estimated 质量；有限可兑现上界 U 的未决预留为 `max(U-C,0)`，已知总暴露
为 `max(C,U)`，不能将已入账部分再算一次预留。未知上界的已知预留 K 使用
`max(K-C,0)`，总已知暴露 `max(C,K)` 外仍有明确未知差额，不能因数值预留耗尽
移除 unknown 标志。估算不是实际收费，缺价组成不纳入 C 伪装为零。
final 只有在来源证明该 attempt 所有费用组成完整时才能清除
剩余预留/未知标志，不能仅凭某一 usage 帧带 finish。实际金额超过 U 如实入账、
报告 bound_violated 并关闭该来源新的有限保证准入，不压成 U 掩盖外部收费。

能够确认从未发出并封闭迟到 start 时，BG 才释放全部未用预留；已经 possibly
emitted 的记录在费用核实前不因连接断开、Run cancelled 或进程重启释放。缺
emitted 回执也不能证明未发出；恢复与原执行 owner 对账，未知保留原归属。
无法归因的来源费用先记 tenant 的 unallocated stream/差额和来源去重身份，
后续明确 allocation 事实关联原 Step；不能平均分摊，不能丢掉原来源事实。

| kind（全部 /1） | data / 状态作用 |
|---|---|
| `budget.policy_changed` | `{budget:Budget, previousRevision:Counter, affectedAttempts:OpaqueId[], effectiveBoundary:"next_admission"}`；create 的 previousRevision=0 |
| `budget.period_opened` | `{budgetId, previousPeriodId, period:Period, budgetRevision:Counter}`；旧账不清空 |
| `budget.source_posture_changed` | `{tenantId, source:CostSource, enabled:boolean, tenantPostureBudgetId:OpaqueId, unknownPermissions:{budgetId,allowed:boolean}[], previousRevision:Counter}`；tenantPostureBudgetId 是启用来源的显式立场，不筛除其它适用预算；未知例外在此唯一保存 |
| `budget.attempt_reserved` | `{attempt:ChargeAttempt}`；和调用接纳同 batch；各 budget stream 同 batch 写下行 |
| `budget.reservation_changed` | `{chargeAttemptId, budgetId, periodId, before:Money, after:Money, reason:reserved|partial_meter|reconciled|never_started, evidence:EvidenceRef[]}`；核对原 attempt/金额，不单独开放任意设置 after 的端口 |
| `budget.exposure_recorded` | `{chargeAttemptId, phase:possibly_emitted, uncertainty:known|unknown, sourceFact:EvidenceRef}`；单向保守确认，不把缺席读成未发出 |
| `budget.meter_recorded` | `{fact:MeterFact}`；来源去重、组成修订和当前质量；金额进入原 allocations 的周期 |
| `budget.source_fact_indexed` | `{sourceId,externalFactId,revision,previousRevision,chargeAttemptId:OpaqueId|null,inputDigest:string}`；同 batch 更新来源索引，并核对主计量事实的规范内容；摘要不代替原内容比较 |
| `budget.attempt_reconciled` | `{chargeAttemptId, finalFacts:EvidenceRef[], released:Allocation[], remainingUnknown:boolean}`；真实完整证据才令 remainingUnknown=false |
| `budget.released_before_start` | `{chargeAttemptId, proof:EvidenceRef[], released:Allocation[]}`；先验证迟到 start 已被原 owner 封闭 |
| `budget.unallocated_recorded` / `budget.cost_attributed` | `{fact:MeterFact, tenantId}`（fact 的 chargeAttemptId 此分支为 null） / `{sourceId,externalFactId,revision,chargeAttemptId,allocations:Allocation[],evidence:EvidenceRef[]}`；归因前后总费用不变，来源索引同批更新 |
| `budget.threshold_crossed` | `{budgetId,periodId,threshold:Money,knownExposure:Money,unknownAttempts:OpaqueId[],delivery:"pending"}`；与触顶事实同 batch，通知失败另记 delivery，不回滚费用 |
| `budget.threshold_delivery_changed` | `{crossingOperation:OperationRef,budgetId,periodId,threshold:Money,delivery:applied|failed|unknown,evidence:EvidenceRef[]}`；按原触顶操作与阈值关联唯一后果，重试不新增超限事实 |
| `budget.operation_denied` | 共同拒绝 shape；额度拒绝、无立场、上界未知等各有明确 code，不能只留诊断计数 |

预算 owner 的纯 reducer 验证原 attempt/period、Money/currency、修订链、分配
与余额关系。恢复先重建所有已确认账目/预留，再接纳新工作；未决收费、未完成
释放、告警后果和来源不可用分别可查询。财务读面可以显示 unknown/未核实差额，
不因费用不完整关闭获准历史；新的计费准入则按真实资格和暴露决定。

## 与 Session、工具、HD 的共同固定项

下面是由消费能力包定义窄端口、真实事实 owner 实现的候选，不是另一层总权限
服务。端口的 runtime 句柄只在受信装配发行；每个事实载入后带原 authority、
精确 revision、撤销关系和同门 current 检查。未实现/未知返回 unavailable，
不得填写 permissive 默认值。

| 消费者需要的注入 | 最小内容与真实 owner | 必须共同验证的门 |
|---|---|---|
| TG/AU/BG 的主体事实 | 前述 AuthenticatedInvocation；本机凭据映射/撤销由身份适配持有，TG 解释成员，SR/AR 解释工作委托 | 伪造 DTO/句柄失败；两主体凭据真实区分；准备后撤凭据先封闭后续 gate；本机 IPC 在 P3 通过前不开放给用户 |
| AU 的 Session/工作事实 | SR 提供 `{session, owner, subjectDefinition:DefinitionVersion, acquisition, settingsUser:UserRef, run?, epoch?, controlRevision, operations:明确集合}` 的私有快照/current 检查；正文读、输入写、设置写、精确控制独立 | 同租户 super_admin 可管理预算但读不到私人正文；读取权限不自动允许 control；旧 epoch/终态/held 不支持新动作；同 Plugin 的不同 Agent 定义不能借 grant |
| AU 的绑定/环境/对象事实 | TL 的精确注册/Command/Binding、对象 owner 的 ResourceRef/权限/可授予上限/硬限制及其当前根；资源真实存在与可用性归这些 owner | 换参数/秘密版本/环境/实现/解析器必成新 Action；声明 none 仍需 read 权；无环境授权 owner 则 unavailable，不能以“可信工具”推导用户有权 |
| AU 的合法一次决定 | HD 提供 `{decision:Decision, action:Action, missing:MissingPermission[], state, consumption, continuation, grantorBasis}` 的私有候选和 current 检查；只 accepted/durable approve、精确 Action 且未消费/未关闭成立 | HD 在 action_execution 同 batch 写消费；AU 只写判断。两个调用抢同决定至多一个 apply；正文 Decision 对象、pending 答案或已消费对象不能通行 |
| TG 引用清单 | 相关已开放 SR/TL owner 提供 `prepareReferences(definition/acquisition/draft)` 与同门 `checkReferences`，带 owner revision 与 ReferenceReport 条目 | 新引用与 discard/retire/disable 使用同门 stamp；未知来源不可当空。部署明确未安装且已封闭引用创建的能力可报告不适用，已开放能力不能省略 |
| BG 费用来源与执行事实 | TL/local-execution、后续 MC/OpenRouter 提供 CostSource、精确 target、start 墓碑、计量来源；证据引用经原 owner 认回，不能用户提交就可信 | 实际零费依据、并发最后额度、取消早于迟到 start、效果未知及迟到收费；缺 usage 不归零 |
| AU 模型设置与 SR 生效 | MC 提供 profile/revision 与兼容资格，SR 提供当前 Run/selection revision；保存覆盖和 pending_next_run 意图共同准备 | 当前 Run 不变；下一 Run 只取实际已生效选择。MC 缺席不能宣称模型已经选择成功 |

这些类型最终放在消费方所属包的公开入口，例如 AU 的 ActionFacts/DecisionFacts
协议由 SR/TL/HD 实现；AU 不 import 它们的实现，SR/TL/HD 可依赖 AU 的接口，
避免循环。TG 的 ReferenceInventory 同理，BG 的 ChargeSourceFacts 由调用 owner
实现。装配只负责连线与可信注册，不能在 adapter 里补业务 allow、决定消费或预算
释放。一个 callback 若开始拥有这些状态转移，必须回原能力实现。

`ReferenceInventory`、`ActionFacts` 等名称只标识上表职责，P3 前须把其实际
语言签名、私有候选归属和生命周期与相应 owner 一起固定/编译/验证。本稿已
固定它们不能省略的字段与判定；没有该接受输入的消费者不得独立发明另一套
Boolean isAllowed。P2 可以先交付 TG/AU/BG 自身真实管理与恢复；A01/A03/A11
的完整调用闭环等待真实 SR/TL/HD/身份组合，不以端口测试替代。

| 具名组合 / 提交者 | 各 owner 准备的最小原子关系 |
|---|---|
| `owner_change` / TG、AU 或 BG 的管理入口 | 原 owner 状态变化+其审计/确定结果；TG personal 创建含列名 system index 与 tenant 初始成员 |
| `input_run` / SR | SR 输入/取批/Run 占位；TG/AU 是当前只读资格，SR 保存实际依据/设置值，不能复制 grants 或改预算 |
| `request_wait` / TL 与 HD 的受信调用组合 | AU ask 判定+HD 原 Action/request+SR/TL 精确等待位置；此时不 reserve 执行预算，不发效果 |
| `answer_consequence` / HD | HD 唯一决定+SR/TL 唯一接续意图；答复不写 grant、不提前消费执行预算 |
| `action_execution` / TL | TL 原 call/attempt 准入与执行许可记录+AU allow 依据+HD 精确一次消费（如有）+BG 全部预留；真实资源 owner 提供 ExactUse |
| `budget_call` / MC | MC 请求/attempt 准入+授权/运行依据+BG 全部预留，执行 owner 保留其精确许可/取消账本；P4 才接真实模型 |

组合者只组装各 owner 冻结片段并提交一次，不提供第二套准入政策。跨不同 owner
同批的结果由该具名组合者形成明确业务结果（例如 call admitted、request pending），
分别嵌入各 owner 结果引用；不能拿预算 reserved 当工具已经执行成功。已有 P0
participants 校验不替代“是否漏写一次消费/预算”的业务完整性检查，P3 必须通过
真实组合反例验证。

## 三个研发 owner 的施工交接与 TDD

全部产品实施等待：P1 的真实 JSONL/OS 锁/恢复与 coordinator 组合已接受、真实
records/admission/work-data 公开产物固定、本文独立评审接受、必要共享身份接口
固定及 D-010 诊断实际提供者验收。对具体未开放依赖按上表保留 unavailable；不能先开放绕门
路径再等待后续修复。构建/来源/锁修改由整合者拥有，worker 不改根文件。

| owner / 可写包 | 完整目标与完成边界 | 先 RED → 最小实现 → GREEN 的推进 |
|---|---|---|
| TG capability-developer：`packages/governance/tenant/**` | TG-01/02/04/05 的真实管理、只读资格、事件校验/fold、双视图/恢复；消费 P1 端口，交付默认入口。不得写 AU/SR/根配置/冻结规格；关键权限/引用前置缺失暂停依赖路径 | T1 可信初始化与并发 personal 唯一；T2 最后一 super_admin/成员重加；T3 草稿冲突、发布重复/不可变、官方保护/fork；T4 权益/选用/current 交错；T5 真实磁盘重启、非法事件和隔离读面；再跨 SR/TL 引用组合 |
| AU capability-developer：`packages/governance/authorization/**` | AU-01–06 的设置、grant 管理、声明解析、四值判断/审计、当前 gate；事实归属沿上表。不得实现 HD 状态、TL 执行或应用授权替身；缺真实资格不得返回 allow | U1 覆盖存在/缺席、字段/范围/非法值；U2 实际 grant/amend/revoke+版本/范围上限；U3 声明/解析器不就绪；U4 四值矩阵/完整一次决定前提；U5 撤权/重授/设置交错及恢复；再接真实工具/HD 双入口组合 |
| BG capability-developer：`packages/governance/budget/**` | BG-01–04 的本地预算管理、真实来源姿态、attempt/period、联合预留/计量/未知账目；不接支付/供应方订阅，不实现模型网络。不得由应用写账；来源证据不足不可宣称有限上界 | B1 Money 定点/币种与显式姿态；B2 两调用最后额度/全部适用预算；B3 start 前取消与未知暴露；B4 来源回执去重/修订/真实多次收费；B5 周期/迟到计量/下调和重启；P3 实际工具、P4 实际模型沿同 owner 接入 |

每位开发者在自己的包内写 src、tests、README/package 元数据/来源和绑定源码的
证据，导出本稿的最小端口/事件 decoder，使用公开依赖。只有实际行为/边界出现
才新增文件；不预建 StateManager/Repository/EventBus。根配置/锁/包索引与此工作包
由整合者更新；共享端口只有一个写者，消费方提出具名变更请求。

每个序列逐条写外部可观察 RED，并确认失败来自目标行为缺失；随后最小实现、
目标 GREEN 与相关回归，不一次堆完私有 Map 再补测试。T/U/B 编号是本稿施工
步骤而不是新验收 ID。业务状态和纯 reducer 可用具名端口夹具，夹具必须保留
修订、当前撤权、一次消费和 unknown；P2/P3 接受要有真实 P1 组合证据。

| 验收局部切片 | 必须可观察的反例及结果 |
|---|---|
| A01 / TG+AU | 两真实主体/两 tenant；伪造 Principal/TS cast、同 user 多组织、跨 tenant 所有嵌套引用、管理者无正文权。读/list/count/旧回执/订阅均当前授权，无存在性泄漏；正文/财务/精确控制分别有结果 |
| A02 / TG | 同自然人两个 operation 并发 personal create 恰一 tenant；两个管理员互撤仍保留一个；remove/re-add 不恢复旧 grant/委托。真实管理创建草稿→发布，重复 publish 同版本、异输入冲突、旧版不可改、official 不能改、fork 不继承 grant |
| A03 / TG+AU | 实际 issue/select/grant/amend/revoke 建立依据；v1 可用、fork/v2 越界；源权益停用不删除原 Session；撤权排 n+1 阻新调用而 n 等耐久后可继续。撤销再重授都未耐久不越过中间撤销；源不可用 unavailable，不 ask |
| A11 / AU | 穷举上表模式×确认类型×硬资格×grant×一次决定；当前合法授予者缺失不能 ask。真实 set/clear/readEffective，Session→用户定义→默认；false/null 非法 set 不清除。模式变化不造答案；未耐久放宽不用、收紧立即封闭 |
| A26 本地 / BG | 两 finite(7) 调用争 limit(10)，只一个 call+reservation 成立；一项硬预算拒绝不留另一个预留；预算下调/并发创建适用预算参与 gate；unknown 上界默认拒，显式例外保留 unknown；有限 0 必须有来源依据 |
| A26 恢复 / BG | 重放同 externalFact/revision 不增费、同键异内容冲突；同 request 两真实收费分别保留；跨周期 late actual 归原 period；unknown/未收到 start 回执不释放；真实墓碑证明未开始才释放；重启后 reserved/negative/unknown 不归零 |
| A28 / 三 owner | 未形成 Action 的拒绝仍有 operation/主体/tenant/阶段和裁剪目标；关键成功/拒绝保存失败时禁止新效果并返回 audit_unavailable/原 unknown；诊断丢弃有 gap，普通通知失败不回滚业务结果 |
| A05/A08 回归 / 三 owner+P1 | 相同 operation 原回执含业务 denied 也跨重启稳定；异输入冲突、过期修订冲突不随未来状态变成功；fsync 阻塞无效果，失败隔离后不能越过；某 owner publication blocked 保留 committed 与所有未决责任 |

A01 的实际 IPC、A03/A11 的实际工具效果、A26 的真正调用/预算原子记录及 HD 一次
消费，需要 P3 组合接续；三包的本地通过分别登记具体切片，不声明整个 A 项或
M1 完成。P4/P5 仍按完整工作包交付，当前无收费模型请求。

观测沿 OB-01–03、CC-07 在上述真实边界接入：prepared/denied/pending/committed/
unknown、源就绪/失联、模式/grant/预算变更、费用质量/迟到事实都有 owner 与
operation、tenant、可信主体、原 work/attempt、Position/水位及版本关联。
publication/短门仅更新有界内存状态，日志刷出在门外按 D-010 的受限注入面处理，
应用持有诊断管理面；P3 查询/导出和业务通知沿各自 owner 的独立契约。关键审计
来自本稿 records，诊断 sink 不代替它；日志丢失/告警投递
失败独立可见，观测 listener 不执行控制、重试或账目转移。

## 接受门、缺口与证据限制

| 项目 | 本稿结论与下一门 |
|---|---|
| 已沿用事实 | TG/AU/BG/CD/CC/DR v1 与 P0 8f4cfa9；work-data 已实现。未发现必须修改冻结 v1 的直接反例；不因此声称所有候选都已证明可行 |
| 本次候选 | 三包 stream/event/result、有限精确版本/对象集合、TG joinRevision、设置目录、预算整数/周期/来源事实协议；须由独立架构评审核对并由整合者固定接受版本 |
| G1：P1 真实前提 | 当前 writer/admission 未交付；等待真实磁盘/锁/故障/双视图/ExactUse 组合接受，不把 P0 声明探针当产品提供者 |
| G2：可信身份与资源资格 | AuthenticatedInvocation、SR工作资格与真实资源 mayPerform/mayDelegate 撤销面尚待共同固定；若缺失却返回 allow，最小反例是任意管理员填资源 ID 得到工具执行。相关入口保持 unavailable，接受真实适配与两主体测试后才开放 |
| G3：HD/TL/SR 组合 | HD 决定候选/消费、TL绑定/声明发布、SR精确控制与引用清单须在各 owner 版本固定；最小反例是 DTO approve 或“index miss=无引用”绕过一批原子关系。P3 实际组合及消费者编译是开放门 |
| G3a：定义引用映射 | 本稿依 PF-006/TL-01 区分 subjectDefinition 与 Action.definition；P3 验证两个不同 Agent 定义使用同一 Plugin 时 grant 不互借、原版本集合仍精确生效。若上游消费者只持工具定义，缺失关系必须补在真实 SR/Work 依据，不能猜测 |
| G4：来源/模型 | P3 工具必须提供真实 CostSource 与 start/stop 墓碑；P4 再固定 MC profile 投影/价格/usage。用户填 0 或供应方上界未证实不能作为有限预算保证；无真实模型资格时不宣称模型覆盖已生效 |
| G5：工程观测 | D-010 @5e81ee8 的 P1 施工选择已接受，三 owner 注入受限 Diagnostics；等待其真实提供者，不复制 API。P2 原生桥/P3查询独立验收，当前未交付，本稿只固定 OB/A28 接入责任 |
| G6：产品交付 | 三个 owner 各自 RED/GREEN、公开产物/来源/无环、真实恢复与 P2/P3 联合验收；整合者核对最终源与文档后接受。测试替身或草稿不转为 accepted 产品 |

本稿只修改本文件，不改根配置/锁、packages/apps、spec/catalog/frozen 或其它
工作包正文。实际使用本 spoke 的 CPython 3.12.13 与 `uv sync --locked` 准备环境，
`make docs-check BASELINE=4253ee0` 通过 399 份 Markdown 及关联检查；
`git diff --cached --check` 核对本稿空白。日志与范围核对位于本工作树
`tmp/governance-design/`，由主调度在退役前保全。这些只检查文档结构/链接/冻结
输入，不证明接口可编译、业务语义或 P2 产品符合性。任何必要前提出现正式规格冲突，
以精确条款、最小交错及受影响入口回传，不修改冻结文件或放宽验收。
