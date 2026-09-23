# PF-001 身份、范围与对 Agent 的约束 · 设计投影 v2

> **v2 相对 v1 改了什么**（v1 保留不改，正在照它实施的人可以对照）：入口层有了契约与节点——Q-16 闭合，第 8 节第 3 步的入口层部分改指 [PF-017 投影 v1](../../../PF-017-governance-center-as-deployable-application/projection/v1/projection.md)；
> 账号能力有了 v2（出示物与 LoginStateId 分离），本投影的 `ai` 坐标仍指 v1——注册组合与治理契约钉的是 v1，入口层那一侧按 PF-017 投影读 v2；
> Q-14 Cordis 版本、Q-15 领域名已由 D-025／D-024 闭合；第 5.5 节装配草图的入口层一行改为已建节点；D-027 的断电边界按 PF-017 rev 2 读法补进第 3 节前提。需求修订不变（PF-001 rev 15）。

- 对应需求：[PF-001](../../README.md) 全部条款里**租户相关领域**这一片——账号、登录状态、组织与隶属、成员关系与角色、两种邀约、租户身份与隔离义务、作用域层里组织级与租户级的身份。**不含**设置／权限／资产的求值与持有（PF-002）、资产流转（PF-003）、会话（PF-015）、成本计量（无 topic）。另取 [PF-003 §6.14](../../../PF-003-asset-transfer-and-sharing/design.md#614-待确认的复制通知与分享邀请会过期) 一句作邀约过期的第二消费者依据
- 本版依据的需求修订：**PF-001 rev 15**（`README.md` front-matter），PF-003 rev 4
- 状态：**当前，已接受为实施入口**——五份契约与六节点依据 [D-023](../../../../record/decisions/tenant-domain-design-acceptance/README.md)（产品负责人，2026-09-22），入口层与账号能力 v2 依据 [D-028](../../../../record/decisions/governance-center-design-acceptance/README.md)（2026-09-23）。契约来源 `accepted`、已冻结（[provenance.json](provenance.json) 里契约的 sha256 即 `frozen.json` 登记值）；需求与节点来源不在冻结集合，实施前先核那些坐标
- 未决 gap 数：**15**（见[第 7 节](#7-未决项)；Q-14、Q-15、Q-16 已闭合，条目保留并标注）

**读法**：第 1～4 节回答「必须为真的是什么」，来源是契约；第 5～6 节回答「用哪些原语兑现、有什么证据」，来源是六个 provider 节点。
条款坐标缩写：`ai` = `capability.account-identity/v1`，`og` = `capability.organization-governance/v1`，`ar` = `composition.account-registration/v1`，`iv` = `data.identity-values/v1`，`oe` = `data.offer-expiry/v1`；每个坐标第一次出现时带链接，此后同一节内只写缩写。

## 1. 本版覆盖的需求条款

确认状态取自 PF-001 [decisions](../../decisions.md)：rev 10 把此前九条「正文转述」全部补上来路（[changelog rev 10 §三](../../changelog.md#rev-10--并发移除超管有了收场当前租户身份在创建那一刻被捕获--2026-09-22)），本表因此**没有「继承待核对」**。

### 1.1 账号那一侧

| 条款 | 要求 | 确认状态 | 本版是否落地 |
|---|---|---|---|
| [design §4 账号](../../design.md#账号) | 账号只承担标识、鉴权、聚合；不持任何范围化对象 | 已确认 | 是：`ai#S-1`、`#S-12`；聚合走 `og#S-27` |
| 同上、[§7](../../design.md#七取舍) | 登录标识部署内唯一，注册时定、本版不可改 | 已确认（rev 11） | 是：`ai#S-6`、`#S-19` |
| [flows §1.1](../../flows.md#11-注册)、[§3.1](../../flows.md#31-账号) | 注册三步、提交点在激活；未激活账号不能用于任何交互 | 已确认 | 是：`ar#S-8`、`#S-10`；`ai#S-21` |
| [flows §2](../../flows.md#二分支与异常)、[acceptance §三](../../acceptance.md#三判据) | 三种登录失败反馈完全一致 | 已确认（rev 10） | 是：`ai#S-15`、`#S-22` |
| [design §4 账号](../../design.md#账号) | 凭据不以可读形式保存；本版无任何凭据写路径 | 已确认（rev 12） | 是：`ai#S-8`、`#S-3` |
| [flows §1.3](../../flows.md#13-退出)、[§3.2](../../flows.md#32-登录状态) | 退出只及被指定的那一个；失效不可逆；重启后仍成立 | 已确认（rev 10） | 是：`ai#S-16`、`#S-10`、`#S-23` |
| [design §4 登录状态](../../design.md#登录状态) | 本账号有效登录状态列得出来，才撤销得了；不做全设备撤销 | 已确认（rev 12） | 是：`ai#S-37`，无全设备参数 |
| [design §4 未激活的账号记录不会永久占着那个名字](../../design.md#未激活的账号记录不会永久占着那个名字) | 未激活记录按部署配置的期限留存，到期清除、标识释放；为它准备的个人组织与第一个租户随之消失；到期即可重新注册、不等清扫 | 已确认（rev 12／13） | 是：`ai#S-38`、`#S-39`；`og#S-53`；`ar#S-34` |
| [design §4 Context](../../design.md#contextagent-运行时可感知的上下文信息) | 账号承载个人 context，与协作范围 context 正交 | 已确认 | **否**：内容项无 topic（Q-1） |
| [design §2 非目标](../../design.md#非目标) | 本版无注销、终止、恢复；已激活是终态 | 已确认 | 是：`ai#S-20` |

### 1.2 组织与成员那一侧

| 条款 | 要求 | 确认状态 | 本版是否落地 |
|---|---|---|---|
| [design §4 组织](../../design.md#组织)、[flows §1.4](../../flows.md#14-创建组织) | 已激活账号创建组织，创建者自动成为超管，不存在无管理员的中间态 | 已确认 | 是：`og#S-21`、`#S-20` ④ |
| [design §4 角色](../../design.md#角色)、[flows §3.3](../../flows.md#33-成员关系) | 任何组织在任何时刻至少一位有效超管；并发移除对方时先成者成功、后成者被拒 | 已确认（rev 10） | 是：`og#S-17`、`#S-28`、`#S-29` |
| [design §4 个人组织](../../design.md#个人组织) | 每账号恰一个个人组织，唯一成员即创建者；不能邀请、不能退出、上级恒空、不作上级——结构性禁止 | 已确认 | 是：`og#S-6`、`#S-15`、`#S-20` |
| [design §4 组织](../../design.md#组织) | 上级组织是属性、至多一个、创建时为空；隶属链不成环；有共同上级 = 同一棵隶属树（各含自身链有交） | 已确认（rev 10／12／13） | 是：`og#S-7`、`#S-12`、`#S-32` |
| [design §4 隶属关系怎么建立与解除](../../design.md#隶属关系怎么建立与解除)、[flows §1.7](../../flows.md#17-建立与解除组织隶属) | 建立须双方超管各一次；解除单方即可；邀请与隶属请求是两种对象；接受隶属不产生租户 | 已确认 | 是：`og#S-30`～`#S-33`、`#S-10`、`#S-11` |
| [design §4 两种邀约都会过期](../../design.md#两种邀约都会过期) | 每类各有默认时长（部署配置）、发出时可指定；到期不可再接受只能重发；指向的组织不存在即过期 | 已确认（rev 8／11） | 是：`oe` 全部；`og#S-23`、`#S-30`。**「组织不存在」分支本版无触发源**（Q-3） |
| [flows §1.8](../../flows.md#18-切换当前组织)、[design §4 当前租户身份](../../design.md#当前租户身份) | 当前租户身份是登录状态上的一项选择，创建那一刻被捕获，切换只影响此后新建的东西 | 已确认（rev 10） | 是：`og#S-14`、`#S-36`、`#S-37` |
| [flows §4](../../flows.md#四角色与操作) | 只有超管与普通成员；管理动作只归超管；成员名单全员可见、已解除只超管、两类邀约只超管 | 已确认（rev 13／14／15） | 是：`og#S-58`～`#S-60` |

### 1.3 租户、角色、归属与隔离

| 条款 | 要求 | 确认状态 | 本版是否落地 |
|---|---|---|---|
| [design §4 租户](../../design.md#租户)、[退出之后再加入](../../design.md#退出之后再加入回来的是同一个租户) | 租户 = (组织, 账号)，不含角色；退出再加入是同一个租户，私有部分不可达不销毁 | 已确认 | 是：`iv#S-5`～`#S-8`；`og#S-8`、`#S-38`、`#S-39`。「不销毁」那一半归资产 owner（Q-12） |
| [design §4 角色](../../design.md#角色) | 一个租户只持一个角色；变更只影响此后准入 | 已确认 | 是：`og#S-8`、`#S-18` |
| [design §6.4](../../design.md#64-隔离)、[SYS-TENANT](../../../../foundation/cross-system-constraints/requirements.md#sys-tenant) | 显式携带租户身份、跨租户默认拒绝；不可用或失权时明确失败不回退；切换不复制层事实；账号是最大边界 | 已确认（rev 10） | 是：`iv#S-16`～`#S-30`；`og#S-9`、`#S-16`、`#S-43`；`ai#S-27`。各 owner 那一半等资产契约 |
| [design §6.5](../../design.md#65-本地资源定位) | 物理位置不构成资格 | 已确认（rev 10） | 是：`iv#S-34`、静态检查 SC-1 |
| [design §6.6](../../design.md#66-撤销不等于强制停止) | 撤销只影响下一道准入；已开始的调用是否停止归运行控制 | 已确认（rev 10） | 前半是：`ai#S-29`、`og#S-44`；**后半否**（Q-4） |
| [design §6.1](../../design.md#61-层次) | 四层作用域，组织级归组织、租户级归 (组织, 账号)，账号不占一格 | 已确认 | 是：`og#S-13`、`#S-35`；**会话级否**（Q-2） |
| [design §6.4](../../design.md#64-隔离) | 使用成本按租户归属并能出明细 | 已确认 | **否**：计量口径无 topic（Q-5） |
| [design §6.7](../../design.md#67-创作与归属) | 作者是租户、所有者与作者分记 | 已确认 | **否，归资产契约**：本版只保证 TenantId 永久可引用 |

## 2. 涉及的领域对象

取自 [`domain_objects/objects.md`](../../../../domain_objects/objects.md)《主体与归属》，落点是本版的裁定。

| 对象 | 领域含义 | 生命周期 | 落点 |
|---|---|---|---|
| [账号](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-account--账号--account) | 自然人的产品身份 | 不存在 → 未激活 → 已激活（不可逆）；未激活可被清除 | `ai#S-4`／`#S-5` 持久记录；AI 插件 `accounts` 面 |
| [登录状态](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state) | 一次通过鉴权的登录 | 无 → 有效 → 已失效（持久） | `ai#S-9` 持久记录；AI `logins` 面 |
| [组织](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-organization--组织--organization)（个人／团队两变体） | 协作范围 | 创建后永久；**个人组织唯一销毁路径 `og#S-53`** | `og#S-5`；OG `organizations` 面 |
| [邀请](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-invitation--邀请--invitation) | 组织 → 账号的加入邀约 | 发出 → 接受／撤回（记录）／过期（派生） | `og#S-10` + `oe`；OG `offers` 面 |
| [隶属请求](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-affiliation-request--隶属请求--affiliation-request) | 组织 → 组织的建立隶属邀约 | 同上 | `og#S-11` + `oe` |
| [租户](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-tenant--租户--tenant) | 值那一面：(组织, 账号) 身份；记录那一面：此刻有效否、持何角色 | 值不生不灭；记录 无 → 有效 → 无效 → 再有效（同一条） | `iv#S-5` 值；`og#S-8` 成员关系记录；OG `memberships` 面 |
| 当前租户身份（属性，[UL-current-tenant-identity](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity)） | 一次登录此刻站在哪个租户身份上 | 随登录状态生灭；失效后残留由提供者清扫 | `og#S-14` 独立记录（以 LoginStateId 引用登录状态） |
| 交接凭证（规格层构造，无词条，见 `ai#S-14` 的说明） | 跨 owner 交接时携带的不可伪造依据 | 产出即用；本版不作废 | `iv#S-35`；IV 签发／核实原语 |

## 3. 不变量与性质

编号沿用 B 领域读数（INV／SAF／LIV），只列本版落地的；「谁维护」指契约条款与节点，「检查」指已登记的形式任务或契约规范场景（**场景全部未开始**，形式任务已跑两次无反例）。

**本版新增的统一前提（D-027，PF-017 rev 2 §6.7／§6.8 的读法）**：下面所有依赖「已提交事实持久」的性质——撤销后效力不变、激活与签发跨重启仍在、失效持久（`ai#S-10`、`#S-23`、`#S-32`）——都只对**进程重启**承诺；机器断电或操作系统崩溃可能丢掉崩溃前最后一段已提交事务，那些事实退回到更早的状态。这是装配给的边界，本版不承诺，协议补不了；实施者不得把它做成「静默放行」以外的别的样子，也不得为它预埋补偿。

### 3.1 不变量（任何时刻为真）

| 编号 | 内容 | 谁维护 | 违反时的检查 |
|---|---|---|---|
| INV-1 | 一个登录标识至多指认一个账号（未激活也占用；释放后可被新账号取得） | [`ai#S-19`](../../../../spec/capabilities/account-identity/v1/contract.md#s-19-登录标识部署内唯一)：`#S-13` 前置① + `#S-38` 同提交；AI 存储要求 R-2／R-6 | `ar#S-31` 并发场景；`ai#S-41` ① |
| INV-2 | 每个账号至多一个个人组织；已激活账号恰一个 | [`og#S-20`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) ⑦ + `ownerAccount` 唯一约束；「至少一个」挂在 `ai#S-14` 前置 | `formal:account-registration-v1-crash`（`ActivatedHasPersonalOrganization ∧ OnePersonalOrganizationPerAccount`） |
| INV-2′ | 个人组织存在 ⇒ 对应账号记录存在（不会变孤儿） | [`ar#S-35`](../../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿)：清除链次序 + 清除依据；`og#S-20` 前置②；**存储级引用约束** `organization.ownerAccount → 账号行`、删除受限（OG R-6／AI R-7）——真实系统里靠它，不靠动作次序 | 同上（`NoOrphanPersonalOrganization`，只在 crash.cfg，模型把清除建成原子）；R-6 注入测试（未开始） |
| INV-3 | 已激活账号至少一个有效租户 | `og#S-20` ④ + `#S-6` 禁止 2 + `#S-53` `accountIsActivated` | `og#S-27` ⑧口径；场景未开始 |
| INV-4 | 任何组织任何时刻至少一位有效超管 | [`og#S-17`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-17-同一组织的成员写入序列化) + `#S-28`／`#S-29` 同提交前置；存储 R-3a（写事务开头锁组织行），无进程内锁 | `formal:organization-governance-v1-membership`（`AtLeastOneSuperAdministrator`）；`og#S-48` 真并发 |
| INV-5 | 至多一个上级 | `og#S-7` 数据形状 | 静态检查（`parent` 单列） |
| INV-6 | 上级链不成环，自环也不行 | [`og#S-32`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求) ④两半 + `#S-30` 自环；存储 R-3b（哨兵行锁），无进程内锁 | Alloy `AcceptPreservesAcyclic`（未登记 task，run-2 UNSAT） |
| INV-7 | 个人组织上级恒空、不作上级、与任何不同组织无共同上级 | `og#S-6`、`#S-12` | Alloy `PersonalOrganizationSharesNoAncestor` |
| INV-8 | 个人组织上没有邀请、没有唯一成员退出这两个动作 | `og#S-15`：结构性失败值 | `og#S-51` |
| INV-9 | 租户身份恰由 (组织, 账号) 确定、不含角色、跨断续同一 | `iv#S-5`～`#S-8`；`og#S-8` 键；`#S-39` | `formal:organization-governance-v1-membership`（`Rejoin`）；`og#S-49` |
| INV-10 | 一个租户在组织内恰持一个角色 | `og#S-8` 单值列 | 类型 |
| INV-11 | 账号记录不含跨账号字段、不含任何租户身份 | `ai#S-11`、`#S-12` | 静态检查 `ai#S-35`、IV SC-2 |
| INV-12 | 作用域层恰四层，账号不占一格；本域只给组织级、租户级 | `og#S-13`、`#S-35`；`iv#S-11` 恰两变体 | 类型（`ScopeLayerIdentity` 无第三变体） |
| INV-14 | 已激活不回退、不消失 | `ai#S-20`：无写路径 + `#S-38` 前置② | `ai#S-41` ③ |
| INV-16 | `expired` 不是被存下来的值；`expiresAt` 一经写下不再改 | [`oe#S-5`](../../../../spec/data/offer-expiry/v1/contract.md#s-5-时刻在发出的同一提交内定死)、`#S-7`；OE `SettledState` 与 `OfferState` 两个类型 | lint SC-OE-1；`oe#S-5` 场景 |
| INV-17 | 「是否已过留存期限」单调、已激活恒为否；三个判定点（`ai#S-14` ③、`og#S-20` ②、`og#S-53`）读到同一个答案 | [`ai#S-18`](../../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号) 性质 1／2；**AI 账号行上的 `expiredAt` 事实**——首次观测时在行锁下落盘，此后与 `now` 无关，与 `activated` 同行同锁（[AI 过期事实](../../../../realization/packages/tenancy/account-identity/design.md#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)） | `ai#S-43` 两支（第 2 支须含「激活 vs 清除」「创建个人组织 vs 清除」两条交错）；过期事实单元测试 |

### 3.2 安全性质（绝不能发生）

| 编号 | 内容 | 谁维护 | 违反时的检查 |
|---|---|---|---|
| SAF-1 | 未激活账号完成任何交互 | `ai#S-21`：`#S-15` 前置③。**前提**：一切交互经 `#S-17` 校验（各入口 owner） | `ai#S-31` 第三支 |
| SAF-2 | 从登录反馈分辨存在性 | `ai#S-22`：`#S-15` 单一失败值；注册路径的三处例外写在 `#S-22` | `ai#S-31` |
| SAF-3 | 退出后（含重启）又被接受 | `ai#S-23`：`#S-10` 持久记录 + `#S-17` 三出口不放行 | `ai#S-32` 含重启 |
| SAF-4 | 一处退出踢别处 | `ai#S-16` 单目标 | `ai#S-33` |
| SAF-5 | 两次同时动作合起来清空超管 | `og#S-17` | 同 INV-4；NoSerialization 配置按预期出反例（有效性核对） |
| SAF-7 | 超管读到成员私域 | `og#S-26`：超管账号不是个人组织成员。**前提**：各 owner 显式携带 TenantId 调判定 | 场景未开始 |
| SAF-8 | 两账号有通路 | `ai#S-25`（只管本契约那一份）；其余 owner 归 `iv` 隔离义务 | `ai#S-35` |
| SAF-9 | 物理位置构成资格 | `iv#S-34`、SC-1 | 静态检查 |
| SAF-10 | 解除清掉私有部分／再加入换身份 | `og#S-38`、`#S-39`；资产侧 `iv#S-26` | `og#S-49` 跨契约 |
| SAF-11 | 过期／撤回／已接受的邀约被再接受后产生效果 | `oe#S-10`～`#S-13`；`og#S-25`／`#S-32` 同提交重判、三来路同收 `offerNoLongerValid` | `oe#S-23`～`#S-25`；`og#S-46`／`#S-47` |
| SAF-12 | 接受隶属产生租户 | `og#S-32`：无成员写路径 | `og#S-46` 隶属半 |
| SAF-13 | 单方面隶属 | `og#S-32` ② 接收方超管 | 同上 |
| SAF-14 | 个人组织上链、发收邀约 | `og#S-6` 四失败值 | `og#S-51` |
| SAF-16 | 不可用时静默回退到个人范围 | `og#S-9`、`#S-16`、`#S-37` ⑧；`ai#S-27`；`oe#S-20` | `og#S-52`；`ai#S-32`／`#S-40` 注入支 |
| SAF-17 | 旧菜单、缓存当授权 | `og#S-18`、`ai#S-17` 不缓存跨准入 | 各 owner 缓存写明失效条件（本版节点无缓存） |
| SAF-20 | 失败显示成功、接错账号 | `ai#S-24`：闭合失败集合 + 唯一提交点 + 两份依据绑定且不可伪造；`ar#S-16` | `formal:account-registration-v1-crash`（`NoFalseSuccess`）；`ai#S-42` |
| SAF-21 | 切换复制层事实 | `og#S-37`：只写一项选择 | `og#S-50` |
| SAF-23 | 清除删掉已激活账号、或正在注册的人的空间、或删错账号 | `og#S-53` ②甲现读 + `ai#S-38` 前置②③④ + 依据绑定 AccountId | `og#S-54` 八支；`ai#S-41` ②～⑤ |
| SAF-24 | 基础设施不可用被判成「对象不存在」 | `oe#S-20`；`og#S-53` ⑧ | `og#S-54` ⑧；`oe#S-20` 注入 |

### 3.3 进展性质（最终必须发生，全部有界）

| 编号 | 前提 | 最终发生什么 | 证据形式 |
|---|---|---|---|
| LIV-1 | 部署可访问、发起者不放弃、存储最终持续可用、两个参与方服务面可解析（`ar#S-19` (a)～(d)） | 一次注册尝试在本次流程内终结于四个结果之一，无第三种形态 | `formal:account-registration-v1-progress`（`EventualOutcome`，前提 (b)(c) 是常量取值，(d) 未建模）；`ar#S-28` |
| LIV-2 | 邀请 `pending`、账号已激活、存储可用 | 接受返回后**下一次**成员资格判定即有效 | `og#S-46` |
| LIV-3 | 时间源可用、同源、`now` 不后退 | 未接受未撤回的邀约不迟于 `issuedAt + offer_ttl` 不可接受，不依赖定时器 | `oe#S-25`、`og#S-47` |
| LIV-5／7 | 各 owner 现读 | 解除后**下一道**准入被拒；调角色后**第一道**准入按新角色 | 场景未开始 |
| LIV-6 | 资产侧未销毁 | 重新加入返回后原样可用 | `og#S-49` |
| LIV-8 | 存储原子性 | 被拒的操作立即返回具名值、不留部分效果 | 各契约 ④ |
| LIV-11 | **有人发起 `ai#S-38`**（主链撞上过期记录就地发起，或清扫） | 过期的未激活记录被清除、标识释放；**本版无上界**——契约不设定时器 | `ai#S-41` ①；**清扫本版建不起来**（Q-6） |

## 4. 业务规则

每个操作六项：前置 · 后置 · 失败集合 · 缺席默认 · 原子性／提交点 · 依据。**失败集合是闭合枚举，没有「其他」；身份参数没有默认值，缺席或表示非法一律 `invalid-input`／`invalidInput`（在任何判定之前，不得记成判定结果）；存储或依赖读不到一律 `storage-unavailable`／`unavailable`，与拒绝值永不合并。**这三句对下面全部操作成立，各行不再重复。

### 4.1 账号身份（`ai`，[契约](../../../../spec/capabilities/account-identity/v1/contract.md)）

| 操作 | 前置（求值次序固定） | 后置 | 失败集合 | 缺席默认（三句之外） | 提交点 | 依据 |
|---|---|---|---|---|---|---|
| `S-13` 产生账号（登录标识, 凭据） | 表示层 → 凭据合规 → 占用判定：标识未占用；或被**未激活且未过期**记录占用且凭据匹配（认回，**不重判合规**） | 未激活记录 + AccountId；认回返回既有 AccountId | `identifier-taken`（已激活占用 / 未过期但凭据不匹配，同值）· `identifier-held-by-expired-record`（携 AccountId，**只给组合**）· `credential-rejected` · `invalid-input` · `storage-unavailable` | 政策取不到 ⇒ `credential-rejected`；**验证器（`credentials` 服务）缺席**、期限参数／时间源取不到 ⇒ `storage-unavailable`（判不出来 ≠ 判为不合规） | 记录写入那一次提交（标识占用同提交；占用分支先在行锁下落盘过期事实） | `S-13`、`S-19`、`S-22`、`S-27` |
| `S-14` 激活（AccountId, 激活依据） | 表示层 → 存在 → 依据核验（存在、绑定该 AccountId、由产出方签发）→ 状态（未过期） | 已激活；`account.activated` | `account-not-found` · `account-record-expired` · `warrant-invalid` · `invalid-input` · `storage-unavailable` | 依据缺席 ⇒ `warrant-invalid`；已激活 ⇒ `ok` 但仍须有效依据 | **整条注册链的唯一提交点**；前置③在同一提交内现读 | `S-14`、`S-43` |
| `S-15` 登录（登录标识, 凭据） | 记录存在 ∧ 凭据匹配 ∧ 已激活 | 新 LoginStateId（每次新的一个，不幂等） | `identifier-or-credential-rejected`（三情形同值）· `invalid-input` · `storage-unavailable` | 凭据校验不可用 ⇒ `storage-unavailable`，**不放行** | 登录状态写入 | `S-15`、`S-22` |
| `S-16` 撤销（目标, 发起方 LoginStateId） | 表示层 → 发起方有效 → 目标存在 → 目标属同账号 | 目标已失效（持久）；`login.revoked` | `login-state-not-found`（含「不是你的」）· `not-authorized` · `invalid-input` · `storage-unavailable` | 发起方已失效 ⇒ `not-authorized`（重复退出不是 `ok`） | 撤销记录写入 | `S-16`、`S-10` |
| `S-17` 校验（LoginStateId） | 无 | AccountId | `login-state-rejected`（查不到／已撤销／账号未激活同值）· `invalid-input` · `storage-unavailable` | 三出口一个都不放行；不缓存跨准入 | 纯读 | `S-17`、`S-23` |
| `S-18` 读账号（AccountId） | 持有 AccountId 即可（装配给） | `{激活状态, 是否已过留存期限}`；不返回凭据与登录标识 | `account-not-found` · `invalid-input` · `storage-unavailable` | 期限参数／时间源取不到、**过期事实写不进去** ⇒ `storage-unavailable`，不返回未落盘的「是」 | **读面可能写一次**：首次读到到期即在同一提交内落盘 `expiredAt`（每条记录至多一次），这是治理三个现读点与本契约写入之间的序列化点 | `S-18` |
| `S-37` 列出有效登录状态（调用方 LoginStateId） | 调用方此刻有效 | `[{LoginStateId, 签发时间}]`，含调用方自己 | `login-state-rejected` · `invalid-input` · `storage-unavailable` | **不得返回空集** | 纯读 | `S-37`、`S-40` |
| `S-38` 清除（AccountId, 清除依据） | 表示层 → 存在性分流 → 依据核验 → 未激活 ∧ 已过期 | 记录删除 + 标识释放；`account.expired` | `not-expired`（未过期或已激活）· `purge-warrant-invalid` · `invalid-input` · `storage-unavailable` | 记录不存在 ⇒ `ok`（仍须先过依据核验）；**删除被引用约束拒绝**（个人组织行仍指着它）⇒ `storage-unavailable`，清除链按抖动型重扫即收敛 | 删除与释放同一提交 | `S-38`、`S-41` |

政策参数：`credential_policy`（`S-26`，可配有默认，形状归 CV）；`unactivated_retention`（`S-39`，部署配置，取值为正，不接受调用时长参数）。

### 4.2 组织治理（`og`，[契约](../../../../spec/capabilities/organization-governance/v1/contract.md)）

写操作全部**单次提交**、前置与写入同提交；标 ★ 的另受 `S-17` 同组织成员写序列化约束。

| 操作 | 前置 | 后置 | 失败集合 | 缺席默认（三句之外） | 依据 |
|---|---|---|---|---|---|
| `S-20` 创建个人组织（AccountId） | 账号存在 ∧ 未过期（**同提交现读**）；不要求已激活；已有 ⇒ 幂等返回既有 | 组织行（personal）+ 成员记录（有效，超管）三者同时成立；返回 OrganizationId／TenantId | `accountDoesNotExist` · `accountRecordExpired` · `invalidInput` · `unavailable` | 不得跳过存在判定 | `S-20` |
| `S-21` 创建团队组织（创建者, 创建键?） | 已激活 | 组织行（team）+ 创建者超管 +（带键时）键登记 | `accountNotActivated` · `accountDoesNotExist` · `invalidInput` · `unavailable` | 键缺席 = 不去重；键登记读不到 ⇒ `unavailable` | `S-21` |
| `S-22` 读组织 | 无 | `{id, kind, parent}` | `organizationDoesNotExist` · `invalidInput` · `unavailable` | 读不到 ≠ 不存在 | `S-22`、`S-15` |
| `S-23` 发出邀请（发起者 TenantId, 目标 AccountId, 角色?, 时长?） | 结构性禁止（personal）→ 超管 → 目标已激活 → 目标尚无有效成员关系 | 邀请（`OfferTiming` 定死）；`invitation.issued` 必发 | `issuerIsPersonalOrganization` · `notAuthorized` · `accountNotActivated` · `accountDoesNotExist` · `alreadyAnEffectiveMember` · `invalidOfferDuration` · `invalidInput` · `unavailable` | 时长缺席按邀请类默认；角色缺席普通成员；非法时长拒绝不兜底 | `S-23`、`oe#S-14` |
| `S-24` 撤回邀请（发起者 TenantId, InvitationId） | 由发起者组织发出（否则 `invitationDoesNotExist`）→ 超管 → 提交内现读派生状态 | `withdrawn` 终结记录 | `invitationDoesNotExist` · `notAuthorized` · `alreadyConcluded`（已 `accepted` 或已过期，**不写**）· `invalidInput` · `unavailable` | 已 `withdrawn` ⇒ `ok`；过期判定读不到 ⇒ `unavailable` 不写 | `S-24`、`oe#S-8` |
| `S-25` 接受邀请（AccountId, InvitationId）★ | 就是被邀请账号 → 已激活 → 同提交重判 `pending` | 成员记录有效（同一条）、角色为指定值、`accepted` 记录；返回 TenantId；`membership.changed` | `invitationDoesNotExist` · `offerNoLongerValid`（过期／撤回／已接受同值）· `notTheInvitedAccount` · `accountNotActivated` · `accountDoesNotExist` · `alreadyAnEffectiveMember` · `invalidInput` · `unavailable` | 过期判定读不到 ⇒ `unavailable` 不放行不判失效 | `S-25`、`oe#S-10`／`#S-13` |
| `S-26` 成员资格判定（TenantId） | 无 | `MembershipStanding`：`effective(role)` / `ineffective` | `invalidInput`；`{failure: unavailable}` | **读不到 ⇒ 失败，不是 `ineffective`** | `S-26`、`S-9` |
| `S-27` 我的租户（AccountId） | 无 | 此刻有效 TenantId 列表（可空） | `unavailable` · `invalidInput` | 读不到不得返回空列表 | `S-27` |
| `S-28` 调整角色 ★ | 发起者超管 → 目标有效 → 之后仍 ≥1 超管（同提交） | 角色写入；`role.changed` | `notAuthorized` · `membershipNotEffective` · `wouldLeaveNoSuperAdministrator` · `invalidInput` · `unavailable` | 已持该角色 ⇒ `ok` | `S-28`、`S-17` |
| `S-29` 解除成员 ★ | 本人或超管 → 目标有效 → 结构性禁止（personal）→ 之后仍 ≥1 超管 | 记录置无效（不删持有、不铸新身份）；`membership.changed` | `personalOrganizationMemberCannotLeave` · `notAuthorized` · `membershipNotEffective` · `wouldLeaveNoSuperAdministrator` · `invalidInput` · `unavailable` | 并发移除对方：后成者得同一个 `wouldLeaveNoSuperAdministrator` | `S-29`、`S-38` |
| `S-30` 发出隶属请求（发起者 TenantId, 接收方 OrganizationId, 方向, 时长?） | 指向自己 ⇒ `wouldFormACycle`（不读存储）→ 结构性禁止 → 接收方存在 → 超管 | 请求（`OfferTiming`）；**不发事件** | `personalOrganizationTakesNoPartInAffiliation` · `notAuthorized` · `organizationDoesNotExist` · `wouldFormACycle` · `invalidOfferDuration` · `invalidInput` · `unavailable` | 时长缺席按隶属请求类默认（与邀请不共用） | `S-30` |
| `S-31` 撤回隶属请求 | 同 `S-24`，只对发起方 | `withdrawn` | `affiliationRequestDoesNotExist` · `notAuthorized` · `alreadyConcluded` · `invalidInput` · `unavailable` | 同 `S-24` | `S-31` |
| `S-32` 接受隶属请求（接受者 TenantId, RequestId） | 接收方超管 → 结构性禁止 → 同提交重判 `pending` → 下级尚无上级 → 判环（`child ∉ {newParent} ∪ ancestorChain(newParent)`，同提交读多行） | 下级 `parent` 填值 + `accepted`；**不产生租户** | `affiliationRequestDoesNotExist` · `offerNoLongerValid` · `notAuthorized` · `alreadyHasAParentOrganization` · `wouldFormACycle` · `personalOrganizationTakesNoPartInAffiliation` · `invalidInput` · `unavailable` | 判环任一行读不到 ⇒ `unavailable`，不判「不成环」 | `S-32`、`S-7` |
| `S-33` 解除隶属（发起者 TenantId, 下级 OrganizationId） | 任一方超管 | `parent` 清空；`affiliation.dissolved` | `noSuchAffiliation` · `notAuthorized` · `invalidInput` · `unavailable` | 属性已空 ⇒ `noSuchAffiliation` | `S-33` |
| `S-34` 上级链／有共同上级 | 无 | 链不含自己；`shareAncestor` 含自身求交 | `organizationDoesNotExist` · `invalidInput` · `unavailable` | 链上任一行读不到 ⇒ `unavailable`，不返回截断链 | `S-34`、`S-12` |
| `S-35` 层身份（TenantId） | 无 | `{组织级, 租户级}` 两个 `ScopeLayerIdentity` | `invalidInput`（**无 `unavailable`**） | 会话级不返回、不填 null | `S-35`、`S-13` |
| `S-36` 当前租户身份查询（LoginStateId） | 登录状态有效（`ai#S-17` 四出口映射） | TenantId；未切换过 ⇒ 初值 (个人组织, 账号) | `loginStateNotValid` · `invalidInput` · `unavailable` | 选择记录读不到 ⇒ `unavailable`，**不填初值** | `S-36`、`S-14`、`S-4` |
| `S-37` 切换当前租户身份（LoginStateId, TenantId） | 登录状态有效 → 目标账号那一半是本账号 → 成员资格有效 | 选择记录写入；不改任何层 | `loginStateNotValid` · `notOwnTenant` · `membershipNotEffective` · `invalidInput` · `unavailable` | 成员资格 `unavailable` ⇒ `unavailable`，不回退 | `S-37` |
| `S-53` 清除未激活账号的个人组织（AccountId）★ | 表示层 → 读账号 → 读组织。甲（账号读到）：未激活 ∧ 已过期（同提交现读）→ 组织存在则须 personal；乙（`account-not-found`）：组织也不在 ⇒ `ok`+依据，组织仍在 ⇒ `accountDoesNotExist`（缺陷观测，不删不签） | 删组织行 + 唯一成员记录（同提交）；**返回清除依据**（成功与幂等成功都返回）；`organization.purged`（不发 `membership.changed`） | `organizationIsNotPersonal` · `accountIsActivated` · `accountNotExpired` · `accountDoesNotExist` · `invalidInput` · `unavailable`（恰六个） | 账号读面 `storage-unavailable` ⇒ `unavailable`，不清除不产依据，**与乙那支绝不折叠** | `S-53`、`S-54` |
| `S-55`／`S-56` 读邀请／读隶属请求 | 被邀请账号本人，或发出／涉及组织的超管（否则 `…DoesNotExist`） | 全部字段 + **本次读取时点**的派生状态 | `…DoesNotExist` · `invalidInput` · `unavailable` | 时间源／存在性读不到 ⇒ `unavailable`，不填 `pending` | `S-55`、`S-56` |
| `S-57`／`S-58`／`S-60` 三个邀约列表 | `S-57` 输入账号即本人；`S-58`／`S-60` 超管 | 列表，每项派生状态读时求值；默认只 `pending` | `S-57`：`invalidInput` · `unavailable`；后两条另有 `notAuthorized` | 读不到不得返回空列表或残缺列表 | 各条 |
| `S-59` 列出组织成员（TenantId, 含无效?） | 默认档：该组织有效成员任一角色；「连无效的」档：超管 | `[{TenantId, 角色, 有效性}]`；普通成员的列表不含无效项 | `notAuthorized` · `invalidInput` · `unavailable` | 被拒不降级为默认档 | `S-59` |

政策参数：邀请类与隶属请求类各自的默认 `offer_ttl`（部署配置，非正 ⇒ 启动失败，`oe#S-14`／`#S-17`）；`team_creation_key_retention`（`S-21`）。

### 4.3 注册与清除（`ar`，[契约](../../../../spec/compositions/account-registration/v1/contract.md)）

```
register(登录标识, 凭据)
  次序：① ai#S-13 → ② og#S-20（成功含幂等 ⇒ 组合签发激活依据，绑定本次 AccountId）→ ③ ai#S-14
  后置：registered ⇔ ③ 提交成立；成功回执只在其后发出且不可撤销（S-7）
  终结结果集合：registered · identifier-taken · credential-rejected · interrupted（恰四值，S-5）
  失败映射：S-8 表逐格；① identifier-held-by-expired-record ⇒ 不终结：就地跑清除链①②，两步都 ok ⇒ 重跑 ① 恰一次；任一步失败 ⇒ interrupted（不重跑）
  缺席默认：任一参与方不可用 ⇒ interrupted；③ 前置读不到 ⇒ 不激活（S-23）
  原子性：三次跨 owner 提交，唯一提交点 = ③；三步各自幂等（S-9），中断停在三个稳定状态之一（S-11）
  可观测缺陷：warrant-invalid / ②③ 的 accountDoesNotExist / ①②③ 的 invalid-input ⇒ 另记组合缺陷或入口缺陷，不并入 interrupted 统计
  依据：S-8、S-10、S-12、S-13

purgeChain(AccountId)                 ← 两个发起者：主链就地、清扫提供者
  次序：① og#S-53（产出清除依据）→ ② ai#S-38（核实依据）
  返回面：ok | 参与方失败值原样 + 三分类标签（终止型 / 缺陷型 / 抖动型，S-34 表）
  幂等：两步边界都是 AccountId，可从任意位置重扫
  与主链并发：S-34 七格交错表；准入判据只有一个——「已过留存期限」单调事实，各自在自己提交里现读
  依据：S-34、S-35
```

### 4.4 共用数据规则（`iv`、`oe`）

- 身份值（[`iv`](../../../../spec/data/identity-values/v1/contract.md)）：AccountId／OrganizationId／LoginStateId 不透明、不回收；登录标识不是 AccountId（`S-2`）；TenantId = (OrganizationId, AccountId) 结构相等、规范序列化唯一（`S-5`～`#S-7`）；`MembershipStandingResult` 恰两支，`invalidInput` 在类型之外（`S-10`）；`ScopeLayerIdentity` 恰两变体（`S-11`）；表示层校验与判定分开（`S-33`）；隔离义务 `S-16`～`S-30`（显式携带、无默认值、缺席即拒绝、不可用即明确失败、六路径同判、跨边界重新验证）；交接凭证六性质、本版不作废（`S-35`）。
- 邀约过期（[`oe`](../../../../spec/data/offer-expiry/v1/contract.md)）：`expired ≝ now > expiresAt ∨ 指向对象已不存在`，严格不等号，终结记录优先（`S-8`）；读时派生不回退（`S-9`）；接受同提交重判（`S-10`）；三来路同一拒绝值（`S-13`）；`offer_ttl` 每类默认 + 可指定，非法拒绝、默认值配错启动失败（`S-14`）；同一时间源、不可用即失败（`S-16`）；后台清理不担正确性（`S-18`）；不可用 ≠ 不存在（`S-20`）。

## 5. Cordis 建模

来源：六个 provider 节点（[realization/packages](../../../../realization/README.md#当前主题)）。服务名、方法名**一律候选**。Cordis 采用版本尚无决定，一切按 4.0.2 手册基线。

### 5.1 插件与服务面

| 插件（节点） | provide 的服务 | 服务面上的操作 | 独立成插件的理由 |
|---|---|---|---|
| [identity-values](../../../../realization/packages/core/identity-values/design.md) | **不是插件**，纯模块（包依赖） | 类型与解析、`tenantIdEquals`／`toCanonicalJson`、`ancestorChain`／`shareAncestor` 纯函数、`validate`、`handoffWarrant.issue/verify` | 契约无操作无提交点；值没有提供者换代 |
| [offer-expiry](../../../../realization/packages/core/offer-expiry/design.md) | **纯模块** | `timingFrom`、`deriveState`（输入 `now`、`target` 三值）、`acceptable`、`parseOfferTtl`、`Clock` 接口形状 | 判定是纯计算；做成服务会给消费者一条无领域意义的重跑边 |
| [account-identity](../../../../realization/packages/tenancy/account-identity/design.md) | `accounts`、`logins` | `accounts`: produce／activate／read／purge；`logins`: issue／revoke／verify／listEffective | 账号事实与登录状态同存储同提交域；消费者不同但变化原因相同，不再拆 |
| [credential-verification](../../../../realization/packages/tenancy/credential-verification/design.md) | `credentials` | parse／derive／verify／checkPolicy | **唯一会被整体替换的地方**（认证方式换代） |
| [organization-governance](../../../../realization/packages/tenancy/organization-governance/design.md) | `organizations`、`memberships`、`offers`、`organization-purge` | 25 个操作按面分布；`organization-purge` 只承 `og#S-53` | 组织规则独立变化；三组不拆因三处同提交；`organization-purge` 单列以兑现「只由清除链调用」 |
| [account-registration](../../../../realization/packages/tenancy/account-registration/design.md) | `registration` | register／purgeExpired | 唯一提交点跨两个 owner；不拥有事实 |

装配层还需两个本批**未建节点**的提供者：`storage`（各节点写了要求清单）与 `clock`（形状在 offer-expiry 节点，`now` 不后退的候选实现在同处）。

### 5.2 依赖与重载

| 消费者 | inject 什么 | 能否承受被卸载重跑 | 不能时怎么办 |
|---|---|---|---|
| account-identity | `storage`、`clock`（必需）；`credentials`（**可选，调用时解析**） | 能：插件体只 provide + 校验 config，无闭包状态 | `credentials` 若做成必需，认证换代会级联重启治理——所以不做必需；缺席时 S-13 ②③／S-15 一律 `storage-unavailable` |
| credential-verification | 无 | — | — |
| organization-governance | `accounts`、`logins`、`storage`、`clock`（必需） | 能；契约 `og#S-4` 自认账号提供者换代即重跑 | — |
| account-registration | `accounts`、`organizations`、`organization-purge`（必需） | 能：无状态；在途调用每步前查 fiber 状态（待核对 API） | 退路：让在途调用跑完，幂等边界使之无害，但 `ar#S-22` 字面收场要重对 |

**插件体必须可重复执行。**跨重载要保留的事实全部在存储里，六个节点无一在闭包里持有事实。

### 5.3 effect 装卸配对

| 取得的资源／注册的贡献 | 拥有者与对外可用时点 | 部分初始化失败 | 撤除时释放／交接什么 | 撤除后什么仍为真 |
|---|---|---|---|---|
| 各插件的 config 校验（ttl／留存期限为正；**三个持钥节点各自那把密钥存在且形状对**） | 插件体开头 | 抛出 ⇒ fiber 不 `ACTIVE`（**待核对主张**）。配置错误一律启动失败，不作运行期拒绝 | — | — |
| `ctx.provide(...)` 各服务面 | 各自 fiber；`ACTIVE` 后可解析 | 抛出，已 provide 的随 fiber 撤（`ctx.provide` 纳管**待核对**） | 服务消失；**在途调用跑完**（内核不取消，服务对象仍在调用方闭包里），各自按那一次存储提交收场；无排空、无补偿 | 全部持久记录（`ai#S-28`、`og#S-43`） |
| 进程内锁 | **无**——四个插件都不加进程内锁；序列化全部落在存储要求（AI R-3 行锁、OG R-3a 组织行锁、R-3b 哨兵行锁、R-6／R-7 引用约束） | — | — | 存储要求在跨进程时被明确重核，进程内锁只会静默失效 |
| 定时器 | **无**：清扫、残留选择清理、过期登记清理都归装配，本批未建 | — | — | — |

### 5.4 事件

| 事件 | 通知还是控制 | 派发 | 理由 |
|---|---|---|---|
| `account.activated`、`login.revoked`、`account.expired`（`ai`） | 通知 | `emit` | 契约明写不是控制点、无投递保证；失效靠现读 |
| `membership.changed`、`role.changed`、`affiliation.dissolved`、`invitation.issued`、`organization.purged`（`og`） | 通知 | `emit` | 同上；`invitation.issued` 必发；`organization.purged` 不伴发 `membership.changed` |
| 跨租户放行、接受邀约前校验 | **不开事件**——操作自身的同步前置 | — | `og#S-41`；将来开扩展点必须 `serial` |

### 5.5 装配草图

```text
ctx（apps 装配，本批未建节点）
├─ provide storage            ← 满足 AI R-1～R-7、OG R-1～R-6（含 R-3a/R-3b/R-3d；两节点的表在同一约束域：organization.ownerAccount → 账号行）
├─ provide clock              ← now 不后退：单调钟锚定 + 存储高水位，回拨 ⇒ unavailable
├─ plugin credential-verification   provide credentials
├─ plugin account-identity          inject storage, clock; optional credentials
│                                   provide accounts, logins；config: unactivated_retention, credential_policy, 两把公钥
├─ plugin organization-governance   inject accounts, logins, storage, clock
│                                   provide organizations, memberships, offers, organization-purge；config: 两个 ttl 默认值, key retention, purge 私钥
├─ plugin account-registration      inject accounts, organizations, organization-purge
│                                   provide registration；config: activation 私钥
├─ plugin governance-center-entry   inject logins, registration, organizations, memberships, offers, storage, credentials, clock；不 provide
│                                   ← 每个请求凭出示物走 ai v2 S-44 认人，再 og#S-36 取身份值调治理面；治理面不直接暴露为终端 API
│                                   （契约与节点见 PF-017 投影 v1；本投影不重复）
└─ plugin governance-center-ops     inject storage, clock；本机通道上的完整体检，没有治理路由
密钥：部署配置输入（一次生成、持久保存、跨重启不变），activation 私钥 → account-registration；purge 私钥 → organization-governance；两把公钥 → account-identity；缺 ⇒ 该节点启动失败
```

## 6. 绑定与证据

| 契约条款 | 依赖的机制语义条目 | 证据 | 前提 | 状态 |
|---|---|---|---|---|
| `og#S-17`、`#S-28`、`#S-29` | — | `formal:organization-governance-v1-membership` | `Serialized = TRUE`（存储真的兑现序列化）、`Actors = {a1,a2}`、无公平性 | 已跑两次无反例；提供者那一半待 `og#S-48`。**`#S-39` 不绑**：模型的 `Rejoin` 复用同一元素是建模方式，没有在 S-39 被违反时会失败的断言——证据形式是单元测试 + `#S-49` |
| `ar#S-13`、`#S-35`、`#S-16`、`#S-10`、`#S-20` | — | `formal:account-registration-v1-crash` | `Attempts = {a1,a2,a3}`，三开关 TRUE；参与方动作抽象为原子；依据抽象为布尔 | 无反例（run-2） |
| `ar#S-19` | — | `formal:account-registration-v1-progress` | `Failures/Abandoning = FALSE`、`Expiring = TRUE`、WF 公平性；前提 (d) 未建模 | 无反例 |
| `ar#S-5` | — | **不绑** `basic` 的 `TypeOK`（约束的是模型自己变量的值域，自指） | — | 证据形式改为 lint（`TerminalOutcome` 无第五值），未开始 |
| `ai#S-13`、`#S-14`、`#S-38` | — | 借 `formal:account-registration-v1-crash` | 模型只证守卫与转移；存储原子性、表示层、防伪、`Expire` 的原子性（真实系统靠行上事实 + 引用约束）、密钥不外泄且配对，都不在内 | 待场景 |
| `og#S-7`／`#S-12`／`#S-32` 结构 | — | Alloy `Affiliation.als`（**未登记 task**） | scope 5；两个变异核对未做 | run-2 三条 UNSAT |
| 其余全部条款 | `plugin-body-reruns-on-provider-change`、`async-control-not-bail`（probe 均 null） | 各契约规范场景 + 静态检查 | 见各节点 verification | **未开始** |

**bindings 只绑已存在的证据**；六个节点 verification.md 各列了「未开始」的义务与 owner。

## 7. 未决项

| 编号 | 什么没定 | 谁能定 | 在裁决前实施者该怎么办 |
|---|---|---|---|
| Q-1 | 个人 context 有哪些项、怎么读写（`ai#G-1`） | 产品负责人（无 topic） | 账号记录不加任何 context 字段 |
| Q-2 | 会话级作用域层的身份（`og#G-1`） | PF-015 owner | `scopeLayers` 只返回两层，不填 null |
| Q-3 | 「指向的组织已不存在」分支无触发源（`oe#G-3`、`og#G-2`） | PF-001 owner | 判定式写全，**不实现事件源**、不为组织解散预埋写路径 |
| Q-4 | 撤销之后已开始的调用怎么办（`ai#G-4`、`og#G-6`） | PF-012／PF-015 owner | 两节点不发停止信号；不顺手加停止动作 |
| Q-5 | 使用成本计量口径（`og#G-3`） | 产品负责人 | 每次调用携带 TenantId 即可，不做归集 |
| Q-6 | 清扫提供者：发起与节奏（`ar#G-6`）**且无枚举已过期记录的读面** | 装配 + spec（account-identity v2） | 本版不建清扫；`purgeExpired` 入口保留；「到期即可重新注册」由主链就地清除兑现 |
| Q-7 | 隶属请求的宿主（`og#G-4`） | PF-001 owner | 按 `AffiliationRequestId` 持久、按接收方判过期，不依赖宿主 |
| Q-8 | 跨进程：δ、新鲜度界、协调协议、判环一致性（`ai#S-30`／`og#G-7`／`ar#G-3`／`oe#G-4` 右列） | 架构设计 | 本版单机；各节点「装配给」落点照做；**不得在单机上引入分布式假设** |
| Q-9 | 不透明标识的词法与 TenantId 标量键（`iv#G-04`／`G-05`、`ai#G-2`） | spec（identity-values） | 用 IV 候选（128 位 CSPRNG、小写 base32）；成员关系用复合键，不拼标量键 |
| Q-10 | `ai#S-39` 政策：参数变更「只影响此后的判定」还是「此后产生的记录」——过期事实落盘后两种都可实现，差别只在尚未落盘的记录上 | spec owner | 按节点默认定死 `retentionDeadline`；裁为前者只换一个比较式 |
| Q-11 | 当前租户身份残留清扫的触发与节奏（`og#G-13`） | 装配 | 提供 `sweepStaleSelections` 方法，不建定时器 |
| Q-12 | 资产 owner 那一半隔离义务、S-49 的「不销毁」、PF-003 两类邀约的消费者（`oe#G-2`／`G-6`） | 资产领域规格（下一战役） | 本域只给判定与谓词 |
| Q-13 | 三条待核对 Cordis 主张：可选 inject 语义、`ctx.provide` 是否自动纳管、插件体抛出后 fiber 状态；AR 读本 fiber 状态的 API | 按 source-check 对采用版本取证，回填 basis | 实施前先核；核不到按各节点写的退路 |
| Q-14 | **已闭合**：Cordis 采用版本 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)，2026-09-22）；basis 六条已按 4.0.4 回填 probe | — | 按 4.0.4；节点新增的假设（内核原样传递 config 等）按 source-check 取证 |
| Q-15 | **已闭合**：领域名 `tenancy`（[D-024](../../../../record/decisions/tenancy-domain-name/README.md)，2026-09-22） | — | 按 [realization 两层布局](../../../../realization/README.md#packages-的两层布局) |
| Q-16 | **已闭合**：入口层身份核实有了契约 `composition.governance-center-entry` v1 与节点 `packages/tenancy/governance-center-entry`，账号能力发 v2（出示物与 LoginStateId 分离），都由 [D-028](../../../../record/decisions/governance-center-design-acceptance/README.md) 接受（2026-09-23）；存储、时钟与密钥三半由 [D-026](../../../../record/decisions/infrastructure-persistence-choices/README.md)／[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 裁定并落到 `packages/infra/{storage-sql,clock}`、`apps/tenancy-host` | — | 入口层那一半按 [PF-017 投影 v1](../../../PF-017-governance-center-as-deployable-application/projection/v1/projection.md) 实施；其中仍开着的 G-10 传输绑定、G-11 防冒充手段在实施前由入口层节点闭合 |
| Q-17 | 认证换代时旧凭据材料的迁移策略（CV：换方案 ⇒ 旧材料 `mismatch`） | 产品负责人 | 本版一种方案，不预埋迁移 |
| Q-18 | 契约文本四处与现行设计对不上（不改语义，待 spec owner 修订）：`ar#S-34`「两步之间崩溃后发起者回来 ⇒ ① 认回、② 重建个人组织」与 `ai#S-13`「认回须未过期」矛盾——清除链只在已过期时跑，回来的人撞上的是 `identifier-held-by-expired-record`，走就地清除后全新注册；`ar#S-25` 第 1 行仍写「③ 读到 ② 提交后的事实」而修订后 `ai#S-14` 不读组织；`ai#S-30` 第 7 行左列「同一时间源 + 同一参数源」是旧兑现描述，现行用右列的「单点判定并携带的事实」；`ai#S-4`「AccountId 由存储生成」读作「在存储提交内生成、主键约束保证唯一」；`iv` 第六节 S-35 左格写 nonce 登记而正文把机制归 realization | spec owner | 按现行节点设计实施；四处都是措辞，不改任何失败集合或次序 |

## 8. 实施顺序

| 步骤 | 做什么 | 依赖 | 完成判据 |
|---|---|---|---|
| 1 | `packages/core/identity-values`：类型、解析、纯函数、Schema 副本、`handoffWarrant` | Q-9 采用候选 | IV verification 表：V-1 正反实例全过、S-35 四类反例测试过、Schema 副本逐字节相同 CI 过 |
| 2 | `packages/core/offer-expiry`：`deriveState`、`timingFrom`、`parseOfferTtl`、`Clock` 形状 | 1 | OE 单元测试：终结记录优先、严格不等号、`unavailable` 传播、非法时长拒绝 |
| 3 | 装配：`storage`（满足 AI/OG 要求清单，两节点的表同一约束域）、`clock`（现读墙钟 + 写在前的租约）；密钥一次生成、持久保存、按节点下发。**存储与时钟提供者已建包（2026-09-22）**；本程新增的升级守卫对象、现读墙钟、`clockPreflight` 尚未落源码 | D-026、D-027 | 存储 AI R-1～R-8、OG R-1～R-6 各有一条测试（含 R-3 锁定读、R-6／R-7 引用约束拒绝）；`clock` 回拨 ⇒ `unavailable` 测试过；漏配密钥 ⇒ 对应节点不 `ACTIVE` |
| 3½ | 入口层与运维面、tenancy-host 的两步开闸与升级整体性、中心标识、账号能力 v2 的出示物 | 3；**按 [PF-017 投影 v1](../../../PF-017-governance-center-as-deployable-application/projection/v1/projection.md) 实施**，本投影不重复它的顺序与判据 | 见 PF-017 投影 v1 第 8 节 |
| 4 | `packages/tenancy/credential-verification`（密码方案） | 1 | CV 单元测试四条 |
| 5 | `packages/tenancy/account-identity` 八个操作 | 1–4；Q-13 核对 | `ai#S-31`～`#S-34`、`#S-40`～`#S-42` 场景全过；`#S-36` lint 过；`#S-32` 含真实重启 |
| 6 | `packages/tenancy/organization-governance` 25 个操作 | 1–5 | `og#S-46`～`#S-48`、`#S-51`、`#S-52`、`#S-54`（八支）全过；`#S-48` 真并发；创建键五支；时长两路 |
| 7 | `packages/tenancy/account-registration` 两条链 | 5、6 | `ar#S-27`～`#S-31` 全过；`ai#S-43` 第 2 支**含两条交错**与 `og#S-54` ⑥⑦ 同一批真并发演练过，孤儿组织与「已激活无个人组织」两个状态都不可达；缺陷记录可区分 |
| 8 | 静态检查器（SC-1／SC-2／SC-9、SC-OE-1～3、失败集合闭合、`TerminalOutcome` 四值、**方法级**：`accounts.produce` 调用点与 `organization-purge` 解析点（含 `ctx.get`）只在 AR） | 1–7 | 每条规则有「故意违反就失败」自测 |
| 9 | 把 5–8 的运行结果登进 `record/evidence/`，回填各节点 bindings（`test:` 证据） | 5–8 | bindings 不再只有 formal；README「实际验证」不再是「尚无」 |

跨契约场景（`og#S-49`、`#S-50`）与资产／会话契约相关，**不在本版顺序内**。
