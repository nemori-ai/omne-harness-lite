# tenancy-host 实现设计

本页回答**这个装配选了哪些提供者、按什么顺序装、config 从哪来、迁移怎么合成、升级怎么整体成或整体不成、密钥怎么只到持钥插件且公私钥确实配对、
入口层与运维面怎么装、启动失败与撤除怎么收口，以及契约里每一条「装配给」在本节点的哪一行承接或转交**。
它是 [assembly 节点](../../README.md#bindingsyaml)，**不持有任何能力语义**：每条保证指向一份契约坐标或某个 provider 节点，
本页里出现第二份定义就是错。应用的形状在 [architecture.md](architecture.md)，本页不重复。
下文「入口契约」指 [`composition.governance-center-entry/v1`](../../../spec/compositions/governance-center-entry/v1/contract.md)（`candidate`）；不带前缀的 S-n 在「入口契约」语境里指它的条款，AI／OG／AR／IV／OE 沿各契约的缩写。

**贯穿全页的事实：本节点的源码不存在。**`apps/tenancy-host` 尚未建包；下面每一处「函数」「列名」「环境变量名」都是**候选**。
承载仓库里已有的：`core/*` 四个包（`kernel-basis` 含 `./testing`、`offer-expiry` 含 `./testing` 的 `testClock`）、
`infra/storage-sql` 与 `infra/clock`（各自包内测试通过，见其节点 README「实际验证」）、四个 tenancy 包的服务面类型骨架、
`tools/ts-checks` 三条规则——本页引用它们的名字时以「源码已有」标出，其余一律候选。
入口层与运维面所在的 [`packages/tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/README.md) **尚未建包**，只有节点设计。

## 实现路径与来源

**采用型装配：不自建任何能力，只做把它们接起来所需的最小四件事。**

| 事 | 采用什么 | 依据 |
| --- | --- | --- |
| 内核与插件形态 | `@deepseek-ai/cordis` 4.0.4 官方包；八个插件都经 [`core/kernel-basis` 的 `definePlugin`](../../packages/core/kernel-basis/design.md#能力到-cordis-的投影)（源码已有）定义——它是「配置错误 ⇒ 启动失败」的**唯一实现点** | [D-025](../../../record/decisions/cordis-adoption-version/decision.md)；basis 四条条目与四条共用主张的 probe 已在 4.0.4 上通过（[basis 当前状态](../../../basis/README.md#当前状态)） |
| 存储提供者 | [`infra/storage-sql`](../../packages/infra/storage-sql/design.md)：Kysely 0.29.6 + `node:sqlite` 自写 Driver，方言由 config 切，config 含 `migrations?: MigrationProvider`（源码已有 `StorageSqlConfig`、`storageSqlPlugin`）；协议与一致性套件归 [`core/storage`](../../packages/core/storage/design.md) | [D-026](../../../record/decisions/infrastructure-persistence-choices/decision.md#选择与范围)；四个基础设施节点的设计**尚未被接受** |
| 时间源提供者 | [`infra/clock`](../../packages/infra/clock/design.md)：单调钟锚定 + 存储里写在前的租约；源码已有 `clockPlugin`（`inject: ['storage']`，config 为空对象）、`clockLeaseMigration`、`ClockRollbackDetected` | D-026 把「`now` 不后退」的承接者定为该节点；机制归它 |
| 六个领域提供者 | [`tenancy/*`](../../packages/tenancy/account-identity/README.md) 四个插件（骨架只有类型）+ [`core/identity-values`](../../packages/core/identity-values/design.md)、[`core/offer-expiry`](../../packages/core/offer-expiry/design.md) 两个纯模块（被插件 import，装配不碰） | [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md) 接受为实现路径 |
| 入口层与运维面 | [`tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/design.md) 一个包、两个插件（入口层 `governance-center-entry`、运维面 `governance-center-ops`，候选名），**都不 provide**；包另导出 `governance_center` 表的迁移片段。**尚未建包** | 兑现 `composition.governance-center-entry/v1`（`candidate`）；形状依据[提案候选 A](../../../record/proposals/governance-center-entry/alternatives.md#候选-a)（候选，未接受）。为什么入口层不并进本装配见提案[「为什么不拆、为什么不并」第 3 条](../../../record/proposals/governance-center-entry/design.md#为什么不拆为什么不并) |
| 密钥的形式与自检原语 | Ed25519、PEM（私钥 PKCS#8、公钥 SPKI）；生成用 identity-values 的 `generateHandoffKeyPair()`，装配层的配对自检用它的 `loadSigningKey`／`loadVerificationKey`／`issueHandoffWarrant`／`verifyHandoffWarrant`（源码已有，**不新增任何能力**） | [identity-values 节点「交接凭证走签名」](../../packages/core/identity-values/design.md#交接凭证走签名不走进程内登记)；下发路径两条来自[研究第二部分](../../../../research/agent-harness-persistence-and-identity-infra/research.md#第二部分身份基础设施) |

**本节点自建的只有四样**：① 装载清单与 `boot()`／`dispose()`（候选名）；② 迁移的**合成**（owner 导出片段，本节点定次序并给出跨 owner 那条外键的目标与名字）与**升级整体性的编排**（把只读核对交给存储提供者、全部 fiber `ACTIVE` 后确认快照、确认之后才放行入口层开闸，[下文](#升级的整体性迁移前只读核对快照与确认)）；
③ config 的来源与解析（环境变量／文件 → 各插件 config 对象，含**密钥配对自检**，含入口层与运维面的 config）；④ `keygen`（候选：一个导出函数，命令形态待定）。
四样里没有任何一样拥有领域事实或判定；[装配胶水不得暗中拥有未定义能力](../../AGENTS.md#红线)——凡是本页写不进上面四样的逻辑，都回它所属的 provider 节点或契约。

**复杂度声明**：本节点没有缓存、池、队列、重试；定时器只有两个上界（等 `serving`、撤除总超时），都只把「挂住」变成说得出原因的失败。三处像「机制」的东西——启动的整体性（任一 fiber 失败 ⇒ 全撤 ⇒ 退出）、密钥配对自检、升级的整体性（只读核对、快照、确认与两步开闸）——
都是正确性检查：第一处保护「配置错误一个政策」与[入口契约 S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)「起来即整体」，第二处保护「两份交接凭证不可伪造」的配对前提（[AI S-30 第 9 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)），
第三处保护 [PF-017 §6.9](../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成)「升级整体成或整体不成」——快照的具体机制归存储提供者，本节点只编排。

## 选择与动作链

| 消费的契约与版本 | 所选提供者及修订 | 配置与作用域 | 动作链上的责任交接 |
| --- | --- | --- | --- |
| `capability.account-identity/v1`（`accepted`）——八个操作、两个服务面 `accounts`／`logins` | [`packages/tenancy/account-identity`](../../packages/tenancy/account-identity/design.md) 插件；**骨架只有类型，无实现** | 根 Context 一份实例。config（骨架已有四项）：`credentialPolicy`（缺席 ⇒ 按契约 S-13 ② 一律 `credential-rejected`，**不是启动失败**——[S-27](../../../spec/capabilities/account-identity/v1/contract.md#s-27-缺席时的默认答案) 定的唯一例外）、`unactivatedRetention`（非正 ⇒ 启动失败）、`activationVerificationKeyPem`、`purgeVerificationKeyPem`（缺或形状不对 ⇒ 启动失败） | 正常：提交点在它自己的 `storage.write` 里；失败：`storage`／`clock` 不可用 ⇒ 各操作 `storage-unavailable`；撤除：在途调用跑完，按各自那一次提交收场（[该节点装卸表](../../packages/tenancy/account-identity/design.md#成对的装载与撤除)）。**本节点交给它的只有 config 与三个服务名** |
| 同上契约的凭据那一半（S-8、S-26） | [`packages/tenancy/credential-verification`](../../packages/tenancy/credential-verification/design.md) 插件（密码 scrypt）；骨架只有类型 | 根 Context 一份；config：scrypt 参数（候选，该节点定形状；非法 ⇒ 启动失败）。**account-identity 在调用时解析它、不 inject**——换代不重跑治理，那是该节点的关键选择，本节点照装不改 | 撤除或换代期间 AI 的凭据步骤得 `unavailable` ⇒ `storage-unavailable`，其余照常；换代演练归本节点 + CV（[承接表](#归装配的事项逐条承接)） |
| `capability.organization-governance/v1`（`accepted`）——25 个操作、四个服务面 | [`packages/tenancy/organization-governance`](../../packages/tenancy/organization-governance/design.md) 插件；骨架只有类型 | 根 Context 一份。config（骨架已有）：`invitationTtlDefault`、`affiliationRequestTtlDefault`、`teamCreationKeyRetention`（非正 ⇒ 启动失败）、`purgeSigningKeyPem`（缺或形状不对 ⇒ 启动失败） | 跨 owner「同一提交」靠账号行上的过期事实 + 组织行对账号行的引用约束——**那条外键的目标与名字由本节点在合成迁移时给出**（[下文](#同一存储同一约束域本节点要保证的三件事)）。`organization-purge` 单列服务名只给 AR 解析，结构检查由 `tools/ts-checks` 的 `restricted-call-sites` 承接（承接表） |
| `composition.account-registration/v1`（`accepted`）——两条链 | [`packages/tenancy/account-registration`](../../packages/tenancy/account-registration/design.md) 插件；骨架只有类型 | 根 Context 一份；config（骨架已有）：`activationSigningKeyPem`（缺或形状不对 ⇒ 启动失败）。三个参与方必需 inject，任一缺席 ⇒ `PENDING` ⇒ 本节点视为清单错误（[装载清单](#装载清单与顺序)） | 不包事务、不加锁；本节点也不在它外面包任何东西。S-25 第 1 行「同进程、同存储」由本节点给：一个进程、一个 `storage` 实例 |
| `data.offer-expiry/v1`（`accepted`）——[S-16](../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 时间源形状、[S-17](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 五行装配给 | [`packages/infra/clock`](../../packages/infra/clock/design.md) 的 `clockPlugin`，`provide('clock')`；源码已有，包内 8 条测试通过 | 根 Context **恰一份**（同源可比）；**config 为空对象**（租约宽度与续约周期是包内常量）；`inject: ['storage']` | 正常：`now()` 同步返回；启动期检出回拨或启动判定写失败 ⇒ 插件体抛出 ⇒ **整个装配启动失败**；运行期落在旧租约窗口或续约失败 ⇒ `'unavailable'`；撤除：它的 disposer 收回租约，所以本节点**先撤它、后撤 `storage`**（[撤除次序](#成对的装载与撤除)） |
| 存储协议（无契约；[`core/storage`](../../packages/core/storage/design.md#协议候选形状) 的 `Storage`／四型失败） | [`packages/infra/storage-sql`](../../packages/infra/storage-sql/design.md) 的 `storageSqlPlugin`，`provide('storage')`；源码已有，sqlite 一致性套件 15 组通过 | 根 Context **恰一份**；config（源码 `StorageSqlConfig`）：`{ dialect: 'sqlite', file, migrations? }`，pg 为 `{ dialect: 'postgres', connectionString, migrations? }` 只接线；`migrations` 是本节点合成的 `MigrationProvider`，在 `provide` 之前跑。**本节点显式开启升级守卫**：config 加 `upgrade: { checks: [数据格式核对, clockPreflight()] }`（候选名，该节点[方言配置形状](../../packages/infra/storage-sql/design.md#方言配置形状)），开了守卫的实例是这份库的属主——独占、迁移前只读核对、有待跑迁移时先建快照、确认之前的任何失败或撤除都恢复快照；另用两个包导出 `confirmUpgrade`、`pendingUpgrade`（候选名）。该节点**已设计、源码尚无**（[属主实例](../../packages/infra/storage-sql/design.md#属主实例排他迁移前只读核对升级快照与确认)），要求见[下文](#升级的整体性迁移前只读核对快照与确认) | 正常：每次 `read`／`write` 恰一次事务；失败：被占、恢复、只读核对不过、建快照、迁移失败 ⇒ 抛出具名阶段 ⇒ 启动失败；撤除：关准入 → 等在途 → 关句柄 → 快照未确认时恢复快照 → 放独占，在途事务按各自提交收场，之后的调用 `StorageUnavailable`；**撤除路径上的恢复失败内核只记日志**，本节点撤完之后调 `pendingUpgrade` 才看得见 |
| `data.identity-values/v1`（`accepted`） | 纯模块，被四个插件 import；本节点用 `generateHandoffKeyPair`（`keygen`）与 `loadSigningKey`／`loadVerificationKey`／`issueHandoffWarrant`／`verifyHandoffWarrant`（[配对自检](#配对自检起-context-之前签一次核一次)） | 包依赖 | 本节点不为任何领域操作产出或核实凭证；自检用的凭证绑定一个一次性的探针 AccountId，不落库、不外流 |
| `composition.governance-center-entry/v1`（`candidate`）——客户端一面（27 条路由加公开体检）、运维面（完整体检）、中心标识 | [`packages/tenancy/governance-center-entry`](../../packages/tenancy/governance-center-entry/design.md) 的两个插件；**尚未建包** | 根 Context 各一份，**装在清单最后，运维面先于入口层**；入口层 config：`listen`、`tls`、`version`、`drainTimeoutMs`、`clockReadyTimeoutMs`、`openSignal`；运维面 config：`socketDirectory`、`deploymentKey`、`deploymentParameters`——来源见[入口层与运维面的装配](#入口层与运维面的装配) | 正常：入口层插件体做完一切会失败的准备、闸仍关着；本节点在全部 fiber `ACTIVE` 且快照确认之后兑现 `openSignal`，入口层才开闸——开闸即「中心起来了」（[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)，[两步开闸](#两步开闸就绪与开闸分开)）；路由上不提交任何东西，提交点在被投影操作那一次提交（[该节点「提交点」](../../packages/tenancy/governance-center-entry/design.md#提交点入口层在路由上不提交任何东西)）；它唯一的写是启动时读或铸中心标识。失败：两个插件体任一抛出 ⇒ `FAILED` ⇒ 整体启动失败、快照恢复。撤除：入口层在一个 effect 内停机三步；**本节点先撤入口层、再撤运维面**（[撤除次序](#成对的装载与撤除)） |

**装载清单里每一项都要能指回上表的一行**；指不回去的说明它在偷偷拥有语义。

## 装载清单与顺序

一个根 `Context`；按下列顺序 `ctx.plugin(plugin, config)`：

```text
storage-sql → clock → credential-verification → account-identity → organization-governance → account-registration
            → governance-center-ops → governance-center-entry
```

- **顺序 = 依赖序**。`clock`、AI、OG 必需 inject `storage`，AR 必需 inject 三个领域面；迁移在 `provide('storage')` 之前跑，装 `storage` 先于一切让「表已在」对后面每个插件都成立。
- **运维面与入口层装在最后，运维面先于入口层**（[governance-center-entry「次序由装配保证」](../../packages/tenancy/governance-center-entry/design.md#成对的装载与撤除)；提案[装配草图](../../../record/proposals/governance-center-entry/design.md#装载顺序)）。
  入口层开闸那一刻就是中心「起来了」的那一刻（[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)），而开闸由本节点在全部 fiber `ACTIVE` 之后放行（下文「两步开闸」一条），所以装载时两者谁先谁后都不会半开；
  这条先后要的是**撤除那一半**：本节点逆序撤除，入口层先撤，它关闸时发的 `stopped` 通知运维面还在听（两张面同起同停）。
  两者之间没有 inject 关系，**这条先后只由本清单保证**。
- 入口层必需 inject `logins`、`registration`、`organizations`、`memberships`、`offers`、`storage`、`credentials`、`clock`（最后一个只在启动时等钟可读用），运维面必需 inject `storage`、`clock`——都在前面装过；
  所以它们也纳入下一条的同步 `PENDING` 判定：前面任一面没起来（清单错误），入口层停在 `PENDING`，本节点在装它那一步就判清单错误、全撤、启动失败。
- **入口层不 `PENDING` 之后还要等钟可读**：[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁) 以「中心的钟可读」为启动成功的条件，入口层在插件体里（开闸之前）等 `clock.now()` 给出一个时刻，上界是本节点给的 `clockReadyTimeoutMs`；
  超界 ⇒ 入口层插件体抛出 ⇒ `FAILED` ⇒ 本节点逆序全撤、恢复快照、启动失败，**说明里点名原因是钟**。这一步是 `await` 入口层 fiber 的一部分，不是本节点另设的等待。
- **`PENDING` 是结构判定，不是等待**：`ctx.plugin()` 返回后**同步**读 `fiber.state`，为 `PENDING` 即视为**清单错误**（它需要的服务不在前面装的插件里）⇒ 撤已装的 ⇒ 启动失败；**不设等待常量**。`core/kernel-basis` 的 `bootAssembly` 源码已按同一形状写（同步查 `FIBER_STATE.PENDING`，失败时逆序撤已装的）。
- **不 `PENDING` 就 `await` 它**：config 校验失败或插件体抛出 ⇒ fiber `FAILED` ⇒ `await` 拒绝（basis [`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)）⇒ 按逆序撤除已装的 fiber ⇒ 快照未确认时由存储提供者恢复 ⇒ 撤完调 `pendingUpgrade` 核恢复有没有成（R-U8）⇒ 进程退出非零。**不半开**：一份漏配 `activation` 私钥的部署，`storage` 与 `clock` 已经 `ACTIVE` 也一起撤掉，而不是让 AI／OG 带病服务、注册每次 `interrupted`；入口层端口被占，前面七条 fiber 一起撤掉，升级的迁移随快照撤回。
- **两步开闸**：全部 fiber `ACTIVE` 之后确认快照（[升级的整体性](#升级的整体性迁移前只读核对快照与确认)）；确认成功才兑现入口层的 `openSignal`，入口层开闸、发 `serving`；本节点有界地等到 `serving`，`boot()` 才返回成功，等不到即启动失败（快照已确认、不恢复，缺口 U-4）。
  确认失败 ⇒ 不兑现（以拒绝结束）⇒ 逆序全撤 ⇒ 恢复快照 ⇒ 启动失败——闸从未开过（[两步开闸](#两步开闸就绪与开闸分开)）。
- **不用 `isolate`、不用 `intercept`**：一个部署一份实现、一份数据（basis [`isolate-hides-instances-not-data`](../../../basis/cordis/isolate-hides-instances-not-data.md)）；config 在 `ctx.plugin` 时直接传，没有向下注入的政策链。

| | 只 `ctx.plugin` 八次、全靠 inject 自动排序（落选） | **清单顺序 + 同步查 `PENDING` + 逐个 `await`（选）** |
| --- | --- | --- |
| 最强论证 | 内核本来就按依赖装；少写一个顺序 | 第一个失败的 fiber 是确定的；清单错误在装那一条时就暴露，不会静默挂起；运维面先于入口层这条先后没有 inject 关系可依，只有清单给得出 |
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
  governanceCenterMigration,                                   // governance-center-entry 包导出：governance_center（尚未建包）
])
```

（候选形状；`compose` 是本节点的一个小函数：按给定次序给片段编号名，交给 Kysely `Migrator` 的 `MigrationProvider`。Kysely `Migrator` 自己的登记表名**待核**。）

- **次序**：AI 片段先于 OG 片段（外键目标要先存在）；`clock_lease` 与 `governance_center` 两张表不引用任何别的表，与其他迁移次序无关，放最后一批。
- **编号名一经发布不改、不重排；新片段只追加在末尾**（M-9）。升级前的只读核对以「库里登记过的迁移名序列是否为本次合成序列的前缀」判数据格式能否接手（[下文](#升级的整体性迁移前只读核对快照与确认)），重排一次，所有旧库就都被判成接不了。
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
| `governance_center` | `slot`（本包只写常量 `'center'`）、`center_id` | 主键 `governance_center_pkey`（`slot`，TEXT，不是 rowid 别名，合 M-3）；**不建 CHECK**（M-7），不带 `down`；本节点只合入，不改 | governance-center-entry 包（[中心标识的迁移片段](../../packages/tenancy/governance-center-entry/design.md#中心标识迁移片段与读或铸)；[S-28](../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变)） |

### 迁移纪律（每条对应一个提供者要求）

| # | 纪律 | 来自 |
| --- | --- | --- |
| M-1 | **幂等**：每个片段可重复跑（`ifNotExists` 或先查 introspector）。sqlite 的 DDL 在 storage-sql 下不在事务里，失败的迁移可能留半截——**半截由迁移前的快照恢复收口**（[升级的整体性](#升级的整体性迁移前只读核对快照与确认)），幂等是它之外的第二道，不再是唯一收口 | [storage-sql 依赖表](../../packages/infra/storage-sql/design.md#依赖作用域与绑定) |
| M-2 | **唯一约束一律 `CREATE UNIQUE INDEX <显式名>`，不用表内 `UNIQUE`**：sqlite 对表内约束生成 `sqlite_autoindex_*`，映射不回迁移名 ⇒ 提供者报 `StorageDefect`（[storage-sql 错误码映射](../../packages/infra/storage-sql/design.md#错误码映射表)、[core/storage P-11](../../packages/core/storage/design.md#要求到协议再到会红的测试)） | 同上 |
| M-3 | **主键约束名恒为 `<table>_pkey`**——不给主键起别的名字：storage-sql 的 sqlite 解析器把 `origin = 'pk'` 的自动索引映射成 `<table>_pkey`（pg 对未命名主键的默认名），两方言才对得上同一个 `UniqueViolation.constraint`。**前提：主键列不得是 sqlite 的 `INTEGER PRIMARY KEY`**——rowid 别名不建索引，反查不到；本清单的主键列全是 TEXT 或复合，唯一例外是 `clock_lease.id`（见上表） | storage-sql 源码 `sqlite/constraints.ts`（纯文本指认） |
| M-4 | **外键写 `ON DELETE RESTRICT`，不用延迟约束**：延迟把失败推到 COMMIT，协议 P-2「语句级失败不废事务」就不成立 | [core/storage P-10](../../packages/core/storage/design.md#协议候选形状) |
| M-5 | **只建 AI R-7 ⇔ OG R-6 那一条外键**，见下 | 本节点 |
| M-6 | **`foreign_keys=ON` 不在迁移里**——它是每句柄状态，由 storage-sql 在打开时设；本节点的真实外键测试**必须**在它关着时会红（[verification](verification.md#证据义务)） | [storage-sql](../../packages/infra/storage-sql/design.md#要求清单到方言机制) |
| M-7 | **不持有 owner 语义**：迁移里不写表达契约不变量的 CHECK；不变量由 owner 的写路径与测试守。本节点合成时只加次序与那条外键的参数 | 本节点 |
| M-8 | **不用 `down` 回滚**：片段带不带 `down` 归各 owner（`clockLeaseMigration` 带，`governanceCenterMigration` 不带），合成后只调 `migrateToLatest`；升级失败的撤回靠迁移前的快照，不靠逆向迁移 | 本节点 |
| M-9 | **编号名只追加**：已发布的迁移名不改、不重排，新片段追加在合成序列末尾——数据格式版本的判据（登记序列是本次序列的前缀）靠它成立 | 本节点（[升级的整体性](#升级的整体性迁移前只读核对快照与确认) R-U2） |

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

1. **恰一个 `storage` 实例、恰一个库文件**：AI、OG、clock、入口层、运维面解析到的是同一个 `provide('storage')`。两个实例指向两个文件时 sqlite 无法跨库建外键，孤儿组织立刻可达且无声——本节点的装载清单里只允许一个 `storageSqlPlugin`（`assembly.manifest-shape`，[verification](verification.md#证据义务)）。
   **同一条也兑现中心标识那一侧**：`governance_center` 与全部治理事实在这一个实例、这一个库里，备份库就备份了标识、恢复库就恢复了标识——
   与 [governance-center-entry 的 R-GC6](../../packages/tenancy/governance-center-entry/design.md#对存储提供者的要求清单) 互指（[S-28](../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) 性质 2、[S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「中心标识与治理事实同一存储」行）。把标识放进库旁的文件或另一个 `storage`，「只备份了库」就会把它丢掉。
2. **两张表由同一份合成的 `MigrationProvider` 建在同一 schema**：AI 片段在前、OG 片段在后，外键目标由本节点传入。
3. **那条外键真的存在且 `foreign_keys=ON`**：一致性套件只证提供者会把违反报成两向（[core/storage 覆盖缺口](../../packages/core/storage/verification.md#覆盖缺口)明写「装配还欠一条检查」）；真实外键的存在由本节点的测试 `assembly.fk-organization-owner-account` 证。

**自构的两条反证**：(a) 装配把 AI 与 OG 装在两个 `isolate` 标签下各给一个 `storage`——两个库、无外键，S-20 与 S-38 的交错终态「个人组织在、账号不在」可达；本节点不用 `isolate` 就是为此。(b) 合成时给工厂传了 `DEFERRABLE INITIALLY DEFERRED`——S-20 插入指向已删账号的组织行时语句不报错、COMMIT 才报，OG 的「提交内重读 ⇒ `accountDoesNotExist`」分支永远走不到；M-4 挡它。反证不了的部分——两条交错本身的终态——归 AI S-43 第 2 支的三节点真并发演练，本节点只提供夹具。

### 升级的整体性：迁移前只读核对、快照与确认

[PF-017](../../../product/PF-017-governance-center-as-deployable-application/README.md)（rev 1，已接受 2026-09-23）[§6.9](../../../product/PF-017-governance-center-as-deployable-application/design.md#69-升级同一个中心要么整体成要么整体不成) 要求升级整体成或整体不成：起不来，数据必须还是升级前的样子，旧版本照常能起；
[§6.6](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来) 与 [§6.10](../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走) 要求「版本接不了这份数据」「钟比中心用过的最晚时刻早」时不起来、数据原样不动，并告诉运维者差的是哪一样。
**没有一份契约拥有这一条**——入口契约把启动的收场归承载装配（[S-32 末段](../../../spec/compositions/governance-center-entry/v1/contract.md#s-32-进展性质与前提)）——所以本节点直接承接产品要求：**编排归本节点，快照机制归存储提供者**。

```text
[起 Context 之前]   config 解析、密钥配对自检                         —— 失败：不碰数据
[storage-sql 插件体，upgrade 守卫开启]
  ① 取独占                                                        —— 失败：「被占」，不碰数据
  ② 有遗留快照 ⇒ 先恢复（上一次启动没确认就断了）
  ③ 只读核对，一次只读事务：数据格式版本能否接手；时钟未回拨          —— 失败：不碰数据（指内容，见下）
  ④ 有待跑迁移 ⇒ 建快照（sqlite）
  ⑤ 迁移（pg：一个事务）
  ⑥ provide('storage')
[其余七条 fiber]    clock … governance-center-entry                  —— 任一失败：逆序全撤，storage 撤除时恢复快照
                    （入口层到此端口已绑、闸关着；对外没有任何提交）
[全部 ACTIVE]       confirmUpgrade 确认快照                            —— 失败：不兑现 openSignal，逆序全撤，恢复快照
[确认之后]          兑现 openSignal ⇒ 入口层开闸、发 serving ⇒ boot() 返回成功  —— 有界等不到 serving：逆序全撤，不恢复（U-4）
[任一次逆序撤完之后] pendingUpgrade：磁盘上仍有快照 ⇒ 「升级未确认：恢复失败，快照在 X」（R-U8）
```

「不碰数据」在 sqlite 上指**内容**不变：关最后一个句柄时 sqlite 会把预写日志检查点进库文件，已提交内容不变、字节可能变；上一次是干净关闭（预写日志为空）时才逐字节不变（[storage-sql 实施缺口](../../packages/infra/storage-sql/design.md#实施缺口与消费者影响)）。

| 只读核对 | 判据 | 判据归谁 | 不过 ⇒ 告诉运维者 |
| --- | --- | --- | --- |
| 数据格式版本能否接手 | 库里迁移登记的迁移名序列（空库为空序列）是本次合成序列的**前缀**；登记了本版本不认识的名字或次序不同 ⇒ 这份数据来自更新的或别的版本 | 本节点（合成序列与 M-9 在这里）：一个与 storage-sql `PreflightCheck` 同形的函数，只看它在同一读事务里读好的 `appliedMigrations`；读登记归存储提供者 | 「数据格式本版本接不了」，并写出第一个对不上的迁移名 |
| 时钟未回拨 | 此刻墙钟不早于 `clock_lease.written_at`（中心用过的最晚时刻）；那张表还不存在即无历史 | [`infra/clock`](../../packages/infra/clock/design.md#迁移前的只读回拨核对)：与它启动判定同一个纯函数；clock 包导出 `clockPreflight()`（候选名，**已设计、源码尚无**），本节点放进 `upgrade.checks`。只拒确定回拨：落在旧租约窗口里的按快速重启交给插件启动之后去等（下文[时钟装配](#时钟装配)的窄带） | 「钟比中心用过的最晚时刻早」 |

clock 插件启动时仍按自己的判定再核一次回拨（[时钟装配](#时钟装配)）；那时迁移已跑过，回拨就走「撤除 ⇒ 恢复快照」。**迁移前先核**是为了让「钟倒退了」这一种失败不碰数据，少一条依赖恢复成功的路径；两处判据同出 clock 包，不另立第二条规则。

**对存储提供者的要求**（R-U，与 [storage-sql「属主实例」](../../packages/infra/storage-sql/design.md#属主实例排他迁移前只读核对升级快照与确认)逐条互指——该节点**已设计、源码尚无**，[实施缺口](#实施缺口与消费者影响)）：

| # | 要求 | 对应 |
| --- | --- | --- |
| R-U1 | 迁移与任何写之前，在**一次只读事务**里跑装配给定的核对；任一不过 ⇒ 不写任何东西、以具名错误抛出 ⇒ 启动失败 | PF-017 §6.6、§6.9、§6.10 |
| R-U2 | 迁移登记在只读事务里可读（已跑过的迁移名与次序）；空库读作空序列，**读不到不当作空**——不可用只以 `StorageUnavailable` 到达（协议 P-8） | 同上；与 [S-28](../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) ⑦「读不到绝不当作还没有」同一口径 |
| R-U3 | sqlite：有待跑迁移时，在第一条迁移之前建立库的**一致快照**，含已提交但还在预写日志里的内容；首次启动（库不存在）的快照就是「库不存在」这件事。快照与库同一文件系统、权限同库文件；磁盘要多容纳一份库的大小（运维约定） | PF-017 §6.9 |
| R-U4 | 快照确认之前的任何失败——本插件自己的迁移失败，或之后别的 fiber 失败使本插件被撤——⇒ 关闭全部句柄之后**恢复快照**：恢复后的库与快照等价，附属文件不带入快照之后的任何写；恢复以替换完成，中途断电不留半个文件。首次启动的恢复即删除本次建出的库文件与附属文件，下一次启动仍是第一次（与 S-28 ③ 一致） | PF-017 §6.9；S-28 ③ |
| R-U5 | 快照确认之前一直留在磁盘上，**它的存在就是「一次升级尚未确认」**：打开库之前先看有没有遗留快照，有就先恢复 | PF-017 §6.9（启动中途断电也是「起不来」） |
| R-U6 | 确认：本节点在全部 fiber `ACTIVE` 之后、放行开闸之前调用一次 `confirmUpgrade(config)`（候选名，storage-sql 包导出，**不进存储协议**），删除快照且目录落盘之后才返回；删除成功才算确认，报错时快照须仍在（随后的恢复要用它）；确认之后的撤除不再恢复 | PF-017 §6.9 |
| R-U7 | pg：全部待跑迁移在**一个事务**里提交或无痕 | PF-017 §6.9；Kysely `Migrator` 在 pg 上是否把整批包进一个事务**待核** |
| R-U8 | 被占、核对不过、建快照失败、恢复失败各是**具名的启动失败**，不折成 `StorageUnavailable`；**恢复失败时快照不删**，说明里写出它的位置，下一次启动按 R-U5 再试。**撤除路径上的恢复失败内核不上抛**（basis [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)：只记日志，`fiber.dispose()` 照常 resolve），所以本节点每次逆序撤完都调一次 `pendingUpgrade(config)`（候选名，storage-sql 包导出）回头看磁盘：仍有快照即「升级未确认：恢复失败，快照在 X」 | PF-017 §6.6「告诉运维者差的是哪一样」 |

恢复同时撤回失败那次启动写过的 `clock_lease`：那次启动的一切写都随之消失，没有任何留下来的事实用过被撤回的时刻，所以「不用比中心用过的最晚时刻更早的时刻」对留下来的数据仍成立。

| | 本节点在 `boot()` 里自己复制与恢复库文件（落选） | **快照的建立、恢复与遗留检查全归存储提供者，本节点只给核对、只调确认（选）** |
| --- | --- | --- |
| 最强论证 | 不改 storage-sql；整个升级在一处代码里看得见 | 「库是一个文件」「预写日志里还有已提交的内容」「pg 没有文件」只有存储提供者知道；装配知道了就是胶水拥有存储机制（[红线](../../AGENTS.md#红线)），换 pg 整段作废 |
| 弱点 | 同左 | storage-sql 的设计与源码都要改（R-U1～R-U8 全是新增）；确认要一个存储协议之外的导出函数。置信度：**中高** |

确认放在哪、开闸与它谁先谁后，见下一节[两步开闸](#两步开闸就绪与开闸分开)。

**自构的四条反证**：
(a) 迁移跑完，clock 启动时检出回拨（或入口层端口被占）⇒ 逆序全撤 ⇒ storage-sql 撤除时恢复快照 ⇒ 库回到升级前、迁移登记仍是旧序列 ⇒ 旧版本的只读核对通过、照常能起。成立。
(b) 首次启动：入口层铸出标识、端口已绑；确认之前进程被杀 ⇒ 下一次启动见遗留快照「库不存在」⇒ 删库 ⇒ 重铸出另一个标识。要成为反例，得有人在这之前读到过第一个标识，或有一次对外提交随恢复消失——但入口层的闸在 `openSignal` 兑现之前关着、运维面在 `serving` 之前不答，兑现又在确认之后：**反证不成立**。非首次启动同理，确认之前没有对外提交可丢。残余落在确认之后，见缺口 U-4。
(c) 两个进程同时对同一份库启动：A 建快照、迁移；B 的只读核对读到 A 迁移到一半的登记，或在 A 恢复时握着被替换掉的文件。本节点自己挡不住（多实例是 [PF-017 非目标](../../../product/PF-017-governance-center-as-deployable-application/design.md#非目标)，运维面的残留套接字检查在迁移之后才跑）；挡它的是存储提供者的属主独占——插件体第一步取、撤除最后一步放、随进程死亡释放，B 在第一步即「被占」（[storage-sql 交错 (a)(b)](../../packages/infra/storage-sql/design.md#自构的交错)）。**已设计、源码尚无**，sqlite 那一半待核，缺口 U-2。
(d) pg：迁移事务已提交，之后入口层端口被占 ⇒ 撤不回。R-U7 只给迁移本身的原子：pg 上「迁移单事务」成立，「迁移后装配失败回滚」不成立——**PF-017 §6.9 在 pg 上本程不兑现**，显式缺口 U-3，pg 第一次跑之前定手段。
(a) 由 [verification](verification.md#证据义务) 的 `assembly.upgrade-restore-on-boot-failure` 真跑；(b) 的反面由 `assembly.no-commit-before-open` 演练；(c) 由 storage-sql 的 `upgrade.exclusive-owner`（两个子进程真跑）证，本节点另加两进程同时 `boot()` 的装配演练；(d) 眼下写不出会通过的测试。两者都记在 [verification 覆盖缺口](verification.md#覆盖缺口)。

### 两步开闸：就绪与开闸分开

入口层开闸就是中心「起来了」（[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)），确认快照就是升级的不可回退点（R-U6）。两者做不成一个原子动作；本节点把次序定成**先确认、后开闸**，开闸有没有发生由有界地等 `serving` 判定：

```text
全部八条 fiber ACTIVE   入口层：端口已绑、闸关着、标识就绪、钟已读到；运维面：套接字已绑、不答
  ↓ 确认快照（R-U6）     失败 ⇒ 拒绝 openSignal ⇒ 逆序全撤 ⇒ storage 撤除时恢复快照 ⇒ 启动失败
  ↓ 兑现 openSignal      入口层的续延：再读钟 → emit serving → 开闸
  ↓ 等 serving（有界）    收到 ⇒ boot() 返回成功；超界 ⇒ 逆序全撤、启动失败，快照已确认、不恢复（U-4）
```

- **`openSignal`**（候选名）是本节点在装入口层之前构造的一个 Promise，经入口层 config 传入；它是运行时对象，只能由装配在装载时构造，不来自环境变量。入口层插件体**不** `await` 它：插件体不返回，入口层就停在 `LOADING`，本节点等不到「全部 `ACTIVE`」，放行永不发生——入口层节点[就绪与开门为什么分两步](../../packages/tenancy/governance-center-entry/design.md#就绪与开门为什么分两步)。
- **开闸之前没有任何对外提交**：入口层的闸关着、连接一律关闭不答；运维面在 `serving` 之前不答；其余 fiber 没有自己的对外入口。确认之前的写只有启动自身的写——迁移、`clock_lease`、首次启动铸的中心标识——没有人读到过它们，恢复快照把它们一起撤回（反证 (b)）。
- **确认失败**：不兑现，以拒绝结束 `openSignal`（入口层的续延吸收这次拒绝，闸保持关着）⇒ 逆序全撤 ⇒ storage-sql 撤除时恢复快照（R-U4）⇒ 启动失败，说明写「升级确认失败」。
- **确认之后**：此后的进程死亡按「升级已完成、中心停着」收场——库是新版本的完整数据，没有写到一半的东西；下一次用同一版本启动没有遗留快照、没有待跑迁移，照常起来。旧版本起不来是升级完成的正常后果，不是 §6.9 说的「升级到一半」。
- **本节点对入口层的要求**：兑现之后到开闸，除进程死亡外**不要有让中心起不来的失败支**——那一段在确认之后，失败就是「库已升级、中心没起来、旧版本也起不来」。入口层节点在开闸那一刻再读一次钟、超界即放弃开闸（该节点「`startedAt` 开门那一刻再读一次」一表与其 N-12）：那一支正落在这一段里，即 U-4——已接受的残余情形（裁 (b)）。
- **`boot()` 在兑现之后有界地等 `serving`**：入口层在开闸之前已是 `ACTIVE`，开闸那一刻的失败不能再让它 `FAILED`，本节点只能从「等不到 `serving`」得知（入口层节点 N-12）。
  本节点在装入口层之前，在根 Context 上登记一个 `serving` 通知的监听（只记录、不做控制；`emit` 同步派发，[`async-control-not-bail`](../../../basis/cordis/async-control-not-bail.md)），兑现之后等它，上界 = `clockReadyTimeoutMs` 加 1 s（候选常量，盖住入口层开闸时那一次再读钟的上界）。
  等到 ⇒ `boot()` 返回成功。超界 ⇒ **启动失败**，说明点名原因是钟、写「钟读不到，重启即可」，逆序全撤；**快照不恢复——它在兑现之前已确认、已不存在**（下表）。这一支就是 U-4，**已接受的残余情形（裁 (b)）**：库已是新版本的完整数据、没有已确认的提交丢失，钟可读只是暂时条件，用同一版本重启即可照常起来；老版本不能再起。
  监听随根 Context 的撤除收回（**假设**，与入口层节点「`ctx.on` 经 effect 纳管」同一条，须按 source-check 取证）。

| | 确认挪到收到 `serving` 之后，等不到 `serving` 即恢复快照（落选） | **确认留在兑现之前；等不到 `serving` 即启动失败、不恢复（选）** |
| --- | --- | --- |
| 最强论证 | 开闸那一刻的失败也撤得回：U-4 那一支上 §6.9 成立，旧版本照常能起 | 确认之前没有对外提交可丢；已经答复客户端「成了」的写，没有一条会随恢复消失（PF-017 §6.8「已确认的都在」） |
| 弱点 | `serving` 发出后入口层随即开闸，确认（一次异步删除）完成之前已可能答复过提交：确认失败或进程恰在此刻死亡 ⇒ 下一次启动见遗留快照、恢复 ⇒ 丢掉答复过的写——U-1 的窗口原样回来，且比 U-4 更糟（丢事实，而不是「旧版本起不来」） | 开闸那一刻的失败撤不回（U-4）：库已升级、中心没起来、旧版本起不来；作为残余情形已接受（裁 (b)），重启即可。置信度：**中高** |
- **换代重跑**：`openSignal` 兑现之后保持兑现；入口层之后因参与方换代而重跑时，新插件体就绪即开闸（快照早已确认），本节点不再参与。

| | 装入口层之前确认（落选） | 全部 `ACTIVE` 之后确认，入口层在插件体里就开闸（落选） | 在入口层的 `serving` 通知里确认（落选） | **全部 `ACTIVE` 之后确认，确认之后才放行开闸（选）** |
| --- | --- | --- | --- | --- |
| 最强论证 | 没有「已开闸、未确认」的窗口 | 入口层不用改；清单上每一步失败都撤得回 | 通知同步派发、在开闸之前到达，窗口为零 | 清单上每一步失败都撤得回（含入口层端口被占、TLS 材料不合、读不到标识这几种最常见的运维错误），**且**确认之前没有对外提交可丢 |
| 弱点 | 入口层自己的失败都在确认之后：升级了的库撤不回，旧版本起不来——§6.9 在最常见的失败上不成立 | 开闸到确认之间有窗口：窗口里崩溃，恢复快照丢掉窗口里答复过的提交，首次启动还会重铸已被人读到的标识 | 拿通知做控制：确认失败时否决不了开闸（`emit` 丢弃返回值）；装配挂到入口层的一条内部通知上 | 入口层 config 多一个运行时对象；开闸挪到插件体之外的续延里，那里的失败不能让 fiber `FAILED`，本节点要等 `serving` 才知道闸开了；确认之后到开闸仍有一段（U-4 是入口层在这一段里的失败支）。置信度：**中高** |

| | 首次启动的铸造放在 `openSignal` 兑现之后（落选） | **铸造留在入口层插件体里、确认之前（选）** |
| --- | --- | --- |
| 最强论证 | 标识在确认之后才写，恢复快照永远撤不到它 | 读或铸失败（存储不可用、读回的形状不合）⇒ 插件体抛出 ⇒ `FAILED` ⇒ 启动失败的形态由内核给、快照照常恢复；公开体检的固定字节在开闸之前就备好 |
| 弱点 | 铸造变成确认之后的一个失败支（写失败 ⇒ 库已升级、中心没起来），正是上面要求那一段不该有的；续延里的失败不能让 fiber `FAILED` | 首次启动中途失败时，铸过的标识随快照撤回、下一次重铸出另一个值。**不改语义**：首次启动的库里除本次待跑的迁移外没有既有数据，恢复快照等于回到空库、下一次启动仍是第一次（R-U4、[S-28](../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) ③）；开闸之前没有任何人读到过那个值，重铸即同一语义。置信度：**高** |

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
- **启动期两种失败都是抛出 ⇒ fiber `FAILED` ⇒ 整个装配启动失败**：① 启动判定那次写失败（`StorageUnavailable`／`StorageDefect`）；② **检出回拨**（`wall < written_at`）——源码抛 `ClockRollbackDetected`。回拨是环境错误，与「打不开库即启动失败」同一政策，不半开着提供一个永远 `'unavailable'` 的时钟。**运行期**的「崩溃后快速重启落在旧租约窗口内」「续约写失败」仍是 `now()` 返回 `'unavailable'`——那是抖动，不是环境错误；AI 映射 `storage-unavailable`、OG 映射 `unavailable`，入口层再映射成线上的 `unavailable`，本节点不介入。
- **启动成功以钟可读为条件**（[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)）：崩溃后快速重启落在旧租约窗口里时，`now()` 至多一个租约宽度答 `'unavailable'`；入口层在开闸前等它可读，上界 `clockReadyTimeoutMs` 由本节点给、必须大于 clock 包导出的 `LEASE_WIDTH_MS`（[其余 config](#其余-config候选变量名)），所以快速重启只是起得慢一点，不会启动失败；超界仍读不到才是启动失败。
- **迁移之前还有一次只读的回拨核对**：`clockPreflight()`（候选名，[clock「迁移前的只读回拨核对」](../../packages/infra/clock/design.md#迁移前的只读回拨核对)，**已设计、源码尚无**），判据与 clock 启动判定同一个纯函数，本节点放进 storage-sql 的 `upgrade.checks`（[升级的整体性](#升级的整体性迁移前只读核对快照与确认)）；clock 插件自己的启动判定照旧，迁移之后检出回拨就走「全撤 ⇒ 恢复快照」。
- **启动时的窄带**（[clock「启动时的租约窗口」](../../packages/infra/clock/design.md#启动时的租约窗口与入口层等钟)的读法）：上一次是崩溃退出、且启动时的回拨幅度小于租约宽度时，clock 分不出「回拨」与「快速重启」，按快速重启**等墙钟追上用过的最晚时刻再起，不拒起**；[PF-017 §6.10](../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走) 第 1 行「启动时钟比它早就不起来」在这一窄带里读作「追上之前不起来」——「不用比用过的最晚时刻更早的时刻」仍成立。上一次是干净撤除时，任何回拨都是确定回拨、启动失败。等待至多一个租约宽度，落在 `clockReadyTimeoutMs` 之内。
- **运行中钟往回倒**：[S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 末行把它定为装配给——时钟提供者在运行中检出回拨、让 `now()` 答 `'unavailable'`，入口层据此答 `unavailable`、运维面的 `clockSane` 答 `false`（[PF-017 §6.10](../../../product/PF-017-governance-center-as-deployable-application/design.md#610-时间不能倒着走)「开着时往回倒」那一行）。**本节点转交 `infra/clock`**：它的 `now()` 每次现读墙钟、与用过的最晚时刻比对，早于它即答 `'unavailable'` 直到追上（[clock「运行中回拨」](../../packages/infra/clock/design.md#运行中回拨每次现读墙钟比对用过的最晚时刻)）——**已设计、源码尚无**（已建包的 `now()` 仍按单调钟推算，与 governance-center-entry 的 N-5 同一件事）。
- **测试装配不用本节点的时钟**：需要前推时间的演练（AI S-41、OG S-47）用 `core/offer-expiry` `./testing` 的 `testClock(start)`（源码已有：`advance` 只前推、`setUnavailable`）经 kernel-basis 的 `bootAssembly` 作为 `services` 传入；那不是本节点的清单。
- **租约表被外部删除**无法在节点内防御（[clock 覆盖缺口](../../packages/infra/clock/verification.md#覆盖缺口)）：本节点把它写成运维约定——库文件与其中 `clock_lease` 一行不得手工改动；没有证据形式。

## 密钥装配：两对 Ed25519 密钥作为部署配置输入

**两对密钥、四份 PEM**：`activation`（私钥 → `account-registration`，公钥 → `account-identity`）、`purge`（私钥 → `organization-governance`，公钥 → `account-identity`）。
形式与「不在启动时生成、跨重启不变」的前提归 [identity-values 节点](../../packages/core/identity-values/design.md#依赖作用域与绑定)；本节点定**从哪读、给谁、缺了怎么办、配没配对**。

**这四份 PEM 就是本装配对 [PF-017 部署密钥](../../../product/PF-017-governance-center-as-deployable-application/design.md#部署密钥)的兑现形式**（PF-017 decisions 推导 12 以「技术侧需要一套部署级秘密」为前提，就是这一套）。
完整体检的 `deploymentKeyPresent`／`deploymentKeyComplete` 是「启动时载入的结果」（[S-26](../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检)）：四份都有来源即「在」，四份都合形状且两对都配对即「完整」；任一不成立本来就启动失败，
所以本节点在配对自检通过之后给运维面的 config 传字面 `{ present: true, complete: true }`，**不传任何 PEM**。入口层的 TLS 证书链与私钥**不是**部署密钥（[S-3](../../../spec/compositions/governance-center-entry/v1/contract.md#s-3-本契约明确不承诺什么)），不算进这两项。

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

- 私钥只出现在 `account-registration` 与 `organization-governance` 两个 config 对象里，公钥只出现在 `account-identity` 的 config 里；入口层的 TLS 私钥只出现在入口层的 config 里，运维面的 config 里没有任何 PEM；本节点**不 `provide`、不 `mixin` 任何持钥服务**，启动失败的结构化记录只写变量名，不写值。
- **但「不进 ctx」这句话不成立**：每个持钥插件的 config 挂在它自己的 fiber 上，同进程任何拿到根 `Context` 的代码都能沿 fiber 树读到它。单进程内没有硬隔离——「私钥不外泄」是装配纪律，[identity-values 覆盖缺口](../../packages/core/identity-values/verification.md#覆盖缺口)已明写没有可机检的完整形式。
- 本节点给的证据因此**只到两件事**：config 对象里 PEM 字段的归属恰如上表；服务 store 里没有任何含 PEM 文本的值（[verification](verification.md#证据义务)）。**不声称**别的代码读不到。

### `keygen` 与重生的后果

- 第一程是一个导出函数（候选 `generateKeyFiles(dir)`）：调 `generateHandoffKeyPair()` 两次，写四份 PEM 文件（`0600`），已有文件时拒绝覆盖；不读任何配置、不连库。命令形态（`tenancy-host keygen`）随进程形态一起定——[PF-017 §8](../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖) 把「命令怎么拼」交给技术设计，本版未定。
- **本版不轮换。**重生密钥等于换钥：已签发、尚未核实的凭证一律核不过——注册主链两步之间重启并换钥 ⇒ ③ `warrant-invalid` ⇒ `interrupted`，重来会重新产出；清除链两步之间换钥 ⇒ ② `purge-warrant-invalid`（缺陷型）⇒ 重扫时 ① 幂等再签。**两条都是契约已定义的收场，不需要迁移期**；换钥须在进程停止时做，运行中换钥的语义本版不定义。

### 其余 config（候选变量名）

| 变量 | 给谁 | 解析 | 缺或非法 |
| --- | --- | --- | --- |
| `OMNE_TENANCY_UNACTIVATED_RETENTION` | AI `unactivatedRetention` | 正整数毫秒或 ISO 8601 时长，用 offer-expiry 的 `parseOfferTtl`（它就是 `Duration` 的解析器；名字带 offer 是该节点的事，本节点不自造第二个解析器） | 缺 ⇒ 启动失败（契约 S-39「取不到 ⇒ `storage-unavailable`」那一支在 AI 设计下不可达）；非正 ⇒ AI Config 拒 ⇒ 启动失败 |
| `OMNE_TENANCY_INVITATION_TTL_DEFAULT`、`OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT`、`OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION` | OG 三项 | 同上 | 缺或非正 ⇒ 启动失败（[OE S-17 第 4 行](../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证)：在 OG 加载配置那一刻校验，本节点只传值） |
| `OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT`、`OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT` | 只给运维面的 `deploymentParameters`（PF-003 的两项，本版**没有消费它们的契约**，入口契约 G-4） | 同上 | 缺或非正 ⇒ 启动失败——照样要值、照样校验、照样在完整体检里可见（[S-26](../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检)） |
| `OMNE_TENANCY_CLOCK_READY_TIMEOUT` | 入口层 `clockReadyTimeoutMs`（候选名）：启动时等中心的钟可读的上界（[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)「超过承载装配定的界仍读不到 ⇒ 启动失败」的那个界） | 同上（`parseOfferTtl`） | 缺 ⇒ 启动失败；**不大于 clock 包的租约宽度**（源码已有导出 `LEASE_WIDTH_MS`，候选值 10 s）⇒ 装配层配置错误、启动失败——崩溃后快速重启落在租约窗口里时钟至多这么久读不到，界小于它，快速重启就必然启动失败（[governance-center-entry「谁来等钟」](../../packages/tenancy/governance-center-entry/design.md#中心标识版本与启动时刻怎么到达运维面)） |
| `OMNE_TENANCY_CREDENTIAL_POLICY` | AI `credentialPolicy` | JSON 文本 → 对象。**文本→值归装配，值→形状归 credential-verification**（它的 `checkPolicy` 对不合形状的政策给 `unavailable` ⇒ AI `credential-rejected`） | **缺 ⇒ 传 `undefined`，不是启动失败**——契约 S-27 定的收场（S-13 ② 一律 `credential-rejected`）；JSON 解析失败 ⇒ 启动失败（那是装配层的配置错误，不是「取不到」） |
| scrypt 参数 | credential-verification | 该节点定形状 | 非法 ⇒ 启动失败 |

**解析与校验分两层但一个收场**：装配只做「文本 → 值」（用各 owner 包已有的解析器，不自造）与跨插件的配对自检，语义校验（为正、密钥类型、方言合法）归各插件 Config；任一失败都是启动失败。

**五项[部署参数](../../../product/PF-017-governance-center-as-deployable-application/design.md#部署参数)只解析一次**：`unactivatedRetention`、`invitationTtlDefault`、`affiliationRequestTtlDefault` 与上表 PF-003 两项，同一组值既传给 AI／OG，也原样传给运维面的 `deploymentParameters`——完整体检显示的就是在生效的那一组（[S-26](../../../spec/compositions/governance-center-entry/v1/contract.md#s-26-完整体检)）。`teamCreationKeyRetention` 与凭据政策**不是**部署参数，不传给运维面。

## 入口层与运维面的装配

两个插件的设计、inject、装卸与存储要求归 [governance-center-entry 节点](../../packages/tenancy/governance-center-entry/design.md)；该节点[「归装配」](../../packages/tenancy/governance-center-entry/design.md#归装配的事项)点名的七项在这里逐项落下（承接表另有逐行对照）。

| 入口层 config（候选字段） | 来源（候选变量名） | 缺或非法 |
| --- | --- | --- |
| `listen`（地址与端口） | `OMNE_TENANCY_ENTRY_LISTEN`，`host:port` | 缺 ⇒ 启动失败，**不设默认端口**；端口占用 ⇒ 入口层插件体抛出 ⇒ 启动失败 |
| `tls`（证书链与私钥 PEM） | `OMNE_TENANCY_ENTRY_TLS_CERT_CHAIN_PEM` / `…_FILE`、`OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM` / `…_FILE` | **沿密钥的来源规矩**：每份恰一个来源，两个都缺或都设 ⇒ 启动失败；私钥文件对 group／other 可读 ⇒ 启动失败；形状由入口层 Config 与插件体核。它是部署配置输入，[不是部署密钥](../../packages/tenancy/governance-center-entry/design.md#防冒充中心一侧的手段与材料)，不进配对自检 |
| `version`（中心所装版本的标识） | 构建常量：本应用构建时写入的版本标识（候选：`apps/tenancy-host` 的包版本），**不是环境变量** | 缺即构建错误 |
| `drainTimeoutMs`（停机排空上界） | 本节点候选常量 10 s，**不是环境变量**；须小于撤除总超时（下行） | 构造时核「排空 < 总超时」，不成立即启动失败 |
| `clockReadyTimeoutMs`（启动等钟可读的上界） | `OMNE_TENANCY_CLOCK_READY_TIMEOUT`（[其余 config](#其余-config候选变量名) 表） | 缺或不大于 `LEASE_WIDTH_MS` ⇒ 启动失败；运行中超界 ⇒ 入口层插件体抛出 ⇒ 启动失败，说明点名是钟 |
| `openSignal`（放行开闸） | `boot()` 在装入口层之前构造的 Promise，**不是环境变量**；快照确认成功后兑现，确认失败以拒绝结束（[两步开闸](#两步开闸就绪与开闸分开)） | 缺或不是 thenable ⇒ 入口层 Config 拒 ⇒ 启动失败（只可能是本节点的缺陷） |

| 运维面 config（候选字段） | 来源 | 缺或非法 |
| --- | --- | --- |
| `socketDirectory` | `OMNE_TENANCY_OPS_SOCKET_DIR`，绝对路径 | 缺 ⇒ 启动失败；目录权限过宽、残留套接字有人在听 ⇒ 运维面插件体抛出 ⇒ 启动失败 |
| `deploymentKey` | 配对自检通过后的字面 `{ present: true, complete: true }`（[密钥装配](#密钥装配两对-ed25519-密钥作为部署配置输入)） | 不会不是——自检不过根本起不了 Context |
| `deploymentParameters` | 上节五项，与传给 AI／OG 的同一组值 | 缺一或非正 ⇒ 启动失败 |

- **撤除总超时**：本节点候选常量 30 s；入口层的排空上界 10 s 必须小于它，给其余七条 fiber 的撤除留出余量。两个值都是候选，落包时定。
- **日志汇**：两个插件的工程记录、各节点的告警与启动失败说明，都经 Cordis 的 `ctx.logger`（clock 源码已这么用）写出；本节点定它的输出目标——候选：进程标准错误流，每条一行结构化 JSON，落文件、轮转与保留由运维的进程管理器定。
  `ctx.logger` 在 4.0.4 里由谁提供、能否换成结构化写出器是**假设，须按 source-check 取证**；字段形状等[全局观测契约](../../../foundation/observability-and-logging/requirements.md)。
  起 Context 之前的失败（config、配对自检）没有 `ctx`，由 `boot()` 的调用方直接写同一条流、同一形状。
- **运维面的 config 里没有任何治理服务或其句柄**：本节点不经 config 给它传别的东西，「运维者没有门」在装配这一侧只剩这一条要守（[S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「运维者没有门」行；导入白名单归该节点与 `tools/ts-checks`）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
| --- | --- | --- | --- |
| 五份契约的服务面 | 根 Context 里各一份 `provide`；消费者按服务名 inject 或调用时解析。**本节点自己不解析任何服务面**；除 provider 之间的 inject 外，服务面只被入口层与运维面两个插件 inject——进程外的调用方只经入口层到达它们 | 换提供者 = 改装载清单；消费者按 basis [`plugin-body-reruns-on-provider-change`](../../../basis/cordis/plugin-body-reruns-on-provider-change.md) 重跑（probe 已过） | 缺席 ⇒ 依赖它的 fiber 在 `ctx.plugin()` 返回时即 `PENDING` ⇒ 本节点判为清单错误 ⇒ 撤已装、启动失败（[装载清单](#装载清单与顺序)）；不等待、不设常量 |
| `storage`（协议） | `infra/storage-sql` 一份 | 同上 | 本版不换代；换代 ⇒ AI、OG、clock、入口层、运维面重跑，在途调用握着旧实例按各自提交收场 |
| `clock`（S-16 形状） | `infra/clock` 一份 | 同上 | 本版不换代；换代 ⇒ AI、OG、入口层、运维面重跑 |
| `composition.governance-center-entry/v1`（`candidate`） | `tenancy/governance-center-entry` 两个插件，各一份；它们不 provide，没有消费者 inject 它们 | 换实现 = 改装载清单；它们消费的任一面换代 ⇒ 入口层卸载重跑、门随之关上再开（[该节点依赖表](../../packages/tenancy/governance-center-entry/design.md#依赖作用域与绑定)） | 它们消费的面缺席 ⇒ 装它们那一步即 `PENDING` ⇒ 清单错误、启动失败 |
| `core/kernel-basis` | `definePlugin`（各插件用）、`FIBER_STATE`（同步查 `PENDING`）；**`./testing` 不被本节点产品代码 import**（`bootAssembly` 是测试装配，本节点的 `boot()` 是生产装配——两者形状相同、责任不同） | 随包版本 | — |
| `core/identity-values` | `generateHandoffKeyPair`（`keygen`）、`loadSigningKey`／`loadVerificationKey`／`issueHandoffWarrant`／`verifyHandoffWarrant`（配对自检） | 随包版本 | — |
| `core/offer-expiry` | `parseOfferTtl`（config 解析） | 随包版本 | — |
| AI、OG、clock、governance-center-entry 四个包导出的迁移片段 | 合成进一份 `MigrationProvider`（[合成规则](#合成规则)） | 随各包版本；被引用列改名 ⇒ 合成参数要改（缓解见[迁移的所有权](#迁移的所有权)）；编号名只追加（M-9） | AI／OG 的片段第二程才有，`governanceCenterMigration` 随那个包建立才有；在此之前本节点的迁移合成只能合 `clockLeaseMigration` |
| clock 包的 `clockPreflight()`（候选导出） | 放进 storage-sql 的 `upgrade.checks`（[升级的整体性](#升级的整体性迁移前只读核对快照与确认)） | 随包版本 | **已设计、源码尚无**：落包之前迁移前只核数据格式版本，回拨只在 clock 启动时检出、靠恢复快照撤回 |
| storage-sql 包的 config `upgrade: { checks }`、`confirmUpgrade(config)`、`pendingUpgrade(config)`（候选名） | `upgrade` 在装 `storage` 时显式开启；`confirmUpgrade` 在全部 fiber `ACTIVE` 之后、兑现 `openSignal` 之前调一次（R-U6）；`pendingUpgrade` 在每一次逆序撤完之后调一次（R-U8） | 随包版本 | **已设计、源码尚无**：源码 `openStorage` 仍是「打开 → ping → 迁移」 |
| Cordis `inject` | **本节点自己不 inject**——它不是插件，是起 Context 的那段代码 | — | — |

**配置错误政策**：本节点无自己的插件 config；它实现的是政策的**装配层那一半**——来源缺失／二义／文件不可读／JSON 不合法／方言不认识／密钥不配对／排空上界不小于总超时／等钟上界不大于租约宽度 ⇒ 在装任何插件之前退出；
其余（形状、为正、`:memory:`、TLS 材料、套接字目录）由各插件 Config 或插件体拒 ⇒ fiber `FAILED` ⇒ 全撤退出；清单错误（`PENDING`）⇒ 全撤退出；迁移前只读核对不过 ⇒ storage-sql 插件体抛出 ⇒ 退出；入口层等钟超界 ⇒ 入口层插件体抛出 ⇒ 全撤退出。同一收场：**启动失败并说明原因**，没有运行期具名拒绝，与 governance-center-entry 节点同一政策。

## 状态、并发与失败映射

**本节点无领域状态、无提交点、无锁。**运行时状态只有：一个 Context、八条 fiber 的句柄、`openSignal` 与它的兑现／拒绝两个把手、一个「已进入撤除」的开关。全部提交点在 AI／OG 的 `storage.write` 与入口层启动时那一次读或铸里，全部冲突裁决在存储的行锁、唯一约束与外键上（[core/storage](../../packages/core/storage/design.md#状态并发与失败映射)）。
升级快照的「未确认／已确认」是**存储提供者落在磁盘上的状态**（R-U5），不是本节点的内存状态——进程崩溃之后它照样说得出上一次启动有没有确认。

**启动失败**的精确含义：`boot()` 拒绝，已装的 fiber 已按逆序 `dispose()` 完毕（disposer 异常只记日志，basis [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)），快照未确认时已由存储提供者在撤除路径上恢复（sqlite：本次跑过的迁移随之撤回，库回到升级前；pg 见缺口 U-3），**撤完之后本节点调一次 `pendingUpgrade`**——撤除路径上的恢复失败内核只记日志、`dispose()` 照常 resolve，只有回头看磁盘才分得清「已恢复」与「恢复失败、快照仍在」（R-U8），后者单列为「升级未确认」阶段；
调用方（进程入口，形态待定；测试里是测试本身）据此退出非零，退出前落一条结构化记录，**告诉运维者差的是哪一样**（[PF-017 §6.6](../../../product/PF-017-governance-center-as-deployable-application/design.md#66-要么整个起来要么不起来)）：
失败的阶段（config 解析／配对自检／被占／遗留快照恢复／只读核对：格式版本或时钟回拨／建快照／迁移／哪条 fiber，入口层等钟超界单列为「钟读不到」／升级确认／确认之后开闸时钟读不到——说明写「钟读不到，重启即可」（U-4）／升级未确认：撤完之后 `pendingUpgrade` 仍见快照）、错误类型与消息（缺了哪个变量、哪个迁移名对不上、哪条 fiber），**不含任何 PEM 文本或 config 值**（[S-29](../../../spec/compositions/governance-center-entry/v1/contract.md#s-29-秘密不进任何输出) 把启动失败说明列在「任何输出」里）。
恢复快照本身失败时，记录里另写快照的位置，快照不删（R-U8）：插件体内的恢复失败由 storage-sql 以具名阶段抛出，撤除路径上的由 `pendingUpgrade` 回头看见。

**运行期失败**全部归提供者与契约：`storage` 不可用 ⇒ 各操作的「不可用」字面（经 `core/storage` 的 `mapStorageError`）；`StorageDefect` 与其他异常上抛——那是缺陷，本节点不捕获、不重试，让它在日志里可见（[OG](../../packages/tenancy/organization-governance/design.md#状态并发与失败映射)、[storage-sql 错误码映射](../../packages/infra/storage-sql/design.md#错误码映射表)）。**本节点没有 catch-all**。

**并发**：sqlite 一个写句柄 + 进程内写队列、读句柄独立——协议 P-12 的要求由 storage-sql 兑现；`scrypt` 的并发上限本版不限流。**跨进程**：本版一个进程；两个进程指向同一文件时 R-1～R-7 仍由 sqlite 文件锁与约束给，但 `clock` 跨进程不保证先后（投影 [Q-8](../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)），升级快照的建立与恢复要「同一份库同一时刻只有一个属主进程」，由 storage-sql 的属主独占兑现（插件体第一步取、撤除最后一步放、随进程死亡释放；**已设计、源码尚无**，缺口 U-2；多实例本是 PF-017 非目标）。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
| --- | --- | --- | --- |
| 读环境变量与密钥、TLS 文件，解析成八个 config 对象；**配对自检**；核「排空 < 总超时」 | 进程；内存 | 任一缺／二义／不可读／不合法／不配对 ⇒ 记录并拒绝，**尚未起 Context、未碰数据** | 随进程消失；密钥与证书文件是运维事实，不动；自检用的凭证不落任何地方 |
| 根 `Context` | 进程 | — | `dispose()` 末尾不再引用；Context 自身无外部资源 |
| `storage-sql` fiber（`upgrade` 守卫由本节点显式开启）：属主独占、遗留快照的恢复、只读核对、升级快照、库句柄、迁移、`provide('storage')`（R-U1～R-U8 **已设计、尚未实现**） | 该 fiber；`ACTIVE` 后可解析；**独占与快照归它拥有**，快照确认之前一直在磁盘上 | 被占／遗留快照恢复失败／只读核对不过 ⇒ 抛出具名阶段，**数据内容未碰**；打不开／建快照失败／迁移失败／PRAGMA 失败 ⇒ 抛出，关句柄后恢复快照 ⇒ `boot()` 拒绝（此时无其他 fiber） | 一个 effect 内：关准入 → 等在途事务各自提交或回滚 → 关句柄 → **快照未确认 ⇒ 恢复** → 放独占（[storage-sql 装卸表](../../packages/infra/storage-sql/design.md#成对的装载与撤除)）。**这一步的恢复失败内核只记日志**，本节点撤完之后调 `pendingUpgrade` 回头看磁盘（R-U8）；**保留**：库文件、全部已提交事实、迁移登记——快照未确认时保留的是升级前的那一份 |
| `clock` fiber：锚、启动判定写、`provide('clock')`、续约定时器 | 该 fiber | 启动判定写失败或检出回拨（`ClockRollbackDetected`）⇒ 抛出 ⇒ `boot()` 撤 `storage` 后拒绝 | 清定时器 → 等在途续约 → 收回租约的写（[clock 装卸表](../../packages/infra/clock/design.md#成对的装载与撤除)）；**本节点保证撤它时 `storage` 仍活**（见次序）。**保留**：`clock_lease` 行 |
| `credentials`、`accounts`／`logins`、四个治理面、`registration` 五条 fiber | 各 fiber；各自 `ACTIVE` 后可解析 | `ctx.plugin()` 返回即 `PENDING` ⇒ 清单错误；config 校验失败或插件体抛出 ⇒ `FAILED`——两者都 ⇒ `boot()` 逆序撤已装的 ⇒ 拒绝 | 服务从 store 消失；**在途调用跑完，按各自那一次 `storage` 提交收场**——内核不取消在途调用；撤除开始后新发起的 `storage` 调用得 `StorageUnavailable` ⇒ 各契约的「不可用」字面（机制在 storage-sql 的关准入）。**保留**：全部记录（契约 [AI S-28](../../../spec/capabilities/account-identity/v1/contract.md#s-28-依赖不可用撤除与重启时的在途归属)、[OG S-43](../../../spec/capabilities/organization-governance/v1/contract.md#s-43-依赖的提供者不可用)：没有只活在实例里的事实） |
| `governance-center-ops` fiber：三条通知的监听、本机套接字 | 该 fiber；装载后即可接连接，但只在 `serving` 与 `stopped` 之间作答（[该节点装卸表](../../packages/tenancy/governance-center-entry/design.md#成对的装载与撤除)） | 套接字目录权限不对、残留套接字有人在听、绑定失败 ⇒ 抛出 ⇒ `boot()` 逆序撤前六条 ⇒ 恢复快照 ⇒ 拒绝 | 停止接受 → 关闭连接 → 删套接字文件；`defectCount`、`startedAt` 随实例消失（契约：重启归零）。**本节点保证撤它时入口层已撤完** |
| `governance-center-entry` fiber：TLS 监听（闸关着）、读或铸中心标识（**首次启动的提交点**，[S-28](../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) ③）、等钟可读（上界 `clockReadyTimeoutMs`），然后插件体返回；开闸挂在 `openSignal` 的续延上 | 该 fiber；插件体返回即 `ACTIVE`，**此时仍不对外**——端口可达、连接一律关闭不答；开闸（即中心起来了，[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)）要等本节点兑现 `openSignal`（下两行） | 端口占用、TLS 材料不合、标识读不到或形状不合、**等钟超界** ⇒ 抛出 ⇒ `boot()` 逆序撤前七条 ⇒ 恢复快照（首次启动时连同刚铸的标识一起撤回，下一次启动仍是第一次；没有人读到过它）⇒ 拒绝，说明点名是哪一样 | 一个 effect 内停机三步：关闸并发 `stopped` → 不再接受连接 → 至多 `drainTimeoutMs` 等在途，到时销毁连接；在途的领域调用跑完、按各自那一次提交收场；**从未开闸就撤**（确认失败、兑现之前的任何撤除）⇒ 走该节点「未开门」那一支。**保留**：中心标识与全部治理事实在存储里 |
| 升级快照的确认（R-U6，`confirmUpgrade(config)`）；`serving` 监听（根 Context 上，装入口层之前登记） | `boot()`；全部 fiber `ACTIVE` 之后、兑现 `openSignal` 之前 | 确认失败（删不掉快照，快照仍在）⇒ 拒绝 `openSignal`、逆序全撤、恢复快照、拒绝 `boot()`——**闸从未开过**，没有对外提交随恢复消失 | 确认之后快照不复存在；此后的撤除都是普通停机，不恢复任何东西。监听随根 Context 收回（假设，见[两步开闸](#两步开闸就绪与开闸分开)） |
| 兑现 `openSignal`；等 `serving` | `boot()`；确认之后。入口层的续延开闸、发 `serving`，本节点收到即 `boot()` 返回成功 | 上界（`clockReadyTimeoutMs` + 1 s）内没等到 ⇒ 启动失败，说明写「钟读不到，重启即可」，逆序全撤，**不恢复**——快照已确认（U-4，已接受的残余情形（裁 (b)）；入口层节点 N-12 要本节点承接的就是这一等）；兑现之后进程死亡 ⇒ 升级已完成、中心停着，下一次同版本启动照常 | 兑现不可撤回：入口层之后换代重跑时就绪即开闸 |
| 进程信号处理（`SIGTERM`／`SIGINT` → `dispose()`） | **本版没有**：只有测试内嵌调用的 `boot()`／`dispose()`，没有独立进程；进程形态见 [architecture](architecture.md#拓扑与进程模型) | — | 有进程时：撤除完成后退出 0；**撤除总超时 30 s（候选常量）**，超时 ⇒ 记录未完成的 fiber 后退出非零 |

**撤除次序**：`dispose()` 按装载的**逆序**逐个 `await fiber.dispose()`：入口层 → 运维面 → AR → OG → AI → credentials → clock → storage。
入口层最先撤，它的停机三步在自己那个 effect 里有序完成（[S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「停机时先停收、再等在途、再关闭」行）；运维面在它之后撤，`stopped` 发出时运维面还在听，两张面同起同停。排空超时后仍在跑的领域调用不被取消，跑完、按各自那一次提交收场；`storage` 最后撤，它关准入之后才发起的存储调用得 `StorageUnavailable`，那件事就没有发生——没有半个（[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)）。
不直接 dispose 根 Context——那会让八条 fiber 的 disposer **并发**跑（子 fiber 的 dispose 是父的 effect，各 effect 并发驱动），
`clock` 收回租约的那次写可能撞上已关准入的 `storage` ⇒ 只记日志、租约留着、下次启动最多等一个租约宽度——不破正确性，但可避免。
逆序让每个 disposer 看到它依赖的服务仍活。**顺序只约束发起，不保证异步完成**——storage 的 disposer 自己在一个 effect 内组合了「关准入 → 等在途 → 关句柄」，本节点不替它排。

| | dispose 根 Context（落选） | **按清单逆序逐个 dispose（选）** |
| --- | --- | --- |
| 最强论证 | 一行；内核自己会带走全部子 fiber；**一个 disposer 挂住不拖累其他** | clock 的撤除写有活的 storage；入口层先停收、运维面后停答，两张面同起同停；第一个撤除失败的 fiber 可解释 |
| 弱点 | 并发撤除下 clock 撤除写大概率撞关闭的 storage；入口层还在排空时 storage 可能已关准入、运维面可能先于入口层停答；AI／OG 的在途调用与 storage 关准入之间无序（虽然各自收场仍正确） | **逆序 `await` 在某个 disposer 挂住时劣于并发撤除**——后面的 fiber 一个都撤不到，进程不退出。各 disposer 的等待各自有界（入口层排空 10 s、storage 的写锁重试 5 s、clock 的一次写），但本节点不能替它们担保；**总超时归本节点**，候选常量 30 s，超时 ⇒ 记录未完成的 fiber 后仍退出非零。多一份顺序知识；`bootAssembly` 已按同一形状写。置信度：**中高** |

**崩溃**（`SIGKILL`、断电）：什么都不跑。sqlite 由 WAL 恢复到最后一个完整提交（`synchronous=NORMAL` 下断电可能丢最后一段，[storage-sql](../../packages/infra/storage-sql/design.md#实施缺口与消费者影响)）；`clock_lease` 未收回 ⇒ 下次启动最多等一个租约宽度；领域层没有在途状态要恢复（两条动作链各自幂等，[AR](../../packages/tenancy/account-registration/design.md#状态并发与失败映射)）。

## 「归装配」的事项逐条承接

四个基础设施节点与五个 tenancy 节点（加两个 core 纯模块）各自写下的「归装配」，以及六份契约「装配给」表里的每一行（五份 `accepted`，外加 `composition.governance-center-entry/v1` 的 S-36，`candidate`），逐条在本节点的哪一行**承接**（本节点自己给）或**转交**（本节点装的某个提供者给，本节点只保证装了它、且只装一份）；承接不了的写明是缺口与 owner。

**客户端这条边上哪些由协议重新兑现，以入口契约 [S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 为准**：这条边只把调用方搬到进程外，领域没有拆开——靠「同一存储、同一提交、同一时钟」的行仍由本节点的装配给；
和调用方身份有关、和流向调用方的值有关的行由协议给，兑现者是 governance-center-entry。中心自身被拆开之后还要补的，是入口契约 G-8，不在本版。

| 来源 | 事项 | 本节点的承接或转交 | 状态 |
| --- | --- | --- | --- |
| [kernel-basis](../../packages/core/kernel-basis/design.md#能力到-cordis-的投影) | `definePlugin` 是「配置错误 ⇒ 启动失败」的唯一实现点 | 八个插件（含入口层与运维面）都经它定义；装配层只解析来源与核配对，形状归各 Config（[谁核形状](#谁核形状持钥插件的-config不是装配谁核配对装配)） | 已承接（设计） |
| 同上 | `./testing` 的 `bootAssembly` 只收调用方传入的服务；产品代码不得 import `./testing` | 本节点的 `boot()` 是生产装配，不 import `./testing`；静态检查候选（`tools/ts-checks` 现有三条规则**不含**这一条，须加一条） | 已承接；规则待加 |
| 同上 | basis 条目与共用主张的 probe 在 4.0.4 上通过 | 本节点依赖四条：basis [`plugin-throw-fails-fiber`](../../../basis/cordis/plugin-throw-fails-fiber.md)（启动失败机制）、basis [`inject-has-no-optional-form`](../../../basis/cordis/inject-has-no-optional-form.md)（`PENDING` 结构判定；入口层的门只在必需服务全 `ACTIVE` 时才开）、basis [`effect-disposal-concurrent-not-ordered`](../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)（为什么逆序逐个 dispose）、共用主张 `provide-is-effect-managed`（非 basis；部分失败时已 provide 的随 fiber 撤）；`bootAssembly` 的同步 `PENDING` 判定与本节点同形 | 已承接（probe 已过） |
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
| [AI S-30 第 1、2、4、5、7 行](../../packages/tenancy/account-identity/design.md#状态并发与失败映射)（R-1～R-3、R-6、R-7 + 过期事实） | 存储要求由装配选的提供者兑现；R-7 同一存储、同一约束域 | **转交** storage-sql 兑现 R-1～R-6（其 verification：sqlite 套件 C-1～C-15 已通过）；R-7 那条外键由本节点在合成时给出（`organization` 行）。领域没有拆开，这几行在客户端这条边上**不失效**，仍由装配给（[S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 开头） | 已转交／已承接（设计）；本节点的外键测试未开始 |
| [AI S-30 第 3 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证)（撤销之后立刻生效） | 单机：入口层与账号能力读同一个存储 | 单机那一半同上一行，本节点保证恰一个 `storage`；**客户端这条边上协议给**：入口契约 [S-15](../../../spec/compositions/governance-center-entry/v1/contract.md#s-15-δ--0每个请求现读入口不跨请求缓存) 中心一侧 δ = 0，**转交** governance-center-entry（[本节点约束第 1 条](../../packages/tenancy/governance-center-entry/design.md#本节点约束存储要求之外)：入口层不跨请求缓存） | 已转交（设计；契约 candidate）；证据 T-7 未开始 |
| [AI S-30 第 6 行](../../../spec/capabilities/account-identity/v1/contract.md#s-30-装配给的保证-vs-协议须给的保证) | 持有 AccountId 即可读——装配保证只在同一部署内传递 | **靠不暴露兑现**（S-36 该行）：入口契约 [S-24](../../../spec/compositions/governance-center-entry/v1/contract.md#s-24-有意不投影) 不投影 AI S-18，入口层不 inject `accounts`，线上任何 `AccountId` 都不作行事依据（[S-12](../../../spec/compositions/governance-center-entry/v1/contract.md#s-12-身份推导)）——**转交** governance-center-entry；本节点不给进程开别的对外面。经发邀请探知已知 `AccountId` 的存在与激活状态，是契约写明并接受的残余暴露 | 已转交（设计；契约 candidate）；证据 T-1 未开始 |
| [AI S-30 第 8 行 / S-22](../../packages/tenancy/account-identity/design.md#能力到-cordis-的投影) | `accounts.produce(` 的调用点只在 account-registration——**方法级**结构检查，owner 装配节点 | `tools/ts-checks` 的 `restricted-call-sites` 规则（源码已有：扫 `packages/` 里的 `.produce(`，只允许 `tenancy/account-registration` 与定义包；文本规则，自带「故意违反就失败」自测；接进 `pnpm run check`）。入口层包在 `packages/` 下，同在扫描范围内；客户端这条边上由入口契约 S-24 不投影 AI S-13、S-36 该行「结构上兑现」（契约 SC-1） | 已写；**尚未登记 evidence run，登记前不进绑定**；SC-1 新增的方法限定未开始 |
| [AI S-30 第 9 行 / AI 依赖表](../../packages/tenancy/account-identity/design.md#依赖作用域与绑定) | 两把公钥由装配下发；缺 ⇒ 启动失败；与私钥配对 | [密钥装配](#密钥装配两对-ed25519-密钥作为部署配置输入)：来源、归属、[配对自检](#配对自检起-context-之前签一次核一次)；AI 骨架已含 `activationVerificationKeyPem`／`purgeVerificationKeyPem` | 已承接（设计） |
| [AI verification](../../packages/tenancy/account-identity/verification.md#证据义务) | S-32 需可重启装配 + 可注入故障 `storage`；S-41 需可控 `clock`；S-43 第 2 支三节点真并发含两条交错 | S-32：`boot()` 两次同文件；故障注入与可控时钟走 `bootAssembly` 测试装配，不是本节点清单；S-43 第 2 支：本节点提供同一文件、同一外键的夹具 | 未开始 |
| [OG S-42 第 1 行](../../../spec/capabilities/organization-governance/v1/contract.md#s-42-装配给的保证-vs-协议须给的保证)（至少一位有效超管：同一存储对同一组织的成员写入序列化） | **转交** storage-sql 兑现 OG R-3a（`lockRow` 组织行；sqlite `BEGIN IMMEDIATE`）；本节点只保证恰一个 `storage` | 已转交（套件 C-4 已通过；OG S-48 真并发演练归 OG） |
| OG S-42 第 2 行（上级链不成环：判环读与写同提交） | **转交** storage-sql 兑现 OG R-3b（`lockSentinel`）与 R-3c；同上 | 已转交（C-5／C-6 已通过） |
| OG S-42 第 3 行（每账号至多一个个人组织：一一约束） | 本节点合成的迁移里的 `organization_owner_account_unique`（[迁移清单](#迁移清单候选列名逻辑名以各-owner-节点为准) `organization` 行）+ 转交 storage-sql 的 `UniqueViolation` 映射 | 已承接（设计）；`assembly.constraint-names-resolve` 未开始 |
| [OG S-42 第 4 行](../../packages/tenancy/organization-governance/design.md#s-53-单独一个服务名只给清除链) | `organization-purge` 只被 account-registration 解析——含 `ctx.get` 的结构检查，owner 装配节点 | 同 `restricted-call-sites`（它扫的是字符串 `'organization-purge'`，`ctx.get('organization-purge')` 一并覆盖）；装载清单那一半：`assembly.manifest-shape`。客户端这条边上：入口层不 inject、不引用 `organization-purge`，入口契约 S-24 不投影 OG S-53（S-36 该行「结构上兑现」） | 规则已写，run 未登记；清单测试未开始 |
| OG S-42 第 5、6 行（成员资格与当前租户身份的可见性：写入即可被下一次读看到） | **转交** storage-sql 兑现 OG R-3c／R-3d（提交内读写同源、只读快照）；同上。**客户端这条边上协议给**：入口契约 S-15 中心一侧 δ = 0，**转交** governance-center-entry（入口层每请求现读 OG S-26、S-36，不缓存） | 已转交（C-6／C-7 已通过；δ = 0 的证据 T-7 未开始） |
| OG S-42 第 7 行（邀约过期判定的时钟同源） | **转交** `infra/clock`；本节点保证恰一个 `clock`（[时钟装配](#时钟装配)第 1 条） | 已承接（设计） |
| [OG S-42 第 8、9 行](../../packages/tenancy/organization-governance/design.md#状态并发与失败映射) | 入口层先把 `LoginStateId` 换成身份值再调其余面；**它的面不得直接暴露为终端 API——这句话要写进装配节点** | **写在这里：本进程的五份契约服务面是能力间内部面，不得直接暴露为终端 API；进程对外只有两张面——入口层的客户端一面与运维面，后者没有任何治理路由。**核实身份的那道入口就是 **[governance-center-entry](../../packages/tenancy/governance-center-entry/design.md#能力到-cordis-的投影) 兑现的入口契约**：每个请求在第 ② 步现读 [AI S-17](../../../spec/capabilities/account-identity/v1/contract.md#s-17-校验登录状态) 认人（[S-11](../../../spec/compositions/governance-center-entry/v1/contract.md#s-11-认人)），身份值只从认人结果推出、`TenantId` 经 [OG S-36](../../../spec/capabilities/organization-governance/v1/contract.md#s-36-当前租户身份查询) 取（[S-12](../../../spec/compositions/governance-center-entry/v1/contract.md#s-12-身份推导)），四条没有授权前置的读面补授权（[S-13](../../../spec/compositions/governance-center-entry/v1/contract.md#s-13-补授权)）；这两行在客户端这条边上「协议给」（S-36「调用方身份——写操作／读面」两行）。本节点给的：只装这一个入口层、装在最后、进程里没有别的监听 | 已转交（设计；契约 candidate）；证据 T-3、T-6、T-10 未开始 |
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
| [AR 实施缺口](../../packages/tenancy/account-registration/design.md#实施缺口与消费者影响) | 注册入口（apps）须自己做表示层校验、不得透出 `identifier-held-by-expired-record` | **转交** governance-center-entry：入口契约就是那个注册入口（[S-2](../../../spec/compositions/governance-center-entry/v1/contract.md#s-2-参与方与精确承诺) AR 行、S-36「注册入口的义务」行）——表示层校验在 [S-19](../../../spec/compositions/governance-center-entry/v1/contract.md#s-19-免认人的两条路由注册登录)（载荷 Schema、`parseLoginIdentifier`、`credentials.parse`），`identifier-held-by-expired-record` 到达入口层即按缺陷答 `unavailable`；本节点给的：`credentials` 在入口层之前装好（入口层必需 inject 它） | 已转交（设计；契约 candidate）；证据 T-10、T-17 未开始 |
| [CV verification](../../packages/tenancy/credential-verification/verification.md#证据义务) | 换代演练：卸载本插件、装载另一实现，观察 AI 与 OG 的 fiber 不重跑 | `assembly.credentials-swap-no-rerun`（[verification](verification.md#证据义务)）；依赖 probe `inject-has-no-optional-form`（已过） | 未开始 |
| [CV 状态与并发](../../packages/tenancy/credential-verification/design.md#状态并发与失败映射) | `scrypt` 并发上限归装配（运维关注点） | 本版不限流 | 缺口，无正确性影响 |
| [identity-values 依赖表](../../packages/core/identity-values/design.md#依赖作用域与绑定) | 密钥由装配一次生成、持久保存、按节点下发；不在启动时生成；本版不轮换；公私钥配对 | `keygen` + 密钥装配 + 配对自检 | 已承接（设计） |
| [identity-values 覆盖缺口](../../packages/core/identity-values/verification.md#覆盖缺口) | 私钥不外泄无可机检证据 | 窄形式：config 归属与 store 无 PEM 的测试（[verification](verification.md#证据义务)）；完整形式仍无，且「不进 ctx」不成立（fiber.config 可达） | 部分 |
| [IV 第六节第 1、2 行](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)（三个标识部署内唯一；登录标识唯一、未激活也占用） | `account_pkey`、`organization_pkey`、`login_state_pkey`、`account_login_identifier_unique`（迁移清单）+ 转交 storage-sql 的 `UniqueViolation`；「单一生成点」由各持有节点在提交内生成 | 已承接（设计） |
| [IV 第六节](../../../spec/data/identity-values/v1/contract.md#六装配给与协议给)其余在客户端这条边上触发的行：S-7 规范形式、S-16 归属层判别式、S-19 读不到即明确失败、S-20／S-23 六路径同判与不得冒充隔离、S-21 不含物理位置、S-27 每道准入现读、S-28 捕获值不重算、S-30 跨边界重新验证、S-33 表示层与判定分开 | 单机由装配给；跨进程须由协议重新兑现 | **转交** governance-center-entry：入口契约 [S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证) 逐行写了这条边上由哪条协议条款兑现；判定仍在各 owner 的数据访问层。S-19 那一行的客户端代理一半归 `apps/cli`（据点一侧，不在本程） | 已转交（设计；契约 candidate） |
| [offer-expiry S-17 表](../../packages/core/offer-expiry/design.md#状态并发与失败映射) | 第 1 行只 provide 一个 `clock`；第 2、3 行单次提交原子与读写同源；第 4 行默认 `offer_ttl` 在消费者加载配置时校验；第 5 行 `now` 不后退候选形状 owner `apps/` | 第 1 行：[时钟装配](#时钟装配)；第 2、3 行：**转交** storage-sql（OG R-1／R-3c）；第 4 行：本节点解析一次、同一组值交给 OG 与运维面，两者的 Config 都拒非正，失败说明点名是哪一项——入口契约 [S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「每一类的默认 `offer_ttl` 取值为正」行把它单列为本应用上触发的装配给，完整体检据此只显示正值；第 5 行：承接者是 `infra/clock`（D-026），本节点装它。第 1、2、3、5 行在客户端这条边上**不触发**（S-36「邀约过期的钟与存储同源」行：时间不进信封） | 已承接／已转交（设计） |
| [offer-expiry 覆盖缺口](../../packages/core/offer-expiry/verification.md#覆盖缺口) | S-17 五行没有可跑的证据形式，是装配选型声明 + 架构评审 | 本页即那份选型声明；一轮评审已完成，本版按其裁决回填 | 待复评 |
| [入口契约 S-36](../../../spec/compositions/governance-center-entry/v1/contract.md#s-36-装配给的保证-vs-协议须给的保证)「起来即整体」行（[S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)） | 装配给：入口层必需依赖它消费的每一个面；启动中任一步失败即整体失败 | 入口层的 inject 归该节点；**本节点给**：入口层装在最后、同步 `PENDING` 判定覆盖它、任一 fiber 失败逆序全撤（[装载清单](#装载清单与顺序)），升级时连同迁移一起撤回（[升级的整体性](#升级的整体性迁移前只读核对快照与确认)）；开闸由本节点在全部 `ACTIVE` 且快照确认之后经 `openSignal` 放行（[两步开闸](#两步开闸就绪与开闸分开)） | 已承接（设计）；入口层节点的 `openSignal` 已在该节点设计里、尚未建包；`assembly.entry-loads-last`、`assembly.no-commit-before-open` 未开始 |
| [S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)「存储或时钟不可用只能表现为返回值上的不可用，不得表现为面缺席」 | 由存储与时钟的提供者兑现（实现映射） | **转交** storage-sql（不可用只以 `StorageUnavailable` 返回，协议 P-8）与 clock（`now()` 返回 `'unavailable'`）——两者都不因抖动撤回自己的服务；**本节点给**：运行期不因任何不可用撤除、重装或重启任何 fiber，面缺席只在启动、停机与换代时出现 | 已转交（套件 C-9a 已通过）；已承接（设计） |
| S-36「运维者没有门」行（[S-25](../../../spec/compositions/governance-center-entry/v1/contract.md#s-25-运维面只在中心所在的机器上且没有治理路由)） | 装配给：通道分离、运维面不引用任何治理能力；进程内没有访问边界 | 通道与导入白名单归 governance-center-entry 与 `tools/ts-checks`（契约 SC-2）；**本节点给**：运维面只 inject `storage`、`clock`，config 里没有任何治理服务或句柄（[入口层与运维面的装配](#入口层与运维面的装配)） | 已承接（设计）；SC-2 规则未建 |
| S-36「中心标识与治理事实同一存储」行（[S-28](../../../spec/compositions/governance-center-entry/v1/contract.md#s-28-铸造存放与不变) 性质 2）；[governance-center-entry R-GC6](../../packages/tenancy/governance-center-entry/design.md#对存储提供者的要求清单) | 装配：一个存储 | 恰一个 `storage`、`governanceCenterMigration` 合进同一份 `MigrationProvider`（[三件事](#同一存储同一约束域本节点要保证的三件事)第 1 条，互指 R-GC6；R-GC7 由 storage-sql 在 `provide` 前跑迁移兑现） | 已承接（设计）；`assembly.manifest-shape` 未开始 |
| S-36「停机时先停收、再等在途、再关闭」行 | 装配给：三步放在同一个装载效应的收尾里 | 三步在入口层自己那一个 effect 里（该节点）；**本节点给**：入口层最先撤、排空上界小于撤除总超时（[撤除次序](#成对的装载与撤除)）；等待上界归承载装配（S-34 末句）即那两个候选常量 | 已承接（设计）；`assembly.dispose-reverse-order` 未开始 |
| S-36「运行中钟往回倒 ⇒ 要看时间的答 `unavailable`」行 | 装配给：时钟提供者在运行中检出回拨 | **转交** `infra/clock`：`now()` 每次现读墙钟、与用过的最晚时刻比对，早于它即答 `'unavailable'` 直到追上（[时钟装配](#时钟装配)） | 已转交（设计）；**源码尚无**，owner clock 节点 |
| S-36「出示物不可伪造」行 | **前提，入口契约不兑现**：`LoginStateId` 不可猜测，依赖 AI G-2 与 IV G-04 闭合（标识的形式与不可猜测程度交给提供者设计） | **不在本节点**：生成点在 account-identity 的提供者（identity-values 节点的 128 位随机候选）；本节点只装它，不另设任何生成点 | 前提缺口归 AI、IV 两份契约与其提供者 |
| S-36「登录状态的效力不变」行 | 装配：登录状态记录在存储里、入口不另存 | 存储与入口层各自给；**前提「不经备份恢复」**，入口契约 G-7——备份与恢复在产品之外做，本节点不提供任何恢复入口 | 已转交；前提缺口归契约 |
| [governance-center-entry「归装配」](../../packages/tenancy/governance-center-entry/design.md#归装配的事项)：装载清单 | 运维面、入口层装在最后，运维先于入口；纳入 `PENDING` 判定；撤除入口先于运维 | [装载清单](#装载清单与顺序)、[撤除次序](#成对的装载与撤除) | 已承接（设计） |
| 同上：迁移合成 | 合入 `governanceCenterMigration`，次序无关，同一份 provider、同一个库 | [合成规则](#合成规则)、[迁移清单](#迁移清单候选列名逻辑名以各-owner-节点为准) `governance_center` 行 | 已承接（设计） |
| 同上：迁移原子性与启动前只读核对（PF-017 §6.9、§6.10） | 片段只保证幂等，原子性归装配 | [升级的整体性](#升级的整体性迁移前只读核对快照与确认)：显式开启 storage-sql 的 `upgrade` 守卫、传两项核对（数据格式、`clockPreflight()`）、`confirmUpgrade` 确认、每次撤完调 `pendingUpgrade` + [两步开闸](#两步开闸就绪与开闸分开)。**§6.10 第 1 行有一条窄带**：上一次崩溃退出、启动时回拨幅度小于租约宽度，clock 分不出回拨与快速重启，按快速重启**等追上再起、不拒起**——「启动时钟比它早就不起来」在这一窄带里读作「追上之前不起来」，「不用更早的时刻」仍成立（[时钟装配](#时钟装配)） | 已承接（设计）；storage-sql 与 clock 两侧**已设计、源码尚无**；pg 上不兑现（U-3）；确认之后的开闸失败支是已接受的残余情形（U-4）；窄带如实承接，不另设机制 |
| 同上：入口层 config 的来源 | 监听地址、TLS 材料（沿密钥规矩，不是部署密钥）、`version`、`drainTimeoutMs` < 撤除总超时、`clockReadyTimeoutMs` > 时钟的租约宽度、`openSignal` | [入口层与运维面的装配](#入口层与运维面的装配)；`clockReadyTimeoutMs` 来自 `OMNE_TENANCY_CLOCK_READY_TIMEOUT`，对 `LEASE_WIDTH_MS` 的核对在装配层（[其余 config](#其余-config候选变量名)）；`openSignal` 由 `boot()` 构造，确认之后兑现（[两步开闸](#两步开闸就绪与开闸分开)） | 已承接（设计） |
| 同上：`openSignal` 的兑现时机与等 `serving`（该节点 N-12） | 全部 fiber `ACTIVE` 且快照确认之后才兑现；确认失败 ⇒ 拒绝再逆序撤除；兑现之后等 `serving`，上界至少 `clockReadyTimeoutMs` 加余量，等不到按启动失败收场 | [两步开闸](#两步开闸就绪与开闸分开)：确认失败拒绝 `openSignal`、逆序全撤、恢复快照；等 `serving` 的上界 `clockReadyTimeoutMs` + 1 s（候选），等不到 ⇒ 启动失败、逆序全撤，**快照已确认、不恢复** | 已承接（设计）；不恢复那一支是 U-4，已接受的残余情形（裁 (b)）；`assembly.no-commit-before-open` 与该节点 T-12 联合演练，未开始 |
| [入口契约 S-34](../../../spec/compositions/governance-center-entry/v1/contract.md#s-34-起来即整体停机时在途请求归谁)「启动成功以钟可读为条件；超过承载装配定的界仍读不到 ⇒ 启动失败并告诉运维者原因是钟」；[governance-center-entry 的等钟](../../packages/tenancy/governance-center-entry/design.md#中心标识版本与启动时刻怎么到达运维面) | 界归承载装配 | **本节点给界**：`clockReadyTimeoutMs`，须大于 `LEASE_WIDTH_MS`（快速重启不误判为启动失败）；等待本身在入口层插件体里（它 inject `clock`，只在启动时用）；超界的收场与其余启动失败同一条——全撤、恢复快照、说明点名是钟 | 已承接（设计）；`assembly.clock-ready-timeout` 未开始 |
| 同上：运维面 config 的来源 | 套接字目录、部署密钥载入结果、五项部署参数（同一组值） | 同上；[密钥装配](#密钥装配两对-ed25519-密钥作为部署配置输入) | 已承接（设计） |
| 同上：日志汇 | 工程记录落在哪、什么格式 | 经 `ctx.logger`，输出目标候选为标准错误流上的逐行 JSON（同上一节） | 已承接（候选）；`ctx.logger` 的来源为假设 |
| 同上：同一存储（R-GC6） | 恰一个 `storage`，补一条互指的要求 | [三件事](#同一存储同一约束域本节点要保证的三件事)第 1 条 | 已承接（设计） |

## 实施缺口与消费者影响

| 缺口 | 挡住什么 | owner 与闭合条件 |
| --- | --- | --- |
| **入口契约未接受**：[PF-017](../../../product/PF-017-governance-center-as-deployable-application/README.md) rev 1 已接受（2026-09-23），`composition.governance-center-entry/v1` 仍 `candidate` | 入口层与运维面的装配、客户端一面的承接，都是候选契约上的候选设计；绑定仍为 0——无已存在的证据可绑（契约 `candidate`、源码未建），不是准入挡着 | 契约接受；测试写成、run 登记 |
| **U-1 开闸到确认之间的窗口——设计上已闭合**：入口层就绪与开闸分两步，本节点在全部 `ACTIVE` 且快照确认之后才兑现 `openSignal`，确认之前没有对外提交可随恢复消失（[两步开闸](#两步开闸就绪与开闸分开)、[反证 (b)](#升级的整体性迁移前只读核对快照与确认)） | 两边都未建包：`assembly.no-commit-before-open` 起不来，闭合只在设计上 | governance-center-entry 按其设计实现 `openSignal`、本节点实现 `boot()` 的两步开闸；演练通过后改记「已闭合」 |
| **U-2 同一份库只有一个属主进程——已设计、无源码**：storage-sql 的属主独占（插件体第一步取、撤除最后一步放、随进程死亡释放；[排他为什么是随进程死亡释放的锁](../../packages/infra/storage-sql/design.md#排他为什么是随进程死亡释放的锁)）；sqlite 那一半借 sqlite 文件锁**待核**，pg 的会话锁在锁连接断开时的收场未定 | 源码落地之前两个进程同时升级同一份库时 §6.9 不成立 | storage-sql 落包并过 `upgrade.exclusive-owner`；本节点加两进程同时 `boot()` 的装配演练 |
| **U-3 pg 上 PF-017 §6.9 本程不兑现（显式缺口）**：pg 上「迁移单事务」成立（R-U7），「迁移后装配失败回滚」不成立——迁移事务提交之后任何一步失败，库都已升级、旧版本起不来（[反证 (d)](#升级的整体性迁移前只读核对快照与确认)） | **受阻消费者：pg 部署**——闭合之前 pg 上的升级不满足 §6.9 | 本节点 + storage-sql；**闭合条件**：pg 首跑前定手段（候选：升级前逻辑备份钩子；或老版本可对新 schema 运行的兼容窗口）；pg 本程只接线（D-026） |
| **U-4 确认之后到开闸之间的失败支**：[入口层节点](../../packages/tenancy/governance-center-entry/design.md#就绪与开门为什么分两步)在开闸那一刻再读一次钟、超界即放弃开闸（其 N-12），那一支落在确认之后；本节点有界地等 `serving`，等不到即启动失败——快照已在兑现之前确认，**「等不到 `serving` 即恢复快照」与「确认之后才兑现」不能同时成立**，本节点取后者（[两步开闸](#两步开闸就绪与开闸分开)第二张表） | 那一支上 §6.9 的「旧版本照常能起」不成立：库已升级、中心没起来；说明写「钟读不到，重启即可」。无受阻消费者 | **已接受的残余情形（裁 (b)）：无已确认提交丢失、老版本不能再起、重启即可**。(b) 即接受这一残余；未取的两条是 (a) 入口层去掉这一支、(c) 等不到 `serving` 即恢复快照（须放弃「确认之后才兑现」，U-1 的窗口随之回来）。钟可读只是暂时条件，同版本重启时装配状态一致 |
| **升级守卫：已设计、无源码**——storage-sql 已承接 R-U1～R-U8（[属主实例](../../packages/infra/storage-sql/design.md#属主实例排他迁移前只读核对升级快照与确认)）：config `upgrade: { checks }` 显式开启、属主独占锁、`confirmUpgrade`／`pendingUpgrade` 导出、具名启动阶段（均为候选名）；源码 `openStorage` 仍是「打开 → ping → 迁移」 | 迁移前只读核对、升级快照、恢复、确认与撤后核查在源码里都还没有；`assembly.upgrade-*` 与 `assembly.no-commit-before-open` 起不来 | storage-sql 节点落包；本节点的 `boot()` 按上面的名字接线 |
| **迁移前回拨核对：已设计、无源码**——clock 已导出（设计）`clockPreflight()`（候选名），与启动判定同一个纯函数（[迁移前的只读回拨核对](../../packages/infra/clock/design.md#迁移前的只读回拨核对)） | 落包之前迁移前只核得了数据格式版本；回拨只在 clock 启动时检出，靠恢复快照撤回 | clock 节点落包 |
| **运行中回拨：已设计、无源码**——clock 的 `now()` 每次现读墙钟并与用过的最晚时刻比对，早于它即答 `'unavailable'` 直到追上（[运行中回拨](../../packages/infra/clock/design.md#运行中回拨每次现读墙钟比对用过的最晚时刻)；S-36 末行；governance-center-entry N-5） | 落包之前开着时钟往回倒，要看时间的事照常答、`clockSane` 照常 `true`（已建包的 `now()` 仍按单调钟推算） | clock 节点落包 |
| **governance-center-entry 尚未建包** | 装载清单的后两条、`governanceCenterMigration`、入口层与运维面的 config 都没有可装的东西 | 该节点建包 |
| **四个基础设施节点的设计尚未被接受** | 本节点对 storage-sql、clock、core/storage、kernel-basis 的每一处采用 | 那四个节点的评审与接受 |
| **AI、OG 的迁移片段第二程才有** | 本节点的迁移合成在此之前只能合 `clockLeaseMigration`；`assembly.fk-organization-owner-account` 起不来 | AI、OG 节点第二程各加一行「导出迁移片段」（OG 的是工厂，收外键目标与名字） |
| **跨 owner 外键靠 OG 片段的工厂参数**（sqlite 无 `ADD CONSTRAINT`）——候选形状 | 若 OG 不接受工厂形状，退路是本节点以 `ALTER TABLE organization ADD COLUMN owner_account … REFERENCES account(account_id)`（可空列，两方言都允许）在 OG 片段之后加列与外键，代价是 OG 的一列由装配建 | OG 节点 + 本节点 |
| **「迁移随 owner 列变化同步修改」** | 被引用列改名不在编译期暴露 | 缓解三条在[迁移的所有权](#迁移的所有权)；不可消除 |
| **`tools/ts-checks` 缺一条规则**：产品代码不得 import `kernel-basis/testing` | 那条纪律无机检 | 主线加规则（三条现有规则的同一形式） |
| **`restricted-call-sites` 的运行未登记 evidence run** | AI S-30 第 8 行、OG S-42 第 4 行不能进绑定 | 主线登记 run 后本节点回填两条 `test:` 绑定 |
| **Kysely `Migrator` 登记表名、按名排序的规则、pg 上是否整批一个事务待核** | 迁移清单的完整性；数据格式版本的判据；R-U7 | 本节点 + storage-sql，落包时按 source-check 核 |
| **`ctx.logger` 在 4.0.4 里由谁提供、能否换成结构化写出器**是假设 | 日志汇的形状 | 本节点，按 source-check 取证；字段形状等全局观测契约 |
| **密钥下发两条路、config 校验库、测试运行器**既无决定也无提案 | architecture 技术栈采用表少三行 | 主线：立提案或决定 |
| **pg 零运行** | D-026「只改配置切 pg」在本节点无证据 | 装配，第二程 |
| **`synchronous=FULL`** 不可配 | 断电级持久 | [D-027](../../../record/decisions/infrastructure-names-and-sqlite-durability/README.md) 裁 `NORMAL`（2026-09-23）；要 `FULL` 须新决定并给 storage-sql 加 config 项 |
| **G-13 残留清扫定时器、G-6 清扫提供者** | 存储卫生；无正确性影响 | 前者：产品负责人定节奏后本节点加 effect；后者：AI v2 枚举读面 |
| **撤除总超时 30 s、排空上界 10 s、等 `serving` 的余量 1 s** 是候选常量 | 一个挂住的 disposer 让进程不退出；排空太短会多丢答复；余量太短会把入口层开闸时那次再读钟误判为未开闸 | 本节点，落包时定 |
| **`scrypt` 不限流** | 资源上限 | 装配运维关注点；有测量再做 |
| **进程形态、进程怎么起、信号处理、命令怎么拼**：本版只有测试内嵌的 `boot()` | 分发与运维；运维者没有起停中心、读完整体检的命令 | 本节点（[PF-017 §8](../../../product/PF-017-governance-center-as-deployable-application/design.md#八边界与依赖) 交给技术设计），建包时定 |
| **跨进程**：两个进程指向同一文件时 `clock` 不保证先后；协调协议未定 | 分布式演化 | 投影 Q-8，架构设计；入口契约 G-8 |

**受阻消费**：在本节点的迁移合成与 `boot()` 落地、且 AI／OG 导出片段之前，AI／OG／AR 三个节点 verification 里标「依赖装配」的全部场景演练（S-32、S-41、S-43 第 2 支、S-47、S-48、S-54、S-27～S-31）都起不来——它们在进程内直接调服务面，不依赖入口层；
governance-center-entry 的 T-3、T-8、T-12（要可注入故障的存储与本节点的 `boot()`）也挡在这里；升级整体性的四条测试另挡在 storage-sql 与 clock 两个节点的落包上（设计已有），`assembly.no-commit-before-open` 另挡在 governance-center-entry 建包与 storage-sql 落包上；
**pg 部署**挡在 U-3 上：闭合之前 pg 上的升级不满足 PF-017 §6.9。
