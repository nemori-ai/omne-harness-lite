# PF-017 治理中心作为可部署应用 · 设计投影 v1

- 对应需求：[PF-017](../../README.md) 全部条款——治理中心作为一个可部署、可被客户端接入的应用：只认登录状态、判定次序与两种拒绝、要么整个起来、重启与停机、升级整体性、时间不倒退、部署密钥与参数、中心标识、运维面与两种体检。**不含**据点一侧的呈现与凭据保存（PF-016）、领域语义本身（PF-001，见 [PF-001 投影 v2](../../../PF-001-identity-scope-and-agent-constraints/projection/v2/projection.md)）。
- 本版依据的需求修订：**PF-017 rev 2**（`README.md` front-matter；rev 2 于 2026-09-23 落三条裁决 INT-016～INT-018），PF-016 rev 3（对端），PF-001 rev 16（登录状态语义）。
- 状态：**当前，已接受为实施入口**——[D-028](../../../../record/decisions/governance-center-design-acceptance/README.md)（产品负责人，2026-09-23）。两份契约来源 `accepted`、已冻结（[provenance.json](provenance.json) 里契约的 sha256 即 `frozen.json` 登记值）；需求与节点来源不在冻结集合，实施前先核那些坐标。
- 未决 gap 数：**11**（见[第 7 节](#7-未决项)），其中 **G-10、G-11 在入口层建包之前必须闭合**。

**读法**：第 1～4 节回答「必须为真的是什么」，来源是契约；第 5～6 节回答「用哪些原语兑现、有什么证据」，来源是节点。
条款坐标缩写：`gce` = [`composition.governance-center-entry/v1`](../../../../spec/compositions/governance-center-entry/v1/contract.md)，`ai` = [`capability.account-identity/v2`](../../../../spec/capabilities/account-identity/v2/contract.md)（**本投影的 `ai` 指 v2**），`og` = [`capability.organization-governance/v1`](../../../../spec/capabilities/organization-governance/v1/contract.md)，`ar` = [`composition.account-registration/v1`](../../../../spec/compositions/account-registration/v1/contract.md)，`iv` = [`data.identity-values/v1`](../../../../spec/data/identity-values/v1/contract.md)。

## 1. 本版覆盖的需求条款

确认状态：PF-017 rev 1 于 2026-09-23 由产品负责人通读后接受，rev 2 同日落三条裁决；**全部为「已确认」**，没有「继承待核对」与「候选假设」。覆盖关系登记在 [`covers.json`](../../../../registry/README.md#covers)（全部 `reviewed: false`；§6.9 与 §6.10 第 1 行 → `gce#S-34` 是「缺口登记型」，指 G-12）。

| 需求 | 契约落点 | 备注 |
|---|---|---|
| [§4 中心标识](../../design.md#中心标识)、[§6.12](../../design.md#612-同一个中心换了地址还是它另一个中心必须被认出来) | `gce#S-27`（形状与相等）、`#S-28`（铸造、存放与不变） | 断电例外见 §6.12 rev 2 与 `gce#S-36`「已提交事实跨 OS 崩溃」行 |
| [§6.2 只认登录状态](../../design.md#62-中心只认登录状态不认客户端)、[§6.3 只信自己签发的](../../design.md#63-只信自己签发的此刻仍有效的登录状态别人说验过了不算数) | `gce#S-5`（出示物）、`#S-11`（认人只走 `ai#S-44`）、`#S-15`（δ = 0）、`#S-16`（不记住来访）；`ai#S-44`、`#S-45`、`#S-30` 第 10 行 | 登录状态**属于签发它的中心**（PF-016 §4 rev 3 词条注意⑤） |
| [§6.4 无效与答不出](../../design.md#64-无效与答不出是两个不同的答复)、[§6.5 拒绝不多说](../../design.md#65-拒绝的时候什么都不多说)、[§6.16 版本对不上](../../design.md#616-版本对不上就明说) | `gce#S-6`（四种入口答复）、`#S-7`（闭合）、`#S-8`（版本）、`#S-10`（判定次序）、`#S-14`（失败映射） | 四种线上答复：`version-mismatch`、`login-state-rejected`、`unavailable`、`invalid-input` |
| [§6.6 要么整个起来](../../design.md#66-要么整个起来要么不起来)、[§6.7 重启](../../design.md#67-重启不让任何人退出登录)、[§6.8 停机](../../design.md#68-停机已确认的都在没确认的等于没发生) | `gce#S-34`（起来即整体、停机在途）、`#S-32`（进展前提）、`#S-36`「本版运行中不换代存储与时钟」行 | 升级整体性（§6.9）与启动前核对（§6.10 第 1 行）**无契约家**：G-12，本版由 tenancy-host 直接承接 |
| [§6.10 时间不倒退](../../design.md#610-时间不能倒着走) | `gce#S-36` 末行（运行中回拨 ⇒ `unavailable`）、`#S-32` P3 例外 | 窄带读法（INT-017）与前跳校正无出口（INT-018）在 clock 节点 |
| [§6.11 部署密钥](../../design.md#611-部署密钥运维者生成一次自己保管中心永不显示它)、[§6.14](../../design.md#614-产品不把任何秘密的值交给运维者)、[§6.15 部署参数](../../design.md#615-部署参数由运维者给值起动时读缺一不可) | `gce#S-29`（秘密不进任何输出）、`#S-30`（工程记录）；密钥装配在 tenancy-host | PF-003 两项参数无消费者：G-4 |
| [§6.13 运维者没有门](../../design.md#613-运维者没有任何一扇门通向账号能做的事)、[§6.17 体检只说部署](../../design.md#617-体检只说部署不说里面有谁) | `gce#S-18`（公开体检）、`#S-25`（运维面只在本机、无治理路由）、`#S-26`（完整体检，含 `defectCount`） | 「没有门」靠结构检查 SC-2／SC-3，不靠内核 |
| [§5.3、§6.2 身份推导与授权](../../design.md#62-中心只认登录状态不认客户端) | `gce#S-12`（身份推导）、`#S-13`（补授权）、`#S-17`～`#S-24`（封闭路由表 27 条） | 显式租户身份与所选不一致：G-2，归 PF-001 |
| [§8 边界与依赖](../../design.md#八边界与依赖)「不交出能直接用的凭证」 | `ai#S-45`（出示物）、`#S-9`（记录里只有不可逆形式）、`gce#S-9`（列表句柄 = LoginStateId）、`#S-41` | G-1 已闭合 |

## 2. 涉及的领域对象

取自 [`domain_objects/objects.md`](../../../../domain_objects/objects.md)；本版新增或改动的落点。

| 对象 | 领域含义 | 生命周期 | 落点 |
|---|---|---|---|
| [治理中心](../../../../ubiquitous_language/terms/subjects-and-ownership.md) | 承载租户领域能力的那个可部署应用；身份是 `GovernanceCenterId` | 首次启动铸出标识 → 永久；同一份数据换地址仍是它 | `gce#S-27`／`#S-28`；入口层包的 `governance_center` 一行表（占位行 → 已铸） |
| [登录状态](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-login-state--登录状态--login-state) | 一次通过鉴权的登录；**属于签发它的中心** | 无 → 有效 → 已失效（持久）；出示物只在签发那一次交出 | `ai#S-9`（记录）、`#S-15`（签发返回 `{出示物, LoginStateId}`）、`#S-44`（换取身份）；线上只走出示物，列表给 LoginStateId |
| 登录状态出示物（技术名，无词条） | 客户端持有的高熵不透明秘密；`LoginStateId = lowercase-hex(SHA-256(UTF-8(出示物)))` | 签发时生成、永不以可读形式保存 | `ai#S-45`；线上形状归 `gce#S-5` 的 Schema |
| [当前租户身份](../../../../ubiquitous_language/terms/subjects-and-ownership.md#ul-current-tenant-identity--当前租户身份--current-tenant-identity) | 一次登录此刻站在哪个租户身份上 | 随登录状态生灭 | `og#S-36`（读）、`#S-37`（切）；入口层每请求现读，不缓存 |
| 会话据点（对端，PF-016） | 客户端一侧的进程 | 不归本投影 | `apps/cli` 的两条边指向 tenancy-host |

## 3. 不变量与性质

编号沿用 B 领域读数（INV／SAF／LIV）；「检查」指已登记的形式任务或契约规范场景（TLC 正配置无反例、九个否定配置按预期给反例；**规范场景 `gce#S-38`～`#S-46` 全部未开始**）。

### 3.1 不变量

| 编号 | 内容 | 谁维护 | 检查 |
|---|---|---|---|
| INV-1 | 中心标识一生不变；两次从零首启不同（`gce#S-31`） | `gce#S-28` 三态读或铸；入口层节点 R-GC1～R-GC8 | 场景 `gce#S-44`、节点 T-8 |
| INV-2 | 每个请求认人所用的 LoginStateId 都来自 `ai#S-44`／`#S-15`／`#S-37` 的结果或治理契约以它为键的记录，绝不来自线上串（`ai#S-30` 第 10 行） | 入口层节点约束 8（不 import `parseLoginStateId`、不写 `as LoginStateId`）；OG 节点 S-36／S-37 参数收窄为品牌；AI 节点品牌参数 | 类型测试 + 文本规则（未开始） |
| INV-3 | 存储与备份里没有出示物，只有它的不可逆形式（`ai#S-30` 第 12 行） | AI 节点：行类型、事件载荷、SQL 绑定参数都只含 LoginStateId | `ai#S-46`、`gce#S-41` 后半（未开始） |
| INV-4 | 客户端的钟不参与任何判定 | 入口层不读钟（只在启动时等钟就位） | 结构检查（未开始） |
| INV-5 | 路由表封闭：线上只有 27 条路由加公开体检，`operation` 缺席、重复或表外 ⇒ `invalid-input`（`gce#S-4`、`#S-6`、`#S-17`） | 入口层节点 T-1、T-10 | Schema `EnvelopeRouteId` 枚举与路由表键集合相等（未开始） |

### 3.2 安全性质（绝不能发生）

| 编号 | 内容 | 谁维护 | 检查 |
|---|---|---|---|
| SAF-1 | 版本先行：版本对不上只答 `version-mismatch`，不读出示物；公开体检不受版本关挡（`gce#S-8`、`#S-10`） | 入口层判定次序 | TLC `Validity_readPresentationBeforeVersion`、`authBeforeEnvelope`；T-3 |
| SAF-2 | 认人之前不读载荷；载荷不合格 ⇒ `invalid-input` 只在认出人之后（`gce#S-10`） | 同上 | TLC `inputBeforeAuth`；T-3 |
| SAF-3 | 六种不认情形（没带、从没签发、已撤销、别的中心签的、表示层不合格、带了不止一个）线上答复**逐字节相同**（`gce#S-6`、`#S-11`、`#S-39`） | 入口层 T-2 | 字节快照（未开始） |
| SAF-4 | 三个出口不合并：判不了 ⇒ `unavailable`，绝不冒充「无效」或「成功」；缺陷（失败集合之外的东西）⇒ `unavailable` 且 `defectCount` 加一（`gce#S-14`） | 入口层 T-4、T-10 | TLC `unavailableAsRejected`、`defectAsResult`、`gateUnavailableAsDenied`；V-13 |
| SAF-5 | δ = 0：撤销之后**立刻**对下一个请求生效；入口不跨请求缓存认人与授权结果（`gce#S-15`、`#S-33`） | 入口层每请求现读 `ai#S-44`、`og#S-36`、成员资格 | T-7（模型表达不了跨请求缓存，只能靠它） |
| SAF-6 | 秘密不进任何输出：答复、两种体检、工程记录、启动失败说明里搜不到出示物（三种形式）、凭据、密钥、TLS 私钥（`gce#S-29`、`#S-46`） | 入口层 T-11；AI 节点 `no-presentation-in-diagnostics` 规则 | 未开始 |
| SAF-7 | 运维面没有治理路由、不引用任何治理服务名、只 `on`／`once` 本包三个通知名（`gce#S-25`） | SC-2（导入白名单 + 事件订阅白名单）、SC-3 | 静态检查（未开始，L2-7） |
| SAF-8 | 列表不给能直接用的东西：列出的每一项拿去当出示物都 `login-state-rejected`（`gce#S-9`、`#S-20`、`#S-41`） | AI v2 分离 + 入口层 T-5 | 未开始 |
| SAF-9 | 不半开：入口层 inject 八个服务，任一提供者不 `ACTIVE` ⇒ `PENDING` ⇒ tenancy-host 判清单错误 ⇒ 启动失败；两张面同起同停（`gce#S-34`） | inject 语义（basis `inject-has-no-optional-form`）+ 两步开闸 + `listening` 握手 | T-12 |
| SAF-10 | 提交点在各领域操作自己那一次提交；入口层在路由上不提交任何东西、不做补偿（`gce#S-34`） | 入口层设计「提交点」 | 结构检查 |

### 3.3 进展性质（有界，前提写明）

| 编号 | 内容 | 前提 | 检查 |
|---|---|---|---|
| LIV-1 | 每个到达的请求最终得到四种答复之一或成功答复（`gce#S-32`） | P1 参与方每次调用最终返回；P3 时钟不后退（**例外**：跨 OS 崩溃不承诺，D-027）；P6 存储不可用只以返回值到达 | TLC `EventuallyAnswered` |
| LIV-2 | 停机时在途请求在 `drainTimeoutMs` 内答完，超时的连接被销毁而领域写要么完整在、要么完全不在 | 内核不取消在途调用 | T-12 |
| LIV-3 | 首次启动最终铸出标识；确认之后最终开闸并发 `serving`，有界等不到即启动失败 | tenancy-host 两步开闸；等钟上界 ≤ 租约宽度 | T-12、`assembly.*` |

## 4. 业务规则（开发者不该自己决定的，这里都有）

### 4.1 判定次序（`gce#S-10`，每个请求）

1. **公开体检**不看版本、不看出示物，答「在应答、中心标识、协议版本」三样；数据所在够不着时照样答。
2. **① 版本**：信封里的版本对不上 ⇒ 只答 `version-mismatch`，连出示物都不读。
3. **② 信封形状**：`operation` 缺席、重复、表外，或信封有表外成员 ⇒ `invalid-input`（信封层）。
4. **③ 认人**（`ai#S-44`，只有注册、登录、公开体检三条豁免）：没带、从没签发、已撤销、别的中心签的、表示层不合格、带了不止一个 ⇒ `login-state-rejected`，逐字相同；存储此刻判不了 ⇒ 带了出示物的一律 `unavailable`，没带的照样 `login-state-rejected`（不用查）；`ai#S-44` 抛出、返回了却没有值、给出集合外的值 ⇒ `unavailable` 并记缺陷。
5. **④ 载荷**：按该路由的 `Payload_<路由>` Schema 校验，不合格 ⇒ `invalid-input`。注册与登录先过 ① 再校验载荷，带了出示物也不看。
6. **⑤ 身份推导**（`gce#S-12`）：以认人所得 LoginStateId 现读 `og#S-36` 得**当前选中**的租户身份；`loginStateNotValid` ⇒ `login-state-rejected`；`unavailable` ⇒ `unavailable`；`invalidInput` ⇒ 缺陷；载荷里显式带的租户身份与所选不一致 ⇒ 本版按当前选中的办、显式的那一格是 G-2。
7. **⑥ 补授权**（`gce#S-13`）：四条没有授权前置的读路由（`og#S-22`、`#S-26`、`#S-34`、`#S-35`）按「调用方在该组织有效」现读成员资格，不在 ⇒ `notAuthorized`；两个组织的读不短路，任一读不到 ⇒ `unavailable`；读到 `invalidInput` 或集合外 ⇒ 缺陷。合成表全部读完，按行序取第一条成立的。
8. **⑦ 路由**：调该路由对应的领域操作一次；失败按路由表逐格映射（`gce#S-19`～`#S-23`），`interrupted` 原样、`identifier-held-by-expired-record` 不出现（缺陷）。

### 4.2 四种入口答复与成功答复（`gce#S-6`、`#S-7`）

- 答复集合封闭：`version-mismatch`、`login-state-rejected`、`unavailable`、`invalid-input` 四种，加每条路由自己的 `Result_<路由>`。线上成员名与形状以 [Schema](../../../../spec/compositions/governance-center-entry/v1/governance-center-entry.schema.json) 为准，**据点侧代理、客户端与入口层都从它取名，不各写各的**。
- `version-mismatch` 与公开体检的字节形状跨协议版本不变（`gce#S-8`）。
- 答复里没有对端地址、没有 `Date` 头之类会让两次拒绝不同的东西。

### 4.3 登录、撤销与列表（`gce#S-19`、`#S-20`；`ai#S-15`、`#S-16`、`#S-37`）

- 登录答复交出 `{ loginState: 出示物, loginStateHandle: LoginStateId, ... }`；出示物只在这一次出现。
- 列表每一项 `{ loginStateHandle, issuedAt }`，句柄就是 LoginStateId，不含出示物。
- 撤销：目标句柄从载荷来（`ai#S-16` 的目标可以来自线上），发起方是认人所得 LoginStateId；只有一次领域调用（不先读列表）；已撤销再撤 ⇒ `ok`；别的账号的句柄或从没签发过的 ⇒ `login-state-not-found`，逐字相同；不合 IV S-31 的句柄在载荷那一步 `invalid-input`，合 S-31 但不是 64 个十六进制字符的**不**被入口层拒绝、原样交给 `revoke`。
- 撤自己之后再来 ⇒ `login-state-rejected`。

### 4.4 中心标识（`gce#S-27`、`#S-28`）

- 128 位随机的规范表示；相等按字节。
- **三态读或铸**（每次启动，首次启动的提交点）：那一格读到「未铸」⇒ 铸造并写入；读到已铸且合形 ⇒ 用；**那一格不存在、值不合形 ⇒ 启动失败**；「读不到」「写不进」⇒ 启动失败——**读不到与不存在都绝不当作未铸**。
- 那一格与存储结构同时立起（入口层包的迁移片段建表并插占位行，`center_id` 为 NULL 表示未铸；`ON CONFLICT DO NOTHING`）；`UPDATE ... WHERE center_id IS NULL`，写事务里 `lockRow` 那一行。
- 前提（装配给）：**存储里已有别的治理事实、却没有那一格所在的表 ⇒ 启动前的只读核对拒起、不重建、不铸造**——机制是 storage-sql 的迁移前只读核对，判据是入口层包导出的 `governanceCenterPreflight`（「除迁移登记外还有别的表却没有 `governance_center`」），tenancy-host 把它放进 `upgrade.checks`。只剩迁移登记的存储按「读不到 ⇒ 启动失败」收场。
- 公开体检与完整体检都读它；运维面从 `serving` 通知取，不自己读表。

### 4.5 运维面与两种体检（`gce#S-18`、`#S-25`、`#S-26`）

- 公开体检：在应答、中心标识、协议版本，恰三样。
- 完整体检只在中心所在机器的本机通道上可读；对任意请求都答完整体检（把信封发到运维面得到的仍是完整体检）；字段过 `FullHealthReply` Schema，含 `startedAt`、`defectCount`、`storageReachable`（每次体检现探一次）等十项；**没有治理事实**。
- `defectCount` 是本次运行的计数，随进程消失；来源是入口层 `emit` 的 `defect` 通知。

### 4.6 起来、停机、升级（`gce#S-34`；tenancy-host）

- **要么整个起来**：装载清单里任一 fiber 不 `ACTIVE` ⇒ 启动失败、已装的逆序撤除；入口层与运维面装在最后。
- **两步开闸**：全部 fiber `ACTIVE` → `guard.confirm()` 断言 `snapshotTaken ⇒ snapshotRemoved` → 兑现 `openSignal` → 入口层开闸并 `emit serving` → tenancy-host 有界等到 `serving` 才 `boot()` 成功；等不到 ⇒ 启动失败，快照已确认、不恢复（U-4，说明写「钟读不到或回拨：重启前先核钟」）。
- **升级整体性**（§6.9，无契约家 G-12）：storage-sql 的守卫 `upgrade: { checks, guard }`（有 `migrations` 就必须显式给，或 `false`；缺席即配置错误）：属主排他 → 遗留快照恢复 → 只读核对（数据格式版本前缀、`clockPreflight`、`governanceCenterPreflight`）→ sqlite 建快照 → 迁移 → 确认后删快照；确认之前任何启动失败都恢复快照。**pg 无快照**（U-3）：`migrated ∧ ¬snapshotTaken` 不拒起，启动日志具名「本次升级不可撤回」。
- **停机**：先停止接受新请求，`drainTimeoutMs` 内等在途答完；在途领域操作按它自己那一次提交收场；入口层撤完之后运维面才撤。
- **运行中不换代存储与时钟的提供者**（`gce#S-36` 前提，装配保证）；换代只指参与方能力的提供者。
- **断电与 OS 崩溃**（D-027，PF-017 rev 2）：最后一段已提交事务可能丢失——已撤销的又能用、刚铸的标识消失而下次首启另铸、刚答复的登录状态不在、空闲时约一小时的续约记录；装配给的边界，本版不承诺，不预埋补偿。

### 4.7 时间（§6.10；clock 节点）

- `now()` 每次现读墙钟并与本实例用过的最晚时刻比对，落后 ⇒ `'unavailable'`；租约「写在前」，续约每 L/3。
- 启动：墙钟早于租约表记的最晚时刻 ⇒ 拒起、告诉运维者「钟比中心用过的最晚时刻早」；落在 [记的最晚时刻, 租约到期) 的窄带里 ⇒ **等到追上再起来、不报原因**（INT-017），等待上界 ≤ 租约宽度，启动记录可见。
- 墙钟先跳快、后被校正回来 ⇒ 停摆与跳幅等长，重启绕不过，**本版无运维出口**（INT-018）。
- 迁移前 `clockPreflight` 用同一判定，回拨 ⇒ 拒起、数据原样。

### 4.8 输出与观测（`gce#S-29`、`#S-30`）

- 工程记录不出现对端地址、`AccountId`、`TenantId`、载荷值、任何秘密；拒绝的记录分得出 `absent`／`multiple`／`malformed`／`judged`；`unavailable` 与缺陷的记录只写入口层自己观察到的失败值（哪一次调用、参与方给出的值名或异常类型），不出现「存储」「钟」这类推断出的分类。
- 关联号在入口层生成、随请求进日志，不进答复。

## 5. Cordis 建模

来源：[入口层节点](../../../../realization/packages/tenancy/governance-center-entry/design.md)、[tenancy-host](../../../../realization/apps/tenancy-host/design.md)、[account-identity 节点](../../../../realization/packages/tenancy/account-identity/design.md)、[storage-sql](../../../../realization/packages/infra/storage-sql/design.md)、[clock](../../../../realization/packages/infra/clock/design.md)。服务名、方法名、事件名**一律候选**。Cordis 4.0.4（D-025）。

### 5.1 插件与服务面

| 插件（节点） | provide | inject | 独立成插件的理由 |
|---|---|---|---|
| `governance-center-entry`（入口层 fiber） | **无** | `logins`、`registration`、`organizations`、`memberships`、`offers`、`storage`（只为 `governance_center` 一张表）、`credentials`（只用 `parse`）、`clock`（只在启动时等钟就位） | 生命周期独立（进程里唯一面向网络的单元）、失败要隔离、有独立资源（监听器）；不 provide 所以没有消费者会因它换代重跑 |
| `governance-center-ops`（运维面 fiber，同包） | 无 | `storage`（体检现探）、`clock` | 通道分离（本机通道）；不引用任何治理服务名——「没有门」靠 SC-2／SC-3 |
| `account-identity`（v2） | `accounts`、`logins`（八个操作 + `logins.exchange`） | `storage`、`clock`；`credentials` 调用时解析 | 同 PF-001 投影；v2 增 `issue → { presentation, loginStateId }`、`exchange(presentation: unknown)`、`revoke(target: unknown, initiator: LoginStateId)` |
| `storage-sql` | `storage` | — | 升级守卫是插件体内的一段直线：排他 → 恢复遗留 → 只读核对 → 快照 → 迁移 → 附着守卫 |
| `clock` | `clock` | `storage` | 现读墙钟 + 写在前的租约；导出 `clockPreflight` |

### 5.2 依赖与重载

- 入口层 inject 八个服务：任一提供者换代（被换掉或离开 `ACTIVE`）⇒ 入口层卸载重跑，门关上再开；服务只是返回「不可用」⇒ 不卸载，门开着答 `unavailable`（basis `plugin-body-reruns-on-provider-change`）。**本版装配不换代**。
- 运维面与入口层之间没有 inject 关系；重跑次序由内核定，靠 `listening` 握手恢复：运维面每次装载挂好三条监听后 `emit('governance-center-ops/listening')`，入口层若已 `serving` 则重发 `serving`。
- `openSignal`（config 里的 Promise）与 `upgrade.guard`（config 里的守卫对象）都依赖「内核原样传递 config 对象、重跑时是同一个对象」——**假设，须按 source-check 取证**；不成立时失败是响的（`UpgradeGuardNotAttached`／闸永不开 ⇒ 有界等超时）。

### 5.3 effect 装卸配对

| 装载 | 撤除 |
|---|---|
| 入口层：绑端口（不开闸）、挂 `listening` 监听、开门续延（等 `openSignal`、每 tick 核 `fiberIsActive` 与闸仍 `closed`、等钟就位、读或铸标识、开闸、`emit serving`） | 停止接受新请求、在途请求跑完或超时销毁、释放监听器、`emit stopped`；兑现之前撤除 ⇒ 端口立即释放、不发 `stopped`、其后再兑现也不开闸 |
| 运维面：开本机通道、挂三条监听、`emit listening` | 关本机通道；计数随进程消失 |
| storage-sql 守卫路径：排他锁 → … → `guard.attach` | 守卫置为已撤 → 等在途事务与在途确认 → 未确认则恢复快照 → 放锁 |
| clock：读租约表、启动判定（拒起／等窄带／立即服务）、续约定时器 | 写 `max(hw, w)`、停定时器 |

### 5.4 事件（都是通知，`emit`）

| 事件 | 发出者 | 载荷 | 监听者 |
|---|---|---|---|
| `governance-center-entry/serving` | 入口层开闸时（及收到 `listening` 时重发） | `{ centerId, protocolVersion, startedAt }` | 运维面、tenancy-host（有界等） |
| `governance-center-entry/stopped` | 入口层撤除 | — | 运维面（其后不答） |
| `governance-center-entry/defect` | 入口层每次记缺陷 | 失败值名或异常类型 | 运维面计数 |
| `governance-center-ops/listening` | 运维面每次装载 | — | 入口层 |

事件名只许用本包导出的常量，运维面不许字面或计算名（SC-2）。

### 5.5 装配草图（tenancy-host）

```text
boot()
├─ 读部署参数与密钥（_FILE 惯例；缺一不可；配对自检）
├─ guard = createUpgradeGuard()
├─ plugin storage-sql   config { migrations: [AI 片段, OG 工厂, clockLeaseMigration, governanceCenterMigration],
│                                upgrade: { checks: [dataFormatPrefix, clockPreflight, governanceCenterPreflight], guard } }
├─ plugin clock                                  inject storage
├─ plugin credential-verification                provide credentials
├─ plugin account-identity（v2）                 inject storage, clock；config 两把公钥、政策
├─ plugin organization-governance                inject accounts, logins, storage, clock
├─ plugin account-registration                   inject accounts, organizations, organization-purge
├─ plugin governance-center-ops                  inject storage, clock
├─ plugin governance-center-entry                inject 八个；config { openSignal, listen, drainTimeoutMs, ... }
├─ 等全部 ACTIVE（任一 PENDING ⇒ 清单错误 ⇒ 启动失败、逆序撤除、恢复快照）
├─ r = guard.confirm()；断言 snapshotTaken ⇒ snapshotRemoved；migrated ∧ ¬snapshotTaken ⇒ 日志「本次升级不可撤回（U-3）」
├─ resolve openSignal → 有界等 serving（≤ 租约宽度）→ boot() 成功
└─ 等不到 ⇒ 启动失败（U-4），逆序撤除，不恢复快照；撤完 guard.pending() 只在 pending{location} 时点出位置
dispose()：逆序撤除（总超时常量），入口层先于运维面
运维约定（owner 本节点）：生产库不得被非守卫实例打开；租约表不得手动删
```

## 6. 绑定与证据

| 契约条款 | 证据 | 前提 | 状态 |
|---|---|---|---|
| `gce#S-10`、`#S-11`、`#S-13`、`#S-14`、`#S-32`、`#S-33` | `formal:governance-center-entry-v1-decision`（TLC 正配置）+ 八个否定配置 | 参与方动作抽象为原子、判定为布尔；模型证「同一个答复值」，不证逐字节相同、不证跨请求缓存 | 已跑无反例（契约稿定后重跑）；原始输出**尚未登进 `record/evidence/`** |
| 入口层节点 bindings 六条 | 绑到上述模型的具名不变式与变异配置 | 同上 | 已登记；节点无任何运行 |
| `gce#S-38`～`#S-46` 规范场景、SC-1～SC-3、节点 T-1～T-18、tenancy-host `assembly.*`、storage-sql `upgrade.*`／`lifecycle.upgrade-config-policy`、clock `clock.*`、AI R-8 检查与 `no-presentation-in-diagnostics` | 各节点 verification.md | — | **全部未开始**；bindings 只绑已存在的证据 |

## 7. 未决项

| 编号 | 什么没定 | 谁能定 | 在裁决前实施者该怎么办 |
|---|---|---|---|
| G-2 | 请求显式携带的租户身份与所选不一致时怎么答 | PF-001 owner | 按当前选中的办；显式那一格不作为行事依据 |
| G-3 | 按登录标识指认被邀请者（线上没有解析面） | AI spec owner；未激活记录的呈现归 PF-001／PF-016 | 邀请路由只接受 AccountId，不加解析 |
| G-4 | PF-003 两项部署参数无消费者 | 复制通知与分享邀请的契约（未立） | 装配校验并保存，不读 |
| G-7 | 「登录状态效力不变」以不经备份恢复为前提 | PF-001 owner | 不为备份恢复预埋失效传播 |
| G-8 | 多进程后的新鲜度界 | 架构设计 | 单机；不引入分布式假设 |
| **G-10** | 传输绑定（路径、状态码、帧）未冻结的版本化工件；传输分歧（cli 提案 D11 bearer 头 vs 信封在体）在此裁 | 入口层节点 | **建包前闭合**；T-2 的字节快照就是它的可执行形式 |
| **G-11** | 防冒充的具体手段（客户端确认连上的真是那个中心）；材料是部署配置输入、不是部署密钥 | 入口层节点 | **建包前闭合**；确认失败时客户端怎么呈现归 PF-016 |
| G-12 | 升级整体性与启动前只读核对无契约家 | 架构主线 | 按 tenancy-host 承接；pg 上 §6.9 不成立（U-3）如实带着 |
| U-3／U-4／U-5 | pg 无快照；确认之后到开闸之间的失败支；确认删除后落盘失败 | 接受的遗留（tenancy-host + storage-sql） | 按节点写的收场，不预埋补偿 |
| A-1 | 内核原样传递 config 对象（`openSignal`、`guard`） | source-check | 实施前取证；不成立时改为显式握手服务 |
| A-2 | `node:sqlite` 在线备份接口、同进程两句柄互斥、`Migrator` 登记表名与锁表、pgbouncer 事务模式下会话锁 | source-check（storage-sql 待核清单） | 取证后记 verification |

## 8. 实施顺序（接 PF-001 投影 v2 第 8 节第 3 步之后；四个领域插件 L2-1～L2-4 见那边）

| 步骤 | 做什么 | 依赖 | 完成判据 |
|---|---|---|---|
| E-0 | 闭合 G-10、G-11：冻结传输绑定工件（含 cli 分歧裁决）、定防冒充手段与材料形状，写进入口层节点并升 verification | — | 两个缺口在节点里标已闭合；T-2 字节快照可写 |
| E-1 | storage-sql 升级守卫：`createUpgradeGuard`、`upgrade` 显式政策、排他、遗留恢复、只读核对钩子、快照与恢复次序、半成品清理 | A-2 取证 | `upgrade.*` 十二条与 `lifecycle.upgrade-config-policy` 全过；一致性夹具改 `upgrade: false` 后重跑全绿 |
| E-2 | clock 现读墙钟、`clockPreflight`、启动窄带、代价表所列演练 | E-1 | `clock.*` 八条加前跳校正一支全过 |
| E-3 | account-identity v2：出示物生成与派生、`exchange`、凭据计算移出写事务（R-8）、品牌参数、`no-presentation-in-diagnostics` | L2-2 | `ai#S-31`～`#S-34`、`#S-40`～`#S-43`、`#S-46` 全过；R-8 文本规则与运行期检查过 |
| E-4 | organization-governance S-36／S-37 参数收窄为品牌 | L2-3 | 类型测试（`unknown`／`string` 传入编译失败）过 |
| E-5 | 入口层包：路由表、判定次序、Schema 取名、`governance_center` 片段与三态读或铸、`governanceCenterPreflight`、四个通知、两张面 | E-0～E-4 | T-1～T-13 全过（pg 支除外）；SC-1～SC-3 有「故意违反就失败」自测 |
| E-6 | tenancy-host：迁移合成加入口层片段、`upgrade.checks` 三项、两步开闸、有界等 `serving`、运维约定、启动失败具名阶段 | E-5 | `assembly.*` 全部义务过（含 U-3 反向支、交错 guard 支、显式 upgrade 支） |
| E-7 | 结构检查器补齐：SC-2 事件订阅、只碰一张表、入口层不 import `parseLoginStateId`、AI R-8、`no-presentation-in-diagnostics` | 与 L2-7 同批 | 每条规则自测 |
| E-8 | 把 TLC 原始输出与 E-1～E-6 的运行登进 `record/evidence/`，回填各节点 bindings（`test:`） | E-1～E-7 | bindings 不再只有 formal；README「实际验证」不再是「尚无」 |

CLI 据点侧代理（PF-016 实施）不在本版顺序内；它从入口契约的 Schema 取名，等 E-0 的传输绑定冻结。
