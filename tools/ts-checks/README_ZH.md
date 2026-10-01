# ts-checks

`evaluation-publication-boundary` 仅允许 EIS 自身、受信验收 bootstrap/tests，以及精确的 `packages/model/model-request-runtime/tests/session-selection-fixture.ts` 通过静态公开入口访问发布面。该 fixture 为选择测试构造真实 SQL／治理／EIS 来源；许可不扩展到 runtime 产品源码或相邻测试文件，转导出、动态转发和私有发布入口仍拒绝。正反验证命令：`pnpm --filter @omne-harness-lite/ts-checks exec vitest run tests/evaluation-publication-boundary.spec.ts`。

产品源码与开发示例（`packages/`、`apps/` 与 `examples/`）的结构检查：契约与 realization 节点 verification 点名的静态检查，
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
| `no-wall-clock` | offer-expiry 节点 SC-OE-3 | 原生产范围保留，infra 与测试豁免；CG1/D047仅另豁免 `frontend/governance-client-operations/src/observation-time.ts` 的副本显示时刻；Date.now、performance.now、无参 new Date，含解码成员与同文件 const/解构别名 | 跨文件/可变赋值/函数传参/动态成员的数据流 |
| `no-bail-control`                | basis `async-control-not-bail`                                                        | 不得调用 `ctx.bail(`，异步控制走 `serial`                                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                     |
| `no-testing-import` | apps/tenancy-host verification | 产品源码不得 import testing 子入口；静态、侧效应、字面动态/require、重导出、类型与解码说明符均查，测试豁免 | 非字面说明符、通过函数传参的动态装载 |
| `restricted-call-sites`          | AI S-30、OG S-42、入口契约 SC-1                                                       | `accounts.produce(` 与 `'organization-purge'` 只出现在 `tenancy/account-registration`（及定义它们的包）；`createPersonal(`、`activate(`、`purge(`、`sweepStaleSelections(`（`.m(` 与解构后的 `m(` 都算）同样只许在 AR 与定义它们的包（OG；AI）。入口层路由表不点名这四个，入口层包里出现即违反                                                                                           | `apps/` 不在扫描根内（装配调 `sweepStaleSelections` 不受查）；经别名或 `obj[name](` 调用                                                              |
| `ops-import-whitelist`           | 入口契约 SC-2；入口节点约束第 5 条；主线 2026-09-23 裁决（cordis、zod 纳入）          | 入口层包 `src/ops/**` 只许导入 `@omne-harness-lite/kernel-basis`、`storage`、`offer-expiry`（恰这三个名，不含子入口）、`@deepseek-ai/cordis`、`zod`、`node:*`、`src/events.ts` 与 ops 目录内文件；动态导入的说明符须是字面量。`src/events.ts` 只许导入 `node:*`、`@deepseek-ai/cordis`、`zod`：不导入任何 `@omne-harness-lite/*`，也不做相对导入（它在白名单里，这两种都会让传递图越界） | 类型导入与运行时导入不分（都算）                                                                                                                      |
| `ops-event-whitelist`            | 入口契约 SC-2；入口节点约束第 5 条（事件订阅白名单）                                  | `src/ops/**` 里 Cordis 上下文（成员链含 `ctx`／`context`、标注为 `Context` 或由它们直接赋值的名字）的 `on`／`once` 第一个实参只能是从 `src/events.ts` 导入的 `serving`、`stopped`、`defect`，`emit`／`parallel`／`serial` 只能是 `listening`（具名导入可改名，命名空间导入的成员也认）；字符串字面量与计算出的名字报出                                                                   | Node 发射器（`server.on('error')`）不查；经解构（`const { on } = ctx`）、函数返回值或多次转手的上下文；`emit(thisArg, name)` 重载按首个实参判，会报出 |
| `single-table-entry`             | 入口契约 S-28；入口节点约束第 4 条                                                    | 入口层包源码里 `selectFrom`／`insertInto`／`updateTable`／`deleteFrom`（及 `replaceInto`、`mergeInto`、各类 `join`、`createTable`／`alterTable`／`dropTable`、`lockRow`）的表名只能是 `'governance_center'`（可带 `as 别名`）或本包里定义为该字面量的常量；不出现 `sql` 模板与 `sql.raw(`                                                                                                | 成员表达式、拼接、数组等判不出的写法一律报出（按违反处理，不放过）；`createIndex(...).on(...)`                                                        |
| `no-peer-address`                | 入口契约 S-16；入口节点约束第 2 条                                                    | 入口层包源码不出现 `remoteAddress`／`remotePort`／`remoteFamily`、`x-forwarded-for`／`x-real-ip`／`forwarded` 头（字面量或 `.forwarded`，大小写不论）                                                                                                                                                                                                                                    | 遍历 `rawHeaders` 并以非字面量方式比对；「不保存按来者的状态」（T-16 覆盖）                                                                           |
| `credentials-parse-only`         | 入口契约 S-19；入口节点约束第 7 条                                                    | 入口层包源码不出现 `.derive(`、`.verify(`、`.checkPolicy(`（不分接收者）                                                                                                                                                                                                                                                                                                                 | 经别名或 `obj['verify'](` 调用                                                                                                                        |
| `presentation-only-authn`        | EC2 S-11、S-24、S-50 / D044；AI3 S-30；入口 v2-design        | 入口层包源码不出现 `.verify(`、`parseLoginStateId`（导入或经命名空间调用）、`as LoginStateId` 与 `<LoginStateId>` 断言；`accounts` 方法调用仅允许 `participate` / `resolveActivatedIdentifier`，不允许普通账号读写作为入口                                                                                                                                | `Caller` 只在 ② 阶段模块构造（布局常量未点名 ② 阶段模块）；四处调用的实参只从 `Caller` 取（类型层）；以改名导入的类型做断言                           |
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
pnpm run lint:rules          # 根：扫描 packages/、apps/ 与 examples/，有违反即退出 1
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

当前允许的精确 Schema 子入口以 `src/rules/core-pure-imports.ts` 的 `PUBLIC_SUBPATHS` 为准，
包括 model-profile 的 `schema/v3` 和 asset-model 的 `schema/connector/v2`，只授予已有依赖的消费者。
messages、model-response、loop-extension、asset-evaluation 的旧执行入口已移除；保留的冻结 Schema 用于现行契约的精确依赖，
不恢复旧实现。相邻路径、未知版本和私有源码仍拒绝。model-response/loop-extension 的完整资源图也按已采用的依赖显式登记。
可运行 `pnpm --filter @omne-harness-lite/ts-checks exec vitest run tests/core-rules.spec.ts` 核对允许与拒绝边界。

新增范围化规则的实际注册在 `src/rules/core-scoped.ts`：

| 规则 | 默认实际范围 | 不覆盖 |
|---|---|---|
| body-projection-inputs | tool-definition、loop-extension、skill-package、mcp-endpoint、slash-command 各自的 declarations.ts，共九个声明／引用函数；类型 import、登记正文参数、MCP 显式可选动作副本、直接宿主全局/隐式 this；每包独立触发，存在包丢失模块或函数必红 | Connector 本阶段延期；包缺席是覆盖缺口。保留/治理项的完整动态返回由 asset-model 守卫及真实端口组合测试证实；不证明任意跨文件状态读取不存在 |
| parameter-judge-cache-owner | 工具 parameters.ts/createParameterJudge 中登记的编译器/动态 cache 分配点，必须在调用方工厂内；同文件标识符别名也查 | 不禁整个包/全仓 Map/Set；固定自有 Schema 编译不在此模块范围；不证明 GC 时点、内存上界、间接工厂或对象独立性 |
| single-tool-argument-parser | stream-assembly/src/close.ts 的 parseCollectedToolCall 恰一个 readJsonStrict 调用点；同包其它产品模块不得调用 readJsonStrict／JSON.parse，incompleteToolCall 不解析；存在包缺模块／函数即红 | 结构调用点与同文件 import/const 别名；不分析任意跨文件别名、动态成员、反射／高阶调用或导出函数的所有调用者；不证明接受分支可达性、运行时调用次数或宿主原文消费者 |

各默认登记分别随对应实际包出现生效；源码尚不存在的包不产生符合性证据。
另有两个要求实际消费路径的工厂：createModelToolNameOrigin、createMessageCreatedAtOrder。
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

## 跨组依赖方向

`group-direction` 登记在 `src/repository.ts` 的 `REPOSITORY_RULES`，随 `pnpm run lint:rules` 执行，有违反即退出 1。

| 规则 | 来源 | 查什么 | 不覆盖 |
|---|---|---|---|
| `group-direction` | [realization「packages 的两层布局」](../../.meta_harness/design/realization/README.md#packages-的两层布局)；[workspace 规范](../../docs/workspace.md)「装配负责选择提供者」 | 成员产品源码（不含测试）经 `@omne-harness-lite/*` 字面导入形成的成员间边：只能指向同层或更内层；`packages/infra` 只由最外层与它自己依赖；成员之间、组之间不成环；出现没登记层位的新组即报出 | 测试里的导入；非字面说明符；相对路径越出包边界（由包公开入口约定承担）；**层位本身对不对**——那是设计正文定的，这里只核对方向 |

层位与例外在 `src/rules/group-direction.ts` 的 `GROUP_DIRECTION_POLICY`，每条带 `source` 指回设计正文；它是机检投影，不是第二份权威：
改层位先改 realization 的布局正文，再改这张表。现存例外只有一条（`frontend/client-local-state` 直接打开本机 SQLite），登记了理由。

## 提交署名

`commit-attribution`（`src/commits.ts`）随 `pnpm run lint:rules` 执行，有违反即退出 1。它查的不是源码，
而是当前提交可达的**全部历史**，规则正文在[根 AGENTS.md 的「署名与分支」](../../AGENTS.md#署名与分支作者是人来源可追溯)。

| 报出 | 放行 |
|---|---|
| `Co-Authored-By:` 行里是 coding agent 或其厂商 | 人与人的共同署名 |
| `Generated with`／`Generated by` 一类把 agent 列为产出者的行 | `Harness:`、`Agent-Role:` 两条来源 trailer——它们记来源，不表示作者身份 |
| author 或 committer 的名字、邮箱是 agent | 提交标题与正文里提到 agent 的名字 |

报告写成 `commit <短号>:<提交信息里的行号>`。它认的是 `src/commits.ts` 里列出的那批名字，新出现的工具要加进去；
它**不核对**来源 trailer 有没有写、写得对不对——哪些提交有 agent 参与，工具看不出来。
浅克隆时只查克隆下来的那些提交；不在 git 检出里运行时通过提示会写明「未检查」。自测：`tests/commit-attribution.spec.ts`。

## 验收锁

故事卡的可执行验收放在成员的 `acceptance/` 目录，归负责的人、主会话与独立验收角色；实施的 agent 只运行、不修改
（约定见[源码布局](../../docs/workspace.md#目录与内容归属)）。`src/acceptance/` 核对这一条有没有被破：

```sh
make acceptance-lock BASE=<任务基线提交或分支>
```

**基线提交就是清单**：Git 按内容寻址，派发时不必另存一份哈希。工具拿基线与 HEAD 的合并点同当前工作树比，输出三样：

- 基线到当前工作树，验收文件的净变化（新增、修改、删除，含未提交与未跟踪）；
- 这段范围里**每一个**碰过验收文件的提交：短号、作者、来源 trailer 里的 `Agent-Role`、碰了哪些文件；
- 锁有没有被破。

| 判锁被破（退出 1） | 放行 |
|---|---|
| 碰过验收文件的提交，`Agent-Role` 不在拥有者角色里（如 `developer`、`tui-developer`） | `Agent-Role` 是拥有者角色（`main`、`qa`）的提交 |
| 工作树里有未提交或未跟踪的验收改动——说不清是谁改的 | 没有来源 trailer 的提交：按人写的算 |

哪些根目录下的成员受管、验收目录叫什么、哪些角色算拥有者，只在
[`acceptance-lock.config.json`](acceptance-lock.config.json) 里定一次。用法或 Git 出错（缺 `--base`、基线不存在）退出 2。

它**不能声称**的：角色取自提交信息里的来源 trailer，那是提交的人自己写的——一个把 `Agent-Role` 写成 `main` 的实施提交它认不出来，
所以碰过验收的提交一律列出，由接受的人过目。先改后改回的提交照样列出、照样判破，哪怕净变化为零。
它不看验收的内容对不对、有没有被运行、过没过；文件名是否带卡号也不查。自测：`tests/acceptance-lock.spec.ts`。

## 结构度量

`make metrics` 是本包的第二入口（`src/metrics/`）。它**只报告、不判失败**，不在 `make check` 里；能让检查失败的只有上面的方向规则与提交署名。

```sh
make metrics                          # 全仓，秒级：圈复杂度、依赖图、方向与环
make metrics BASE=<基线提交或分支>      # 另标出基线以来变更的成员、函数、导入与提交形状
make metrics BASE=<基线> COVERAGE=1    # 再对变更成员逐个跑测试，取覆盖率并合成 CRAP（先构建）
```

产物默认落**主检出**的 `tmp/metrics/<提交短号>[-dirty]/`（在工作树里跑也落主检出，工作树退役不带走；`OUT=` 或环境变量 `OMNE_METRICS_OUT` 可改）：

| 文件 | 内容 |
|---|---|
| `summary.md` | 不超过 12 行，同时打印到标准输出；交付说明原样附它 |
| `metrics.json` | 每个成员与每个函数的圈复杂度、覆盖率、CRAP、是否变更 |
| `graph.json` | 成员间的边与导入处、方向发现、环、已登记例外 |
| `review.html` | 自包含、离线可开的审讯页：按层的结构图、度量着色、点成员看依赖与函数表 |
| `coverage/` | 开了覆盖率时各成员的原始 `<成员>/coverage-final.json` 与测试输出 `<成员>.vitest.log`；每个成员的耗时与退出码另记在 `metrics.json` 的 `meta` 里，运行时逐个打到标准错误 |

审讯页的网址后带成员路径可直接定位，例如 `review.html#packages/model/model-request-runtime`。

怎么算的：

- **计分单元**是有名字的函数：函数声明、类与对象字面量的方法、赋给名字的箭头函数与函数表达式；匿名回调并入它所在的单元，类与具名对象只提供限定名。
- **圈复杂度** = 1 + `if`、各类循环、`catch`、`?:`、`case`、`default`、`&&`、`||` 的个数；`??`、`?.` 与逻辑赋值不计。
- **覆盖率**取函数行范围内、且不落在更内层有名函数里的语句行的命中比例。测试经包名导入自己时执行的是 `dist/`，所以连同 `dist/**` 一起收集并由 sourcemap 映射回 `src/`。
- **跑谁的测试**：只跑 `metrics.config.json` 的 `coverage.roots` 列出的根目录（现为 `packages`、`apps`）下的变更成员。`examples/` 是阶段性的演示，不长期维护，不为它跑测试；它照常参加圈复杂度与依赖方向的静态度量，覆盖率记为「这次没跑」。
- **CRAP** = 圈复杂度² × (1 − 覆盖率)³ + 圈复杂度。没有覆盖率数据的函数只按圈复杂度评级。
- **成员风险值** = 成员内函数评级分的均值加一个总体标准差，单个最差函数不至于把整个成员染红；它在色带点上分段线性地换成 1 到 10 的评分再取色。组框左边线取组内最差成员。
- **函数是否变更**比对函数自身文本的摘要，不看 diff 行号：挪位置、上方插入代码都不算变。
- **行内排序**用重心法：按相邻成员位置的平均值排五轮，让相连的成员靠近。
- **扇入、扇出与不稳定度**：依赖它的成员数、它依赖的成员数、出 ÷（入 + 出）。
- 阈值与色带在 `metrics.config.json`，不写死在代码里：`thresholds`（函数级的「要解释」线）、`bands`（成员着色）与 `page.changedEdgeLimit`（见下）。
- **审讯页画哪些线**：选中一个成员时只画它自己的线（指向它的用虚线），别处只留违规。未选中时违规与已登记例外始终画出；本次变更触及的边不超过 `page.changedEdgeLimit` 条才逐条画，超过就只留蓝色三角并在图上方注明——大变更下逐条画只会糊成一团。

**超阈值怎么处置**：看职责不看数字。回答同一个问题的单个分派（一个 `switch`、一张判定表）可以留在阈值之上；嵌套或混了几件事的才拆，拆出的函数拥有自己的输入，不接收调用方本来就知道的布尔值。把函数拆碎只会换来覆盖率数字，换不来设计。

### 出处与有意的差异

这些算法按 Robert C. Martin 的工具的逻辑用 TypeScript 重写——他的仓库没有许可证，所以不搬原文，只照做法；每处在源码注释里标了仓库、提交与文件。逐条事实与他提交历史里改过的主意见研究主题的[工具算法报告](../../.meta_harness/research/clean-code-doctrine-current/reports/2026-10-01-tooling-algorithms/report.md)；其中只有色带评分与判定点集合是对着原文字节核过的，其余是子代理转述。

| 做法 | 出处 | 与原实现的差异及理由 |
|---|---|---|
| 判定点集合 | crapper `languages/typescript.py` | 逐项一致。阈值是按这套计数校出来的 |
| 计分单元 | 同上 | 原实现只认顶层函数、类方法、顶层箭头常量，嵌套函数并入外层。本仓库大量是「工厂函数返回一组方法」，照那样一个工厂只算一个单元；这里让有名字的内层函数各自成单元 |
| 每函数覆盖率 | crapper `coverage.py` | 原实现按整个行区间求比例，区间内没有行记 0%。这里内层单元的行从外层扣掉，外层只剩声明时不给数 |
| CRAP 公式、风险值、评分与色带 | crapper `crap.py`；uml-viewer `domain/config.clj`、`application/overlay.clj` | 一致。原实现「缺数据一律算最差」；这里没跑覆盖率的成员按圈复杂度评级，跑了却没数据的成员单独标出 |
| 父节点取最差子节点 | uml-viewer `application/hierarchy.clj` | 一致 |
| 方向违规 = 内层依赖外层，同层合法 | uml-viewer `domain/policy.clj` | 另加三条它没有的：没登记层位的组报出（原实现会把它静默放进最底行且永不违规）、`infra` 只由装配层选用、成员与组的环 |
| 环检测 | dependency-checker `core/graph.clj`（Tarjan 强连通分量） | 一致 |
| 扇入、扇出、不稳定度 | dependency-checker `core/stats.clj` | 没有移植抽象度与主序列距离：那套判法会把稳定而没有抽象的叶子一律判进「痛苦区」，对纯数据契约包不成立 |
| 行内重心法排序、最内层在底 | uml-viewer `engine/layout.clj` | 布局交给浏览器的流式排版，只移植了分行与行内顺序 |
| 默认只画三角标记与悬停清单 | uml-viewer `application/hit.clj`；arch-view 删掉箭头走线的那次提交 | 没有移植走线。原作者在这上面反复返工，最后的结论就是标记加清单；这里只在选中成员时画它自己的线 |
| 函数文本摘要判变更 | mutator `functions.py`、`engine.py` | 内层单元的行不算在外层头上 |
| 超阈值的处置判据 | swarm-forge six-pack 分支 `roles/cleaner.prompt` | 措辞改写，判据一致 |

读数时的边界见[验证规范](../../docs/verification.md#检查入口)那一行的「不能声称」。自测：`tests/metrics-complexity.spec.ts`、`tests/metrics-report.spec.ts`、`tests/group-direction.spec.ts`。

## 回路状态

`make loop-status` 是本包的第三入口（`src/loop/`），回答一个问题：**整洁的各项指标现在各在哪条带上，这次变更里有哪些红项要解释，哪些成员超了预算。**
它说事实（位置、数值、带位），不写该怎么改；回路本身的约定见[整洁回路](../../docs/clean-loop.md)。

```sh
make loop-status                       # 全仓现状
make loop-status BASE=<任务基线>         # 另列这次变更里要解释的红项，并核验收锁
make loop-status SNAPSHOT=1            # 干净的工作树上追加一条趋势快照
```

**除两条硬线外一切只报告。**退出码 1 只在硬线被破时：方向违规或环（与 `make metrics`、`lint:rules` 的 `group-direction` 同一份策略），
或给了 `BASE` 且[验收锁](#验收锁)被破；2 是工具自己出错（参数、配置、git）；其余报告项再多也是 0。

落点：`回路目录` = `$OMNE_METRICS_HOME`，没设就是**主检出**的 `tmp/clean-loop/`（在工作树里跑也落主检出）。

| 产物 | 内容 |
|---|---|
| `status/<提交短号>[-dirty]/status.md` | 与终端打印相同的文字，分五段：抬头（含用的哪条基线快照）、硬线、各项指标的带位、要解释的红项、超预算的成员与对照表条数；`OUT=` 可改目录 |
| `status/…/status.json` | 全量：每个传感器的原始结果（有数据／没数据及原因）、每个成员的四项预算与带位、要解释的红项全集 |
| `proposals/<成员路径斜杠换成 ->.md` | 超预算成员的清理草稿，同一成员覆盖旧稿；六个固定章节与[派发模板](../../.meta_harness/agents/roles/cleanup-task.md)同名同序（常量 `CLEANUP_SECTIONS`） |
| `trend.jsonl` | 趋势快照，一行一条：提交、各指标的值与带位、各成员的预算值与带位 |

**三条带**：每个指标与每项成员预算都有提醒线、处置线、解除线（数值越大越差，`release ≤ warn ≤ act`）。值到处置线进入处置；
进入之后要回落到解除线及以下才解除，低于处置线但高于解除线仍是处置，这样一个值在线附近摆动时带位不跟着来回翻。
「上一次的带位」取趋势里最近一条是当前提交祖先（或就是它）的快照。配置为「与基线比」的指标另与基线快照比：
比基线差至少是提醒；没有基线快照标「未判」，不当作没变差。基线快照是 `BASE` 合并点那个提交的快照，没有就取合并点之前最近的一条；
不给 `BASE` 时用与 `primaryBranch` 的合并点。当前提交自己的快照不拿来当基线。

**趋势快照**只在工作树干净时写：给了 `SNAPSHOT=1`，或 HEAD 正是 `primaryBranch` 的头；同一提交已有一条就不再写。读的时候坏行跳过并在抬头里报出行号。

**各项指标与它们从哪来**：

| 指标 | 怎么量 |
|---|---|
| 红色成员数、超 alert 的函数数 | 直接取[结构度量](#结构度量)的报告（不跑覆盖率，按圈复杂度） |
| 稳定依赖不稳定的边数 | 成员边 `from → to` 里 `I(to) − I(from) > margin` 的条数，I 是度量报告的不稳定度 |
| 一起改却分属两组的成员对数 | HEAD 上最近 `window` 个非合并提交各碰过哪些 `packages/`、`apps/` 成员；一次碰了超过 `maxMembersPerCommit` 个的不计；分属不同组、同改次数 ≥ `minTogether` 且同改次数 ÷ 两者各自被改次数的较小者 ≥ `minRatio` 的成员对 |
| 新增跨成员依赖数 | 给了 `BASE` 才有：HEAD 的边减去基线的边。基线边集 = HEAD 的边去掉导入处全在改动文件里的，再并上改动过的产品源码在合并点的文本解析出的边（含已删除的文件）；同时列出消失的边作参考 |
| 没有断言的测试数 | 成员测试文件里的 `it`／`test` 用例（含 `.each`、`.concurrent`、`.only`；`.todo`、`.skip` 不算），回调体里没有一次调用的最左标识符匹配 `assertionPattern` 或 `helperPattern`，也没有调用同一文件里声明的、函数体内含这种调用的函数（只解一层）。按语法树判 |
| 全仓重复行占比（%） | 见下「重复代码」 |
| 单个 topic 窗口内 rev 翻动次数 | `productRoot` 下每个 `PF-*/README.md` 最近 `windowDays` 天里改动过 `revision:` 那一行的提交数，取最大；达到提醒线的 topic 全部列出 |
| 并行工作树数、被多棵工作树同时改的成员数 | `git worktree list` 里主检出以外、带分支的工作树；各自相对 `primaryBranch` 合并点改过的成员（含未提交） |

**成员预算**：每个成员四项——超 alert 的函数数、风险值（度量报告的 `risk`）、重复行占比、没有断言的测试数——任一项处于处置即超预算。
快照只记成员的总带位，各项「上一次的带位」由趋势里这个成员的历史值按同一组线重放得到。「解除之后又进入处置」达到 `relapseLimit` 次的成员标结构问题：
写明「反复变红 N 次，上报，不派清理」，不生成草稿。其余超预算成员各生成一份草稿：条目带 `路径:行`，行为锁、解除条件（当前值与解除线）、不许动的、状态（等负责人批准）。

**对照表条数**：读 `docs/clean-loop.md`，表头有「归类」一栏的表，数据行这一格须是 `传感器`、`评审问法`、`归人`、`不适用`、`不采` 之一；
数各类条数、报出不合约定的行。再把对照表（首栏「条目」）的条目名逐字对回条目全表：全表有而对照表没有、对照表有而全表没有、对照表里出现多次，分别列出。文件不存在报没数据。

所有阈值、窗口与开关在 [`loop.config.json`](loop.config.json)，代码里不写死数值；缺项、类型不对、线的次序不对、多出认不出的项一律退出 2，不悄悄用默认。
初值是起步值，试点后校准。没有数据的传感器（配置里关了、没给基线、目录不存在……）在输出里写明原因，不拿 0 冒充量过了。

### 重复代码

检测交给 jscpd 的核心库，本包只做范围、按成员汇总与排序：

- **取的是** [`@jscpd/core`](https://www.npmjs.com/package/@jscpd/core) 与 [`@jscpd/tokenizer`](https://www.npmjs.com/package/@jscpd/tokenizer) **4.0.1**（2024-05-26 发布，MIT），
  传递依赖只有 `eventemitter3`、`reprism`、`spark-md5`；版本在根 `pnpm-workspace.yaml` 的 `catalog:` 钉一次。用法是 `Detector` + `MemoryStore` + `Tokenizer`，
  逐个文件 `detect`，后出现的相同片段与最先存下的那一份配对。
- **不取 `jscpd` 这个包本身**：5.x 是 2026-06 起的 Rust 重写，靠 `optionalDependencies` 分发各平台预编译二进制，几乎每周发版；4.x 的命令行包带进 `pug`、`colors` 与各种报告器，用不着。
- **不取 4.2.x**：它们发于 2026-06 到 08 月，与 Rust 重写同期，太新；4.0.1 已经放了两年多。
- **为什么经 `createRequire` 加载**：4.0.1 的 tokenizer 的 ESM 入口（`dist/index.mjs`）里有 141 处不带扩展名的 `reprism/languages/*` 导入，`reprism` 没有 `exports` 映射，
  Node 的 ESM 解析找不到它们；同一个包的 CommonJS 入口可用。所以只有 tokenizer 在 `src/loop/sensors/duplication.ts` 这一处经 `createRequire` 取，类型取自包自己的声明；
  `@jscpd/core` 正常导入。`tests/loop-duplication.spec.ts` 走真实的库，加载方式在当前 Node 下失效时它会变红。
- **范围**：各成员 `src/` 下的非测试、非声明 TypeScript 源（与度量同一口径）；`minTokens`、`minLines` 可配，`enabled` 可关（关了报「没数据：配置里关了」）。
  产出每个成员「落在克隆里的行数 ÷ 源码总行数」与克隆清单（两端的文件与行区间、行数），跨成员的排前面；指标值是全仓重复行占比（百分数，一位小数）。
- **库给的后一端止行有时不可信**：4.0.1 把克隆往后扩时，后一端（B 端）的止行取自存储里同一哈希最先存下的那一帧，那一帧可能在别处，
  于是 B 端止行偶尔早于起行、远超前一端的长度或超出文件末尾（全仓试跑约一成克隆如此）。前一端是连续扫过来的，可信；
  B 端止行早于起行、或跨度超过前一端两倍加两行时，按前一端的行数从 B 端起行推算，克隆清单里标出「后一端止行按前一端行数推算」（`plausibleEnd`）。
  推算假设两端版式相近，重复行占比因此是近似值。
- **它查不出的**：只查词法记号相同的片段——改了名字、调了顺序、换了写法的重复查不出；短于 `minTokens` 或 `minLines` 的不报。
- **耗时**：全仓 500 多个文件约 25 秒，是整个入口里最慢的一步，其余传感器合计几秒。

**不能声称**：带位是抽查线索，不是质量结论；超预算不等于该拆——处置看职责不看数字（见上「超阈值怎么处置」）。没有断言的测试只看语法：
断言藏在导入的辅助函数里会误报（用 `helperPattern` 消），回调是传进来的函数引用时不判；有断言不等于断言有力。一起改的成员对只说明历史上的共变，不说明该合并。
rev 翻动只数改了 `revision:` 行的提交，不看改了什么。自测：`tests/loop-*.spec.ts`（读 git 的部分与入口的退出码用临时仓库）。

## 测试运行

`src/testing/` 是本包的第三入口：决定跑哪些成员的测试、以多大的并行度跑、把时间花在哪记成账本、
失败之后单独重跑归类。它替代了根脚本里原先的 `pnpm -r run test`。

```sh
make test-affected BASE=<基线提交或分支>   # 只构建并测试受这次改动影响的成员；BASE 缺省 main
make test-affected BASE=<基线> PLAN=1     # 只列受影响范围，不构建也不运行
make test-triage RUN=<运行目录>            # 把那次运行里的失败逐条单独重跑并归类
pnpm run test                              # 全量：先构建，再跑全部成员（make check 的测试一步同此）
```

**受影响范围怎么算。**改动文件取基线合并点到当前工作树的全部差异，含未提交与未跟踪的文件。
成员清单读 `pnpm-workspace.yaml`，去掉 `affected.excludeRoots` 下的（现为 `examples`）。
一个成员「受影响」指它自己有文件改动，或它直接、间接依赖的成员有改动；依赖取各 `package.json`
里写成 `workspace:` 的 `dependencies`、`devDependencies` 与 `peerDependencies`——按声明算而不是按源码导入算，
因为测试可能导入生产代码不导入的包。改动命中 `affected.globalPaths` 的任一模式（根清单、锁文件、
共享 tsconfig、`.meta_harness/design/spec/**`、本配置文件）即判为全部受影响：不少成员的测试会直接读规格文件。
pnpm 自带的 `--filter "...[<基线>]"` 做的是同一件事，但它在 git 工作树里选不中任何包，所以这里自己算；
算出来的集合与 `pnpm ls --filter '...<包名>'` 对照过一致。

**怎么跑。**先 `pnpm --filter '<成员>...' run build` 把目标成员连同它们的依赖构建一遍（测试执行的是依赖的 `dist/`），
再同时跑 `parallel.memberConcurrency` 个成员，每个成员的 vitest 至多起 `parallel.vitestMaxWorkers` 个工作进程。
一个成员失败不拦其余的，结束时列全失败；退出码只反映测试是否全过。两个并行度可用环境变量
`OMNE_TEST_MEMBER_CONCURRENCY` 与 `VITEST_MAX_WORKERS` 临时覆盖——后者是 vitest 自己认的变量，
会盖过成员配置里的 `maxWorkers`。初值 2 × 4 是在 8 核主机上量出来的：pnpm 默认的 4 个成员并行、
每个成员最多 7 个工作进程时，全量要 18 到 22 分钟且有十几条用例被挤过时限；2 × 4 约 13 分钟。

**耗时账本。**每次运行在**主检出**的 `tmp/test-ledger/<提交短号>[-dirty]/<时间>/`（`OMNE_TEST_LEDGER_HOME` 可改根目录，
`--out` 可直接指定）留下：

| 文件 | 内容 |
|---|---|
| `summary.md` | 同时打印到标准输出：总数与墙钟、逐条失败、最慢的成员、超过 `ledger.slowFileSeconds` 的文件、超过 `ledger.slowTestSeconds` 的用例 |
| `ledger.json` | 运行坐标（提交、是否干净、基线、并行度、核数、受影响计划）与成员、文件、用例三级的耗时和失败清单 |
| `<成员>.log`、`<成员>.json` | 各成员的原始输出与 vitest 的 JSON 报告 |
| `build.log` | 受影响范围运行时的构建输出 |

`ledger.slowTestSeconds` 的初值取 vitest 默认时限的一半：空闲时就占掉一半时限的用例，机器一忙就会越线，
它们是「偶发超时」的候选名单。成员的 `fileSeconds` 是各文件耗时之和，与墙钟的差是进程启动、类型检查与并行重叠。

**失败归因。**`triage` 读那次运行的账本，把每处失败单独重跑 `triage.repeats` 次（一次只起一个工作进程、
旁边不跑别的），用例名转义并加锚后交给 vitest 的 `-t`，再从 JSON 报告里核对这条用例确实跑了：

| 归类 | 重跑看到了什么 |
|---|---|
| 隔离仍失败 | 每次单独跑都不过。与同时运行的其他负载无关 |
| 隔离时过时不过 | 单独跑就不稳定 |
| 隔离稳定通过 | 每次单独跑都过；此时再把它所在的文件整个单独跑一次，一并报告。它只说明这不是该用例单独的逻辑错误——原失败可能来自并行负载，也可能来自用例之间的相互影响或执行顺序，工具不区分 |
| 未能单独重跑 | 名字没选中、没有报告，或失败不在任何测试文件里（例如类型检查），要看日志 |

归因只报告，不改变那次运行的结论。重跑的日志与报告在运行目录的 `triage/` 下。

策略都在 [test-runs.config.json](test-runs.config.json)，不写死在代码里。自测：`tests/test-runs.spec.ts`；
运行名额脚本的行为核对在 `tests/test-slot.spec.ts`，脚本本身见[自动化入口](../../scripts/README.md#运行名额)。

## 后续 core 静态义务的兑现方式

下表是开发者选择检查形式的导航，语义和责任仍归各节点 design「静态检查义务怎么承载」。
只读到节点要求不等于检查已实现；所有新增形式须各有有效正反例，再对实际实现核对。

| 节点 | 本阶段可机检的形式与建议 | 需要消费者或实际行为的部分 |
|---|---|---|
| content-blocks | SC-3 opaque 品牌不兼容的负向类型测试；无 rawArguments 解析辅助的公开面核对。SC-2 的 Stream 范围与 stream-assembly SC-1 共用指定解析函数规则；宿主其它 raw 消费者须另行点名 | 会话日志 SC-1/SC-4；消费者 opaque 读写（包括 readOpaqueJson 与 copyJsonValue），是否对完整/半截调用采用正确输入，均未由本检查器证明 |
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

## 模型凭据的逐符号结构守卫

`model-credential-boundary` 登记在 `src/repository.ts` 的 `REPOSITORY_RULES`，正常 CLI 同时扫描实际 `packages/`、`apps/`、`examples/`、`tools/`、`scripts/` 执行模块及配置别名解析结果。collector 先规范化仓库根路径，末尾斜杠不会改变根 `tsconfig` 的别名解析。它采用 [D-075](../../.meta_harness/design/record/decisions/model-credential-source-projection/decision.md)、目录 v3 V3-10、CCL rev2 MCR-V7 与 [D-092](../../.meta_harness/design/record/decisions/model-auth-bootstrap-adoption/decision.md) 的装配权限。

| 符号 | 允许点 |
| --- | --- |
| `createCredentialBindingReader` | 目录 owner；精确 bootstrap 文件中 `createAcceptanceApplication` 的 `start` 构造，向 CCL 工厂传递 |
| 返回的 binding reader | 目录 `plugin.ts` 的 `localCredentialLookupPlugin` 和 CCL `model-replica.ts` 执行；bootstrap 不执行、不返回 |
| `createModelReplicaCustodian` | 同一 app 的 `start` 唯一构造点；目录不能重建 |
| `storeBoundReplica` | app `publishCredential` 的真实来源写入路径；真实资格／来源真实性仍须运行验收 |
| `readBoundReplicaIn` | app `start` 只借给 lookup 配置；P1r／CCL 执行 |
| 组件 `close` | app `closeResources` 和 CCL 所有者执行；借用者不得取得 |

公开构建模块 `dist/index.js` 导出 `Rule/SourceFile/Violation`、`collectSources/runRules/RULES`、逐项规则与规则工厂；`dist/repository.js` 导出 `collectRepositorySources/REPOSITORY_RULES`。`SourceFile` 包含路径、文本及可选 `resolvedModules`，规则不加载或执行产品模块。包规则通常取 packages 根相对路径，仓库规则取仓库相对路径；模型守卫另兼容相应包根／app 根路径。包是私有 workspace 开发工具，不是 Cordis 插件或沙箱。

先构建后，在本 README 同目录保存并执行以下 TypeScript 夹具：

```ts
import assert from 'node:assert/strict'
import { modelCredentialBoundary, type SourceFile } from './dist/index.js'

const source: SourceFile = {
  path: 'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  text: `
    import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory/tx-reads';
    import { createModelReplicaCustodian } from '@omne-harness-lite/credential-custodian-local/model-replica';
    import { localCredentialLookupPlugin } from '@omne-harness-lite/model-profile-directory/plugin';
    export function createAcceptanceApplication() {
      let replica;
      async function start() {
        const reader = createCredentialBindingReader(storage);
        replica = await createModelReplicaCustodian({ readCredentialBindingIn: reader });
        ctx.plugin(localCredentialLookupPlugin, { readBoundReplicaIn: replica.readBoundReplicaIn });
      }
      function publishCredential() { return replica.storeBoundReplica(input); }
      async function closeResources() { await replica.close(); }
    }
  `,
}
assert.deepEqual(modelCredentialBoundary.check([source]), [])
const violation = { ...source, text: source.text.replace(
  'const reader = createCredentialBindingReader(storage);',
  'const reader = createCredentialBindingReader(storage); const thunk = () => reader; const illicit = thunk(); await illicit(unit, tenant);',
) }
assert(modelCredentialBoundary.check([violation]).some(v => v.message.includes('binding-reader execution')))
```

这些字符串只是检查器夹具，不补造存储、身份或凭据产品能力。单独消费仓库规则：

```ts
import assert from 'node:assert/strict'
import { runRules } from './dist/index.js'
import { REPOSITORY_RULES } from './dist/repository.js'

const violations = runRules([{
  path: 'packages/model/example/src/runtime.ts',
  text: "import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory/tx-reads';",
}], REPOSITORY_RULES)
assert(violations.some(v => v.rule === 'model-credential-boundary'))
```

守卫跟踪同文件词法绑定、赋值别名、具名／namespace 导入、普通解构、字面计算成员及有界聚合别名。本地表达式体箭头的调用结果保留已识别能力来源；表达式体与块体中的受限返回均保守拒绝。已识别的受限值不能通过未知参数、构造器、返回／导出、回调结果、对象写入或文本呈现逃逸；非字面成员报错。普通箭头结果保持可用，无关的 `.close` 不按名字误报。产品测试路径豁免，规则负控使用真实产品路径。专门 CLI 回归使用构建后的 `dist/` 制品，运行测试前须先构建本工具。

限制：不解释任意 JavaScript，不推导无类型的跨文件值，不证明真实来源对、共同事务、运行期唯一实例、反射隔离或资源实际关闭。模块别名解析定位 provider，不增加权限。缺席 app 的扫描通过不是 app 合规证据；最终冻结 app 仍须集成扫描和独立联合验收，工具自测不能单独关闭 MCR-V7 或 P3。

精确路径 `packages/agent-loop/loop-extension-runner/tests/runner-chain-support.ts` 可通过 EIS 公开发布入口建立 D106 R7 验收的真实不可变历史。相邻 runner 测试和全部 runner 产品源码仍禁止发布。历史边界规则只允许 runner 产品源码导入 reader 类型，测试可构造真实 reader；不允许工厂转发，也不授予产品侧发布权。
