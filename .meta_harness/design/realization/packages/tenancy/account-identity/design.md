# account-identity 实现设计

## 实现路径与来源

**自建一个 Cordis 插件。**契约拥有的是账号记录与登录状态记录的**持久语义**（九个操作各自的提交点、闭合的失败集合、单调的「已过留存期限」、出示物只交出一次且不保存），
没有现成库表达这些；能复用的部分是存储与时间源（**别的提供者**，见[依赖](#依赖作用域与绑定)），以及 Node 内置的密码学随机源与 SHA-256（`node:crypto`）。
不 fork 任何 DSH 上层包：DSH 没有账号身份这一层。

**一个插件、一条 fiber、两个服务面。**C 装配草图给了一个 P-A，本节点不再拆：
S-15 签发登录状态时要在**同一次提交**里现读账号的激活状态（[契约 S-15「装配给」行](../../../../spec/capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态)），
两张记录同存储、同提交域，拆成两个插件只会在中间造出一条 inject 边而收不回任何独立变化原因——账号事实与登录状态的消费者确实不同（治理只要 `accounts`，登录入口只要 `logins`），
**但消费者不同只是 #8 的两个条件之一**，独立变化原因这一条不成立（两者随同一份产品正文变）。

**兑现哪一版**：本页按 `capability.account-identity` **v2**（`accepted`，D-028）写。v2 与 v1 条款号恒等对应，
下表只在 v2 改写或新增的行标「**v2 差异**」，其余行在两版里逐字相同（[v2 §十 逐条差异](../../../../spec/capabilities/account-identity/v2/contract.md#逐条差异)）。
钉 v1 的两个消费者（organization-governance、account-registration）消费的条款在 v2 里判定逐字相同，同一份实现对它们也兑现 v1；
**v1 S-15 的返回形状（只有 LoginStateId）与 v1 S-17「持有即被认」的位置，本节点不再兑现**——v1 S-15 的唯一消费者是登录入口，入口节点已改按 v2 写。

**v2 不改插件边界**：S-44 是 `logins` 上的一个方法；出示物的产生与派生是方法体内的纯计算加 Node 内置随机源，不是 Cordis 服务。没有新 inject、新 effect、新事件、新 config。

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（D-025）。本节点依赖的内核语义逐条引 basis，所引六条都有 4.0.4 上通过的 probe。

## 能力到 Cordis 的投影

插件 `accountIdentityPlugin`（插件名 `account-identity`，`inject: ['storage', 'clock']`，config `AccountIdentityConfigSchema`）provide 两个服务：`ACCOUNTS_SERVICE`＝`'accounts'` 承 S-13／S-14／S-18／S-38（实现类 `AccountsImpl`，`src/accounts.ts`），`LOGINS_SERVICE`＝`'logins'` 承 S-15／S-44／S-16／S-17／S-37（实现类 `LoginsImpl`，`src/logins.ts`）。服务名、方法名、类型名是实名，源码已实现（HUB `c9b5850`）；表里「已实现」一格指向源码位置，验证登记见 [verification.md](verification.md)。
契约的九件事（前置、次序、失败集合、幂等、缺席默认……）**本表不复述**，只写每条在本节点上的兑现点与缺口。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-4](../../../../spec/capabilities/account-identity/v2/contract.md#s-4-账号记录)／[S-9](../../../../spec/capabilities/account-identity/v2/contract.md#s-9-登录状态记录) 两条持久记录。**v2 差异（S-9）** | 账号记录：`{ accountId, loginIdentifier, credentialMaterial, activated: boolean, producedAt, retentionDeadline, expiredAt: Instant \| null }`；登录状态记录：`{ loginStateId, accountId, issuedAt, revoked: boolean }`——**字段与 v1 设计相同，`loginStateId` 写进去的值换成出示物的派生值**（下一行）；记录里没有出示物，也没有第二个由它得来的字段。**`producedAt`／`retentionDeadline`／`expiredAt`／`issuedAt`／`revoked` 是存储属性，不是契约「组成」的扩张**——`expiredAt` 是「已过留存期限」这条单调事实落盘的那一列，理由在[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)：[S-18 明写本契约拥有「那条记录的产生时刻」](../../../../spec/capabilities/account-identity/v2/contract.md#s-18-读账号)，[S-37 要求登录状态记录必须有签发时间](../../../../spec/capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态)，撤销是[持久记录](../../../../spec/capabilities/account-identity/v2/contract.md#s-10-撤销是持久记录不是内存生命周期) | 已实现（`src/schema.ts` 的 `AccountRow`／`LoginStateRow`）；表形状见[存储形状](#持久记录的存储形状与迁移片段) | S-11「无跨账号字段」由记录类型只含一个 `AccountId` 兑现，静态检查 SC-2（[identity-values](../../core/identity-values/design.md#静态检查义务怎么承载)）守；S-12「不含任何租户身份」同理。「没有第二个由出示物得来的字段」由记录结构静态检查守（[verification](verification.md#证据义务)） |
| **v2 新增** [S-45](../../../../spec/capabilities/account-identity/v2/contract.md#s-45-登录状态出示物) 出示物与派生规则 | 包内三个纯函数（`src/presentation.ts`）：`generatePresentation(random)`——从随机源取 `PRESENTATION_RANDOM_BYTES`＝32 个字节（256 位，恰为契约下限；**包内常量，不是 config**：可配就可能配到下限以下；随机源交回的字节数不对同样抛出——短了的源就是低熵的源）编码为 **base64url 无填充**（43 个字符，字母表 `A`–`Z`、`a`–`z`、`0`–`9`、`-`、`_`）；`parseLoginStatePresentation(value)`——S-45 交换表示的**全部**四条：identity-values 的 `parseOpaqueIdentifier`（非空、首末不在 [IV S-31](../../../../spec/data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 的空白码点表里，同一个函数），再加本契约比 S-31 多的两条——不含孤立代理码点（`String.prototype.isWellFormed`）、至多 `MAX_PRESENTATION_SCALAR_VALUES`＝1024 个标量值；`deriveLoginStateId(p)`——`createHash('sha256').update(p, 'utf8').digest('hex')`，以 `LoginStateId` 品牌返回，**是本包里除 `parseLoginStateId` 之外唯一构造 LoginStateId 的地方**。出示物是品牌类型 `LoginStatePresentation`，与 `LoginStateId` 互不可赋值 | 已实现（`src/presentation.ts`）；`node:crypto`（Node ≥ 24 内置） | **只交出一次、永不保存**由持有范围兑现：出示物只活在 `issue` 的局部变量与返回值、`exchange` 的局部变量里，**不进任何存储语句、事件载荷、日志与错误说明**（表示层拒绝的说明只写种类与原因、不带值）；日志与错误说明这一半另由两形静态守——`LoginStatePresentation` 的值不得作为日志、`emit` 与错误构造的实参：类型一形是本包诊断外观（`src/diagnostics.ts` 的 `Diagnostics`、`defect`、`Notifier`）的参数类型把出示物品牌排除（`tests/types.spec-d.ts` 守），文本一形是 ts-checks 规则 `no-presentation-in-diagnostics`（[verification](verification.md#证据义务)），S-46 ② 的翻查仍保留，作兜底。**生成与派生不出包**，理由是 [S-44 写明的那一条](../../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份)：导出派生函数就在本契约之外放了第二份派生规则——不导出只保证派生规则在本包之外没有第二份。**它不是访问控制**：派生式在 S-45 公开、`node:crypto` 人人可用，谁都能自己算出 LoginStateId；挡「自己算出再调 S-17」这条绕行的是品牌参数与接收边界包的文本规则（S-17 行），不是不导出。**表示层解析与类型出包**（[公开入口](#公开入口导出与类型)）：入口层判出示物的表示层要用「就是 AI S-44 的那一条」，导出同一个函数，规则就只有一份；解析不派生，导出它不开绕行。派生只收过了解析的值，所以「UTF-8 对孤立代理项无定义」在本节点不出现。**线上形状的对齐义务**：生成的出示物须落在入口契约 Schema 的出示物形状里（IV S-31 码点表内的非空字符串），也落在 S-45 更窄的交换表示里——43 个 ASCII 字符，没有空白、没有代理码点、远小于 1024，本节点签发的值本身满足；换表示前先核这一条（[入口节点的对齐义务](../governance-center-entry/design.md#出示物的线上形状对齐义务)）。证据：熵审阅、生成形状单测、已知答案向量、记录结构静态检查、S-46、S-47。两条 Node 行为是**假设，须按 source-check 取证**，各有一条会失败的单测守：`randomBytes` 失败即抛出、不静默降级；`base64url` 编码不带填充 |
| [S-13](../../../../spec/capabilities/account-identity/v2/contract.md#s-13-产生账号未激活) 产生账号 | `accounts.produce(loginIdentifier, presentedCredential)`。**凭据的比对、政策与派生都在写事务之前**（[R-8](#对存储提供者的要求清单)）：① 表示层解析（identity-values 的 `parseLoginIdentifier`；凭据形状由 `credentials.parse` 判）⇒ `invalid-input`；② **快照**：一次 `storage.read` 按标识读记录，分四类——**无**；**已激活**；**已过期**（未激活，且 `expiredAt ≠ null` 或 `now > retentionDeadline`）；**未过期**（其余）。未过期 ⇒ `credentials.verify(material, presented)`，`match` ⇒ **认回路径**，不判政策；其余 ⇒ `credentials.checkPolicy(policy, presented)`，不合规 ⇒ `credential-rejected`（不开写事务）；合规且快照为「无」⇒ `credentials.derive(presented)` 得材料。`credentials.verify`／`derive` 得 `unavailable`、快照读不到或 `clock` 不可用 ⇒ `storage-unavailable`；`credentials.checkPolicy` 得 `unavailable`（政策不合形状）或政策缺省 ⇒ `credential-rejected`（[契约 S-27](../../../../spec/capabilities/account-identity/v2/contract.md#s-27-缺席时的默认答案)「`credential_policy` 取不到 ⇒ `credential-rejected`」；实现 2026-09-23 按此，理由字面 `credential-policy-unavailable`）；③ **一次 `storage.write`**：按标识**锁定读**（R-3），当前记录与快照**是同一行**（都无，或同一 AccountId）**且同一类** ⇒ 按类收场：无 ⇒ 插入新记录（②的材料、`producedAt = clock.now()`、`retentionDeadline = producedAt + unactivated_retention`、`expiredAt = null`）；已激活 ⇒ `identifier-taken`；已过期 ⇒ 先[落盘过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)（`expiredAt = null` 则同提交写 `expiredAt = now`）⇒ `identifier-held-by-expired-record`（携 AccountId）；未过期 ⇒ 认回路径返回既有 AccountId（**不判政策**、不写），否则（快照比对为 `mismatch`）⇒ `identifier-taken`。**不是同一行或换了类**（含新建时撞 `account_login_identifier_unique`）⇒ 本事务不写，**从②重来一次**；再变 ⇒ `storage-unavailable`（总尝试次数 `PRODUCE_ATTEMPTS`＝2，用尽记一条 `produce-contended` 诊断）。`identifier-held-by-expired-record` 携那条记录的 AccountId（`expiredRecord`），`credential-rejected` 携政策给的 `reason` | 已实现（`src/accounts.ts`、`src/records.ts`） | **判定用快照，在提交内确认。**政策判定与派生不依赖那一行；比对依赖，而它是「那一行的材料」与「本次凭据」的纯函数：材料列只在插入时写一次、此后没有任何语句改它（候选文本规则，尚未实现：本包对 `credential_material` 只有插入），AccountId 不复用（[IV S-1](../../../../spec/data/identity-values/v1/contract.md#s-1-accountid)）——提交内锁定读确认「同一行、同一类」，就确认了快照上那次比对对提交时的状态仍然成立：前置与写入仍在同一次提交内被确认（[S-30 第 4 行](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)），挪到提交之前的只是 `credentials` 的计算。**不写的收场**（`credential-rejected`、②里的 `storage-unavailable`）以快照那次读为线性化点：它们不改任何事实，快照时就是对的。**次序**：认回在政策之前判出、跳过政策，其余路径政策先于占用——与契约「表示层 → 凭据合规 → 占用判定」加认回例外在可观察结果上等价，但**执行顺序不是字面顺序**，verification 的 S-34 第五支（不合规凭据撞已激活标识 ⇒ `credential-rejected`）正是为了核这一点。**标识唯一性靠存储的唯一约束**，不靠先查后写（[S-19](../../../../spec/capabilities/account-identity/v2/contract.md#s-19-登录标识部署内唯一) 保护点 1）。**重来至多一次**：再变说明在一次凭据计算的窗口里同一标识上又有别的提交，这一次判不出来 ⇒ `storage-unavailable`，与写锁等满上限同一种收场（[S-27](../../../../spec/capabilities/account-identity/v2/contract.md#s-27-缺席时的默认答案)「写不进」一行），调用方按抖动重试；交错见[状态与并发](#状态并发与失败映射) |
| [S-14](../../../../spec/capabilities/account-identity/v2/contract.md#s-14-激活账号) 激活 | `accounts.activate(accountId, activationWarrant)`。四层：表示层 → 存在性（提交内**锁定读**，R-3）→ `handoffWarrant.verify(activationKey, 'activation', accountId, warrant)`（[identity-values](../../core/identity-values/design.md#交接凭证走签名不走进程内登记)）⇒ `warrant-invalid` → 状态判定（先落盘过期事实；`expiredAt ≠ null` ⇒ `account-record-expired`；已激活 ⇒ `ok` 不写；未激活 ⇒ 置 `activated = true`）。**②③④与写入在同一提交** | 已实现（`src/accounts.ts`） | 前置③「在自己那一次提交里现读」读的是**账号行上的事实** `expiredAt`，不是一个临时求值的时间谓词；「已激活」与「已过期」两个写入落在**同一行**，R-3 的行锁把它们与治理侧的现读（经 `accounts.read`）排成一个次序——这是 [S-43](../../../../spec/capabilities/account-identity/v2/contract.md#s-43-依据产出之后记录才过期) 第 2 支的兑现点，推理在[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词) |
| [S-15](../../../../spec/capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态) 登录。**v2 差异** | `logins.issue(loginIdentifier, presentedCredential) → { presentation, loginStateId }`。表示层：`parseLoginIdentifier` 不过或凭据缺席 ⇒ `invalid-input`；解析 `credentials`（**可选依赖，调用时解析**）缺席 ⇒ `storage-unavailable`——凭据的词法判据归它的 owner（`credentials.parse`，[credential-verification](../credential-verification/design.md#能力到-cordis-的投影)），owner 不在就判不出来，不是 `invalid-input`；`credentials.parse` 不过 ⇒ `invalid-input`。**事务外**：一次 `storage.read` 按标识读记录得快照（读不到 ⇒ `storage-unavailable`）→ 不存在 ⇒ `identifier-or-credential-rejected`；存在 ⇒ `credentials.verify(快照的材料, presented)`：`mismatch` ⇒ `identifier-or-credential-rejected`，`unavailable` ⇒ `storage-unavailable`。**`match` 才开一次 `storage.write`**：按标识**重读**账号行——**是快照那一行（同一 AccountId）且已激活** ⇒ `issuedAt = clock.now()` → **产生出示物**（随机源抛出 ⇒ `storage-unavailable`，不换任何别的来源）→ 派生 `loginStateId` → **普通插入**登录状态行（撞 `login_state_pkey` ⇒ `UniqueViolation` ⇒ `storage-unavailable`：不 upsert、不 `ON CONFLICT`、不读回既有行）→ 事务函数**以返回值**交出 `{ presentation, loginStateId }`；**否则**（行已不在、换成了另一行、仍未激活）⇒ `identifier-or-credential-rejected`。不存在、`mismatch`、未激活三支落在一个 `switch` 的同一个字面量上，没有子字段。`storage.write` 成立之后方法才返回；提交失败 ⇒ `storage-unavailable`，那份出示物随局部变量作废 | 已实现（`src/logins.ts`） | **归属论证在[下节](#s-15-归本节点credentials-作可选依赖在调用时解析)**。**「已激活」读数与签发写入同提交**（契约第 9 格要的就是这一条）由事务内重读 + R-1／R-3 兑现。**凭据校验在事务外、对快照做**：第 9 格的同提交要求不含它；它是「那一行的材料」与「本次凭据」的纯函数，材料列插入后不改、AccountId 不复用，事务内确认是同一行即确认那次比对对提交时的状态仍成立（S-30 第 4 行的前置仍在提交内被确认，见 S-13 行）。**两次读之间记录变了**，按失败集合收：行被 S-38 清除 ⇒ 标识不存在 ⇒ `identifier-or-credential-rejected`；清除后被另一次注册占用（另一个 AccountId，哪怕已激活）⇒ 同一个值——快照那一行能被清除，说明它快照时未激活（已激活的行不回退、不消失，[S-20](../../../../spec/capabilities/account-identity/v2/contract.md#s-20-已激活不回退不消失)），「未激活 ⇒ 拒绝」在快照那一刻成立，拒绝不写任何东西，以快照为线性化点；快照时未激活、提交时已激活（中间有一次 S-14）⇒ 照常签发，三条前置在提交时都成立。快照已激活时「否则」一支不可达（S-20 加 R-2）。不存在与 `mismatch` 两支不开写事务，同样以快照为线性化点。**出示物在一切判定通过之后才产生**：凭据错的调用不消耗随机源，随机源不可用也盖不住一次判定结论。**以事务函数的返回值交出**，不先赋给外层变量：存储提供者若重跑事务函数，交出的恒是提交成立的那一次产生的出示物。失败集合与 v1 相同，两个新来路（随机源、派生值碰撞）都收成既有的 `storage-unavailable`（[S-27](../../../../spec/capabilities/account-identity/v2/contract.md#s-27-缺席时的默认答案) 末行）。**不做**耗时对齐——契约明列时序侧信道不在范围 |
| **v2 新增** [S-44](../../../../spec/capabilities/account-identity/v2/contract.md#s-44-按出示物换取身份) 按出示物换取身份 | `logins.exchange(presentation: unknown) → { loginStateId, accountId }`，失败 `login-state-rejected`／`invalid-input`／`storage-unavailable`（入口节点已按此名写）。① `parseLoginStatePresentation` 不过（缺席、空、含孤立代理码点、超过 1024 个标量值、首或末是空白）⇒ `invalid-input`，**不读存储**；② `deriveLoginStateId`（纯计算，与签发用的是同一个函数）；③ 以派生值调**与 S-17 共用的内部判定**（`judgeLoginState(tx, loginStateId)`，`src/records.ts`：一次 `storage.read` 读登录状态行与所属账号行；查不到／已撤销／账号未激活 ⇒ `login-state-rejected`，读不到 ⇒ `storage-unavailable`）⇒ 通过即 `{ loginStateId: 派生值, accountId }`。**无缓存**、不发事件、不记日志 | 已实现（`src/logins.ts`） | 「这一次判定就是 S-17 的判定」由**同一个函数**兑现，不是两份照抄的判据。内部判定的返回类型里没有 `invalid-input`，契约表里「S-17 出口 `invalid-input` ⇒ 结构上到不了」由类型兑现，不需要运行期分支。**不设捷径**：不因输入「长得像 LoginStateId」或含非 ASCII 字符就不查而拒——那是 S-17 判定之外的第二个条件（契约「不另设任何条件」），还会把存储读不到时的答复从 `storage-unavailable` 改成 `login-state-rejected`；拿 LoginStateId 冒充出示物自然落进「查不到」。证据：契约义务 S-44 ①–⑥ 与本节点加的第 ⑦ 支（[verification](verification.md#证据义务)） |
| [S-16](../../../../spec/capabilities/account-identity/v2/contract.md#s-16-撤销登录状态) 撤销。**v2 差异（来源要求只及发起方）** | `logins.revoke(target: unknown, initiator: LoginStateId)`（[类型见公开入口](#公开入口导出与类型)）。**发起方是品牌类型**——契约「发起方 LoginStateId 按来源读」在本节点的兑现（理由见[选择](#v2-的四处选择)）；**目标是 `unknown`**——契约写明目标不是秘密、可以来自线上载荷，调用方原样交进来，不必解析、不必断言品牌。**两个参数的表示层都由本方法自己做**：`parseLoginStateId`，只用 IV S-31，**不收紧到「64 个小写十六进制」**（S-45 明令：治理侧「`invalid-input` 那一支到不了」的论证靠两侧同一条词法）；任一不合 ⇒ `invalid-input`（契约第 7 格），排在一切判定之前。四层：表示层 → 发起方有效性（写事务内以 `judgeLoginState` 读发起方：存在 ∧ 未撤销 ∧ 所属账号已激活，否则 `not-authorized`）→ 目标存在性（`login-state-not-found`）→ 目标归属（`target.accountId ≠ initiator.accountId` ⇒ **同一个** `login-state-not-found`）→ 已撤销 ⇒ `ok`；否则置 `revoked = true`。提交后 `emit('login.revoked', { loginStateId, accountId })` | 已实现（`src/logins.ts`） | 「发起方就是刚被撤掉的那一个 ⇒ `not-authorized`」由第二层先读发起方兑现；「已撤销 ⇒ `ok`」只在两半授权都过之后——次序与契约逐字对齐，verification 登记一条重复退出的注入。**来自线上的目标只是被指认的对象，不是认人依据**：属于别的账号 ⇒ 与「查不到」逐字相同的 `login-state-not-found`，由第四层兑现；目标形状合 S-31 但不是十六进制 ⇒ 查不到，不是 `invalid-input`。**撤销只改 `revoked` 一列**，没有任何语句改 `login_state_id` |
| [S-17](../../../../spec/capabilities/account-identity/v2/contract.md#s-17-校验登录状态) 校验。**v2 差异（只对进程内开放）** | `logins.verify(loginStateId: LoginStateId)`（参数收窄为品牌类型——契约「按来源读」的兑现）。表示层 `parseLoginStateId`（只用 IV S-31，不收紧到 64 hex）→ `judgeLoginState`（**一次读，读写同源**）：查不到／已撤销／账号未激活 ⇒ **同一个** `login-state-rejected`；读不到 ⇒ `storage-unavailable`；通过 ⇒ AccountId。**无缓存**——方法体每次现读，不导出任何带 TTL 的变体 | 已实现（`src/logins.ts`、`src/records.ts`） | 判定与 v1 逐字相同，三出口一个都不放行：返回类型是 `{ ok: AccountId } \| { failure: ... }`，没有默认分支返回 AccountId。「撤销提交之后每一次校验都看得到」由 R-3 兑现。**「只对进程内开放」本节点守两层**：`exchange` 是九个方法里唯一以出示物为输入的方法；S-16 的发起方、S-17、S-37 这三处用来认人的参数是品牌类型，调用方手里的 LoginStateId 须来自 S-15／S-44／S-37 的返回或一次显式的 `parseLoginStateId`（S-16 的目标不认人，是 `unknown`）。**第三层在消费者一侧**：接收边界包（本版只有 [governance-center-entry](../governance-center-entry/design.md#本节点约束存储要求之外)）不调 `logins.verify`、不 import `parseLoginStateId`、不写 `as LoginStateId`——结构检查，owner 是那个节点与 `tools/ts-checks`。**服务名挡不住**：`ctx.get` 看得见整棵树（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)），所以不为 S-17 另开一个「进程内」服务名 |
| [S-18](../../../../spec/capabilities/account-identity/v2/contract.md#s-18-读账号) 读账号 | `accounts.read(accountId) → { activated, retentionExpired }`；`retentionExpired = expiredAt ≠ null`。读到 `¬activated ∧ expiredAt = null ∧ now > retentionDeadline` 时**在同一提交内先写 `expiredAt = now` 再返回**（锁定读 + 写，R-3）；写不进去 ⇒ `storage-unavailable`，不返回一个没落盘的「是」。**不返回**凭据材料、登录标识、`producedAt`、`retentionDeadline`、`expiredAt` 本身——返回类型只有两个布尔（`AccountReading`） | 已实现（`src/accounts.ts`、`src/records.ts`） | 性质 1（已激活恒为否）由「`activated` 与 `expiredAt` 在同一行、同一锁下互斥写入」兑现；性质 2（单调）由**事实落盘后不再依赖 `now`** 兑现，见[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)。**这个读面会写**——它是治理侧三个现读点（`og#S-20`／`#S-25`／`#S-53`）与本节点写入之间唯一的序列化点，读面不写就没有这个点。「持有 AccountId 即可读」本版不设授权判定——装配给（S-30 第 6 行），跨进程须发新版本 |
| [S-37](../../../../spec/capabilities/account-identity/v2/contract.md#s-37-列出本账号有效登录状态) 列表。**v2 差异（参数类型）** | `logins.listEffective(caller: LoginStateId)`（参数收窄为品牌类型——契约「按来源读」的兑现；表示层只用 IV S-31）。先走 `judgeLoginState`（拒绝 ⇒ `login-state-rejected`），通过则**同一次读**里查该账号 `revoked = false` 的全部记录，返回 `[{ loginStateId, issuedAt }]`。**读失败 ⇒ `storage-unavailable`**，方法体里没有一条路径返回空数组：成功路径的结果至少含调用方自己那条，若查出来为空即视作读失败（这是一条自检，不是新失败值） | 已实现（`src/logins.ts`） | 「不得返回空集」由上述自检兑现；两次读（校验 + 列表）落在同一次存储读事务里（R-3）。**列出的是 LoginStateId，不是出示物**：记录里本来就没有出示物，列表交不出能直接用的凭证（契约 §四 本版新增的第二条安全性质） |
| [S-38](../../../../spec/capabilities/account-identity/v2/contract.md#s-38-清除到期的未激活账号记录) 清除 | `accounts.purge(accountId, purgeWarrant)`。四层：表示层 → 存在性（提交内锁定读；不存在则**先核依据**再 `ok`）→ `handoffWarrant.verify(purgeKey, 'purge', accountId, warrant)` ⇒ `purge-warrant-invalid` → 状态判定（先落盘过期事实；已激活 ∨ `expiredAt = null` ⇒ `not-expired`）→ 删除记录（**一行删除同时释放标识**：标识就在这一行上，没有第二张表要改）。**删除被存储的引用约束拒绝**（该账号的个人组织行仍指着它，R-7）⇒ `storage-unavailable`，不删、不发事件。提交后 `emit('account.expired', { accountId, loginIdentifier })`，幂等路径不发 | 已实现（`src/accounts.ts`） | 「删记录与释放标识同提交」由**标识是记录的一列、唯一约束建在该列上**兑现——删除一行即释放，不存在两步；这是本节点选择「标识不单独建表」的直接理由。引用约束拒绝映射成 `storage-unavailable` 是诚实的：本节点不知道也不该知道谁在引用它，清除链把这一值归入抖动型、重扫一遍就收敛（[组合 S-34 三分类](../../../../spec/compositions/account-registration/v1/contract.md#s-34-第二条动作链未激活到期清除)），推理在[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词) |
| [S-26](../../../../spec/capabilities/account-identity/v2/contract.md#s-26-credential_policy) `credential_policy` | 本插件 config 键 `credentialPolicy`，**形状不透明**（`unknown`，可缺省；键缺席与值为 `undefined` 同义），原样交给 `credentials.checkPolicy`；本节点只保证「取不到 ⇒ `credential-rejected`」——config 缺该项或政策不合形状时 S-13 ②里的政策判定一律拒绝（理由字面 `credential-policy-unavailable`，另记一条诊断），不跳过（认回路径不读它，S-27） | 已实现（`src/plugin.ts`、`src/accounts.ts`） | 政策的形状与判定归 [credential-verification](../credential-verification/design.md)；本节点是它的持有者与下发者，因为契约把参数归在这里 |
| [S-39](../../../../spec/capabilities/account-identity/v2/contract.md#s-39-unactivated_retention) `unactivated_retention` | 本插件 config 键 `unactivatedRetention`，`Duration`（正的安全整数毫秒），**加载时校验为正**，非正或缺席 ⇒ config 校验不过、fiber `FAILED`、不 provide 任何服务（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)） | 已实现（`src/plugin.ts`） | 「取不到 ⇒ `storage-unavailable`」在本设计下**不可达**：config 缺该项即启动失败，运行期永远取得到。契约那一支照写进失败集合，verification 记「由启动校验吸收，不可达」 |
| [S-14](../../../../spec/capabilities/account-identity/v2/contract.md#s-14-激活账号)／[S-16](../../../../spec/capabilities/account-identity/v2/contract.md#s-16-撤销登录状态)／[S-38](../../../../spec/capabilities/account-identity/v2/contract.md#s-38-清除到期的未激活账号记录) 三个事件 | `account.activated`、`login.revoked`、`account.expired`（类型 `AccountIdentityEvents`）：一律 `ctx.emit`，**提交之后**发，不 await 处理者；处理者抛出会同步传回发事件的一方（basis [`emit-listener-throw-propagates`](../../../../basis/cordis/emit-listener-throw-propagates.md)），出口 `contextNotifier` 把它收住、记一条 `event-listener-failed` 诊断、不重发——已提交的操作不因通知失败变成异常 | 已实现（`src/diagnostics.ts`） | 通知类 `emit` 与契约「不是控制点、无投递保证」对齐；`emit` 同步派发并丢弃返回值（basis [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md)）。**不开任何控制事件**。`login.revoked` 携带的 LoginStateId 在 v2 里不是秘密；三个载荷里都没有出示物（记录结构静态检查同时查事件载荷类型） |
| [S-22](../../../../spec/capabilities/account-identity/v2/contract.md#s-22-账号存在性不从登录路径泄漏) 第二处例外：`identifier-held-by-expired-record` 只流向组合 | 本节点**不区分调用方**（S-13 无授权前提）；「只有组合调 S-13」是装配给的：登录入口 inject `logins`，注册入口**不 inject `accounts`**；`accounts` 面本身有两个消费者（[account-registration](../account-registration/design.md) 用 `produce`／`activate`／`purge`，[organization-governance](../organization-governance/design.md) 只用 `read`），所以**按包 inject 查不出「谁调 `produce`」**，检查要落到**方法级**：仓库内 `accounts.produce(` 的调用点只在 account-registration | 已实现（`produce` 不判调用方）；方法级检查在 ts-checks | 这条是**装配纪律**，本节点兑现不了，只能提出检查形式；规则已写进 `tools/ts-checks`（`restricted-call-sites`），运行尚未登记为 evidence run（[tenancy-host verification](../../../apps/tenancy-host/verification.md#证据义务)）。不为它把 `produce` 单列成一个服务名：S-53 单列（治理节点）是因为契约把「只由清除链调用」记成了一条装配给保证且那条操作没有任何授权前置；S-13 的对应保证（[S-30 第 8 行](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)）同样如此——**两处应当同形**，本节点选方法级检查而非单列，理由是 `produce` 与 `activate`／`purge` 有同一个消费者，单列不会让「谁够得着」比方法级检查更可见；治理节点若认为单列更好，两处一起改 |
| [S-35](../../../../spec/capabilities/account-identity/v2/contract.md#s-35-静态检查账号记录无跨账号关联字段)／[S-36](../../../../spec/capabilities/account-identity/v2/contract.md#s-36-静态检查失败集合闭合) 静态检查。**v2 差异（九个方法）** | 失败类型一律**字面量联合**，每个方法的返回类型精确到契约列的集合，无 `string`、无 `other`；类型测试查「**九个**方法的失败字面量集合 = 契约集合」，其中 `exchange` 的集合与 `verify` 的**逐字相同**（同一个类型别名，不另开「这是 LoginStateId」一类的值）；另查[公开入口一节](#公开入口导出与类型)列的参数类型——`exchange` 与 S-16 的目标是 `unknown`，S-16 的发起方、S-17、S-37 是 `LoginStateId` | 已实现（`src/surface.ts`；`tests/types.spec-d.ts` 守九个方法的失败集合、参数类型与记录结构） | identity-values 的 SC-2 覆盖 S-35。记录结构检查（登录状态记录的字段恰为四项、没有出示物类型的字段）与本行同一个类型测试文件 |

### 公开入口：导出与类型

包的公开入口（`src/index.ts`）只导出下列几样；服务实例经 inject 取得，不经 import。

| 导出 | 是什么 | 为什么出包、为什么不再多 |
|---|---|---|
| `AccountsService`、`LoginsService` 及各自的返回与失败类型（`ProduceResult`、`IssuedLoginState`、`ExchangedIdentity`、`AccountReading`、`EffectiveLoginState` 与各 `*Failure`）、`AccountIdentityConfig`、`AccountIdentityEvents`，服务名常量 `ACCOUNTS_SERVICE`、`LOGINS_SERVICE` | 两个服务面的类型与名字 | 消费者 inject 服务时要类型与名字；失败类型是契约集合的逐字投影（S-36） |
| `accountIdentityPlugin`、`AccountIdentityConfigSchema` | 插件与它的 config 校验 | 装配装载它、测试夹具与装配核对 config 要同一份校验 |
| `parseLoginStatePresentation`、`LoginStatePresentation` | 出示物交换表示的解析（S-45 四条）与它的品牌类型 | 入口层判出示物的表示层须与 S-44 第 1 步是同一个函数（见 S-45 行） |
| `LoginStateId`（只作类型再导出，定义在 identity-values） | 品牌类型 | 消费者照着 S-16 发起方、S-17、S-37 的签名写代码要这个类型；**只导类型，不导构造它的任何函数** |
| `accountIdentityMigrations`（`readonly MigrationFragment[]`，类型归 [`core/storage`](../../core/storage/README.md)）与 `ACCOUNT_TABLE`（`'account'`）、`ACCOUNT_ID_COLUMN`（`'account_id'`） | 两张表的迁移片段；OG 外键的目标名 | 装配合成迁移、把外键目标传给 OG 工厂时从这里取，两处不各写一遍字面量 |
| **不导出**：`generatePresentation`、`deriveLoginStateId`、`judgeLoginState`、服务实现类 `AccountsImpl`／`LoginsImpl` | — | 本包之外没有第二份派生规则（S-44「在本契约之外放了第二份派生规则」就是不导出的理由）。**不导出不是防线**：派生式在 S-45 公开，谁都能自己算；挡「算出 LoginStateId 再调 S-17」的是下表的品牌参数与接收边界包的文本规则（S-17 行）。实现类只给包内测试从源码直接构造（随机源注入） |

**各方法的参数类型**——哪些是品牌、哪些收 `unknown`，按「这个值是不是用来认人」分：

| 方法 | 参数 | 类型 | 理由 |
|---|---|---|---|
| `exchange` | 出示物 | `unknown` | 它就是线上来的东西；表示层在方法内判 |
| `revoke` | 目标 | `unknown` | 契约写明目标可以来自线上、只作被指认的对象；表示层（IV S-31）在方法内判，不合 ⇒ `invalid-input` |
| `revoke` | 发起方 | `LoginStateId` | 用来认人，契约要它按来源读（[第三张选择表](#v2-的四处选择)） |
| `verify`、`listEffective` | 登录状态 | `LoginStateId` | 同上 |
| `produce`、`activate`、`read`、`purge`、`issue` | 全部 | `unknown` | 都不是用来认人的参数；表示层在方法内判 |

品牌参数在运行期**仍**先过 `parseLoginStateId`（只用 IV S-31）：品牌只在编译期，未标类型的调用方送来非法表示照样得 `invalid-input`。

### S-15 归本节点，`credentials` 作可选依赖、在调用时解析

主线留的关键问题：S-15 由本节点提供并 inject `credentials`，还是由 credential-verification 提供并 inject `accounts`？本节点选**前者，但不用必需 inject**。

| | credential-verification 提供 S-15（落选） | **本节点提供 S-15，`credentials` 必需 inject** | **本节点提供 S-15，`credentials` 可选、调用时解析（选）** |
|---|---|---|---|
| 凭据材料的读取点 | 要经 `accounts` 的一个读面取出材料——[S-8 第 3 条明写没有任何读面能把它取出来](../../../../spec/capabilities/account-identity/v2/contract.md#s-8-凭据材料)，S-18 的返回里也没有它。**结构上违反契约** | 材料在本插件内读，不出服务面 ✓ | 同左 ✓ |
| 登录状态记录的提交点 | 由另一个插件写本契约拥有的记录；S-15 前置③（已激活）要与写入同提交，跨两个插件做不到同一提交（内核不提供跨 fiber 事务） | 同一插件、同一提交 ✓ | 同左 ✓ |
| SAF-2 同一失败值 | 「标识不存在」在 `accounts` 那边就得先暴露成一个可区分的值再由登录插件抹平——多一处可分辨的面 | 三支在一个方法体里折成一个字面量 ✓ | 同左 ✓ |
| 认证换代的重启半径 | 只重启 credential-verification ✓ | **换代 ⇒ 本插件重跑 ⇒ `accounts` 短暂非 `ACTIVE` ⇒ 治理插件也重跑**（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)：提供者非 ACTIVE 亦触发）。**正是 C 要收住的那个半径** | 换代时本插件不重跑；换代期间 S-13 的①②、S-15 的校验拿到 `unavailable` ⇒ 一律 `storage-unavailable`，**契约本来就规定了这个收场**（[S-15「凭据校验不可用 ⇒ `storage-unavailable`，不签发」](../../../../spec/capabilities/account-identity/v2/contract.md#s-15-验证凭据并签发登录状态)）。治理不受波及 ✓ |
| 启动期语义 | — | `credentials` 未就绪则本插件 `PENDING`，治理与注册连带 `PENDING`——登录不可用时**整个租户域不可用** | `credentials` 未就绪时**只有**登录与注册的凭据步骤失败，读账号、校验登录状态、换取身份、治理全部照常——**这是产品要的分层**：认证坏了不该让已登录的人做不了事 |

**落选方（credential-verification 提供 S-15）的最强论证**：认证协议拥有登录流程——OIDC 是「拿断言换会话」，passkey 是「挑战—应答」，
登录流程的形状随认证方式变，把它放进随认证换代的那个插件最自然。
**它输在两条契约结构上**：凭据材料没有读面（S-8），登录状态的提交点归本契约（S-15）。要成立就得给契约开一个内部读面并把提交点让出去，那是两份契约改语义。

**本方弱点**：`credentials` 的接口（[credential-verification](../credential-verification/design.md)）要同时容纳「有存储材料」与「无存储材料」两类认证方式；
本版只有前者有依据，后者是**假设**。可选依赖的机制形状已由 basis 钉住：[`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)（4.0.4 probe 通过）——`inject` 没有可选形式，
调用时解析只能走 `ctx.get`，本节点用 kernel-basis 的 `resolveOptional`；提供者换代**不**使本插件重跑（同一 probe 第 2 条）。代价是失去 inject 的类型推导，由 `resolveOptional<CredentialsService>` 的类型参数补。
置信度：**高**——两条契约结构把落选方排掉了，机制细节已有 probe。

### 「已过留存期限」是首次观测时落盘的单调事实，不是每次读时重算的谓词

契约把「已过留存期限」写成一个**单调**的读数（[S-18 性质 2](../../../../spec/capabilities/account-identity/v2/contract.md#s-18-读账号)），并要求三个判定点——本节点 [S-14](../../../../spec/capabilities/account-identity/v2/contract.md#s-14-激活账号) 前置③、治理 [`og#S-20`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-20-创建个人组织) 前置②、[`og#S-53`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织)——各自「在自己的提交里现读」且读到同一个答案（[S-30 第 7 行](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)）。
**一个每次读时重算的时间谓词 `now > retentionDeadline` 给不了这个**，即使存储是可串行化的：`now` 不是存储对象，两个事务各自读到的 `now` 不参与冲突检测。具体的交错：

- **(a) 激活 vs 清除**：S-14 在自己的事务里读到 `now = t₁ < retentionDeadline`；期限过去；另一次同标识注册在 S-13 撞上 `identifier-held-by-expired-record`、就地跑清除链，`og#S-53` 读到 `now = t₂ > retentionDeadline`、删掉个人组织并提交；S-14 随后提交激活。终态：**已激活、没有个人组织**，组合 [S-13](../../../../spec/compositions/account-registration/v1/contract.md#s-13-一个可用账号有且仅有一个个人组织) 被破，且此后 S-38 会以 `not-expired` 永远停住。行锁挡不住它：S-14 与 S-53 之间没有共同写入的存储对象。
- **(b) 创建个人组织 vs 清除**：`og#S-20` 读到「未过期」但尚未提交；`og#S-53`→S-38 完整跑完（账号行被删）；S-20 提交组织行。终态：**个人组织存在、账号不在**，组合 [S-35](../../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿) 被破，且按契约谁也再清不掉（S-53 的 ⑦乙把它记成缺陷）。

本节点的兑现方式是**把「已过期」变成账号行上的一列事实**，让所有判定点读的是同一个存储对象：

1. **`expiredAt: Instant | null`**。`retentionExpired ≝ expiredAt ≠ null`。
2. **首次观测者落盘**：任何一次需要这个判定的读（S-13 占用分支、S-14 ③、S-18、S-38 ③）在提交内**锁定读**账号行（R-3），读到 `¬activated ∧ expiredAt = null ∧ now > retentionDeadline` 就在同一提交内写 `expiredAt = now`，再据它判定。此后 `now` 与它无关。
3. **同一行、同一锁**：`activated` 与 `expiredAt` 两个写入落在同一行，R-3 的行级写锁把「激活」与「落盘过期」排成一个次序——(a) 里要么 S-53 经 `accounts.read` 先落盘过期、S-14 再读到 `account-record-expired`；要么 S-14 先激活、S-53 再读到 `accountIsActivated`。**两个终态都是契约允许的**，第三种不存在。
4. **组织行引用账号行**（R-7，与治理节点[对存储的共同要求](../organization-governance/design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)）：`organization.ownerAccount` 是指向账号行的引用约束，删除受限。(b) 里要么 S-38 先删、S-20 的插入被约束拒绝而重读到 `account-not-found`；要么 S-20 先插、S-38 的删除被拒绝成 `storage-unavailable`，清除链按抖动型重扫——这一次 S-53 读到已落盘的过期事实与那个组织，删掉它，S-38 再成。**孤儿状态不可达**，不靠任何进程内锁。

**为什么不是进程内临界区**：锁的实例随插件实例生灭（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)），在途持锁者与新实例互不相知，(b) 正是它的失败形态；而且 S-14 与 S-53 在两个插件里，临界区要么跨插件共享一个 core 模块（一条没有契约的隐式依赖），要么什么也保护不了。
**为什么不是跨插件事务句柄**：那要把存储事务焊进 `accounts` 的公开面，两份契约改公开面，且跨进程后整套形状作废；而行上的事实在跨进程后**仍是同一种机制**——[S-30 第 7 行右列](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)自己就把「把『已过期』改写成一个由单点判定并携带的事实」列为协议给的做法，本节点在单机上就采用它。
**代价**：S-18 读面偶尔会写一次（每条过期记录恰一次）；`accounts.read` 的失败集合里 `storage-unavailable` 多了一个来路（写不进事实）。契约允许——它本来就规定读不到即 `storage-unavailable`。

**`retentionDeadline` 仍在产生时定死**（`producedAt + unactivated_retention`），认回路径不改它（[S-13 幂等重入不重新计时](../../../../spec/capabilities/account-identity/v2/contract.md#s-13-产生账号未激活)）。**但这一条现在只是政策候选，不再是单调性的来源**：事实一旦落盘就不受参数影响，所以「读时用当前参数算 `producedAt + retention`」与「定死」**两种算法在本设计下都满足 [S-39](../../../../spec/capabilities/account-identity/v2/contract.md#s-39-unactivated_retention)「调长不得翻回」**。两者的差别只在**未落盘的**记录上：定死 ⇒ 参数变更只影响此后产生的记录；读时算 ⇒ 参数变更影响此后的判定（调短会让既有未激活记录提前到期，调长会推迟尚未到期的）。契约 S-39 写的「变更只影响此后的判定」两种读法都通，v2 没有收口（[v2 §十末段](../../../../spec/capabilities/account-identity/v2/contract.md#本版的规范工件)），**选哪种是政策，报 spec owner**（[verification.md 覆盖缺口](verification.md#覆盖缺口)）；本节点默认定死，裁为「此后的判定」时只换第 2 步里那个比较式，机制不变。

### v2 的四处选择

#### S-44 是 `logins` 上的一个方法

| | 入口层自己派生、再调 S-17（落选） | 单列一个服务名（候选 `login-presentations`，落选） | **`logins.exchange`（选）** |
|---|---|---|---|
| 最强论证 | 不加方法；线上归入口，派生只是一行 SHA-256 | 「谁收出示物」在 inject 声明上看得见；边界用的面与进程内的面分开 | 派生规则只在一处（S-45「派生规则归本契约」）；S-44 与 S-17 共用一个内部判定，「不是第二份判据」由同一个函数兑现 |
| 本方弱点 | 派生规则出现第二份（S-44 明写要避免的）；边界直接调 S-17，正是 v2 S-30「只有 S-44 认出示物」一行要禁的 | 服务名不是访问控制：`ctx.get` 看得见整棵树（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）；入口本来就要 S-16／S-37，两个面都得 inject，拆开只多一个名字；两面随同一份契约变，没有独立变化原因 | 边界用的方法与进程内的方法在同一个服务面上，「谁能调 S-17」只能靠类型与结构检查守（第三张表） |
| 置信度 | — | — | 高 |

#### 出示物的表示：base64url 无填充

| | 小写十六进制，64 字符（落选） | 小写 base32 无填充，52 字符，同 identity-values 的字母表（落选） | **base64url 无填充，43 字符（选）** |
|---|---|---|---|
| 最强论证 | 大小写不敏感的环境里也不出错；与派生输出同一种字母表，实现最省事 | 复用仓库里已有的字母表；大小写不敏感 | [RFC 4648 §5](https://www.rfc-editor.org/rfc/rfc4648#section-5) 的 URL 安全字母表，落在 [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750#section-2.1) `b64token` 的字符集内——持有者凭证的常见线上形状；最短；**与 LoginStateId（64 个小写十六进制）形状互斥**：一个 43 字符的值永远不是 LoginStateId，日志、排障与测试里两者不会被看混 |
| 本方弱点 | **与 LoginStateId 同形**：最容易被传错的两样东西长得一样 | 比 base64url 长；与 AccountId 同字母表，同样容易看混 | 区分大小写：客户端做大小写折叠就得到另一个值（契约要求逐码点相等，折叠本来就是违约，结果是拒绝、不是放错人）；「不带填充」依赖 Node 的 `base64url` 编码行为（假设，单测守） |
| 置信度 | — | — | 中高 |

形状互斥只用于看得清，**不用于判定**（见 S-44 行「不设捷径」）。入口节点的[对齐义务](../governance-center-entry/design.md#出示物的线上形状对齐义务)以这个表示核过，本节点换表示前须先核那一条。

#### 「S-17 只对进程内开放」怎么守

| | 全部保留 `unknown`，只靠调用点文本规则（落选） | 把 S-16／S-17／S-37 挪到只给进程内的服务名（落选） | S-16 两个参数都收窄为品牌（落选，本节点前一稿） | **用来认人的三个参数——S-16 的发起方、S-17、S-37——收窄为品牌 `LoginStateId`，S-16 的目标保持 `unknown`；加接收边界包的文本规则（选）** |
|---|---|---|---|---|
| 最强论证 | 签名全收 `unknown`；方法体内做表示层解析，签名最诚实（运行期来什么都判） | 看起来把边界面与进程内面分开了 | 签名整齐，`revoke` 的两个参数同一种类型 | 契约把这三处写成「**按来源读**：须来自本契约的结果或治理契约以它为键的记录，不得来自线上」，并写明 S-16 的目标**不受这条限制**、可以来自线上——品牌恰好落在「按来源读」的那几个参数上，把这条数据流性质变成编译期性质：接收边界包不 import `parseLoginStateId`、不写 `as LoginStateId`，手里用来认人的 LoginStateId 就只能来自 S-15／S-44／S-37 的返回；文本规则只查两个字面，便宜且会失败 |
| 本方弱点 | 文本规则追不了数据流：把线上的串当发起方交进去查不出来 | 服务名不是访问控制（同上 basis）；入口本来就要 S-16／S-37 | 与契约不符：目标可以来自线上，而入口层不许解析或断言品牌——线上的句柄到目标参数没有合法路径，只能逼入口先列出再匹配，一次撤销变成两次领域调用，与入口契约 S-20 相左 | 品牌只在编译期；治理契约以 LoginStateId 为输入的方法（OG S-36／S-37）不归本节点——那个节点把它们的登录状态参数同样收窄为品牌、方法内不再 `parseLoginStateId`（[OG 的 S-36／S-37 行](../organization-governance/design.md#操作)），经治理绕行的那条路因此同样编译不过，入口节点的约束第 8 条（认人所得只在一处构造）再守一层；`revoke` 的两个参数一个品牌一个 `unknown`，**交换实参在编译期会被拦下**（线上的串交不进发起方），但目标一侧只剩运行期表示层校验；运行期解析保留，`invalid-input` 对未标类型的调用方仍可达 |
| 置信度 | — | — | — | 中高 |

#### 随机源的故障怎么注入

| | 做成 Cordis 服务（候选 `random`，落选） | 模块级 mock `node:crypto`（落选） | **服务实现类经依赖对象（`ServiceDeps.random`，必填）接受一个随机源，插件体构造时传入本包唯一的 `cryptoRandomSource`（`node:crypto.randomBytes`）（选）：只有一个可替换点、生产路径只用那一个源** |
|---|---|---|---|
| 最强论证 | 装配可见、可替换，测试装配直接 provide 一个坏的 | 生产代码里没有任何可替换点 | 与 [`infra/clock`](../../infra/clock/README.md) 的 `TimeSources` 同形；测试装配直接构造实现类，传一个抛出的源得「随机源不可用」、传一个返回定值的源得「派生值碰撞」——契约要的两处故障注入都有了 |
| 本方弱点 | 多一条必需 inject 边与重启半径，换来的只是可测；装配可换就可能换成一个弱源 | 测不到插件体里真实的构造路径；mock 的作用域随测试框架变 | 生产代码里有一个可替换点——由文本规则守（ts-checks `no-random-source-inline`）：插件体只许传 `cryptoRandomSource`，本包源码不出现 `Math.random` 或别的 crypto 随机函数 |
| 置信度 | — | — | 中高 |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values/v1` 八条（S-1、S-2、S-9、S-19、S-30、S-31、S-33、S-35；v2 比 v1 多登 S-19） | 包依赖 [identity-values](../../core/identity-values/design.md)：品牌类型、解析入口、`generateOpaqueIdentifier`（AccountId）、`parseOpaqueIdentifier`（v2 起也承担出示物交换表示四条里的两条）、`handoffWarrant.verify` | 随包版本 | — |
| 存储（**无契约**；协议在 [core/storage](../../core/storage/design.md#协议)，服务名 `storage`） | **必需 inject**。本版提供者是 [infra/storage-sql](../../infra/storage-sql/README.md)，由装配选；要求清单见[下节](#对存储提供者的要求清单) | 提供者换代 ⇒ 本插件重跑（可承受：插件体只做 provide，config 由内核先校验，无闭包状态） | 缺席 ⇒ `PENDING`，两个服务面都不可见 ⇒ 消费者按各自契约明确失败（治理 [S-43](../../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)）。**这正是契约 S-28 要的收场** |
| 时间源（服务名 `clock`，形状定义在 [offer-expiry](../../core/offer-expiry/design.md#能力到-cordis-的投影)） | **必需 inject**。本版提供者是 [infra/clock](../../infra/clock/README.md)，由装配 provide；`now()` 返回 `'unavailable'` 时 S-13 新建路径、S-15 的 `issuedAt` 与四个可能落盘过期事实的读 ⇒ `storage-unavailable` | 装配启动时 provide，本版不换代 | 缺席 ⇒ `PENDING`。`now` 只在**首次落盘过期事实**与写 `producedAt`／`issuedAt` 时被读；S-18 性质 2 的单调**不再以「`now` 不后退」为前提**（事实落盘后与 `now` 无关），时钟质量只影响「首次观测早了还是晚了」。S-44、S-17 不读时钟 |
| `credentials`（[credential-verification](../credential-verification/design.md)） | **可选依赖，调用时解析**（kernel-basis `resolveOptional`）；理由见[上节](#s-15-归本节点credentials-作可选依赖在调用时解析) | 换代不重跑本插件（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)） | 缺席 ⇒ S-13 的①（凭据形状）②与 S-15 的凭据步骤（都在写事务之前，R-8）一律 `storage-unavailable`——**验证器不在，是判不出来，不是判为不合规**（[S-27](../../../../spec/capabilities/account-identity/v2/contract.md#s-27-缺席时的默认答案)「授权结论与判不出来永远是两个值」；那一表里 `credential-rejected` 对应的是 `credential_policy` 取不到，不是验证器缺席）；**S-14／S-16／S-17／S-18／S-37／S-38／S-44 不受影响** |
| 密码学随机源与 SHA-256（`node:crypto`，**v2 新增**；契约 [S-28](../../../../spec/capabilities/account-identity/v2/contract.md#s-28-依赖不可用撤除与重启时的在途归属) 所说「S-15 另依赖一个密码学安全的随机源」） | Node 内置，**不是 Cordis 服务**、不 inject、运行期不可替换；实现类的随机源参数只给测试装配用（[选择](#v2-的四处选择)） | 随 Node 运行时（engines `>=24 <25`） | `randomBytes` 抛出 ⇒ S-15 `storage-unavailable`、不写任何行、**不退化为任何更低熵的来源**。「失败即抛出」是**假设，须按 source-check 取证**；单测以注入的抛出源核本节点的收场 |
| 两把公钥（`activation`、`purge` 的验证密钥） | **插件私有 config**，由装配下发；密钥是**部署配置输入**，不在启动时生成（[identity-values](../../core/identity-values/design.md#依赖作用域与绑定)；装配的[配对自检](../../../apps/tenancy-host/design.md#配对自检起-context-之前签一次核一次)） | 加载时校验形状 | 缺任一把或形状不对 ⇒ **启动失败**（config 校验不过 ⇒ fiber `FAILED`，basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）。密钥缺失是配置错误，与 `unactivated_retention` 非正同一收场；三个持钥节点同一政策——一份漏配的部署不该半开着跑、把配置错报成运行期抖动 |
| `credential_policy`（S-26）、`unactivated_retention`（S-39） | 插件 config | 加载时；`unactivated_retention` 非正 ⇒ 启动失败 | `credential_policy` 缺 ⇒ S-13 ② 一律 `credential-rejected`（契约 S-27 明写的收场，不启动失败）。**v2 不加 config**：出示物的熵是包内常量 |

### 对存储提供者的要求清单

本次不选数据库。以下每条是**本节点对 `storage` 服务的要求**，实施时由装配选的提供者逐条满足，缺一条本节点的对应条款就不成立。
[core/storage](../../core/storage/design.md#要求到协议再到会红的测试) 把 R-1～R-7 规格化成协议 P-1～P-12 与一致性套件；R-8 是本节点这一侧的义务，两条提供者前提靠它成立。

| # | 要求 | 对应条款 |
|---|---|---|
| R-1 | **单次提交原子**：一次提交内的多条读写要么全成立要么全不成立；提交前的读与写在提交失败时不留痕迹 | S-13／S-14／S-15／S-16／S-38 的提交点；S-30 第 4 行 |
| R-2 | **唯一约束**：账号记录的 `loginIdentifier` 列部署内唯一，违反时提交失败并可被本节点识别为「这一条唯一约束冲突」；`accountId`、`loginStateId` 各为主键。**两种标识的来历不同，唯一性都由约束兑现、不由随机性兑现**：AccountId 由本节点在 S-13 那一次提交内生成（identity-values 候选：128 位 CSPRNG），LoginStateId 由 S-15 在那一次提交内从出示物派生（[S-45](../../../../spec/capabilities/account-identity/v2/contract.md#s-45-登录状态出示物)：出示物 256 位 CSPRNG，LoginStateId = 其 UTF-8 的 SHA-256 的小写十六进制）。撞上既有行 ⇒ 唯一冲突 ⇒ `storage-unavailable`；**插入是普通插入**，不 upsert、不合并、不读回既有行的任何东西。契约 S-4 与 IV S-9 的「由存储生成」本节点读作「在存储提交内产生、由存储约束保证唯一」——LoginStateId 那一半 v2 S-45 已如此写明；AccountId 那一半（S-4）v2 未改措辞，仍报 spec owner | [S-19](../../../../spec/capabilities/account-identity/v2/contract.md#s-19-登录标识部署内唯一)；[S-45](../../../../spec/capabilities/account-identity/v2/contract.md#s-45-登录状态出示物)；[`iv` 第六节第 1 行](../../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)；S-30 第 1 行、第 14 行 |
| R-3 | **提交内读写同源、行级写锁从读起**：提交内读到的是所有已提交写的最新值；一个提交要写某一行，它对该行的读就是锁定读（`SELECT … FOR UPDATE` 一类，或可串行化隔离下冲突即重试），并发提交在同一行上排成一个次序，先读后写的窗口不存在。**账号行的四个读点（S-13 占用分支、S-14、S-18 可能落盘时、S-38）都是锁定读** | S-14 前置③、S-43 第 2 支；[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)；S-17／S-44／S-37「不存在读到一半的撤销」；S-30 第 2、3、5、7 行 |
| R-4 | **持久**：提交成立后跨进程重启仍在 | [S-10](../../../../spec/capabilities/account-identity/v2/contract.md#s-10-撤销是持久记录不是内存生命周期)、S-32 |
| R-5 | **不可用可识别**：读写失败作为一个可区分的错误返回，不返回空结果、不返回旧快照 | [S-27](../../../../spec/capabilities/account-identity/v2/contract.md#s-27-缺席时的默认答案) 存储行；S-37「不得返回空集」 |
| R-6 | **删除即释放**：删除一行后 R-2 的约束立即允许同值再插入，无延迟 | S-38、S-30 第 5 行 |
| R-7 | **账号行可被别的节点的表以引用约束指向，删除受限**：本版是治理节点的 `organization.ownerAccount`（[那边的 R-6](../organization-governance/design.md#对存储提供者的要求清单)）。被拒绝的删除作为可区分错误返回，本节点映射为 `storage-unavailable`；本节点不知道引用者是谁。**这是两个节点对同一存储提供者的共同要求，装配给**（同一存储、同一约束域）；跨进程后由协议重给 | 组合 [S-35](../../../../spec/compositions/account-registration/v1/contract.md#s-35-个人组织不会变成孤儿)；[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词) 第 4 点 |
| R-8 | **本节点的写事务里没有 `credentials` 调用**（本节点这一侧的义务）：`storage.write` 的回调只做锁、读、判、写与同步计算（`clock.now()`、随机源、SHA-256、S-14／S-38 的交接凭证核验——identity-values 的 Ed25519 同步核验）；凭据的比对、政策与派生（`scrypt`，CPU 密集的异步计算，耗时随 credential-verification 配的参数，远大于持锁段其余各步）都在事务之前、对快照做（S-13、S-15 行）。列在这里是因为提供者的两条前提靠它成立：[storage-sql](../../infra/storage-sql/design.md#自写-nodesqlite-driver-的边界)「写事务里没有等待外部调用的步骤、持锁以毫秒计」，与 [clock](../../infra/clock/design.md#状态并发与失败映射) 续约的「L/3 + 写锁等待上限 5 s < L」——`scrypt` 若在持锁段里，登录负载就会让本库一切写（治理、时钟续约）在写锁上排队，续约可能连续等满上限而失败。与 core/storage 的消费者义务 [P-13](../../core/storage/design.md#协议) 同类；文本规则 ts-checks `ai-r8-no-credential-in-write` 守 | S-13／S-15 的提交点（前置在提交内确认，计算在提交前）；S-30 第 4 行 |

**v2 没有给存储提供者新增要求。**出示物从不进入任何存储语句，所以提供者的语句日志、预写日志、快照与备份都不可能含有它——「存储与备份里没有出示物」（[S-30](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证) 第 12 行）在单机上由**本节点**兑现；那一行右列的「每一份持久副本、为加速认人建的索引与缓存都只许存不可逆形式」要到跨进程才对存储提出要求。

### 持久记录的存储形状与迁移片段

本节是本节点两张表的形状（`src/schema.ts`），[tenancy-host 的迁移清单](../../../apps/tenancy-host/design.md#迁移清单列名逻辑名以各-owner-节点为准)按它合成；片段 `accountIdentityMigrations` 是一个片段（名字 `account_identity`，两张表），合成次序与迁移纪律归[装配](../../../apps/tenancy-host/design.md#迁移纪律每条对应一个提供者要求)。时间列是毫秒整数（`bigint`，pg 读回字符串、读时归一），布尔列写 0／1；从存储读回的值形状不对（布尔不是 0／1、时间不是整数毫秒、标识不合 S-31）⇒ `StorageDefect`——本包自己写进去的东西坏了是缺陷，不是调用方的输入错误。

| 表 | 列 | 约束（显式命名，core/storage P-11） | v1 设计 → v2 |
|---|---|---|---|
| `account`（`ACCOUNT_TABLE`） | `account_id`（`ACCOUNT_ID_COLUMN`，主键）、`login_identifier`、`credential_material`、`activated`、`produced_at`、`retention_deadline`、`expired_at`（可空） | `account_pkey`（主键不命名，两方言归一为此名）；`account_login_identifier_unique`（`CREATE UNIQUE INDEX`） | 不变 |
| `login_state` | `login_state_id`（主键）、`account_id`、`issued_at`、`revoked` | `login_state_pkey`——S-45 的「LoginStateId 部署内唯一」就是这一条（R-2）；另有非唯一索引 `login_state_account_id_index`（S-37 按账号列登录状态时用，非正确性）；**不建** `login_state → account` 外键 | **列集合不变**。`login_state_id` 写进去的值由「128 位随机、26 字符 base32」改为「出示物派生的 64 个小写十六进制」，列类型仍是文本。**不加列**：没有任何一列存出示物或它的可还原编码；**不加 CHECK**：派生形状由本节点的写路径与测试守，不由存储二次裁决（装配 M-7） |

**从 v1 形状到 v2：没有升级片段，前提是没有 v1 数据。**两版设计的表形状逐字相同，差别只在 `login_state_id` 里写的是什么值，所以本包导出的第一个片段就按 v2 写，不存在「v1 片段 → v2 片段」这一步。
**前提**：不存在任何一份含有按 v1 行为签发的登录状态行的库——本包的第一个实现与第一个片段就是按 v2 写的，从没有一份实现按 v1 行为签发过登录状态行；
装配的只读核对（[R-U2](../../../apps/tenancy-host/design.md#升级的整体性迁移前只读核对快照与确认)：库里登记的迁移名序列须是本次合成序列的前缀）挡住登记过未发布片段名的库，开发中用过的库不升级、直接丢弃。
**前提若不成立**（某份库里有 v1 签发的行）：那些行的 `login_state_id` 不由任何出示物派生，[S-47](../../../../spec/capabilities/account-identity/v2/contract.md#s-47-出示物的不可逆形式恒等于它的-loginstateid) 对它们不成立；持有者手里的 v1 值过不了 S-44（派生后查不到 ⇒ `login-state-rejected`），行却仍在 S-37 里列为有效，直到被撤销。
怎样收掉它们——追加一个把它们标为已撤销的数据片段，还是拒绝启动——**是产品与契约的事，本节点不默认**，记为[缺口](#实施缺口与消费者影响)。

## 状态、并发与失败映射

**抽象状态 → 存储**：账号的两态是 `activated` 一列；「已过留存期限」是 `expiredAt` 一列（首次观测时落盘，[过期事实](#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)）；登录状态的两态是 `revoked` 一列；**LoginStateId 在插入那一次写定，此后没有任何语句改它**。出示物不是状态：它只存在于 `issue` 与 `exchange` 各自那一次调用里。
**写权**：全部在本插件的九个方法内，没有第二个写者；`accounts.read` 也可能写（落盘过期事实），仍在本插件内；`exchange`、`verify`、`listEffective` 只读。
**提交点**：每个写操作恰一次 `storage` 提交，方法在提交返回后才 `emit` 事件；`accounts.read` 落盘时也是一次提交，不发事件。**S-15 的那一次提交里完成出示物的产生、派生与插入**，出示物只经事务函数的返回值、在提交成立之后离开本插件。**S-13、S-15 的凭据计算在各自那一次写事务之前**，对一次快照读做，提交内按「同一行」确认（R-8）。`exchange`、`verify`、`listEffective` 各是一次读事务。

**并发**：R-3 把契约要求的三处交错（S-14 vs 清除链、S-16 vs S-17／S-44／S-37、S-13 两个同标识并发）都落到存储的**同一行**；跨节点的两处交错（激活 vs 清除、创建个人组织 vs 清除）由行上的过期事实 + R-7 收住。本节点**不加进程内锁**——进程内锁随实例生灭、在跨进程时静默失效，而 R-3／R-7 的要求在跨进程时会被明确核对。
**v2 不引入跨 owner 的同一提交**：S-44 是纯读，S-15 新增的写只有本节点自己的登录状态行。v2 新增的三处交错，自构反证：

- **S-44 与 S-16 并发**：S-44 在一次读事务里读登录状态行与账号行（一个快照）；撤销提交之前读到的放行、之后读到的拒绝，没有第三种——与 S-17 同一个函数、同一个快照语义。
- **S-15 未提交时有人拿同一个出示物调 S-44**：出示物在提交成立之前不离开本插件，外人拿不到；即使猜中（熵下限排除），行尚未提交 ⇒ 查不到 ⇒ `login-state-rejected`，契约「未提交的登录状态不得被认可」成立。
- **两次 S-15 派生出同一个 LoginStateId**（只在故障注入里出现）：两者都对 `login_state_pkey` 做普通插入；sqlite 下 `BEGIN IMMEDIATE` 把两次写排成先后，后者撞主键；pg 下后者在主键上等前者提交后撞主键（语句级失败不废事务，core/storage P-2）——后者一律 `storage-unavailable`，前者的行原样。前者若回滚，后者插入成功，同样只有一行。反证不出覆盖或合并；这一支写进 verification 的碰撞注入。

**凭据计算挪出写事务之后多出的窗口**（快照读与写事务之间，一次凭据计算的时长），自构反证：

- **S-15 快照 `match` 之后，那条未激活记录被清除、同一标识被另一次注册占用并激活**：事务内重读到的是另一行 ⇒ `identifier-or-credential-rejected`；反证不出「凭 A 的凭据登进 B」。
- **S-13 同标识、同一份凭据两路并发**（重复提交）：两路快照都是「无」、各自派生；先提交者插入 A，后者锁定读到 A（sqlite 下 `BEGIN IMMEDIATE` 把两次写排成先后）或撞 `account_login_identifier_unique`（pg）⇒ 不是同一行 ⇒ 不写、重来 ⇒ 新快照读到 A、事务外比对 `match` ⇒ 认回 A。反证不出第二个账号，也不出 `identifier-taken`（S-34 要的认回）。
- **S-13 认回路径上，快照之后该记录被激活或到期**：换了类 ⇒ 重来 ⇒ 新快照是「已激活」／「已过期」⇒ 判政策 ⇒ `identifier-taken`／`identifier-held-by-expired-record`，或 `credential-rejected`。反证不出「认回一个已激活或已过期的记录」。

三支与「重来之后再变 ⇒ `storage-unavailable`、无写入」写进 verification 的交错测试。

**失败映射**：`storage` 返回不可用 ⇒ 九个操作各自的 `storage-unavailable`（折叠函数归 [core/storage](../../core/storage/design.md#协议)）；`clock` 不可用 ⇒ 读期限的操作与 S-15 的 `issuedAt` ⇒ `storage-unavailable`；`credentials` 缺席／不可用 ⇒ 见依赖表；**随机源抛出 ⇒ S-15 `storage-unavailable`**；唯一冲突按约束名分流——`account_login_identifier_unique` ⇒ S-13 本事务不写、从快照重来（至多一次），`account_pkey` ⇒ S-13 `storage-unavailable`，`login_state_pkey` ⇒ S-15 `storage-unavailable`；引用约束拒绝删除 ⇒ S-38 `storage-unavailable`；identity-values 解析失败 ⇒ `invalid-input`。**没有 catch-all**：方法体的 `catch` 只捕获 `storage` 声明的错误类型与随机源的抛出，其余异常（含存储缺陷）上抛——那是缺陷，不是失败集合的成员。

**S-30 十四行装配给，本版由谁给**：第 1 行 R-2；第 2、3、5 行 R-3+R-6（第 3 行含 S-44：它与 S-17 读同一行、同一个判定）；第 4 行 R-1——S-13、S-15 的凭据前置对快照计算、在提交内按同一行确认（材料列不改、AccountId 不复用，S-13 行）；第 6 行装配（只在同一部署内传递 AccountId，本节点不判定）；第 7 行**账号行上的过期事实**（R-3 锁定读 + R-7）——契约右列自己列的「由单点判定并携带的事实」，本版在单机上就这么做，「同一时间源 + 同一参数源」不再是它的前提；第 8 行装配纪律（`accounts.produce` 的调用点只在组合，方法级检查）；第 9 行签名密钥私有（identity-values 节点与装配）。
**v2 新增五行**：第 10 行「只有 S-44 认出示物」——`exchange` 是唯一以出示物为输入的方法，S-16 的发起方、S-17、S-37 的参数是品牌类型（S-16 的目标不认人、可来自线上，是 `unknown`），进程外的那一半归接收边界的结构检查（[S-17 行](#能力到-cordis-的投影)）；第 11 行「出示物猜不中」——`randomBytes(32)`，包内常量、无回退，证据是熵审阅；第 12 行「存储与备份里没有出示物」——出示物不进任何存储语句，证据是记录结构静态检查与 S-46；第 13 行「出示物只交到调用方手里」——`issue` 的返回值在同一进程内交给调用方，送过进程边界的那一段归入口节点与它的传输；第 14 行「LoginStateId 部署内唯一」——`login_state_pkey` 加普通插入（R-2）。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验（`unactivated_retention` 为正、两把公钥存在且形状对） | 内核在插件体运行前按 `Config`（Standard Schema，kernel-basis `definePlugin`）校验；不过即 fiber `FAILED`，插件体不跑（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)） | 无部分状态 | — |
| `ctx.provide('accounts')`、`ctx.provide('logins')` 两个服务实例 | 本 fiber；`ACTIVE` 后消费者可解析 | 插件体在第二个 provide 之前抛出 ⇒ fiber `FAILED`，已 provide 的那一个一并收回、外面看不到半个服务（同一 basis） | 撤除：服务从 store 消失（`ctx.get` 此后得 `undefined`，basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md) probe 第 2 条），必需 inject 它们的消费者按 basis 卸载重跑或 `PENDING`；**在途调用跑完**——内核不取消在途调用，服务对象仍在调用方的闭包里，每个调用的收场由它那一次 `storage` 事务决定（写操作成立或无痕，`exchange`／`verify`／`listEffective` 按那一次读作答；S-13、S-15 事务前的快照与凭据计算同样跑完，不写的拒绝按快照作答），本节点不做取消、不做排空；**在途的 `issue` 若提交已成立，出示物照常交给调用方**，它此后能否被认出只看存储里的行，与本插件实例无关；**保留**：全部记录（契约 S-28：没有需要交接的在途工作） |
| 无定时器、无后台任务、无连接池（连接归 `storage` 提供者）、无缓存 | — | — | — |

撤除不做排空：契约明写每个操作要么已提交要么无痕，没有「提交了一半」。重跑之后的新实例能认出旧实例签发的每一个出示物：派生不以任何随进程而变的材料为输入（S-47 第 2 支）。

## 实施缺口与消费者影响

- **出示物上界**：契约正文把 1024 写成「本版的候选值，随本版的接受一起定」，v2 随 D-028 接受；实现为包内常量 `MAX_PRESENTATION_SCALAR_VALUES`，要换值只改这一个常量。
- **S-39 政策**（「此后的判定」vs「此后产生的记录」）与**两处措辞**（S-4「由存储生成」、S-30 第 7 行左列「同一时间源 + 同一参数源」）：v2 没有收口（[v2 §十末段](../../../../spec/capabilities/account-identity/v2/contract.md#本版的规范工件)），本节点照旧按定死实现、报 spec owner。
- **S-30 第 4 行的读法（已收口）**：契约 v2 [S-30 第 4 行](../../../../spec/capabilities/account-identity/v2/contract.md#s-30-装配给的保证-vs-协议须给的保证)已明写「前置检查」指对记录状态的判定，凭据材料的计算可在提交之外，只要判定所依据的那一行在提交内被确认没有变过——与 R-8 及 S-13／S-15 行的「快照—同一行确认」一致。
- **G-2**：LoginStateId 那一半由 v2 S-45 定下（64 个小写十六进制）。**AccountId 那一半 v2 仍开，owner 是提供者设计**，闭合条件是「给出 AccountId 的形式并说明是否满足不可猜测」——本节点的回答在 R-2：128 位 CSPRNG、26 个字符的小写 base32（identity-values 的 `generateOpaqueIdentifier`），不可枚举、不可猜测，S-18 的授权前提不需重裁；是否据此标闭合归 spec owner，形式本身在 IV G-04 裁定前仍是候选。
- **v1 数据的收场**：[存储形状](#持久记录的存储形状与迁移片段)一节的前提不成立时怎么收，owner 产品负责人与 spec owner。
- **Node 两条假设**（`randomBytes` 失败即抛出、`base64url` 不带填充）：basis 只收 Cordis，按 source-check 取证；在那之前各由一条会失败的单测守。owner 本节点。
- **R-7 是跨节点的存储约束**：由装配在合成迁移时给出外键目标与名字（[tenancy-host](../../../apps/tenancy-host/design.md#同一存储同一约束域本节点要保证的三件事)：外键目标取本包的 `ACCOUNT_TABLE`／`ACCOUNT_ID_COLUMN`）。
- **对入口节点的对齐义务**（[它那一侧的对齐义务](../governance-center-entry/design.md#出示物的线上形状对齐义务)与[约束第 8 条](../governance-center-entry/design.md#本节点约束存储要求之外)）：
  ① **出示物**：方法名 `logins.exchange`、`issue` 的返回 `{ presentation, loginStateId }`、表示 base64url 无填充，两边一致；入口层判出示物的表示层用本包导出的 `parseLoginStatePresentation`（S-45 四条），与 `exchange` 第 1 步同一个函数；它的 Schema 形状（S-31 码点表内的非空字符串）比 S-45 宽，本节点签发的值两者都过，Schema 挡不住的两类由这个解析挡。
  ② **认人用的 LoginStateId**：入口层不 import `parseLoginStateId`、不写 `as LoginStateId`，交给 `revoke` 的发起方、`verify`、`listEffective` 的只有 S-44 认人所得的那一个——与本节点的品牌参数合成一条完整的检查。
  ③ **撤销目标**：载荷里的句柄（就是 LoginStateId）**原样**交给 `revoke` 的目标参数（`unknown`），不解析、不断言品牌、不先列出再匹配；表示层不合（IV S-31）由 `revoke` 答 `invalid-input`，形状合但不属于发起方账号或不存在答 `login-state-not-found`。这一处闭合入口节点的 N-14；它那边依据「S-16／S-17／S-37 都收窄为品牌」写的句子须随之改成「S-16 的发起方、S-17、S-37」。
- **参数收窄对 organization-governance 的影响**：那个节点把 S-36／S-37 的登录状态参数也收窄为品牌、方法内不再 `parseLoginStateId`，原样交给 `logins.verify`——**这依赖本节点「品牌参数在运行期仍先过 `parseLoginStateId`」**（[公开入口](#公开入口导出与类型)末段）：绕过类型的调用方送来的非法表示在这里得 `invalid-input`，治理按它 S-4 第三行收成 `invalidInput`；本节点去掉那道运行期解析之前须先告知那个节点。`sweepStaleSelections` 从自己的表读出的串（治理以它为键的记录，S-30 第 10 行左列许可的来源）先解析再交给 `verify`。
- **凭据计算挪出写事务对 core/storage、storage-sql 的影响**：那两个节点以本节点 S-13「撞唯一约束后在同一提交内重读」为 P-2（语句级失败不废事务）的用例之一（core/storage 的选择表与 C-3／C-13 的描述、storage-sql 的 R-2 行）；本版 S-13 撞唯一后不写、出事务、从快照重来，不再在同一提交内重读。P-2 仍被治理节点 S-20 与 R-6 的提交内重读用到，选择不受影响；那几处描述由各自节点改。
- **`credentials` 接口对无存储材料认证方式的适用性**：假设，换认证方式之前由 credential-verification 节点给出至少一个反例分析。
- **消费者**：`accounts` 缺席的收场已由治理契约 S-43、组合契约 S-23 各自写明；本节点不另加。

## 2026-09-25新增迁移片段的幂等修复

host M-1要求片段可重跑且不改变后来有效登录。bounded片段在同一真实事务内完成列观察、三个新增列和legacy撤销；若传入db已在事务中便复用，否则自建片段局部事务。不能仅凭Kysely SQLite Migrator登记或三个列存在推断未保护的数据更新已完成；全局supportsTransactionalDdl及旧片段不改。完整列集合在该片段原子提交后允许无副作用返回，部分列拒绝而不猜测旧登录事实。正常旧版中断先由宿主guard恢复快照；未经guard的历史人工半截库不承诺自动修复。第三列后/UPDATE前实际故障须证明列与原记录一起回滚，再跑成功；必须从无外层事务的Migrator触发，否则测试会掩盖本片段的责任。独立评审反例与处置归生产机制评审。

## 维护副本的本版结构核对（候选R2，未实施）

本包公开只读snapshotCheck，消费core/storage的固定副本inspection/structure；覆盖自己拥有的account、login_state。与本包当前迁移片段逐项核对全部列名/声明类型/nullability/PK次序、必要唯一索引的列/部分条件及所拥有外键；列/对象缺失、额外列或不匹配拒绝invalid-data，实际读取错误保留unavailable。期望结构由本owner随迁移共同维护并以“真实迁移生成的空库”和“升级后的库”作正对照，以逐个删表/列/约束为负对照，避免检查清单自己错误。SQL provider只提供结构事实，不认识本包业务表；host只静态合并检查，不查询私有表。不装业务插件、不迁移输入、不改账号/成员/登录事实。这些检查为EC3维护的数据格式完整性承担义务，不是验证所有领域历史或认证来源。
