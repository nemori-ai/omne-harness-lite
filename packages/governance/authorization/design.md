# Authorization 提供者设计

状态：`f98ac926` 映射及评审消歧已接受为最小运行基线施工输入；目标包尚未实现。
[来源入口](../../../docs/proposals/core-capabilities/implementation/runtime-provider-interfaces.md)
保留完整历史修订与检查。当前服务于 allow 最小基线，完整 HD 运行后置。

采用 [AU v1](../../../spec/capabilities/action-authorization/v1/contract.md)、
[TG v1](../../../spec/capabilities/tenant-governance/v1/contract.md)、
[CC v1](../../../spec/compositions/core-work-coordination/v1/contract.md)、
[DR v1](../../../spec/capabilities/durable-records/v1/contract.md)。设置/grant/声明、
四值矩阵及事件见下文，采用 `058c77c`；Session 权限事实归
[Session 当前设计](../../session/session/design.md#当前调用者对象权限与运行委托)。

## 提供与依赖

候选默认入口 `@omne-harness-lite/authorization` 导出 `createAuthorizationHost`、
`AuthorizationPlugin` 及下面具名事实管理面。目标公开源码尚未存在，本文不另写
TS 签名。包依赖 TG/data/records/admission/diagnostics 的公开入口；AU 不 import
SR/TL/HD 实现，不为声明纯数据另建插件。

AuthorizationHost 持有本域按租户分区的设置/grant/解析声明、logical/durable 根、
原操作与当前事实源；应用单次创建并保有恢复/关闭面，同一 coordinator 重复
创建返回 `authority_already_bound`，第二 Context 复用原 host。插件仅挂运行面。

`AuthorizationPlugin` 的 service key 为 `omneAuthorization`；required inject
是 `omneAdmission`、`omneDiagnostics`、`omneIdentity`、`omneTenant`。恢复 AU
decoder/fold/审计/原操作至同一水位后才 provide。业务特定来源尚缺时，该操作
返回 unavailable，不能用声明存在或“可信工具”推导 allow，也不让可用管理面
等待尚未开放的 HD/模型功能。

apply 捕获真实 `c.fiber` 与 host 的 mount generation，service 闭包绑定原挂载；
不把 ctx.plugin 返回的等待/卸载外壳当真实 Fiber。宿主观察器先调用 AU 的具名
关闭门推进 stamp；末门同时核挂载、所有必需 provider 及各事实 source 当前
存活/代次，覆盖 consumer 仍 ACTIVE 而 provider 已失效、effect 异步清理窗口。
每次 apply 新建 mount generation，同 Fiber 重载不复活旧闭包；之后独立核
身份/TG、当前模式/grant、硬权限和精确 Action。

## 具名事实源与无环组合

以下管理面仅交装配指定的 link；普通 `omneAuthorization`、用户及工具 body
拿不到它们。接口内容沿上述逻辑稿，不复制 Action、Decision 或 grant 定义。

| 本包拥有的注册符号 | 真实来源与末门责任 |
|---|---|
| `registerSessionFacts` | SR prepareSessionFacts/checkSessionFacts：原 owner、settingsUser、subjectDefinition、acquisition、对象操作/Run epoch。SR 只查自身/TG 事实，不递归向 AU 求模式 |
| `registerActionFacts` | TL 的原冻结 Action、实际 Binding/声明/参数与版本；TL 的 check 不反调用 AU |
| `registerResourceFacts` | 真实资源 owner 的对象权、硬限制、可授予上限和当前根；缺失不是默认具有资源权 |
| `registerDecisionFacts` | HD 的原决定、消费/关闭状态和 grantorBasis；AU 核当前硬资格，HD 核原决定和消费，两者由具名组合分别准备/同门检查 |

[SR link](../../session/session/design.md#链接与当前资格) 同时把 SessionFacts 登记给
AU、把 AU 当前配置面登记给 SR；工具/资源/HD 的 link 由其原 owner 实现。
各方门外准备、同一 coordinator.enter 登记双方精确 host/source/registration/
generation/范围与 stamp，最后门外通知；LOADING 只持 held，不能半边开放。
retire/inspect/waitReleased 只控制本次注册，任何失败/旧 disposer 不清别人新登记。

**重载消歧**：失效的是旧 `DecisionFacts` 私有候选和运行句柄。未消费、未关闭
的耐久批准历史仍归 HD 保留，当前 HD owner 可重新发行候选并按当前资格重检，
只供原 Action；普通 AU 或 link 重载不自动取消批准。批准不是持久 grant，
重建候选也不让已消费/已关闭/不匹配 Action 的决定重新执行。当前 allow 基线
可不装完整 HD；一旦判断为 ask，缺真实 HD 路径须具名不可执行。

## 装载、撤除与保有

| 效应 | 撤除及不可丢失的责任 |
|---|---|
| 恢复后公开服务、普通监听 | 本次 Fiber 撤自己的注册；先单调关闭 mount。旧 facade 不追随新代；AU 根、原结果和审计不随之删除 |
| 事实源/解析器受管登记与未交接准备 | 原注册的 owner 清理、保有晚到准备；来源撤代立即使相应新判定 unavailable。当前 stamp 不由 TS brand 或缓存版本号代替 |
| 设置/grant 修订和判断审计 | AU host 沿原 owner_change/组合批提交，保留 pending/unknown。撤权 logical 立即约束，正向权限等 durable；应用/link 不补写 grant 或判断状态 |

AU 失联关新的授权/作答资格，已准入动作由 SR/TL/执行控制合同收口；不把失联
解释为用户 cancel。清理/事实通道不冒用失效授权去启动新工作。facade 重挂复用
原 host，host 本体更换必须先排空、确认清理/合法移交和完整水位；残留具名
retained，不能建空 host 掩盖。真正资源清理按一个有序过程等待，disposer 返回
或超时不能证明业务停止。

## 实施门

在真实 P1、TG/身份与资源事实组合中验证 grant/amend/revoke、
set/clear/readEffective、声明解析及当前判定。allow 基线必须覆盖 A01/A03/A11、
S01/S16：同租户管理者无正文/设置权、准备后撤权、缺来源、重载旧候选、同操作
冲突和重启恢复。HD 当前候选重发/唯一消费作为后续接口符合性要求保留，不将
完整双入口审批变成本会话新硬门。当前产品组合未运行，原机制探针不抵扣。

## 实施协议的采用来源

下列状态、记录、端口和算法从已接受的 `058c77c` 治理输入迁入，
迁移源快照为 `7e758f21f8f92c1d46fab194fdaf120239b8e11c`。
原稿只保留受审/接受和取舍历史；本页拥有所列当前提供者设计，语言无关承诺
仍归所采用的精确 spec。接口记法不等于已经存在或发布的产品 API。

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

## PermissionScope

此实现值的声明归属在本轮维护明确，原数据含义来自 `058c77c`。

| 本稿概念 | 唯一表示与校验 |
|---|---|
| 权限范围 `PermissionScope` | `{permissions: string[], resources: ResourceRef[], environment: ResourceRef, session: SessionRef | null}`；首批仅精确有限对象集，null 明确允许在该环境的多个获准 Session 使用；不解释任意字符串路径/glob |

VersionSet、Validity、MembershipBasis、EvidenceRef 和 Conditions 沿
[Tenant 共同值](../tenant/design.md#数据边界与共同操作协议)复用，不建立同义表示。
本包自己执行[共同消费协议](../tenant/design.md#三种操作表面与结果)的 prepare/check/
publication 与拒绝审计；grant/设置的所有未耐久收紧立即封闭，正向允许等 durable，
撤销再重授不能越过中间撤销。该文档引用不把本包状态或事实求值交给 TG。

## 事实消费协议

以下协议由 AU 声明其消费要求，各真实 SR/TL/HD/资源/模型 owner 实现；它们
不反向调用 AU 补造自己的事实，缺来源返回 unavailable。私有候选及代次/current
检查由真实提供者拥有，数据形状不授予资格。

| 消费者需要的注入 | 最小内容与真实 owner | 必须共同验证的门 |
| TG/AU/BG 的主体事实 | 前述 AuthenticatedInvocation；本机凭据映射/撤销由身份适配持有，TG 解释成员，SR/AR 解释工作委托 | 伪造 DTO/句柄失败；两主体凭据真实区分；准备后撤凭据先封闭后续 gate；本机 IPC 在 P3 通过前不开放给用户 |
| AU 的 Session/工作事实 | SR 提供 `{session, owner, subjectDefinition:DefinitionVersion, acquisition, settingsUser:UserRef, run?, epoch?, controlRevision, operations:明确集合}` 的私有快照/current 检查；正文读、输入写、设置写、精确控制独立 | 同租户 super_admin 可管理预算但读不到私人正文；读取权限不自动允许 control；旧 epoch/终态/held 不支持新动作；同 Plugin 的不同 Agent 定义不能借 grant |
| AU 的绑定/环境/对象事实 | TL 的精确注册/Command/Binding、对象 owner 的 ResourceRef/权限/可授予上限/硬限制及其当前根；资源真实存在与可用性归这些 owner | 换参数/秘密版本/环境/实现/解析器必成新 Action；声明 none 仍需 read 权；无环境授权 owner 则 unavailable，不能以“可信工具”推导用户有权 |
| AU 的合法一次决定 | HD 提供 `{decision:Decision, action:Action, missing:MissingPermission[], state, consumption, continuation, grantorBasis}` 的私有候选和 current 检查；只 accepted/durable approve、精确 Action 且未消费/未关闭成立 | HD 在 action_execution 同 batch 写消费；AU 只写判断。两个调用抢同决定至多一个 apply；正文 Decision 对象、pending 答案或已消费对象不能通行 |
| AU 模型设置与 SR 生效 | MC 提供 profile/revision 与兼容资格，SR 提供当前 Run/selection revision；保存覆盖和 pending_next_run 意图共同准备 | 当前 Run 不变；下一 Run 只取实际已生效选择。MC 缺席不能宣称模型已经选择成功 |
