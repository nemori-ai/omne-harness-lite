# tenancy-host 实现设计

本页回答**这个装配选了哪些提供者、按什么顺序装、config 从哪来、迁移怎么合成、密钥怎么只到持钥插件且公私钥确实配对、
启动失败与撤除怎么收口，以及契约里每一条「装配给」在本节点的哪一行承接或转交**。
它是 [assembly 节点](../../README.md#bindingsyaml)，**不持有任何能力语义**：每条保证指向一份契约坐标或某个 provider 节点，
本页里出现第二份定义就是错。应用的形状在 [architecture.md](architecture.md)，本页不重复。

**贯穿全页的事实：本节点的源码不存在。**`apps/tenancy-host` 尚未建包；下面每一处「函数」「列名」「环境变量名」都是**候选**。
承载仓库里已有的：`core/*` 四个包（`kernel-basis` 含 `./testing`、`offer-expiry` 含 `./testing` 的 `testClock`）、
`infra/storage-sql` 与 `infra/clock`（各自包内测试通过，见其节点 README「实际验证」）、四个 tenancy 包的服务面类型骨架、
`tools/ts-checks` 三条规则——本页引用它们的名字时以「源码已有」标出，其余一律候选。

## 实现路径与来源

**采用型装配：不自建任何能力，只做把它们接起来所需的最小四件事。**

| 事 | 采用什么 | 依据 |
| --- | --- | --- |
| 内核与插件形态 | `@deepseek-ai/cordis` 4.0.4 官方包；六个插件都经 [`core/kernel-basis` 的 `definePlugin`](../../packages/core/kernel-basis/design.md#能力到-cordis-的投影)（源码已有）定义——它是「配置错误 ⇒ 启动失败」的**唯一实现点** | [D-025](../../../record/decisions/cordis-adoption-version/decision.md)；basis 四条条目与四条共用主张的 probe 已在 4.0.4 上通过（[basis 当前状态](../../../basis/README.md#当前状态)） |
| 存储提供者 | [`infra/storage-sql`](../../packages/infra/storage-sql/design.md)：Kysely 0.29.6 + `node:sqlite` 自写 Driver，方言由 config 切，config 含 `migrations?: MigrationProvider`（源码已有 `StorageSqlConfig`、`storageSqlPlugin`）；协议与一致性套件归 [`core/storage`](../../packages/core/storage/design.md) | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md#选择与范围)；四个基础设施节点的设计**尚未被接受** |
| 时间源提供者 | [`infra/clock`](../../packages/infra/clock/design.md)：单调钟锚定 + 存储里写在前的租约；源码已有 `clockPlugin`（`inject: ['storage']`，config 为空对象）、`clockLeaseMigration`、`ClockRollbackDetected` | D-026 把「`now` 不后退」的承接者定为该节点；机制归它 |
| 六个领域提供者 | [`tenancy/*`](../../packages/tenancy/account-identity/README.md) 四个插件（骨架只有类型）+ [`core/identity-values`](../../packages/core/identity-values/design.md)、[`core/offer-expiry`](../../packages/core/offer-expiry/design.md) 两个纯模块（被插件 import，装配不碰） | [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受为实现路径 |
| 密钥的形式与自检原语 | Ed25519、PEM（私钥 PKCS#8、公钥 SPKI）；生成用 identity-values 的 `generateHandoffKeyPair()`，装配层的配对自检用它的 `loadSigningKey`／`loadVerificationKey`／`issueHandoffWarrant`／`verifyHandoffWarrant`（源码已有，**不新增任何能力**） | [identity-values 节点「交接凭证走签名」](../../packages/core/identity-values/design.md#交接凭证走签名不走进程内登记)；下发路径两条来自[研究第二部分](../../../../research/agent-harness-persistence-and-identity-infra/research.md#第二部分身份基础设施) |

**本节点自建的只有四样**：① 装载清单与 `boot()`／`dispose()`（候选名）；② 迁移的**合成**（owner 导出片段，本节点定次序并给出跨 owner 那条外键的目标与名字）；
③ config 的来源与解析（环境变量／文件 → 各插件 config 对象，含**密钥配对自检**）；④ `keygen`（候选：一个导出函数，命令形态待交付面 PF）。
四样里没有任何一样拥有领域事实或判定；[装配胶水不得暗中拥有未定义能力](../../AGENTS.md#红线)——凡是本页写不进上面四样的逻辑，都回它所属的 provider 节点或契约。

**复杂度声明**：本节点没有缓存、池、队列、重试、定时器。两处像「机制」的东西——启动的整体性（任一 fiber 失败 ⇒ 全撤 ⇒ 退出）与密钥配对自检——
都是正确性检查：前者保护「配置错误一个政策」，后者保护「两份交接凭证不可伪造」的配对前提（[AI S-30 第 9 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)）。

## 选择与动作链

| 消费的契约与版本 | 所选提供者及修订 | 配置与作用域 | 动作链上的责任交接 |
| --- | --- | --- | --- |
| `capability.account-identity/v1`（`accepted`）——八个操作、两个服务面 `accounts`／`logins` | [`packages/tenancy/account-identity`](../../packages/tenancy/account-identity/design.md) 插件；**骨架只有类型，无实现** | 根 Context 一份实例。config（骨架已有四项）：`credentialPolicy`（缺席 ⇒ 按契约 S-13 ② 一律 `credential-rejected`，**不是启动失败**——[S-27](../../../spec/capabilities/account-identity/v1/contract.md#s-27-缺席时的默认答案) 定的唯一例外）、`unactivatedRetention`（非正 ⇒ 启动失败）、`activationVerificationKeyPem`、`purgeVerificationKeyPem`（缺或形状不对 ⇒ 启动失败） | 正常：提交点在它自己的 `storage.write` 里；失败：`storage`／`clock` 不可用 ⇒ 各操作 `storage-unavailable`；撤除：在途调用跑完，按各自那一次提交收场（[该节点装卸表](../../packages/tenancy/account-identity/design.md#成对的装载与撤除)）。**本节点交给它的只有 config 与三个服务名** |
| 同上契约的凭据那一半（S-8、S-26） | [`packages/tenancy/credential-verification`](../../packages/tenancy/credential-verification/design.md) 插件（密码 scrypt）；骨架只有类型 | 根 Context 一份；config：scrypt 参数（候选，该节点定形状；非法 ⇒ 启动失败）。**account-identity 在调用时解析它、不 inject**——换代不重跑治理，那是该节点的关键选择，本节点照装不改 | 撤除或换代期间 AI 的凭据步骤得 `unavailable` ⇒ `storage-unavailable`，其余照常；换代演练归本节点 + CV（[承接表](#归装配的事项逐条承接)） |
| `capability.organization-governance/v1`（`accepted`）——25 个操作、四个服务面 | [`packages/tenancy/organization-governance`](../../packages/tenancy/organization-governance/design.md) 插件；骨架只有类型 | 根 Context 一份。config（骨架已有）：`invitationTtlDefault`、`affiliationRequestTtlDefault`、`teamCreationKeyRetention`（非正 ⇒ 启动失败）、`purgeSigningKeyPem`（缺或形状不对 ⇒ 启动失败） | 跨 owner「同一提交」靠账号行上的过期事实 + 组织行对账号行的引用约束——**那条外键的目标与名字由本节点在合成迁移时给出**（[下文](#同一存储同一约束域本节点要保证的三件事)）。`organization-purge` 单列服务名只给 AR 解析，结构检查由 `tools/ts-checks` 的 `restricted-call-sites` 承接（承接表） |
| `composition.account-registration/v1`（`accepted`）——两条链 | [`packages/tenancy/account-registration`](../../packages/tenancy/account-registration/design.md) 插件；骨架只有类型 | 根 Context 一份；config（骨架已有）：`activationSigningKeyPem`（缺或形状不对 ⇒ 启动失败）。三个参与方必需 inject，任一缺席 ⇒ `PENDING` ⇒ 本节点视为清单错误（[装载清单](#装载清单与顺序)） | 不包事务、不加锁；本节点也不在它外面包任何东西。S-25 第 1 行「同进程、同存储」由本节点给：一个进程、一个 `storage` 实例 |
| `data.offer-expiry/v1`（`accepted`）——[S-16](../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 时间源形状、[S-17](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 五行装配给 | [`packages/infra/clock`](../../packages/infra/clock/design.md) 的 `clockPlugin`，`provide('clock')`；源码已有，包内 8 条测试通过 | 根 Context **恰一份**（同源可比）；**config 为空对象**（租约宽度与续约周期是包内常量）；`inject: ['storage']` | 正常：`now()` 同步返回；启动期检出回拨或启动判定写失败 ⇒ 插件体抛出 ⇒ **整个装配启动失败**；运行期落在旧租约窗口或续约失败 ⇒ `'unavailable'`；撤除：它的 disposer 收回租约，所以本节点**先撤它、后撤 `storage`**（[撤除次序](#成对的装载与撤除)） |
| 存储协议（无契约；[`core/storage`](../../packages/core/storage/design.md#协议候选形状) 的 `Storage`／四型失败） | [`packages/infra/storage-sql`](../../packages/infra/storage-sql/design.md) 的 `storageSqlPlugin`，`provide('storage')`；源码已有，sqlite 一致性套件 15 组通过 | 根 Context **恰一份**；config（源码 `StorageSqlConfig`）：`{ dialect: 'sqlite', file, migrations? }`，pg 为 `{ dialect: 'postgres', connectionString, migrations? }` 只接线；`migrations` 是本节点合成的 `MigrationProvider`，在 `provide` 之前跑 | 正常：每次 `read`／`write` 恰一次事务；失败：打不开、迁移失败 ⇒ 抛出 ⇒ 启动失败；撤除：关准入 → 等在途 → 关句柄，在途事务按各自提交收场，之后的调用 `StorageUnavailable` |
| `data.identity-values/v1`（`accepted`） | 纯模块，被四个插件 import；本节点用 `generateHandoffKeyPair`（`keygen`）与 `loadSigningKey`／`loadVerificationKey`／`issueHandoffWarrant`／`verifyHandoffWarrant`（[配对自检](#配对自检起-context-之前签一次核一次)） | 包依赖 | 本节点不为任何领域操作产出或核实凭证；自检用的凭证绑定一个一次性的探针 AccountId，不落库、不外流 |

**装载清单里每一项都要能指回上表的一行**；指不回去的说明它在偷偷拥有语义。

## 装载清单与顺序

一个根 `Context`；按下列顺序 `ctx.plugin(plugin, config)`：

```text
storage-sql → clock → credential-verification → account-identity → organization-governance → account-registration
```

- **顺序 = 依赖序**。`clock`、AI、OG 必需 inject `storage`，AR 必需 inject 三个领域面；迁移在 `provide('storage')` 之前跑，装 `storage` 先于一切让「表已在」对后面每个插件都成立。
- **`PENDING` 是结构判定，不是等待**：`ctx.plugin()` 返回后**同步**读 `fiber.state`，为 `PENDING` 即视为**清单错误**（它需要的服务不在前面装的插件里）⇒ 撤已装的 ⇒ 启动失败；**不设等待常量**。`core/kernel-basis` 的 `bootAssembly` 源码已按同一形状写（同步查 `FIBER_STATE.PENDING`，失败时逆序撤已装的）。
- **不 `PENDING` 就 `await` 它**：config 校验失败或插件体抛出 ⇒ fiber `FAILED` ⇒ `await` 拒绝（probe `plugin-throw-fails-fiber`，[basis 当前状态](../../../basis/README.md#当前状态)）⇒ 按逆序撤除已装的 fiber ⇒ 进程退出非零。**不半开**：一份漏配 `activation` 私钥的部署，`storage` 与 `clock` 已经 `ACTIVE` 也一起撤掉，而不是让 AI／OG 带病服务、注册每次 `interrupted`。
- **不用 `isolate`、不用 `intercept`**：一个部署一份实现、一份数据（basis [`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)）；config 在 `ctx.plugin` 时直接传，没有向下注入的政策链。

| | 只 `ctx.plugin` 六次、全靠 inject 自动排序（落选） | **清单顺序 + 同步查 `PENDING` + 逐个 `await`（选）** |
| --- | --- | --- |
| 最强论证 | 内核本来就按依赖装；少写一个顺序 | 第一个失败的 fiber 是确定的；清单错误在装那一条时就暴露，不会静默挂起 |
| 弱点 | 一个 `FAILED` 的 fiber 会让依赖它的全部停在 `PENDING`，进程看起来「起来了」但什么都不服务——正是要避免的半开 | 顺序是本节点维护的一份知识；加一个插件要放对位置。置信度：**高**（`bootAssembly` 已同形并有测试） |

## 存储装配：迁移由 owner 导出片段、本节点合成

### 迁移的所有权

| | 全部迁移写在本节点（落选） | **owner 导出 `Migration` 片段，本节点合成（选，与 `infra/clock` 同形）** | 本节点自己 `CREATE TABLE organization`、OG 只导出列定义（落选） |
| --- | --- | --- | --- |
| 最强论证 | 只有装配同时看得见两边，一处就写全 | 表是各 owner 事实的存储形状，列跟着 owner 的设计变；片段放在 owner 包里，**列的变化与迁移的变化在同一个包、同一次修改**——「迁移随 owner 列变化同步修改」这条代价落在最贴近变化的地方 | 跨 owner 那条外键能由本节点直接写进 `CREATE TABLE` |
| 弱点 | **每次 owner 改列，本节点的迁移都要同步改**——两个包、两次修改，谁也不会因为漏改而编译失败 | 跨 owner 的那条外键**不能事后加**：sqlite 的 `ALTER TABLE` 不支持 `ADD CONSTRAINT`（外键只能在 `CREATE TABLE` 里声明），所以 OG 的片段要以**工厂参数**接收外键的目标与名字（[下文](#合成规则)）；两个 owner 包在第二程各加一个导出 | 一张 OG 的表由装配建，OG 的设计与它的表分家 |
| 置信度 | — | **中高**：代价被搬到 owner 包里而不是消失；缓解见下 | — |

**代价与缓解**：owner 改了列（尤其是被外键引用的 `account.account_id` 或引用列 `organization.owner_account`），本节点合成时传给工厂的参数就对不上——
这类错误**不会在编译期暴露**。缓解三条：① 本节点的 `assembly.fk-organization-owner-account` 与 `assembly.constraint-names-resolve` 在装配的 CI 里跑，对不上即红；
② owner 片段带自己的幂等测试（归各 owner）；③ 外键的目标与名字只在本节点一处出现（合成函数的两个参数），改名只改一处。

### 合成规则

```text
provider = compose([
  accountIdentityMigrations,                                   // AI 包导出：account、login_state
  organizationGovernanceMigrations({                           // OG 包导出的工厂：六张表
    ownerAccountReference: { table: 'account', column: 'account_id' },
    ownerAccountForeignKey: 'organization_owner_account_fk',   // ON DELETE RESTRICT，不延迟——由工厂内的 CREATE TABLE 声明
  }),
  clockLeaseMigration,                                         // clock 包导出（源码已有）
])
```

（候选形状；`compose` 是本节点的一个小函数：按给定次序给片段编号名，交给 Kysely `Migrator` 的 `MigrationProvider`。Kysely `Migrator` 自己的登记表名**待核**。）

- **次序**：AI 片段先于 OG 片段（外键目标要先存在）；`clock_lease` 与其他迁移次序无关，放最后。
- **跨 owner 的外键归本节点**：目标（`account.account_id`）、名字（`organization_owner_account_fk`）、`ON DELETE RESTRICT`、不延迟，都由本节点作为参数给出；OG 的片段只负责把它写进 `organization` 的 `CREATE TABLE`。OG 的包因此**不 import** AI 的包——它只收到两个字符串。
- **本节点不改任何片段的内容**；`clock_lease` 原样合入。

### 迁移清单（候选列名；逻辑名以各 owner 节点为准）

列名候选取小写加下划线；逻辑名（`accountId`、`ownerAccount`……）以各 owner 节点的持久记录表为准。**本表是合成后的全貌**，每张表的片段由「片段出自」那一列的包在第二程导出。

| 表（候选名） | 列 | 主键与约束（**全部显式命名**） | 片段出自 |
| --- | --- | --- | --- |
| `account` | `account_id`、`login_identifier`、`credential_material`（不透明文本）、`activated`（布尔）、`produced_at`、`retention_deadline`、`expired_at`（可空） | `account_pkey`（`account_id`，TEXT）；`CREATE UNIQUE INDEX account_login_identifier_unique`（[AI R-2](../../packages/tenancy/account-identity/design.md#对存储提供者的要求清单)、[S-19](../../../spec/capabilities/account-identity/v1/contract.md#s-19-登录标识部署内唯一)）。**不建 CHECK**：`activated` 与 `expired_at` 互斥是 [AI S-18 性质 1](../../../spec/capabilities/account-identity/v1/contract.md#s-18-读账号)，由 AI 的写路径与测试守，不由存储二次裁决 | AI 包（[S-4](../../../spec/capabilities/account-identity/v1/contract.md#s-4-账号记录)） |
| `login_state` | `login_state_id`、`account_id`、`issued_at`、`revoked` | `login_state_pkey`。**不建指向 `account` 的外键**（[理由](#为什么只建一条外键)）。按 `account_id` 的普通索引是可选项，非正确性 | AI 包（[S-9](../../../spec/capabilities/account-identity/v1/contract.md#s-9-登录状态记录)） |
| `organization` | `organization_id`、`kind`、`parent`（可空）、`owner_account`（可空，只对 `personal` 非空）、`created_at` | `organization_pkey`；`CREATE UNIQUE INDEX organization_owner_account_unique ON organization(owner_account)`——**普通唯一索引即满足「非空时唯一」**（两方言 NULL 互不相等，[OG R-2](../../packages/tenancy/organization-governance/design.md#对存储提供者的要求清单)）；**外键 `organization_owner_account_fk`：`owner_account → account(account_id) ON DELETE RESTRICT`，不延迟**——[AI R-7](../../packages/tenancy/account-identity/design.md#对存储提供者的要求清单) ⇔ [OG R-6](../../packages/tenancy/organization-governance/design.md#对存储提供者的要求清单) 那一条，目标与名字由本节点传给工厂 | OG 包（工厂；[持久记录](../../packages/tenancy/organization-governance/design.md#持久记录存储布局候选)） |
| `membership` | `organization_id`、`account_id`、`effective`、`role` | `membership_pkey`（复合，两列即 `TenantId`，不拼标量键；OG R-2「成员关系复合主键」） | OG 包 |
| `invitation` | `invitation_id`、`issuer_organization`、`invited_account`、`role`、`issued_at`、`expires_at`、`settled`（可空） | `invitation_pkey`（OG R-2「两类邀约标识」之一）。**不建 CHECK**：`settled` 的取值集合是 [OE S-7](../../../spec/data/offer-expiry/v1/contract.md#s-7-派生状态)，由 offer-expiry 的类型分层与 lint SC-OE-1 守 | OG 包 |
| `affiliation_request` | `affiliation_request_id`、`initiator`、`recipient`、`direction`、`issued_at`、`expires_at`、`settled` | `affiliation_request_pkey`（OG R-2「两类邀约标识」之二） | OG 包 |
| `current_tenant_selection` | `login_state_id`、`organization_id`、`account_id` | `current_tenant_selection_pkey`（`login_state_id`；OG R-2「选择记录主键」） | OG 包（[S-14 ⑤](../../../spec/capabilities/organization-governance/v1/contract.md#s-14-当前租户身份是登录状态上的一项选择)） |
| `team_creation_key` | `creator_account`、`creation_key`、`organization_id`、`registered_at` | `team_creation_key_pkey`（复合；OG R-2「`(creatorAccount, creationKey)`」） | OG 包（[S-21 ⑦](../../../spec/capabilities/organization-governance/v1/contract.md#s-21-创建团队组织)） |
| `clock_lease` | `id`、`lease_until`、`written_at` | 由 `clockLeaseMigration` 定义（源码已有：`id INTEGER PRIMARY KEY CHECK (id = 1)`）；本节点只**合入**，不改。`id` 是 sqlite 的 rowid 别名——M-3 前提的**已知例外**，单行、`BEGIN IMMEDIATE` 下无竞争、无害，记在 clock 节点 | clock 包 |

### 迁移纪律（每条对应一个提供者要求）

| # | 纪律 | 来自 |
| --- | --- | --- |
| M-1 | **幂等**：每个片段可重复跑（`ifNotExists` 或先查 introspector）；sqlite 的 DDL 不在事务里，失败的迁移可能留半截，靠重跑收口 | [storage-sql 依赖表](../../packages/infra/storage-sql/design.md#依赖作用域与绑定) |
| M-2 | **唯一约束一律 `CREATE UNIQUE INDEX <显式名>`，不用表内 `UNIQUE`**：sqlite 对表内约束生成 `sqlite_autoindex_*`，映射不回迁移名 ⇒ 提供者报 `StorageDefect`（[storage-sql 错误码映射](../../packages/infra/storage-sql/design.md#错误码映射表)、[core/storage P-11](../../packages/core/storage/design.md#要求到协议再到会红的测试)） | 同上 |
| M-3 | **主键约束名恒为 `<table>_pkey`**——不给主键起别的名字：storage-sql 的 sqlite 解析器把 `origin = 'pk'` 的自动索引映射成 `<table>_pkey`（pg 对未命名主键的默认名），两方言才对得上同一个 `UniqueViolation.constraint`。**前提：主键列不得是 sqlite 的 `INTEGER PRIMARY KEY`**——rowid 别名不建索引，反查不到；本清单的主键列全是 TEXT 或复合，唯一例外是 `clock_lease.id`（见上表） | storage-sql 源码 `sqlite/constraints.ts`（纯文本指认） |
| M-4 | **外键写 `ON DELETE RESTRICT`，不用延迟约束**：延迟把失败推到 COMMIT，协议 P-2「语句级失败不废事务」就不成立 | [core/storage P-10](../../packages/core/storage/design.md#协议候选形状) |
| M-5 | **只建 AI R-7 ⇔ OG R-6 那一条外键**，见下 | 本节点 |
| M-6 | **`foreign_keys=ON` 不在迁移里**——它是每句柄状态，由 storage-sql 在打开时设；本节点的真实外键测试**必须**在它关着时会红（[verification](verification.md#证据义务)） | [storage-sql](../../packages/infra/storage-sql/design.md#要求清单到方言机制) |
| M-7 | **不持有 owner 语义**：迁移里不写表达契约不变量的 CHECK；不变量由 owner 的写路径与测试守。本节点合成时只加次序与那条外键的参数 | 本节点 |
| M-8 | **本节点不提供回滚**：片段带不带 `down` 归各 owner（`clockLeaseMigration` 带），合成后只调 `migrateToLatest` | 本节点 |

### 为什么只建一条外键

| | 把所有「看起来是引用」的列都建外键（落选） | **只建 `organization.owner_account → account`（选）** |
| --- | --- | --- |
| 最强论证 | 存储层多一层防御，孤儿行更少 | 两个 owner 的要求清单**只要求这一条**（AI R-7、OG R-6）；每多一条 `RESTRICT` 就多一条 owner 没列进失败集合的拒绝路径——例如 `membership.organization_id → organization` 会让 [S-53](../../../spec/capabilities/organization-governance/v1/contract.md#s-53-清除未激活账号的个人组织) 的「删组织行 + 删成员记录」依赖同一事务内的删除顺序，OG 节点没写这个顺序；`login_state.account_id → account` 会让 [S-38](../../../spec/capabilities/account-identity/v1/contract.md#s-38-清除到期的未激活账号记录) 多一个 AI 不知道的拒绝来路 |
| 弱点 | 改变两个节点的失败语义 | 存储层不挡 owner 自己的缺陷（如 OG 插入一条指向不存在组织的成员记录）——那类缺陷归各节点的测试。置信度：**高**——要求清单是规格，本节点不替 owner 加约束；要加，回那两个节点补一条 R |

### 同一存储、同一约束域：本节点要保证的三件事

两个 tenancy 节点跨 owner 的「同一提交」不是靠事务句柄，而是靠**两个写入者共同触碰的存储对象**——推理在
[AI「过期事实」](../../packages/tenancy/account-identity/design.md#已过留存期限是首次观测时落盘的单调事实不是每次读时重算的谓词)与
[OG「跨 owner 的同一提交」](../../packages/tenancy/organization-governance/design.md#跨-owner-的同一提交账号行上的过期事实加组织行对账号行的引用约束)，本页不重复。
那两个对象是 **账号行（`account.expired_at` 一列，在 `lockRow` 下落盘）** 与 **外键 `organization_owner_account_fk`**。它们存在的前提全在装配：

1. **恰一个 `storage` 实例、恰一个库文件**：AI、OG、clock 解析到的是同一个 `provide('storage')`。两个实例指向两个文件时 sqlite 无法跨库建外键，孤儿组织立刻可达且无声——本节点的装载清单里只允许一个 `storageSqlPlugin`（`assembly.manifest-shape`，[verification](verification.md#证据义务)）。
2. **两张表由同一份合成的 `MigrationProvider` 建在同一 schema**：AI 片段在前、OG 片段在后，外键目标由本节点传入。
3. **那条外键真的存在且 `foreign_keys=ON`**：一致性套件只证提供者会把违反报成两向（[core/storage 覆盖缺口](../../packages/core/storage/verification.md#覆盖缺口)明写「装配还欠一条检查」）；真实外键的存在由本节点的测试 `assembly.fk-organization-owner-account` 证。

**自构的两条反证**：(a) 装配把 AI 与 OG 装在两个 `isolate` 标签下各给一个 `storage`——两个库、无外键，S-20 与 S-38 的交错终态「个人组织在、账号不在」可达；本节点不用 `isolate` 就是为此。(b) 合成时给工厂传了 `DEFERRABLE INITIALLY DEFERRED`——S-20 插入指向已删账号的组织行时语句不报错、COMMIT 才报，OG 的「提交内重读 ⇒ `accountDoesNotExist`」分支永远走不到；M-4 挡它。反证不了的部分——两条交错本身的终态——归 AI S-43 第 2 支的三节点真并发演练，本节点只提供夹具。

### 存储 config 的来源（候选环境变量名）

| 变量 | 值 | 缺或非法 |
| --- | --- | --- |
| `OMNE_TENANCY_STORAGE_DIALECT` | `sqlite`（默认）或 `postgres` | 不认识 ⇒ 启动失败 |
| `OMNE_TENANCY_STORAGE_FILE` | sqlite 文件路径；`:memory:` 由 storage-sql 的 schema 拒绝（源码已有该 `refine`；D-026 无 in-memory） | 缺 ⇒ 启动失败；打不开 ⇒ 启动失败（storage-sql 抛出） |
| `OMNE_TENANCY_STORAGE_URL` | pg 连接串；**本程只接线** | 缺（方言为 pg 时）⇒ 启动失败 |

`synchronous` 本版取 storage-sql 的默认 `NORMAL`（进程崩溃不丢已提交事务，断电可能丢最后一段）；要断电级持久由本节点改成 `FULL`，
storage-sql 的 config 本版不暴露这一项，记[缺口](#实施缺口与消费者影响)。

## 时钟装配

- 装 [`infra/clock`](../../packages/infra/clock/design.md) 的 `clockPlugin`，`provide('clock')` **恰一次**——[OE S-17 第 1 行](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证)「同源可比」的装配那一半；另一半（消费者不得另用 `Date.now()`）是 `tools/ts-checks` 的 `no-wall-clock` 规则（源码已有，`infra/` 豁免、本节点不在其扫描范围内——本节点自己也不调 `Date.now()`，记为候选规则扩展）。
- **config 是空对象**（源码 `ClockConfig = z.object({}).strict()`）：租约宽度与续约周期是包内常量；要可配时由它加 config 并走同一条「非法即启动失败」。
- 它 `inject: ['storage']`，所以装在 `storage` 之后；它的 `clockLeaseMigration` 已合入本节点的 `MigrationProvider`，表在它的启动判定之前已存在——缺了这一步，启动判定读表得 `StorageDefect` ⇒ 抛出 ⇒ 启动失败（clock 包内测试已覆盖「缺迁移 ⇒ 启动失败」）。
- **启动期两种失败都是抛出 ⇒ fiber `FAILED` ⇒ 整个装配启动失败**：① 启动判定那次写失败（`StorageUnavailable`／`StorageDefect`）；② **检出回拨**（`wall < written_at`）——源码抛 `ClockRollbackDetected`。回拨是环境错误，与「打不开库即启动失败」同一政策，不半开着提供一个永远 `'unavailable'` 的时钟。**运行期**的「崩溃后快速重启落在旧租约窗口内」「续约写失败」仍是 `now()` 返回 `'unavailable'`——那是抖动，不是环境错误；AI 映射 `storage-unavailable`、OG 映射 `unavailable`，本节点不介入。（clock 节点正文里「回拨 ⇒ 永久 `'unavailable'`」是改前的说法，源码已是抛出；该节点由其 owner 收口。）
- **测试装配不用本节点的时钟**：需要前推时间的演练（AI S-41、OG S-47）用 `core/offer-expiry` `./testing` 的 `testClock(start)`（源码已有：`advance` 只前推、`setUnavailable`）经 kernel-basis 的 `bootAssembly` 作为 `services` 传入；那不是本节点的清单。
- **租约表被外部删除**无法在节点内防御（[clock 覆盖缺口](../../packages/infra/clock/verification.md#覆盖缺口)）：本节点把它写成运维约定——库文件与其中 `clock_lease` 一行不得手工改动；没有证据形式。

## 密钥装配：两对 Ed25519 密钥作为部署配置输入

**两对密钥、四份 PEM**：`activation`（私钥 → `account-registration`，公钥 → `account-identity`）、`purge`（私钥 → `organization-governance`，公钥 → `account-identity`）。
形式与「不在启动时生成、跨重启不变」的前提归 [identity-values 节点](../../packages/core/identity-values/design.md#依赖作用域与绑定)；本节点定**从哪读、给谁、缺了怎么办、配没配对**。

### 来源：环境变量或文件路径，`_FILE` 惯例

| 变量（候选名） | 内容 |
| --- | --- |
| `OMNE_TENANCY_ACTIVATION_SIGNING_KEY_PEM` / `…_PEM_FILE` | activation 私钥（PKCS#8 PEM）的文本 / 文件路径 |
| `OMNE_TENANCY_ACTIVATION_VERIFICATION_KEY_PEM` / `…_PEM_FILE` | activation 公钥（SPKI PEM） |
| `OMNE_TENANCY_PURGE_SIGNING_KEY_PEM` / `…_PEM_FILE` | purge 私钥 |
| `OMNE_TENANCY_PURGE_VERIFICATION_KEY_PEM` / `…_PEM_FILE` | purge 公钥 |

规则：**每份密钥恰一个来源**——两个变量都缺 ⇒ 启动失败；两个都设 ⇒ 二义 ⇒ 启动失败；文件读不到 ⇒ 启动失败；
文件对 group／other 可读（候选：POSIX 权限位检查，DSH 的先例是 `0600`，[研究](../../../../research/agent-harness-persistence-and-identity-infra/research.md#第二部分身份基础设施)）⇒ 启动失败。
内联变量取值就是 PEM 文本本身（含换行）；base64 一行的形式本版不支持。

| | 只支持环境变量（落选） | 只支持文件路径（落选） | **两条都支持，`_FILE` 惯例，二义即失败（选）** |
| --- | --- | --- | --- |
| 最强论证 | 12-factor 的正统；一条代码路径 | 秘密不进 `/proc/<pid>/environ` 与子进程继承；权限位可查（DSH 先例） | 容器与本机两种运行方式各得其所；`_FILE` 是 Docker 官方镜像的通行惯例 |
| 弱点 | 多行 PEM 在 shell 里难写；泄露面大 | 本机开发要先写文件 | 两条代码路径、一条二义规则。置信度：**中**——两条路的取舍在研究里是并列的，没有一方被否定；主线可裁掉一条，本节点只删一列 |

### 配对自检：起 Context 之前签一次、核一次

四份 PEM 各自形状合法，**不等于**两把私钥与两把公钥两两配对——一份用两次 `keygen` 拼出来的部署，每个持钥插件都能启动，
而注册主链的 ③ 与清除链的 ② 会**永远** `warrant-invalid`／`purge-warrant-invalid`。没有哪个插件能单独发现这一点（各自只见一把钥匙），所以它归装配。
在起 Context 之前，对两对各做一次：

```text
signing      = loadSigningKey(privatePem)          // 不合 ⇒ 启动失败
verification = loadVerificationKey(publicPem)      // 不合 ⇒ 启动失败
warrant      = issueHandoffWarrant(signing, purpose, PROBE_ACCOUNT_ID)
verifyHandoffWarrant(verification, purpose, PROBE_ACCOUNT_ID, warrant) === 'ok'   // 否则 ⇒ 启动失败
```

`PROBE_ACCOUNT_ID` 是一个固定的、只在此处使用的合法 `AccountId` 字面（候选），凭证不落库、不外流。
**四个原语全是 identity-values 已有的公开入口**——本节点不新增任何能力，也不重复 `loadSigningKey` 的形状校验之外的逻辑：形状仍由持钥插件的 Config 各自核（下表），
装配层只多核**跨插件的配对**这一件事。它是 AI bindings 里「activation／purge 私钥只由产出方持有且与本节点的公钥配对……由装配兑现」那条前提的保护点。

### 谁核形状：持钥插件的 Config，不是装配；谁核配对：装配

| | 装配层用 `loadSigningKey`／`loadVerificationKey` 预核形状，再传给插件（落选） | **形状由三个插件各自的 Config（经 `definePlugin`）核；配对由装配核（选）** |
| --- | --- | --- |
| 最强论证 | 更早失败（config 解析阶段就退出，不必等装到 AR） | 「配置错误 ⇒ 启动失败」只有**一个实现点**（[kernel-basis](../../packages/core/kernel-basis/design.md#能力到-cordis-的投影)）；三个持钥节点的设计都已把形状校验写在自己的装卸表里。配对是**跨插件性质**，只有装配看得见两把钥匙 |
| 弱点 | 同一件事两处做；插件的校验被架空后将来独立测不到 | 配对自检本身要先 `load*Key`——形状校验事实上跑了两遍（自检一遍、插件 Config 一遍），但**政策仍只有一个实现点**，自检失败也是同一收场。置信度：**高** |

**来源缺失（变量与文件都没有）是装配层的配置错误**，在 config 解析阶段就启动失败，不等到插件；这与「形状由插件核」不冲突：前者是「有没有」，后者是「对不对」，配对是「合不合」。

### 私钥不经服务 store 可达

- 私钥只出现在 `account-registration` 与 `organization-governance` 两个 config 对象里，公钥只出现在 `account-identity` 的 config 里；本节点**不 `provide`、不 `mixin` 任何持钥服务**，启动失败的结构化记录只写变量名，不写值。
- **但「不进 ctx」这句话不成立**：每个持钥插件的 config 挂在它自己的 fiber 上，同进程任何拿到根 `Context` 的代码都能沿 fiber 树读到它。单进程内没有硬隔离——「私钥不外泄」是装配纪律，[identity-values 覆盖缺口](../../packages/core/identity-values/verification.md#覆盖缺口)已明写没有可机检的完整形式。
- 本节点给的证据因此**只到两件事**：config 对象里 PEM 字段的归属恰如上表；服务 store 里没有任何含 PEM 文本的值（[verification](verification.md#证据义务)）。**不声称**别的代码读不到。

### `keygen` 与重生的后果

- 第一程是一个导出函数（候选 `generateKeyFiles(dir)`）：调 `generateHandoffKeyPair()` 两次，写四份 PEM 文件（`0600`），已有文件时拒绝覆盖；不读任何配置、不连库。命令形态（`tenancy-host keygen`）随进程形态一起等交付面 PF。
- **本版不轮换。**重生密钥等于换钥：已签发、尚未核实的凭证一律核不过——注册主链两步之间重启并换钥 ⇒ ③ `warrant-invalid` ⇒ `interrupted`，重来会重新产出；清除链两步之间换钥 ⇒ ② `purge-warrant-invalid`（缺陷型）⇒ 重扫时 ① 幂等再签。**两条都是契约已定义的收场，不需要迁移期**；换钥须在进程停止时做，运行中换钥的语义本版不定义。

### 其余 config（候选变量名）

| 变量 | 给谁 | 解析 | 缺或非法 |
| --- | --- | --- | --- |
| `OMNE_TENANCY_UNACTIVATED_RETENTION` | AI `unactivatedRetention` | 正整数毫秒或 ISO 8601 时长，用 offer-expiry 的 `parseOfferTtl`（它就是 `Duration` 的解析器；名字带 offer 是该节点的事，本节点不自造第二个解析器） | 缺 ⇒ 启动失败（契约 S-39「取不到 ⇒ `storage-unavailable`」那一支在 AI 设计下不可达）；非正 ⇒ AI Config 拒 ⇒ 启动失败 |
| `OMNE_TENANCY_INVITATION_TTL_DEFAULT`、`OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT`、`OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION` | OG 三项 | 同上 | 缺或非正 ⇒ 启动失败（[OE S-17 第 4 行](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证)：在 OG 加载配置那一刻校验，本节点只传值） |
| `OMNE_TENANCY_CREDENTIAL_POLICY` | AI `credentialPolicy` | JSON 文本 → 对象。**文本→值归装配，值→形状归 credential-verification**（它的 `checkPolicy` 对不合形状的政策给 `unavailable` ⇒ AI `credential-rejected`） | **缺 ⇒ 传 `undefined`，不是启动失败**——契约 S-27 定的收场（S-13 ② 一律 `credential-rejected`）；JSON 解析失败 ⇒ 启动失败（那是装配层的配置错误，不是「取不到」） |
| scrypt 参数 | credential-verification | 该节点定形状 | 非法 ⇒ 启动失败 |

**解析与校验分两层但一个收场**：装配只做「文本 → 值」（用各 owner 包已有的解析器，不自造）与跨插件的配对自检，语义校验（为正、密钥类型、方言合法）归各插件 Config；任一失败都是启动失败。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
| --- | --- | --- | --- |
| 五份契约的服务面 | 根 Context 里各一份 `provide`；消费者按服务名 inject 或调用时解析；**本节点不解析任何服务面**（第一程没有入口层） | 换提供者 = 改装载清单；消费者按 basis [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md) 重跑（probe 已过） | 缺席 ⇒ 依赖它的 fiber 在 `ctx.plugin()` 返回时即 `PENDING` ⇒ 本节点判为清单错误 ⇒ 撤已装、启动失败（[装载清单](#装载清单与顺序)）；不等待、不设常量 |
| `storage`（协议） | `infra/storage-sql` 一份 | 同上 | 本版不换代；换代 ⇒ AI、OG、clock 重跑，在途调用握着旧实例按各自提交收场 |
| `clock`（S-16 形状） | `infra/clock` 一份 | 同上 | 本版不换代 |
| `core/kernel-basis` | `definePlugin`（各插件用）、`FIBER_STATE`（同步查 `PENDING`）；**`./testing` 不被本节点产品代码 import**（`bootAssembly` 是测试装配，本节点的 `boot()` 是生产装配——两者形状相同、责任不同） | 随包版本 | — |
| `core/identity-values` | `generateHandoffKeyPair`（`keygen`）、`loadSigningKey`／`loadVerificationKey`／`issueHandoffWarrant`／`verifyHandoffWarrant`（配对自检） | 随包版本 | — |
| `core/offer-expiry` | `parseOfferTtl`（config 解析） | 随包版本 | — |
| AI、OG、clock 三个包导出的迁移片段 | 合成进一份 `MigrationProvider`（[合成规则](#合成规则)） | 随各包版本；被引用列改名 ⇒ 合成参数要改（缓解见[迁移的所有权](#迁移的所有权)） | AI／OG 的片段第二程才有；在此之前本节点的迁移合成只能合 `clockLeaseMigration` |
| Cordis `inject` | **本节点自己不 inject**——它不是插件，是起 Context 的那段代码 | — | — |

**配置错误政策**：本节点无自己的插件 config；它实现的是政策的**装配层那一半**——来源缺失／二义／文件不可读／JSON 不合法／方言不认识／密钥不配对 ⇒ 在装任何插件之前退出；
其余（形状、为正、`:memory:`）由各插件 Config 经 `definePlugin` 拒 ⇒ fiber `FAILED` ⇒ 全撤退出；清单错误（`PENDING`）⇒ 全撤退出。三半同一收场。

## 状态、并发与失败映射

**本节点无领域状态、无提交点、无锁。**运行时状态只有：一个 Context、六条 fiber 的句柄、一个「已进入撤除」的开关。全部提交点在 AI／OG 的 `storage.write` 里，全部冲突裁决在存储的行锁、唯一约束与外键上（[core/storage](../../packages/core/storage/design.md#状态并发与失败映射)）。

**启动失败**的精确含义：`boot()` 拒绝，已装的 fiber 已按逆序 `dispose()` 完毕（disposer 异常只记日志，basis [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)），调用方（第一程是测试；将来是进程入口）据此退出非零，退出前落一条结构化记录：失败的阶段（config 解析／配对自检／哪条 fiber）、错误类型与消息、**不含任何 PEM 文本**。已跑完的迁移是持久事实，不撤。

**运行期失败**全部归提供者与契约：`storage` 不可用 ⇒ 各操作的「不可用」字面（经 `core/storage` 的 `mapStorageError`）；`StorageDefect` 与其他异常上抛——那是缺陷，本节点不捕获、不重试，让它在日志里可见（[OG](../../packages/tenancy/organization-governance/design.md#状态并发与失败映射)、[storage-sql 错误码映射](../../packages/infra/storage-sql/design.md#错误码映射表)）。**本节点没有 catch-all**。

**并发**：sqlite 一个写句柄 + 进程内写队列、读句柄独立——协议 P-12 的要求由 storage-sql 兑现；`scrypt` 的并发上限本版不限流。**跨进程**：本版一个进程；两个进程指向同一文件时 R-1～R-7 仍由 sqlite 文件锁与约束给，但 `clock` 跨进程不保证先后（投影 [Q-8](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)）。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
| --- | --- | --- | --- |
| 读环境变量与密钥文件，解析成六个 config 对象；**配对自检** | 进程；内存 | 任一缺／二义／不可读／不合法／不配对 ⇒ 记录并拒绝，**尚未起 Context** | 随进程消失；密钥文件是运维事实，不动；自检用的凭证不落任何地方 |
| 根 `Context` | 进程 | — | `dispose()` 末尾不再引用；Context 自身无外部资源 |
| `storage-sql` fiber：库句柄、迁移、`provide('storage')` | 该 fiber；`ACTIVE` 后可解析 | 打不开／迁移失败／PRAGMA 失败 ⇒ 该插件抛出 ⇒ `boot()` 拒绝（此时无其他 fiber）；**已跑完的迁移保留** | 关准入 → 等在途事务各自提交或回滚 → 关句柄（[storage-sql 装卸表](../../packages/infra/storage-sql/design.md#成对的装载与撤除)）；**保留**：库文件、全部已提交事实、迁移登记 |
| `clock` fiber：锚、启动判定写、`provide('clock')`、续约定时器 | 该 fiber | 启动判定写失败或检出回拨（`ClockRollbackDetected`）⇒ 抛出 ⇒ `boot()` 撤 `storage` 后拒绝 | 清定时器 → 等在途续约 → 收回租约的写（[clock 装卸表](../../packages/infra/clock/design.md#成对的装载与撤除)）；**本节点保证撤它时 `storage` 仍活**（见次序）。**保留**：`clock_lease` 行 |
| `credentials`、`accounts`／`logins`、四个治理面、`registration` 五条 fiber | 各 fiber；各自 `ACTIVE` 后可解析 | `ctx.plugin()` 返回即 `PENDING` ⇒ 清单错误；config 校验失败或插件体抛出 ⇒ `FAILED`——两者都 ⇒ `boot()` 逆序撤已装的 ⇒ 拒绝 | 服务从 store 消失；**在途调用跑完，按各自那一次 `storage` 提交收场**——内核不取消在途调用；撤除开始后新发起的 `storage` 调用得 `StorageUnavailable` ⇒ 各契约的「不可用」字面（机制在 storage-sql 的关准入）。**保留**：全部记录（契约 [AI S-28](../../../spec/capabilities/account-identity/v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属)、[OG S-43](../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)：没有只活在实例里的事实） |
| 进程信号处理（`SIGTERM`／`SIGINT` → `dispose()`） | **第一程没有**：只有测试内嵌调用的 `boot()`／`dispose()`，没有独立进程；进程形态待交付面 PF（[architecture](architecture.md#拓扑与进程模型)） | — | 有进程时：撤除完成后退出 0；**撤除的总超时是本节点的候选常量**（未定），见下表弱点 |

**撤除次序**：`dispose()` 按装载的**逆序**逐个 `await fiber.dispose()`：AR → OG → AI → credentials → clock → storage。
不直接 dispose 根 Context——那会让六条 fiber 的 disposer **并发**跑（子 fiber 的 dispose 是父的 effect，各 effect 并发驱动），
`clock` 收回租约的那次写可能撞上已关准入的 `storage` ⇒ 只记日志、租约留着、下次启动最多等一个租约宽度——不破正确性，但可避免。
逆序让每个 disposer 看到它依赖的服务仍活。**顺序只约束发起，不保证异步完成**——storage 的 disposer 自己在一个 effect 内组合了「关准入 → 等在途 → 关句柄」，本节点不替它排。

| | dispose 根 Context（落选） | **按清单逆序逐个 dispose（选）** |
| --- | --- | --- |
| 最强论证 | 一行；内核自己会带走全部子 fiber；**一个 disposer 挂住不拖累其他** | clock 的撤除写有活的 storage；第一个撤除失败的 fiber 可解释 |
| 弱点 | 并发撤除下 clock 撤除写大概率撞关闭的 storage；AI／OG 的在途调用与 storage 关准入之间无序（虽然各自收场仍正确） | **逆序 `await` 在某个 disposer 挂住时劣于并发撤除**——后面的 fiber 一个都撤不到，进程不退出。各 disposer 的等待各自有界（storage 的写锁重试 5 s、clock 的一次写），但本节点不能替它们担保；**总超时归本节点**，值是候选常量（未定），超时 ⇒ 记录未完成的 fiber 后仍退出非零。多一份顺序知识；`bootAssembly` 已按同一形状写。置信度：**中高** |

**崩溃**（`SIGKILL`、断电）：什么都不跑。sqlite 由 WAL 恢复到最后一个完整提交（`synchronous=NORMAL` 下断电可能丢最后一段，[storage-sql](../../packages/infra/storage-sql/design.md#实施缺口与消费者影响)）；`clock_lease` 未收回 ⇒ 下次启动最多等一个租约宽度；领域层没有在途状态要恢复（两条动作链各自幂等，[AR](../../packages/tenancy/account-registration/design.md#状态并发与失败映射)）。

## 「归装配」的事项逐条承接

四个基础设施节点与四个 tenancy 节点（加两个 core 纯模块）各自写下的「归装配」，以及五份契约「装配给」表里的每一行，逐条在本节点的哪一行**承接**（本节点自己给）或**转交**（本节点装的某个提供者给，本节点只保证装了它、且只装一份）；承接不了的写明是缺口与 owner。

| 来源 | 事项 | 本节点的承接或转交 | 状态 |
| --- | --- | --- | --- |
| [kernel-basis](../../packages/core/kernel-basis/design.md#能力到-cordis-的投影) | `definePlugin` 是「配置错误 ⇒ 启动失败」的唯一实现点 | 六个插件都经它定义；装配层只解析来源与核配对，形状归各 Config（[谁核形状](#谁核形状持钥插件的-config不是装配谁核配对装配)） | 已承接（设计） |
| 同上 | `./testing` 的 `bootAssembly` 只收调用方传入的服务；产品代码不得 import `./testing` | 本节点的 `boot()` 是生产装配，不 import `./testing`；静态检查候选（`tools/ts-checks` 现有三条规则**不含**这一条，须加一条） | 已承接；规则待加 |
| 同上 | 四条 basis 与四条共用主张的 probe 在 4.0.4 上通过 | 本节点依赖其中三条：`plugin-throw-fails-fiber`（启动失败机制）、`provide-is-effect-managed`（部分失败时已 provide 的随 fiber 撤）、`effect-disposal-concurrent-not-ordered`（为什么逆序逐个 dispose）；`bootAssembly` 的同步 `PENDING` 判定与本节点同形 | 已承接（probe 已过） |
| [core/storage](../../packages/core/storage/design.md#表结构不在协议里由装配层迁移建立两节点同一约束域) | 表结构不在协议里，由装配的迁移建立；两节点同一约束域；唯一约束与主键命名 | [迁移的所有权](#迁移的所有权)、[合成规则](#合成规则)、M-2／M-3、[三件事](#同一存储同一约束域本节点要保证的三件事) | 已承接（设计） |
| [同上 覆盖缺口](../../packages/core/storage/verification.md#覆盖缺口) | 装配还欠一条真实外键存在性测试 | `assembly.fk-organization-owner-account`（[verification](verification.md#证据义务)） | 未开始 |
| 同上 | pg 方言本程不跑；第一次跑 pg 归装配 | 只接线；[非目标](architecture.md#交付面与非目标) | 缺口，第二程 |
| 同上 | 跨进程重启的持久归 AI S-32 演练 | `boot()` 可在同一文件上起两次，供 S-32 的「完整重启」支 | 未开始（AI + 本节点） |
| [storage-sql 依赖表](../../packages/infra/storage-sql/design.md#依赖作用域与绑定) | config 多一项 `migrations`；迁移文件的四条要求（幂等、命名、RESTRICT 不延迟、合入 clock） | M-1～M-4、M-8；`migrations` 由本节点合成 | 已承接（设计） |
| [storage-sql 实施缺口](../../packages/infra/storage-sql/design.md#实施缺口与消费者影响) | `synchronous=FULL` 归装配政策；本版 config 不暴露 | 本版取 `NORMAL`；要 `FULL` 须 storage-sql 加 config 项 | 缺口（owner：storage-sql + 本节点；已报产品负责人） |
| 同上 | pg 全部行本程只接线，跑 pg 归装配第二程；`dialect-switch` 的 pg 支 | 同上 | 缺口，第二程 |
| 同上 | 配置错误政策与三个持钥节点同批 | [依赖表末段](#依赖作用域与绑定) | 已承接 |
| [clock 高水位](../../packages/infra/clock/design.md#高水位为什么是写在前的租约不是写在后的节流) | `clockLeaseMigration` 由装配合进 `MigrationProvider` | [合成规则](#合成规则)末项 | 已承接 |
| [clock 覆盖缺口](../../packages/infra/clock/verification.md#覆盖缺口) | 租约表被外部删除只能靠运维约定 | [时钟装配](#时钟装配)末条 | 已承接为运维约定；无证据形式 |
| [clock 装卸表](../../packages/infra/clock/design.md#成对的装载与撤除) | 启动判定写失败 ⇒ 启动失败，与 storage-sql 同一政策；启动期检出回拨同样抛出（源码 `ClockRollbackDetected`） | 装载清单的整体性；[时钟装配](#时钟装配)第 4 条 | 已承接 |
| [clock 实施缺口](../../packages/infra/clock/design.md#实施缺口与消费者影响) | 测试装配用可控 `clock`，不用本节点 | [时钟装配](#时钟装配)第 5 条（`testClock` 源码已有） | 已承接 |
| [AI S-30 第 1～5、7 行](../../packages/tenancy/account-identity/design.md#状态并发与失败映射)（R-1～R-3、R-6、R-7 + 过期事实） | 存储要求由装配选的提供者兑现；R-7 同一存储、同一约束域 | **转交** storage-sql 兑现 R-1～R-6（其 verification：sqlite 套件 C-1～C-15 已通过）；R-7 那条外键由本节点在合成时给出（`organization` 行） | 已转交／已承接（设计）；本节点的外键测试未开始 |
| [AI S-30 第 6 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) | 持有 AccountId 即可读——装配保证只在同一部署内传递 | 本版无入口层，AccountId 不出进程；入口层立起时须重述 | 已承接（空真）；入口层缺口 |
| [AI S-30 第 8 行 / S-22](../../packages/tenancy/account-identity/design.md#能力到-cordis-的投影) | `accounts.produce(` 的调用点只在 account-registration——**方法级**结构检查，owner 装配节点 | `tools/ts-checks` 的 `restricted-call-sites` 规则（源码已有：扫 `packages/` 里的 `.produce(`，只允许 `tenancy/account-registration` 与定义包；文本规则，自带「故意违反就失败」自测；接进 `pnpm run check`） | 已写；**尚未登记 evidence run，登记前不进绑定** |
| [AI S-30 第 9 行 / AI 依赖表](../../packages/tenancy/account-identity/design.md#依赖作用域与绑定) | 两把公钥由装配下发；缺 ⇒ 启动失败；与私钥配对 | [密钥装配](#密钥装配两对-ed25519-密钥作为部署配置输入)：来源、归属、[配对自检](#配对自检起-context-之前签一次核一次)；AI 骨架已含 `activationVerificationKeyPem`／`purgeVerificationKeyPem` | 已承接（设计） |
| [AI verification](../../packages/tenancy/account-identity/verification.md#证据义务) | S-32 需可重启装配 + 可注入故障 `storage`；S-41 需可控 `clock`；S-43 第 2 支三节点真并发含两条交错 | S-32：`boot()` 两次同文件；故障注入与可控时钟走 `bootAssembly` 测试装配，不是本节点清单；S-43 第 2 支：本节点提供同一文件、同一外键的夹具 | 未开始 |
| [OG S-42 第 1 行](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)（至少一位有效超管：同一存储对同一组织的成员写入序列化） | **转交** storage-sql 兑现 OG R-3a（`lockRow` 组织行；sqlite `BEGIN IMMEDIATE`）；本节点只保证恰一个 `storage` | 已转交（套件 C-4 已通过；OG S-48 真并发演练归 OG） |
| OG S-42 第 2 行（上级链不成环：判环读与写同提交） | **转交** storage-sql 兑现 OG R-3b（`lockSentinel`）与 R-3c；同上 | 已转交（C-5／C-6 已通过） |
| OG S-42 第 3 行（每账号至多一个个人组织：一一约束） | 本节点合成的迁移里的 `organization_owner_account_unique`（[迁移清单](#迁移清单候选列名逻辑名以各-owner-节点为准) `organization` 行）+ 转交 storage-sql 的 `UniqueViolation` 映射 | 已承接（设计）；`assembly.constraint-names-resolve` 未开始 |
| [OG S-42 第 4 行](../../packages/tenancy/organization-governance/design.md#s-53-单独一个服务名只给清除链) | `organization-purge` 只被 account-registration 解析——含 `ctx.get` 的结构检查，owner 装配节点 | 同 `restricted-call-sites`（它扫的是字符串 `'organization-purge'`，`ctx.get('organization-purge')` 一并覆盖）；装载清单那一半：`assembly.manifest-shape` | 规则已写，run 未登记；清单测试未开始 |
| OG S-42 第 5、6 行（成员资格与当前租户身份的可见性：写入即可被下一次读看到） | **转交** storage-sql 兑现 OG R-3c／R-3d（提交内读写同源、只读快照）；同上 | 已转交（C-6／C-7 已通过） |
| OG S-42 第 7 行（邀约过期判定的时钟同源） | **转交** `infra/clock`；本节点保证恰一个 `clock`（[时钟装配](#时钟装配)第 1 条） | 已承接（设计） |
| [OG S-42 第 8、9 行](../../packages/tenancy/organization-governance/design.md#状态并发与失败映射) | 入口层先把 `LoginStateId` 换成身份值再调其余面；**它的面不得直接暴露为终端 API——这句话要写进装配节点** | **写在这里：本进程的五份契约服务面是能力间内部面，不得直接暴露为终端 API；任何入口层必须先经 [OG S-36](../../../spec/capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 或 [AI S-17](../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态) 核实身份，再带身份值调用。**本版没有入口层，所以本版没有对外面 | 已写明；入口层缺口 |
| [OG G-13](../../../spec/capabilities/organization-governance/v1/contract.md#十一已知缺口) / [OG 装卸表](../../packages/tenancy/organization-governance/design.md#成对的装载与撤除) | 残留清扫的定时器与节奏归装配；过期创建键的清理同类 | **本版不建**；登记为将来事项：一个 effect 里的定时器按节奏调 `memberships.sweepStaleSelections(batch)`（候选），节奏是政策，待产品负责人 | 缺口，不阻断 |
| [OG 依赖表](../../packages/tenancy/organization-governance/design.md#依赖作用域与绑定) | `purge` 私钥插件私有 config，缺 ⇒ 启动失败 | 密钥装配 + 配对自检 | 已承接（设计） |
| [OG verification](../../packages/tenancy/organization-governance/verification.md#证据义务) | S-47 可控 `clock`；R-6 注入测试（构造「组织行指着账号行」时 S-38 被拒、重扫后收敛） | 前者走测试装配；后者的存储层形状就是 `assembly.fk-organization-owner-account` 的 `delete-restricted` 支，领域层收敛归三节点演练 | 未开始 |
| [AR 依赖表](../../packages/tenancy/account-registration/design.md#依赖作用域与绑定) | `activation` 私钥插件私有 config，缺 ⇒ 启动失败 | 密钥装配 + 配对自检 | 已承接（设计） |
| [AR S-25 第 1 行](../../packages/tenancy/account-registration/design.md#状态并发与失败映射) | ③ 读到 ② 之后的事实——装配：同进程、同存储 | 一个进程、一个 `storage` 实例 | 已承接 |
| [AR S-25 第 2、3 行](../../../spec/compositions/account-registration/v1/contract.md#s-25-装配给的保证-vs-协议须给的保证)（两个幂等边界：标识唯一、个人组织唯一） | `account_login_identifier_unique`、`organization_owner_account_unique` 两条索引（迁移清单）+ **转交** storage-sql 的 `UniqueViolation` | 已承接（设计） |
| AR S-25 第 4 行（② 内部「组织 + 首条成员资格」同提交） | **转交** storage-sql 兑现 OG R-1（单次提交原子，C-1 已通过） | 已转交 |
| AR S-25 第 5、6 行（三步次序、中断不留不一致） | **不是装配给的**——契约条款，由 AR 方法体结构兑现；本节点不承接 | — |
| AR S-25 第 7 行（S-53 只由本组合调用） | 同 OG S-42 第 4 行 | 同上 |
| AR S-25 第 8 行（三个「已过留存期限」读取点同答案） | AI 的账号行过期事实（AI 写路径）+ 本节点合成的那条外键；本节点不参与判定 | 已承接（外键部分，设计） |
| [AR verification](../../packages/tenancy/account-registration/verification.md#证据义务) | S-29 演练要卸载 OG 的 fiber，区分装配期缺席与运行期 `unavailable` | 测试装配可单独 dispose 一条 fiber；本节点的 `boot()` 不暴露单条句柄之外的东西 | 未开始 |
| [AR S-34](../../packages/tenancy/account-registration/design.md#s-34-清除链的第二个发起者建不起来) / [G-6](../../../spec/compositions/account-registration/v1/contract.md#九已知缺口) | 清扫提供者的发起与节奏归装配，且无枚举读面 | **本版不建**；无枚举读面时装配也建不起来 | 缺口，不阻断验收 |
| [AR 实施缺口](../../packages/tenancy/account-registration/design.md#实施缺口与消费者影响) | 注册入口（apps）须自己做表示层校验、不得透出 `identifier-held-by-expired-record` | 本版无入口层；入口层立起时承接 | 入口层缺口 |
| [CV verification](../../packages/tenancy/credential-verification/verification.md#证据义务) | 换代演练：卸载本插件、装载另一实现，观察 AI 与 OG 的 fiber 不重跑 | `assembly.credentials-swap-no-rerun`（[verification](verification.md#证据义务)）；依赖 probe `inject-has-no-optional-form`（已过） | 未开始 |
| [CV 状态与并发](../../packages/tenancy/credential-verification/design.md#状态并发与失败映射) | `scrypt` 并发上限归装配（运维关注点） | 本版不限流 | 缺口，无正确性影响 |
| [identity-values 依赖表](../../packages/core/identity-values/design.md#依赖作用域与绑定) | 密钥由装配一次生成、持久保存、按节点下发；不在启动时生成；本版不轮换；公私钥配对 | `keygen` + 密钥装配 + 配对自检 | 已承接（设计） |
| [identity-values 覆盖缺口](../../packages/core/identity-values/verification.md#覆盖缺口) | 私钥不外泄无可机检证据 | 窄形式：config 归属与 store 无 PEM 的测试（[verification](verification.md#证据义务)）；完整形式仍无，且「不进 ctx」不成立（fiber.config 可达） | 部分 |
| [IV 第六节第 1、2 行](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)（三个标识部署内唯一；登录标识唯一、未激活也占用） | `account_pkey`、`organization_pkey`、`login_state_pkey`、`account_login_identifier_unique`（迁移清单）+ 转交 storage-sql 的 `UniqueViolation`；「单一生成点」由各持有节点在提交内生成 | 已承接（设计） |
| [offer-expiry S-17 表](../../packages/core/offer-expiry/design.md#状态并发与失败映射) | 第 1 行只 provide 一个 `clock`；第 2、3 行单次提交原子与读写同源；第 4 行默认 `offer_ttl` 在消费者加载配置时校验；第 5 行 `now` 不后退候选形状 owner `apps/` | 第 1 行：[时钟装配](#时钟装配)；第 2、3 行：**转交** storage-sql（OG R-1／R-3c）；第 4 行：本节点只传值，OG Config 校验；第 5 行：承接者是 `infra/clock`（D-026），本节点装它 | 已承接／已转交（设计） |
| [offer-expiry 覆盖缺口](../../packages/core/offer-expiry/verification.md#覆盖缺口) | S-17 五行没有可跑的证据形式，是装配选型声明 + 架构评审 | 本页即那份选型声明；一轮评审已完成，本版按其裁决回填 | 待复评 |

## 实施缺口与消费者影响

| 缺口 | 挡住什么 | owner 与闭合条件 |
| --- | --- | --- |
| **入口层身份核实未写**（第三件半）：登录态怎样到达本进程、`LoginStateId` → 身份值 → 治理面 | 把本进程暴露成终端 API 的那一步（第二程）；**不阻断第一程**——各节点的场景演练在进程内直接调服务面 | 客户端与据点进程之间的契约起草（`apps/cli` 节点标「待立」）；立了之后本节点加入口层一节并回填 [S-42 末两行](#归装配的事项逐条承接) |
| **本节点与准入规则的张力**：交付面写的是 PF-001（不是终端交付面 PF）；承载治理中心的应用无 PF | 本节点的「交付面」一行是借用；`apps/cli` 与本节点之间的边没有对端身份；绑定登记的准入待裁 | 主线不裁，已上报产品负责人：准入例外或为治理中心开题；本节点先以 candidate 存在 |
| **名字**：`tenancy-host`、`infra` 都是候选 | 无 | 产品负责人（[D-026 准入核对](../../../record/decisions/infrastructure-persistence-choices/README.md#准入核对)） |
| **四个基础设施节点的设计尚未被接受** | 本节点对 storage-sql、clock、core/storage、kernel-basis 的每一处采用 | 那四个节点的评审与接受 |
| **AI、OG 的迁移片段第二程才有** | 本节点的迁移合成在此之前只能合 `clockLeaseMigration`；`assembly.fk-organization-owner-account` 起不来 | AI、OG 节点第二程各加一行「导出迁移片段」（OG 的是工厂，收外键目标与名字） |
| **跨 owner 外键靠 OG 片段的工厂参数**（sqlite 无 `ADD CONSTRAINT`）——候选形状 | 若 OG 不接受工厂形状，退路是本节点以 `ALTER TABLE organization ADD COLUMN owner_account … REFERENCES account(account_id)`（可空列，两方言都允许）在 OG 片段之后加列与外键，代价是 OG 的一列由装配建 | OG 节点 + 本节点 |
| **「迁移随 owner 列变化同步修改」** | 被引用列改名不在编译期暴露 | 缓解三条在[迁移的所有权](#迁移的所有权)；不可消除 |
| **`tools/ts-checks` 缺一条规则**：产品代码不得 import `kernel-basis/testing` | 那条纪律无机检 | 主线加规则（三条现有规则的同一形式） |
| **`restricted-call-sites` 的运行未登记 evidence run** | AI S-30 第 8 行、OG S-42 第 4 行不能进绑定 | 主线登记 run 后本节点回填两条 `test:` 绑定 |
| **Kysely `Migrator` 登记表名待核** | 迁移清单的完整性 | 本节点，落包时核 |
| **密钥下发两条路、config 校验库、测试运行器**既无决定也无提案 | architecture 技术栈采用表少三行 | 主线：立提案或决定 |
| **pg 零运行** | D-026「只改配置切 pg」在本节点无证据 | 装配，第二程 |
| **`synchronous=FULL`** 不可配 | 断电级持久 | 已报产品负责人；storage-sql 加 config 项 + 本节点取值 |
| **G-13 残留清扫定时器、G-6 清扫提供者** | 存储卫生；无正确性影响 | 前者：产品负责人定节奏后本节点加 effect；后者：AI v2 枚举读面 |
| **撤除总超时**是本节点的候选常量，未定 | 一个挂住的 disposer 让进程不退出 | 本节点，落包时定并记候选值 |
| **`scrypt` 不限流** | 资源上限 | 装配运维关注点；有测量再做 |
| **进程形态、进程怎么起、信号处理、日志落哪**：第一程只有测试内嵌的 `boot()` | 分发与运维 | 待交付面 PF（等治理中心开题） |
| **clock 节点正文与源码不一致**：正文仍写「回拨 ⇒ 永久 `'unavailable'`」，源码已改为抛 `ClockRollbackDetected` | 本节点按源码写 | clock 节点 owner 收口 |
| **跨进程**：两个进程指向同一文件时 `clock` 不保证先后；协调协议未定 | 分布式演化 | 投影 Q-8，架构设计 |

**受阻消费**：在本节点的迁移合成与 `boot()` 落地、且 AI／OG 导出片段之前，AI／OG／AR 三个节点 verification 里标「依赖装配」的全部场景演练（S-32、S-41、S-43 第 2 支、S-47、S-48、S-54、S-27～S-31）都起不来；
它们不依赖入口层，所以入口层缺口不挡它们。
