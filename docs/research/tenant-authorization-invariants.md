---
kind: research
id: R-tenant-authorization-invariants
scope: omne-next 租户、成员与工具授权的源码不变量、拒绝案例及最小运行基线消费差异
---

# 租户与授权不变量：旧系统源码核对

本页补充已有来源综述中的**实现证据与反例**，供[最小运行基线](../proposals/core-capabilities/implementation/runtime-baseline.md)
的真实身份 → Session → Agent → 工具 allow 链路消费。研究没有接受新政策、修改
规格或证明旧系统整体满足其要求；完整 HITL、模型、计费及分布式安全机制不在本次范围。

## 来源与证据读法

- 研究日期：2026-09-14。旧仓库为 `nemori-ai/omne-next`，固定提交
  `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，相对源码根 `omne_harness/`。
  正文来源均经 `git show <commit>:<path>` 或固定提交 `git grep` 读取；链接含同一
  提交和行号。未启动旧产品、运行旧测试、调用模型或外部服务，未读取本地秘密或用户数据。
- 当前对照快照：本项目 `ff2e7dd1a1e402c64a24bd721d961c650e25100e`。
  [catalog](../../spec/catalog.json) 登记 `capability.tenant-governance`、
  `capability.action-authorization` 和 `composition.core-work-coordination`
  的 current version 均为 **accepted v1**，接受依据为 [D-008](../decisions/D-008-core-capabilities.md)。
  [TG 提供者设计](../../packages/governance/tenant/design.md)与
  [AU 提供者设计](../../packages/governance/authorization/design.md)的已接受施工映射
  当时尚无目标产品实现；下面“已覆盖”均指契约/施工输入，不能读作产品已通过。
- **要求**表示源 Accepted requirement 所承诺；**源码**表示可从本次固定版本
  推导的行为；**测试源码**表示读到测试及断言，**本轮均未执行**。源 Draft 和
  设计注释只解释背景，源码注释不能单独证明边界成立。

资产类型、official/customized、ownership/entitlement/acquisition 的产品来源归
[资产与权限来源](tenant-asset-and-permission-sources.md)；管理员管理范围归
[管理操作来源](tenant-management-sources.md)；设置、定义级口径及系统 HITL/决策池
的接受历史归[治理与决策池来源](user-governance-and-decision-pool-sources.md)。
本页不重新登记那些要求，也不把旧 Python 类、数据库表或 BC 分工当成领域模型。

## 关键模型与租户规则

| 研究条目 | 语言无关规则、转移及拒绝案例 | 固定来源与实际边界 | 当前对应 |
|---|---|---|---|
| I1 身份与成员分开 | 自然人身份全局稳定；成员关系回答此人在一个租户中的资格。同一人加入两个组织不产生两个人，也不合并组织权限。对象 owner 与创建者、执行者分别解释 | **源码**：UserAccount 的永久 `user_id` 与 Tenant 的成员集、个人 owner 分开；[S01][s01]、[S02][s02]。账户可 suspended/revoked，deprecated 不可复活；SQL 对 tombstone 覆盖另有守卫 [S03][s03] | TG-01；可信 Principal 的认定仍归当前身份边界，提交 DTO 中的 user/tenant 不证明身份 |
| I2 个人与组织 | 个人空间只有该人的一个有效 owner，不可邀请第二人或改成组织；组织创建带第一位有效治理者，不能失去最后一人 | **要求**：[Q1][q1]、[Q2][q2]；**源码**：个人/组织工厂共同构造 Tenant 与初始成员，个人/平台邀请拒绝，类型修改拒绝 [S02][s02]、[S04][s04]。个人供给另有安装槽位的固定身份与补全流程 [S05][s05]，其保证窄于全局任意创建入口 | TG-01；本项目 personal/organization 与可信平台主体分开，不继承旧 platform 租户枚举 |
| I3 邀请与接受 | 邀请 pending 不授组织权限；指定用户持有效秘密明确接受后 active；已使用、过期、错误秘密或无待邀关系拒绝。移除/退出清除秘密并变 removed；新邀请需再次接受 | **源码**：`invite_member/accept_invite/remove_member` [S04][s04]；秘密仅存哈希和期限，验证采用恒时摘要比较 [S06][s06]；接受用户从认证 principal 派生 [S07][s07]。自愿退出与管理员移除共用转移，操作者/原因区分 [S08][s08]。重新邀请复用旧成员 ID，见差异 D2 | TG-01 已有 active/suspended/removed 与重新加入修订；完整邀请交互不是 TG v1 已定义操作，不能凭旧 pending 增加新正式状态 |
| I4 最后管理者与角色 | 最后 active owner 不能被移除、降级或主动退出；普通成员不得管理他人。组织管理权不授个人空间、私人 Session、设备或外部账号专属同意 | **要求**：源 owner/admin/member 的具体权限与私人边界 [Q2][q2]；**源码**：最后 owner 检查 [S09][s09]；人类 active owner/admin 管理入口检查 [S10][s10]。入口未兑现源要求中 admin 的细分限制，见 D1 | TG-01/02 采用 super_admin/member 及显式操作集合；AU-02/05 另外检查资源可授予上限 |
| I5 目标租户与可见性 | 选择租户是目标声明；当前 active 成员资格必须重新确认。无资格的显式组织选择失败，不能偷偷改用个人租户；既有 Session 不随菜单改归属 | **要求**：[Q1][q1]；**源码**：resolver 拒过期凭据、无 active 成员、空白 selector；缺省 selector 则解析个人租户；平台服务只能解析保留平台范围 [S11][s11]。成员读面先限制本人或受托节点，设置面只能返回认证人自己的 user id [S10][s10]。Tenant 状态校验缺口见 D3 | TG-02；读取 Session 正文、成员管理信息与设置是不同资格。租户管理员不能从管理读面取得成员正文 |
| I6 所有权、权益与使用权分开 | 一个资产 owner 不等于所有成员可执行任意动作；在甲组织有权不能拿去乙组织使用。获准跨租户定义引用不授源租户通用读取 | **源码**：资产校验要求 active 成员与目标 tenant 的 ownership 同时成立，缺任一返回同一拒绝 [S12][s12]。这一查询只覆盖所有权，不实现完整外部权益/选用；不能用其否定源已接受的权益要求。更完整产品含义沿已有资产来源综述 | TG-04/05；AU-05 仍核成员、定义版本、权益、绑定、资源权和硬约束。官方来源、已装载及帮助可见均不等于 allow |

I1–I6 是本页研究标签，不是新增契约编号。旧成员读 repository 按
`(tenant,user)` 查当前行、过滤 removed、保留 pending 状态；它不读取 Tenant
或账户状态 [S13][s13]。因此“当前成员读到了”只说明这个事实，不能扩张为所有
准入条件已核验。旧单机 Session 读测试有“同一 owner 无须选择 agent 即可读历史，
另一人列表为空、直接读事件拒绝”的断言 [T1][t1]；它没有覆盖同组织管理员读取
他人私人 Session，后一个边界仍主要由源要求和本项目 TG-02 支持。

## 授权事实、模式和系统 HITL 各自负责什么

| 事实或阶段 | 源码证据与拒绝案例 | 最小基线的消费判断 |
|---|---|---|
| 持久授权 | 旧规则保存受益/主体、动作模式、范围、来源、状态与撤销 epoch；默认范围 current_session；form 不可原地变化，已结束规则不能改成 active 规则 [S14][s14]。设备逐项同意还校验设备属于该用户且仍存活，范围冲突须先撤销，不能当幂等重试覆盖 [S15][s15] | AU-02 已规定 DefinitionRef、明确版本集、受益 tenant/主体、资源/环境范围与授予者当前上限。旧 `agent_id` 的字段名和 `(user,agent)` 分区不能代替这些身份与版本依据 |
| 明确拒绝与默认拒绝 | 结构化规则不匹配时弃权；匹配的 hard_floor/explicit_deny 否决，正向规则才 allow；全体无匹配规则时 deny。运行判定检查请求与快照 user/tenant/blueprint 一致、规则 epoch、组件/hash 和撤销水位 [S16][s16]、[S17][s17] | AU-03/05：未知声明、不能解析目标、定义/实现不符不构成免授权；硬拒绝不能升级为 ask。只继承拒绝原则，不复制旧七种 form 或 AI detector 作为本基线依赖 |
| 用户保存的设置 | 旧设备模式为 granular/open_all；当前 Session 明确选择优先于该用户/agent/device 的有效 standing，再落 granular；“未选择”和“显式 granular”不同 [S18][s18]、[S19][s19]。读取失败不由此实现吞掉并赋 open_all | AU-01 的每种设置有独立 scope、缺席与生效规则。不得把旧设备模式替换成本项目确认模式；设备全权仅是有效权限事实，仍受专属同意与硬约束限制 |
| 会话确认模式 | 本项目已接受 standard/confirm/unattended 四值判定矩阵，见 [AU v1](../../spec/capabilities/action-authorization/v1/contract.md) AU-04；旧上列设备模式及旧 runtime PEP 不提供这张矩阵的实现证据 | 有完整有效授权时 standard/unattended 可 allow，confirm 仍 ask（已有合法一次决定除外）；缺可申请授权时 standard/confirm ask、unattended deny；来源不明 unavailable。模式不会制造 grant |
| 系统发起 HITL | 源设计 UC-1 修订区分 Agent 主动 ask 与 harness 根据权限结果发起；一次决定不自动写持久 grant；暂行效果需独立的受控产物和全量撤销资格 [S20][s20]。旧工具 guard 在 `require_hitl` 时抛待审批结果，inner 不执行 [S21][s21] | AU-04/05 与当前 HD 拥有精确一次决定的消费；不能因 Agent 说“用户批准了”放行，也不能用“以后可撤销”跳过授权。本基线 HD 后置，ask 必须明确不可执行，不能伪造答复 |

旧 PEP 的 detector unavailable/越界规则会形成 `require_hitl`，而不是独立的
权限服务 unavailable [S17][s17]。这是有边界的旧行为，不能照搬成 AU 的
“任意缺证据都可以询问用户”。本项目只有**缺口可合法向特定主体申请**时才 ask，
无资源权、身份不符、来源失联等不能靠一次人类点头补齐。

## 撤权、并发、恢复与审计的实际保证范围

| 观察 | 源实现能支持的结论 | 不能据此声称 |
|---|---|---|
| Tenant 状态与事实原子提交 | SQL `save_all` 排序锁定、校验旧版本及最后 owner、条件写入，再在同一事务写成员/资产与 outbox；旧版本不覆盖赢家 [S22][s22]。成员变更只改变成员及事件，未级联删除私人对象 | 这不是管理 actor 资格与业务操作在同一门内重检的证明；入口授权读与随后 aggregate load 仍分开。CAS 保护已加载版本，无法发现授权读之后、aggregate load 之前发生的撤权 |
| 个人供给可恢复 | 安装 owner 槽位先持久化三个固定 ID，再在该槽位临界区补账户和个人 Tenant；缺失继续补、矛盾返回 repair_required、不会自动复活终态 [S05][s05] | 账户/Tenant 全部一步原子创建、所有创建入口全局幂等，或每个已有自然人在任意安装必有同一个个人空间。这个供给入口按 installation/slot 收敛 |
| grant 撤销耐久 | SQL 在一事务内保存 revoked、递增 scope floor、cursor revision 与 outbox；校验 authority term/stability，外 scope grant 视为不存在 [S23][s23]。设备 standing 的 revoked/invalidated 终态保留，重授新建事实 [S18][s18] | 原设备/外部动作已被停止或补偿；普通撤权的作用是封住后续准入，不消除已经发生的效果 |
| 编译快照与缓存失效 | 每次工具调用先检本地 fence；没有/不确定/过期水位要刷新，失败拒绝。默认 TTL 5 秒，epoch/term/cursor 不允许回退，已知撤销 hash 也检查 [S17][s17]、[S24][s24] | “每次调用读取了最新 grant/成员/模式”或“远端撤权即时到所有调用”。固定实现允许使用 TTL 内水位，本轮没有观测事件传递延迟或整体撤销时限 |
| 调用审计先于效果 | guard 的次序是 evaluate → await audit → 拒绝/待审批，或 inner invocation [S21][s21]。相关测试源码覆盖 deny/ask/审计失败执行零次、allow 审计后执行一次 [T2][t2] | 授权判定、日志、实际调用原子；审计 await 后没有同门重检。调用之后崩溃时恰好执行一次，也不是这个 wrapper 的保证 |
| 幂等因操作而异 | 重复相同角色为无事件 no-op；重复 accept/remove 会拒绝 [S04][s04]。同意按 active 四元组及范围/Session anchor 认回；冲突拒绝；revoke use case 可认回已 revoked，而底层 repository 重复 revoke 拒绝 [S15][s15]、[S23][s23] | 全部写入口都有稳定 operationId、丢回执统一认回、多项同意全有或全无。旧同意逐项 save，前面成功后后项失败可留下部分事实；丢失 invitation 明文也不能由重复 invite 原样取回 |

源 requirement 规定成员变化约束下一尚未通过的授权门，已开始底层调用不由成员
治理强停 [Q2][q2]。本项目 [CC v1](../../spec/compositions/core-work-coordination/v1/contract.md)
进一步明确：分配逻辑位置时共同核对当前资格；撤权封闭其后的逻辑位置，授权
增加等耐久后可用；受控效果等完整耐久前缀；无法确定是否发出的 attempt 标 unknown
且不自动重发。这些是**当前需要兑现的契约**，没有被旧 SQL/outbox 或 fence 测试抵扣。

## 当前差异与会影响实现的负例

| 差异 | 可定位反例／缺证据 | 当前处理依据及返工影响 |
|---|---|---|
| D1 角色要求与旧入口冲突 | 源要求只有 owner 能改角色，admin 不管理 admin/owner，邀请不能直接授 owner [Q2][q2]。旧 `change_role/remove_member/invite_member` 只过 owner/admin 通用门，直接把目标角色交给业务服务 [S07][s07]；测试甚至断言 admin 可以把成员改成 admin [T3][t3]。业务方法无 actor 资格检查 [S08][s08] | 继续消费 TG-01 与治理接口的显式操作集合。复制旧门会扩大权限；复制旧测试可能把越权固化为“验收通过”。该冲突是静态可构造路径，本轮未发请求验证 |
| D2 再加入的旧权依据 | removed 后重新邀请保留同一个 membership_id；对应测试明确要求保留 [S09][s09]、[T4][t4]。成员没有本项目 joinedRevision；租户整体 version 不能表达一次加入资格 | [治理接口](../proposals/core-capabilities/implementation/governance-interfaces.md)明确 joinedRevision 及 grant/entitlement 的成员依据。必须区分“同一自然人回来了”与“旧授权链仍合法”，避免恢复、缓存和审计返工 |
| D3 租户禁用与授权读取 | 源要求 suspended/revoked/terminal 租户不得新业务准入 [Q1][q1]。旧 resolver 和成员查询只检查凭据过期与 membership active，不读 Tenant 状态 [S11][s11]、[S13][s13]；`AssetAccessQueryService` 同样不读状态 [S12][s12]。旧 Member 枚举也没有 suspended [S25][s25] | TG-01/02 与当前身份/provider 准备和末门分别兑现。不能从这些函数推出“组织被停用后工具一定拒绝”；外围是否补齐尚未证实。成员禁用、租户禁用、账户禁用必须保持不同事实 |
| D4 旧授权身份不足 | 旧 grant revoke authority 按 `(user_id,agent_id)` 分区，runtime fence 额外按 tenant 分区并把同 user/blueprint 撤销广播到已驻留 tenant binding [S23][s23]、[S24][s24]。旧 PermissionGrant 本体未表达本项目 DefinitionRef 的明确版本集合 [S14][s14] | AU-02 与已接受治理接口要求 tenant、受益主体、definition、版本集合及 grantorBasis。重建 Agent、换版本、fork 必须分别判断；不能用旧 aggregate_version 当定义版本授权 |
| D5 模式和不确定性不同 | granular/open_all 是设备权限选择；旧 detector 不可用可转 require_hitl [S17][s17]、[S19][s19]。它不证明本项目三种确认模式或四值求值已存在 | 按 AU-01/04/05。当前 allow 基线需要真实管理入口建立 grant；HD 后置不允许以 open_all 或临时“默认安全”绕过实际判定 |
| D6 TOCTOU 与旧缓存 | 角色门读完 → 撤角色 → 业务服务重新 load 最新 Tenant → 写成功，CAS 可能仍通过；PEP allow → await audit → 撤权 → inner 调用，也没有该 wrapper 内的最后重检 [S07][s07]、[S08][s08]、[S21][s21]、[S22][s22] | AU-06、CC-02–04 的同门检查/撤权次序已覆盖此问题。provider 必须真实实现 stamp/来源代次/当前资格，TTL 和旧 allow 结果都不是可复用执行许可 |
| D7 管理可见不等于正文可见 | 成员读本人/受托节点、设置读本人有源码证据 [S10][s10]，另一自然人的 Session 拒绝有测试源码 [T1][t1]；没有因此证明“同组织超级管理员也不能读他人正文”的完整旧装配路径 | TG-02、AU-05 与两份 provider design 已要求管理权、正文权、设置权、资源权分别核验。当前测试必须用真实不同主体，不能只换 tenant 字段 |
| D8 创建与重试保证不可扩大 | 源组织创建要求同一逻辑重试不重复 [Q2][q2]；旧一般创建路径缺 tenant_id 时每次重新 mint，未见 operation key 去重 [S26][s26]。个人槽位供给另有收敛机制，不能替它证明一般入口 | 当前治理接口的 create 操作归一、分配 ID 不进入原输入及 lookup 原操作结果已有施工规定。测试重复创建/撤销必须命中同一操作，不能只测重复保存同一对象 |

上述差异不要求本次增加邀请 UI、平台租户、完整关闭或 HD 实现；它们帮助消费方
选择正确负例和避免把旧实现的假设带进已接受契约。资产全生命周期的后置范围
继续由最小运行基线和 TG provider design 控制，不由本研究扩大。

## 已读测试与仍未知之处

| 测试源码 | 实际断言范围；本轮运行状态 |
|---|---|
| [T1][t1] `test_owner_reads_sessions_and_evidence_without_agent_selection_and_bola_holds` | 私有 State provider 的 Session 列表/事件读取与另一自然人拒绝；未运行，不证明同组织管理员边界 |
| [T2][t2] `test_deny_executes_inner_zero_times` 等 | 包装工具的 deny/require_hitl/不可用/审计失败与 allow 顺序；使用测试工具、审计或 ledger 替身，未运行 |
| [T3][t3] `test_admin_changes_a_members_role` | 路由+录制 command 替身接受 admin 改角色；这是源要求冲突的测试证据，未运行 |
| [T4][t4] `test_reinvite_after_removal_reactivates_single_row` 等 | 重新邀请保留成员 ID 并可重新接受；未运行 |
| [T5][t5] `test_concurrent_last_owner_removal_is_serialised` | PostgreSQL 并发删除两个 owner，至少一名 active owner 存在；未运行 |
| [T6][t6] `test_stale_base_save_is_rejected_with_no_ghost_outbox_event` 等 | 旧版本拒绝、两连接并发一胜一负、outbox 与结果一致、重载后重试；未运行 |
| [T7][t7] `test_revoke_writes_status_floor_and_cursor_atomically`、[T8][t8] rollback 案例 | 检查 revoke 状态/epoch/cursor，复用 cursor 主键制造事务失败；未运行。rollback 这条测试未单独断言全部审计字段 |
| [T9][t9] `test_deny_first_and_empty_deny` 等 | 空权限默认拒绝、旧 epoch/hash、失联刷新失败与恢复；可控时钟/reader，未运行，不测真实撤权传播时延 |
| [T10][t10] standing restart 两案例 | 换一份 storage 实例访问同一 PostgreSQL，standing 保留、撤销不复活；未运行，不等于完整宿主崩溃恢复 |

仍未知：旧所有公开写入口是否统一补齐 Tenant/账户状态、角色细分及资源上限；
旧邀请目标是否已在每条外部入口证明为有效 UserAccount；已结束账户和成员的
全部授权级联能否可靠完成；旧系统端到端是否实现定义换版/fork/重建的精确授权
隔离；设备模式是否覆盖所有真实执行路径；审批答复和执行之间的唯一消费/撤权
次序。以上不能从已读局部函数和测试名字推出，也不需要本次扩大为全安全审计。

本轮没有依赖“默认节点可信”“管理员天然有正文权”或“缓存足够新”的假设。
已知事实、静态反例和未证实的外围保障在上文分别标记。消费本页时仍以当前
TG/AU/CC 的精确版本及 provider design 为权威，产品实际实现与验证沿
[交付对账](../proposals/core-capabilities/implementation/delivery.md)认定。

## 来源索引

所有 S/T/Q 链接固定同一旧提交；路径根为 `omne_harness/`。链接行段覆盖正文
点名的函数/断言，可用 `git show 6263fed545e48ad9efb5714f3fe76a7c1a0af1b5:<path>`
复核。S 表源码（S20 是设计材料），T 表未执行测试源码，Q 表源要求。

下表路径缩写仅用于查找：`Tenant/` 为 `libs/omne_harness_tenant/omne_harness_tenant/`，
`TenantEdge/` 为 `libs/omne_harness_tenant_web_server/omne_harness_tenant_web_server/`，
`Blueprint/` 为 `libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/`，
`Runtime/` 为 `libs/omne_harness_runtime_plane/omne_harness_runtime_plane/`。

| 来源 | 文件、符号与关键行 |
|---|---|
| [S01][s01] | `Tenant/domain/user_account.py`：UserAccount，33–113 |
| [S02][s02] | `Tenant/domain/tenant.py`：Membership、Tenant、create_personal/create_organization，53–165 |
| [S03][s03] | `Tenant/persistence/repositories/sql.py`：SqlUserAccountRepository.save、_assert_tombstone_not_overwritten，648–724 |
| [S04][s04] | `Tenant/domain/tenant.py`：invite_member 169、accept_invite 215、remove_member 245、change_role 275、change_status 310、change_type 353 |
| [S05][s05] | `Tenant/application/services/personal_tenant_provisioning.py`：provision、_converge、_complete_missing、_conflict_reason，79–228 |
| [S06][s06] | `Tenant/domain/services/invite_token_policy.py`：issue 37、verify 58；到期比较 71 |
| [S07][s07] | `TenantEdge/api/routers/membership_router.py`：invite_member 567、accept_invite 641、change_role 690、remove_member 741、leave_tenant 795 |
| [S08][s08] | `Tenant/application/services/membership.py`：MembershipUseCase 写入口及 _persist_and_project，149–280 |
| [S09][s09] | `Tenant/domain/tenant.py`：_guard_last_owner 454、_upsert_pending_membership 470、_find_membership 500 |
| [S10][s10] | `TenantEdge/authz.py`：enforce_membership_read_access 105、enforce_tenant_admin_access 191、enforce_tenant_membership 250、enforce_user_settings_access 299 |
| [S11][s11] | `Tenant/application/services/active_tenant_resolution.py`：resolve、_resolve_human、_resolve_platform_service，71–155 |
| [S12][s12] | `Tenant/application/services/asset_access_query.py`：AssetAccessQueryService.verify，31–49 |
| [S13][s13] | `Tenant/persistence/repositories/sql.py`：get_membership、list_memberships、resolve_personal_tenant_id，921–992 |
| [S14][s14] | `Blueprint/domain/aggregates.py`：PermissionGrant 状态表 620、字段 645、create_rule 684、change_rule 759、set_form 796 |
| [S15][s15] | `Blueprint/application/services/host_consent.py`：issue_host_consent 166、_place_operation 223、_guard_anchor_compatibility 278、revoke_host_consent 340 |
| [S16][s16] | `Blueprint/domain/services/permission_evaluator.py`：StructuredEvaluator.evaluate，85–101 |
| [S17][s17] | `Runtime/application/policy/evaluator.py`：evaluate 91、_preflight_refusal 128、_evaluate_rule 186、_evaluate_unstructured 235 |
| [S18][s18] | `Blueprint/domain/permission_mode.py`：standing 状态表 38、establish/revoke/invalidate 90–167、SessionPermissionContext 170–229 |
| [S19][s19] | `Blueprint/application/services/permission_mode.py`：_establish_standing 181、EffectivePermissionModeQueryService.effective_mode 252–293 |
| [S20][s20] | `design_docs/cross-cutting/hitl-design.md`：UC-1 发起者修订 129–139、一次决定不写 grant 150 |
| [S21][s21] | `Runtime/application/policy/guarded_tool.py`：InvocationPolicyGuardedTool._arun 132–156、guard 175–185 |
| [S22][s22] | `Tenant/persistence/repositories/sql.py`：SqlTenantRepository.save_all，222–275 |
| [S23][s23] | `Blueprint/persistence/repositories/sql.py`：revoke，938–1046；事务实际写入 991–1046 |
| [S24][s24] | `Runtime/application/policy/fence.py`：默认 TTL 37、observe_authority_snapshot 70、admit 108、requires_refresh 177、advance_known_blueprint_floor 185 |
| [S25][s25] | `Tenant/domain/enums.py`：TenantStatus、AccountStatus、MembershipStatus、Role，31–91 |
| [S26][s26] | `Tenant/application/services/tenant_lifecycle.py`：创建 75–76、_build_tenant 105–123、_persist_and_project 125–138 |

[q1]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-personal-tenant-provisioning-and-active-tenant-selection.md#L28-L110
[q2]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/tenant-organization-tenant-and-membership-lifecycle.md#L31-L189
[s01]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/domain/user_account.py#L33-L113
[s02]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/domain/tenant.py#L53-L165
[s03]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/persistence/repositories/sql.py#L648-L724
[s04]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/domain/tenant.py#L169-L362
[s05]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/application/services/personal_tenant_provisioning.py#L79-L228
[s06]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/domain/services/invite_token_policy.py#L20-L72
[s07]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant_web_server/omne_harness_tenant_web_server/api/routers/membership_router.py#L567-L805
[s08]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/application/services/membership.py#L149-L280
[s09]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/domain/tenant.py#L454-L512
[s10]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant_web_server/omne_harness_tenant_web_server/authz.py#L105-L351
[s11]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/application/services/active_tenant_resolution.py#L71-L155
[s12]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/application/services/asset_access_query.py#L19-L49
[s13]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/persistence/repositories/sql.py#L921-L992
[s14]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/domain/aggregates.py#L620-L840
[s15]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/application/services/host_consent.py#L166-L365
[s16]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/domain/services/permission_evaluator.py#L73-L101
[s17]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_runtime_plane/omne_harness_runtime_plane/application/policy/evaluator.py#L65-L255
[s18]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/domain/permission_mode.py#L38-L229
[s19]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/application/services/permission_mode.py#L181-L293
[s20]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/design_docs/cross-cutting/hitl-design.md#L125-L150
[s21]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_runtime_plane/omne_harness_runtime_plane/application/policy/guarded_tool.py#L128-L185
[s22]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/persistence/repositories/sql.py#L179-L275
[s23]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/omne_harness_agent_blueprint/persistence/repositories/sql.py#L938-L1046
[s24]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_runtime_plane/omne_harness_runtime_plane/application/policy/fence.py#L34-L211
[s25]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/domain/enums.py#L31-L91
[s26]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/omne_harness_tenant/application/services/tenant_lifecycle.py#L61-L138
[t1]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/tests/integration/single_node/test_single_node_owner_tenant_scoped_reads.py#L134-L192
[t2]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_runtime_plane/tests/unit/application/test_invocation_policy_guarded_tool.py#L220-L305
[t3]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant_web_server/tests/unit/test_membership_write_router.py#L247-L274
[t4]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/tests/unit/test_tenant_aggregate.py#L154-L197
[t5]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/tests/integration/test_tenant_persistence_postgres.py#L201-L235
[t6]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_tenant/tests/integration/test_tenant_version_cas_postgres.py#L102-L187
[t7]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/tests/integration/test_agent_blueprint_persistence_postgres.py#L217-L269
[t8]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/tests/integration/test_agent_blueprint_persistence_postgres.py#L512-L531
[t9]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_runtime_plane/tests/unit/application/test_runtime_invocation_pep.py#L311-L418
[t10]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/libs/omne_harness_agent_blueprint/tests/integration/test_permission_mode_postgres.py#L63-L97
