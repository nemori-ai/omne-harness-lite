# ts-checks

产品源码（`packages/` 与 `apps/`）的结构检查：契约与 realization 节点 verification 点名的静态检查，
规则检查文本、路径与 TypeScript 语法，不做跨文件类型分析。类型层的检查（失败集合闭合等）
在各包的 `tests/*.spec-d.ts` 里，不在这里。

新规则（`restricted-call-sites` 的扩展与其后各条）跑在 `src/source-text.ts` 的词法视图上：
注释与字符串、模板、正则字面量的内容不算代码，括号按代码配对。`no-bail-control` 与
`restricted-call-sites` 的前两项仍逐行扫原文。新增 core 与身份规则使用已锁定 TypeScript 的语法树，
不构造类型检查 Program。按路径写死的位置集中在 `src/layout.ts`，入口层包的路径以
[governance-center-entry verification「包布局常量」](../../.meta_harness/design/realization/packages/tenancy/governance-center-entry/verification.md#静态检查)为准。
**被查的包不存在时规则无事可查、静默通过**；包存在而规则依赖的布局锚点（入口层包的
`src/events.ts` 与 `src/ops/`、账号能力包的 `src/plugin.ts`、注册组合包的 `TERMINAL_OUTCOMES`）缺席时报出，不静默失效。

| 规则                             | 来源                                                                                  | 查什么                                                                                                                                                                                                                                                                                                                                                                                   | 不覆盖                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-wall-clock` | offer-expiry 节点 SC-OE-3 | 原生产范围保留，infra 与测试豁免；Date.now、performance.now、无参 new Date，含解码成员与同文件 const/解构别名 | 跨文件/可变赋值/函数传参/动态成员的数据流 |
| `no-bail-control`                | basis `async-control-not-bail`                                                        | 不得调用 `ctx.bail(`，异步控制走 `serial`                                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                     |
| `no-testing-import` | apps/tenancy-host verification | 产品源码不得 import testing 子入口；静态、侧效应、字面动态/require、重导出、类型与解码说明符均查，测试豁免 | 非字面说明符、通过函数传参的动态装载 |
| `restricted-call-sites`          | AI S-30、OG S-42、入口契约 SC-1                                                       | `accounts.produce(` 与 `'organization-purge'` 只出现在 `tenancy/account-registration`（及定义它们的包）；`createPersonal(`、`activate(`、`purge(`、`sweepStaleSelections(`（`.m(` 与解构后的 `m(` 都算）同样只许在 AR 与定义它们的包（OG；AI）。入口层路由表不点名这四个，入口层包里出现即违反                                                                                           | `apps/` 不在扫描根内（装配调 `sweepStaleSelections` 不受查）；经别名或 `obj[name](` 调用                                                              |
| `ops-import-whitelist`           | 入口契约 SC-2；入口节点约束第 5 条；主线 2026-09-23 裁决（cordis、zod 纳入）          | 入口层包 `src/ops/**` 只许导入 `@omne-harness-lite/kernel-basis`、`storage`、`offer-expiry`（恰这三个名，不含子入口）、`@deepseek-ai/cordis`、`zod`、`node:*`、`src/events.ts` 与 ops 目录内文件；动态导入的说明符须是字面量。`src/events.ts` 只许导入 `node:*`、`@deepseek-ai/cordis`、`zod`：不导入任何 `@omne-harness-lite/*`，也不做相对导入（它在白名单里，这两种都会让传递图越界） | 类型导入与运行时导入不分（都算）                                                                                                                      |
| `ops-event-whitelist`            | 入口契约 SC-2；入口节点约束第 5 条（事件订阅白名单）                                  | `src/ops/**` 里 Cordis 上下文（成员链含 `ctx`／`context`、标注为 `Context` 或由它们直接赋值的名字）的 `on`／`once` 第一个实参只能是从 `src/events.ts` 导入的 `serving`、`stopped`、`defect`，`emit`／`parallel`／`serial` 只能是 `listening`（具名导入可改名，命名空间导入的成员也认）；字符串字面量与计算出的名字报出                                                                   | Node 发射器（`server.on('error')`）不查；经解构（`const { on } = ctx`）、函数返回值或多次转手的上下文；`emit(thisArg, name)` 重载按首个实参判，会报出 |
| `single-table-entry`             | 入口契约 S-28；入口节点约束第 4 条                                                    | 入口层包源码里 `selectFrom`／`insertInto`／`updateTable`／`deleteFrom`（及 `replaceInto`、`mergeInto`、各类 `join`、`createTable`／`alterTable`／`dropTable`、`lockRow`）的表名只能是 `'governance_center'`（可带 `as 别名`）或本包里定义为该字面量的常量；不出现 `sql` 模板与 `sql.raw(`                                                                                                | 成员表达式、拼接、数组等判不出的写法一律报出（按违反处理，不放过）；`createIndex(...).on(...)`                                                        |
| `no-peer-address`                | 入口契约 S-16；入口节点约束第 2 条                                                    | 入口层包源码不出现 `remoteAddress`／`remotePort`／`remoteFamily`、`x-forwarded-for`／`x-real-ip`／`forwarded` 头（字面量或 `.forwarded`，大小写不论）                                                                                                                                                                                                                                    | 遍历 `rawHeaders` 并以非字面量方式比对；「不保存按来者的状态」（T-16 覆盖）                                                                           |
| `credentials-parse-only`         | 入口契约 S-19；入口节点约束第 7 条                                                    | 入口层包源码不出现 `.derive(`、`.verify(`、`.checkPolicy(`（不分接收者）                                                                                                                                                                                                                                                                                                                 | 经别名或 `obj['verify'](` 调用                                                                                                                        |
| `presentation-only-authn`        | 入口契约 S-11、S-24；AI v2 S-30 第 10 行；入口节点约束第 8 条与 design S-24 行        | 入口层包源码不出现 `.verify(`、`parseLoginStateId`（导入或经命名空间调用）、`as LoginStateId` 与 `<LoginStateId>` 断言；不解析 `accounts` 服务：`inject`、`ctx.get(`、`resolveOptional(ctx, …)` 里的 `'accounts'`，以及 `ACCOUNTS_SERVICE` 常量的任何引用                                                                                                                                | `Caller` 只在 ② 阶段模块构造（布局常量未点名 ② 阶段模块）；四处调用的实参只从 `Caller` 取（类型层）；以改名导入的类型做断言                           |
| `no-network-listen-in-tenancy`   | 入口契约 S-25；入口 verification R-20                                                 | `tenancy/*/src` 不导入 `node:http`／`https`／`net`／`tls`（含无 `node:` 前缀的同名模块）、不调 `.listen(`；入口层包之内只许 `src/transport/**` 与 `src/ops/**`                                                                                                                                                                                                                           | `node:http2`、`node:dgram`；非字面量的动态导入                                                                                                        |
| `no-presentation-in-diagnostics` | AI v2 S-45／S-46；AI verification                                                     | 账号能力包源码里日志方法（`.info/.warn/.error/.debug/.success`）、`.emit/.parallel/.serial`、`new *Error(`、`defect(` 的实参（含模板插值）不出现 `presentation`（裸名、成员或键）、`LoginStatePresentation`、本文件标注为该类型的名字、由 `generatePresentation(`／`parseLoginStatePresentation(` 直接赋值的名字                                                                         | 经别的变量转手、经辅助函数拼进消息、经不在上列的诊断外观调用；这些由 S-46 ② 的动态翻查兜底                                                            |
| `no-random-source-inline`        | AI v2 S-45（熵下限）；AI verification 两条文本规则                                    | 账号能力包源码不出现 `Math.random`；`randomBytes` 等 crypto 随机函数只在 `src/presentation.ts`；插件体 `src/plugin.ts` 里 `random:` 的值只能是 `cryptoRandomSource`，简写 `{ random }` 报出                                                                                                                                                                                              | 服务实现类以位置参数接随机源；插件体构造分散到别的模块                                                                                                |
| `ai-r8-no-credential-in-write`   | AI v2 S-30 第 4 行；AI design R-8                                                     | 账号能力包源码里 `storage.write(` 实参的词法范围内不出现 `credentials.verify/derive/checkPolicy/parse(`                                                                                                                                                                                                                                                                                  | 经辅助函数（如回调里调的 `#issueCommitted`）的间接调用、改名的凭据服务变量——由 AI 包的替身标记测试（形式 ②）补                                        |
| `sc-oe-1`                        | offer-expiry S-7；offer-expiry 节点 SC-OE-1                                           | 消费者包（除 `core/offer-expiry`）里名为 `*Record`／`*Row`／`*Table` 的 interface 与对象类型别名不以 `OfferState` 为字段类型                                                                                                                                                                                                                                                             | 不按命名约定起名的持久记录类型；把 `OfferState` 值写进字符串列（类型上本来就是 `string`）                                                             |
| `sc-oe-2`                        | offer-expiry S-13；offer-expiry 节点 SC-OE-2                                          | 消费者的接受路径——名为 `accept` 后接大写字母的函数、方法、赋给该名的箭头函数的块体（含其中嵌套回调）——不对 `pending`／`accepted`／`withdrawn`／`expired` 做 `===`／`!==`／`case` 比较，只经 `acceptable()`                                                                                                                                                                               | 经辅助函数逐值比较；`includes`／查表式分派；不以 `accept*` 命名的接受路径                                                                             |
| `sc-cv-1`                        | AI S-8；CV 节点 SC-CV-1                                                               | `tenancy/*` 除 CV 包外，对凭据材料值（标注为 `CredentialMaterial` 的名字、末段为 `material`／`credential_material` 的成员、`(… as CredentialMaterial)`）不做任何成员访问或下标、不交给正则 `.exec(`／`.test(` 或 `JSON.parse(`。品牌断言本身不算违反                                                                                                                                     | 经别的变量转手后再解析；`String.prototype.split.call(m)` 一类间接调用                                                                                 |
| `terminal-outcome-closed`        | AR S-5；AR verification「S-5 四值闭合」                                               | AR 包的 `TERMINAL_OUTCOMES` 恰为 S-5 的四个字面量；`TerminalOutcome` 只由它派生；返回类型标注含 `TerminalOutcome` 的函数体（扣掉嵌套函数）里 `return '<字面量>'` 都在常量里；不出现 `as TerminalOutcome`／`<TerminalOutcome>`                                                                                                                                                            | 条件表达式或辅助函数给出的返回值（由类型检查兜底）                                                                                                    |
| `og-s42-dynamic-resolve`         | OG S-42 第 4 行；AI S-30                                                              | `organization-purge` 服务经 `ctx.get(…)`、`resolveOptional(ctx, …)`、`inject: [...]`／`{...}`／`ctx.inject([...])` 解析只许在 AR（OG 自己也不许，它只 provide）；`ORGANIZATION_PURGE_SERVICE` 常量只在 AR 与 OG 出现                                                                                                                                                                     | 服务名经变量拼出后再解析                                                                                                                              |
| `no-dialect-bypass`              | 架构评审 N-2；storage-sql 节点「Driver 的边界」；tenancy-host「同一存储、同一约束域」 | `tenancy/*/src` 不从 `@omne-harness-lite/storage-sql` 导入 `NodeSqliteDialect`、`NodeSqliteDriver`、`SqlStorage`、`openStorage`（具名导入，或命名空间／默认导入的成员），不 `new Kysely(`；测试豁免                                                                                                                                                                                      | 经别的包转手取得连接；`kysely` 的其他构造入口                                                                                                         |

```sh
pnpm run lint:rules          # 根：扫描 packages/ 与 apps/，有违反即退出 1
pnpm --filter @omne-harness-lite/ts-checks test   # 规则自测
```

自测分四个文件：`tests/rules.spec.ts`（老规则）、`tests/entry-rules.spec.ts`（入口层包各条，另在临时目录造出整个包，
经 `collectSources` 与 CLI 证明违反时退出 1、合规时退出 0）、`tests/account-identity-rules.spec.ts` 与
`tests/consumer-rules.spec.ts`（除两向夹具外，读真实产品源码做变异核对：原文无违反、注入一处违反即被报出）；
`tests/source-text.spec.ts` 守词法视图本身。变异核对的锚点是真实源码里的一段文字，产品源码改写后锚点失配会让测试失败——
那时更新锚点，不删核对。

加规则：在 `src/rules/` 写一个 `Rule`，登记进 `src/index.ts` 的 `RULES`，并补「故意违反就失败、合规就通过」的两向夹具。
规则的来源条款写进 `source` 字段，README 表里同时写「不覆盖」。

## Core 交付的规则

这些规则登记在同一 `RULES` 与 CLI 中，扫描本检出的真实产品源码。不存在的包不产生覆盖证据；
fixture 通过只证明检查器能检出指定反例，不证明尚未实现的消费者满足契约。

| 规则 | 来源 | 查什么 | 不覆盖 |
|---|---|---|---|
| `core-pure-imports` | 十五个新 core 节点 design 的公开面与依赖表；stream-assembly SC-2；asset-evaluation SC-1 | 每个节点分别登记其公开依赖，允许根入口与 Schema 子入口、本包源码/Schema、明确采用的 Ajv/YAML/regexpp 与纯 Node 构件。类型导入也检查；重导出、动态导入、require、import-type 都检查；动态说明符非字面量即报出；不穿透兄弟源码。既有 kernel-basis/storage 不在这十五包范围内 | 第三方内部的传递依赖；tsconfig 路径别名；经全局对象实施 I/O、计时或通知。import 白名单只闭合导入边界，不独自证明纯度或资源状态 |
| `identity-decision-inputs` | data.identity-values/v1 S-21/S-22；identity-values SC-1 | 仅显式注册或 JSDoc `@identityDecision` 的范围对象准入函数，检查参数类型中的登记物理类型名/品牌。识别本文件类型别名、接口成员、具名 import 改名，以及 `Branded`/`OpaqueIdentifier` 的字面品牌。登记目标或类型标注缺席即报出 | 未登记也未标注的函数；跨文件类型别名、泛型实例化和接口继承；参数身体中偷偷获取的外部依据。组织结构/流转谓词不属于 S-21 的准入范围。当前默认函数注册表为空，不因此声称消费者隔离通过 |
| `identity-account-references` | data.identity-values/v1 S-24；identity-values SC-2 | account-identity 包的 AccountRecord/AccountRow 或 `@accountRecord` 的直接对象声明，识别第二个 AccountId 字段。当前 AccountRow 的自身份 account_id 是 string，新增 typed AccountId 引用仍报出。具名 import 改名、本文件别名和 OpaqueIdentifier 品牌可识别 | 普通 string 列、任意聚类键的业务含义；跨文件/继承/联合形式的记录，以及另建关联表。这些仍需字段清单与数据形状评审，不能将本规则当成 S-24 全覆盖 |
| `identity-scope-columns` | data.identity-values/v1 S-11/S-16；identity-values SC-9 | 持久 *Record/*Row/*Table 或 `@scopedRecord` 的直接对象形状里，成对可空 organization/tenant 列；支持 optional、null/undefined 联合和本文件 nullable 别名 | 重命名后的归属字段、跨文件/继承/复合形式的记录；不证明所有对象都携带 ScopeLayerIdentity。完整 ScopeLayerIdentity 形状另由 Schema 与品牌类型测试检查 |

`no-wall-clock` 同时服务 SC-OE-3 与两个纯 capability 节点的时钟禁令；现有 Date.now 反例保留，
新增无参 new Date 与 performance.now 的必红反例，合法 new Date(explicitInstant)、注释和字面量不误报。
不另建同义规则。

`no-wall-clock` 已改用 AST，同文件 const/解构别名、解码成员和 globalThis 访问也检查；原生产范围及 infra/测试例外保留。
不跟踪跨文件、可变赋值、函数传参或动态成员的数据流，不证明 clock 的租约/回拨保证。
`no-testing-import` 现在解析说明符，静态/侧效应 import、重导出、import-type、字面 import()/require() 与解码拼写都检查，
注释/字符串示例不算导入；测试豁免保持。计算说明符不能由此规则确定是否指向 testing；十五纯模块另由 core-pure-imports 拒绝非字面说明符。

当前批准的精确 Schema runtime 子入口是 `@omne-harness-lite/content-blocks/schema-runtime`；消费者必须已有 content-blocks 依赖。
旧 asset-model/schema-runtime 已随实际提供者迁移移出登记，即使消费者仍依赖 asset-model 也会拒绝；相邻私有路径不获准。
本包内部复用走相对路径，子入口登记不增加未经采用的 self import 或任意包依赖。

新增范围化规则的实际注册在 `src/rules/core-scoped.ts`：

| 规则 | 默认实际范围 | 不覆盖 |
|---|---|---|
| body-projection-inputs | tool-definition、loop-extension、skill-package、mcp-endpoint 各自的 declarations.ts，共七个声明／引用函数；类型 import、登记正文参数、MCP 显式可选动作副本、直接宿主全局/隐式 this；每包独立触发，存在包丢失模块或函数必红 | Slash 尚无源码，Connector 本阶段延期；包缺席是覆盖缺口。保留/治理项的完整动态返回由 asset-model 守卫及真实端口组合测试证实；不证明任意跨文件状态读取不存在 |
| parameter-judge-cache-owner | 工具 parameters.ts/createParameterJudge 中登记的编译器/动态 cache 分配点，必须在调用方工厂内；同文件标识符别名也查 | 不禁整个包/全仓 Map/Set；固定自有 Schema 编译不在此模块范围；不证明 GC 时点、内存上界、间接工厂或对象独立性 |

这两条随实际工具包出现生效；源码尚不存在的包不产生符合性证据。
另有三个要求实际消费路径的工厂：createSingleToolArgumentParser、createModelToolNameOrigin、createMessageCreatedAtOrder。
封口工厂明确指定函数，严格解析点恰一处；raw 消费者逐函数点名，通用 JSON 读写不进入该范围。
名字规则只守登记名字参数的切片/前缀/分隔符操作，规范 modelName/definitionNameOf 转换函数不登记为来源判断消费者。
createdAt 规则只守登记消息次序函数的比较/差值/排序，表示层日期校验与原样记录允许。
名字/次序工厂拒绝空消费者配置，所有指定函数缺席会失败；它们尚未挂空配置到默认 RULES，fixture 不构成不存在消费者的合规证据。
stream 解析是否仅在已接受 close 路径可达、snapshot/closeOut/partial 是否零调用，还需行为计数；词法别名检查不替代控制流证明。

`asset-model` 的 S-17 字面目录规范化明确采用 `path.normalize` 一类纯运算，允许 `node:path`（及同义的 `path`）导入。
检查器不因此证明代码没有调用 `resolve()` 隐式取得 cwd；绝对输入、相对输入拒绝、无文件系统访问仍由节点实现测试核对。
直接采用严格 JSON 工具的 asset-model、call-accounts、messages、arrival-events、model-response、stream-assembly、asset-evaluation
均可导入 content-blocks 的公开入口。mcp-endpoint 经已接受的 [中性技术依赖](../../.meta_harness/design/realization/packages/core/mcp-endpoint/design.md#依赖作用域与绑定)
另行批准 content-blocks 根与精确 Schema/runtime 入口；不因此新增块语义的契约边、不允许任意子路径。
MCP 推出模块仍只导入类型；远端 inputSchema 仅按对象原样保留，不因工具依赖采用而获得编译/筛选远端 Schema 的责任。

身份清单从 `@omne-harness-lite/identity-values` **公开入口**的 `IDENTITY_TYPE_NAMES` 取得，
没有第二份领域名单。`IDENTITY_CHECK_INPUTS` 暴露规则输入；物理类型名是这项语法检查的登记表示，
新的消费者品牌须通过任务明确注册，不能仅因“名字像”就认定业务含义。
消费者可通过 `createIdentityDecisionInputs({ ...IDENTITY_CHECK_INPUTS, decisionTargets: [{ path, functionName }] })`
配置明确的模块与函数；注册规则检查所需模块必须作为同一批输入提供。默认 CLI 同时识别 JSDoc 标注，
标注本身不构成隔离保证，实施/调度者须盘点准入函数是否全部进入适用范围。

`tests/core-rules.spec.ts` 包含十五包逐一禁止依赖、允许公开入口、字面量解码、真实 CLI 退出值、
身份规则正反例与真实 AccountRow 的内存变异。变异不修改产品源码。

## 后续 core 静态义务的兑现方式

下表是开发者选择检查形式的导航，语义和责任仍归各节点 design「静态检查义务怎么承载」。
只读到节点要求不等于检查已实现；所有新增形式须各有有效正反例，再对实际实现核对。

| 节点 | 本阶段可机检的形式与建议 | 需要消费者或实际行为的部分 |
|---|---|---|
| content-blocks | SC-3 opaque 品牌不兼容的负向类型测试；无 rawArguments 解析辅助的公开面核对。SC-2 与 stream-assembly SC-1 合并为一个指定解析模块的规则，等待真实模块落点后注册 | 会话日志 SC-1/SC-4；消费者 opaque 读写、是否对完整/半截调用采用正确输入 |
| asset-model | SC-6 的 BodyContracts 错类负向类型测试与端口结果守卫；六正文推出模块的 import 范围由一个共享规则承载，须先确定各模块路径，不能从整个包只许类型推断局部范围 | SC-1～SC-5 的资产治理/流转写路径与读面 |
| model-profile | S-13 判别联合的负向类型测试；S-22 闭合 ModelProfile/Schema 的凭据反例 | 档案目录的状态写入与持久形状 |
| call-accounts | SC-2 用汇总入口的权威投影及手算 oracle 核不重复计；完整工具账合法保留 total_usd/usage，先校验再在汇总投影排除；SC-3 派生字段的公开负类型与 Schema 反例。不扫任意字面字符串 | SC-1 组装输入、SC-4 原账写入路径 |
| messages | SC-4 公开 isReadable 函数与不暴露“当前可读集合”；SC-3 比较/排序检查必须先注册真实消费者路径和 createdAt 接收者 | SC-5 翻译方穷尽检查；日志及其他消费者 SC-1/SC-2/SC-6 |
| tool-definition | V-10 定义 JSON 形状的负向类型测试；推出规则与其他正文共用局部 import 规则；工具名解析规则需点名值/品牌及合法转写模块后再实施 | 名字经变量转手、运行时对象混入与消费者侧取来源行为 |
| loop-extension | 推出规则模块加入 asset-model SC-6 的同一局部 import 规则 | runner V-5 每件必留 |
| skill-package | SC-1 核公开面不提供 body 变换；SC-4 推出模块加入同一局部 import 规则 | 读入方实际保持原文；执行运行时/注册表 SC-2/SC-3 |
| connector | 信封不带归属成员、正文不带凭据与目标的负向类型测试 | SC-1～SC-4 均约束受理、接入端与正文写路径 |
| mcp-endpoint | SC-1 正文不带凭据、SC-3 not_fetched 与数组不兼容的负向类型测试；SC-2 共用推出模块规则；SC-4 点名唯一逐动作键函数并用输入输出反例核对 | MCP 桥不经 shell；资产治理不按动作集清理配值 |
| arrival-events | 统一纯模块导入边界；本节点没有自承载的 SC-1～SC-4 | 传输适配、发帧、节流消费者 |
| model-response | Schema/公开类型与三类发送失败成因的反例核对，不建立整仓词汇禁令 | 写入、脱敏、重试责任在模型运行时 |
| slash-command | SC-3 failed 分支与可发送值不相容、SC-4 parseInvocation 无权限参数的类型测试；SC-6 共用推出模块规则 | 交付/受理/发布 SC-1/SC-2/SC-5 及实际发送行为 |
| stream-assembly | SC-2 导入由 core-pure-imports、时钟由 no-wall-clock 承载；SC-1 与 content-blocks 采用同一指定解析模块规则 | SC-3 拒绝不改状态与 SC-4 快照不共享可变部分须实际测试，不能靠 import 白名单替代 |
| asset-evaluation | SC-1 的导入与时钟复用已有两条规则；SC-3 判别结果类型及无结果分支的实际反例 | SC-2 消费者缓存键；纯度的全局访问和实际副作用仍需代码审阅/测试 |
