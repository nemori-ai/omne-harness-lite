# clock 实现设计

## 实现路径与来源

**自建一个小的 Cordis 插件，不依赖第三方时间库。**要兑现的只有一句话——「先后两次 `now()` 后者不小于前者，跨重启也成立，回拨时不服务」——没有可复用的实现；能复用的是 Node 内置的 `process.hrtime.bigint()`（单调钟）与 `Date.now()`（墙钟锚），以及经 `storage` 服务写一行高水位。

| 来源 | 给了什么 |
|---|---|
| [offer-expiry 节点「S-17 第 5 行」](../../core/offer-expiry/design.md#状态并发与失败映射) | 候选形状：进程内以启动时墙钟为锚、单调钟推算；跨重启在存储里持久化「已读到的最大 `now`」高水位；墙钟锚小于高水位 ⇒ `'unavailable'`，fail-closed。**owner 写的是 `apps/`**，D-026 把承接者定为本节点 |
| [D-026](../../../../record/decisions/infrastructure-persistence-choices/decision.md#选择与范围) | 时钟**不在**「无 in-memory」之列——`Clock` 是契约形状，测试用可控实现不算基础设施 in-memory 版；本节点是生产实现，测试装配另换一个可控 `clock` |
| offer-expiry 节点的 `Instant` | 品牌化毫秒整数，已实现（承载仓库 `packages/core/offer-expiry/src/time.ts`）；本节点只取类型与构造 |
| 存储 | 经 [`core/storage`](../../core/storage/README.md) 协议、由 [`infra/storage-sql`](../storage-sql/README.md) 兑现；本节点对它的要求见[要求清单](#对存储提供者的要求清单) |

**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/decision.md)）；内核语义引 [basis](../../../../basis/README.md) 条目（四条均已按 4.0.4 回填 probe，`checked: 2026-09-22`），basis 没有条目的两条（`ctx.provide` 经 effect 纳管、插件体抛出 ⇒ `FAILED`）由 `core/kernel-basis` 的 probe 在 4.0.4 上通过（[kernel-basis verification](../../core/kernel-basis/verification.md#证据义务)）。

**复杂度声明**：本节点唯一的机制——写在前的租约——是正确性机制，它保护「跨崩溃不后退」；租约宽度与续约周期两个常量不是优化参数，是这条保证的代价。没有缓存、没有池、没有批处理。

## 能力到 Cordis 的投影

第一列是 offer-expiry 契约里**由本节点承接**的条款；契约的 provider 是 offer-expiry 节点，本节点不复述那边的条款。名字一律候选。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 时间源形状 `Clock { now(): Instant \| 'unavailable' }` | 插件 `clock`（候选名），`ctx.provide('clock', impl)`；`impl.now()` **同步**返回，不抛异常 | 尚未实现；类型从 offer-expiry 包取 | `'unavailable'` 是返回值不是异常——消费者在自己的写事务里现取 `now`，同步返回让它们不必在事务里 `await` |
| [S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 第 1 行「同源可比」的一半 | 只 provide **一个** `clock`；同标签重复 provide 内核直接抛错（basis [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) 的 `reflect.ts` provide 那一条 symbol，probe 已在 4.0.4 通过） | — | 另一半（消费者不得另用 `Date.now()`）归 offer-expiry 的 lint SC-OE-3；本节点自己**是**唯一允许调 `Date.now()` 的地方（取锚），lint 要把本包排除 |
| S-17 第 5 行「`now` 不后退」——进程内 | `now() = anchorWall + (hrtime.bigint() − anchorHr) / 1e6`，整数毫秒；`anchorWall = Date.now()`、`anchorHr = hrtime.bigint()` 在插件体里取**一次** | Node 内置 | 单调钟不后退 ⇒ 同一实例内两次 `now()` 后者 ≥ 前者。**不承诺准**：锚定后墙钟被 NTP 调整不影响本实例，偏差随运行时长累积（单调钟漂移），本版不校正 |
| 同一行——跨重启、跨崩溃 | 存储里一行高水位 `lease_until`（候选列名）：**写在前**——本实例只返回 ≤ 已持久化 `lease_until` 的值；续约定时器把 `lease_until` 推到 `now + L`。启动时读该行：`now < lease_until` ⇒ 不服务直到追上 | 经 `storage.write` | 反证与对比在[下节](#高水位为什么是写在前的租约不是写在后的节流)。不变量：**任何实例任何时刻返回的值 ≤ 当时已持久化的 `lease_until`**；重启后从 ≥ 它的值开始 |
| 同一行——回拨 fail-closed | 启动时 `Date.now() < written_at`（上一次续约写下时的 `now`）⇒ **确定回拨** ⇒ 启动判定**抛出** `ClockRollbackDetected`（插件体抛出 ⇒ fiber `FAILED`、装配启动失败，不半开——回拨是环境错误，与 `storage-sql`「打不开即启动失败」同一政策；实例同时闩住，此后 `now()` 永久 `'unavailable'`）；`written_at ≤ Date.now() < lease_until` ⇒ 只是崩溃后快速重启落在租约窗口内 ⇒ `'unavailable'` 直到单调推算追上 `lease_until`（至多 L） | 已实现（`src/clock.ts` `start()`） | 两种情形都不静默接受回拨；前者是启动失败（环境错误），后者是运行期抖动（`'unavailable'`）。落选的替代（回拨也只返回 `'unavailable'`、进程照常起来）见实施缺口 |
| [S-9](../../../../spec/data/offer-expiry/v1/contract.md#s-9-读时派生且派生状态不回退) 三条单调来路之「`now` 不后退」 | 同上 | — | offer-expiry 明写这条 owner 是装配；本节点即承接者 |
| 消费者的 `'unavailable'` 收场 | **不在本节点** | — | AI 映射 `storage-unavailable`、OG 映射 `unavailable`，各节点已写 |

### 高水位为什么是写在前的租约，不是写在后的节流

offer-expiry 节点的候选形状把高水位写成「已读到的最大 `now`」——读出之后再推进。写在后的高水位有一条反证：

> 实例在 `t` 返回 `now = t`，节流窗口内尚未写高水位；进程崩溃；墙钟被调回 `t − 1s`；重启读到高水位 `h < t − 1s`（上一次节流写的值），锚检查 `Date.now() ≥ h` 通过；新实例返回 `t − 1s < t`。**后退发生了，而检查没响。**

写在后的任何节流宽度都留这个窗口；`now()` 是同步的，又不能在每次返回前 `await` 一次写。所以把写挪到**前面**：

| | 写在后 + 节流（落选） | **写在前的租约（选）** |
|---|---|---|
| 最强论证 | 简单；写频率与调用频率解耦；无「租约到期」这种新状态 | 崩溃窗口不存在：返回值永远 ≤ 已落盘的界 |
| 弱点 | 上面的反证；只有在「崩溃前一定来得及写」的前提下成立，而那个前提没人给 | 空闲时也要每 L/3 写一次（否则空闲后第一次调用撞上过期租约）；崩溃后快速重启要等至多 L；多一列 `written_at` 才能把「回拨」与「快速重启」分开 |
| 置信度 | — | 高：不变量只有一条且每一步都能对照它检查；两个常量的取值是政策，机制不依赖具体值 |

**常量（候选）**：租约宽度 `L = 10 s`、续约周期 `L/3`。本版 `clock` **无 config**——两个常量写死在包里；要可配时加 config 并走同一条「非法即启动失败」政策。

**表与迁移（本包自带）**：一张单行表 `clock_lease`（候选名）：`id INTEGER PRIMARY KEY CHECK (id = 1)`、`lease_until INTEGER NOT NULL`（毫秒）、`written_at INTEGER NOT NULL`（毫秒）。迁移作为 Kysely `Migration` 从本包导出，**由装配合进它传给 `storage-sql` 的 `MigrationProvider`**；不引用任何别的表，与其他迁移次序无关。

**三条写（候选 SQL 形状，实际经 Kysely 构造）**：

| 时机 | 语句 | 守卫 |
|---|---|---|
| 启动，行不存在 | `INSERT (1, now + L, now)` | 主键冲突 ⇒ 另一实例已建 ⇒ 转读 |
| 续约（定时器） | `UPDATE SET lease_until = now + L, written_at = now WHERE id = 1 AND lease_until < now + L` | 只增不减：另一个更快的写者已推得更远时本次不写 |
| 撤除 | `UPDATE SET lease_until = now, written_at = now WHERE id = 1 AND lease_until = <本实例最后写下的值>` | 比较并写：只收回**自己**推出去的租约；别人推过就不动——快速重启因此不用等 |

写都在 `storage.write` 里，一条语句一次提交，不与任何业务行同事务；**没有跨 owner 的「同一提交」**，这一行只有本节点写。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 存储（无契约，`storage`） | **必需 inject**；要求见[下节](#对存储提供者的要求清单) | 提供者换代 ⇒ 本插件重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)，probe 已在 4.0.4 通过）——**可承受**：重跑等于一次重启，走同一套启动判定；旧实例返回过的值 ≤ 落盘的 `lease_until`，新实例从 ≥ 它开始 | 缺席 ⇒ `PENDING`，`clock` 不可见 ⇒ AI／OG 也 `PENDING`（它们同样 inject `storage`，本来就不可服务）。**必需而不是可选**的对比：可选（`ctx.get`）时本插件可以先 provide、在 storage 缺席时返回 `'unavailable'`——消费者得到的收场一样，但多一种「clock 在、storage 不在」的中间态要解释；必需 inject 让「没有存储就没有时钟」在 fiber 状态上直接可见。落选方的最强论证是少一次重跑；本方弱点是 storage 换代时 clock 换代、消费者多重跑一次——它们本来就因 storage 重跑，不多 |
| `Instant` 类型（offer-expiry 包） | 包依赖，只取类型与构造 | 随包版本 | 表示若改（`Temporal`），本节点的算术要改 |
| `definePlugin`（`core/kernel-basis`） | 包依赖：用它定义本插件（`inject: ['storage']`，无 `Config`）；本版无 config，「非法 config ⇒ 启动失败」的政策不触发 | 随包版本 | — |
| 定时器 | `setInterval`，经 `ctx.effect` 纳管 | 装载时起，撤除时清 | 见装卸表 |

### 对存储提供者的要求清单

| # | 要求 | 对应 |
|---|---|---|
| R-C1 | 单行的条件更新在一次提交内原子，条件不满足时不写且可判（受影响行数） | 续约与撤除两条守卫 |
| R-C2 | 持久：提交后跨进程重启仍在。**边界**：storage-sql 的 sqlite 用 `synchronous=NORMAL`，OS 崩溃／断电可丢最后一段已提交事务（含最近一次续约）——「不后退」跨 OS 崩溃须装配取 `synchronous=FULL`，本版不给（owner 装配） | 高水位的全部意义 |
| R-C3 | 不可用可识别：写失败作为 `StorageUnavailable` 返回，不是静默成功 | 写失败 ⇒ `'unavailable'` 的前提 |
| R-C4 | 表由本包的迁移建立，在 `storage` 可见之前跑完 | `storage-sql` 在 `provide` 前跑迁移 |

四条都在 `storage-sql` 对 AI／OG R-1、R-4、R-5 的兑现范围内，不另开要求。

## 状态、并发与失败映射

**实例状态**（内存）：`anchorWall`、`anchorHr`、`leaseUntil`（本实例确知已持久化的界）、`lastWritten`（本实例**自己**最后一次写成功的值，接手既有行时为 0——撤除只收回它，从未写过就不动别人的）、`latched`（确定回拨）、一个在途续约写的句柄（至多一个）。**持久状态**：`clock_lease` 一行。

**`now()` 的判定次序**（同步）：① `latched` ⇒ `'unavailable'`；② 算 `derived`；③ `derived > leaseUntil` ⇒ `'unavailable'`（租约未续上——启动等待、续约写失败或存储不可用，都落这里）；④ 返回 `derived`。**没有第五种结果**。

**续约**（定时器，每 L/3）：在途续约未回来则**跳过本轮**（不排队；约束「L/3 + 写锁等待上限 5 s < L」保证跳过一轮仍在租约内），否则发一次 `storage.write`（守卫更新，按受影响行数判是否推进了自己的界）；成功 ⇒ `leaseUntil = now + L`。失败按存储协议的类型分两支：`StorageUnavailable`（瞬时）⇒ 记一条结构化日志（级别 warn，含 `cause`），`leaseUntil` 不动——`derived` 越过它之后 `now()` 开始返回 `'unavailable'`，下一次定时器再试，存储恢复后一次成功续约即恢复服务，不需要重启；`StorageDefect`（表不在、列不对——重试也不会变）⇒ 记 error 日志并 **`latched = true`**，不再重试——定时器没有调用方可把缺陷上抛给，闩住是它唯一能做的「不吞错」。**写不进 ⇒ `'unavailable'`**的路径就是①或③，没有第三条。

**并发**：本实例内 `now()` 无共享可变状态需要保护（读几个数、比较、返回）；续约写与 `now()` 不互斥，`leaseUntil` 只在写成功后单调增。**跨进程**：两个进程各起一个本插件对同一存储时，守卫 `lease_until < now + L` 让两者只推不缩，各自返回值 ≤ 落盘界；但两个进程的 `derived` 各锚各的墙钟，**跨进程的先后不保证**——S-17 明写本版单机一个实例，跨进程归 [投影 Q-8](../../../../product/PF-001-identity-scope-and-agent-constraints/projection/v1/projection.md#7-未决项)。

**失败映射**：只有一种对外失败 `'unavailable'`；来路四条（回拨闩、启动等待、续约未成、存储不可用）在日志里区分，对消费者不区分——契约 S-16 只给一个值。

**崩溃与恢复**：进程崩溃时 `lease_until` ≥ 一切已返回值（OS 崩溃见 R-C2 的边界）；重启走启动判定。已知边界两条：`process.hrtime.bigint()` 是 CLOCK_MONOTONIC，**不含休眠时间**——休眠／恢复后推算值持续落后墙钟且不再对齐，直到本 fiber 重跑重新取锚（超长期待机下这是常态路径，本版只保证不后退、不保证准）；检出回拨后启动失败，恢复前的不可用时长等于回拨幅度，**无运维出口**（删行等于宣布不可检测）。租约表被人手动删掉 ⇒ 启动当作首次（插入），**这会让「不后退」失守**——那是运维操作，不是本节点能挡的；写进 verification 覆盖缺口。

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| 取锚：`anchorWall`、`anchorHr` | 插件体开头，内存 | 无 | 随实例消失 |
| 启动判定：`storage.write` 里读 `clock_lease`（不存在则插入）；比较 `Date.now()` 与 `written_at`／`lease_until`，检出回拨 ⇒ 抛出 `ClockRollbackDetected`，否则设起始 `leaseUntil` | 插件体，**在 `provide` 之前** `await` 这一次写 | 回拨、写失败（`StorageUnavailable`，或 `StorageDefect`——如装配没把本包的迁移合进去、表不存在）⇒ **抛出，启动失败**，fiber 进 `FAILED`、不 provide（kernel-basis probe `plugin-throw-fails-fiber.test.ts` 在 4.0.4 上通过）——与 `storage-sql`「打不开即启动失败」同一政策，不半开着提供一个永远 `'unavailable'` 的时钟；两型在日志里分开 | 表里的行是持久事实，**撤除不删** |
| `ctx.provide('clock', impl)` | 本 fiber；`ACTIVE` 后消费者可解析 | provide 失败 ⇒ 抛出，定时器随 effect 撤（`ctx.provide` 经 effect 纳管：kernel-basis probe `provide-is-effect-managed.test.ts` 在 4.0.4 上通过） | 撤除：服务消失，AI／OG 重跑或 `PENDING`；**在途调用**：`now()` 是同步的，没有在途；握着旧 `impl` 的调用方再调得到的仍是旧实例的判定——旧实例撤除后 `latched` 置真，返回 `'unavailable'` |
| **一个** `ctx.effect` 里：`setInterval` 续约 → disposer：① `clearInterval` → ② 等在途续约写返回 → ③ 撤除写（比较并收回租约，失败只记日志）→ ④ `latched = true` | 本 fiber | 定时器起不来 ⇒ 抛出 | ①～④在**同一 effect** 内按序（basis [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md)：跨 effect 无序、异常只记日志）。③失败不影响正确性——租约留着，下次启动最多等 L。**保留**：`clock_lease` 行 |
| `ctx.effect` 登记本身失败（`await clock.start()` 期间 fiber 已被 dispose ⇒ `INACTIVE_EFFECT`） | 插件体 | 定时器与已写租约没有归宿：插件体 `catch` 后自己 `close()`（清定时器、收回租约、闩住）再重抛（`src/plugin.ts`） | — |

**重跑**：先撤除（上表）再从取锚开始；因 `storage` 换代重跑时③的撤除写可能撞上旧 storage 已关闭 ⇒ `StorageUnavailable` ⇒ 只记日志，新实例启动判定看到未收回的租约，最多等 L。

## 实施缺口与消费者影响

- **常量 `L`、续约周期**是候选值；无 config 是本版选择，要可配时加 config 并走「非法即启动失败」。owner：本节点。
- **回拨的收场形状**：已定为启动期抛出（`ClockRollbackDetected` ⇒ fiber `FAILED` ⇒ 装配启动失败）。落选方「进程照常起来、`now()` 永久 `'unavailable'`」的问题是六条 fiber 全 `ACTIVE` 却什么都不服务——装配「不半开」的政策被绕过，只有日志是信号。消费者在启动失败下看到的是 `PENDING`，那正是「装配没起来」的正确形态。
- **`clock_lease.id` 是 sqlite `INTEGER PRIMARY KEY`**（rowid 别名，不建索引）：storage-sql 的约束名反查对它拿不到 `<table>_pkey`，`start()` 里并发建行撞主键那一支在 sqlite 下会以 `StorageDefect` 而不是 `UniqueViolation` 收场。`BEGIN IMMEDIATE` 下两个实例的建行本就串行、后者读到既有行，该分支不可达，本版无害；pg 下 `SERIAL`／`integer` 主键正常报 `clock_lease_pkey`。装配的迁移纪律因此写明「业务表主键列不得是 `INTEGER PRIMARY KEY`」，本表是登记在案的例外。
- **跨进程不保证先后**：Q-8。
- **租约表被外部删除**无法防御，只能观测（启动时行不存在且不是首次部署——本节点分不出「首次」与「被删」，记 info 日志）。owner：装配的运维约定。
- **上游语义**：basis 三条（`plugin-body-reruns-on-provider-change`、`effect-disposal-concurrent-not-ordered`、`isolate-hides-instances-not-data`）与 kernel-basis 两条 probe（`provide-is-effect-managed`、`plugin-throw-fails-fiber`）均已在 4.0.4 上通过（2026-09-22）；装卸表各行引用它们作证据来源。bindings 仍为空表，因为无契约条款可绑。
- **消费者**：AI、OG 必需 inject `clock`；本节点换代它们重跑，接口形状归 offer-expiry，本节点不改。测试装配用可控 `clock`（offer-expiry 演练要求「只许前推」），不用本节点。
