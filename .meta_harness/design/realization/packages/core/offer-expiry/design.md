# offer-expiry 实现设计

## 实现路径与来源

**自建一个薄的 TypeScript 模块，不依赖 Cordis。**判定式本身是一行比较加一个析取（[S-8](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式)），
没有可复用的第三方实现；能复用的只有 RFC 3339 时间点的解析与比较与 JSON Schema 校验器（与 [identity-values](../identity-values/design.md) 同一选型）。
时间点表示为**品牌化的毫秒整数**（Unix epoch）：目标 Node 24 没有稳定的 `Temporal`，比较一律按数值、不按字符串字典序；RFC 3339 只在边界解析与书写。

**不是插件，也不是服务。**契约明写「四类消费者共享同一含义，不得各自复制一份同义定义」——
共享的是**一个函数**，不是一个有生命周期的东西。做成服务会引入一条 inject 边，而消费者被卸载重跑只为「判定式的提供者换代」，
这没有任何领域意义。过期判定是**共用契约，不是插件**：四类消费者共享的是判定式的含义，而含义不会换代。

**本模块不拥有时间源，也不拥有存在性读面。**两者都作为**参数**进入判定函数（下表）；
谁提供它们、它们的保证由谁给，在[依赖、作用域与绑定](#依赖作用域与绑定)。

**Cordis 版本**：本模块不依赖 Cordis；同批节点的采用版本是 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）。

## 能力到 Cordis 的投影

本节点不投影到 Cordis 原语。第二列是**模块公开入口**——实名，全部由 `src/index.ts` 导出；源码 `packages/core/offer-expiry` 已实现（HUB `c9b5850`）。

| 契约责任 | 模块公开入口 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-4](../../../../spec/data/offer-expiry/v1/contract.md#s-4-offertiming) `OfferTiming` | 值类型 `OfferTiming { issuedAt, expiresAt }`（`Instant` 是时间点，不是字符串；`instantFromEpochMs`、`instantFromRfc3339` 解析，`instantToRfc3339` 书写为 UTC 毫秒精度、`Z` 结尾，`compareInstants`、`addDuration` 运算）；构造入口 `timingFrom(issuedAt, ttl) → Parsed<OfferTiming>`，内部 `expiresAt = issuedAt + ttl`，`ttl ≤ 0` ⇒ `invalidInput`——**跨字段约束 `expiresAt > issuedAt` 在构造时兑现**，Schema 管不到它（[S-22](../../../../spec/data/offer-expiry/v1/contract.md#s-22-schema-的范围)）；交换表示的解析 `parseOfferTiming` 同样校验这条跨字段约束 | 已实现（`src/time.ts`、`src/offer.ts`） | 「同一提交内定死」（[S-5](../../../../spec/data/offer-expiry/v1/contract.md#s-5-时刻在发出的同一提交内定死)）**不在本模块**：本模块只保证这个值一旦构造出来就是不可变数据（`readonly`）；把它与邀约同提交写入、此后不再改，归消费者的发出操作 |
| [S-7](../../../../spec/data/offer-expiry/v1/contract.md#s-7-派生状态)／[S-22](../../../../spec/data/offer-expiry/v1/contract.md#s-22-schema-的范围) 两套状态 | **两个类型，不是一个**：`SettledState = 'accepted' \| 'withdrawn'`（**唯一允许写入存储的**）与 `OfferState = 'pending' \| 'accepted' \| 'withdrawn' \| 'expired'`（**只作为求值结果出现**）。`OfferState` **不导出任何可用于存储字段的构造**——它只是 `deriveState` 的返回类型。取值由常量 `SETTLED_STATES`、`OFFER_STATES` 给出；解析入口只有 `parseSettledState`，**没有** `OfferState` 的解析入口 | 已实现（`src/offer.ts`） | 「`expired` 不是被存下来的值」由**类型分层**兑现一半：消费者的记录类型若把 `OfferState` 用作字段，lint 规则 SC-OE-1（见[静态检查](#静态检查义务怎么承载)）失败。另一半（存储布局）在消费者节点核 |
| [S-8](../../../../spec/data/offer-expiry/v1/contract.md#s-8-判定式) 判定式与求值次序 | `deriveState(input: DeriveStateInput) → OfferState \| 'unavailable'`，输入 `{ timing, settled: SettledState \| null, now: Instant \| 'unavailable', target: TargetExistence }`（`TargetExistence = 'exists' \| 'absent' \| 'unavailable'`）。**次序写死在函数体**：① `settled` 非空 ⇒ 原样返回（**不看时间、不看存在性**——已有答复不改写）；② `now` 或 `target` 为 `'unavailable'` ⇒ 返回 `'unavailable'`；③ `now > expiresAt ∨ target === 'absent'` ⇒ `'expired'`；④ 否则 `'pending'`。严格不等号：`now === expiresAt` ⇒ `pending` | 已实现（`src/offer.ts`） | **反方向（已过期不得再写终结记录）本模块管不住**：那是消费者撤回操作的写路径；本模块只给它一个判定入口（先 `deriveState`，得 `expired` 就不写）。**②排在③之前**是 [S-20](../../../../spec/data/offer-expiry/v1/contract.md#s-20-不可用--不存在) 的全部内容：不可用不得被判成不存在，也不得被判成存在 |
| [S-9](../../../../spec/data/offer-expiry/v1/contract.md#s-9-读时派生且派生状态不回退) 读时派生 | `deriveState` 是纯函数、无缓存、无记忆；**不导出**任何「记住上次结果」的入口 | 已实现（`src/offer.ts`） | 「读的那一刻求值」要消费者在每次读面调用时现调 `deriveState` 并传入**本次**的 `now`；三条单调来路各有 owner（终结记录一经写下不撤销：消费者写路径；`now` 不后退：装配，见下节；对象不回来：标识不复用，identity-values [S-3](../../../../spec/data/identity-values/v1/contract.md#s-3-organizationid)）——**本模块一条也不给** |
| [S-13](../../../../spec/data/offer-expiry/v1/contract.md#s-13-接受路径上三种来路给同一个拒绝值) 三种来路同收 | 判定入口 `acceptable(state: OfferState) → boolean`：`pending ⇒ true`，其余三值 ⇒ `false`，**不区分三值** | 已实现（`src/offer.ts`） | 「同一个拒绝值」的**名字归消费者**（本版 `offerNoLongerValid`，[`capability.organization-governance/v1#S-25`](../../../../spec/capabilities/organization-governance/v1/contract.md#s-25-接受邀请)）；本模块把三值折成一个布尔，消费者只能从这个布尔映射一个失败值——想为三种来路各开一个值，得绕过这个入口自己比较 `OfferState`，lint 规则 SC-OE-2 查这种绕过 |
| [S-14](../../../../spec/data/offer-expiry/v1/contract.md#s-14-offer_ttl) `offer_ttl` 两路 | `parseOfferTtl(value: unknown) → Parsed<Duration>`：接受正的安全整数毫秒，或 ISO 8601 时长（`P7D`、`PT1H30M`、`P2W`；不含年月，因为不定长）；非正、非有限、不合形状 ⇒ `invalidInput`。**同一个解析器，两个调用点**：发起者指定的值——消费者在发出操作的表示层调它，失败映射到自己的具名拒绝（本版 `invalidOfferDuration`）；某一类的默认值——消费者在**加载配置时**调它，失败 ⇒ **config 校验或插件体抛出，fiber 进 `FAILED`，不 provide 服务**。**缺席 ≠ 非法**：`undefined` 不进解析器、走默认值，`0`／`-1`／`"abc"` 拒绝 | 已实现（`src/time.ts`） | 默认值那一路的「启动即失败」依赖「config 校验不过或插件体抛出 ⇒ fiber `FAILED` 且服务不可见」——basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)（4.0.4，带 probe）。「每类各配各的默认值」是消费者 config 的形状，本模块只定 `Duration` 的形状 |
| [S-15](../../../../spec/data/offer-expiry/v1/contract.md#s-15-改参数不动已发出的) 改参数不动已发出的 | 本模块**无配置、无全局状态**；`OfferTiming` 是不可变值 | 已实现 | 兑现在消费者：默认值只在 `timingFrom` 被调用那一刻参与计算，此后不存在可被改动的来源。测试落在消费者节点 |
| [S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 时间源形状 | 接口 `Clock { now(): Instant \| 'unavailable' }`——**只定形状**，不给实现。`'unavailable'` 是返回值不是异常，让消费者无法不接。测试替身 `testClock(start) → TestClock`（可前推 `advance`、可切成不可用 `setUnavailable`，负数前推即抛）在子入口 `./testing`，只供消费者演练，产品源码不得 import（ts-checks `no-testing-import`） | 已实现（`src/time.ts`、`src/testing/index.ts`） | 「同源」与「不可用即失败」由消费者兑现：**同一个 `Clock` 实例**供发出（`issuedAt`）与判定（`now`）；三个操作在 `'unavailable'` 时各自失败，读面不返回 `pending`——`deriveState` 已把 `'unavailable'` 传出去，消费者只要不吞它 |
| [S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 五行装配给 | 本模块**不兑现任何一行**，五行逐条落点在[状态、并发与失败映射](#状态并发与失败映射) | — | 见该节 |
| [S-18](../../../../spec/data/offer-expiry/v1/contract.md#s-18-后台清理不担正确性) 后台清理 | **本模块不提供清理任务**，也不导出「标记为过期」的写入口 | — | 落点 #9，不走本主线；将来若消费者提供清理 effect，S-25 的「清理停着、结论不变」在那边演练 |
| [S-22](../../../../spec/data/offer-expiry/v1/contract.md#s-22-schema-的范围) Schema | `validate(defName, value) → SchemaValidation`（名单 `SCHEMA_DEF_NAMES`，`schemaId` 给 `$id`），Schema 从 spec 复制进包（`schema/offer-expiry.schema.json`，子入口 `./schema`），包内测试 `tests/schema.spec.ts` 核对逐字节相同（与 identity-values 同一做法） | 已实现（`src/validate.ts`） | V-形状自检只到形状 |

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.identity-values/v1` [S-1](../../../../spec/data/identity-values/v1/contract.md#s-1-accountid)／[S-3](../../../../spec/data/identity-values/v1/contract.md#s-3-organizationid) | 普通包依赖 [identity-values](../identity-values/design.md)；本模块只取 `OrganizationId`、`AccountId` 两个类型名用于邀约记录的引用字段类型，**判定函数本身不取身份值**（它只看 `target` 三值） | 随包版本 | 出 v2 另建子路径 |
| 时间源（[S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源)） | **不消费**——本模块定义 `Clock` 形状，由**装配**选用一个实现（[infra/clock](../../infra/clock/design.md) 的插件 `clockPlugin` provide 服务 `clock`，由 [apps/tenancy-host](../../../apps/tenancy-host/design.md) 装载），由**消费者插件** inject 并把 `now()` 的结果传进 `deriveState`。本模块不见它 | 装配启动时 provide；本版单机一个实例 | 缺席 ⇒ 消费者插件 `PENDING`（inject 不齐），发出／撤回／接受／读全部不可服务——这正是「不可用即失败」在装配层的形状 |
| 存在性读面（[S-19](../../../../spec/data/offer-expiry/v1/contract.md#s-19-规则与读面归属)） | **不消费**——消费者在调 `deriveState` 前自己去持有对象的契约读存在性（本版：组织由治理节点自己的存储读；资产**无落点**，[G-6](../../../../spec/data/offer-expiry/v1/contract.md#八已知缺口)），并把三值传入 | — | 读不到 ⇒ 传 `'unavailable'`，**不得传 `'absent'`** |

## 状态、并发与失败映射

本模块**无状态、无并发、无提交点**。失败只有一种形状：`invalidInput`（解析／构造）或 `'unavailable'`（判定输入缺席）作为**返回值**到达调用方。

[S-17](../../../../spec/data/offer-expiry/v1/contract.md#s-17-装配给的保证-vs-协议须给的保证) 的五行装配给保证，本版单机由谁给：

| S-17 的行 | 本版由谁给 | 落到什么要求 |
|---|---|---|
| `now` 与 `expiresAt` 同源可比 | **装配**：一个进程、一个 `clock` 服务实例 | 对装配：**只 provide 一个 `clock`**；对消费者：`issuedAt` 与 `now` 都从它取，**不得**另用 `Date.now()`——lint SC-OE-3 查消费者包内对 `Date.now`／`new Date()` 的直接调用 |
| 读到 `pending` 与写入效果之间无窗口（S-10） | **消费者 + 存储**：接受操作在**同一次存储提交**里现读终结记录、现取 `now`、现读存在性、调 `deriveState`、写效果 | 对存储提供者的要求：**单次提交原子**且提交内的读看得到提交前的全部已提交写（读写同源）。要求清单在 [organization-governance](../../tenancy/organization-governance/design.md#状态并发与失败映射) 汇总，本节点不重复 |
| 存在性读数足够新 | 同上：同一提交内读 | 同上 |
| 每类默认 `offer_ttl` 为正 | **消费者插件在加载配置时**调 `parseOfferTtl`，失败即抛 | Cordis 行为：config 校验不过或插件体抛出 ⇒ fiber `FAILED`、服务不 provide——basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) |
| **`now` 不后退** | **装配选型**：`clock` 的实现须满足「先后两次 `now()` 后者不小于前者」。实现在 [infra/clock](../../infra/clock/design.md)：**进程内**每次 `now()` 现读墙钟、比对本实例用过的最晚时刻，落后即 `'unavailable'` 直到追上（运行中回拨与启动时的旧租约窗口同一规则）；**跨重启**在存储里持久化一行**写在前的租约**（任何实例任何时刻返回的值 ≤ 已持久化的 `lease_until`），启动时墙钟小于上次写下的 `written_at` ⇒ 确定回拨、`clock` 启动失败（**fail-closed**，不服务、不静默接受回拨）。「读后推进高水位」那种写法有反证（节流窗口内崩溃 + 回拨 ⇒ 后退不响），已被租约取代 | 这是**唯一一行本模块对实现形状提了要求的**，因为它决定了 `Clock` 接口要不要多一个「不可用」返回——要的。跨重启那一半依赖存储，所以它是**装配 + 存储**的共同责任；高水位写入的频率与代价归装配裁定。owner = `infra/clock`（机制）与装配（把它的迁移合进去） |

**为什么时间源做成服务而不是模块函数**：演练 [S-25](../../../../spec/data/offer-expiry/v1/contract.md#s-25-上界为-offer_ttl) 要能前推时间（verification 明写「操纵只许前推」）；时间源是一个可替换的服务实例时，测试装配换一个可控 `clock` 就行，不用打模块补丁。这也是它归装配而不归本模块的原因：它有生命周期（高水位）、有实现选择，本模块只有形状。

## 静态检查义务怎么承载

契约的 verification 没有列 SC 条目，但有三条**只能静态查**的禁止，本节点各配一条 lint 规则，全部落在承载仓库 `tools/ts-checks`（`pnpm run lint:rules`）：

| 规则 | 查什么 | 对应条款 | ts-checks 规则名 |
|---|---|---|---|
| SC-OE-1 | 消费者包内的持久记录类型不得以 `OfferState` 为字段类型；只允许 `SettledState \| null` | [S-7](../../../../spec/data/offer-expiry/v1/contract.md#s-7-派生状态)「`expired` 不得被写成存储字段」 | `sc-oe-1` |
| SC-OE-2 | 消费者的接受路径不得对 `OfferState` 做逐值比较后映射出**多于一个**失败值；只许经 `acceptable()` | [S-13](../../../../spec/data/offer-expiry/v1/contract.md#s-13-接受路径上三种来路给同一个拒绝值) | `sc-oe-2` |
| SC-OE-3 | 消费者包内不得直接调用 `Date.now`／`new Date()`／`performance.now` 取 `now` | [S-16](../../../../spec/data/offer-expiry/v1/contract.md#s-16-同一时间源) 同源 | `no-wall-clock` |

三条规则各自「不覆盖」的写法（按命名约定识别记录类型与接受路径、经别名取墙钟）列在 ts-checks 的 README 里。

## 实施缺口与消费者影响

- **`Instant` 表示**：已定为品牌化毫秒整数（`src/time.ts`），2026-09-22 闭合。
- **默认值配错 ⇒ 启动失败**依赖的 Cordis 行为（config 校验不过或插件体抛出后 fiber `FAILED`、服务不可见）已由 basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md) 取证（4.0.4）。
- **`now` 不后退**由 [infra/clock](../../infra/clock/design.md) 以写在前的租约兑现；「时间源依赖存储」这条边在那个节点的装卸表里成对，装配把 clock 的迁移片段 `clockMigrations` 经 `composeMigrations` 合进 `storage-sql` 的迁移清单（[apps/tenancy-host](../../../apps/tenancy-host/design.md)）。
- **资产那两类消费者无落点**（[G-2／G-6](../../../../spec/data/offer-expiry/v1/contract.md#八已知缺口)）：本模块的入口对它们同样可用，但没有人调用；不为它们预留任何东西。
- **上游语义**：本模块自身不依赖 Cordis 行为；默认值那一路引 basis `plugin-throw-fails-fiber`，见上。

## OE2 候选映射

D040已接受OE2；本节点保持纯函数/值模块，不新增插件、存储或事件。SETTLED_STATES扩为accepted/withdrawn/declined，OFFER_STATES扩为五值；deriveState仍终结优先→必要读数不可用→严格now>expiresAt或对象缺席→pending，acceptable仍只认pending。新的Schema校验入口指向OE2资源，旧资产消费者不自动采用。

构造timingFrom保留合法正时长和expiresAt>issuedAt检验，并将安全整数加法越界以可识别的计算不可用结果交给调用者；不能把它等同于非法用户时长。精确TypeScript结果为Parsed<OfferTiming> | 'unavailable'，OG须显式映射不可用。解析已给定时间对仍沿表示/跨字段invalidInput，不引入数据库操作。测试覆盖declined在无时钟/对象情况下仍保持终结、未终结任一必要读数失败、截止等号和加法越界。

此增量待与OG2节点一并评审采用，当前实现尚未升级；纯模块不因此拥有接受/拒绝/撤回授权或事务。
