# session-tenancy-table 实现设计

> 本批设计已接受（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-045](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

## 实现路径与来源

**自建一个薄插件：一张表、一个读。**「会话持有哪个租户身份」是本项目的产品语义（PF-015 §6.12），没有上游对应物；存储走本仓库已实现的 `core/storage` 协议与 `infra/storage-sql` 提供者（[D-026](../../../../record/decisions/infrastructure-persistence-choices/decision.md)），不另开连接、不另选库。

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| 存储协议 `Storage`／`ReadTx`／`WriteTx`、四型失败、`mapStorageError`、`MigrationFragment` | [`core/storage`](../../core/storage/design.md#协议) | 一次只读事务读一行；迁移片段的形状 |
| 服务 `storage` 的实例 | [`infra/storage-sql`](../../infra/storage-sql/README.md)（据点那一份，装配给） | 必需 inject |
| `TenantId` 及其校验 | [`core/identity-values`](../../core/identity-values/README.md) | 读出的值按 `data.identity-values/v1#S-5` 核一遍 |
| `SessionRef` | [`core/messages`](../../core/messages/README.md) | 会话指认的表示层校验 |
| `definePlugin` | [`core/kernel-basis`](../../core/kernel-basis/README.md) | 插件骨架 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）。
**配置**：本插件**没有 config**，也**没有策略配置项**——一个读，没有重试、计时、缓冲或上限可调。配置错误政策（启动失败）因此不产生本节点的条目。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：读以不依赖 Cordis 的闭包公开，插件服务是它的一种消费者。名字全部**候选**，**全部尚未实现**。

| 层 | 导出（候选） | 做什么 | 承诺到哪 |
|---|---|---|---|
| 闭包 | `createSessionTenancyReader(storage)` → `{ holdingTenant }` | 契约 [S-8](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-8-holdingtenant读会话持有的租户身份)，给它任一符合 `core/storage` 协议的存储 | S-5～S-8 全部；「答出之后不变」要调用方给的存储持久、且没有别人改这张表 |
| 迁移片段 | `sessionTenancyMigrations: readonly MigrationFragment[]` | 建表（幂等） | 表的形状；装配合成 |
| **只供验收装配**的子入口 `./seed` | `seedHoldingTenant(tx, session, tenant)` | 在一次写事务里插一行；同一会话再写同一租户是空操作，写别的租户即抛出（主键冲突，不改旧值） | **不是契约的面**：它代会话那一程写映射（契约 G-2 的空缺），只许验收装配的测试代码 import |
| Cordis 服务 | 插件 `session-tenancy-table`，服务 `sessionTenancy` | 以注入的 `storage` 组出闭包 | 再加：据点根一份、`storage` 换代时重跑 |

**只在运行时层成立、函数层不承诺**：调用方身份已核实、据点上只有一份映射（契约 S-10 的左列）——闭包的使用者自己给。

## 关键选择

**一、必需 inject `storage`（选），不作可选依赖。**

| | `storage` 作可选依赖：服务总在，存储缺席时答 `unavailable` | **必需 inject：存储不在，本插件 `PENDING`、服务不出现（选）** |
|---|---|---|
| 落选方的最强论证 | 消费者拿到的是契约里的具名值，而不是「服务不在」 | —— |
| 本方弱点 | —— | 存储换代时插件重跑（本插件没有活状态，重跑无损） |
| 为什么选它 | —— | 表是唯一权威，没有存储一个读都答不出——「没有它我不跑」是如实的（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）。消费者对两种形态收场相同：契约 [S-11](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-11-提供者撤除换代与重启) 第 3 条「提供者缺席……口径与 `unavailable` 同」；执行宿主两者都收成 `dependencyUnavailable{sessionTenancy}` |
| 置信度 | | 高 |

**二、每次读都查存储，不缓存答出过的值（选）。**

| | 缓存答出过的值（契约 S-6 第 3 条允许：答案不变） | **不缓存（选）** |
|---|---|---|
| 落选方的最强论证 | 答案不变，缓存永不陈旧；存储短暂读不到时还答得出（契约 S-15 明说这样合规） | —— |
| 本方弱点 | —— | 每次读一次主键查找；存储读不到时一律 `unavailable` |
| 为什么选它 | 多一份进程内状态与它的上界；「存储读不到仍答得出」没有具名需求 | 最小；一次主键查找没有测量出的瓶颈 |
| 置信度 | | 高；有测量再加（加时 S-6 保证它永不陈旧） |

**三、测试种子是本包的 `./seed` 子入口（选）。**

| | 验收测试直接对表写 SQL | 另起一个种子插件，provide 一个写面 | 本包只公开表名、列名常量与迁移片段，写函数放在 `apps/cli` 的测试代码里 | **本包导出只供验收的 `./seed`（选）** |
|---|---|---|---|---|
| 落选方的最强论证 | 本包零写代码 | 种子也走 Cordis 装配，与验收装配的其余替身同形 | 本包零写代码，同时表名列名只有一份（没有左列的漂移）；产品包里没有任何写入口，看上去不需要 import 规则 | —— |
| 本方弱点 | —— | —— | —— | 产品包里有一段写代码；**要一条结构检查**守住「只有 `apps/cli` 的测试代码 import `./seed`」（STT-4），否则任何产品组件都能悄悄补出契约没有的写面——这条检查是本节点「可实施」的**前置**（STT-4） |
| 为什么选它 | 表的列名在测试里抄第二份，改表时两处漂 | 一个 provide 出来的写面在 `ctx.get` 下整棵树可见（basis `inject-has-no-optional-form`），等于给产品装配开了契约 G-2 说「本版不收」的那一写 | 三处不如右列：① **写的语义有两个家**——只插不改、同会话同租户是空操作、异租户即抛出、`TenantId` 先校验，是「答出之后不变」（S-6）在写这一侧的前提，放进另一个包的测试代码，本包改表时它不在本包的测试里跟着跑；② **公开面变宽**——表名列名一导出就是跨包承诺（SYS-OPEN 下公开面即承诺），物理表形状从本节点的内部变成别人依赖的东西，右列只公开「写一行」的语义；③ **「零写入口」不自执行**——拿到 `storage` 的任何产品组件用这些常量照样写得了这张表，守它要一条「谁写了 `session_tenancy`」的检查，要跟着常量的 import 追，比右列「谁 import 了 `./seed`」的 import 图规则更难写、更易漏 | 表的形状与写的语义都只有一个 owner；写不经 Cordis、不成为任何服务的方法；守它的检查是一条 import 图规则 |
| 置信度 | | | | 中高（第三列与右列的差在检查的可写性与语义的归属，不在运行行为；两者都挡不住直接对表 `INSERT` 的组件——那一条两边同样没有检查（`UPDATE`／`DELETE` 由 V-1 前半守），见 STT-4） |

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个插件 `session-tenancy-table`（候选名），一条 fiber，必需 inject `storage`。**它 provide 一个服务 `sessionTenancy`，方法取契约名 `holdingTenant`。插件体只做两件事：以注入的 `storage` 造闭包、`ctx.provide`。**它没有任何进程内状态**。

**表**（逻辑名，候选）：

| 表 | 列 | 约束 | 写入方 |
|---|---|---|---|
| `session_tenancy` | `session`（`SessionRef` 的交换表示，文本）、`tenant`（`TenantId` 的交换表示，文本，非空） | 主键 `session`（不命名，两方言统一报 `session_tenancy_pkey`，`core/storage` P-11） | **产品装配：无**（契约 G-2）；验收装配：`./seed` |

**没有 UPDATE、没有 DELETE**：本包没有改与删这张表的代码路径（结构检查 V-1）；`./seed` 只插入。

### 契约责任到插件、服务与操作

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-5-会话持有的租户身份) 恰一个租户身份 | 主键 `session`：一个会话至多一行 | 尚未建包 | 「不会一个都不持有」对**有记录的会话**成立；没有记录答 `sessionNotFound`（契约 S-7 的定位值），不是「没有租户」 |
| [S-6](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-6-答案不变) 答案不变 | 行一经插入不改不删 | 尚未建包 | 前提：没有改删路径（V-1）＋ 存储持久——边界见 STT-3 |
| [S-7](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-7-缺席时的默认答案与失败值) 缺席默认与失败值 | 见[失败映射](#状态并发与失败映射) | 尚未建包 | 不答「没有租户」，不交任何默认租户 |
| [S-8](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-8-holdingtenant读会话持有的租户身份) `holdingTenant` | 表示层校验 `session` → `storage.read` 里按主键取一行 → 有：核 `TenantId` 后交出；无：`sessionNotFound` | 尚未建包 | 只读，无提交 |
| [S-9](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-9-本版不发事件) 不发事件 | 不 `emit`、不监听 | —— | —— |
| [S-10](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-10-装配给的保证-vs-协议须给的保证) 装配给 vs 协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |
| [S-11](../../../../spec/capabilities/session-tenancy/v1/contract.md#s-11-提供者撤除换代与重启) 撤除、换代、重启 | 没有活状态；事实全在表里 | —— | 换实例、重启答案不变 |

**两个写入者的共同存储对象**：本契约的面上**没有写**，所以没有两个写入者相遇；种子与（将来的）会话那一程若同时写同一会话，共同对象是**主键 `session_tenancy_pkey`**——后到的一方撞主键、不改旧值。读与写之间只要一次已提交快照（`storage.read`）。

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 服务 `storage`（`core/storage` 协议） | **必需 inject**；据点那一份 `infra/storage-sql` | 提供者换代 ⇒ 插件重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)），无状态可丢 | 缺席 ⇒ `PENDING`，服务不出现；消费者按「读面缺席」收场 |
| 迁移 | 本包导出片段，**装配合成**（`composeMigrations`，[core/storage 共用形状](../../core/storage/design.md#迁移片段与迁移前核对的共用形状)） | 启动时由 `storage-sql` 在 `provide('storage')` 之前跑 | 片段缺了 ⇒ 读时 `StorageDefect`（表不存在）⇒ 原样上抛：是装配缺陷，不是不可用 |

**消费者**（契约「谁调用」）：执行宿主（`submit`）、派发器（解析执行环境句柄）、会话资产注册表的据点读面（「会话事实」那一片，M48）、模型请求运行时（发起租户，M66）、会话日志的写入方（填条目壳的租户）。它们全是**调用时现取**或经读面转一道，没有一个 inject 本服务——本插件换代不连带它们重跑。

### 对存储提供者的要求清单

| # | 要求 | 对应条款 | 协议兑现点（`core/storage`） |
|---|---|---|---|
| R-ST1 | 一次只读事务读一行，看到的是一个已提交快照 | S-8 ④ | `read(fn)`，P-6 |
| R-ST2 | 主键唯一，冲突可识别且名字稳定 | S-5 第 1 条 | `UniqueViolation { constraint: 'session_tenancy_pkey' }`，P-11 |
| R-ST3 | 提交之后跨进程重启仍在 | S-6、S-13 | P-7；**断电边界**：`synchronous = NORMAL` 下操作系统崩溃可丢最后一段已提交事务（[D-027](../../../../record/decisions/infrastructure-names-and-sqlite-durability/decision.md)）——STT-3 |
| R-ST4 | 读不到可识别，不返回空、不返回旧快照 | S-7、S-15 | `StorageUnavailable`，P-8 |
| R-ST5 | 缺陷（表不在、列不在）不折成不可用 | 失败映射 | `StorageDefect`，P-8 |
| R-ST6 | 迁移幂等（`IF NOT EXISTS`），主键不命名 | 依 [storage-sql 对迁移文件的要求](../../infra/storage-sql/design.md#依赖作用域与绑定) | 装配合成 |

## 状态、并发与失败映射

**本插件没有状态**。一次读 = 一次只读事务。

| 情形 | 映射 |
|---|---|
| `session` 缺席或不合 `SessionRef` | `invalidInput`，不碰存储 |
| 读到一行 | `{ tenant }`；存的值不合 `TenantId` ⇒ **缺陷**：原样上抛、error 日志——不折成 `unavailable`，更不当 `sessionNotFound` |
| 读得到、没有这一行 | `sessionNotFound` |
| `StorageUnavailable` | `unavailable`（`mapStorageError`） |
| `StorageDefect` 与其余异常 | 原样上抛（缺陷） |
| 本实例已撤 | `unavailable` |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| `ctx.provide('sessionTenancy')` | 本 fiber；`storage` 在时插件体运行、立即可解析 | 抛出 ⇒ 随 fiber 撤（`provide` 经 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**） | 服务消失 |
| 撤除标记（一个 `ctx.effect`） | 本 fiber | —— | 置标记；此后到达的调用答 `unavailable`。**在途的读跑完**（内核不取消在途调用），按它读到的快照答。**保留**：表里的全部行——它们归会话那一程，撤除什么都不删 |

## 装配给与协议给：本节点单机怎样兑现左列

照契约 S-10 逐行；右列本节点一条都不兑现。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 调用方身份已核实 | 进程内能力间面 | **装配**：不把本服务接到任何入口 |
| 答案不变 | 一张表、一份存储、没有改删路径 | 本节点 ＋ **装配**（据点只装一份、只有一份 `storage`；开闸在升级确认之后，STT-3） |
| 消费者拿到的租户就是这个会话的 | 按 `SessionRef` 一次读，答复与请求在同一进程里配对 | 本节点 |

**归装配的事项**（点名给 `apps/cli`）：合成本包的迁移片段（**只在验收装配**）；验收测试经 `./seed` 写映射，产品代码不 import 它；**开闸（第一次受理）在 `storage-sql` 升级确认之后**——确认之前写下的行会随快照恢复消失，那时若有读已答出，S-6 就被打破（[storage-sql 属主实例](../../infra/storage-sql/design.md#属主实例排他迁移前只读核对升级快照与确认)）；这一前提已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点）（STT-3）；不暴露成入口。

## 实施缺口与消费者影响

契约第十节的缺口不重抄；下表是**本节点自己的**缺口，编号 STT-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| STT-1 | **产品装配没有写入方**（契约 G-2）：表里没有一行，每一次读都是 `sessionNotFound` | 执行宿主 `submit`（整批失败）、派发器解析执行环境句柄、模型请求运行时凡要发起租户的操作（MRR-N10）、注册表的会话事实 | 会话那一程 PF-015 | 会话创建的契约写出那一写，且与会话日志第一条的租户同源 |
| STT-2 | **真承接者未到**（契约 G-1，据点装配 C-13） | 同上 | 主线 → 会话那一程 | 那一程的会话契约收下或取代 ST v1，提供者节点互指或取代本节点 |
| STT-3 | **「答出之后不变」的存储边界**（已知边界，主线已裁（[D-040 §八 N-40](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)））：断电时 SQL 一侧可丢最后一段、升级未确认即撤除时快照恢复——边界与论证见 [session-log-jsonl SLJ-2](../session-log-jsonl/design.md#实施缺口与消费者影响)，本节点不另论证。落在本节点的后果：一个答过 `T` 的会话可能改答 `sessionNotFound`（契约 S-6 第 1 条的前提「存储持久」在那一刻不成立） | S-6、S-13 | 主线（已知边界）；装配（开闸在确认之后） | 不闭合的已知边界；升级恢复那一条来路由「开闸在确认之后」挡住——前提同 [SLJ-2](../session-log-jsonl/design.md#实施缺口与消费者影响)，已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点） |
| STT-4 | **`./seed` 是产品包里的一段写代码**：没有结构检查时，任何产品组件都能 import 它补出契约没有的写面 | 契约 S-2「写下这一映射本版不收」 | 本节点 ＋ ts-checks owner | 结构检查「只有 `apps/cli` 的测试代码 import `./seed`」落地并带故意违反即失败的自测（V-1）；**这是本节点「可实施」的前置**——检查落地之前，本节点不声称可实施。直接对表 `INSERT` 的组件这条检查挡不住（`UPDATE`／`DELETE` 由 V-1 前半守；关键选择三的第三列与右列同样），本版不另设检查 |
| STT-5 | **产品据点清单本版不装本节点**（据点装配关键选择 5） | —— | 主线 | 据点装配的改选条件成立 |

**报给主线**（不在本节点改）：四个消费者（执行宿主 T-8、派发器、模型请求运行时 MRR-N10、注册表 A-2 里「会话事实」那一片）与据点装配（验收装配表「会话持有租户」一行、C-13）改指本节点；STT-3 的开闸次序已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（A-28，与 SLJ-2、AMS-5 同一前提），不再报。
