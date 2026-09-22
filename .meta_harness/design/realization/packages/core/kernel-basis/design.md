# kernel-basis 实现设计

## 实现路径与来源

**自建一个薄的 TypeScript 包，三件事一包。**

1. **probe 的家。**[basis 准入](../../../../basis/README.md#准入)要求每条机制语义条目有一个在该语义消失时会失败的 probe；四条 [basis/cordis](../../../../basis/README.md#当前状态) 条目此前 `probe: null`，理由都是「尚无 Cordis 集成测试位置」。
   [D-025](../../../../record/decisions/cordis-adoption-version/decision.md) 把版本钉在 4.0.4 并把闭合条件写成「basis 四条与三条待核对主张的 probe 在 4.0.4 上通过」，`probe` 字段指向 `packages/core/kernel-basis/tests/basis/<id>.test.ts`。本节点就是那个位置；八条 probe 已于 2026-09-22 在 4.0.4 上通过，四条条目已回填。
2. **插件层共用件。**四个 tenancy 插件节点各自写了同一批句子：config 校验失败即抛出、失败值是字面量联合、`credentials` 走「调用时解析」、每步之前查本 fiber 是否仍 `ACTIVE`。这些句子的机制形状**只该实现一次**，否则「配置错误一个政策」会在四个包里各写各的。
3. **测试装配工具。**四个节点的场景演练都要「起一个 Context，装上 storage、clock 与被测插件」；D-026 又规定测试对着真实提供者跑（sqlite 临时文件库）。`./testing` 子路径给这件事一个入口。

**不是插件，不提供服务。**共用件是被 import 的函数与类型；probe 是测试；`bootAssembly` 起的 Context 归调用它的测试文件。把共用件做成一个「基础服务」只会给四个节点各加一条 inject 边，而「`definePlugin` 换代」没有任何领域含义。

**不 fork 任何东西。**Cordis 直接用官方发布包（[SYS-KERNEL](../../../../foundation/cross-system-constraints/requirements.md#sys-kernel)）；本节点不改内核，只**核对**它。

**两件不在本包的东西**：`mapStorageError` 归 [core/storage](../storage/design.md)——它折的是那边定义的错误类型，错误类型的 owner 拥有映射；本包不 import storage。可控时钟（只前推）归 offer-expiry 的 `./testing`——`Clock` 形状的 owner 提供它的测试替身；`bootAssembly` 只收调用方传入的服务值，不内建时钟。

**Cordis 版本**：`@deepseek-ai/cordis` **4.0.4**（D-025）。对内核行为的陈述以 probe 在 4.0.4 上的结果为准；取证时对 4.0.2 的读数保留在[读数与 probe 结果](#读数与-probe-结果)表里作解释，其中一条（`async-control-not-bail`）按 4.0.4 源码改正过。

## 能力到 Cordis 的投影

本节点不投影任何契约。下表第一列是**责任的来源**（决定、basis 规则、同批节点的共用句子），第二列是公开入口（源码里的真实名字）。

| 责任来源 | 公开入口 | 实现／源码与采用版本 | 依据或缺口 |
|---|---|---|---|
| D-025 闭合条件；basis 四条条目的 `probe` | `tests/basis/<id>.test.ts` 八个文件：`isolate-hides-instances-not-data`、`async-control-not-bail`、`plugin-body-reruns-on-provider-change`、`effect-disposal-concurrent-not-ordered`、`inject-has-no-optional-form`、`provide-is-effect-managed`、`plugin-throw-fails-fiber`、`fiber-state-readable`（[verification](verification.md#证据义务)逐条） | 已实现；4.0.4 上通过（2026-09-22） | 每条 probe 的断言、结果与失效条件在[读数与 probe 结果](#读数与-probe-结果)。basis 四条已回填；后四条不对应条目，升格另议（basis 维护者） |
| 四节点「config 校验失败 ⇒ 插件体抛出 ⇒ 启动失败」（[AI](../../tenancy/account-identity/design.md#成对的装载与撤除)、[OG](../../tenancy/organization-governance/design.md#成对的装载与撤除)、[AR](../../tenancy/account-registration/design.md#成对的装载与撤除)、[offer-expiry S-14 默认值那一路](../offer-expiry/design.md#能力到-cordis-的投影)） | `definePlugin({ name, inject?, Config, apply })` → `Plugin.Object`：`Config` 是任一 Standard Schema v1（zod 即可）；校验由**内核**在插件体运行前完成，失败 ⇒ fiber `FAILED`、不 provide、`await fiber` 拒绝；`inject` 里写进去的都是必需 | `src/plugin.ts`；zod 4.6.5（workspace catalog）只在测试里用，本包源码只依赖 `@standard-schema/spec` 的类型 | **这是「配置错误一个政策」的唯一实现点**：缺密钥、非正时长、非法方言配置在同批六个插件里同一收场——启动失败，不做运行期具名拒绝。机制已由 probe `plugin-throw-fails-fiber` 核实（非法 config ⇒ `FAILED` 且插件体不跑） |
| 四节点的返回类型形状 `{ ok: X } \| { failure: '…' }` 与「只有成功与否」的 `ok` | `Outcome<T, F extends string> = { ok: T } \| { failure: F }`；`Ack<F> = 'ok' \| { failure: F }`；`succeed(v)`、`fail(f)`、`isSuccess(o)`。**没有兜底值**，`F` 是各契约自己的闭合字面联合（拼法以契约为准，不在此统一） | `src/outcome.ts` | identity-values 的 `Parsed<T>`（`{ ok } \| { invalidInput }`）**不在本包**——它的权威在 [identity-values](../identity-values/design.md#能力到-cordis-的投影)，本包不为它提供助手、不重定义，理由见[关键选择](#四处关键选择) |
| AI「`credentials` 可选依赖、调用时解析」（[理由](../../tenancy/account-identity/design.md#s-15-归本节点credentials-作可选依赖在调用时解析)） | `resolveOptional<T>(ctx, name): T \| undefined`：读 `ctx.get(name)`，提供者缺席或已撤除 ⇒ `undefined`；**不登记依赖、不触发重跑** | `src/plugin.ts` | probe `inject-has-no-optional-form`：缺席 ⇒ `undefined` 且插件体照跑；提供者出现／撤除／换代都不重跑调用方。返回 `undefined` 而不是抛出：AI 的收场是「验证器不在 ⇒ `storage-unavailable`」，调用方要能把缺席当一个普通分支 |
| AR「每步之前检查本 fiber 是否仍 `ACTIVE`」（[S-22 行](../../tenancy/account-registration/design.md#能力到-cordis-的投影)） | `FIBER_STATE = { PENDING: 0, LOADING: 1, ACTIVE: 2, FAILED: 3, DISPOSED: 4, UNLOADING: 5 }` 数值镜像 + `fiberIsActive(ctx)`（`ctx.fiber.state === FIBER_STATE.ACTIVE`） | `src/fiber-state.ts` | 4.0.4 的 `FiberState` 是 `declare const enum`，`isolatedModules` 下不能在运行时引用，所以镜像数值；probe `fiber-state-readable` 对着真实 fiber 核了 `PENDING`／`LOADING`／`ACTIVE`／`FAILED`／`DISPOSED` 五个值，**`UNLOADING` 未被观察到**（缺口） |
| 四节点的场景演练 + D-026「测试对着真实提供者」 | `./testing`：`bootAssembly({ services?, plugins? })` → `{ ctx, fibers, dispose() }`。`services` 是装配层直接 provide 的服务值 `{ name, value }`（存储、时钟由调用方传入），由一个匿名宿主插件承载；`plugins` 按顺序装载并各自 `await`；任一插件启动失败 ⇒ 整个 `bootAssembly` 拒绝。另导出 `settle(fiber)` 供观察中间态 | `src/testing/index.ts` | **本包不 import `infra/storage-sql`**（`core` 不依赖 `infra`），夹具由调用方传入——见[关键选择](#四处关键选择)。启动失败时**已装的 fiber 不被撤除**（源码现状），见[装卸表](#成对的装载与撤除)与缺口 |

## 读数与 probe 结果

每条写：取证时的读数（对 4.0.2 源码，2026-09-22；一条按 4.0.4 改正）、probe 文件与断言、4.0.4 上的结果、什么语义消失时它会红、probe **没有**覆盖到什么。读数解释 probe 为什么这样写；**依据是 probe 的结果**，不是读数。

| # | 条目／主张 | 读数 | probe 文件与断言 | 4.0.4 结果（2026-09-22） | 什么消失时红；未覆盖 |
|---|---|---|---|---|---|
| 1 | [`isolate-hides-instances-not-data`](../../../../basis/cordis/isolate-hides-instances-not-data.md) | 解析沿 fiber 链向上，父的 isolate 标签不同即抛错不上溯（`reflect.ts`）；同标签重复 provide 抛错；同 label 的两次 `isolate()` 合流（`context.ts`） | `isolate-hides-instances-not-data.test.ts`：① 两个 isolate 标签下各 provide 一个实例、共享同一 `Map`，标签 A 的消费者解析到本标签实例（`label === 'A'`）却读到写入共享句柄的数据；② 同标签 provide 两次 ⇒ 拒绝（`/has been registered/`）；③ 同 label 两次 `isolate` ⇒ 第二处解析到第一处 provide 的实例 | 通过 | ②不再抛 ⇒ 上游引入遮蔽；①失败只可能是上游开始隔离数据。**未覆盖**：「子 isolate 里解析父标签服务抛错不回退」这条 symbol 没有断言 |
| 2 | [`async-control-not-bail`](../../../../basis/cordis/async-control-not-bail.md) | **按 4.0.4 改正**：`isBailed` 只排除 `null`／`false`／`undefined`，**Promise 本身被当作 bail 值**——`bail` 在异步监听者处停下并把 Promise 交回调用方，后面的监听者不跑（不是「Promise 被忽略、继续往下」）；`serial` 逐个 await 后按解析值判定；`emit` 丢弃返回值 | `async-control-not-bail.test.ts`：① 异步「无异议」监听者在前、同步「否决」监听者在后，`ctx.bail` 返回值是 `Promise` 实例、只有异步者跑过、Promise 解析为 `undefined`；② `ctx.serial` 三个监听者都跑、`undefined`／`false` 不算 bail 值、结果是第三个的 `true`；③ `ctx.emit` 返回 `undefined` 且三个都跑 | 通过 | ①红 ⇒ 上游让 bail await 了——「异步控制走 `serial`」的红线仍成立但理由变了；②红 ⇒ serial 不再等待，四节点所有 `serial` 控制点失效。结论与 4.0.2 读数相同，失败形态改了：不是「静默放行」，是「拿到一个 Promise 当判定」 |
| 3 | [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md) | `Fiber.store` 是必需服务实现的快照，代际由提供者 fiber uid 拼成，变则先卸载再重跑插件体（`fiber.ts`）；提供者非 `ACTIVE` 或 `check` 返回假亦然（`reflect.ts`） | `plugin-body-reruns-on-provider-change.test.ts`：消费者 `inject: ['svc']`，① 提供者不在 ⇒ 插件体未跑（0 次）；② provide ⇒ 1 次；③ 同一提供者实例内改内部状态 ⇒ 仍 1 次；④ dispose 提供者、装新提供者 ⇒ 2 次 | 通过 | ④红 ⇒ 重跑不再发生，四节点「插件体只做 provide 与校验、可重跑」的前提变了；③红 ⇒ 重跑被理解得过宽，AI「`credentials` 可选」的半径论证要重看 |
| 4 | [`effect-disposal-concurrent-not-ordered`](../../../../basis/cordis/effect-disposal-concurrent-not-ordered.md) | 同一 effect 内 disposer 逆序；fiber 卸载时各 effect 逆注册序**取出**后 `Promise.all` 并发驱动，异常只写日志不上抛（`fiber.ts`、`utils.ts`）；`UNLOADING`／已 dispose 后再建 effect 抛 `INACTIVE_EFFECT` | `effect-disposal-concurrent-not-ordered.test.ts`：① 慢 disposer（50ms）先注册、快的后注册，完成序是 `['fast', 'slow']`；② 一个 disposer 抛错，`dispose()` 仍 resolve 且第二个照常释放；③ 生成器 effect 的三个 disposer 逆序 `[3, 2, 1]`；④ dispose 后 `ctx.effect` 抛 `INACTIVE_EFFECT` | 通过 | ①红 ⇒ 上游改为顺序 await；②红 ⇒ 卸载失败开始上抛，`infra/storage-sql` 关闭句柄失败的收场要改 |
| 5 | 共用主张：**`inject` 无可选形式，可选依赖走 `ctx.get`**（AI 依赖表；probe 不对应 basis 条目） | `Inject = (keyof M)[] \| { [K]?: config }`——写进即必需；`_refresh()` 缺一即不进 `ACTIVE`；`reflect.ts` 注释「Read a service from the store without the inject requirement」 | `inject-has-no-optional-form.test.ts`：① 对象形式 `inject: { missing: undefined }` 在 `missing` 缺席时 `PENDING`、插件体不跑；② 插件体里 `resolveOptional(ctx, 'credentials')` 缺席得 `undefined`、插件体照跑一次；③ provide A ⇒ 取到 A；dispose A ⇒ `undefined`；provide B ⇒ 取到 B；④ 全程调用方插件体仍只跑了 1 次 | 通过 | ④红 ⇒ `ctx.get` 开始登记依赖，AI「`credentials` 换代不重跑本插件」失守，`resolveOptional` 要换机制；①红 ⇒ inject 默认可选，六个插件的 `PENDING` 收场全部失效。**未覆盖**：提供者处于 `PENDING`／`UNLOADING` 中间态时 `ctx.get` 的返回（只核了缺席与撤除后） |
| 6 | 共用主张：**`ctx.provide` 经 effect 纳管**（AI／OG／AR 装卸表） | `provide` 实现为 `this.ctx.fiber.effect(() => { …; return async () => { delete this.store[key] } })` | `provide-is-effect-managed.test.ts`：① 撤除提供者 ⇒ `ctx.get('accounts')` 为 `undefined`、必需 inject 它的消费者从 `ACTIVE` 回到 `PENDING`；② 插件体先 provide 再抛出 ⇒ 拒绝且该服务不可见 | 通过 | ①或②红 ⇒ 服务在 fiber 死后残留，三个节点「第二个 provide 失败则第一个随 fiber 撤」的部分失败收口不成立 |
| 7 | 共用主张：**插件体或 config 抛出 ⇒ fiber `FAILED`、不 provide**（AI／OG／AR 装卸表、offer-expiry S-14） | `fiber.ts`「`FAILED` — the callback or its config threw」；`if (this._error) return FiberState.FAILED`；plugin `Config` 是 `StandardSchemaV1`，校验失败抛 config error | `plugin-throw-fails-fiber.test.ts`：① 插件体抛出 ⇒ `await fiber` 以同一错误拒绝、`state === FAILED`；② `definePlugin` + zod `Config`，非法 config ⇒ 拒绝（`/invalid config/`）、`FAILED`、插件体**未执行**、服务不可见；③ 合法 config ⇒ `ACTIVE`，插件体拿到校验后的值 | 通过 | ①或②红 ⇒ 抛出被吞、fiber 仍 `ACTIVE`——「配置错误 ⇒ 启动失败」的机制要换（在 provide 前显式 return 并记录），`definePlugin` 随之改 |
| 8 | 共用主张：**`ctx.fiber.state` 可读，`FIBER_STATE` 镜像与真实取值一致**（AR S-22） | `FiberState` 为 `declare const enum { PENDING, LOADING, ACTIVE, FAILED, DISPOSED, UNLOADING }`；`state` 是 fiber 上的读面 | `fiber-state-readable.test.ts`：inject 缺席的 fiber `state === 0`（PENDING）；插件体内 `ctx.fiber.state === 1`（LOADING）；就绪后 `2`（ACTIVE）且 `fiberIsActive` 为真；插件体抛出 ⇒ `3`（FAILED）；dispose 后 `4`（DISPOSED）且 `fiberIsActive` 为假 | 通过 | 任一红 ⇒ 镜像数值错位，`fiberIsActive` 与 AR 主动停步跟着错。**未覆盖**：`UNLOADING`（5）没有被观察到——它是卸载进行中的瞬态，probe 未构造 |

**probe 的形式**：每条一个测试文件，依赖 `@deepseek-ai/cordis` 4.0.4 与 vitest；probe 5／7／8 另引用本包的 `resolveOptional`／`definePlugin`／`FIBER_STATE`——它们核的正是这三个共用件所依赖的语义，让共用件本身进 probe 是有意的。断言写「当前语义成立」而不是「上游应该如此」——红了就是版本真的改了什么，D-025 要的正是这个信号。

## 四处关键选择

### probe 放在产品包 `packages/core/kernel-basis/tests/basis/`，不放开发工具、不散在各消费者的测试里

| | 放 `tools/`（落选） | 散在各消费者包的测试里（落选） | **放本包（已落）** |
|---|---|---|---|
| 证的是哪个版本 | 开发工具的依赖树可以钉另一个版本——证的不是产品包依赖的那个 | 同一版本 ✓ | 同一 workspace catalog 的钉版 ✓ |
| basis `probe` 字段指向哪 | 一条产品设计的证据指向开发工具 | 四条条目指向四个不同的包，升级时要跑四处 | 一处，D-025 已写明路径，四条已回填 |
| 谁拥有失败 | 工具维护者 | 消费者节点——但红的是内核语义不是它的契约 | 本节点；红了报 basis 维护者与受影响节点 |
| 本方弱点 | — | — | 一个产品包携带一批**不测自己**的测试；CI 时间与「这个包有什么用」的解释成本 |

落选方（散在消费者）的最强论证：probe 挨着依赖它的设计，语义一变最先红的就是受影响的那个包。它输在升级流程：basis README 要求升级时「先跑全部 probe」，散开就没有「全部」这个入口。

### `definePlugin` 的 `Config` 走 Standard Schema（zod），不复用 identity-values 的 JSON Schema 校验器

| | ajv／JSON Schema（identity-values 与 offer-expiry 校验**交换表示**用的）（落选） | **Standard Schema，测试与消费者用 zod（已落）** |
|---|---|---|
| 与 Cordis `Config` 的接口 | JSON Schema 不实现 Standard Schema，要写一层适配 | zod 4 原生实现 Standard Schema v1，直接放进插件 `Config`；本包源码只依赖 `@standard-schema/spec` 的类型，不绑死 zod |
| 校验的对象 | 契约的规范工件（Schema 文件从 spec 复制进包，CI 核逐字节相同） | **插件 config**——部署输入，不是任何契约的交换表示，没有规范工件可对 |
| 谁执行校验 | 插件体自己调 | **内核**在插件体运行前校验（probe 7 ②）：插件体不用写一行校验代码，也就没有「忘了校验」这条路 |
| 代价 | 一个适配层 | 代码库里有两个校验器 |
| 本方弱点 | — | 两个校验器；zod 4.6.5 由 workspace catalog 钉版，未另立决定 |

两者校验的东西不同（交换表示 vs 部署配置），「一个概念一份权威」在这里不成立，因为不是同一个概念。

### `bootAssembly` 由调用方传入服务值与插件，本包不 import `infra/storage-sql`

| | `./testing` 内建 sqlite 临时文件夹具（落选） | **调用方传入 `services: [{ name, value }]` 与插件（已落）** |
|---|---|---|
| 层次 | `core` 依赖 `infra`——协议层依赖它的一个实现 | `core` 只依赖 `core`；夹具在 `infra/storage-sql` 自己的测试入口（候选，批 B）里 |
| 每个测试文件写什么 | 一行 | 三四行：建临时文件、起 storage 实例、作为服务值传入 |
| 换提供者跑同一批场景 | 改本包 | 改测试文件的一行 |
| 本方弱点 | — | 样板重复；「每个测试文件一个库、不共享」是调用方纪律，本包管不到；传入的是**服务值**而不是插件，所以 storage 的装卸（关闭句柄）也由调用方自己做，`dispose()` 只撤 fiber |

落选方的最强论证：D-026 说测试夹具**就是** sqlite 临时文件库，只有一种，为什么不内建。它输在依赖方向：`kernel-basis` 被 `infra/storage-sql` 消费（`definePlugin`），反向 import 就是循环。

### 本包不碰 `Parsed<T>`

`Parsed<T>` 的名字与形状归 identity-values（它的契约投影定义了它）；本包若为它提供助手就得 import 它，`kernel-basis → identity-values` 这条边为一个类型别名而存在。`Outcome` 的第二臂是 `failure`，`Parsed` 的第二臂是 `invalidInput`——两种失败不该互相冒充，所以本包也不提供结构性的通用助手。**源码现状**：`package.json` 声明了对 `@omne-harness-lite/identity-values` 的依赖，但 `src/` 没有任何 import——按本设计这条依赖应删，记在缺口。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 无契约依赖 | — | — | — |
| `@deepseek-ai/cordis` 4.0.4（D-025） | 普通包依赖；probe 对它写；`resolveOptional`／`fiberIsActive`／`bootAssembly` 读它的 `Context`／`Fiber` 读面 | 随 workspace catalog 钉版 | 升级 ⇒ 先跑全部 probe（basis README「怎样被消费」）；红的条目就是真正变了的语义 |
| `@standard-schema/spec` | 只依赖类型（`definePlugin` 的 `Config`） | — | — |
| zod 4.6.5（catalog） | `package.json` 列为依赖；本包源码不 import 它，测试与消费者用它写 `Config` | — | 换校验库 = 换消费者的 `Config` 写法，`definePlugin` 不变 |
| 存储、时间源 | **不消费**——本节点无事实、无期限判定；`./testing` 只是把调用方传入的服务值 provide 出去 | — | — |

**被谁消费**：四个 tenancy 插件节点（共用件 + `./testing`）、`infra/storage-sql` 与 `infra/clock`（`definePlugin`）。**`./testing` 只被测试代码 import**，产品代码不得依赖它——一条静态检查（候选，仓库 lint），登记在 verification。

**配置错误政策**：本节点无配置；它**实现**那条政策（`definePlugin` 把 `Config` 交给内核校验）。同批六个插件（四个 tenancy + 两个 infra）的 config 校验都经它，收场一律「fiber `FAILED` ⇒ 启动失败」。

## 状态、并发与失败映射

本节点**无状态、无存储、无提交点、无锁**。

- `definePlugin`：config 不过 ⇒ 内核让 fiber `FAILED`、`await fiber` 拒绝（这是政策要的），不是返回值。
- `resolveOptional`：缺席 ⇒ `undefined`，不抛。
- `fiberIsActive`：纯读。
- `bootAssembly`：任一插件启动失败 ⇒ 先逆序撤已装的 fiber（含失败那一条）再拒绝，错误原样透出（`invalid config` 或插件体的异常）；某条插件 `ctx.plugin` 返回后仍 `PENDING`（必需服务不在前面的插件里）⇒ 视为清单错误，同样撤已装、拒绝——不等待、不设超时常量。
- probe：每条只在它自己的 Context 里跑，互不共享 fiber。

## 成对的装载与撤除

本节点没有插件、没有 effect。唯一取得资源的是 `./testing`：

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| `bootAssembly`：一个新 `Context` + 一条承载 `services` 的宿主 fiber（有 services 时）+ `plugins` 各一条 fiber，按顺序各自 `await` 到 `ACTIVE` | 调用它的测试文件；全部 fiber `ACTIVE` 后 `bootAssembly` 才 resolve | 任一 fiber 启动失败或装后仍 `PENDING` ⇒ 先逆序 `dispose` 已装的全部 fiber（含失败那一条）再拒绝（`src/testing/index.ts`），调用方传入的 storage 句柄随宿主 fiber 一起撤 | `dispose()`：逆序逐个 `await fiber.dispose()`——宿主 fiber 撤除时服务从 store 消失（probe 6）；**服务值本身的关闭归调用方**（它传的是值不是插件），例如 storage 实例的 `close()`；**不保留任何东西**；临时文件由测试文件自己删。dispose 的完成不等于全部 disposer 成功（basis 条目 4：异常只写日志） |

## 实施缺口与消费者影响

- **`package.json` 对 `identity-values` 的依赖无 import**：应删；owner 本节点。
- **probe 未覆盖**：`UNLOADING` 取值、子 isolate 解析父标签服务抛错、提供者中间态下 `ctx.get` 的返回——三处各缺一条断言；owner 本节点，升级 Cordis 前补齐更稳。
- **四条不对应 basis 条目的 probe**是否升格：归 basis 维护者，按 basis 准入另议；本节点只维护测试。
- **`./testing` 不被产品代码依赖**的静态检查：检查器不存在。
- **消费者影响**：AI 的 `credentials` 可选依赖、AR 的 S-22 主动停步、六个插件的启动失败政策，各自依赖 probe 5／8／7；四个 tenancy 节点正文里「待核对主张」的措辞可改为指向对应 probe 文件（不在本节点可写范围）。
