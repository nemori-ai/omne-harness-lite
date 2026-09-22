# identity-values 实现设计

## 实现路径与来源

**自建一个薄的 TypeScript 模块，不依赖任何上游包。**理由：契约拥有的是**值的含义、相等规则与形状**，
没有任何成熟库表达「TenantId 是 (OrganizationId, AccountId) 的结构相等、无角色分量、规范序列化形式唯一」这类领域约束；
能复用的只有两处：JSON Schema Draft 2020-12 校验器（`ajv` 8.20.0，Draft 2020-12 入口）与签名原语
（Node 内置 `crypto`，不引第三方）。

**不是 Cordis 插件。**契约明写它[没有操作、没有状态转移、没有提交点，因此不需要插件](../../../../spec/data/identity-values/v1/contract.md#这份契约拥有什么)；
租户身份值是**值类型、显式参数，不进 ctx**：契约的隔离义务要求身份值逐层显式携带（[S-16](../../../../spec/data/identity-values/v1/contract.md#s-16-按归属层显式携带身份值)），从 ctx 解析一个「当前租户」正是它要禁止的隐式来路。
它由消费者包**直接 import**，不注册服务、不持有 fiber、不 inject 任何东西。
把它做成插件只会造出一个「值的提供者」，而值没有提供者换代这回事。

**Cordis 版本**：手册基线 `@deepseek-ai/cordis` 4.0.2，采用版本尚无决定；本模块不依赖 Cordis，此项只为与同批节点对齐。

## 能力到 Cordis 的投影

本节点不投影到 Cordis 原语（无插件、无服务、无 effect、无事件）。下表的第二列因此写的是**模块公开入口**（一律候选）。

| 契约责任 | 模块公开入口（候选） | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/identity-values/v1/contract.md#s-1-accountid)／[S-3](../../../../spec/data/identity-values/v1/contract.md#s-3-organizationid)／[S-9](../../../../spec/data/identity-values/v1/contract.md#s-9-loginstateid)／[S-31](../../../../spec/data/identity-values/v1/contract.md#s-31-不透明标识的交换表示) 不透明标识 | 品牌类型 `AccountId`、`OrganizationId`、`LoginStateId`；解析入口 `parseAccountId(text)` 等——只做 S-31 的词法校验（非空、首尾无 S-31 列出的空白码点、逐码点比较），**不解析内容**。`InvitationId`／`AffiliationRequestId` 同形，由治理节点用同一基类型 `OpaqueIdentifier` 派生 | 尚未实现 | **「部署内唯一」「不来自运行时」不在本模块**：唯一性归各持有节点的存储约束（[第六节](../../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)第 1 行），生成方式归 [G-04](../../../../spec/data/identity-values/v1/contract.md#十已知缺口)——本节点给一个候选：**128 位 CSPRNG、小写 base32 无填充**，在各持有节点的提交内生成；不可枚举、不可猜测，[`capability.account-identity/v1#G-2`](../../../../spec/capabilities/account-identity/v1/contract.md#九已知缺口) 的论证据此成立。**这是候选，须由 G-04 裁定后另立数据契约或出 v2** |
| [S-2](../../../../spec/data/identity-values/v1/contract.md#s-2-登录标识不是-accountid) 登录标识 | `LoginIdentifier` 品牌类型，与 `AccountId` **类型不相容**（品牌不同，赋值不通过编译） | 尚未实现 | 「不作引用键、不进 TenantId」由类型不相容兑现一半（SC-3 一类的静态检查兑现另一半，见下节） |
| [S-4](../../../../spec/data/identity-values/v1/contract.md#s-4-organizationkind)／[S-8](../../../../spec/data/identity-values/v1/contract.md#s-8-tenantrole)／[S-32](../../../../spec/data/identity-values/v1/contract.md#s-32-判别式集合闭合) 封闭枚举 | `OrganizationKind = 'personal' \| 'team'`、`TenantRole = 'superAdministrator' \| 'member'`（英文取值以词条正式名为准，落包时核对）；解析入口收到集合外取值 ⇒ 返回 `invalidInput`，**不映射默认值** | 尚未实现 | 「personal ⇒ 四条禁止」**不在本模块**，权威在 [`capability.organization-governance/v1#S-6`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-6-两个变体与四条结构性禁止) |
| [S-5](../../../../spec/data/identity-values/v1/contract.md#s-5-tenantid-的构成与相等)／[S-6](../../../../spec/data/identity-values/v1/contract.md#s-6-tenantid-无生灭路径)／[S-7](../../../../spec/data/identity-values/v1/contract.md#s-7-tenantid-的规范序列化形式) TenantId | 值对象 `TenantId { organization, account }`：`tenantIdEquals(a, b)` 结构相等；`toCanonicalJson(t)` 给 S-7 的**唯一**规范 JSON 形式（键序固定、无多余成员）；**不提供** `fromString`／标量键——[G-05](../../../../spec/data/identity-values/v1/contract.md#十已知缺口) 本版不给 | 尚未实现 | 需要索引键或缓存键的消费者**被阻断**在 G-05 上；本节点不偷偷给一个 `${org}:${account}` 拼接——那正是「一个部署两条规则」的来路 |
| [S-10](../../../../spec/data/identity-values/v1/contract.md#s-10-membershipstanding) MembershipStanding / MembershipStandingResult | 判别联合类型：`MembershipStanding = { standing: 'effective', role } \| { standing: 'ineffective' }`；`MembershipStandingResult = MembershipStanding \| { failure: 'unavailable' }`。**没有第三支**：`invalidInput` 由调用操作自己的失败集合承载（[`capability.organization-governance/v1#S-26`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-26-成员资格判定)） | 尚未实现 | 效力怎么算归治理节点；本模块只给形状 |
| [S-11](../../../../spec/data/identity-values/v1/contract.md#s-11-scopelayeridentity) ScopeLayerIdentity | 判别联合 `{ layer: 'organization', organization } \| { layer: 'tenant', tenant }`，**恰两变体**；`session`／`workspace`／`account`／`factoryDefault` 在类型层面**不存在**，收到即 `invalidInput` | 尚未实现 | 会话级变体是 [G-01](../../../../spec/data/identity-values/v1/contract.md#十已知缺口)，**本模块不预留字段**——预留等于替 PF-015 答题 |
| [S-12](../../../../spec/data/identity-values/v1/contract.md#s-12-缺席与空值都不是身份值)／[S-33](../../../../spec/data/identity-values/v1/contract.md#s-33-表示层校验与判定分开) 表示层校验 | 每个解析入口的返回是 `Parsed<T> = { ok: T } \| { invalidInput: reason }`；**不抛异常**——抛出的异常是一条调用方可以不接的带外通道 | 尚未实现 | 「`invalidInput` 不得被记成判定结果」由**类型分层**兑现：解析在判定之前、返回类型不同；消费者节点的求值次序表（如 [`capability.account-identity/v1#S-13`](../../../../spec/capabilities/account-identity/v1/contract.md#s-13-产生账号未激活) 的三层）以它为第一层 |
| [S-13](../../../../spec/data/identity-values/v1/contract.md#s-13-sameaccountdistincttenants)／[S-14](../../../../spec/data/identity-values/v1/contract.md#s-14-上级组织与上级链)／[S-15](../../../../spec/data/identity-values/v1/contract.md#s-15-shareancestor) 派生谓词 | `sameAccountDistinctTenants(a, b)` 纯函数；`ancestorChain` 与 `shareAncestor` **只给定义式的纯函数形式**（输入一张 `parentOf: OrganizationId → OrganizationId \| null` 的快照），**不读存储**——读面归治理节点 [S-34](../../../../spec/capabilities/organization-governance/v1/contract.md#s-34-上级链与有共同上级) | 尚未实现 | 治理节点必须把「快照与写入同提交」这一半自己兑现（[S-32 ④](../../../../spec/capabilities/organization-governance/v1/contract.md#s-32-接受隶属请求)）；本模块的纯函数保证的是**定义式与契约逐字一致**（`shareAncestor` 把各自算进链，`ancestorChain` 不含自己） |
| [S-34](../../../../spec/data/identity-values/v1/contract.md#s-34-语义身份与实现地址分开) 身份与地址分开 | 本模块**不导出**任何从路径、URL、行号构造身份值的入口 | 尚未实现 | 反向（把身份回读成地址）由 SC-1 静态检查守 |
| [S-35](../../../../spec/data/identity-values/v1/contract.md#s-35-交接凭证-handoff-warrant) 交接凭证 | 子模块 `handoffWarrant`：`issue(signingKey, purpose, boundAccountId) → HandoffWarrant`、`verify(verificationKey, purpose, expectedAccountId, warrant) → 'ok' \| 'invalid'`。形状：非空字符串（与 S-31 同形），内容是 `purpose · AccountId · 随机数 · 签名` 的编码，**核实方不解析领域事实，只核三件**（存在、绑定该标识、由产出方签发） | 已实现（`src/handoff-warrant.ts`）：Node `crypto` Ed25519 直签，交换表示 `base64url(JSON{v,purpose,account,nonce}).base64url(sig)`，核实时按规范重编码比对；密钥 PEM（PKCS8／SPKI）由装配下发。不用 `jose`／`paseto`：研究第二部分查到 jose 的默认核验不检查绑定声明、paseto 默认强制 `exp`，两者都要关掉默认才对得上 S-35（[研究「三条签名路线」](../../../../../research/agent-harness-persistence-and-identity-infra/research.md)） | **这是本节点最要紧的一处选择**，理由与落选方在[下节](#交接凭证走签名不走进程内登记)。契约把机制归 realization（[「它是一条契约承诺，不是一层安全机制」](../../../../spec/data/identity-values/v1/contract.md#它是一条契约承诺不是一层安全机制)） |
| [`identity-values.schema.json`](../../../../spec/data/identity-values/v1/identity-values.schema.json) 规范表示 | `validate(defName, value)`：按 `$defs` 名校验交换表示；Schema 文件**从 spec 目录原样复制进包**并在 CI 里核对逐字节相同（规范工件在 spec，包里是副本，副本漂移即失败） | 尚未实现 | V-1 形状自检的登记形式见 [verification.md](verification.md) |

### 交接凭证走签名，不走进程内登记

契约给了两条已知可行的路（[S-35 那张表](../../../../spec/data/identity-values/v1/contract.md#它是一条契约承诺不是一层安全机制)）。本节点选**签名**：

| | 同进程 nonce 登记 | **签名（本节点选）** |
|---|---|---|
| 核实方怎么核 | 向**产出方**查登记 | 用**验证密钥**核签名，不与产出方通话 |
| 依赖方向 | **违反**：两个实例的核实方都是 `capability.account-identity`，产出方分别是组合与治理契约；核实方向产出方查，等于账号能力 inject 治理或组合——[契约 S-2 明写「本契约不消费治理契约的任何读面，一条也没有」](../../../../spec/capabilities/account-identity/v1/contract.md#s-2-消费者与依赖方向)。绕开它要另立一个「登记表服务」，那是一个没有契约的新服务面 | **不引入任何服务边**：产出方与核实方各拿一把密钥，密钥由装配下发 |
| 重启 | 登记只活在内存，重启即失效——契约说这是安全方向，**但重试要重新产出**，两步之间重启的清除链会以 `purge-warrant-invalid` 停住（缺陷型，被记成缺陷） | 重启后仍可核实——**前提是密钥跨重启不变**（密钥是部署配置输入，见[依赖](#依赖作用域与绑定)；若每次启动重新生成，这一格就与登记方案等价）。**重放安全不靠作废**，靠核实方在自己提交里的前置现读（[性质 4](../../../../spec/data/identity-values/v1/contract.md#性质-4-在两个实例上为什么站得住)），所以「重启后旧凭证仍有效」不制造任何错误效果 |
| 跨进程 | 失效，须换机制 | **同一机制可用**：协议给的部分只剩密钥分发与重放边界（[第六节末行](../../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)） |
| 代价 | 无密钥管理 | **要管密钥**：谁生成、放哪、轮换——本版单机把密钥当作部署配置输入，由装配只交给对应插件（见[依赖、作用域与绑定](#依赖作用域与绑定)）；轮换本版不做（无需求）。**不可伪造的前提从「同进程」变成「私钥不外泄且公私钥配对」**，这两条写在 [account-identity 的 S-14／S-38 绑定](../../tenancy/account-identity/bindings.yaml)的 assumptions 里（本模块自己没有绑定可挂） |

**落选方（登记）的最强论证**：它不需要密钥，也不需要任何加密依赖，「产出方登记、核实方查」在单进程里是几行代码。
**它输给方向**：那几行代码要么让账号能力 inject 治理（契约禁止），要么造一个第三方登记服务——而后者一旦存在，
就成了一条「任何能写登记表的人都能签发凭证」的路径，不可伪造退化成登记表的访问控制。
**本方弱点**：密钥若被同进程内别的插件读到，不可伪造即失守；单进程内没有硬隔离，只能靠装配把密钥作为插件私有 config 下发、不放进任何共享服务。置信度：**高**——两个实例的核实方都不能依赖产出方，这一条把登记路径排掉了，不是口味。

**密钥与用途**：两个实例各一对（`activation`、`purge`），产出方持私钥、核实方持公钥；`purpose` 进签名载荷，
一份清除依据拿去激活必然核不过（不同用途、不同密钥，两道都挡）。**凭证不作废、不带尝试号、不带有效期**——
[性质 4](../../../../spec/data/identity-values/v1/contract.md#六条性质) 明写本版不作废；有效期是跨进程后协议给的事。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 无契约依赖。本模块是被消费方 | — | 作为普通包依赖被 import；版本随包版本 | 消费者按 semver 锁定；契约出 v2 时另建 `v2` 子路径而不改 v1 导出——[已发布规格不可原地覆盖](../../../../README.md) 在包上的投影 |
| 交接凭证的密钥 | **由装配提供，是部署配置输入**：两对 Ed25519 密钥由部署一次生成并持久保存（怎么生成、放哪归 `apps/` 节点），启动时私钥作为**插件私有 config** 交给产出方（`account-registration` 持 `activation` 私钥，`organization-governance` 持 `purge` 私钥），公钥交给 `account-identity`。**不在启动时生成**——否则重启后旧凭证一律核不过，「重启后仍可核实」那一格不成立 | 密钥跨重启不变；本版不轮换 | 任一节点缺它那把密钥或形状不对 ⇒ **该节点启动失败**（三个持钥节点同一政策：配置错误不作运行期拒绝）；运行期用错密钥签的凭证在核实方一律 `warrant-invalid`／`purge-warrant-invalid`，fail-closed |

## 状态、并发与失败映射

本模块**无状态、无提交点、无并发**。全部入口是纯函数；唯一带随机性的是 `handoffWarrant.issue` 的随机数（CSPRNG），它不构成状态。

失败映射只有一种：**表示层拒绝 ⇒ `{ invalidInput }`**，以返回值到达调用方，不抛异常、不写日志代替返回。

## 静态检查义务怎么承载

[契约的静态检查义务 SC-1～SC-n](../../../../spec/data/identity-values/verification.md#静态检查义务) 逐条对到形式：

| 检查 | 形式 | 谁跑 |
|---|---|---|
| SC-1 判定函数入参不含路径／目录／OS 用户／主机名／环境变量／运行实例身份类型 | **lint 规则（候选）**：对标注为「判定函数」的导出，扫描参数类型的字面类型名与品牌；本模块提供品牌类型清单供规则引用 | 各消费者包的 CI；本模块只提供规则实现的输入（哪些类型是身份值） |
| SC-2 账号记录字段不含指向另一个 AccountId 的引用 | 类型层：`account-identity` 节点的记录类型由本模块的品牌类型组成，lint 规则查「同一记录类型里出现两个 `AccountId` 字段」 | `account-identity` 包 CI |
| SC-3 一类：登录标识不作引用键、不进 TenantId | **类型不相容**（品牌）——赋值不通过编译 | 编译期，零成本 |
| SC-9 归属身份的持久形状是带判别式的 `ScopeLayerIdentity`，不是两个可空列 | Schema 校验（`ScopeLayerIdentity` 的 `oneOf` 判别式与载荷对得上才通过）＋ lint 查记录类型里成对出现的 `organization?`／`tenant?` 可空字段 | 各持有范围化对象的包 |
| 其余 SC 项 | 逐条落在各消费者节点的 verification（它们约束的是那些节点的路径） | 各节点 |

**类型系统能挡的挡在编译期，挡不了的做 lint，两者都做不了的（六路径同判 V-3、冒充隔离 V-4）是评审与演练，不是本模块的活。**
本版**没有任何一条已实现**，全部「未开始」（[verification.md](verification.md)）。

## 实施缺口与消费者影响

- **G-04／G-05**（标识词法、TenantId 标量键）：本节点给了词法候选，**没给标量键**。需要索引键的消费者（治理节点的成员关系记录以 `TenantId` 为键、将来的计量）在落包前要先把 G-04 裁掉；治理节点本版可用**两列复合键**（organization, account）绕开标量键——那不是 S-7 的规范序列化，只是存储布局，见[该节点](../../tenancy/organization-governance/design.md)。
- **Schema 副本漂移**：包内 Schema 是 spec 的副本，须有一条 CI 检查逐字节相同；没有这条检查，V-1 的结论就不对着规范工件。
- **密钥的生成、保管与分发是装配的责任**：本节点只定义「持哪把钥匙能签／能核」与「密钥跨重启不变」这一前提；怎么生成、放哪归 `apps/` 节点，那个节点尚未为本批契约建立。「私钥不外泄」在单进程内没有可机检的证据形式（[verification](verification.md#覆盖缺口)）。
- **上游语义**：本模块不依赖任何 Cordis 行为，无 basis 引用。
