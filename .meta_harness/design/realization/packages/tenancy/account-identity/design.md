# account-identity 实现设计

## 实现路径与来源

**自建一个 Cordis 插件。**契约拥有的是账号记录与登录状态记录的**持久语义**（八个操作各自的提交点、闭合的失败集合、单调的「已过留存期限」），
没有现成库表达这些；能复用的部分是存储与时间源，两者都是**别的提供者**（见[依赖](#依赖作用域与绑定)）。
不 fork 任何 DSH 上层包：DSH 没有账号身份这一层。

**一个插件、一条 fiber、两个服务面。**C 装配草图给了一个 P-A，本节点不再拆：
S-15 签发登录状态时要在**同一次提交**里现读账号的激活状态（[契约 S-15「装配给」行](../../../../spec/capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态)），
两张记录同存储、同提交域，拆成两个插件只会在中间造出一条 inject 边而收不回任何独立变化原因——账号事实与登录状态的消费者确实不同（治理只要 `accounts`，登录入口只要 `logins`），
**但消费者不同只是 #8 的两个条件之一**，独立变化原因这一条不成立（两者随同一份产品正文变）。

**Cordis 版本**：手册基线 `@deepseek-ai/cordis` 4.0.2，采用版本尚无决定；本节点依赖的机制语义逐条引 basis，basis 没有的标「待核对主张」。

## 能力到 Cordis 的投影

服务名、方法名一律候选。八个操作各落在哪个服务面：`accounts` 承 S-13／S-14／S-18／S-38，`logins` 承 S-15／S-16／S-17／S-37。
契约的九件事（前置、次序、失败集合、幂等、缺席默认……）**本表不复述**，只写每条在本节点上的兑现点与缺口。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-4](../../../../spec/capabilities/account-identity/v1/contract.md#s-4-账号记录)／[S-9](../../../../spec/capabilities/account-identity/v1/contract.md#s-9-登录状态记录) 两条持久记录 | 账号记录：`{ accountId, loginIdentifier, credentialMaterial, activated: boolean, producedAt, retentionDeadline, expiredAt: Instant | null }`；登录状态记录：`{ loginStateId, accountId, issuedAt, revoked: boolean }`。**`producedAt`／`retentionDeadline`／`expiredAt`／`issuedAt`／`revoked` 是存储属性，不是契约「组成」的扩张**——`expiredAt` 是「已过留存期限」这条单调事实落盘的那一列，理由在[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)：[S-18 明写本契约拥有「那条记录的产生时刻」](../../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号)，[S-37 要求登录状态记录必须有签发时间](../../../../spec/capabilities/account-identity/v1/contract.md#s-37-列出本账号有效登录状态)，撤销是[持久记录](../../../../spec/capabilities/account-identity/v1/contract.md#s-10-撤销是持久记录不是内存生命周期)。`retentionDeadline` 在产生时定死的理由同在那一节 | 尚未实现 | S-11「无跨账号字段」由记录类型只含一个 `AccountId` 兑现，静态检查 SC-2（[identity-values](../../core/identity-values/design.md#静态检查义务怎么承载)）守；S-12「不含任何租户身份」同理——记录类型里没有 `TenantId`／`ScopeLayerIdentity` |
| [S-13](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 产生账号 | `accounts.produce(loginIdentifier, presentedCredential)`。三层次序写死在方法体：① 表示层解析（identity-values 的 `parseLoginIdentifier`；凭据形状由 `credentials.parse` 判）⇒ `invalid-input`；② `credentials.checkPolicy(policy, presented)` ⇒ `credential-rejected`；③ **一次存储提交**内：按标识**锁定读**记录（R-3）→ 不存在 ⇒ 插入新记录（含 `credentials.derive(presented)` 的材料、`producedAt = clock.now()`、`retentionDeadline = producedAt + unactivated_retention`、`expiredAt = null`）；存在且已激活 ⇒ `identifier-taken`；存在且未激活 ⇒ 先[落盘过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)（`expiredAt = null ∧ now > retentionDeadline` ⇒ 同提交写 `expiredAt = now`）：已过期 ⇒ `identifier-held-by-expired-record`（携 AccountId）；未过期 ⇒ `credentials.verify(material, presented)` 匹配则返回既有 AccountId（**不重判②**），不匹配 ⇒ `identifier-taken` | 尚未实现 | **幂等认回先于②这条例外要在③里判**，而②在③之前——两者不矛盾：②只对「要新建」的路径生效，实现顺序是：先解析 → 在提交内读记录 → **若能认回则直接返回，跳过政策** → 否则才判政策再插入。**这与契约列的「表示层 → 凭据合规 → 占用判定」在可观察结果上等价**（认回路径不经过②，其余路径②先于占用），但**实现的执行顺序不是字面顺序**，verification 的 S-34 第五支（不合规凭据撞已激活标识 ⇒ `credential-rejected`）正是为了核这一点：已激活的标识不能认回，所以必须先判政策再报占用。**标识唯一性靠存储的唯一约束**，不靠先查后写（[S-19](../../../../spec/capabilities/account-identity/v1/contract.md#s-19-登录标识部署内唯一) 保护点 1）；唯一约束冲突 ⇒ 在同一提交内重读并按上面分支收场 |
| [S-14](../../../../spec/capabilities/account-identity/v1/contract.md#s-14-激活账号) 激活 | `accounts.activate(accountId, activationWarrant)`。四层：表示层 → 存在性（提交内**锁定读**，R-3）→ `handoffWarrant.verify(activationKey, 'activation', accountId, warrant)`（[identity-values](../../core/identity-values/design.md#交接凭证走签名不走进程内登记)）⇒ `warrant-invalid` → 状态判定（先落盘过期事实；`expiredAt ≠ null` ⇒ `account-record-expired`；已激活 ⇒ `ok` 不写；未激活 ⇒ 置 `activated = true`）。**②③④与写入在同一提交** | 尚未实现 | 前置③「在自己那一次提交里现读」读的是**账号行上的事实** `expiredAt`，不是一个临时求值的时间谓词；「已激活」与「已过期」两个写入落在**同一行**，R-3 的行锁把它们与治理侧的现读（经 `accounts.read`）排成一个次序——这是 [S-43](../../../../spec/capabilities/account-identity/v1/contract.md#s-43-依据产出之后记录才过期) 第 2 支的兑现点，推理在[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词) |
| [S-15](../../../../spec/capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态) 登录 | `logins.issue(loginIdentifier, presentedCredential)`。表示层 ⇒ `invalid-input`；解析 `credentials`（**可选依赖，调用时解析**）缺席 ⇒ `storage-unavailable`；**一次提交**内：按标识读记录 → 不存在／`credentials.verify` 不匹配／未激活 ⇒ **同一个** `identifier-or-credential-rejected`（三支在一个 `switch` 里落到同一个字面量，没有子字段）；`verify` 返回 `unavailable` ⇒ `storage-unavailable`；通过 ⇒ 插入登录状态记录（`issuedAt = clock.now()`），返回 LoginStateId | 尚未实现 | **归属论证在[下节](#s-15-归本节点credentials-作可选依赖在调用时解析)**。「已激活读数与签发写入同提交域」（装配给）由 R-1／R-3 兑现。**不做**耗时对齐——契约明列时序侧信道不在范围 |
| [S-16](../../../../spec/capabilities/account-identity/v1/contract.md#s-16-撤销登录状态) 撤销 | `logins.revoke(targetLoginStateId, initiatorLoginStateId)`。四层：表示层 → 发起方有效性（提交内读发起方记录：存在 ∧ 未撤销 ∧ 所属账号已激活，否则 `not-authorized`）→ 目标存在性（`login-state-not-found`）→ 目标归属（`target.accountId ≠ initiator.accountId` ⇒ **同一个** `login-state-not-found`）→ 已撤销 ⇒ `ok`；否则置 `revoked = true`。提交后 `emit('login.revoked', { loginStateId, accountId })` | 尚未实现 | 「发起方就是刚被撤掉的那一个 ⇒ `not-authorized`」由第二层先读发起方兑现；「已撤销 ⇒ `ok`」只在两半授权都过之后——次序与契约逐字对齐，verification 登记一条重复退出的注入 |
| [S-17](../../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态) 校验 | `logins.verify(loginStateId)`。表示层 → 读登录状态记录 + 所属账号记录（**一次读，读写同源**）：查不到／已撤销／账号未激活 ⇒ **同一个** `login-state-rejected`；读不到 ⇒ `storage-unavailable`；通过 ⇒ AccountId。**无缓存**——方法体每次现读，不导出任何带 TTL 的变体 | 尚未实现 | 三出口一个都不放行：方法的返回类型是 `{ ok: AccountId } \| { failure: ... }`，没有默认分支返回 AccountId。「撤销提交之后每一次校验都看得到」由 R-3 兑现 |
| [S-18](../../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号) 读账号 | `accounts.read(accountId) → { activated, retentionExpired }`；`retentionExpired = expiredAt ≠ null`。读到 `¬activated ∧ expiredAt = null ∧ now > retentionDeadline` 时**在同一提交内先写 `expiredAt = now` 再返回**（锁定读 + 写，R-3）；写不进去 ⇒ `storage-unavailable`，不返回一个没落盘的「是」。**不返回**凭据材料、登录标识、`producedAt`、`retentionDeadline`、`expiredAt` 本身——返回类型只有两个布尔 | 尚未实现 | 性质 1（已激活恒为否）由「`activated` 与 `expiredAt` 在同一行、同一锁下互斥写入」兑现；性质 2（单调）由**事实落盘后不再依赖 `now`** 兑现，见[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)。**这个读面会写**——它是治理侧三个现读点（`og#S-20`／`#S-25`／`#S-53`）与本节点写入之间唯一的序列化点，读面不写就没有这个点。「持有 AccountId 即可读」本版不设授权判定——装配给（S-30 第 6 行），跨进程须发新版本 |
| [S-37](../../../../spec/capabilities/account-identity/v1/contract.md#s-37-列出本账号有效登录状态) 列表 | `logins.listEffective(callerLoginStateId)`。先走 S-17 的判定（拒绝 ⇒ `login-state-rejected`），通过则**同一次读**里查该账号 `revoked = false` 的全部记录，返回 `[{ loginStateId, issuedAt }]`。**读失败 ⇒ `storage-unavailable`**，方法体里没有一条路径返回空数组：成功路径的结果至少含调用方自己那条，若查出来为空即视作读失败（这是一条自检，不是新失败值） | 尚未实现 | 「不得返回空集」由上述自检兑现；两次读（校验 + 列表）落在同一次存储读事务里（R-3） |
| [S-38](../../../../spec/capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 清除 | `accounts.purge(accountId, purgeWarrant)`。四层：表示层 → 存在性（提交内锁定读；不存在则**先核依据**再 `ok`）→ `handoffWarrant.verify(purgeKey, 'purge', accountId, warrant)` ⇒ `purge-warrant-invalid` → 状态判定（先落盘过期事实；已激活 ∨ `expiredAt = null` ⇒ `not-expired`）→ 删除记录（**一行删除同时释放标识**：标识就在这一行上，没有第二张表要改）。**删除被存储的引用约束拒绝**（该账号的个人组织行仍指着它，R-7）⇒ `storage-unavailable`，不删、不发事件。提交后 `emit('account.expired', { accountId, loginIdentifier })`，幂等路径不发 | 尚未实现 | 「删记录与释放标识同提交」由**标识是记录的一列、唯一约束建在该列上**兑现——删除一行即释放，不存在两步；这是本节点选择「标识不单独建表」的直接理由。引用约束拒绝映射成 `storage-unavailable` 是诚实的：本节点不知道也不该知道谁在引用它，清除链把这一值归入抖动型、重扫一遍就收敛（[组合 S-34 三分类](../../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)），推理在[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词) |
| [S-26](../../../../spec/capabilities/account-identity/v1/contract.md#s-26-credential_policy) `credential_policy` | 本插件 config 的一项，**形状不透明**（`unknown`），原样交给 `credentials.checkPolicy`；本节点只保证「取不到 ⇒ `credential-rejected`」——config 缺该项时 S-13 的②一律拒绝，不跳过 | 尚未实现 | 政策的形状与判定归 [credential-verification](../credential-verification/design.md)；本节点是它的持有者与下发者，因为契约把参数归在这里 |
| [S-39](../../../../spec/capabilities/account-identity/v1/contract.md#s-39-unactivated_retention) `unactivated_retention` | 本插件 config 的一项，`Duration`，**加载时校验为正**，非正 ⇒ 插件体抛出、不 provide 任何服务（与 [offer-expiry 的默认值那一路](../../core/offer-expiry/design.md#能力到-cordis-的投影)同一做法，同一条待核对主张） | 尚未实现 | 「取不到 ⇒ `storage-unavailable`」在本设计下**不可达**：config 缺该项即启动失败，运行期永远取得到。契约那一支照写进失败集合，verification 记「由启动校验吸收，不可达」 |
| [S-14](../../../../spec/capabilities/account-identity/v1/contract.md#s-14-激活账号)／[S-16](../../../../spec/capabilities/account-identity/v1/contract.md#s-16-撤销登录状态)／[S-38](../../../../spec/capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 三个事件 | `account.activated`、`login.revoked`、`account.expired`：一律 `ctx.emit`，**提交之后**发，不 await 处理者 | 尚未实现 | 通知类 `emit` 与契约「不是控制点、无投递保证」对齐；`emit` 不等待返回 Promise（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md) 的 emit 行，probe 为 null，待核对主张）。**不开任何控制事件** |
| [S-22](../../../../spec/capabilities/account-identity/v1/contract.md#s-22-账号存在性不从登录路径泄漏) 第二处例外：`identifier-held-by-expired-record` 只流向组合 | 本节点**不区分调用方**（S-13 无授权前提）；「只有组合调 S-13」是装配给的：登录入口 inject `logins`，注册入口**不 inject `accounts`**；`accounts` 面本身有两个消费者（[account-registration](../account-registration/design.md) 用 `produce`／`activate`／`purge`，[organization-governance](../organization-governance/design.md) 只用 `read`），所以**按包 inject 查不出「谁调 `produce`」**，检查要落到**方法级**：仓库内 `accounts.produce(` 的调用点只在 account-registration | 尚未实现 | 这条是**装配纪律**，本节点兑现不了，只能在 verification 记一条方法级的结构检查。不为它把 `produce` 单列成一个服务名：S-53 单列（治理节点）是因为契约把「只由清除链调用」记成了一条装配给保证且那条操作没有任何授权前置；S-13 的对应保证（[S-30 第 8 行](../../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)）同样如此——**两处应当同形**，本节点选方法级检查而非单列，理由是 `produce` 与 `activate`／`purge` 有同一个消费者，单列不会让「谁够得着」比方法级检查更可见；治理节点若认为单列更好，两处一起改 |
| [S-35](../../../../spec/capabilities/account-identity/v1/contract.md#s-35-静态检查账号记录无跨账号关联字段)／[S-36](../../../../spec/capabilities/account-identity/v1/contract.md#s-36-静态检查失败集合闭合) 静态检查 | 失败类型一律**字面量联合**，每个方法的返回类型精确到契约列的集合，无 `string`、无 `other`；lint 查「八个方法的失败字面量集合 = 契约集合」 | 尚未实现 | 检查器尚不存在；identity-values 的 SC-2 覆盖 S-35 |

### S-15 归本节点，`credentials` 作可选依赖、在调用时解析

主线留的关键问题：S-15 由本节点提供并 inject `credentials`，还是由 credential-verification 提供并 inject `accounts`？本节点选**前者，但不用必需 inject**。

| | credential-verification 提供 S-15（落选） | **本节点提供 S-15，`credentials` 必需 inject** | **本节点提供 S-15，`credentials` 可选、调用时解析（选）** |
|---|---|---|---|
| 凭据材料的读取点 | 要经 `accounts` 的一个读面取出材料——[S-8 第 3 条明写没有任何读面能把它取出来](../../../../spec/capabilities/account-identity/v1/contract.md#s-8-凭据材料)，S-18 的返回里也没有它。**结构上违反契约** | 材料在本插件内读，不出服务面 ✓ | 同左 ✓ |
| 登录状态记录的提交点 | 由另一个插件写本契约拥有的记录；S-15 前置③（已激活）要与写入同提交，跨两个插件做不到同一提交（内核不提供跨 fiber 事务） | 同一插件、同一提交 ✓ | 同左 ✓ |
| SAF-2 同一失败值 | 「标识不存在」在 `accounts` 那边就得先暴露成一个可区分的值再由登录插件抹平——多一处可分辨的面 | 三支在一个方法体里折成一个字面量 ✓ | 同左 ✓ |
| 认证换代的重启半径 | 只重启 credential-verification ✓ | **换代 ⇒ 本插件重跑 ⇒ `accounts` 短暂非 `ACTIVE` ⇒ 治理插件也重跑**（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)：提供者非 ACTIVE 亦触发）。**正是 C 要收住的那个半径** | 换代时本插件不重跑；换代期间 S-13 的②③、S-15 的校验拿到 `unavailable` ⇒ 一律 `storage-unavailable`，**契约本来就规定了这个收场**（[S-15「凭据校验不可用 ⇒ `storage-unavailable`，不签发」](../../../../spec/capabilities/account-identity/v1/contract.md#s-15-验证凭据并签发登录状态)）。治理不受波及 ✓ |
| 启动期语义 | — | `credentials` 未就绪则本插件 `PENDING`，治理与注册连带 `PENDING`——登录不可用时**整个租户域不可用** | `credentials` 未就绪时**只有**登录与注册的凭据步骤失败，读账号、校验登录状态、治理全部照常——**这是产品要的分层**：认证坏了不该让已登录的人做不了事 |

**落选方（credential-verification 提供 S-15）的最强论证**：认证协议拥有登录流程——OIDC 是「拿断言换会话」，passkey 是「挑战—应答」，
登录流程的形状随认证方式变，把它放进随认证换代的那个插件最自然。
**它输在两条契约结构上**：凭据材料没有读面（S-8），登录状态的提交点归本契约（S-15）。要成立就得给契约开一个内部读面并把提交点让出去，那是两份契约改语义。

**本方弱点**：`credentials` 的接口（[credential-verification](../credential-verification/design.md)）要同时容纳「有存储材料」与「无存储材料」两类认证方式；
本版只有前者有依据，后者是**假设**。另一个弱点是可选依赖的机制形状：Cordis 4 的 `inject` 是否支持 `{ required: false }` 且不触发重跑，
**basis 没有条目，待核对主张**；核不到就退到 `ctx.get('credentials')` 在方法体内解析（同样不触发重跑，但失去类型检查）。置信度：**中高**——两条契约结构把落选方排掉了，剩下的只是可选依赖的机制细节。

### 「已过留存期限」是首次观测时落盘的单调事实，不是每次读时重算的谓词

契约把「已过留存期限」写成一个**单调**的读数（[S-18 性质 2](../../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号)），并要求三个判定点——本节点 [S-14](../../../../spec/capabilities/account-identity/v1/contract.md#s-14-激活账号) 前置③、治理 [`og#S-20`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 前置②、[`og#S-53`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)——各自「在自己的提交里现读」且读到同一个答案（[S-30 第 7 行](../../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)）。
**一个每次读时重算的时间谓词 `now > retentionDeadline` 给不了这个**，即使存储是可串行化的：`now` 不是存储对象，两个事务各自读到的 `now` 不参与冲突检测。具体的交错：

- **(a) 激活 vs 清除**：S-14 在自己的事务里读到 `now = t₁ < retentionDeadline`；期限过去；另一次同标识注册在 S-13 撞上 `identifier-held-by-expired-record`、就地跑清除链，`og#S-53` 读到 `now = t₂ > retentionDeadline`、删掉个人组织并提交；S-14 随后提交激活。终态：**已激活、没有个人组织**，组合 [S-13](../../../../spec/compositions/account-registration/v1/contract.md#s-13-一个可用账号有且仅有一个个人组织) 被破，且此后 S-38 会以 `not-expired` 永远停住。行锁挡不住它：S-14 与 S-53 之间没有共同写入的存储对象。
- **(b) 创建个人组织 vs 清除**：`og#S-20` 读到「未过期」但尚未提交；`og#S-53`→S-38 完整跑完（账号行被删）；S-20 提交组织行。终态：**个人组织存在、账号不在**，组合 [S-35](../../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿) 被破，且按契约谁也再清不掉（S-53 的 ⑦乙把它记成缺陷）。

本节点的兑现方式是**把「已过期」变成账号行上的一列事实**，让所有判定点读的是同一个存储对象：

1. **`expiredAt: Instant | null`**。`retentionExpired ≝ expiredAt ≠ null`。
2. **首次观测者落盘**：任何一次需要这个判定的读（S-13 占用分支、S-14 ③、S-18、S-38 ③）在提交内**锁定读**账号行（R-3），读到 `¬activated ∧ expiredAt = null ∧ now > retentionDeadline` 就在同一提交内写 `expiredAt = now`，再据它判定。此后 `now` 与它无关。
3. **同一行、同一锁**：`activated` 与 `expiredAt` 两个写入落在同一行，R-3 的行级写锁把「激活」与「落盘过期」排成一个次序——(a) 里要么 S-53 经 `accounts.read` 先落盘过期、S-14 再读到 `account-record-expired`；要么 S-14 先激活、S-53 再读到 `accountIsActivated`。**两个终态都是契约允许的**，第三种不存在。
4. **组织行引用账号行**（R-7，与治理节点[对存储的共同要求](../organization-governance/design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)）：`organization.ownerAccount` 是指向账号行的引用约束，删除受限。(b) 里要么 S-38 先删、S-20 的插入被约束拒绝而重读到 `account-not-found`；要么 S-20 先插、S-38 的删除被拒绝成 `storage-unavailable`，清除链按抖动型重扫——这一次 S-53 读到已落盘的过期事实与那个组织，删掉它，S-38 再成。**孤儿状态不可达**，不靠任何进程内锁。

**为什么不是进程内临界区**：锁的实例随插件实例生灭（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)），在途持锁者与新实例互不相知，(b) 正是它的失败形态；而且 S-14 与 S-53 在两个插件里，临界区要么跨插件共享一个 core 模块（一条没有契约的隐式依赖），要么什么也保护不了。
**为什么不是跨插件事务句柄**：那要把存储事务焊进 `accounts` 的公开面，两份契约改公开面，且跨进程后整套形状作废；而行上的事实在跨进程后**仍是同一种机制**——[S-30 第 7 行右列](../../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)自己就把「把『已过期』改写成一个由单点判定并携带的事实」列为协议给的做法，本节点在单机上就采用它。
**代价**：S-18 读面偶尔会写一次（每条过期记录恰一次）；`accounts.read` 的失败集合里 `storage-unavailable` 多了一个来路（写不进事实）。契约允许——它本来就规定读不到即 `storage-unavailable`。

**`retentionDeadline` 仍在产生时定死**（`producedAt + unactivated_retention`），认回路径不改它（[S-13 幂等重入不重新计时](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活)）。**但这一条现在只是政策候选，不再是单调性的来源**：事实一旦落盘就不受参数影响，所以「读时用当前参数算 `producedAt + retention`」与「定死」**两种算法在本设计下都满足 [S-39](../../../../spec/capabilities/account-identity/v1/contract.md#s-39-unactivated_retention)「调长不得翻回」**。两者的差别只在**未落盘的**记录上：定死 ⇒ 参数变更只影响此后产生的记录；读时算 ⇒ 参数变更影响此后的判定（调短会让既有未激活记录提前到期，调长会推迟尚未到期的）。契约 S-39 写的「变更只影响此后的判定」两种读法都通，**选哪种是政策，报 spec owner**（[verification.md 覆盖缺口](verification.md#覆盖缺口)）；本节点默认定死，裁为「此后的判定」时只换第 2 步里那个比较式，机制不变。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values/v1` 七条（S-1、S-2、S-9、S-30、S-31、S-33、S-35） | 包依赖 [identity-values](../../core/identity-values/design.md)：品牌类型、解析入口、`handoffWarrant.verify` | 随包版本 | — |
| 存储（**无契约**，候选服务名 `storage`） | **必需 inject**。要求清单见[下节](#对存储提供者的要求清单)；提供者归装配 | 提供者换代 ⇒ 本插件重跑（可承受：插件体只做 provide 与 config 校验，无闭包状态） | 缺席 ⇒ `PENDING`，两个服务面都不可见 ⇒ 消费者按各自契约明确失败（治理 [S-43](../../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)）。**这正是契约 S-28 要的收场** |
| 时间源（候选服务名 `clock`，形状定义在 [offer-expiry](../../core/offer-expiry/design.md#能力到-cordis-的投影)） | **必需 inject**。本版单机一个实例，由装配 provide；`now()` 返回 `'unavailable'` 时 S-13 新建路径与四个可能落盘过期事实的读 ⇒ `storage-unavailable` | 装配启动时 provide，本版不换代 | 缺席 ⇒ `PENDING`。`now` 只在**首次落盘过期事实**与写 `producedAt`／`issuedAt` 时被读；S-18 性质 2 的单调**不再以「`now` 不后退」为前提**（事实落盘后与 `now` 无关），时钟质量只影响「首次观测早了还是晚了」 |
| `credentials`（[credential-verification](../credential-verification/design.md)） | **可选依赖，调用时解析**；理由见[上节](#s-15-归本节点credentials-作可选依赖在调用时解析) | 换代不重跑本插件 | 缺席 ⇒ S-13 的②③与 S-15 的校验一律 `storage-unavailable`——**验证器不在，是判不出来，不是判为不合规**（[S-27](../../../../spec/capabilities/account-identity/v1/contract.md#s-27-缺席时的默认答案)「授权结论与判不出来永远是两个值」；那一表里 `credential-rejected` 对应的是 `credential_policy` 取不到，不是验证器缺席）；**S-14／S-16／S-17／S-18／S-37／S-38 不受影响** |
| 两把公钥（`activation`、`purge` 的验证密钥） | **插件私有 config**，由装配下发；密钥是**部署配置输入**，不在启动时生成（[identity-values](../../core/identity-values/design.md#依赖作用域与绑定)） | 加载时校验形状 | 缺任一把或形状不对 ⇒ **启动失败**（插件体抛出、不 provide）。密钥缺失是配置错误，与 `unactivated_retention` 非正同一收场；三个持钥节点同一政策——一份漏配的部署不该半开着跑、把配置错报成运行期抖动 |
| `credential_policy`（S-26）、`unactivated_retention`（S-39） | 插件 config | 加载时；`unactivated_retention` 非正 ⇒ 启动失败 | `credential_policy` 缺 ⇒ S-13 ② 一律 `credential-rejected`（契约 S-27 明写的收场，不启动失败） |

### 对存储提供者的要求清单

本次不选数据库。以下每条是**本节点对 `storage` 服务的要求**，实施时由装配选的提供者逐条满足，缺一条本节点的对应条款就不成立。

| # | 要求 | 对应条款 |
|---|---|---|
| R-1 | **单次提交原子**：一次提交内的多条读写要么全成立要么全不成立；提交前的读与写在提交失败时不留痕迹 | S-13／S-14／S-15／S-16／S-38 的提交点；S-30 第 4 行 |
| R-2 | **唯一约束**：账号记录的 `loginIdentifier` 列部署内唯一，违反时提交失败并可被本节点识别为「唯一冲突」；`accountId`、`loginStateId` 各为主键。**标识由本节点在提交内生成**（identity-values 候选：128 位 CSPRNG），唯一性由主键约束兑现、不由随机性兑现——碰撞 ⇒ 提交失败 ⇒ `storage-unavailable`（契约 S-4 写「由存储生成」，本节点读作「在存储提交内生成并由存储约束保证唯一」，措辞报 spec owner） | [S-19](../../../../spec/capabilities/account-identity/v1/contract.md#s-19-登录标识部署内唯一)；[`iv` 第六节第 1 行](../../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)；S-30 第 1 行 |
| R-3 | **提交内读写同源、行级写锁从读起**：提交内读到的是所有已提交写的最新值；一个提交要写某一行，它对该行的读就是锁定读（`SELECT … FOR UPDATE` 一类，或可串行化隔离下冲突即重试），并发提交在同一行上排成一个次序，先读后写的窗口不存在。**账号行的四个读点（S-13 占用分支、S-14、S-18 可能落盘时、S-38）都是锁定读** | S-14 前置③、S-43 第 2 支；[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)；S-17／S-37「不存在读到一半的撤销」；S-30 第 2、3、5、7 行 |
| R-4 | **持久**：提交成立后跨进程重启仍在 | [S-10](../../../../spec/capabilities/account-identity/v1/contract.md#s-10-撤销是持久记录不是内存生命周期)、S-32 |
| R-5 | **不可用可识别**：读写失败作为一个可区分的错误返回，不返回空结果、不返回旧快照 | [S-27](../../../../spec/capabilities/account-identity/v1/contract.md#s-27-缺席时的默认答案) 存储行；S-37「不得返回空集」 |
| R-6 | **删除即释放**：删除一行后 R-2 的约束立即允许同值再插入，无延迟 | S-38、S-30 第 5 行 |
| R-7 | **账号行可被别的节点的表以引用约束指向，删除受限**：本版是治理节点的 `organization.ownerAccount`（[那边的 R-6](../organization-governance/design.md#对存储提供者的要求清单)）。被拒绝的删除作为可区分错误返回，本节点映射为 `storage-unavailable`；本节点不知道引用者是谁。**这是两个节点对同一存储提供者的共同要求，装配给**（同一存储、同一约束域）；跨进程后由协议重给 | 组合 [S-35](../../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿)；[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词) 第 4 点 |

## 状态、并发与失败映射

**抽象状态 → 存储**：账号的两态是 `activated` 一列；「已过留存期限」是 `expiredAt` 一列（首次观测时落盘，[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)）；登录状态的两态是 `revoked` 一列。
**写权**：全部在本插件的八个方法内，没有第二个写者；`accounts.read` 也可能写（落盘过期事实），仍在本插件内。
**提交点**：每个写操作恰一次 `storage` 提交，方法在提交返回后才 `emit` 事件；`accounts.read` 落盘时也是一次提交，不发事件。

**并发**：R-3 把契约要求的三处交错（S-14 vs 清除链、S-16 vs S-17、S-13 两个同标识并发）都落到存储的**同一行**；跨节点的两处交错（激活 vs 清除、创建个人组织 vs 清除）由行上的过期事实 + R-7 收住。本节点**不加进程内锁**——进程内锁随实例生灭、在跨进程时静默失效，而 R-3／R-7 的要求在跨进程时会被明确核对。

**失败映射**：`storage` 返回不可用 ⇒ 八个操作各自的 `storage-unavailable`；`clock` 不可用 ⇒ 四个读期限的操作 `storage-unavailable`；`credentials` 缺席／不可用 ⇒ 见依赖表；identity-values 解析失败 ⇒ `invalid-input`。**没有 catch-all**：方法体的 `catch` 只捕获 `storage` 声明的错误类型，其余异常上抛（那是缺陷，不是失败集合的成员）。

**S-30 九行装配给，本版由谁给**：第 1 行 R-2；第 2、3、5 行 R-3+R-6；第 4 行 R-1；第 6 行装配（只在同一部署内传递 AccountId，本节点不判定）；第 7 行**账号行上的过期事实**（R-3 锁定读 + R-7）——契约右列自己列的「由单点判定并携带的事实」，本版在单机上就这么做，「同一时间源 + 同一参数源」不再是它的前提；第 8 行装配纪律（`accounts.produce` 的调用点只在组合，方法级检查）；第 9 行签名密钥私有（identity-values 节点）。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（`unactivated_retention` 为正、两把公钥存在且形状对） | 插件体开头；失败即抛出，fiber 不进 `ACTIVE`（**待核对主张**：插件体抛出后的 fiber 状态） | 无部分状态 | — |
| `ctx.provide('accounts')`、`ctx.provide('logins')` 两个服务实例 | 本 fiber；`ACTIVE` 后消费者可解析 | 第二个 provide 失败 ⇒ 插件体抛出，第一个随 fiber 卸载被撤（provide 走 effect 纳管，**待核对主张**：`ctx.provide` 是否自动登记 disposer） | 撤除：服务从 store 消失，消费者按 basis 重跑或 `PENDING`；**在途调用跑完**——内核不取消在途调用，服务对象仍在调用方的闭包里，每个调用的收场由它那一次 `storage` 提交决定（成立或无痕），本节点不做取消、不做排空；**保留**：全部记录（契约 S-28：没有需要交接的在途工作） |
| 无定时器、无后台任务、无连接池（连接归 `storage` 提供者） | — | — | — |

撤除不做排空：契约明写每个操作要么已提交要么无痕，没有「提交了一半」。

## 实施缺口与消费者影响

- **可选依赖的机制形状**（`inject` 的 `required: false` 语义、`ctx.provide` 的 disposer、插件体抛出后的 fiber 状态）：三条待核对主张，按 source-check 对 4.0.2 源码取证后回填 basis。owner：本节点。
- **G-2 标识形式**：采用 identity-values 节点的候选（128 位 CSPRNG），不可枚举 ⇒ S-18「持有即可读」的论证成立；G-04 裁定前是候选。
- **S-39 政策**（「此后的判定」vs「此后产生的记录」）：两种读法在本设计下都可实现（[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)末段），选哪种是政策，报 spec owner；本节点默认定死。
- **R-7 是跨节点的存储约束**：组织行引用账号行，由装配选的存储提供者在同一约束域内兑现；装配节点尚未为本批建立。契约 S-30 第 7 行左列写的「同一时间源 + 同一参数源」是旧的兑现描述，本节点实际用的是右列那种「由单点判定并携带的事实」——措辞报 spec owner（不改语义）。
- **`credentials` 接口对无存储材料认证方式的适用性**：假设，落包前由 credential-verification 节点给出至少一个反例分析。
- **消费者**：treatment of `accounts` 缺席已由治理契约 S-43、组合契约 S-23 各自写明；本节点不另加。
