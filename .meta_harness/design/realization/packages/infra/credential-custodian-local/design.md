# credential-custodian-local 实现设计

> 本批设计已接受（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-065](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

## 实现路径与来源

**自建一个小的 Cordis 插件，没有可复用的上游对象**：保管条目的两种、交出的条件、清扫的三种是本项目的契约语义（`capability.credential-custodian` v2）。加密、随机与文件都用 Node 内置模块，**不引第三方依赖**，也不引任何执行器类库替本节点调度清扫（与 [D-060 §八 N-36](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 同一口径）。

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| 存储协议 `Storage`（`read`／`write`／`lockRow`，四型失败） | [`core/storage`](../../core/storage/design.md#协议)，实例 [`infra/storage-sql`](../storage-sql/README.md)（D-026：Kysely ＋ `node:sqlite`，配置切 pg） | 两张条目表；一次一致的读；锁定读桥的绑定行 |
| 时间源 `clock`（`now(): Instant \| 'unavailable'`，不后退） | [`infra/clock`](../clock/README.md)（形状归 `core/offer-expiry`） | 副本的写下时刻；清扫判过期的「锁到之后读的时刻」。`now()` 是同步的、不经存储，可在写事务里调（不违反存储协议 P-13） |
| 桥的**事务内读函数与过期谓词**（候选：`readOAuthBinding(tx, bindingId)`、`lockOAuthBinding(tx, bindingId)`、`isPendingExpired(binding, now, ttl)`，桥包子路径 `./tx-reads` 导出） | [`tools/mcp-bridge`](../../tools/mcp-bridge/design.md#公开面) 的 `./tx-reads`；四列、锁与谓词的登记见桥节点 [X-1～X-3](../../tools/mcp-bridge/design.md#给凭据保管方的外部依赖登记)（[CCL-1](#实施缺口与消费者影响) 由它闭合） | 在本插件自己的事务里读 `mcp_oauth_binding` 一行的 `state`、`since`、`credential_ref`；清扫前锁这一行；**待生效的绑定过没过期只经 `isPendingExpired` 判**（`now > since + ttl`，与契约 [S-18](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-18-清扫) 第 2 条、`formal/Sweep.tla` 的 `Expired` 同一式；本包不另写比较，[跨 owner 一节](#跨-owner-的同一提交桥的绑定行与引用约束)）。先例：组织治理导出给资产提供者的 `./tx-reads` |
| 身份值类型与表示层校验（`TenantId`、`LoginStateId`） | [`core/identity-values`](../../core/identity-values/README.md) | ① 的表示层校验 |
| `HoldingScope`、`CredentialRef` 的形状 | [`core/asset-model`](../../core/asset-model/README.md) | `depositOAuth`／`resolve` 的持有与引用 |
| AES-256-GCM、随机字节 | `node:crypto`（Node 内置；运行时前提 Node ≥ 24.18.0，与 [`core/content-blocks`](../../core/content-blocks/README.md) 同一条） | 条目本体的封存；引用与密钥的生成 |
| 密钥文件的排他创建、按句柄取 `stat` | `node:fs/promises` | 本机密钥（[关键选择三、四](#关键选择)） |
| `definePlugin` | [`core/kernel-basis`](../../../../../../packages/core/kernel-basis/README.md) | 插件骨架、config 校验 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；机制语义引 [basis](../../../../basis/README.md) 条目。
**上游语义未进 basis 的，逐条标假设**（须按 source-check 取证，[CCL-11](#实施缺口与消费者影响)）：`node:crypto` 的 GCM 解密在认证标签不符时于 `final()` 抛出、不交出任何明文；`fs.open(path, 'wx', 0o600)` 在文件已存在时以 `EEXIST` 失败且不改原文件；对同一句柄 `fstat` 得到的是打开的那个文件。
**配置错误一个政策**（与同批节点、`apps/cli` 同一条）：config 经 `definePlugin` 的 `Config` 在插件体之前校验，不过即 fiber `FAILED`、装配启动失败（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；诊断点名那一项、**不含值**。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：保管方的判定与封存构件以纯函数公开，不依赖 Cordis、存储、会话或租户；本插件的服务面是它们的一种消费者。名字全部**候选**，**全部尚未实现**。

**公开函数面**（包入口导出）：

| 导出（候选） | 做什么 | 输入与输出的契约坐标 |
|---|---|---|
| `sealBody(key, context, body, nonce)`／`openBody(key, context, sealed)` | AES-256-GCM 封存与开封；`context` 是条目身份（进附加认证数据），开封时身份不符或标签不符一律交回 `unopenable`、不抛 | [S-7](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-7-加密落地)；封存格式见[下文](#表与迁移片段候选) |
| `resolveVerdict(entry, holding, binding)` | 一条 OAuth 条目、交来的持有、同一次读里的绑定行 → `deliver`，或 `notResolvable`（五种不分） | [S-17](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-17-resolve) ⑥；持有相等按 `data.asset-model/v2#S-16` |
| `sweepVerdict(entry, binding, now, oauthPendingTtl)` | 恰三种交回 `discard`，其余 `keep`；待生效那一种的过期判定调桥的 `isPendingExpired`，恰在 `since + oauthPendingTtl` 那一刻交回 `keep` | [S-18](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-18-清扫) 第 1、2 条 |
| `mintCredentialRef(randomBytes)` | 32 字节随机 → base64url，不带前缀 | [S-8](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-8-秘密与引用只在各自那一个问法里出现) 第 3 条；词法归提供者（`data.identity-values/v1` G-04） |

**Cordis 服务面**：插件 `credential-custodian-local`、服务 `credentialCustodian`（六个操作，名字取契约），必需 inject `storage`、`clock`（[下节](#插件边界与服务面)）。

**只在运行时层成立、函数层不承诺**：落地只有密文（S-7——函数只封存，写不写盘、写到哪是服务面）；密钥取不到即 `unavailable`；判定所读的绑定状态与交出的本体属于同一次一致的读（S-17 ④——函数只判交来的那一对值是否相符，「同一时刻」由服务面的读事务给）；清扫与桥的完成在绑定行上排序、过期按锁到之后读的时刻判（S-18 第 2 条——`sweepVerdict` 只判交来的 `now`，锁与取时刻的先后是服务面的）；撤除时的 `custodianWithdrawn`（S-20）；秘密与引用不进日志（S-8——函数不打日志，剥离存储异常里的值是服务面的）。

| 选择 | 落选方的最强论证 | 本方弱点 | 置信度 |
|---|---|---|---|
| **判定与封存以纯函数公开**（选）；落选：只公开服务面 | 保管方是秘密的唯一落处，公开面越小越不容易被绕开；外部拿到 `openBody` 就能自己开封 | 函数的形状要随包的公开入口维护 | 中高：开封要密钥，函数公开不增加任何人手里的秘密；交出与清扫判定本来就是两个纯判定，关在插件里，外部包装者要自己重写一份、与本节点分叉 |

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个插件 `credential-custodian-local`（候选名），一条 fiber，据点根作用域一份。必需 inject：`storage`、`clock`。不 inject 桥**：读绑定行是在本插件自己的事务里调桥导出的纯读函数，不经桥的服务面（存储协议 P-13 禁止在事务里调别的插件的服务）。
它 provide 一个服务 `credentialCustodian`（服务键 [D-060 §八 M69](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），方法与契约第四节六个操作一一对应：`storeReplica`、`readReplica`、`discardReplica`、`discardLoginState`、`depositOAuth`、`resolve`。**全部尚未实现**。

插件体 provide 服务、登记**一个** effect，持有：清扫定时器、在途操作计数、撤除标记。**不持有**任何条目、任何密钥——条目在存储里，密钥每次现读（[关键选择三](#关键选择)）。

**config**（候选名；全部必填、代码里不放默认，缺一或非法即启动失败）：

| 配置项 | 形状 | 候选初值（由装配的配置给） | 来源条款 |
|---|---|---|---|
| `keyFile` | 绝对路径；落在这个据点自己的目录下 | 无初值：路径归装配（据点目录，PF-016 §5.2） | 契约 [G-9](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口)（密钥保管归提供者）；N-37 ⑤ |
| `sweepInterval` | 正时长 | **15 min**（候选；只决定无用密文在据点上多留多久，清扫不承担正确性，S-20） | 契约 [S-18](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-18-清扫) 第 4 条、G-8 |
| `oauthPendingTtl` | 正时长；**必须与桥的同一项是同一个值** | 不另给：取桥的那一项（桥契约 G-12 取值未定），装配从同一个配置源交给两边（[CCL-3](#实施缺口与消费者影响)） | 契约 S-18 第 2 条、G-8 |

**迁移**：包导出迁移片段（候选名 `credentialCustodianMigrations`），由 `apps/cli` 经 `composeMigrations` 合成，**排在桥的片段之后**（引用约束的目标表先建，[CCL-2](#实施缺口与消费者影响)）。

### 关键选择

**一、读绑定行：桥导出的事务内读函数（选）。**

| | 直接按表名读 `mcp_oauth_binding` 的列 | 调桥的服务面问绑定状态 | **桥包子路径导出一对事务内读函数，本插件在自己的事务里调（选）** |
|---|---|---|---|
| 落选方的最强论证 | 不要桥改一行代码；桥节点已写「保管方解引用时，在它自己的读事务里读这一行」 | 两个 owner 的边界最干净，本插件不碰别人的表 | —— |
| 本方弱点 | —— | —— | 本包依赖桥包（只 import 一个子路径，不加载 SDK；依赖方向与契约同向，主线已接受，D-060 §八 N-42 ⑥）；桥的四列成了有外部消费者的实现细节（桥节点 X-1／X-2 已登记） |
| 为什么选它 | 表的形状只该有一份权威：列名散在两个包里，桥改一列，本插件静默读错 | **做不到**：存储协议 P-13 禁止在本插件的事务里调别的插件的服务面；分两次读，判定所读的绑定状态与交出的本体就不属于同一时刻（S-17 ④），清扫也锁不到那一行（S-18 第 2 条） | 读法由表的 owner 给，本插件只在自己的事务里调——与组织治理给资产提供者的 `./tx-reads` 同一形状 |
| 置信度 | 中高 | | |

**二、条目本体用 AES-256-GCM 封存，附加认证数据绑条目身份（选）。**

| | 只加密本体，不带附加认证数据 | **加密本体，并把条目身份（副本：租户；OAuth 条目：引用、绑定号、持有）作附加认证数据（选）** |
|---|---|---|
| 落选方的最强论证 | 最简单；S-7 只要求「没有密钥读不出」 | —— |
| 本方弱点 | —— | 身份列一改（例如库里被人挪了一行的密文），那条就「打不开」——按 S-7 答 `absent`／`notResolvable` 并留记录 |
| 为什么选它 | 能写库的人把租户甲那一行的密文挪进租户乙那一行，乙就读到甲的凭据——S-13 ⑧、S-17 的「不拿别人那一把顶上」在库层被绕开 | 挪过去的密文开封失败，落进 S-7 已定义的那一支；代价是每次封存、开封多算几十字节 |
| 置信度 | 高 | |

**三、密钥每次操作现读密钥文件（选），不常驻内存。**

| | 插件体里读一次，常驻到撤除 | **要读或要写本体的操作各读一次（选）** |
|---|---|---|
| 落选方的最强论证 | 少一次文件读；密钥文件事后被挪走也不影响服务 | —— |
| 本方弱点 | —— | 每次多一次 32 字节的文件读（没有测量说明它是瓶颈；有测量再加缓存，并写明失效条件） |
| 为什么选它 | 「密钥此刻取不到 ⇒ `unavailable`」（S-7）在常驻之后永远不会发生，S-26 的「另让密钥取不到」只能以启动失败观察——那是「服务不在」，不是契约要的 `unavailable`；手工换钥也要重启才生效 | S-7 的「此刻」按字面兑现；换钥下一次操作即生效（旧条目按「打不开」收，S-7） |
| 置信度 | 中高 | |

**四、密钥文件缺席时：两张条目表都空才生成，任一张非空即启动失败（选；主线裁定 [D-060 §八 N-42](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) ②）。**

| | 要求装配预先生成（缺席一律启动失败，同 `apps/tenancy-host` 的部署密钥） | 缺席一律在插件体里生成，表里已有条目时留 error 级记录 | **缺席且两张表都空 ⇒ 排他生成；缺席而任一张非空 ⇒ 启动失败（选）** |
|---|---|---|---|
| 落选方的最强论证 | 与已有装配同一政策：密钥是部署输入，缺了就响 | 据点总起得来；副本在中心可达时被重取覆盖 | —— |
| 本方弱点 | —— | —— | 密钥文件真丢了（误删、盘坏）而表里有条目时据点起不来，直到人恢复密钥文件、或清掉两张表再起（**本版没有给这一步的运维出口**，[CCL-13](#实施缺口与消费者影响)）；启动时多一次读存储 |
| 为什么不选／选它 | 据点是一个账号在一台机器上的本地实例，按账号现起（PF-016 §5.2），第一次起来时没有一个「部署」步骤去跑 keygen，而那时表是空的、没有东西会因新钥作废 | **OAuth 那一半没有覆盖路径**：新钥之下旧 OAuth 条目全部打不开，它们不属于三种可丢（绑定 `granted` 且记的就是它时不丢），本版也不作废绑定（契约 [S-7](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-7-加密落地) 第三条、[G-10](../../../../spec/capabilities/credential-custodian/v2/contract.md#十一已知缺口)）——一次误删被悄悄变成一批永久「`granted` 却交不出」的绑定 | 第一次起来照样自己生成；换钥不再是一条悄悄走通的常态路径，要人看见 |
| 置信度 | 中 | | 中高 |

**换钥或条目损坏之后两半各怎样收**（代价，不因本选择消失——密钥文件被人换过、或条目本身损坏时仍会发生）：

| 条目 | 打不开之后 | 有没有覆盖路径 |
|---|---|---|
| 副本 | `readReplica` 答 `absent`；warn 级工程记录（写租户） | 有：下一次写入同一租户时整行替换（S-7） |
| OAuth 条目 | `resolve` 答 `notResolvable`；**error 级**工程记录（写绑定号与持有，不写引用）；**条目留下、不作废绑定**——绑定仍 `granted`，桥那一次 `credentialUnavailable` | **没有**：不属于三种可丢，桥本版感知不了（G-10；等续期写回那一版桥感知绑定失效，D-060 §八 N-42 ② D-2） |

启动时对密钥文件的判定（插件体开头，服务出现之前）：**不存在** ⇒ 在一个读事务里数两张条目表的行：都是零 ⇒ `open(keyFile, 'wx', 0o600)` 写 32 字节随机，撞 `EEXIST`（另一实例刚建）⇒ 转读；任一张非零 ⇒ **不生成**、抛出 ⇒ `FAILED`、装配启动失败（诊断点名 `keyFile` 与两张表各自的条数，不写引用、不写本体）；那一次读存储失败 ⇒ 同一收场。**存在** ⇒ 打开、对同一句柄 `fstat`：不是普通文件、对 group／other 有任何权限位、长度不是 32 字节 ⇒ 抛出 ⇒ `FAILED`、装配启动失败（配置错误；与 `apps/tenancy-host` 的密钥文件规矩同形）；读不到（`EACCES`、`EIO`）⇒ 同一收场。**运行期**每次现读失败 ⇒ 那一次 `unavailable`、warn 级记录（点名文件路径，不含内容），**不在运行期生成新钥**——运行中生成等于悄悄换钥。

**五、清扫：一轮一个读事务预筛、每条可丢的一个写事务锁绑定行再判（选）。**

| | 一个写事务里锁住全部绑定行、一次删完 | 每条条目都开一个写事务 | **读事务预筛出「看起来可丢」的，逐条开写事务、锁绑定行、按锁到之后读的时刻重判（选）** |
|---|---|---|---|
| 落选方的最强论证 | 一轮一次提交，最少往返 | 最直接，不会漏判 | —— |
| 本方弱点 | —— | —— | 预筛与重判之间变成可丢的那一条等下一轮（上界仍是 `sweepInterval`，见下） |
| 为什么选它 | sqlite 下整轮持库级写锁，桥的完成在这期间全被挡住；pg 下锁的行数随条目数长 | 待生效、正在用的条目也要进写事务，平白与桥的完成争锁 | **正确性只在写事务里判**（锁行、现读、现取时刻）；预筛只省掉不可能被丢的那些 |
| 置信度 | 中高 | | |

**清扫的节拍**（调度语义）：**起点到起点**——节拍点固定在 `t₀ + k · sweepInterval / 2`（`t₀` 是 effect 登记的时刻，用本地定时器量，不读墙钟）；每个节拍点**开始**一轮，不从上一轮结束起算。**轮不重叠**：节拍点到来时上一轮还没做完 ⇒ **这一拍跳过**、记 warn（写上一轮已用的时长），下一轮在下一个节拍点开始。上界：条目在 `t` 成为可丢（可丢是单调的：过期不回头，`revoked` 与「记的不是它」都不再变），`t` 之后的第一个节拍点不晚于 `t + sweepInterval / 2`，那一轮在 `sweepInterval / 2` 内做完即不晚于 `t + sweepInterval`（S-18 第 4 条，契约已写明「一轮在 `sweepInterval / 2` 内做完」这一前提）。若改成「上一轮结束之后隔半个间隔」，最坏要到 `t + 3 · sweepInterval / 2`；若允许重叠，慢的那一轮与新的一轮一起与桥争同一批绑定行。这个比例是为兑现上界推出来的机制，不是另一项策略；要把它做成配置项等于让配置者能配出兑现不了上界的值。

### 契约责任到插件、服务与操作

契约的九件事本表不复述，只写兑现点与缺口。**每个写操作至多一次写事务；封存、开封、读密钥都在事务之外**。方法名取契约，其余名字标候选；全部**尚未实现**。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-5-保管条目) 条目恰两种、一个租户一条副本 | 两张表：副本以租户为主键；OAuth 条目以引用为主键、带持有与绑定号（[表](#表与迁移片段候选)） | 尚未建包 | 两种不互相转换：两张表、两套操作；OAuth 条目一经写下不再改（本节点没有任何 `UPDATE` 它的语句） |
| [S-6](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-6-据点隔离与按登录状态归属) 据点隔离、按登录状态归属 | 每个据点一份 `storage`、一个 `keyFile`；副本行带 `login_state` 列 | 尚未建包 | 隔离由装配给（每据点装自己的一份，S-19 第 4 行）；归属只用于 `discardLoginState`，**读不核登录状态**（第 3 条） |
| [S-7](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-7-加密落地) 加密落地 | 本体经 `sealBody` 封存后才进写事务；密钥每次现读（关键选择三） | 尚未建包 | 密钥取不到 ⇒ `unavailable`、什么都不写；开封交回 `unopenable` ⇒ `readReplica` 答 `absent`（warn 级工程记录，写租户）、`resolve` 答 `notResolvable`（**error 级**，写绑定号与持有，**不写引用**；条目留下、不作废绑定，契约 G-10）——两半的差别见[关键选择四](#关键选择)的代价表 |
| [S-8](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-8-秘密与引用只在各自那一个问法里出现) 秘密与引用只在各自那一个问法里 | 本体只出现在 `readReplica`、`resolve` 的成功返回；引用只出现在 `depositOAuth` 的成功返回 | 尚未建包 | **存储异常要剥值**：pg 的唯一冲突与引用约束失败在错误详情里带键值（引用就是 OAuth 条目的主键）——本插件上抛或记日志前只留失败类型与约束名，**丢掉 `cause`**（[失败映射](#状态并发与失败映射)末行）；哨兵检查见 verification N-4 |
| [S-9](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-9-缺席时的默认答案)、[S-10](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-10-失败值) 缺席、失败值 | 判定次序：表示层 → 撤除标记 → 取密钥（只在要读或写本体的四个操作）→ 存储 → 条件 → 开封 | 尚未建包 | 失败值恰五个，没有 catch-all；缺陷原样上抛（剥值之后） |
| [S-12](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-12-storereplica) `storeReplica` | 表示层 → 撤除 → 读密钥、`clock.now()` → 封存（身份 = 租户）→ 一次写事务：按租户主键插入或整行覆盖（本体、`login_state`、`stored_at` 一条语句一起换） | 尚未建包 | 两次并发写同一租户：同一主键行上后提交的整行胜出（sqlite 由库级写锁、pg 由行锁排序）；`clock` 答 `'unavailable'` ⇒ `unavailable` |
| [S-13](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-13-readreplica) `readReplica` | 表示层 → 撤除 → 读密钥 → 一次读事务取那一行 → 事务外开封 | 尚未建包 | 没有行 ⇒ `{ absent }`；**密钥取不到先于判有没有**：答 `unavailable`（S-9 第 3 行「密钥读不到 ⇒ `unavailable`」），不答 `absent` |
| [S-14](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-14-discardreplica) `discardReplica` | 一次写事务按租户删 | 尚未建包 | 不读密钥；删零行也是同一个成功返回 |
| [S-15](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-15-discardloginstate) `discardLoginState` | 一次写事务 `DELETE … WHERE login_state = ?` | 尚未建包 | 「只删归属它的」与并发重写的交错见[下节](#同一张副本表上的两个写入者)；**本版没有调用方**（契约 G-5，CCL-4） |
| [S-16](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-16-depositoauth) `depositOAuth` | 表示层（含 ③：`scope` 恰是租户格且载的就是 `holding.tenant`）→ 撤除 → 读密钥 → 铸引用、封存（身份 = 引用、绑定号、持有）→ 一次写事务插一行 | 尚未建包 | 绑定号不存在 ⇒ 引用约束以 `ReferenceViolation{missing-target}` 拒 ⇒ `bindingUnknown`（存储协议 P-10）——**提交那一刻绑定在**由约束给，不另读；不看绑定状态；撞引用主键（32 字节随机）⇒ 缺陷 |
| [S-17](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-17-resolve) `resolve` | 表示层（含 ③）→ 撤除 → 读密钥 → **一次读事务**：按引用取条目、经桥的 `readOAuthBinding` 取绑定行 → `resolveVerdict` → 事务外开封 | 尚未建包（桥的 `./tx-reads` 同样尚未建包） | 同一读事务 ⇒ 绑定状态与本体同属一个快照（存储协议 P-6）；五种 `notResolvable` 不分；条目在而绑定行不在 ⇒ 缺陷（引用约束保证它不会发生）；读事务一旦判定交出，其后绑定迁 `revoked` 也照样交出（S-17 表后「在途的照常完成」） |
| [S-18](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-18-清扫) 清扫 | effect 里的定时器，起点到起点每 `sweepInterval / 2` 一拍、轮不重叠：读事务预筛 → 逐条写事务：`lockOAuthBinding` → 现读绑定行 → **锁到之后** `clock.now()` → `sweepVerdict`（过期经桥的 `isPendingExpired`）→ 删条目 | 尚未建包（桥的 `./tx-reads` 同样尚未建包） | 与完成的排序落在绑定行上、过期谓词与桥是同一个函数（[跨 owner 一节](#跨-owner-的同一提交桥的绑定行与引用约束)）；绑定行读不到、`clock` 答 `'unavailable'` ⇒ 这一条这一轮跳过（第 3 条）；上界与调度语义见[关键选择五](#关键选择)末段 |
| [S-19](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 装配给 vs 协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |
| [S-20](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-20-撤除重启与在途) 撤除、重启与在途 | 撤除标记在进入事务之前核；已进事务的跑完 | 尚未建包 | 见[装卸](#成对的装载与撤除) |

### 跨 owner 的「同一提交」：桥的绑定行与引用约束

两个写入者：**桥**（迁绑定：`beginOAuth` 作废旧的、`completeOAuth` 迁 `granted` 并记下引用、续期被拒迁 `revoked`）与**本插件**（收下条目、清扫删条目）。契约 [S-19](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 第 2 行要它们「在那个绑定上排出次序」。**共同触碰的存储对象**：

1. **`mcp_oauth_binding` 那一行**（桥的表，列 `state`、`since`、`credential_ref`）：桥迁状态时锁它（桥 R-B4）；本插件清扫时在自己的写事务里 `lockRow` 同一行（pg 上是 `SELECT … FOR UPDATE`，sqlite 上写事务本身持库级写锁）；`resolve` 在一次读事务里读它。
2. **`credential_custodian_oauth_entry.binding_id → mcp_oauth_binding.binding_id` 的引用约束**（`ON DELETE RESTRICT`）：条目插入时绑定行必须在；绑定行在还有条目指着它时删不掉（S-16 ④、S-19 第 2 行）。**它成立的前提**是两张表在同一个 `storage`、同一约束域（N-37 ⑤；cli 要求 S-h）——分在两份存储就没有这条约束，也没有上面那一行锁。

**不用的三个替身**：时刻（`now` 只用来判过期，次序由行锁给）；进程内锁（本插件与桥是两个插件实例，各自随 fiber 生灭）；没落盘的「单调事实」（「已 `granted` 且记着谁」就是那一行上的两列）。

**过期谓词只有一份**：两边判「待生效的绑定过没过期」都调桥 `./tx-reads` 导出的 `isPendingExpired(binding, now, ttl)`（`now > since + ttl`，严格大于；契约 S-18 第 2 条写明同一式；桥节点 X-3，桥的完成 S-23 ⑦ 也经它）。它只判时刻那一半，`state` 由调用方先判。它不是存储对象，却是这条排序的另一半前提：锁排出先后之后，后到的一方要与先到的一方对同一时刻得出同一判定——两边各写一份比较，运算符一不同，结论就在边界那一刻分叉（见下面第一条的边界一支）。

**反证三条交错**（每条都能在绑定行上排出次序）：

- **清扫与完成**（桥节点的第三条反证、契约的形式模型）：条目 `r` 已收成「待生效」，绑定 `b` 仍 `pending`。完成先锁到 `b` ⇒ 迁 `granted` 记 `r` ⇒ 清扫随后锁到、读到 `granted` 且记的就是 `r` ⇒ 不删。清扫先锁到而未过期 ⇒ 不删 ⇒ 完成照常。清扫先锁到而已过期（锁到之后读的 `now` 使 `isPendingExpired` 为真）⇒ 删 `r` ⇒ 完成随后锁到、它读的时刻不早于清扫那一次（同一个 `clock`，不后退）⇒ 同一个函数同样判过期 ⇒ 不迁。**恰在边界**：两边读到同一毫秒 `now = since + oauthPendingTtl`（`clock` 同一毫秒内两次读得同值可达）⇒ 两边都判未过期 ⇒ 清扫不删、完成迁 `granted` 且交得出。反过来若本插件手写 `≥` 而桥是 `>`：清扫判过期删了 `r`、完成判未过期迁 `granted` 记下已删的 `r`——这就是「`granted` 却交不出」，模型看不见它（模型两侧共用一个 `Expired`）。**没有「`granted` 却交不出」**的前提因此是「同一个函数」，不是「两边都写对了」。去掉「按锁到之后读的时刻判」（清扫在锁之前取时刻）：清扫在 `t₁` 取时刻判未过期、锁到时已过期却不删——只是晚丢一轮，不破坏安全；**桥那一侧**若在锁之前取时刻则会迁 `granted` 一条已被删的条目——那是桥的前提（`CompleteFreshTime`），本插件的份额是「锁到之后才取 `now`」。
- **新的一次发起与清扫**：桥的 `beginOAuth` 在一个写事务里把旧绑定 `b` 迁 `revoked`（写这一行即锁这一行），清扫要锁同一行。发起先 ⇒ 清扫读到 `revoked` ⇒ 删。清扫先 ⇒ 读到 `pending`、按时刻判 ⇒ 未过期不删；下一轮读到 `revoked` ⇒ 删。
- **收下与桥删绑定行**：桥节点没有删绑定行的写路径；若将来有，引用约束让「还有条目指着」的删除以 `ReferenceViolation{delete-restricted}` 失败——绑定不会在条目之前消失（S-19 第 2 行）。收下与绑定迁移之间没有冲突：插入只对绑定行做引用检查（pg 上是键共享锁，与只改非键列的更新兼容），**收下不看绑定状态**（S-16 末条）。

**反证不了、要真并发演练的**：清扫与完成在 pg 上真并发（两个连接、同一个绑定、恰好过期那一刻，加「两边读到恰是边界那一毫秒」一支）——契约场景 [S-28](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-28-清扫与完成交错)，verification N-1。模型（`credential-custodian-v2-sweep`）把「在绑定上排序」建成每个动作的原子性，**正是本节写的这件事它盖不到**。

### 同一张副本表上的两个写入者

`storeReplica` 与 `discardLoginState` 都写副本表（同一个 owner，两条操作）。**共同对象是副本那一行**：`discardLoginState(L1)` 与把 `T2` 改归 `L2` 的 `storeReplica(L2, T2, …)` 并发时——sqlite 下库级写锁把两者排成先后；pg 下 `DELETE … WHERE login_state = L1` 碰到被并发更新的行，等锁之后按新版本重判条件（读已提交下的重判，存储协议 P-3），新版本的 `login_state` 已是 `L2` ⇒ 不删。两种次序的结局都是「只删此刻归属 `L1` 的」（S-15 末条）。pg 那一支要真并发演练（verification N-2）。

### 事件与过滤器

**不发、不听任何 Cordis 事件**（契约第六节）。写下、丢弃、清扫都不通知；消费者在自己的时机来读。

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 存储 `storage` | **必需 inject**；实例 `infra/storage-sql`，据点根一份 | 提供者换代 ⇒ 本插件重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)）；条目在存储里，不丢 | 缺席 ⇒ `PENDING`、服务不出现；消费者都是调用时现取本服务，按各自契约收成「保管方缺席」（P-1r：没有本地副本；桥：`dependencyUnavailable`） |
| 时间源 `clock` | **必需 inject**；`infra/clock` | 同上 | `'unavailable'` ⇒ `storeReplica` 答 `unavailable`；清扫跳过这一轮 |
| 桥的事务内读函数与过期谓词（`mcp_oauth_binding` 的读与锁、`isPendingExpired`） | **纯 import**，不经 Cordis；桥包子路径 `./tx-reads`（桥节点[已登记](../../tools/mcp-bridge/design.md#给凭据保管方的外部依赖登记)；它的导入限定规则归桥 B-10） | 随包版本 | 桥插件在不在无关：表由迁移建立；桥没装、表是空的 ⇒ `depositOAuth` 撞引用约束 ⇒ `bindingUnknown` |
| 身份值、持有与引用的形状 | **纯 import** | 随包版本 | —— |

**被谁消费**：P-1r（`packages/model/model-profile-directory`）调用时现取、只许调 `storeReplica`／`readReplica`（静态检查归 MPD-N4）；桥本体（`packages/tools/mcp-bridge`）调用时现取、只许调 `depositOAuth`／`resolve`（桥 N-14）。**`discardReplica`、`discardLoginState` 本版没有调用方**。本插件是这六个方法的 owner：`tools/ts-checks` 的 `restricted-call-sites` 规则要为它加三条（readReplica ⇐ P-1r、depositOAuth／resolve ⇐ 桥本体），由上面两个节点的缺口一并闭合（契约 S-19 第 3 行）。

### 对存储提供者的要求清单

| # | 要求 | 对应条款 | 协议兑现点 |
|---|---|---|---|
| K-1 | 单次提交原子：副本整行插入或覆盖；一条 OAuth 条目的插入；按租户、按登录状态、按引用的删除 | S-12 ④、S-14 ④、S-15 ④、S-16 ④、S-18 | P-1 |
| K-2 | 唯一约束可识别：副本以 (租户组织分量, 租户账号分量) 为主键；OAuth 条目以引用为主键 | S-5「一个租户一条」；S-8 第 3 条 | P-11（主键不另命名，统一报 `<table>_pkey`） |
| K-3 | **跨 owner 的引用约束**：OAuth 条目的 `binding_id` 指向 `mcp_oauth_binding.binding_id`，`ON DELETE RESTRICT`、不延迟；插入指向不存在的目标 ⇒ `missing-target` | S-16 ④⑧、S-19 第 2 行 | P-10。**与桥节点 [R-B5](../../tools/mcp-bridge/design.md#对存储提供者的要求清单)、C-1 互指**；cli 要求 S-h |
| K-4 | 锁定读：清扫的写事务里对那一个绑定行取排他锁，与桥迁状态的写事务排成一个次序 | S-18 第 2 条 | P-4。**与桥 R-B4、C-3 互指**（锁的是同一行） |
| K-5 | 只读事务快照一致：条目行与绑定行在同一快照里读 | S-17 ④ | P-6。**与桥 C-2 互指** |
| K-6 | 读已提交下的并发删除按行的新版本重判条件 | S-15 末条 | P-3（pg 写事务 READ COMMITTED） |
| K-7 | 持久：提交成立后跨重启仍在。**边界**：sqlite `synchronous = NORMAL` 下操作系统崩溃或断电可能丢最后一段已提交事务（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md)）——丢的若是一条副本，调用方已被告知成功，下一次中心可达时重取；丢的若是一条 OAuth 条目而桥已记下它的引用，那个绑定「`granted` 却交不出」，人要重取一次 | S-20 第 1 条 | P-7 |
| K-8 | 不可用可识别：不返回空、不返回旧快照 | S-9 第 3 行 | P-8 |
| K-9 | 两张表与桥的 `mcp_oauth_binding` 在**同一个** `storage` 实例、同一约束域 | S-19 第 2 行 | 装配（cli 要求 S-a、S-h）；本节点只能写下要求 |

### 表与迁移片段（候选）

| 记录（候选表名） | 键与列（候选） | 对应条款 |
|---|---|---|
| 副本 `credential_custodian_replica` | 主键 `(tenant_organization, tenant_account)`；`login_state`（`LoginStateId`）、`stored_at`（`Instant`）、`sealed_body`（二进制）；非唯一索引 `credential_custodian_replica_login_state_idx` | S-5、S-6 第 2 条、S-12～S-15 |
| OAuth 条目 `credential_custodian_oauth_entry` | 主键 `ref`；`binding_id`（引用约束，K-3）、`holding_tenant_organization`、`holding_tenant_account`、`holding_endpoint`、`sealed_body`；非唯一索引 `credential_custodian_oauth_entry_binding_idx` | S-5、S-16～S-18 |

持有的 `scope` 恒是 `holding.tenant` 那一格（S-16 ③ 在写入前已判），所以不另存；持有相等化为 (租户两个分量, 接入点能力标识) 相等。
**封存格式**（`sealed_body`）：`版本号（1 字节）‖ 随机数（12 字节）‖ 密文 ‖ 认证标签（16 字节）`；附加认证数据是条目身份的确定编码（副本：固定前缀 ‖ 租户两个分量；OAuth 条目：固定前缀 ‖ 引用 ‖ 绑定号 ‖ 持有），各段带长度前缀。版本号留给换钥与换算法（契约 G-9，本版只有一版）。
**本机只放密钥**：`keyFile` 一个文件、32 字节、`0600`。它不进存储、不进任何日志。

## 状态、并发与失败映射

**写权**：两张条目表只由本插件写；绑定行只由桥写，本插件只读与锁。**提交点**：每个写操作一次写事务。**并发**：同一租户的副本写经主键行排序；清扫与完成经绑定行排序（[上文](#跨-owner-的同一提交桥的绑定行与引用约束)）；进程内没有任何锁承担正确性。**服务状态**：`serving` → `withdrawn`（撤除开始，单调）。

**失败映射**（没有 catch-all）：

| 情形 | 映射 |
|---|---|
| 身份参数缺席、形状不合、`body` 为空；OAuth 的持有不在租户格或载的租户不是 `holding.tenant` | `invalidInput`（表示层，先于一切读） |
| 撤除标记已置而这一次还没进入事务 | `custodianWithdrawn` |
| 撤除标记已置而这一次在事务里以 `StorageUnavailable` 收场（存储随撤除一起关了） | `custodianWithdrawn`——**提交了没有不确知**（S-20 第 2 条） |
| 密钥文件此刻读不到、不是普通文件、权限位对 group／other 开着、长度不对 | `unavailable`（运行期；warn 级记录点名路径，不含内容） |
| `clock` 答 `'unavailable'`（`storeReplica`） | `unavailable` |
| `StorageUnavailable` | `unavailable` |
| `depositOAuth` 撞引用约束 `missing-target` | `bindingUnknown` |
| 开封交回 `unopenable` | `readReplica` ⇒ `{ absent }`，warn 级工程记录；`resolve` ⇒ `notResolvable`，**error 级**工程记录，条目留下、绑定不动（G-10） |
| `resolve` 的五种条件任一不成立 | `notResolvable` |
| `StorageDefect`、撞引用主键、条目在而绑定行不在、读出的行形状不对 | 缺陷：上抛、error 日志——**不折成 `unavailable`** |
| **任何上抛或记日志的存储异常** | **只留失败类型与约束名，丢掉 `cause` 与错误详情**：pg 的约束失败详情里带键值，引用会因此进日志（S-8） |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| config 校验 | `definePlugin` 的 `Config`，插件体之前 | 不过 ⇒ `FAILED`、装配启动失败 | —— |
| 密钥文件（启动时确认，或两张条目表都空时生成，[关键选择四](#关键选择)） | 本机文件，**不属于任何实例**；插件体开头、`provide` 之前 | 判定不过（含缺席而条目表非空、数行时存储读失败）⇒ 插件体抛出 ⇒ `FAILED`，服务不出现、不生成文件；生成时写到一半失败 ⇒ 删掉本次建出的文件再抛 | **不删、不改**：密钥与条目都是耐久事实，撤除不动（S-20 第 1 条） |
| `ctx.provide('credentialCustodian')` | 本 fiber；两个必需依赖都在、密钥文件判定通过之后可解析 | 随 fiber 撤（`provide` 由 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**，CCL-12） | 服务消失；已拿到引用的调用方此后得 `custodianWithdrawn` |
| 一个 effect：清扫定时器、在途计数、撤除标记 | 本 fiber；登记即开始计时，第一轮在 `sweepInterval / 2` 之后 | —— | **撤除序列**（同一个 effect 的 disposer 里按次序 `await`）：① 置 `withdrawn`——此后到达的调用、还没进事务的调用一律 `custodianWithdrawn`；② 清掉定时器，不再起新的一轮；③ 等在途的那一轮清扫与在途操作的事务结束——**内核不取消在途调用，它们跑完，按各自那一次提交收场**；④ 结束。**保留**：两张表的全部条目、密钥文件——下一次在场照样读得到 |
| 迁移片段 | 装配合成、存储提供者在 `provide('storage')` 之前跑 | 迁移失败 ⇒ 存储提供者启动失败，本插件 `PENDING` | 不随本插件撤除 |

**次序只在一个 effect 里组合**：effect 之间的释放是并发的（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)），「先停新工作、再等在途」不能靠两个 effect 的注册次序。**撤除次序**：**要求 `apps/cli` 把本插件加入它的显式撤除次序**（在桥之后、先于 `storage` 与 `clock`；cli 的承接行 A-32，[「归装配」逐条承接](../../../apps/cli/design.md#归装配的事项逐条承接)）。**未加入时的收场**（已兜住，次序不承担正确性）：存储与本插件同时撤除，第 ③ 步等的事务可能以 `StorageUnavailable` 收——按失败映射收成 `custodianWithdrawn`，提交了没有不确知（S-20 第 2 条）；显式次序只让验收里的撤除收场确定、可断言。

**提供者换代时收掉什么**（F 第二问）：存储或时钟换代 ⇒ 上面的序列跑完、插件体重跑、下一任从存储里读到全部条目；**没有只活在实例里的事实**（清扫的进度不需要交接，下一任的第一轮重新预筛）。**在途的外部效果**：无——本插件不对外发任何东西。

## 装配给与协议给：本节点单机怎样兑现左列

照契约 [S-19](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-19-装配给的保证-vs-协议须给的保证) 逐行；右列（跨进程之后）本节点一条都不兑现。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 加密落地 | 本体只以 `sealed_body` 进存储；密钥只在本机文件 | 本节点 |
| OAuth 条目的可用判在绑定上 | 引用约束（K-3）＋ 一次一致读（K-5）＋ 清扫锁绑定行、锁到之后取时刻（K-4）；过期谓词与桥同一个函数（`isPendingExpired`）；`oauthPendingTtl` 与桥同一个值、`clock` 同一个 | 本节点 ＋ 桥 ＋ **装配**（同一 `storage`、同一 `clock`、`oauthPendingTtl` 同源：CCL-2、CCL-3） |
| 只有具名消费者够得着取值问法 | 本节点不判调用方；进程内能力间面，不接任何入口 | **装配**（结构检查：MPD-N4、桥 N-14 与 `restricted-call-sites` 规则） |
| 据点隔离 | 本节点只读自己那份 `storage` 与自己那个 `keyFile` | **装配**（每个据点装一份，路径落在各自的据点目录下） |
| 写副本的租户与登录状态属实 | 本节点不核 | **装配**（P-1r；来路 G-6，CCL-5） |

**归装配的事项**（点名给 `apps/cli`）：据点目录下的 `keyFile` 路径；本插件与桥的迁移片段合成次序（桥在前，CCL-2）；`oauthPendingTtl` 从同一个配置源交给本插件与桥（CCL-3）；`sweepInterval` 的值；本插件与桥同一个 `storage`、同一个 `clock`；把本插件加入显式撤除次序（在桥之后、先于存储与时钟；未加入时的收场见[装卸](#成对的装载与撤除)）；验收装配里以一个测试登录状态经 `storeReplica` 写副本种子；`restricted-call-sites` 的三条调用点限定。

## 实施缺口与消费者影响

契约第十一节的缺口不重抄；下表是**本节点自己的**缺口，编号 CCL-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| CCL-1 | **已由桥节点 X-1／X-2 闭合**：桥包子路径 `./tx-reads` 导出 `readOAuthBinding`、`lockOAuthBinding`（[桥的公开面](../../tools/mcp-bridge/design.md#公开面)），四列与锁登记为有外部消费者的实现细节并互指本节点 K-4、K-5（[桥的外部依赖登记](../../tools/mcp-bridge/design.md#给凭据保管方的外部依赖登记)）；过期谓词 `isPendingExpired` 随同一子路径导出、桥自己的完成也经它（桥节点 X-3，D-060 §八 N-42 ②） | —— | —— | —— |
| CCL-2 | 引用约束的目标表由桥的迁移片段建：本插件的片段必须排在它之后；**没装桥的装配也要合成桥的片段**，否则 pg 上建表失败、sqlite 上插入即缺陷 | 迁移；`depositOAuth` | `apps/cli` | cli 的迁移合成写明次序 |
| CCL-3 | `oauthPendingTtl` 在本插件与桥各有一项配置，契约要两边同一个值（S-18 第 2 条）。落选的另一形状：桥在发起时把过期时刻写成绑定行上的一列，两边读同一列、不再各持一份配置——那要改桥的表与桥契约 S-8 的「读时判定」写法；**主线已裁本版维持双持加相等装配测试**（D-060 §八 N-42 ③ D-1）。谓词本身已只剩一份（`isPendingExpired`），双持的只是值 | S-18 第 2 条 | `apps/cli`（同源给值、结构检查） | cli 从同一配置项交给两边，并有一条「两边相等」的装配测试 |
| CCL-4 | **没有人调 `discardLoginState`**（契约 G-5）：产品里副本不随登录状态清除 | S-15、第七节进展第 2 行 | 主线 → 未来资产/据点入口（版本未分配） 与 `capability.account-identity` 据点一侧 | 「登录状态结束」有来路 |
| CCL-5 | **没有人以真实值调 `storeReplica`**（契约 G-6）：P-1r 问不了中心（MPD-N2），产品里没有副本；离线调模型如实 `credentialUnavailable` | S-12、PF-016 §6.17／§6.20 | 主线 → 未来资产/据点入口（版本未分配）（cli C-4） | 秘密的送达有契约 |
| CCL-6 | **不换钥、不重加密**（契约 G-9）：换钥即旧条目全部「打不开」 | S-7 | `infra/secrets` 那一程 | 那一程的节点写明换钥；封存格式的版本号已留 |
| CCL-7 | **已闭合**：契约场景 [S-23](../../../../spec/capabilities/credential-custodian/v2/contract.md#s-23-另一个账号的据点读不到) 已写明「只拷条目，B 的密钥不变」（D-060 §八 N-40 ③）；连密钥文件一起拷属契约 S-3 明说不挡的「密钥与密文都够得着」 | —— | —— | —— |
| CCL-8 | **已闭合**：契约 S-18 第 4 条已写明上界的前提「一轮清扫在 `sweepInterval / 2` 内做完」（D-060 §八 N-40 ③）；条目多、存储慢时不成立，本节点以 warn 与跳拍让它可见（[关键选择五](#关键选择)末段） | —— | —— | —— |
| CCL-9 | **启动时与运行期两种收场**：密钥文件在启动时不合格 ⇒ 启动失败（配置错误一个政策；cli 写「密钥取不到 ⇒ 验收装配启动失败」）；运行期读不到 ⇒ 那一次 `unavailable`（S-7、S-26）。两者按时点分开，cli 那一句要按此读 | S-7、S-26；cli 装卸表 | `apps/cli` | cli 那一行写明「启动时」 |
| CCL-10 | **已裁**：路径维持 `infra/`——主线把[两层布局](../../../README.md#packages-的两层布局)里 `infra/` 的定义扩为「兑现 `core/` 协议级构造，或据点／中心的窄口基础设施契约（密钥保管、进程起停、连接探测）」（D-060 §八 N-40 ①）；本包对 `tools/mcp-bridge` 子路径的依赖与契约依赖同向，接受（N-42 ⑥） | —— | —— | —— |
| CCL-11 | **上游语义待取证**：GCM 认证失败的抛出点、`'wx'` 排他创建、对同一句柄 `fstat`（[实现路径](#实现路径与来源)）——basis 没有条目，**假设，须按 source-check 取证** | S-7、关键选择三与四 | 本节点 | 实施时各加一条会失败的测试 |
| CCL-12 | `provide` 由 effect 纳管：kernel-basis 有 probe、没有 basis 条目——**待核对主张** | 装卸表 | `core/kernel-basis` owner | 升格为 basis 条目 |
| CCL-13 | **密钥文件丢了而条目表非空时没有运维出口**（[关键选择四](#关键选择)）：据点启动失败，人要么把密钥文件放回，要么清掉两张条目表（丢掉全部副本与 OAuth 条目，那些绑定随之「`granted` 却交不出」，G-10）再起；本版没有给后一步的命令或说明 | 据点启动；S-7 | `apps/cli`（诊断文案指向哪一步）＋ `infra/secrets` 那一程（换钥） | cli 的启动失败诊断写明两条出路；或换钥进 `infra/secrets` |

**报给主线**（不在本节点改）：`apps/cli` 验收装配的凭据保管方一行仍写「`keyFile` 缺席时启动生成」，按关键选择四要改为「缺席且两张条目表都空才生成，否则启动失败」（CCL-13）。桥的 `completeOAuth` 判过期已经走同一个 `isPendingExpired`（桥节点 X-3、S-23 行）。CCL-3 的另一形状（过期时刻落成绑定行一列）主线已裁维持双持加相等装配测试（D-060 §八 N-42 ③ D-1）。**产品装配里装不装**：本版不装（cli 关键选择 5）；装上之后 OAuth 那一半有真实调用方（桥），副本那一半没有写入方也没有丢弃方（CCL-4、CCL-5）——如实失败，不填默认值。
