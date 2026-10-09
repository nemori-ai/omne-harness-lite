# ts-checks

`evaluation-publication-boundary` 仅允许 EIS 自身、受信验收 bootstrap/tests，以及精确的 `packages/model/model-request-runtime-local/tests/session-selection-fixture.ts` 通过静态公开入口访问发布面。该 fixture 为选择测试构造真实 SQL／治理／EIS 来源；许可不扩展到 runtime 产品源码或相邻测试文件，转导出、动态转发和私有发布入口仍拒绝。正反验证命令：`pnpm --filter @omne-harness-lite/ts-checks exec vitest run tests/evaluation-publication-boundary.spec.ts`。

产品源码与开发示例（`packages/`、`apps/` 与 `examples/`）的结构检查：契约与 realization 节点 verification 点名的静态检查，
规则检查文本、路径与 TypeScript 语法，不做跨文件类型分析。类型层的检查（失败集合闭合等）
在各包的 `tests/*.spec-d.ts` 里，不在这里。

新规则（`restricted-call-sites` 的扩展与其后各条）跑在 `src/source-text.ts` 的词法视图上：
注释与字符串、模板、正则字面量的内容不算代码，括号按代码配对。`no-bail-control` 与
`restricted-call-sites` 的前两项仍逐行扫原文。新增 core 与身份规则使用已锁定 TypeScript 的语法树，
不构造类型检查 Program。按路径写死的位置集中在 `src/layout.ts`，入口层包的路径以
[governance-center-entry verification「包布局常量」](../../packages/tenancy/governance-center-entry-node/SPEC.md)为准。
**被查的包不存在时规则无事可查、静默通过**；包存在而规则依赖的布局锚点（入口层包的
`src/events.ts` 与 `src/ops/`、账号能力包的 `src/plugin.ts`、注册组合包的 `TERMINAL_OUTCOMES`）缺席时报出，不静默失效。

| 规则                             | 来源                                                                                  | 查什么                                                                                                                                                                                                                                                                                                                                                                                   | 不覆盖                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-wall-clock` | offer-expiry 节点 SC-OE-3 | 原生产范围保留，infra 与测试豁免；CG1/D047仅另豁免 `frontend/governance-client-operations-local/src/observation-time.ts` 的副本显示时刻；Date.now、performance.now、无参 new Date，含解码成员与同文件 const/解构别名 | 跨文件/可变赋值/函数传参/动态成员的数据流 |
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
| `og-s42-dynamic-resolve`         | OG S-42 第 4 行；AI S-30                                                              | `organization-purge` 服务经 `ctx.get(…)`、`resolveOptional(ctx, …)`、`inject: [...]`／`{...}`／`ctx.inject([...])` 解析只许在 AR（OG 自己也不许，它只 provide）；公共服务键另允许在宿主私有职责表比较声明，不能解析服务、导出或传出表                                                                                                                                                                     | 服务名经变量拼出后再解析                                                                                                                              |
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
均可导入 content-blocks 的公开入口。mcp-endpoint 经已接受的 [中性技术依赖](../../packages/core/mcp-endpoint/SPEC.md)
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
| `group-direction` | [realization「packages 的两层布局」](../../.meta_harness/design/architecture/README.md)；[workspace 规范](../../docs/workspace.md)「装配负责选择提供者」 | 成员产品源码（不含测试）经 `@omne-harness-lite/*` 字面导入形成的成员间边：只能指向同层或更内层；`packages/infra` 只由最外层与它自己依赖；成员之间、组之间不成环；出现没登记层位的新组即报出 | 测试里的导入；非字面说明符；相对路径越出包边界（由包公开入口约定承担）；**层位本身对不对**——那是设计正文定的，这里只核对方向 |

层位与例外在 `src/rules/group-direction.ts` 的 `GROUP_DIRECTION_POLICY`，每条带 `source` 指回设计正文；它是机检投影，不是第二份权威：
改层位先改 realization 的布局正文，再改这张表。现存例外只有一条（`frontend/client-local-state-sqlite` 直接打开本机 SQLite），登记了理由。

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

同一入口还跑 `card-trailer`：删卡的两条 trailer（`Accepted-Card:`、`Voided-Card:`，键不分大小写）的值必须恰好是一个合乎写法的卡号
`ST-<三位>-<两位>`——一张卡一条，不许一条里写几张。trailer 按 git 自己的认法读（`%(trailers:only,unfold)`，只认信息末段的 trailer 块），
正文里写着同样字样的行不算。它只看写法；点到的卡是不是真在那个提交里删掉，归[删卡记录](#删卡记录)。

## 验收锁

可执行验收放在成员的 `acceptance/` 目录，归负责的人、主会话与独立验收角色；实施的 agent 只运行、不修改
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

## 验收的覆盖声明

`src/acceptance/coverage.ts` 随 `pnpm run lint:rules` 执行（`make check` 的 `product-check` 一步里），有违反即退出 1。
规矩正文在[源码布局「可执行验收」](../../docs/workspace.md#目录与内容归属)：一条场景交付了没有，就看有没有验收声明覆盖它，
所以声明本身要能被核对。它找出 `acceptance-lock.config.json` 的成员根下每个 `acceptance/**/*.acceptance.ts`（`node_modules`、`dist` 不进），逐份查：

| 报出（规则 `acceptance-covers`） | 说明 |
|---|---|
| 开头的注释块里没有、或不止一行 `// covers: …` | 开头注释块是文件开头连续的 `//` 行（中间可有空行）；写在代码之后的 `// covers:` 另报「要写在开头」 |
| 某一项不是 `PF-<三位> <场景编号>`、是空的、写了两次 | 多项用逗号隔开，半角全角都认；场景编号的写法与设计区对账器同一条 |
| 声明的场景在 `<产品区>/PF-<三位>-*/acceptance.md` 里没有带这个编号的行，或出现不止一次，或那个 topic 没有目录、对应了几个目录 | 场景行怎么认在 `src/product/scenarios.ts`，与 `.meta_harness/tooling/src/stories.py` 同一条规则；`tests/product-scenarios.spec.ts` 对着那份源码核两边的正则没有分叉 |
| 文件名不以 `PF-<三位>.` 开头，或这个 topic 不在它声明覆盖的 topic 里 | |
| 成员有验收文件，`package.json` 里却没有 `acceptance` 脚本 | 没有它，这些验收不会被任何入口运行 |

产品区的位置沿用 `loop.config.json` 的 `sensors.topicChurn.productRoot`。**为什么接在 `lint:rules`**：它与提交署名一样是对整个仓库的静态核对，
不需要构建产物，放在已有的仓库规则入口里，`make check` 不必多一步，`pnpm run check` 单跑时也查得到。

**不能声称**：声明的场景存在，不等于验收真的断言了那条场景要的东西——那归写验收的人与评审；验收过没过归下面的 `make acceptance`。
它只认 `.acceptance.ts` 结尾的文件，放在 `acceptance/` 里却不按这个名字取的验收它看不见。自测：`tests/acceptance-coverage.spec.ts`。

## 场景状态

```sh
make scenario-status
```

按 topic 列出每条带编号的验收场景处于哪一种（`src/acceptance/scenario-status.ts`），只读、只报告、退出 0（产品区不存在等工具错误退出 2）：

| 状态 | 有卡（还在某个 `stories.md` 里，经「覆盖场景」链接指到它） | 有验收（某份验收的覆盖声明里有它） |
|---|---|---|
| 已交付 | 否 | 是 |
| 交付中 | 是 | 是 |
| 已立卡 | 是 | 否 |
| 还没切到 | 否 | 否 |

**它是推导出来的**：每次从 `acceptance.md`、`stories.md` 与覆盖声明现算，不落盘，不是第二份权威。覆盖声明有错时只在抬头提一句并给出前三处
（判失败的是 `lint:rules`），不合写法的项不计入。**不能声称**：「已交付」只看声明，主线的检查绿不绿这里看不到；
跨 topic 引用的卡算在场景所在的 topic。没有编号的场景行它看不见。自测：`tests/acceptance-scenario-status.spec.ts`。

## 删卡记录

```sh
make card-retire BASE=<任务基线提交或分支>   # BASE 缺省 main
```

规矩正文在[故事卡的格式契约「卡的一生」「卡号」](../../.meta_harness/design/product/conventions.md#卡的一生)：卡接受或作废就从 `stories.md` 删掉，
删卡的提交带 `Accepted-Card: <卡号>` 或 `Voided-Card: <卡号>`；「已发到」只增不减。设计区的对账器只看得到眼前这一版，
这两条要对一段提交看，由 `src/product/retire.ts` 来查。做法与验收锁同类：取 `BASE` 与 HEAD 的合并点，逐个看这段范围里**碰过 `<产品区>/PF-*/stories.md`
或带删卡 trailer** 的提交，与它的父提交比：

| 报出（退出 1） | 说明 |
|---|---|
| 一张卡在这个提交里从 `stories.md` 消失了，提交里没有 trailer 点到它 | 卡按标题里的卡号认，全区一起算（卡号全区唯一）；整份 `stories.md` 删掉时其中的卡都算消失 |
| trailer 点到的卡这个提交之后还在、或父提交里就没有 | 没碰 `stories.md` 却带了删卡 trailer 的提交也查 |
| 同一张卡点了两次（含一条 Accepted 一条 Voided）、trailer 的值不是卡号 | |
| 某个 topic 的「已发到」比父提交小、没了、认不出，或 `stories.md` 整份被删 | 父提交里读不出的「已发到」（例如还没有这一行）不比 |

**合并提交**只为「每个父提交里都还在、合并之后不见了」的卡负责：只在一边被删的卡，删它的是那一边的提交，那个提交在范围里就在那里查。
「已发到」与每个父提交各比一次。产品区的位置沿用 `sensors.topicChurn.productRoot`。用法或 Git 出错退出 2。

`make check` 的最后一步（回路状态的严格模式）以同一个基线把它作为硬线判，与验收锁并列，见[回路状态](#回路状态)。

**管不到的**：以 squash 合入主线时，主线上那一条提交的说明是合并的人写的，这里看不到——规矩要求合并说明里留着这些 trailer，
主线上查得到的才算数（`git log --format='%h %(trailers:key=Accepted-Card,valueonly)'`）。它也不判断 `Accepted-Card` 是不是在产品负责人说了接受之后才写的。
范围之外（`BASE` 之前）的提交不看。自测：`tests/product-retire.spec.ts`（临时仓库造提交，含合并）。

## 实际架构 JSON

公共入口为 `@omne-harness-lite/ts-checks/architecture`。公开类型在
[`src/arch/actual.ts`](src/arch/actual.ts) 与 [`src/arch/actual-model.ts`](src/arch/actual-model.ts)。
`readActualArchitecture({ root, revision?, base? })` 读取实际源码，不依赖 realization 或意图声明。
`actualArchitectureOf(source)` 投影同一个 AST 抽取器的观测；`readArchitectureSource(root, revision?)`
提供版本内的虚拟文件树；`compareActualArchitectures(before, after)` 计算稳定身份的新增与删除。

```sh
pnpm --silent --filter @omne-harness-lite/ts-checks run architecture --root "$PWD"
node --experimental-strip-types tools/ts-checks/src/arch/cli.ts --root "$PWD" --revision <commit> --base <commit> --out tmp/architecture.json
```

CLI 的 stdout 只有 JSON。`--out` 另写同一份 JSON。参数、Git、workspace、manifest 或配置错误退出 2，
错误写到 stderr。构建后的入口为 `omne-architecture`。`root` 必须是 Git 仓库顶层；仓库必须有
`pnpm-workspace.yaml` 和带非空 `name` 的成员 manifest。workspace 模式复用测试成员读取器：一行一个，
只支持完整路径段的 `*`，其他 glob 写法报错；重叠模式按成员路径去重。

结果为 `schemaVersion: 1`、`kind: actual-architecture`、`generatedAt` 与 `current`。给 `base`
时另有 `baseline` 与 `difference`。不传 `revision` 读取当前文件系统；传入的 revision 和 BASE
各自先解析成不可变 commit，后续只读该 Git 树。BASE 不取合并点、不从当前工作树补文件。
`source` 记录仓库、commit、读取方式与 Git `dirty`。`inputDirty` 还标记已读输入中没有进入该 commit 的文件，
包括被 Git 忽略的源码或配置；路径在 `unversionedInputs` 中。工作树输入脏时不能当作该提交的静态快照。
仓库根的 Python 虚拟环境 `.venv/` 不进入输入库存；成员中的同名目录仍按实际归属读取。

成员来自该版本的 workspace 和 manifest。`packages/`、`apps/` 下的成员属于产品范围；其余成员
作为 development 单列。名称取 `manifest.name`，不由目录猜包名。空成员保留；`sources` 只列成员
`src/` 内 TypeScript 文件，`dataFiles` 列其余文件。成员源码数量与实际 `analyzedFiles` 分开：
产品测试排除，开发成员可用于静态解析，但不独立抽取其插件。manifest 和配置取本版内容。
配置的 `read` 清单与 `appliedToResolution` 清单分开；后者记录实际选中及 extends 读取的配置。
每个导入先用所属成员的 tsconfig.json、tsconfig.build.json，再用根配置；应用其模块解析选项。
这不复现 compiler build：仍分析全部产品 src TypeScript，不依赖 include/exclude，不加载安装包、
标准库或安装包的 extends，也不运行 project references。workspace dist exports 静态映射到 src。

`facts` 保留服务定义、候选提供、必需与可选取用、事件、插件和静态装配；`imports` 区分类型与运行导入，
含 ESM import/export/dynamic import、空 named 子句、TypeScript `import()` 类型、外部包和成员内导入。
CommonJS require 不在本抽取器范围内。根任务容器与 node_modules 不读取；成员根的 dist/coverage 构建目录不参与解析，
成员本身或 src 子目录采用 tmp/dist/coverage 名称不会被忽略。
`unknown` 保留无法还原的表达式、原因与所有出处，不能用空集合证明不存在。每项事实和导入的
`occurrences` 保留所有来源；同一成员间、同一符号的关系可有多个出处。`candidateProviders` 保留
全部候选事实，`runtimeSelection` 为 `not-observed`，不选择未经运行观察的提供者。

实际关系 ID 用无歧义 tuple 编码；源码 path/line 不参加关系身份。文件搬迁或行号变化不会成为语义新增。
差分分别列成员、事实、导入、未知的 added/removed；完整前后文档保留位置变化和成员 manifest 变化。
复杂度直接复用 `functionMetrics`。coverage 为 `no-data`，不执行测试或推断覆盖率。
进程、外部资源、运行选择与隔离等未观察项写在 `scope.limitations` 中；静态数据不证明租户、事务或生命周期保证。
独立场景见 [`tests/actual-architecture.spec.ts`](tests/actual-architecture.spec.ts)。
旧装配意图对照消费单独的 `IntentImplementation` 投影；其阈值、strict 和声明差分通道保持原义。

## 全局实际架构视图

```sh
node --experimental-strip-types tools/ts-checks/src/arch/cli.ts --root "$PWD" --base <精确提交> --report tmp/architecture > tmp/architecture.stdout.json
```

`--report` 生成 `report.html`、`graph.json`、`actual.json` 和 `summary.md`。
stdout 仍只有实际架构 JSON，报告路径写到 stderr。构建后也可用 `omne-architecture`。
直接用浏览器打开 HTML，无需服务器或网络。

页面默认显示应用和目录组总览。展开后可筛选类型/运行导入、必需/可选服务、事件和装配声明。
总览默认使用依赖矩阵，行发起、列目标。数字为输入事实身份数；可切换到 ELK 关系图。
跨组边只汇总直接导入和装配声明。组内关系需展开，服务同名不推断组间绑定。
聚焦组件可显示最多两跳的邻接，排除邻居之间无关关系。点击关系查看全部出处和提交。
选择变化范围可保留精确 BASE 已删除的节点与来源。叠加圈复杂度、静态耦合后，
可进入同页的复杂度与风险面板。SVG/JSON 导出反映当前选择，未展开时导出总览。
画布可平移、缩放及适应全图，出处在右侧栏。视口变化不裁剪 SVG 导出。
绘制期间和失败时禁用导出，失败原因在页面显示；旧布局不得覆盖新选择。

视图只消费 N1 实际数据。目录组不表示运行边界；服务与事件同名不表示实际绑定。
所有提供者均为候选，确认配置选择及实际运行绑定显示“未观测”。规划与架构预期显示“未提供”。
具体 unknown 和未覆盖范围可展开查看，未知条数不能代表全部缺口。
外部代码导入不作为外部运行资源。无函数成员保留，覆盖率缺席不记为零。

公开投影为 `buildArchitectureView(document, bands)` 和 `selectArchitectureView(graph, selection)`，
经同一个 architecture 入口导出。数据类型归 [view.ts](src/arch/view.ts)，
类型表达不出的行为归 [薄规格](src/arch/SPEC.md)，回归见 [视图测试](tests/architecture-view.spec.ts)。
关系图由 React 19 与 @xyflow/react 展示（`src/arch/flow/`），ELK 仍负责位置与路由，节点不可拖动。
React 19 没有浏览器单文件构建，所以 `renderPage` 生成页面时用 esbuild 把岛打成一个 IIFE 内联（`flow/bundle.ts`），
从 `src/` 与 `dist/` 都能运行，页面仍离线自包含。关系图模式的 SVG 导出由同一份几何生成（`flow/export-svg.ts`），
回归见 [岛测试](tests/architecture-flow.spec.ts)。
布局与导航的采用理由见 [ADR](src/arch/ADR.md)，社区事实与有限探针归其中链接的调查。
复杂度算法和色带复用现有度量，色带读取运行工具版本的配置，页内说明来源。
architecture 报告的函数变化和关系变化都用精确 BASE；metrics 报告的函数变化仍用 merge-base，
架构变化用精确 BASE。页面分别显示两个坐标，非祖先 BASE 时也不混称同一范围。

## 结构度量

`make metrics` 是本包的第二入口（`src/metrics/`）。它**只报告、不判失败**，不在 `make check` 里；能让检查失败的只有上面的方向规则与提交署名。

```sh
make metrics                          # 全仓：实际架构、圈复杂度、依赖图、方向与环
make metrics BASE=<基线提交或分支>      # 另标出基线以来变更的成员、函数、导入与提交形状
make metrics BASE=<基线> COVERAGE=1    # 再对变更成员逐个跑测试，取覆盖率并合成 CRAP（先构建）
```

产物默认落**主检出**的 `tmp/metrics/<提交短号>[-dirty]/`（在工作树里跑也落主检出，工作树退役不带走；`OUT=` 或环境变量 `OMNE_METRICS_OUT` 可改）：

| 文件 | 内容 |
|---|---|
| `summary.md` | 不超过 12 行，同时打印到标准输出；交付说明原样附它 |
| `metrics.json` | 每个成员与每个函数的圈复杂度、覆盖率、CRAP、是否变更 |
| `graph.json` | 成员间的边与导入处、方向发现、环、已登记例外 |
| `review.html` | 自包含的共同入口：默认实际架构总览，可进入结构图、风险与函数表 |
| `actual.json` | N1 完整实际架构数据及精确两版差分 |
| `architecture.json` | 总览、关系与来源的派生浏览投影；与旧 graph.json 分开 |
| `coverage/` | 开了覆盖率时各成员的原始 `<成员>/coverage-final.json` 与测试输出 `<成员>.vitest.log`；每个成员的耗时与退出码另记在 `metrics.json` 的 `meta` 里，运行时逐个打到标准错误 |

审讯页的网址后带成员路径可直接定位，例如 `review.html#packages/model/model-request-runtime-local`。

怎么算的：

- **计分单元**是有名字的函数：函数声明、类与对象字面量的方法、赋给名字的箭头函数与函数表达式；匿名回调并入它所在的单元，类与具名对象只提供限定名。
- **圈复杂度** = 1 + `if`、各类循环、`catch`、`?:`、`case`、`default`、`&&`、`||` 的个数；`??`、`?.` 与逻辑赋值不计。
- **覆盖率**取函数行范围内、且不落在更内层有名函数里的语句行的命中比例。测试经包名导入自己时执行的是 `dist/`，所以连同 `dist/**` 一起收集并由 sourcemap 映射回 `src/`。
- **跑谁的测试**：只跑 `metrics.config.json` 的 `coverage.roots` 列出的根目录（现为 `packages`、`apps`）下的变更成员。`examples/` 是阶段性的演示，不长期维护，不为它跑测试；它照常参加圈复杂度与依赖方向的静态度量，覆盖率记为「这次没跑」。
- **CRAP** = 圈复杂度² × (1 − 覆盖率)³ + 圈复杂度。没有覆盖率数据的函数只按圈复杂度评级。
- **成员风险值** = 成员内函数评级分的均值加一个总体标准差，单个最差函数不至于把整个成员染红；它在色带点上分段线性地换成 1 到 10 的评分再取色。组框左边线取组内最差成员。
- **函数是否变更**比对函数自身文本的摘要，不看 diff 行号：挪位置、上方插入代码都不算变。
- **行内排序**用重心法：按相邻成员位置的平均值排五轮，让相连的成员靠近。
- **结构图**由 React Flow 岛展示（`src/metrics/flow/`），与架构视图共用同一个内联 bundle。层是横向的列，第 0 层在最左；组是层内的容器；成员是组内网格中的卡片，组内顺序沿用行内排序。几何（`flow/layout.ts`）与画哪些线（`flow/edges.ts`）都是纯函数，回归见 [结构图测试](tests/metrics-structure.spec.ts)。滚轮翻页，按住 ⌘（Windows 为 Ctrl）加滚轮缩放，拖动空白处平移。
- **扇入、扇出与不稳定度**：依赖它的成员数、它依赖的成员数、出 ÷（入 + 出）。
- 阈值与色带在 `metrics.config.json`，不写死在代码里：`thresholds`（函数级的「要解释」线）、`bands`（成员着色）与 `page.changedEdgeLimit`（见下）。
- **审讯页画哪些线**：选中一个成员时只画它自己的线（指向它的用虚线），别处只留违规。悬停在成员上等同于临时选中它，离开后恢复点击定下的选中。选中或悬停时，它的线加粗发光，普通导入的线取发起成员卡片的颜色（违规、例外、变更仍为红、橙、蓝），沿线有小点从依赖方流向被依赖方，与它不相邻的成员淡化；系统设置减少动态效果时不显示小点。组间连线同样加粗发光、取发起组左边线的颜色，但没有流动小点。点画布、层或组的空白处取消选中。未选中时违规与已登记例外始终画出；本次变更触及的边不超过 `page.changedEdgeLimit` 条才逐条画，超过就只留卡片上的蓝色「入/出」标记，并在画布底部注明——大变更下逐条画只会糊成一团。连线是贝塞尔曲线，箭头指向被依赖的成员。

**超阈值怎么处置**：看职责不看数字。回答同一个问题的单个分派（一个 `switch`、一张判定表）可以留在阈值之上；嵌套或混了几件事的才拆，拆出的函数拥有自己的输入，不接收调用方本来就知道的布尔值。把函数拆碎只会换来覆盖率数字，换不来设计。

### 出处与有意的差异

这些算法按 Robert C. Martin 的工具的逻辑用 TypeScript 重写——他的仓库没有许可证，所以不搬原文，只照做法；每处在源码注释里标了仓库、提交与文件。源码注释保留具体上游仓库、提交与文件；来源核对的限制不因工具输出通过而消失。

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
make loop-status BASE=<任务基线>         # 另列这次变更里要解释的红项，并核验收锁与删卡记录
make loop-status SNAPSHOT=1            # 干净的工作树上追加一条趋势快照
make loop-status BASE=<基线> STRICT=1 OUT=<目录>   # 严格模式，make check 的最后一步
```

**除硬线外一切只报告。**退出码 1 只在硬线被破时：方向违规或环（与 `make metrics`、`lint:rules` 的 `group-direction` 同一份策略），
或给了 `BASE` 且[验收锁](#验收锁)被破或[删卡缺记录](#删卡记录)（两条用同一个基线），或严格模式下有开着的传感器没数据；
2 是工具自己出错（参数、配置、git）；其余报告项再多也是 0。

**严格模式**（`STRICT=1`，即 `--strict`）另判一条硬线：配置里开着的传感器（`sensors` 下带 `enabled` 的九个）每一个都要有数据。
有哪个报「没数据」，「硬线」一段列出是哪几个、原因是什么，退出 1；配置里关掉的不算，照旧写明是关掉的。
对照表那一项没有开关、也不进指标，不在此列。「没有基线快照，与基线比未判」是趋势的事，不算传感器没数据。
它要求给 `BASE` 与 `OUT`（缺了按用法错退出 2），草稿写进 `OUT/proposals/`，不写趋势快照（与 `SNAPSHOT=1` 同用也是用法错）——
回路目录里一个字节都不动。`make check` 的最后一步就是它，见[自动化入口](../../scripts/README.md)。

**传感器金丝雀**：`tests/fixtures/loop-canary/` 是一个最小的假仓库，每个传感器各种了一处已知违规（清单在它的 README）。
`tests/loop-canary.spec.ts` 把它建成临时 git 仓库、造出要历史的那几项，走与严格模式相同的入口（`run.ts` 的 `runLoopStatus`），
逐项断言每个传感器都报出了种下的那一处（具体到文件、成员或 topic），再断言严格模式判失败；另一条拿掉 `PF-*` 目录，断言报「没数据」并判失败。
验收耗时传感器读的是账本而不是跑验收，所以它的那一处种在账本里：测试给假仓库的 `apps/cli` 一个 `acceptance` 脚本，
在当前提交那一格写一份「整次 130 秒、最慢一份 50 秒」的验收账本（形状就是运行器写的 `LedgerFile` 类型），断言两项指标都落在处置带。
它随本包的测试每次都跑：哪个传感器悄悄失灵——读错目录、范围漏了、算法改坏——它会指名变红。它只证明种下的那几处查得出，不证明查得全。

落点：`回路目录` = `$OMNE_METRICS_HOME`，没设就是**主检出**的 `tmp/clean-loop/`（在工作树里跑也落主检出）。

| 产物 | 内容 |
|---|---|
| `status/<提交短号>[-dirty]/status.md` | 与终端打印相同的文字，分五段：抬头（含用的哪条基线快照）、硬线、各项指标的带位、要解释的红项、超预算的成员（含比基线变差的成员）与对照表条数；`OUT=` 可改目录 |
| `status/…/status.json` | 全量：每个传感器的原始结果（有数据／没数据及原因）、每个成员的四项预算、带位与各项与基线比的结果、要解释的红项全集（函数一类每条带与基线比的结果，没变差的另列在 `functionsNotWorse`） |
| `proposals/<成员路径斜杠换成 ->.md` | 超预算成员的清理草稿，同一成员覆盖旧稿；六个固定章节与[派发模板](../../.meta_harness/agents/roles/cleanup-task.md)同名同序（常量 `CLEANUP_SECTIONS`） |
| `trend.jsonl` | 趋势快照，一行一条：提交、各指标的值与带位、各成员的预算值与带位 |
| `hook-state.json`、`hook.log` | [收工钩子](#收工钩子)反馈过的读数（分支与指纹）与它自己出错的原因，一行一次 |

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
| 新增、移除与元数据变化的静态装配事实数 | 完整当前源码与 BASE 源码的语义事实差分；位置移动与重复相同事实不计变化。三项都是中性计数，无绝对线、不与趋势比，不将增减解释成质量高低 |
| 全局架构预期改动数 | 全局 constraints 的语义改动，独立于实际事实及新增偏离；中性计数 |
| 未解析服务标识符数 | 服务标识符解析尝试中的未知次数；无绝对线，只报告相对趋势基线的增长 |
| 没有断言的测试数 | 成员测试文件里的 `it`／`test` 用例（含 `.each`、`.concurrent`、`.only`；`.todo`、`.skip` 不算，外层 `describe.skip`／`describe.todo` 里的也不算），回调体里没有一次调用的最左标识符匹配 `assertionPattern` 或 `helperPattern`，也没有调用同一文件里声明的、函数体内含这种调用的函数（只解一层）。路径匹配 `typeTestPattern` 的类型测试文件里编译器就是断言者，`@ts-expect-error` 指令与「应当编译得过」的调用、带类型注解的声明、`satisfies` 也算断言。按语法树判 |
| 全仓重复行占比（%） | 见下「重复代码」 |
| 单个 topic 窗口内 rev 翻动次数 | `productRoot` 下每个 `PF-*/README.md` 最近 `windowDays` 天里改动过 `revision:` 那一行的提交数，取最大；达到提醒线的 topic 全部列出 |
| 并行工作树数、被多棵工作树同时改的成员数 | `git worktree list` 里主检出以外、带分支的工作树；各自相对 `primaryBranch` 合并点改过的成员（含未提交） |
| 验收总耗时（秒）、最慢一份验收的耗时（秒） | 见下「验收耗时」；份数跟在行尾 |

### 实际装配与全局架构约束

`src/arch/` 按完整版本源码抽取实际关系，回路经 `sensors.architecture` 读取。
全局预期归 `.meta_harness/design/architecture/constraints.json`。
集成约定归 [Cordis 集成约定](../../.meta_harness/design/architecture/cordis-integration-conventions.md)。
工具不反写预期，也不从目录存在性或手写绑定推断实现状态。

| 配置／输出 | 含义 |
| --- | --- |
| `sensors.architecture.enabled` | 关闭后不读取架构源，明确报告 no-data |
| `indicators.addedAssemblyFacts`、`removedAssemblyFacts`、`changedAssemblyFacts` | 固定 `lines:null`、`baseline:false`。事实变化不等于偏离，不授予质量带位 |
| `indicators.architectureChanges` | 全局预期语义改动的中性计数，同样固定无阈值、不与趋势比 |
| `sensors.architecture.data` | 实际抽取、完整未知、按身份／元数据去重的事实及差分 |
| `sensors.assemblyDelta` | 独立实际事实差分；缺 BASE 时 no-data，不能用零冒充已比较 |
| `sensors.conformance` | 全局静态符合性子集；偏离、unknown、有限静态符合分开报告 |

原生插件对象需要 Context 首参、Cordis Plugin 类型或已确认 Context 的注册出处。
definePlugin 也提供出处。模块形式按公开导出的 name/apply/inject 识别，私有同名变量不构成插件。
只有 name/apply 形状的候选逐项记未知，普通参数类型不升级为 Context。
抽取使用 TypeScript AST、词法符号和官方模块解析，公开入口与常量按对应版本还原。
完整 BASE 包含已删除或移动的文件，不借当前源码补齐旧文件。

事实身份不含路径／行号，名称使用 JSON 元组编码，不以字符分隔符拼接。
事实差分使用全部 occurrences，避免提前去重丢掉不同名称。
contract、owner、layer、定义形式、提供形式和表达形状独立参与元数据比较。
同一服务改 contract 会留下 before/after。重复相同事实不增计数，冲突元数据不会被吞掉。
服务定义、提供调用、事件模式、导入导出名及 type/runtime 分别保留。

不可解析表达式保留 path/line/kind/expression/reason。服务未知率仅统计服务标识符解析尝试。
静态 inject 换成动态表达式时，报告“不再静态可见”及当前 unknown，不能推断实际依赖已释放。
实际增减与全局预期改动分别进入 explain／钩子，均不称“新增偏离”。
新增架构偏离仍对完整 BASE 预期比较，修改 HEAD 预期不能抹掉它。
IC-5 例外仅放行 BASE 点名的精确导出符号，namespace 通配符和新增符号仍不放行。
例外记录共同存储与出处，不据此证明同提交；方向和环硬线保持独立。

当前全局预期缺失时，architecture 是 no-data，严格模式点名失败；已有 BASE 的预期删除差分仍可见。
有效预期与完整实际源码都已读取时，空事实集是真实空结果，不能和 no-data 混淆。
当前或 BASE 缺 workspace 配置时，架构通道报告具名 no-data，其他结构读数仍可运行；不借 HEAD 补 BASE。
存在却非法的配置仍报错，不统一吞解析错误。
静态分析不执行配置工厂，不证明动态撤除、隔离、运行可用性、授权或共享提交。
生命周期和事务义务由实际公共 Service、模块薄 SPEC 及行为验证负责。

自测包括 `arch-extract.spec.ts`、`loop-assembly.spec.ts`、`architecture-conformance.spec.ts`，
以及配置、严格模式、金丝雀和实际架构测试。它们保留静态新增依赖、元数据变化、名称碰撞、
未知、关闭与无基线反例，不替代行为验收。

### 验收耗时

`src/loop/sensors/acceptance.ts` 不跑验收，只读[测试运行](#测试运行)以 `--script acceptance` 写下的账本（`make acceptance`，或 `make check` 按计划跑的验收一步）：
账本根是主检出的 `tmp/acceptance-ledger/`（`OMNE_ACCEPTANCE_LEDGER_HOME` 可改），取**当前提交那一格**（工作树不干净时是带 `-dirty` 的那一格）里最新的一次
交代了现在有 `acceptance` 脚本的每一个成员的验收运行：全量运行（`meta.base` 为 null）跑了它们，或按计划的运行跑了一部分、其余写在 `meta.scope.skipped` 里。
同一格里真跑过验收的记录优先于只有「跳过」的记录。读数三样：整次运行的墙钟、最慢一份验收文件的耗时（没出 vitest 报告的成员按一份、用成员的墙钟计）、份数；有跳过的另带跳过了谁、为什么。

- **没有任何成员有 `acceptance` 脚本**（或检出里没有 `pnpm-workspace.yaml`）：读数是「0 份」，这算有数据。
- **`make check` 的计划不含带验收的成员**：验收一步不跑，为当前提交写一份 `meta.members` 为空、`meta.scope` 写明「本次影响面不含带验收的成员」与被跳过成员的账本（目录名带 `-skipped`）。
  传感器认它，算有数据；两项耗时指标如实写没数据、写明跳过，不拿 0 秒冒充量过了。
- **有验收、却找不到这样一次运行**：没数据，原因指到 `make acceptance`；严格模式因此判失败。所以单独跑 `make loop-status STRICT=1` 之前要先在这个提交上跑过一次验收（或 `make check` 的验收一步留下过记录）。
- 两条带在 `loop.config.json` 的 `indicators.acceptanceSeconds`、`acceptanceSlowestSeconds`，不与基线比。数值
  （总耗时 提醒 60／处置 120／解除 45 秒，单份 提醒 20／处置 40／解除 15 秒）是负责人 2026-10-02 按提议定的，配置的 `note` 里照实写着，还没有用真实读数校准。
- 合并前的验收已按影响面收窄（只跑被选中、带验收的成员），读数因此不是每个提交都有；全量读数来自 `make acceptance` 或 `make check FULL=1`。

**不能声称**：耗时受机器负载影响，几次之间的差不能直接归因于代码；读数出自哪一次运行写在行尾与 `status.json` 里，
同一提交、工作树不干净时的「-dirty」格可能是更早一版未提交改动跑出来的。

**成员预算**：每个成员四项——超 alert 的函数数、风险值（度量报告的 `risk`）、重复行占比、没有断言的测试数——任一项处于处置即超预算。
`memberBudget.excludeGroups`（初值 `["examples"]`：`examples/` 是阶段性的演示，不长期维护）里的成员组不判预算、不生成草稿，也不写进趋势快照的成员一栏；
全仓指标（红色成员数、超 alert 的函数数、重复行占比、没有断言的测试数等）照样计入它们，与 `make metrics` 同一口径。
快照只记成员的总带位，各项「上一次的带位」由趋势里这个成员的历史值按同一组线重放得到。「解除之后又进入处置」达到 `relapseLimit` 次的成员标结构问题：
写明「反复变红 N 次，上报，不派清理」，不生成草稿。其余超预算成员各生成一份草稿：条目带 `路径:行`，行为锁、解除条件（当前值与解除线）、不许动的、状态（等负责人批准）。

**成员预算与基线比**（`memberBudget.baseline`，本仓库为 `true`；负责人 2026-10-02 定）：存量成员只在变差时进提醒，绝对线只管新成员与处置。
「绝对线的带位」就是上面那套三条线加滞回，一字不改；每个成员每一项这样判：

| 情形 | 带位 | 与基线比 |
|---|---|---|
| 没有基线快照 | 绝对线的带位 | 未判（没有基线快照） |
| 基线快照里没有这个成员 | 绝对线的带位 | 新成员 |
| 基线快照里这一项是 `null` | 绝对线的带位 | 未判（基线快照里这一项没有数据） |
| 在基线里，绝对线判出处置 | 处置 | 好了／一样／差了 |
| 在基线里，不是处置，比基线上的值大 | 提醒 | 差了 |
| 在基线里，不是处置，不比基线上的值大 | 正常（即使过了绝对的提醒线） | 好了／一样 |

基线快照与各项指标用的是同一条（见上「三条带」）。超预算的条件（任一项处于处置）、结构问题的数法、「上一次的带位」的重放都不受它影响；
趋势快照里成员的总带位按这套判法记。终端在超预算的成员各项后面写与基线比的结果，再列两小段：**比基线变差的成员**（成员、哪一项、基线值 → 现值、带位）
与**新成员过了提醒线的**，各按 `explainTop` 截断；没有基线快照时前一段写「未判：没有基线快照」。`baseline` 为 `false` 时带位只看绝对线，这两段和各项与基线比的结果都不出。

**要解释的函数与基线比**：「这次变更里要解释的红项」里的函数一类，先取这次变更碰过、带位不是 ok 的函数（与以前相同），
再与基线提交（`BASE` 的合并点；收工钩子是与 `primaryBranch` 的合并点，求不出是 `HEAD`）上同一个函数的圈复杂度比，只留下：

- 基线上没有它：新函数，或所在文件是新文件（未跟踪的、git 认作新增的）——写「新出现」；
- 基线上有、现在的圈复杂度比基线上大——写「原 N → 现 M」；
- 拿不准的：同一文件里同名函数不止一个、基线文本取不到或解析时抛错——照列，并写明原因。

基线上有、没变大的从名单里拿掉，终端写「另有 N 个碰过的函数原来就在线外、这次没有变差」，`status.json` 的 `explain.functionsNotWorse` 逐条列出。
基线上的圈复杂度用度量同一套解析与算法（`src/metrics/complexity.ts` 的 `functionMetrics`）对 `git show <基线>:<路径>` 的文本算，
只取这些函数所在的文件；函数按「同一路径、同一限定名」对上，git 认作改名的文件（`git diff -M`）拿改名前的路径去取。
顶层判定点为零的文件度量不出 `<module>` 这个单元，所以基线上没有 `<module>` 按 1 算，不算新出现。

**它量不出的**：基线快照缺失时成员预算退回绝对线，存量成员过了提醒线也照样提醒；函数改了名、类或外层函数改了名（限定名变了）就按新函数算；
只在工作树里挪了文件而没有 `git add`（git 看到的是一删一增），或改得太多 git 不认作改名的，按新文件算；
TypeScript 解析器对有语法错误的文本会尽力恢复而不抛错，基线文本有语法错误时量出的是恢复后的单元，查不出「解析不了」；
与基线比只看圈复杂度，开了覆盖率时按 CRAP 定的带位里，CRAP 变差而圈复杂度没变的函数会被当作没变差拿掉（回路状态本身不跑覆盖率，这种情形现在不出现）。

**对照表条数**：读 `docs/clean-loop.md`，表头有「归类」一栏的表，数据行这一格须是 `传感器`、`评审问法`、`归人`、`不适用`、`不采` 之一；
数各类条数、报出不合约定的行。再把对照表（首栏「条目」）的条目名逐字对回条目全表，按名字的**出现次数**比（全表里同名的条目可以有几行，对照表照着有同样几行就对得上）：
全表有而对照表缺（次数少于全表）、对照表有而全表没有、对照表比全表多出（次数多于全表），分别列出。文件不存在报没数据。

所有阈值、窗口与开关在 [`loop.config.json`](loop.config.json)，代码里不写死数值；缺项、类型不对、线的次序不对、多出认不出的项一律退出 2，不悄悄用默认。
试点之后负责人定过一轮（2026-10-02）：成员预算的「超 alert 的函数数」取各成员分布的上四分位／九十分位（8／14／6）、「风险值」20／23／18；
红色成员数改成只与基线比（存量仓库上绝对线没有意义）；topic 的 rev 翻动放到 6／10／4（产品设计密集修订期）。其余仍是起步值。没有数据的传感器（配置里关了、没给基线、目录不存在……）在输出里写明原因，不拿 0 冒充量过了。

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
断言藏在导入的辅助函数里会误报（用 `helperPattern` 消），回调是传进来的函数引用时不判；有断言不等于断言有力；
类型测试里一条编译得过的语句就算断言，它约束了什么看不出。一起改的成员对只说明历史上的共变，不说明该合并。
rev 翻动只数改了 `revision:` 行的提交，不看改了什么。自测：`tests/loop-*.spec.ts`（读 git 的部分与入口的退出码用临时仓库）。

## 收工钩子

`src/loop/stop-hook.ts` 由宿主（Claude Code、Codex）在 agent 收工时调用（`Stop` 与 `SubagentStop`），
把「这次变更里要解释的红项」作为**事实**反馈给 agent：只陈述位置与数值，不写该怎么改。
宿主配置由 `.meta_harness/agents/hooks/hooks.yaml` 生成，怎么生效、怎么关见那里的 README。

标准输入是宿主给的 JSON 对象。要反馈时向标准输出写**恰好一个** `{"decision":"block","reason":"…"}`（两端在这两个事件上都接受这个最小形状，
多一个字段在 Codex 上会让整条输出无效）；量读数时自己出了错，写**恰好一个** `{"systemMessage":"…"}`——两端都把它当作给用户看的警告，
不交给 agent、不拦收工；其余情形一个字节都不写。**所有路径都退出 0**：宿主把退出码 2 一律当拦截，
所以它不经 make、不透传任何子进程的退出码。依次：

1. `OMNE_LOOP_HOOK=off` → 什么都不做；输入解析不了、不是对象 → 不反馈。
2. `stop_hook_active` 为 `true`（这次收工已经因钩子续跑过）→ 不反馈。**每次收工至多拦一次。**
3. 工作目录取输入的 `cwd`，没有就用进程的当前目录；不在 git 仓库里 → 不反馈。`loop.config.json` 的 `hook.enabled` 为 `false` → 不反馈。
4. 这次变更（相对与 `primaryBranch` 的合并点，求不出就只看未提交的；已提交、未提交、未跟踪都算）没碰产品源码、全局 `constraints.json` 或原 realization 的 `bindings.yaml` → 不反馈。
5. 量**静态那部分**读数：变更函数里超 alert、且比基线涨了或新出现的（与 `make loop-status` 同一个判法，见上「要解释的函数与基线比」，基线是这里的合并点；
   反馈的那一行末尾补「原 N」「新出现」或拿不准的原因，原来就超线、这次没变差的不反馈）、新增的跨成员依赖、其中稳定依赖不稳定的、改动过的测试文件里没有断言的用例，加方向违规与环两条硬线（全仓的）。
   不跑重复代码（全仓二十多秒）、覆盖率、工作树与 topic 那几项。量在 worker 线程里跑，超过 `hook.timeoutSeconds`（初值 40；宿主那侧另配 60）就放弃。
   同时按 BASE 的架构预期判断新增偏离，分别报告全局及原节点预期的语义改动；机械范围见 [CONFORMANCE](src/arch/CONFORMANCE.md)。仅修改预期也可产生反馈，未发布新全局预期的节点继续由原声明传感器消费。
6. 没有红项 → 不反馈。同一分支上同一组读数已经反馈过 → 不反馈：每条取「类别＋位置（路径与函数名、或成员对）」，**不含行号**，排序后求哈希，
   连同分支名记进回路目录的 `hook-state.json`，最多记 `hook.stateLimit`（初值 200）组，超了丢最旧的。多了一项、换了分支都算新的一组。
7. 反馈的文字列前 `hook.maxItems`（初值 12）条，多的写「另有 N 条」，整段不超过 `hook.maxChars`（初值 4000）个字符；硬线排最前，截断时截掉的是报告项。

第 3 步找到仓库之后任何一步抛错或超时 → 不反馈给 agent，往回路目录的 `hook.log` 追加一行原因（写日志失败也吞掉），
并用 `systemMessage` 给用户一句警告：没量出读数、原因的前 300 个字符、日志在哪。**钩子自己出错从不拦住 agent，但不闷声**——
不出这一句，「钩子坏了」与「没有红项」在会话里看起来一模一样。

**跑的是哪一份脚本**由宿主配置里的命令定（`hooks.yaml`）：会话所在的工作树里有这份脚本且装了依赖（认 `tools/ts-checks/node_modules/typescript`），
跑它自己的；否则跑主检出里的那一份，量的仍是会话所在的那棵工作树。刚 `git worktree add` 出来、还没装依赖的工作树走的就是后一条——
2026-10-02 第一次在真实会话里触发时正是栽在这里：脚本在新工作树里加载不了解析器，只记了日志。主检出自己也没装依赖时，结果是上面那句警告。

每次调用都重新计算 `git merge-base <primaryBranch> HEAD`，不沿用上一次的基线。
架构读取先把基线解析成固定 commit，再按该树的 blob ID 批量读取文件；不缓存跨提交的读数，也不逐文件启动 Git。
成员源码与数据文件按最长成员路径前缀分配，文件清单只遍历一次。读取失败仍报错，不以当前工作树补齐旧提交的缺失文件。
同步主线可能让已交付的改动退出本次差分。需要核对整个任务时，用固定的任务起点运行
`make loop-status BASE=<任务起点commit>`；这个显式 BASE 不改变自动钩子的基线。
没有输出时还需区分没有新红项、已反馈、递归 Stop 和测量错误，不能仅凭同步发生在先就认定基线损坏。

实测（本仓库全量，2026-10-01，8 核机器上负载很低时）：碰了产品源码、有一处红项的一次 2.5 秒；没碰产品源码的 0.8 秒。
另有一轮完整检查在跑时，前者量到过 3.2 秒。大头是解析全部产品源码（方向与稳定依赖都要全图），约 1.7 秒。
函数与基线比之后（2026-10-02，机器上另有一轮完整检查、1 分钟负载 2 到 7）：存量超线函数改一行不加分支、不反馈的三次 2.6 到 3.2 秒，
加一个分支、反馈一条的 2.5 秒；多出的一次 `git diff -M --name-status` 与每个文件一次 `git show` 合计十几毫秒，再加只解析那几个文件的基线文本。

**不能声称**：反馈过的读数被处理了——它只提醒一次，交代与否由交付说明与接受的人核对；没被反馈等于没有红项——
没碰产品源码、全局约束或原节点声明，或者钩子关了、出错或超时、`stop_hook_active` 为真时都不反馈，重复代码与覆盖率不在其中，
**改动落在会话当前目录之外的另一棵工作树里时也不反馈**（它只量输入的 `cwd` 所在的那一棵检出；一个会话只用一棵工作树、先 `cd` 进去再干活，见 `worktree-discipline` skill）；宿主真的调用了它——
生成配置不等于宿主已加载、已信任，要在真实会话里另行核实（Claude Code 一端 2026-10-02 见过一次真实调用；Codex 一端还没有）；
警告一定到了用户眼前——`systemMessage` 怎样显示由宿主定，两端都只按文档核对过，没有在真实会话里看过它显示出来的样子。
自测：`tests/loop-hook.spec.ts`（判断，外部动作用替身）、`tests/loop-stop-hook.spec.ts`（入口与线程，用临时仓库与子进程）；
命令选哪一份脚本由 `.meta_harness/tooling/tests/test_compile_hooks.py` 拿真的工作树跑。

## 卡片台账与体检页

同在 `src/loop/`，回答的是流程而不是代码：**从提出一张卡到它被接受隔了多久，每周接受几张，还剩多少，债在往哪走。**
两个入口都只读、只报告，不判失败。

```sh
make loop-card CARD=ST-016-01 EVENT=proposed                         # 现在记一个时间点
make loop-card CARD=ST-016-01 EVENT=accepted AT=2026-09-30T18:00+08:00  # 补记
make loop-health                                                     # 体检页；OUT= 改产物目录
```

**卡片台账**落在 `<回路目录>/cards.jsonl`（回路目录的定义同上），一行一条：
`{ "schema": 1, "card", "event", "at", "commit", "branch", "recordedAt" }`。三个事件：

| 事件 | 含义 |
|---|---|
| `proposed` | 卡被提出 |
| `runnable` | 主路径第一次能照卡上的演示脚本跑 |
| `accepted` | 负责人接受 |

`at` 是事件发生的时间：不给 `AT` 取现在，给了用它（补记）；`recordedAt` 永远是登记的那一刻；`commit` 与 `branch` 取登记时的检出。
`AT` 写 `YYYY-MM-DD`（本机零点）或 `YYYY-MM-DDTHH:MM[:SS][Z|±HH:MM]`（不带时区按本机时区），存成 UTC。

- **拒绝登记，退出 1**：同一张卡同一个事件已有一条（报出已有那条的时间）；`runnable`、`accepted` 早于这张卡的 `proposed`，或这张卡还没有 `proposed`。
- **退出 2**：卡号不合 `ST-<三位 topic 编号>-<两位序号>`、事件不是三者之一、`AT` 不是合法的时间（含 2 月 30 日这类不存在的日子）、缺参数，以及读不了的文件或 git。
- 卡号不在这个检出的任何 `PF-*/stories.md` 里：**只提醒，照记**——卡可能还没合入这条分支。`accepted` 不做这条核对
  （接受了的卡会从 `stories.md` 删掉），改为提醒一句：**接受以删卡提交上的 `Accepted-Card` trailer 为准，台账只供度量**（见[删卡记录](#删卡记录)）。
- **要更正只能手工改文件**：入口只追加，不提供删改。读的时候坏行跳过并报出行号。

**体检页** `make loop-health` 把四样东西汇成一张页面：卡片台账、趋势快照 `trend.jsonl`、测试耗时账本、git 历史。
产物在 `<回路目录>/health/`（每次覆盖，`OUT=` 可改）：`health.html`（自包含：样式取审讯页的同一套，走向图是内联 SVG，不带脚本、不引任何外部地址，离线可开）、
`health.json`（各块的原始数据，每块都是「有数据」或「没数据及原因」）、`summary.md`（不超过 15 行，同时打印到终端，末行是页面路径）。

| 块 | 内容 | 数据来源 |
|---|---|---|
| 卡 | 每张卡一行：卡号、标题、三个时间、提出→能跑与提出→接受各隔多久（不到一天写小时，否则写天，一位小数）；没走完的写「进行中」与已过去多久。上方是接受过的卡的前置时间中位数与最大值 | 台账；标题取自各 `PF-*/stories.md` |
| 每周接受数 | 最近 `health.weeks` 周每周接受了几张；周一零点为一周之始，按本机时区 | 台账 |
| 各 topic 剩余卡数 | 每个有 `stories.md` 的 topic：卡总数、已接受、剩余、剩余里「就绪」写「否」的；台账里接受过却不在任何 `stories.md` 里的卡单列 | `stories.md` 与台账 |
| 提交与合并的大小 | `primaryBranch` 沿第一父链最近 `health.commits` 个提交各改了几个文件（合并提交按它对第一父的改动计）：中位数、最大值、最大的三个 | `git log --first-parent -m` |
| 测试耗时 | 最近 `health.runs` 次**全量**运行的墙钟、提交、层、是否全过；各层的墙钟不可比，一层一条走向线 | `<主检出>/tmp/test-ledger/*/*/ledger.json`（`OMNE_TEST_LEDGER_HOME` 可改根）；全量运行是 `meta.base` 为 null 的那些（`run --all`，或计划判为全量的 `make check` 测试一步），可以只跑一层（`make check` 的测试一步快、慢两层各记一份），层取 `meta.tier`，没有这一栏的旧账本按两层；受影响范围的运行带基线，不计入 |
| 债的走向 | 每个指标一条小折线（虚线是提醒线与处置线，蓝点是最新值）、最新值与最新带位；当前或曾经处于处置的成员，各项预算的读数走向 | `trend.jsonl`；同一提交多条取最后一条，按提交时间排 |
| 对照表条数 | 五类各多少条、不合约定的行数、「现状」以「待建」开头的行数 | `docs/clean-loop.md`，与回路状态同一份解析 |
| 传感器最近一次有数据 | 每个指标最近一条带着它的值的快照是哪个提交、什么时候；从没有过数据的标出 | `trend.jsonl` |

**任何一块没有数据，都在那一块里写明「没有数据」与原因**（台账还没有记录、没有哪个 topic 有 `stories.md`、账本里只有受影响范围的运行……），不留空白、不画空图。
窗口与条数在 [`loop.config.json`](loop.config.json) 的 `health` 一段（`weeks` 初值 8、`commits` 50、`runs` 10）；产品区的位置沿用 `sensors.topicChurn.productRoot`。

**不能声称**：前置时间只和登记一样准——忘了登记、补记时写错的时间都原样进图；「已接受」只看台账，不核对卡是否真的交付。
卡接受后就从 `stories.md` 删掉，所以「台账里接受过却不在任何 `stories.md` 里」那一列眼下列的就是正常退场的卡，不是异常；「剩余」仍是还在队列里的卡数。
中位数在偶数个时取中间两个里较小的那个（与结构度量的提交形状同一取法）。提交大小只数文件个数，不看改了多少行。
测试耗时受机器负载影响，几次之间的差不能直接归因于代码。债的走向把不同分支上的快照按提交时间排在一条线上，分支来回切换时折线会跳。
自测：`tests/loop-cards.spec.ts`、`tests/loop-health.spec.ts`（入口用临时仓库）。

## 测试运行

`src/testing/` 是本包的第三入口：算一次改动的影响面（`make check` 的执行计划）、决定跑哪些成员的测试、以多大的并行度跑、把时间花在哪记成账本、
失败之后单独重跑归类。它替代了根脚本里原先的 `pnpm -r run test`。同一个运行器也跑成员的可执行验收（`--script acceptance`）。

```sh
make check-plan [BASE=<基线>]              # 只算影响面并打印计划：判成什么、每一步跑还是跳、选中谁与为什么；FULL=1 全量
make test-affected BASE=<基线提交或分支>   # 只构建并测试受这次改动影响的成员的快层；BASE 缺省 main，TIER=slow|all 换层
make test-affected BASE=<基线> PLAN=1     # 只列受影响范围与层，不构建也不运行
make test-tier TIER=slow                   # 先构建，再跑全部成员的某一层
make test-triage RUN=<运行目录>            # 把那次运行里的失败逐条单独重跑并归类（测试或验收的运行都行）
pnpm run test                              # 全量两层：先构建，再跑全部成员
pnpm run test:gate                         # make check 的测试一步：按影响面计划跑被选中成员的快层再慢层（基线 BASELINE，缺省 main；FULL=1 全部）
make acceptance                            # 构建有 acceptance 脚本的成员及其依赖，再跑它们的验收；NO_BUILD=1 不构建
```

**分层。**测试分快慢两层，定义只在仓库根 [`vitest.tiers.mts`](../../vitest.tiers.mts) 写一处：一个 `slow` 标签（带慢层时限 120 秒），
以及把环境变量 `OMNE_TEST_TIER`（`fast`／`slow`，不设为两层）翻成 vitest 的 `tagsFilter`、`passWithNoTests` 与 `experimental.preParse`。
每个成员的 vitest 配置在 `test` 里先展开 `testTiers()`。一个测试归慢层：整个文件在开头注释里写 `@module-tag slow`，单条用例写 `{ tags: ['slow'] }`，
并写一句为什么慢。时限的先后：用例自己写的（选项里的 `timeout` 或 `test(名字, 函数, 毫秒)`）＞ 慢层标签的 ＞ 成员配置的 `testTimeout` ＞ vitest 默认 5 秒。
运行器的 `--tier fast|slow|all` 把层经 `OMNE_TEST_TIER` 交给每个成员（`all` 时置空，不让外面环境里的残留漏进来），慢层另加 `--typecheck.enabled=false`
（`*.spec-d.ts` 都归快层）；`--base` 缺省 `fast`，`--all` 缺省 `all`，验收不分层、不接受 `--tier`。层记在账本的 `meta.tier`，
慢层与快层运行的目录名带 `-slow`／`-fast` 后缀。被滤掉的用例在报告里是跳过，账本把它们计进「没跑」，不计进「用例」。
整个文件都被滤掉时 vitest 不导入它；用例名或标签不是字面量时静态解析看不出，照常导入、导入后再过滤。
自测：`tests/test-tiers.spec.ts` 真起 vitest 核对三种层各跑了什么、整文件归慢的在快层下不被导入、没有慢测试的项目在慢层下退出 0、标签写错会报错。

**验收**（`run --all --script acceptance`）：选的是 `package.json` 里有 `acceptance` 脚本的成员（同样去掉 `affected.excludeRoots`），
逐个跑 `pnpm run acceptance`，并行度、vitest 报告、账本格式都与测试相同；账本根另放在主检出的 `tmp/acceptance-ledger/`
（`OMNE_ACCEPTANCE_LEDGER_HOME` 可改），不混进体检页读的测试账本。每份 `ledger.json` 的 `meta.script` 写着跑的是哪一种，
`triage` 照它经同一个脚本重跑（`pnpm run <脚本> <文件> -t …`，验收的那份带着自己的 vitest 配置）。`--all` 缺省不构建（由调用方先构建），
给 `--build` 才构建；`--base` 缺省构建，`--no-build` 跳过。`make check` 不调 `make acceptance`，而是按计划跑 `step acceptance`：
只跑被选中、带验收的成员（驱动前面构建好的 `dist/`，不再构建），任何一份不过整套检查就失败；一个都没有时记一份「跳过」的账本（见[验收耗时](#验收耗时)）。

**影响面怎么算**（`src/testing/affected.ts`，规则在 `test-runs.config.json` 的 `affected`）。改动文件取基线合并点到当前工作树的全部差异，
含未提交与未跟踪的文件，改名拆成删与增两侧，文件名原样（不受 git 的引号转义影响）。成员清单读 `pnpm-workspace.yaml`，去掉 `affected.excludeRoots` 下的（现为 `examples`）。
每个改动文件按顺序归到第一类命中的：

1. **全局**（`globalPaths`：根清单、锁文件、共享 tsconfig、分层定义 `vitest.tiers.mts`、`scripts/check.sh`、本配置文件、
   测试运行器与影响面引擎自身的 `cli.ts`／`config.ts`／`run.ts`／`steps.ts`／`support.ts`／`timing-reporter.ts`／`affected.ts`／`members.ts` 与取改动的 `src/metrics/git.ts`）：整份计划判全量——
   引擎改了，这次的计划就是用改过的引擎算的，不能拿它来给自己划范围；
2. **读者**（`readers`：`{ paths, members, why }`）：这些路径被这些成员的测试读——改了只把这些成员带进来，**不沿反向依赖传播**；
   每条带着谁读、证据在哪（登记 → stream-assembly 与 core-verification；核心成员的 `schema/` → stream-assembly；核心成员的 `src/` → core-verification；
   governance-center-entry 的 TLS 夹具 → governance-client-operations；`packages`、`apps`、`examples` 下的 TS 与成员 `package.json` → 本包；
   `docs/clean-loop.md`、整洁之道对照表、`stories.py`、`scripts/with-test-slot.sh` → 本包；两个成员各自的 README → 它自己）；
3. **成员文件**：按最长的成员目录前缀归属，这个成员与直接、间接依赖它的成员进来；依赖取各 `package.json` 里写成 `workspace:` 的
   `dependencies`、`devDependencies` 与 `peerDependencies`——按声明算而不是按源码导入算，因为测试可能导入生产代码不导入的包。
   成员根目录与 `apps/*/deploy/` 下的 `.md`（`memberDocuments`）不算成员改动，除非读者规则点了名；`tests/` 等其余目录里的 `.md` 可能是夹具
   （本包 `loop-canary.spec.ts` 就改写夹具里的 README 再断言），照成员改动算；
4. **Python 工具**（`pythonPaths`）：跑 pytest；根 `Makefile` 也在这一类——`make check` 只经它跑常驻的几步与 `make test`，成员测试不经 make；
5. **只需常驻检查**（`residentPaths`）：文档、设计区、research、`examples/`、`.github/`、格式配置、`tools/model-probe/` 等；
6. 其余（没有规则认得的，如 `.gitignore`）：整份计划判全量，理由点名前几个文件与总数。

读者、成员文件与 Python 工具三种归属可以同时成立（另一个成员的 `schema/` 既是那个成员的文件又被 stream-assembly 读），三者都算。
被选中的成员定下之后：测试、类型检查、验收各取其中有对应脚本的；构建取它们连同正向依赖里有 `build` 脚本的，
另加 `residentBuild` 列的成员（现为 identity-values：`lint:rules` 导入它的 `dist`），纯文档改动也构建它。
`FULL=1` 或 `--full` 直接给全量计划。算不出计划——基线不存在、取不到改动、规则点名的成员不存在——就报错退出，不改判全量。
pnpm 自带的 `--filter "...[<基线>]"` 只做反向依赖那一部分，而且它在 git 工作树里选不中任何包，所以这里自己算。

`cli.ts replay [--ref main] [--count 40]` 对一条分支最近的 first-parent 提交逐个以父提交为基线算计划（成员清单取那个提交上的、规则取现在的，只算不跑），
改规则前后用它看「判全量的有几个、该不该全量」。

**不能声称**：没被选中的成员通过；测试读了某个路径却没写进读者规则，改它时就漏选——规则是查出来的现状，不是机器推导的，
新增一处这样的读取要同时补一条规则；环境变量、外部服务与时间不在影响面里。合并后没有自动补跑，全量由负责人不定时让一个会话手动跑 `make check FULL=1`。
自测：`tests/affected.spec.ts` 用真实规则与一份造出来的成员清单核对各类改动的判法，另在临时仓库核对改名与非 ASCII 文件名。

**怎么跑。**`make test-affected` 先 `pnpm --filter '<成员>...' run build` 把目标成员连同它们的依赖构建一遍（测试执行的是依赖的 `dist/`；
`make check` 则由前面的构建一步按计划构建），
再同时跑 `parallel.memberConcurrency` 个成员，每个成员的 vitest 至多起 `parallel.vitestMaxWorkers` 个工作进程。
一个成员失败不拦其余的，结束时列全失败；退出码只反映测试是否全过。两个并行度可用环境变量
`OMNE_TEST_MEMBER_CONCURRENCY` 与 `VITEST_MAX_WORKERS` 临时覆盖——后者是 vitest 自己认的变量，
会盖过成员配置里的 `maxWorkers`。初值 2 × 4 是在 8 核主机上量出来的：pnpm 默认的 4 个成员并行、
每个成员最多 7 个工作进程时，全量要 18 到 22 分钟且有十几条用例被挤过时限；2 × 4 约 13 分钟。

**耗时账本。**每次运行在**主检出**的 `tmp/test-ledger/<提交短号>[-dirty]/<时间>/`（`OMNE_TEST_LEDGER_HOME` 可改根目录，
`--out` 可直接指定）留下：

| 文件 | 内容 |
|---|---|
| `summary.md` | 同时打印到标准输出：总数与墙钟、逐条失败、最慢的成员、超过 `ledger.slowFileSeconds` 的文件、导入耗时最多的成员、贴着自身时限的用例，以及「归层」一行（见下） |
| `ledger.json` | 运行坐标（提交、是否干净、基线、并行度、核数、计划的模式与理由；按计划跑验收时另有 `scope`：跳过了谁、为什么）与成员、文件两级的用例耗时与导入耗时、贴着时限的用例（`nearTimeout`，带各自的时限）、失败清单 |
| `<成员>.log`、`<成员>.json`、`<成员>.timing.json` | 各成员的原始输出、vitest 的 JSON 报告、计时报告 |
| `build.log` | 受影响范围运行时的构建输出 |

**计时报告**是运行器随 JSON 报告一起挂给 vitest 的报告器（`src/testing/timing-reporter.ts`），补上 JSON 报告没有的两样：
每个文件的导入耗时（vitest 的 `collectDuration`：导入测试模块及其依赖、执行 describe 回调），每条用例解析后的时限与标签。
**贴着时限**指耗时 ≥ 用例自身时限 × `ledger.nearTimeoutRatio`（初值 0.5：空闲时就占掉一半时限的用例，机器一忙就会越线），
按占时限的比例排；时限 0（vitest 里是不设时限）的不列；成员没写出计时报告时按 vitest 默认的 5 秒算，并在摘要里注明有几条是这样假定的。
成员的 `fileSeconds` 是各文件用例耗时之和（从第一条用例开始到最后一条结束），`collectSeconds` 是各文件导入耗时之和；
墙钟减去两者是进程启动、类型检查与并行重叠。同一文件里同名的用例取第一条的时限。

**归层**一行只列事实，按计时报告里的标签分层：快层用例合计超过 `ledger.slowFileSeconds` 的文件、快层里超过单条预算的用例
（耗时 ≥ 自身时限与 vitest 默认时限中较小的那个 × `nearTimeoutRatio`：自带更宽时限的用例也按默认时限判，快层的预算不随它放宽；
这两项是快层的预算没守住），以及全归慢层、却每条都不到 vitest 默认时限 × `nearTimeoutRatio` 的一半、整份不到 `slowFileSeconds` 的一半的文件
（归慢了却其实守得住；回快层的线取一半，是因为空闲与忙时的读数差一倍上下，同一条线会让贴着它的文件来回被点名）。各列前 `ledger.top` 个。只量这一次跑到的那一层：快层运行里看不到慢层，反之亦然；
受机器负载影响，一次的读数只是线索。

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

## 差分变异

`make mutation [BASE=<基线>]` 回答「这次改动碰到的代码，测试守不守得住」：把改动行上的代码逐处改坏（变异体），
看有没有测试因此失败。`src/mutation/` 是 [Stryker](https://stryker-mutator.io/) 10 与它的 vitest runner 上面薄薄的一层，
变异算子、插桩、调度与判定都是 Stryker 的，这里只做三件事：

- **范围**：基线合并点到工作树（含未提交、未跟踪）的改动，取新一侧的行号（与[结构度量](#结构度量)同一份 diff 解析），
  只留 `packages/`、`apps/` 成员 `src/` 下的源码（不含 `*.d.ts`），按成员写成 Stryker 的 `mutate` 条目 `文件:起-止`；
  未跟踪的文件整份变异。`MEMBERS=<成员目录,…>` 改为变异点名成员 `src/` 下的全部源码。`PLAN=1` 只列范围。
- **运行**：先构建这些成员及其依赖，再逐成员调用 Stryker：成员目录为工作目录、只跑**快层**（`OMNE_TEST_TIER=fast`）、
  并行度取 `test-runs.config.json` 的 `parallel.vitestMaxWorkers`（环境变量 `VITEST_MAX_WORKERS` 可改）。
  sandbox 放在与成员**同深度**的 `.stryker-tmp-*` 目录（被 `.gitignore` 忽略）：不少测试用 `import.meta.dirname`
  拼相对路径读成员外的规格与根配置，换了深度就读不到。sandbox 里先把成员的 `node_modules` 软链进来再构建成员
  （`src/mutation/sandbox-build.ts`），跑完连容器目录一起删掉。不就地改源码。
  初跑跑本成员的全部快层，不按「直接导入了被变异文件」挑测试：不少测试按自己的包名导入，走的是 sandbox 里由插过桩的
  源码重新构建的 `dist`，vitest 认不出它们与 `src` 的关系；之后每个变异体按逐条覆盖只跑碰到它的测试。
  Stryker 给每个语句插桩记覆盖，CPU 重的用例会慢上几倍，平时守得住 5 秒的在初跑里就会超时；所以 sandbox 里另写一份
  vitest 配置，展开成员自己的那份，只把没写自己时限的用例的时限放宽到 `mutation.testTimeoutSeconds`（初值 60 秒）。
  成员的配置不动；变异体本身的超时由 Stryker 另判。初跑仍超时，说明有用例插桩后超过这个时限：比如 content-blocks
  解码 4 MiB 的那条，点名整个成员时插桩了它碰到的全部文件，60 秒跑不完；只变异改动行时，只要改动不在它经过的文件里就不受影响。
  调大时限的代价是碰到它的每个变异体都要跑那么久，这类成员只用差分范围。
- **读数**：读每个成员的 `mutation.json`，只计落在要变异的行上的变异体（跨到范围外的另记一个数），
  汇总被杀、超时、存活、无覆盖、编译错误、运行错误与分数（测出来的占测出来与没测出来之和），
  逐条列出存活与无覆盖的「文件:行 算子 原文 → 替换」。原件、`summary.md`、`summary.json` 与各成员日志写进
  主检出的 `tmp/mutation-ledger/<提交短号>[-dirty]/<时间>/`（环境变量 `OMNE_MUTATION_LEDGER_HOME` 可改）。

**只报告**（负责人 2026-10-02 定）：变异体存活不影响退出码，不进 `make check`；Stryker 起不来、初跑失败、
没写出报告才退出 1，参数错退出 2。读数的边界：

- 存活少不等于测试好：只量了改动行，没改的代码不在内；变异算子之外的错误写法量不到。
- 判定会抖（Stryker 的 perTest 判定已知会抖，上游 #6073）：一个存活要复跑确认，再决定补不补测试。
- `static` 标记的变异体在模块加载时就求值，Stryker 只能为它跑全部测试，成本高。
- 慢层的测试不参与：只被慢层测试守着的代码会显示为无覆盖或存活。
- 只跑本成员自己的测试：靠别的成员的测试守着的代码（比如 storage 的契约由 storage-sql 与 core-verification
  的一致性套件守着）会显示为无覆盖，那是变异的盲区，不是这份代码没人测。

自测：`tests/mutation.spec.ts`，其中一条在夹具项目上真起 Stryker（归慢层）：没断言的测试留下存活变异体，
在只按包名导入自己的测试文件里补上断言后被杀；只变异改动行；跑完不留 sandbox。

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

`model-credential-boundary` 登记在 `src/repository.ts` 的 `REPOSITORY_RULES`，正常 CLI 同时扫描实际 `packages/`、`apps/`、`examples/`、`tools/`、`scripts/` 执行模块及配置别名解析结果。collector 先规范化仓库根路径，末尾斜杠不会改变根 `tsconfig` 的别名解析。它采用 D-075、目录 v3 V3-10、CCL rev2 MCR-V7 与 D-092 的装配权限。

| 符号 | 允许点 |
| --- | --- |
| `createCredentialBindingReader` | 目录 owner；精确 bootstrap 文件中 `createAcceptanceApplication` 的 `start` 构造，向 CCL 工厂传递 |
| 返回的 binding reader | 目录 `cordis.ts` 的 `localCredentialLookupPlugin` 和 CCL `model-replica.ts` 执行；bootstrap 不执行、不返回 |
| `createModelReplicaCustodian` | 同一 app 的 `start` 唯一构造点；目录不能重建 |
| `storeBoundReplica` | app `publishCredential` 的真实来源写入路径；真实资格／来源真实性仍须运行验收 |
| `readBoundReplicaIn` | app `start` 经 `ReplicaReader` 只借出读方法；lookup 消费定义服务，CCL 保留自身方法 |
| 组件 `close` | app `closeResources` 和 CCL 所有者执行；借用者不得取得 |

公开构建模块 `dist/index.js` 导出 `Rule/SourceFile/Violation`、`collectSources/runRules/RULES`、逐项规则与规则工厂；`dist/repository.js` 导出 `collectRepositorySources/REPOSITORY_RULES`。`SourceFile` 包含路径、文本及可选 `resolvedModules`，规则不加载或执行产品模块。包规则通常取 packages 根相对路径，仓库规则取仓库相对路径；模型守卫另兼容相应包根／app 根路径。包是私有 workspace 开发工具，不是 Cordis 插件或沙箱。

先构建后，在本 README 同目录保存并执行以下 TypeScript 夹具：

```ts
import assert from 'node:assert/strict'
import { modelCredentialBoundary, type SourceFile } from './dist/index.js'

const source: SourceFile = {
  path: 'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  text: `
    import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads';
    import { createModelReplicaCustodian } from '@omne-harness-lite/credential-custodian-local/model-replica';
    import { localCredentialLookupPlugin } from '@omne-harness-lite/model-profile-directory-local/cordis';
    import { ReplicaReader } from './assembly-inputs.ts';
    export function createAcceptanceApplication() {
      let replica;
      async function start() {
        const reader = createCredentialBindingReader(storage);
        replica = await createModelReplicaCustodian({ readCredentialBindingIn: reader });
        new ReplicaReader(ctx, { readIn: replica.readBoundReplicaIn });
        ctx.plugin(localCredentialLookupPlugin, { mode: 'localCredentialOnly' });
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
  text: "import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads';",
}], REPOSITORY_RULES)
assert(violations.some(v => v.rule === 'model-credential-boundary'))
```

守卫跟踪同文件词法绑定、赋值别名、具名／namespace 导入、普通解构、字面计算成员及有界聚合别名。本地表达式体箭头的调用结果保留已识别能力来源；表达式体与块体中的受限返回均保守拒绝。已识别的受限值不能通过未知参数、构造器、返回／导出、回调结果、对象写入或文本呈现逃逸；非字面成员报错。普通箭头结果保持可用，无关的 `.close` 不按名字误报。产品测试路径豁免，规则负控使用真实产品路径。专门 CLI 回归使用构建后的 `dist/` 制品，运行测试前须先构建本工具。

限制：不解释任意 JavaScript，不推导无类型的跨文件值，不证明真实来源对、共同事务、运行期唯一实例、反射隔离或资源实际关闭。模块别名解析定位 provider，不增加权限。缺席 app 的扫描通过不是 app 合规证据；最终冻结 app 仍须集成扫描和独立联合验收，工具自测不能单独关闭 MCR-V7 或 P3。

精确路径 `packages/agent-loop/loop-extension-runner-local/tests/runner-chain-support.ts` 可通过 EIS 公开发布入口建立 D106 R7 验收的真实不可变历史。相邻 runner 测试和全部 runner 产品源码仍禁止发布。历史边界规则只允许 runner 产品源码导入 reader 类型，测试可构造真实 reader；不允许工厂转发，也不授予产品侧发布权。

## 包模板与采用扫描

私有 omne-package-template CLI 创建草稿并盘点精确模板采用。见[模板说明](templates/package/README_ZH.md)与[开发入口](../../docs/development.md#创建和整改产品包)。扫描复用架构读取器，结构结果不接受业务或生命周期行为。
