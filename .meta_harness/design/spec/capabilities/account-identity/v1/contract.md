# 产品账号身份 v1

本候选坐标为 `(omne-harness-lite-design-2026-09-15, capability.account-identity, 1)`，状态为 candidate；无 catalog 登记、接受或发布，不可作为已采用契约。来源是 [PF-026.C1–C5](../../../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、已批准的[提案 A](../../../../proposals/account-identity/design.md)及其接受范围 [D-016](../../../../decisions/account-identity/decision.md)。

| 精确依赖坐标 | 消费条款 | 本契约的依赖关系 |
|---|---|---|
| `(omne-harness-lite-design-2026-09-15, data.core-work, 1)` | [CD-01、CD-02](../../../data/core-work/v1/contract.md) | 复用不复用 `UserRef` 与可信主体/目标的区分；同义沿用，不重定义共享形状。 |
| `(omne-harness-lite-design-2026-09-15, data.agent-runtime-identity, 1)` | [ARI-1、ARI-2](../../../data/agent-runtime-identity/v1/contract.md) | F 的 `sourceRef`/`targetTenantId` 使用 `OpaqueId`；Account 在此共享类型内限定本版可编码子域。 |
| `(omne-harness-lite-design-2026-09-15, capability.tenant-governance, 1)` | [TG-01、TG-02](../../tenant-governance/v1/contract.md) | 个人租户及 owner 成员的权威仍属 Tenant；本契约仅消费经核实的结果，注册组合固定接续。 |

## 责任、身份与状态

**AI-01（账号事实）**：每个已接纳 init 或注册原操作分配唯一、不复用的 `UserRef`；它标识一个产品账号，不宣称现实人去重。同一现实人可以注册多个账号；不同 `UserRef` 不因同一 OS 用户、设备、登录名持有人或个人租户的物理存放位置而合并。凭据、认证 provider subject 与 `UserRef` 的映射由账号权威唯一裁决并持久保存；provider subject 不直接作为跨能力的 `UserRef`，映射变化不得悄然替换已发布身份。

**AI-02（注册状态）**：账号权威至少区分 `pending_personal_scope` 与 `active`，并保留 init/注册原操作身份、稳定 `UserRef`、固定个人租户目标及可核实的进展。`pending_personal_scope` 是已建账号而个人范围尚未核实 ready，不授予个人业务准入；仅为查询或继续原注册操作提供受限入口。`active` 只在 Tenant 权威证明**同一 `UserRef`、固定目标 tenant、个人租户种类、唯一有效 owner 成员及已可供正向准入消费的耐久结果**后产生。账号不能根据单方写入成功、暂时 `not_seen` 或客户端陈述进入 `active`。此处不定义跨 owner 发布协议；注册 composition 必须固定证明来源、原操作认回与宕机恢复。当前没有永久关闭账号/删除数据操作。

**AI-02a（个人创建来源事实 F）**：`pending_personal_scope` 身份分配和授权 Tenant 创建个人租户是两件事。Account 首次耐久接纳内部原操作 A、规范请求摘要 `digestA` 与规范凭据标识时，先固定唯一不复用的 `UserRef`、稳定且全局不复用的 `sourceRef`、TG-01 personal target 和入口种类。Account 为本版生成的 `UserRef.userId` 与 `sourceRef` 限定为非空 ASCII `[A-Za-z0-9_-]+`；它们仍分别符合共享 `UserRef`/`OpaqueId`，使 TG-01 UTF-8 注入映射的定义域由 [F Schema](schema.json#/$defs/PersonalCreationSourceFact) 直接保证。A、`digestA`、规范标识及 A→F 映射只由 Account 持有。同 A 同输入认回，异输入冲突。

Account 用**已耐久固定的同一 A** 调用认证 adapter 的 `bindCredential(A, normalizedIdentifier, credentialEvidence)`。adapter 必须原子地裁决该规范标识的唯一绑定和稳定 provider subject；同 A 同输入重复调用认回同一 subject，异输入或该标识已绑定别的 A 给确定冲突，不产生第二 subject。`credentialBindingStatus(A)` 在权威恢复后返回 `bound{normalizedIdentifier,subject}`、确定 `conflict`、已证明原写入未发生的 `not_seen`，或 `unknown`；暂时查不到、旧写入结果未核实不得报已证明的 `not_seen`。Account 只有核实 `bound` 与已固定 A/规范标识一致，并耐久保存 A↔provider subject↔UserRef 映射后，才发行不可变 F，恰含 `{sourceRef,version:"1",entryKind:"deployment_init"|"account_registration",userRef,targetTenantId}`。崩溃恰在 provider bound 与 Account 映射提交之间时，恢复以同 A 查询并补全原映射；`unknown` 保持原 pending，已证明 `not_seen` 只允许同 A/同输入重试，缺少原秘密时等待获准请求者重呈而不持久保存密码。任何状态都不换 UserRef、sourceRef、target 或 A。若所选 provider/adapter 无法兑现原子唯一绑定、同键查询与此恢复语义，则不符合本契约。

较早的 pending、凭据提交 unknown、确定标识冲突均不能发行 F。F 不含密码、verifier、可离线猜测摘要、init seed、A 或 `digestA`；相同 `sourceRef` 永远只能返回同一内容，sourceRef 不得重分配。F 只授权该 `UserRef`/target 的一次创建，不授业务访问。关闭注册入口、logout、active 转移或 provider 换代不撤销已发行 F。未来若加入取消，须另定与 Tenant 准入的先后及旧 F 效力。

**AI-03（登录会话）**：账号权威拥有会话身份、绑定的唯一 `UserRef`、有效/过期/撤销状态及能跨进程和重启核验的权威依据。首版认证形式是账号密码加可撤销会话；登录标识的生产政策、密码重置、多端关系和期限尚未决定。会话身份本身不授予租户成员资格或资源权限。保护业务入口每次从可信凭据验证出当前有效、`active` 的 `UserRef`，随后由目标资源 owner 和 Tenant 等权威按资源作用域及明确目标 tenant 核验。退出当前登录态的成功屏障由 AI-06 规定。

## 性质与保护位置

| 性质 | 来源和成立时点 | 保护位置与前提 |
|---|---|---|
| 不同账号永不共享或复用 `UserRef`，同一注册操作重试不产生第二身份 | PF-026.C1/C3；分配和认回时 | 账号身份分配/持久操作索引；底层 provider 映射必须稳定。 |
| `active` 必须有同一账号的个人租户 ready 证明 | PF-026.C1/C5；激活提交及恢复读取时 | 账号激活守卫；Tenant TG-01 及待写的注册 composition 保证证明完整且可核实。 |
| 已过期/撤销或非当前有效的凭据不能为新交互授权 | PF-026.C2；每次保护业务准入时 | 会话验证与服务端撤销可见性；本地槽清除不能替代。 |
| 账号身份与目标租户成员资格分别核验，账号切换不继承前一账号的权限、设置、额度或缓存 | PF-026.C3/C4；资源读取/写入时 | 账号验证提供可信 `UserRef`；Tenant/资产/设置/预算各自保护归属。此性质的完整组合证据不属于单项账号能力。 |

## 操作与可观察结果

**AI-04（开始/认回注册）**：`beginRegistration(registrationOpId, evidence)` 先按 A 查询已接纳的原操作；同键同 `digestA` 认回原身份与进展，同键异输入冲突。新 signup 仅在初始账号 active、部署已建立时开放；能使用部署的请求者无需邀请，但须通过输入校验与滥用防护。Account 在调用认证 adapter 前按 AI-02a 耐久固定 A、规范标识、UserRef、sourceRef、target 和 pending；不能先让 provider 创建无法按 A 认回的 subject。若标识在 Account 已核实的准入前态就冲突，可直接拒绝而不分配身份；若 A 已接纳后 adapter 权威确认标识归别的 A，Account 耐久记录终局 `rejected_credential_conflict`，保留 A/UserRef/sourceRef 的不复用墓碑，不发行 F 或创建 Tenant，重复 A 只认回此结果，不泄露别人的账号详情。provider 结果 `unknown` 时保持 pending，查询同 A，不把暂时 `not_seen` 当终局冲突或未写证明。密码采集、生产标识政策、滥用防护和凭据恢复仍须设计，不得变相引入邀请门。

Tenant 只能经当前受信本地 Account 服务按 `sourceRef` 读取完整 F。已接纳 A 但凭据尚未 `bound`，只给受限查询/恢复；Account 暂时缺席时创建保持 pending。已发行 F 在恢复后必须可枚举、可认回，供 ACR-06 接续。相同 ref 内容变化、映射损坏或凭据绑定无法核实时封闭读取并报错。

**AI-05（激活及账号建立查询）**：`confirmPersonalScope(accountCreationOpId, tenantProof)` 仅接受 Tenant/组合协调者的可信证明，逐项核对 AI-02 的绑定关系和本代可消费水位；相同证明认回已激活结果，异来源、异目标或不完整证明拒绝。`accountCreationStatus(accountCreationOpId, authorizedEvidence)` 明确区分 `unknown`、`pending_personal_scope`、`rejected_credential_conflict`、`blocked_personal_target_conflict` 与 `active`。前两者分别表示原 A 尚不能权威核实、或已接纳但仍在查询/推进；两个确定冲突分别表示原 A 已被凭据权威终局拒绝、或 F 已发行但另一 T 已耐久占有该 UserRef 的目标流，均不可自动推进或报告成功；`active` 只表示同绑定个人范围已可消费且账号转移耐久。`blocked_personal_target_conflict` 由 Account 在核实 Tenant 对原 T 的终局 `personal_target_conflict` 后耐久记录，保留 F、A 和已占用的 UserRef/sourceRef；首版不换目标或自动取消。Account 暂缺席时组合保留该终局交接责任，恢复后补记并可查询原阻断原因。同 A 重试认回同一确定结果。查询只向持原操作授权证据的主体裁剪披露，不按任意 operation ID 枚举账号；无法确认原 A 是否提交时只给 `unknown`，不构造未核实的 UserRef/target。Tenant `unknown` 不可误报确定冲突；init/signup 成功仅在 active 可再读时确认。

**AI-06（登录、验证和退出）**：`login(accountIdentifier, password)` 由采用的成熟 provider 验证凭据；注册和登录必须使用同一明确的标识规范化与等价规则，同一规范标识在其声明的命名范围内唯一，不能由不同别名映射到两个可混淆的账号。早期本地开发可以用用户名实现该参数，但不将其提升为正式生产版标识政策；账号权威将结果映射至固定 `UserRef`，建立可核实、可撤销且有过期规则的登录会话；密码原文不得进入一般业务记录或跨能力持久数据。`active` 账号可在后续业务门复核后使用；`pending_personal_scope` 账号至多得到注册查询/恢复专用会话，不得以此准入个人或组织业务。失败、未决或过期凭据不产生可用会话。`validateSession(sessionCredential, operation)` 以当前权威状态返回 `valid{UserRef, sessionRef, allowedClass}` 或不可用于授权的结果；`allowedClass` 至少区分 `registration_only` 与 `business_eligible`，后者仍不含 Tenant 成员证明。

`logoutCurrent(sessionRef, logoutOpId, recoveryProofCommitment, authorizedCurrentSession)` 首次受理时验证调用者当前会话，把受信会话身份、稳定原操作 ID、输入摘要与认回证明承诺值原子绑定，然后只撤销这一登录态；重复同键同输入先核对承诺值并认回原结果，同键异输入冲突。客户端须在提交前生成并保存仅能查询**本次退出结果**的随机认回证明，服务端只持有其不可逆校验值；它和 `logoutOpId` 都不是业务授权凭据。会话撤销后，`logoutStatus(logoutOpId, recoveryProof)` 仅在证明与已绑定承诺值匹配时返回原撤销的已核实成功、未完成或 unknown；错误证明或异会话目标一律拒绝且不泄露原操作是否存在，若原操作尚不可核实则只返回 unknown，不要求已撤销会话重新取得业务授权，也不泄露账号资料。仅在**同一登录态对所有后续新保护交互不可再通过验证**时返回退出成功；从别的进程重放旧 token/cookie 也须拒绝。撤销提交或核实结果未知时返回 `pending/unknown`，本地 CLI 封闭该槽继续使用并保留原操作的状态查询，不得报告成功。若原操作是否受理仍不可核实，查询只给 unknown，不从会话恰好失效反推该次退出已成功。已撤销会话不会复活。其他独立会话是否也撤销尚待多端范围选择；已在途工作及其外部效果由各自 owner 结算，不由 logout 追溯撤销。

**AI-07（切换与重启）**：选中哪个本地账号或目标组织属于 CLI 装配的交互状态，不改变账号、会话、Tenant 或既有 Session 的历史身份。应用切换槽位时必须重新验证所选会话，并清除/重键此前账号的设置、偏好和缓存；不能以当前目录、OS 用户或同盘文件位置推导新账号资格。账号及会话权威记录在进程重启后提供与重启前相同的有效性、过期/撤销和注册状态判断；失去核实能力时拒绝业务准入，不能由进程内缓存推断有效。未来本地 skills/settings 的物理 locator 由资源 owner/装配设计，不在本契约指定。

**AI-08（部署初始账号）**：部署 `init` 是受信本地操作。Account 只在其权威根已核实没有可推进的 pending/active/F、没有另一非终局 init 原操作，且调用者持有本代独占初始化资格时，才能以 A 占用一次性首账号位置；历史 `rejected_credential_conflict` 墓碑仍须保留以防 UserRef/sourceRef 重用。同 A 同输入先认回。已耐久接纳的 pending init 不因暂时凭据故障或 Tenant 缺席自动释放；只有独占恢复权威证明 A 未提交，或 Account 已将原 A 记录为 `rejected_credential_conflict` 且确认它未发行 F、未留下可推进的凭据绑定，才可由**新的**受信 init A 争首次位置；旧 A 的 UserRef/sourceRef 永不复用。`UserRef` 与 sourceRef 由 Account 分配，target 依 TG-01 从 UserRef 确定；seed 只用于 Account 的受信准入，不进入 F，也不能供 Tenant 自造身份。唯一凭据绑定确认后发行与普通注册同形状、`entryKind=deployment_init` 的 F。Account 可先于 Tenant 保存 pending/F；只有初始账号 active 且部署建立可核实后才开放后续自助 signup。Tenant 未完成前不可声明 init 成功或业务可用。文件缺失、坏前缀、根未发布及恢复未完成都不是已核实空根。

## 交接、缺席与恢复

init/signup 的账号建立与 Tenant 个人范围发布属于两个权威。[注册组合候选](../../../compositions/account-registration/v1/contract.md)沿 Account 可枚举 pending/F 和 Tenant T 结果继续，不另建耐久交付意图。Tenant 未 ready 时账号保持 pending。回执丢失、重启、重复或并发请求须从 Account A/F 与 Tenant T 的权威记录认回。

会话 provider/存储缺席、撤销状态不能核实或重启恢复未完成时，所有保护业务入口拒绝新准入；已报告 logout 成功的登录态在恢复后仍必须不可用。provider 的缓存 token/cookie 只有满足此屏障才可采用。CLI 槽、会话权威与业务资源的不同层次不允许相互代替。

## 规范表达、待选政策与版本

[规范场景](scenarios.md)给出正常、冲突、未知及重启反例。账号自身身份与会话状态需要故障/符合性证据；注册跨 owner 原子或恢复性质、账号+Tenant 资源准入及会话撤销对 CLI 的整体保证应由独立 composition 及必要的 TLA+ 模型表达，不能用本包单方场景声称已证明。实际覆盖记录见[版本外验证](../verification.md)。

产品已选择首版自助注册、账号密码与可撤销会话，退出只作用于当前登录态；早期本地开发暂用用户名不构成正式生产标识选择。正式生产版标识政策、密码重置/账号恢复、多端会话范围、期限和具体滥用防护仍未决定。提供者版本、凭据存储、CLI 通道、磁盘布局和 Cordis 服务键属于后续设计。此为新候选 v1，没有旧采用版本可自动升级，接受和发布须更新唯一 catalog、依赖及冻结记录。
