# 产品账号身份 v1

本候选坐标为 `(omne-harness-lite-design-2026-09-15, capability.account-identity, 1)`，状态为 candidate；无 catalog 登记、接受或发布，不可作为已采用契约。来源是 [PF-026.C1–C5](../../../../requirements/product/PF-026-account-journey-and-isolation/requirements.md)、已批准的[提案 A](../../../../proposals/account-identity/design.md)及其接受范围 [D-016](../../../../decisions/account-identity/decision.md)。

| 精确依赖坐标 | 消费条款 | 本契约的依赖关系 |
|---|---|---|
| `(omne-harness-lite-design-2026-09-15, data.core-work, 1)` | [CD-01、CD-02](../../../data/core-work/v1/contract.md) | 复用不复用 `UserRef` 与可信主体/目标的区分；同义沿用，不重定义共享形状。 |
| `(omne-harness-lite-design-2026-09-15, capability.tenant-governance, 1)` | [TG-01、TG-02](../../tenant-governance/v1/contract.md) | 个人租户及 owner 成员、唯一 claim 和组织目标的权威仍属 Tenant；本契约仅消费经核实的结果，待注册组合契约固定交接。 |

## 责任、身份与状态

**AI-01（账号事实）**：每个已准入注册操作分配唯一、不复用的 `UserRef`；它标识一个产品账号，不宣称现实人去重。同一现实人可以注册多个账号；不同 `UserRef` 不因同一 OS 用户、设备、登录名持有人或个人租户的物理存放位置而合并。凭据、认证 provider subject 与 `UserRef` 的映射由账号权威唯一裁决并持久保存；provider subject 不直接作为跨能力的 `UserRef`，映射变化不得悄然替换已发布身份。

**AI-02（注册状态）**：账号权威至少区分 `pending_personal_scope` 与 `active`，并保留注册操作身份、稳定 `UserRef`、固定个人租户目标及可核实的进展。`pending_personal_scope` 是已建账号而个人范围尚未核实 ready，不授予个人业务准入；仅为查询或继续原注册操作提供受限入口。`active` 只在 Tenant 权威证明**同一 `UserRef`、固定目标 tenant、个人租户种类、唯一有效 owner 成员及已可供正向准入消费的耐久结果**后产生。账号不能根据单方写入成功、暂时 `not_seen` 或客户端陈述进入 `active`。此处不定义跨 owner 发布协议；注册 composition 必须固定证明来源、原操作认回与宕机恢复。当前没有永久关闭账号/删除数据操作。

**AI-03（登录会话）**：账号权威拥有会话身份、绑定的唯一 `UserRef`、有效/过期/撤销状态及能跨进程和重启核验的权威依据。首版认证形式是账号密码加可撤销会话；具体账号标识符、密码重置、多端关系和期限尚未决定。会话身份本身不授予租户成员资格或资源权限。保护业务入口每次从可信凭据验证出当前有效、`active` 的 `UserRef`，随后由目标资源 owner 和 Tenant 等权威按资源作用域及明确目标 tenant 核验。退出当前登录态的成功屏障由 AI-06 规定。

## 性质与保护位置

| 性质 | 来源和成立时点 | 保护位置与前提 |
|---|---|---|
| 不同账号永不共享或复用 `UserRef`，同一注册操作重试不产生第二身份 | PF-026.C1/C3；分配和认回时 | 账号身份分配/持久操作索引；底层 provider 映射必须稳定。 |
| `active` 必须有同一账号的个人租户 ready 证明 | PF-026.C1/C5；激活提交及恢复读取时 | 账号激活守卫；Tenant TG-01 及待写的注册 composition 保证证明完整且可核实。 |
| 已过期/撤销或非当前有效的凭据不能为新交互授权 | PF-026.C2；每次保护业务准入时 | 会话验证与服务端撤销可见性；本地槽清除不能替代。 |
| 账号身份与目标租户成员资格分别核验，账号切换不继承前一账号的权限、设置、额度或缓存 | PF-026.C3/C4；资源读取/写入时 | 账号验证提供可信 `UserRef`；Tenant/资产/设置/预算各自保护归属。此性质的完整组合证据不属于单项账号能力。 |

## 操作与可观察结果

**AI-04（开始/认回注册）**：`beginRegistration(registrationOpId, evidence)` 先查询是否已有与该原操作绑定的注册事实；同键同摘要只认回原身份/进展，同键异摘要冲突，不因当前新注册入口后来关闭而重新裁决已绑定操作。新操作按首版自助注册政策准入：能使用该部署的请求者无需邀请或管理员代建，但仍须通过输入校验与明确的滥用防护；暂时无法核验请求或资格时报告不可用，不伪造成功。获准后账号权威以稳定操作 ID 与规范输入绑定一次 `UserRef`、固定个人租户目标和 `pending_personal_scope`；其他操作不能仅因现实持有人相同而合并。认证标识碰撞若在分配前可确定，拒绝且不建身份；若分配后才发现，保留原 pending 身份和可诊断冲突，不换 `UserRef` 或静默另建账号。冲突报告不得泄露别人的账号详情。提交回执未知时返回 `pending/unknown` 及原操作查询入口；暂时查不到结果不能证明从未提交或释放原目标。密码采集、输入等价规则、具体滥用防护和凭据恢复仍须设计；这些细节不能变相引入邀请门。

**AI-05（激活及注册查询）**：`confirmPersonalScope(registrationOpId, tenantProof)` 仅接受 Tenant/组合协调者的可信证明，逐项核对 AI-02 的绑定关系和可用水位；相同证明重试认回已激活结果，异目标或不完整证明拒绝且保持 pending。`registrationStatus(registrationOpId, authorizedEvidence)` 在权威已核实原操作绑定时可安全披露稳定身份、固定目标和 `pending_personal_scope | active`；尚不能确认原操作是否提交时只返回 `unknown` 与接续方式，不构造或泄露未核实的 `UserRef`/tenant target。查询的授权证据和内容裁剪由本能力绑定原操作，不因开放注册就允许按任意 operation ID 枚举账号。若 Tenant 结果 unknown，已确认的账号保持 pending 并由注册组合拥有核实/恢复责任；不能把 pending 伪称成功或用新 tenant 目标重试。注册成功仅在 `active` 可被再读核实时对用户确认。

**AI-06（登录、验证和退出）**：首版 `login(accountIdentifier, password)` 由采用的成熟 provider 验证账号密码；账号标识符是邮箱、用户名还是其它形式仍待选择，账号权威将结果映射至固定 `UserRef`，建立可核实、可撤销且有过期规则的登录会话；密码原文不得进入一般业务记录或跨能力持久数据。`active` 账号可在后续业务门复核后使用；`pending_personal_scope` 账号至多得到注册查询/恢复专用会话，不得以此准入个人或组织业务。失败、未决或过期凭据不产生可用会话。`validateSession(sessionCredential, operation)` 以当前权威状态返回 `valid{UserRef, sessionRef, allowedClass}` 或不可用于授权的结果；`allowedClass` 至少区分 `registration_only` 与 `business_eligible`，后者仍不含 Tenant 成员证明。

`logoutCurrent(sessionRef, logoutOpId, recoveryProofCommitment, authorizedCurrentSession)` 首次受理时验证调用者当前会话，把受信会话身份、稳定原操作 ID、输入摘要与认回证明承诺值原子绑定，然后只撤销这一登录态；重复同键同输入先核对承诺值并认回原结果，同键异输入冲突。客户端须在提交前生成并保存仅能查询**本次退出结果**的随机认回证明，服务端只持有其不可逆校验值；它和 `logoutOpId` 都不是业务授权凭据。会话撤销后，`logoutStatus(logoutOpId, recoveryProof)` 仅在证明与已绑定承诺值匹配时返回原撤销的已核实成功、未完成或 unknown；错误证明或异会话目标一律拒绝且不泄露原操作是否存在，若原操作尚不可核实则只返回 unknown，不要求已撤销会话重新取得业务授权，也不泄露账号资料。仅在**同一登录态对所有后续新保护交互不可再通过验证**时返回退出成功；从别的进程重放旧 token/cookie 也须拒绝。撤销提交或核实结果未知时返回 `pending/unknown`，本地 CLI 封闭该槽继续使用并保留原操作的状态查询，不得报告成功。若原操作是否受理仍不可核实，查询只给 unknown，不从会话恰好失效反推该次退出已成功。已撤销会话不会复活。其他独立会话是否也撤销尚待多端范围选择；已在途工作及其外部效果由各自 owner 结算，不由 logout 追溯撤销。

**AI-07（切换与重启）**：选中哪个本地账号或目标组织属于 CLI 装配的交互状态，不改变账号、会话、Tenant 或既有 Session 的历史身份。应用切换槽位时必须重新验证所选会话，并清除/重键此前账号的设置、偏好和缓存；不能以当前目录、OS 用户或同盘文件位置推导新账号资格。账号及会话权威记录在进程重启后提供与重启前相同的有效性、过期/撤销和注册状态判断；失去核实能力时拒绝业务准入，不能由进程内缓存推断有效。未来本地 skills/settings 的物理 locator 由资源 owner/装配设计，不在本契约指定。

## 交接、缺席与恢复

注册的账号建立与 Tenant 个人范围发布属于两个权威。账号分配后，[注册组合候选](../../../compositions/account-registration/v1/contract.md)负责以固定账号/目标推进 Tenant 并核实；在 Tenant 未 ready 时账号持续 pending，不能把账号删除当成撤销 Tenant 外部效果。回执丢失、重启、重复或并发注册必须从同一操作与两边权威记录认回；组合候选尚缺 Tenant 后续创建入口与真实恢复映射，不能宣称 PF-026.C1 全链已经闭合。

会话 provider/存储缺席、撤销状态不能核实或重启恢复未完成时，所有保护业务入口拒绝新准入；已报告 logout 成功的登录态在恢复后仍必须不可用。provider 的缓存 token/cookie 只有满足此屏障才可采用。CLI 槽、会话权威与业务资源的不同层次不允许相互代替。

## 规范表达、待选政策与版本

[规范场景](scenarios.md)给出正常、冲突、未知及重启反例。账号自身身份与会话状态需要故障/符合性证据；注册跨 owner 原子或恢复性质、账号+Tenant 资源准入及会话撤销对 CLI 的整体保证应由独立 composition 及必要的 TLA+ 模型表达，不能用本包单方场景声称已证明。实际覆盖记录见[版本外验证](../verification.md)。

产品已选择首版自助注册、账号密码与可撤销会话，退出只作用于当前登录态；密码重置/账号恢复、多端会话范围、期限和具体滥用防护仍未决定。提供者版本、凭据存储、CLI 通道、磁盘布局和 Cordis 服务键属于后续设计。此为新候选 v1，没有旧采用版本可自动升级，接受和发布须更新唯一 catalog、依赖及冻结记录。
